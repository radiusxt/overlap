import io
import json
import os
import pandas as pd
import psycopg
import requests

from dotenv import load_dotenv

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}


"""ASX Data Fetching"""

def _load_etfs(issuer_key: str, fields: list[str]) -> list[tuple]:
    with open("./etfs.json") as f:
        config = json.load(f)

    return [tuple(entry[field] for field in fields) for entry in config[issuer_key]]

def fetch_holdings_betashares_aus(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), skiprows=6)
    df = df.dropna(subset=["Name"])
    df["etf_ticker"] = ticker

    return df

def fetch_holdings_ishares_aus(ticker: str, product_id: str, slug: str, timestamp: str) -> pd.DataFrame:
    url = (
        f"https://www.blackrock.com/au/products/{product_id}/{slug}/"
        f"{timestamp}.ajax?fileType=csv&fileName={ticker}_holdings&dataType=fund"
    )

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), skiprows=2)
    df = df.dropna(subset=["Name"])
    df["etf_ticker"] = ticker
    df["country"] = "Australia"

    return df


"""Database Functions"""

# Standardise column headers for database
def normalize(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns={
        "Ticker": "constituent_ticker",
        "Name": "constituent_name",
        "Sector": "sector",
        "Country": "country",
        "Currency": "currency",
        "Weight (%)": "weight_pct",
    })

    df = df[["etf_ticker", "constituent_ticker", "constituent_name",
             "sector", "country", "currency", "weight_pct"]]
    
    return df.where(pd.notnull(df), None)

# Update database records or create new records if they don't exist.
# If there has been a rebalance, old holdings will be dropped.
def upsert(df: pd.DataFrame):
    connection = psycopg.connect(DB_URL)

    with connection.cursor() as cur:
        for row in df.itertuples(index=False):
            cur.execute(
                """
                insert into etf_holdings
                    (etf_ticker, constituent_ticker, constituent_name,
                    sector, country, currency, weight_pct, as_of_date)
                values (%s, %s, %s, %s, %s, %s, %s, current_date)
                on conflict (etf_ticker, constituent_ticker)
                do update set
                    weight_pct = excluded.weight_pct,
                    as_of_date = excluded.as_of_date
                """,
                (row.etf_ticker, row.constituent_ticker, row.constituent_name,
                row.sector, row.country, row.currency, row.weight_pct),
            )

    connection.commit()
    connection.close()


"""Main Program Loop"""

ISSUERS_AUS = {
    "betashares": (_load_etfs("betashares", ["ticker"]), fetch_holdings_betashares_aus),
    "ishares": (_load_etfs("ishares", ["ticker", "product_id", "slug", "timestamp"]), fetch_holdings_ishares_aus),
    #"vanguard": (_load_etfs("vanguard", ["ticker"]), fetch_holdings_vanguard_aus),
}

if __name__ == "__main__":
    # Fetch data for ASX listed ETFs
    for name, (tickers, fetch) in ISSUERS_AUS.items():
        for ticker in tickers:
            try:
                upsert(normalize(fetch(*ticker)))
                print(f"Successfully downloaded {ticker[0]}.")

            except Exception as e:
                print(f"Failed to download {ticker[0]} ({name}): {e}")
                