import os
import pandas as pd
import psycopg

DB_URL = os.environ["SUPABASE_DB_URL"]
TRACKED_ETFS = ["A200", "NDQ", "HACK", "GEAR"]

def fetch_holdings(ticker: str) -> pd.DataFrame:
    url = f"https://www.betashares.com.au/files/csv/{ticker}_Portfolio_Holdings.csv"
    df = pd.read_csv(url, skiprows=7)  # adjust after inspecting the raw file
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
    return df[["etf_ticker", "constituent_ticker", "constituent_name",
               "sector", "country", "currency", "weight_pct"]]

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
        upsert(normalize(fetch_holdings(ticker)))