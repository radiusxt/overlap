"""
Shared pytest fixtures for testing suite.
"""

import os
import psycopg
import pytest
import urllib.parse


SAFE_TEST_HOSTS = {"localhost", "127.0.0.1"}

"""
Refuse to run destructive test SQL against anything but a local/CI
Postgres. sync.py's load_dotenv(".env.local") only fills in env vars
that aren't already set so a local `pytest` run with no SUPABASE_DB_URL
exported first will silently pick up your real Supabase credentials
from .env.local. This is the backstop for that.
"""
def _assert_safe_test_db(url: str) -> None:
    host = urllib.parse.urlparse(url).hostname

    if host not in SAFE_TEST_HOSTS:
        raise RuntimeError(
            f"Refusing to run test SQL against host {host!r}. "
            "SUPABASE_DB_URL must point at a local/CI Postgres container, "
            "never the production database. If you're running locally, "
            "export SUPABASE_DB_URL to your test container's URL before "
            "running pytest and don't rely on .env.local."
        )

# Mirrors the real public.etf_holdings schema
CREATE_TABLE_SQL = """
create table if not exists public.etf_holdings (
    id bigint generated always as identity primary key,
    etf_ticker text not null,
    holding_ticker text not null,
    holding_name text not null,
    sector text,
    country text,
    currency text,
    weight numeric not null,
    "timestamp" timestamptz not null default now(),
    unique (etf_ticker, holding_ticker, holding_name)
)
"""

CREATE_TRIGGER_FN_SQL = """
    create or replace function public.set_updated_at()
    returns trigger
    language plpgsql
    set search_path to ''
    as $$
    begin
    new."timestamp" = now();
    return new;
    end;
    $$
"""

CREATE_TRIGGER_SQL = """
    drop trigger if exists trg_etf_holdings_updated_at on public.etf_holdings;
    create trigger trg_etf_holdings_updated_at
    before update on public.etf_holdings
    for each row execute function set_updated_at()
"""


@pytest.fixture
def db():
    """
    Ensure a clean etf_holdings table exists, mirroring the real schema.

    Only requested by upsert tests hitting Postgres.
    normalize() and fetch_*() never opens a connection and doesn't need SUPABASE_DB_URL.
    """
    url = os.environ["SUPABASE_DB_URL"]
    _assert_safe_test_db(url)

    with psycopg.connect(os.environ["SUPABASE_DB_URL"]) as conn:
        conn.execute(CREATE_TABLE_SQL)
        conn.execute(CREATE_TRIGGER_FN_SQL)
        conn.execute(CREATE_TRIGGER_SQL)
        conn.execute("truncate table public.etf_holdings restart identity")
    yield


@pytest.fixture
def fake_response():
    """Factory for a stand-in requests.Response, for monkeypatching _get."""

    class FakeResponse:
        def __init__(self, text=None, content=None, json_data=None):
            self.text = text
            self.content = content
            self._json = json_data

        def json(self):
            return self._json

    return FakeResponse
