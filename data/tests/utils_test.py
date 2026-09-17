"""
Unit tests for the helper functions in utils.py.
"""

from utils import _map_country_currency, _split_blocks


def test_split_blocks_single_section():
    text = "Fund Holdings as of 1 Jan 2026\nTicker,Name\nBHP,BHP Group"
    blocks = _split_blocks(text)

    assert len(blocks) == 1
    assert "BHP,BHP Group" in blocks[0]


def test_split_blocks_feeder_fund_returns_one_block_per_section():
    text = (
        "Fund Holdings as of 1 Jan 2026\n"
        "Header\n"
        "Parent fund row\n"
        "Fund Holdings as of 1 Jan 2026 (Underlying Fund)\n"
        "Header\n"
        "Underlying fund row\n"
    )
    blocks = _split_blocks(text)

    assert len(blocks) == 2
    assert blocks[-1].strip().endswith("Underlying fund row")


def test_map_country_currency_known_code():
    name, currency = _map_country_currency("AU")

    assert name == "Australia"
    assert currency == "AUD"


def test_map_country_currency_unknown_code_returns_none():
    assert _map_country_currency("ZZ") == (None, None)


def test_map_country_currency_handles_missing_code():
    assert _map_country_currency(None) == (None, None)
    assert _map_country_currency("") == (None, None)
