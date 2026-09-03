import io
import os
import requests
import pandas as pd
import psycopg

from dotenv import load_dotenv

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
}

load_dotenv(".env.local")
DB_URL = os.environ["SUPABASE_DB_URL"]
TRACKED_ETFS = ["A200", "NDQ", "HACK", "GEAR"]

def fetch_holdings(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"

    response = requests.get(url, headers=HEADERS)
    response.raise_for_status()  # fail loudly if this ticker's file 404s or errors

    df = pd.read_csv(io.StringIO(response.text), skiprows=7)
    df["etf_ticker"] = ticker

    return df

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

def upsert(df: pd.DataFrame):
    conn = psycopg.connect(DB_URL)

    with conn.cursor() as cur:
        for row in df.itertuples(index=False):
            cur.execute(
                """
                insert into etf_holdings
                    (etf_ticker, constituent_ticker, constituent_name,
                     sector, country, currency, weight_pct, as_of_date)
                values (%s, %s, %s, %s, %s, %s, %s, current_date)
                on conflict (etf_ticker, constituent_ticker, as_of_date)
                do update set weight_pct = excluded.weight_pct
                """,
                (row.etf_ticker, row.constituent_ticker, row.constituent_name,
                 row.sector, row.country, row.currency, row.weight_pct),
            )
    conn.commit()
    conn.close()

if __name__ == "__main__":
    for ticker in TRACKED_ETFS:
        try:
          upsert(normalize(fetch_holdings(ticker)))

        except Exception as e:
            print(f"Failed to download {ticker}: {e}")
            