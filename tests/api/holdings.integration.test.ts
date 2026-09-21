/**
 * Integration tests for POST /app/api/holdings/route.ts against the REAL
 * `etf_holdings` table (Supabase project hchwkszioexcfuoybvoo).
 *
 * Unlike holdings.test.ts (fully mocked, deterministic, fast), this file:
 *   - does NOT mock @/utils/postgres — it queries the live table, so it
 *     genuinely exercises the SQL query, the schema, and ticker matching
 *     against production data
 *   - DOES mock yahoo-finance2, with fixed prices — not to dodge the real
 *     DB, but because live market prices are a moving target that would
 *     make "is the math correct" impossible to pin down independently of
 *     "did the price tick between two calls." Holdings weights are what's
 *     under test here, so those stay real.
 *
 * Because real holdings weights are re-synced daily, expected top-10
 * results are NOT hardcoded (they'd go stale). Instead this file fetches
 * the current live rows once in beforeAll and computes expected values
 * with an independent reference implementation of the CORRECT formula
 * (see computeExpectedTopHoldings below) — so the test stays valid
 * regardless of what the data looks like on any given day.
 *
 * PREREQUISITES:
 *   - The environment running these tests needs real Postgres
 *     connectivity (whatever @/utils/postgres already relies on locally
 *     — e.g. a Session Pooler connection string / env vars). If that's
 *     not available (e.g. a CI job with no DB secrets), skip this file
 *     and rely on holdings.test.ts.
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { POST } from "@/app/api/holdings/route";
import { MOCK_PRICES } from "@/tests/fixtures/db.fixtures";
import { MOCK_PORTFOLIOS, type Position } from "@/tests/fixtures/portfolio.fixtures";
import { sql } from "@/utils/postgres";

interface Row {
  etf_ticker: string;
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  currency: string;
  weight: number;
}

// Mock Yahoo Finance
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      quote: vi.fn(async (ticker: string) => ({
        regularMarketPrice: MOCK_PRICES[ticker],
      })),
    };
  }),
}));

const TICKERS = ["IHVV.AX", "IVV.AX", "NDQ.AX", "VAS.AX"];
let liveHoldings: Row[];

beforeAll(async () => {
  // Same query route.ts itself runs, so this file exercises the real
  // shape of the data the route depends on.
  liveHoldings = await sql<Row[]>`
    SELECT etf_ticker, holding_ticker, holding_name, sector, country, currency, weight
    FROM etf_holdings
    WHERE etf_ticker = ANY(${TICKERS})
  `;

  // Fail loudly and clearly rather than let every test below trivially
  // "pass" against an empty result set (e.g. table truncated mid-sync).
  for (const ticker of TICKERS) {
    const count = liveHoldings.filter((h) => h.etf_ticker === ticker).length;
    if (count === 0) {
      throw new Error(
        `No live etf_holdings rows found for ${ticker} — check the DB/sync state before trusting this suite.`
      );
    }
  }
}, 30_000);

/**
 * Independent reference implementation of the CORRECT aggregation
 * formula — deliberately does not reproduce getTopHoldings' current
 * `?? 0 * h.weight` bug. This is the oracle these tests check route.ts
 * against.
 */
function computeExpectedTopHoldings(
  portfolio: Position[],
  holdingsRows: Row[],
  prices: Record<string, number>,
  n = 10
) {
  const values = portfolio.map((p) => p.shares * prices[p.ticker]);
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  if (totalValue === 0) return [];

  const weightByTicker = new Map(
    portfolio.map((p, i) => [p.ticker, values[i] / totalValue])
  );

  const aggregated = new Map<
    string,
    { holding_ticker: string; weight: number }
  >();

  for (const h of holdingsRows) {
    const contributionPct = (weightByTicker.get(h.etf_ticker) ?? 0) * h.weight;
    const existing = aggregated.get(h.holding_ticker);
    if (existing) {
      existing.weight += contributionPct;
    } else {
      aggregated.set(h.holding_ticker, {
        holding_ticker: h.holding_ticker,
        weight: contributionPct,
      });
    }
  }

  return [...aggregated.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, n);
}

function buildRequest(portfolio: Position[]): Request {
  return new Request("http://localhost/api/holdings", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

describe("POST /api/holdings — live etf_holdings integration", () => {
  it.each([
    ["portfolio 1 (500 VAS.AX)", MOCK_PORTFOLIOS.p1],
    ["portfolio 2 (200 VAS.AX + 450 IVV.AX)", MOCK_PORTFOLIOS.p2],
    ["portfolio 3 (150 VAS.AX + 400 IHVV.AX)", MOCK_PORTFOLIOS.p3],
    ["portfolio 4 (100 VAS.AX + 275 NDQ.AX + 500 IVV.AX)", MOCK_PORTFOLIOS.p4],
  ])("%s: matches the reference calculation over live holdings", async (_label, portfolio) => {
    const response = await POST(buildRequest(portfolio));
    const body = await response.json();
    expect(response.status).toBe(200);

    const expected = computeExpectedTopHoldings(portfolio, liveHoldings, MOCK_PRICES);

    expect(body.top_holdings).toHaveLength(expected.length);
    expected.forEach((exp, i) => {
      expect(body.top_holdings[i].holding_ticker, `rank ${i + 1}`).toBe(
        exp.holding_ticker
      );
      expect(
        body.top_holdings[i].weight,
        `${exp.holding_ticker} weight`
      ).toBeCloseTo(exp.weight, 6);
    });
  });
});
