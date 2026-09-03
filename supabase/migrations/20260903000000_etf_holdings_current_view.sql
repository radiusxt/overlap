-- Migration: add "current holdings" view + supporting index for public.etf_holdings
--
-- Context: etf_holdings is written to daily by a GitHub Action that pulls the
-- FULL current constituent list for each fund and inserts it under that day's
-- as_of_date. On a normal day this just refreshes weights. On a rebalance day,
-- a dropped constituent simply doesn't appear in that day's pull, so it never
-- gets a row for the latest as_of_date. No deletes or triggers are needed —
-- "current holdings" just needs to always resolve to each fund's latest pull.

-- 1. Index to make "latest date per fund" lookups fast as history accumulates.
create index if not exists idx_etf_holdings_ticker_date
  on public.etf_holdings (etf_ticker, as_of_date desc);

-- 2. View: always resolves to the most recent as_of_date per etf_ticker.
--    Downstream code/queries should read from this view, not the raw table,
--    whenever "current holdings" (as opposed to historical holdings) is needed.
create or replace view public.etf_holdings_current as
select h.*
from public.etf_holdings h
join (
  select etf_ticker, max(as_of_date) as latest_date
  from public.etf_holdings
  group by etf_ticker
) latest
  on h.etf_ticker = latest.etf_ticker
 and h.as_of_date = latest.latest_date;

comment on view public.etf_holdings_current is
  'Latest constituent snapshot per ETF, derived from etf_holdings. A constituent dropped in a rebalance stops appearing here automatically once a newer as_of_date exists, with no explicit delete required.';
