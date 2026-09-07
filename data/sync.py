import io
import json
import os
import pandas as pd
import psycopg
import requests
import time

from dotenv import load_dotenv
from pathlib import Path

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]


"""Data Fetching"""

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

def _load_etfs(issuer_key: str, fields: list[str], fetch) -> tuple[list[tuple], callable]:
    with open(Path(__file__).parent / "etfs.json") as f:
        config = json.load(f)

    tickers = [tuple(entry[field] for field in fields) for entry in config[issuer_key]]
    return tickers, fetch

def fetch_holdings_betashares_aus(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), skiprows=6)
    df["etf_ticker"] = ticker
    df = df.dropna(subset=["Name"])
    df["Ticker"] = df["Ticker"].str.split().str[0]

    return df

def fetch_holdings_ishares_aus(ticker: str, product_id: str, slug: str, timestamp: str) -> pd.DataFrame:
    url = (
        f"https://www.blackrock.com/au/products/{product_id}/{slug}/"
        f"{timestamp}.ajax?fileType=csv&fileName={ticker}_holdings&dataType=fund"
    )

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), skiprows=2)
    df["etf_ticker"] = ticker
    df = df.dropna(subset=["Name"])
    df["Country"] = df["Location"]

    return df

def fetch_holdings_vanguard_aus(ticker: str) -> pd.DataFrame:
    pass


"""Database Functions"""

# Standardise column headers for database and drop rows with NaN
def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={
        "Ticker": "holding_ticker",
        "Name": "holding_name",
        "Sector": "sector",
        "Country": "country",
        "Currency": "currency",
        "Weight (%)": "weight",
    })

    df = df[["etf_ticker", "holding_ticker", "holding_name",
             "sector", "country", "currency", "weight"]]

    # Cull rows where sector is "NaN" or country is "NaN" or weight is "NaN" or weight is 0
    reject = df["sector"].isna() | df["country"].isna() | df["weight"].isna() | (df["weight"] == 0)
    df = df[~reject]
    
    return df.where(pd.notnull(df), None)

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

            for row in df.itertuples(index=False):
                cur.execute(
                    """
                    insert into etf_holdings
                        (etf_ticker, holding_ticker, holding_name,
                        sector, country, currency, weight)
                    values (%s, %s, %s, %s, %s, %s, %s)
                    on conflict (etf_ticker, holding_ticker, holding_name)
                    do update set
                        sector = excluded.sector,
                        country = excluded.country,
                        currency = excluded.currency,
                        weight = excluded.weight
                    """,
                    (row.etf_ticker, row.holding_ticker, row.holding_name, row.sector, row.country, row.currency, row.weight),
                )

            # Delete old holdings if not present in latest valid fetch
            # This indicates a fund has rebalanced
            cur.execute(
                """
                delete from etf_holdings
                where etf_ticker = %s
                  and not exists (
                      select 1
                      from unnest(%s::text[], %s::text[]) as keep(holding_ticker, holding_name)
                      where keep.holding_ticker = etf_holdings.holding_ticker
                        and keep.holding_name = etf_holdings.holding_name
                  )
                """,
                (etf_ticker, group["holding_ticker"].tolist(), group["holding_name"].tolist()),
            )

            if cur.rowcount:
                print(f"Deleted {cur.rowcount} stale holdings for {etf_ticker}.")

    connection.commit()
    connection.close()


"""Main Program Loop"""

if __name__ == "__main__":
    start = time.perf_counter()

    try:
        ISSUERS_AUS = {
            "betashares": _load_etfs("betashares_aus", ["ticker"], fetch_holdings_betashares_aus),
            "ishares": _load_etfs("ishares_aus", ["ticker", "product_id", "slug", "timestamp"], fetch_holdings_ishares_aus),
            #"vanguard": _load_etfs("vanguard_aus", ["ticker"], fetch_holdings_vanguard_aus),
        }
        
        # Fetch data for ASX listed ETFs
        for name, (tickers, fetch) in ISSUERS_AUS.items():
            for ticker in tickers:
                try:
                    upsert(normalize(fetch(*ticker)))
                    print(f"Successfully downloaded {ticker[0]}.\n")

                except Exception as e:
                    print(f"Failed to download {ticker[0]} from {name}: {e}\n")

    finally:
        elapsed = time.perf_counter() - start
        print(f"Sync finished in {elapsed:.2f} seconds.")
