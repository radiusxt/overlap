"""
Integration tests for upsert() against a real Postgres instance.

These run against SUPABASE_DB_URL pointed at by the `db` fixture.
Using CI, that's the throwaway Postgres service container defined in the workflow,
not the production Supabase database.
"""

import os
import pandas as pd
import psycopg

from sync import upsert


COLUMNS = ["etf_ticker", "holding_ticker", "holding_name",
           "sector", "country", "currency", "weight"]

def _holdings(rows):
    return pd.DataFrame(rows, columns=COLUMNS)

def _fetch_all():
    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as connection:
        cur = connection.execute(
            f"select {', '.join(COLUMNS)} from etf_holdings order by holding_ticker"
        )
        
        return cur.fetchall()


def test_upsert_inserts_new_holdings(db):
    upsert(_holdings([
        ("A200", "BHP", "BHP GROUP", "Materials", "Australia", "AUD", 5.0),
        ("A200", "CBA", "CBA LTD", "Financials", "Australia", "AUD", 4.0),
    ]))

    rows = _fetch_all()

    assert len(rows) == 2
    assert rows[0][:2] == ("A200", "BHP")


def test_upsert_updates_existing_holding_on_conflict(db):
    upsert(_holdings([("A200", "BHP", "BHP GROUP", "Materials", "Australia", "AUD", 5.0)]))
    upsert(_holdings([("A200", "BHP", "BHP GROUP", "Materials", "Australia", "AUD", 6.5)]))

    rows = _fetch_all()

    assert len(rows) == 1        # no duplicate row from the conflict
    assert rows[0][-1] == 6.5    # weight was updated in place


def test_upsert_removes_stale_holdings_on_rebalance(db):
    upsert(_holdings([
        ("A200", "BHP", "BHP GROUP", "Materials", "Australia", "AUD", 5.0),
        ("A200", "CBA", "CBA LTD", "Financials", "Australia", "AUD", 4.0),
    ]))
    
    # Rebalance: CBA dropped, NAB added. Still well above the 90% floor.
    upsert(_holdings([
        ("A200", "BHP", "BHP GROUP", "Materials", "Australia", "AUD", 5.0),
        ("A200", "NAB", "NAB LTD", "Financials", "Australia", "AUD", 4.0),
    ]))

    tickers = {row[1] for row in _fetch_all()}

    assert tickers == {"BHP", "NAB"}


def test_upsert_skips_fund_when_fetch_is_too_partial(db, capsys):
    upsert(_holdings([
        ("A200", f"H{i}", f"Holding {i}", "Materials", "Australia", "AUD", 1.0)
        for i in range(10)
    ]))

    # Only 5/10 = 50% returned this time, below the 90% MIN_SYNC_RATIO floor.
    upsert(_holdings([
        ("A200", f"H{i}", f"Holding {i}", "Materials", "Australia", "AUD", 1.0)
        for i in range(5)
    ]))

    rows = _fetch_all()
    
    assert len(rows) == 10  # nothing inserted or deleted — fund was skipped
    assert "Skipping A200" in capsys.readouterr().out
