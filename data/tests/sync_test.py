"""
Unit tests for normalize() and fetch_holdings_*() in sync.py.

Network calls are mocked by monkeypatching sync._get(),
nothing here touches the network or the database.
"""

import io
import pandas as pd
import pytest
import sync


# --- normalize() -------------------------------------------------------

def _raw(**overrides):
    base = {
        "etf_ticker": ["A200"],
        "Ticker": ["BHP"],
        "Name": ["BHP GROUP LTD"],
        "Sector": ["Materials"],
        "Country": ["Australia"],
        "Currency": ["AUD"],
        "Weight (%)": [5.123456789],
    }

    base.update(overrides)
    return pd.DataFrame(base)


def test_normalize_renames_and_selects_columns():
    result = sync.normalize(_raw(), hedged=False)

    assert list(result.columns) == [
        "etf_ticker", "holding_ticker", "holding_name",
        "sector", "country", "currency", "weight",
    ]


def test_normalize_rounds_weight_to_six_decimals():
    result = sync.normalize(_raw(), hedged=False)

    assert result["weight"].iloc[0] == 5.123457


def test_normalize_hedged_forces_currency_to_aud():
    result = sync.normalize(_raw(Currency=["USD"]), hedged=True)

    assert result["currency"].iloc[0] == "AUD"


def test_normalize_drops_rows_missing_sector_or_country():
    df = _raw(
        etf_ticker=["A", "B"],
        Ticker=["X", "Y"],
        Name=["X Co", "Y Co"],
        Sector=["Materials", None],
        Country=["Australia", "Australia"],
        Currency=["AUD", "AUD"],
        **{"Weight (%)": [1.0, 2.0]},
    )
    result = sync.normalize(df, hedged=False)

    assert result["holding_ticker"].tolist() == ["X"]


def test_normalize_drops_zero_weight_rows():
    result = sync.normalize(_raw(**{"Weight (%)": [0.0]}), hedged=False)

    assert result.empty


# --- fetch_holdings_betashares_aus() --------------------------------------

def test_fetch_betashares_strips_ticker_suffix_and_remaps_sector(monkeypatch, fake_response):
    csv = (
        "\n" * 6 +
        "Ticker,Name,Sector,Country,Currency,Weight (%)\n"
        "BHP AT,BHP GROUP,Healthcare,Australia,AUD,5.0\n"
        "CASH999,,Other,Australia,AUD,1.0\n"  # blank Name -> dropped
    )

    monkeypatch.setattr(sync, "_get", lambda url: fake_response(text=csv))
    df = sync.fetch_holdings_betashares_aus("A200")

    assert len(df) == 1
    assert df["Ticker"].iloc[0] == "BHP"
    assert df["Sector"].iloc[0] == "Health Care"
    assert df["etf_ticker"].iloc[0] == "A200.AX"


# --- fetch_holdings_globalx_aus() -----------------------------------------

def _globalx_xlsx(rows: dict) -> bytes:
    buf = io.BytesIO()

    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(rows).to_excel(writer, index=False, startrow=18)

    return buf.getvalue()


def test_fetch_globalx_converts_weight_and_splits_ticker(monkeypatch, fake_response):
    xlsx_bytes = _globalx_xlsx({
        "ISIN": ["AU000000BHP4"],
        "Bloomberg Ticker": ["BHP AU"],
        "Component Name": ["BHP GROUP LTD"],
        "Sector": ["Materials"],
        "Country": ["Australia"],
        "Local CCY": ["AUD"],
        "Weight": [0.05],
    })

    monkeypatch.setattr(sync, "_get", lambda url: fake_response(content=xlsx_bytes))
    df = sync.fetch_holdings_globalx_aus("GHZN")

    assert df["Ticker"].iloc[0] == "BHP"
    assert df["Name"].iloc[0] == "BHP GROUP LTD"
    assert df["Currency"].iloc[0] == "AUD"
    assert df["weight"].iloc[0] == pytest.approx(5.0)


# --- fetch_holdings_ishares_aus() -----------------------------------------

def test_fetch_ishares_uses_last_block_and_remaps_country_currency(monkeypatch, fake_response):
    csv_text = (
        "Fund Holdings as of 1 Jan 2026\n"
        "Metadata line\n"
        "Name,Sector,Location,Market Currency,Currency,Weight (%)\n"
        "Old feeder row,Other,Ireland,EUR,EUR,100.0\n"
        "Fund Holdings as of 1 Jan 2026 (Underlying Fund)\n"
        "Metadata line\n"
        "Name,Sector,Location,Market Currency,Currency,Weight (%)\n"
        "BHP GROUP LTD,Communication,Australia,AUD,USD,5.0\n"
    )

    monkeypatch.setattr(sync, "_get", lambda url: fake_response(text=csv_text))
    df = sync.fetch_holdings_ishares_aus("IVV", "product", "slug", "timestamp")

    assert len(df) == 1  # only the underlying-fund block is used
    assert df["Country"].iloc[0] == "Australia"
    assert df["Currency"].iloc[0] == "AUD"  # overwritten from Market Currency
    assert df["Sector"].iloc[0] == "Communication Services"


# --- fetch_holdings_vanguard_aus() ----------------------------------------

def test_fetch_vanguard_aggregates_duplicates_and_maps_country(monkeypatch, fake_response):
    monkeypatch.setattr(sync, "sectors", {"Metals & Mining": "Materials"})

    payload = {"data": {"items": [
        {"ticker": "BHP", "name": "BHP Group", "sectorName": "Metals & Mining",
         "countryCode": "AU", "marketValPercent": 3.0},
        {"ticker": "BHP", "name": "BHP Group", "sectorName": "Metals & Mining",
         "countryCode": "AU", "marketValPercent": 2.0},
    ]}}

    monkeypatch.setattr(sync, "_get", lambda url, **kw: fake_response(json_data=payload))
    df = sync.fetch_holdings_vanguard_aus("VAS", "product-id")

    assert len(df) == 1  # duplicate holdings aggregated
    assert df["Weight (%)"].iloc[0] == pytest.approx(5.0)
    assert df["Sector"].iloc[0] == "Materials"
    assert df["Country"].iloc[0] == "Australia"


def test_fetch_vanguard_falls_back_to_name_when_ticker_missing(monkeypatch, fake_response):
    monkeypatch.setattr(sync, "sectors", {"Cash": "Cash"})

    payload = {"data": {"items": [
        {"ticker": None, "name": "cash and derivatives", "sectorName": "Cash",
         "countryCode": None, "marketValPercent": 1.0},
    ]}}

    monkeypatch.setattr(sync, "_get", lambda url, **kw: fake_response(json_data=payload))
    df = sync.fetch_holdings_vanguard_aus("VAS", "product-id")

    assert df["Ticker"].iloc[0] == "CASH"
