"""Utility File for sync.py"""

import json
import pycountry
import requests

from babel.numbers import get_territory_currencies
from functools import lru_cache
from pathlib import Path


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


def _get(url: str, **kwargs) -> requests.Response:
    response = requests.get(url, headers=HEADERS, timeout=15, **kwargs)
    response.raise_for_status()
    return response


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


# Map an ISO 3166-1 alpha-2 code ('AU') to (Country name, Currency)
# Returns (None, None) for missing/unrecognised codes
# This is for Vanguard funds for not listing country nor currency in csv
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
