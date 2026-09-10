import io
import json
import os
import pandas as pd
import psycopg
import pycountry
import requests
import time

from babel.numbers import get_territory_currencies
from dotenv import load_dotenv
from functools import lru_cache
from pathlib import Path

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]


"""Utils"""

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

# Load a mapping of GICS subindustries to GICS industries
# Reference: https://www.msci.com/indexes/index-resources/gics
with open(Path(__file__).parent / "gics.json") as f:
    sectors = json.load(f)

# Load ETFs sequentially in order grouped by fund issuer
def _load_etfs(issuer_key: str, fields: list[str], fetch) -> tuple[list[tuple], callable]:
    with open(Path(__file__).parent / "etfs.json") as f:
        config = json.load(f)

    tickers = [tuple(entry[field] for field in fields) for entry in config[issuer_key]]
    return tickers, fetch

# Split a raw CSV into one chunk per 'Fund Holdings as of' section
# This is for feeder iShares funds that publish a second section with underlying holdings
def _split_blocks(text: str) -> list[str]:
    lines = text.splitlines()
    start_idxs = [
        i for i, line in enumerate(lines)
        if line.lstrip("\ufeff").strip().startswith("Fund Holdings as of")
    ]
    start_idxs.append(len(lines))
    return ["\n".join(lines[start:end]) for start, end in zip(start_idxs, start_idxs[1:])]

# Map an ISO 3166-1 alpha-2 code (e.g. 'US', 'JP') to (Country name, Currency)
# Returns (None, None) for missing/unrecognised codes
@lru_cache(maxsize=None)
def _map_country_currency(country_code: str | None) -> tuple[str | None, str | None]:
    if not isinstance(country_code, str) or not country_code.strip():
        return None, None

    try:
        country = pycountry.countries.get(alpha_2=country_code)

    except LookupError:
        country = None

    name = (getattr(country, "common_name", None) or getattr(country, "name", None)) if country else None

    try:
        currency = get_territory_currencies(country_code, tender=True, non_tender=False)[0]

    except (LookupError, IndexError):
        currency = None

    return name, currency


"""Data Fetching"""

# Fetch holdings for a single BetaShares ASX listed ETF
def fetch_holdings_betashares_aus(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()

    return (
        pd.read_csv(io.StringIO(response.text), skiprows=6)
        .dropna(subset=["Ticker", "Name"])
        .assign(
            etf_ticker=ticker,
            Ticker=lambda df: df["Ticker"].str.split().str[0],
            Sector=lambda df: df["Sector"].replace({"Healthcare": "Health Care"}),
        )
    )

# Fetch holdings for a single Global X ASX listed ETF
def fetch_holdings_global_x_aus(ticker: str) -> pd.DataFrame:
    pass

# Fetch holdings for a single BlackRock ASX listed ETF
def fetch_holdings_ishares_aus(ticker: str, product_id: str, slug: str, timestamp: str) -> pd.DataFrame:
    url = (
        f"https://www.blackrock.com/au/products/{product_id}/{slug}/"
        f"{timestamp}.ajax?fileType=csv&fileName={ticker}_holdings&dataType=fund"
    )

    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()

    return (
        pd.read_csv(io.StringIO(_split_blocks(response.text)[-1]), skiprows=2)
        .dropna(subset=["Ticker", "Name"])
        .drop(columns=["Currency"])
        .rename(columns={"Market Currency": "Currency"})
        .assign(
            etf_ticker=ticker,
            Sector=lambda df: df["Sector"].replace({"Communication": "Communication Services"}),
            Country=lambda df: df["Location"],
        )
    )

# Fetch holdings for a single Vanguard ASX listed ETF
def fetch_holdings_vanguard_aus(ticker: str, product_id: str) -> pd.DataFrame:
    url = f"https://www.vanguard.com.au/personal/api/data/products/holdings/{product_id}"
    items = []
    offset = 0

    # Vanguard limits 1500 per fetch, thus funds with >1500 holdings will require multiple fetches
    while True:
        response = requests.get(url, params={"limit": 1500, "offset": offset}, headers=HEADERS, timeout=15)
        response.raise_for_status()
        batch = response.json().get("data", {}).get("items", [])
        
        if not batch:
            break

        items.extend(batch)

        # Stop if it's at the last batch
        if len(batch) < 1500:
            break

        offset += 1500

    df = (
        pd.DataFrame(items)
        .dropna(subset=["ticker", "name" ])
        .assign(
            etf_ticker=ticker,
            ticker=lambda df: df["ticker"].fillna(df["name"]),
            name=lambda df: df["name"].str.upper(),
            sectorName=lambda df: df["sectorName"].map(sectors),
            Country=lambda df: df["countryCode"].map(lambda c: _map_country_currency(c)[0]),
            Currency=lambda df: df["countryCode"].map(lambda c: _map_country_currency(c)[1]),
        )
        .rename(columns={
            "ticker": "Ticker",
            "name": "Name",
            "sectorName": "Sector",
            "marketValPercent": "Weight (%)",
        })
    )

    return (
        df.groupby(["etf_ticker", "Ticker", "Name"], as_index=False)
        .agg({
            **{c: "first" for c in df.columns if c not in ("etf_ticker", "Ticker", "Name", "Weight (%)")},
            "Weight (%)": "sum",
        })
    )


"""Database Functions"""

# Standardise column headers for database, drop invalid rows and use at most 6 decimal places
def normalize(df: pd.DataFrame) -> pd.DataFrame:
    cols = ["etf_ticker", "holding_ticker", "holding_name", "sector", "country", "currency", "weight"]

    return (
        df.rename(columns={
            "Ticker": "holding_ticker",
            "Name": "holding_name",
            "Sector": "sector",
            "Country": "country",
            "Currency": "currency",
            "Weight (%)": "weight",
        })
        [cols]
        .assign(weight=lambda d: d["weight"].round(6))
        .loc[lambda d: d["sector"].notna() & d["country"].notna() & (d["weight"] > 0)]
        .where(pd.notnull, None)
    )

# Update database records or create new records if they don't exist
# If there is a fund rebalance, old holdings will be dropped in place
def upsert(df: pd.DataFrame):
    connection = psycopg.connect(DB_URL)
    threshold = 0.9

    with connection.cursor() as cur:
        # Existing holding counts per fund, fetched once up front
        cur.execute("select etf_ticker, count(*) from etf_holdings group by etf_ticker")
        sizes = dict(cur.fetchall())

        for etf_ticker, group in df.groupby("etf_ticker"):
            count = sizes.get(etf_ticker, 0)
            floor = threshold * count

            # Skip if fetch is partial to prevent major database overwrite
            if len(group) < floor:
                print(f"Skipping {etf_ticker}: only fetched {len(group)} / {floor} holdings.")
                continue

            cur.execute(
                """
                insert into etf_holdings
                    (etf_ticker, holding_ticker, holding_name, sector, country, currency, weight)
                select * from unnest(%s::text[], %s::text[], %s::text[], %s::text[], %s::text[], %s::text[], %s::numeric[])
                on conflict (etf_ticker, holding_ticker, holding_name)
                do update set
                    sector = excluded.sector,
                    country = excluded.country,
                    currency = excluded.currency,
                    weight = excluded.weight
                returning (xmax = 0) as inserted
                """,
                (
                    group["etf_ticker"].tolist(),
                    group["holding_ticker"].tolist(),
                    group["holding_name"].tolist(),
                    group["sector"].tolist(),
                    group["country"].tolist(),
                    group["currency"].tolist(),
                    group["weight"].tolist(),
                ),
            )
            
            new = sum(inserted for (inserted,) in cur.fetchall())

            if new:
                print(f"Added {new} new holding{'s' if new > 1 else ''} for {etf_ticker}.")

            # Delete old holdings if not present in latest valid fetch due to rebalancing or FX movements
            cur.execute(
                """
                delete from etf_holdings
                where etf_ticker = %s and not exists (
                    select 1
                    from unnest(%s::text[], %s::text[]) as keep(holding_ticker, holding_name)
                    where keep.holding_ticker = etf_holdings.holding_ticker
                        and keep.holding_name = etf_holdings.holding_name
                )
                """,
                (etf_ticker, group["holding_ticker"].tolist(), group["holding_name"].tolist()),
            )

            if cur.rowcount:
                print(f"Removed {cur.rowcount} stale holding{'s' if new > 1 else ''} for {etf_ticker}.")

    connection.commit()
    connection.close()


"""Main Program Loop"""

if __name__ == "__main__":
    start = time.perf_counter()

    try:
        ISSUERS_AUS = {
            #"betashares": _load_etfs("betashares_aus", ["ticker"], fetch_holdings_betashares_aus),
            #"ishares": _load_etfs("ishares_aus", ["ticker", "product_id", "slug", "timestamp"], fetch_holdings_ishares_aus),
            "vanguard": _load_etfs("vanguard_aus", ["ticker", "product_id"], fetch_holdings_vanguard_aus),
        }
        
        # Fetch data for ASX listed ETFs
        for name, (tickers, fetch) in ISSUERS_AUS.items():
            for ticker in tickers:
                try:
                    upsert(normalize(fetch(*ticker)))
                    print(f"Successfully downloaded ASX: {ticker[0]} from {name}.\n")

                except Exception as e:
                    print(f"Failed to download ASX: {ticker[0]} from {name}: {e}\n")

    finally:
        elapsed = time.perf_counter() - start
        print(f"Sync finished in {elapsed:.0f} seconds.")
