"""Python Script to Sync Database"""

import datetime
import io
import os
import pandas as pd
import psycopg
import requests
import time
import warnings

from dotenv import load_dotenv
from utils import HEADERS, sectors, _load_etfs, _split_blocks, _map_country_currency

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]
warnings.filterwarnings("ignore", message="Unknown extension is not supported and will be removed")


"""ASX Data Fetching"""

# Fetch holdings for a single BetaShares ASX listed ETF
def fetch_holdings_betashares_aus(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()

    return (
        pd.read_csv(io.StringIO(response.text), skiprows=6)
        .dropna(subset=["Name"])
        .assign(
            etf_ticker=ticker,
            Ticker=lambda df: df["Ticker"].str.split().str[0],
            Sector=lambda df: df["Sector"].replace({ "Healthcare": "Health Care" }),
        )
    )

# Fetch holdings for a single Global X ASX listed ETF
def fetch_holdings_globalx_aus(ticker: str) -> pd.DataFrame:
   # Find the latest weekday excluding today for manual running with workflow_dispatch
   yesterday = datetime.datetime.now() - datetime.timedelta(days=1)
   weekday = (yesterday - datetime.timedelta(days=max(0, yesterday.weekday() - 4))).strftime('%Y%m%d')

   url = f"https://files.globalxetfs.com.au/GXAU_{ticker}_FULL_PCF_{weekday}.xlsx"

   response = requests.get(url, headers=HEADERS, timeout=15)
   response.raise_for_status()

   return (
        pd.read_excel(io.BytesIO(response.content), skiprows=18, engine="openpyxl")
        .dropna(subset=["ISIN"])
        .assign(
            etf_ticker=ticker,
            holding_ticker=lambda df: df["Bloomberg Ticker"].str.split().str[0],
            weight=lambda df: df["Weight"] * 100,
        )
        .rename(columns={
            "Component Name": "holding_name",
            "Local CCY": "currency",
        })
    )

# Fetch holdings for a single BlackRock ASX listed ETF
def fetch_holdings_ishares_aus(ticker: str, product_id: str, slug: str, timestamp: str) -> pd.DataFrame:
    url = (
        f"https://www.blackrock.com/au/products/{product_id}/{slug}/{timestamp}"
        f".ajax?fileType=csv&fileName={ticker}_holdings&dataType=fund"
    )

    response = requests.get(url, headers=HEADERS, timeout=15)
    response.raise_for_status()

    return (
        pd.read_csv(io.StringIO(_split_blocks(response.text)[-1]), skiprows=2)
        .dropna(subset=["Name"])
        .drop(columns=["Currency"])
        .rename(columns={"Market Currency": "Currency"})
        .assign(
            etf_ticker=ticker,
            Sector=lambda df: df["Sector"].replace({ "Communication": "Communication Services" }),
            country=lambda df: df["Location"],
        )
    )

# Fetch holdings for a single Vanguard ASX listed ETF
def fetch_holdings_vanguard_aus(ticker: str, product_id: str) -> pd.DataFrame:
    url = f"https://www.vanguard.com.au/personal/api/data/products/holdings/{product_id}"

    response = requests.get(url, params={"limit": 1500}, headers=HEADERS, timeout=15)
    response.raise_for_status()
    items = response.json().get("data", {}).get("items", [])

    df = (
        pd.DataFrame(items)
        .dropna(subset=["name"])
        .assign(
            etf_ticker=ticker,
            Ticker=lambda df: df["ticker"].fillna(df["name"]).str.split().str[0].str.upper(),
            Name=lambda df: df["name"].str.upper(),
            Sector=lambda df: df["sectorName"].map(sectors),
            Country=lambda df: df["countryCode"].map(lambda c: _map_country_currency(c)[0]),
            Currency=lambda df: df["countryCode"].map(lambda c: _map_country_currency(c)[1]),
        )
        .rename(columns={
            "marketValPercent": "Weight (%)",
        })
    )

    # Aggregate duplicate holdings into a single holding
    other_cols = {c: "first" for c in df.columns if c not in ("etf_ticker", "Ticker", "Name", "Weight (%)")}
    return df.groupby(["etf_ticker", "Ticker", "Name"], as_index=False).agg({**other_cols, "Weight (%)": "sum"})


"""Database Functions"""

# Standardise column headers for database, drop invalid rows and use at most 6 decimal places
def normalize(df: pd.DataFrame, hedged: bool) -> pd.DataFrame:
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
        .assign(
            currency=lambda df: "AUD" if hedged else df["currency"],
            weight=lambda df: df["weight"].round(6)
        )
        .loc[lambda df: df["sector"].notna() & df["country"].notna() & (df["weight"] > 0)]
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
            "Betashares": _load_etfs("betashares_aus", ["ticker", "hedged"], fetch_holdings_betashares_aus),
            "Global X": _load_etfs("globalx_aus", ["ticker", "hedged"], fetch_holdings_globalx_aus),
            "iShares": _load_etfs("ishares_aus", ["ticker", "product_id", "slug", "timestamp", "hedged"], fetch_holdings_ishares_aus),
            "Vanguard": _load_etfs("vanguard_aus", ["ticker", "product_id", "hedged"], fetch_holdings_vanguard_aus),
        }
        
        # Fetch data for ASX listed ETFs
        for name, (tickers, fetch) in ISSUERS_AUS.items():
            for ticker in tickers:
                try:
                    *args, hedged = ticker
                    upsert(normalize(fetch(*args), hedged))
                    print(f"Successfully downloaded ASX: {ticker[0]} from {name}.\n")

                except Exception as e:
                    print(f"Failed to download ASX: {ticker[0]} from {name}: {e}\n")

    finally:
        elapsed = time.perf_counter() - start
        print(f"Sync finished in {elapsed:.0f} seconds.")
