import io
import os
import pandas as pd
import psycopg
import re
import requests

from dotenv import load_dotenv
from functools import lru_cache

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

BETASHARES_AUS = [
    "A200",
    "ASIA",
    "BGBL",
    #"DHHF",
    "NDQ",
]

ISHARES_AUS = []

VANGUARD_AUS = []


"""ASX Data Fetching"""

def fetch_holdings_betashares_aus(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text), skiprows=6)
    df = df.dropna(subset=["Name"])
    df["etf_ticker"] = ticker

    return df

@lru_cache(maxsize=1)
def _ishares_aus_ticker_map() -> dict[str, str]:
    base = "https://www.blackrock.com"

    funds_html = requests.get(f"{base}/au/products/investment-funds").text
    return dict(re.findall(
        r'<a href="(/au/products/\d+/[\w-]+)">([A-Z]{2,5})</a>',
        funds_html
    ))

def fetch_holdings_ishares_aus(ticker: str) -> pd.DataFrame:
    base = "https://www.blackrock.com"

    product_path = _ishares_aus_ticker_map()[ticker]
    product_html = requests.get(f"{base}{product_path}").text
    match = re.search(
        rf'href="([^"]+\.ajax\?fileType=csv&fileName={ticker}_holdings[^"]*)"',
        product_html,
    )

    if not match:
        raise ValueError(f"No holdings CSV link found for {ticker}")
    
    csv_url = f"{base}{match.group(1)}"
    csv_text = requests.get(csv_url).text
    return pd.read_csv(io.StringIO(csv_text), skiprows=2)

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
    "betashares": (BETASHARES_AUS, fetch_holdings_betashares_aus),
    "ishares": (ISHARES_AUS, fetch_holdings_ishares_aus),
    #"vanguard": (VANGUARD_AUS, fetch_holdings_vanguard_aus),
}

if __name__ == "__main__":
    # Fetch data for ASX listed ETFs
    for name, (tickers, fetch) in ISSUERS_AUS.items():
        for ticker in tickers:
            try:
                upsert(normalize(fetch(ticker)))

            except Exception as e:
                print(f"Failed to download {ticker} ({name}): {e}")
                