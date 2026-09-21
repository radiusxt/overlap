/**
 * Integration tests for api/holdings/route.ts
 * 
 * This tests whether the pipeline from SQL query to
 * ticker matching behave the way the code assumes.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/holdings/route";
import { MOCK_PRICES } from "@/tests/fixtures/db.fixtures";
import { MOCK_PORTFOLIOS, type Position } from "@/tests/fixtures/portfolio.fixtures";
import { sql } from "@/utils/postgres";

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

interface HoldingsProps {
  portfolio: Position[],
  prices: Record<string, number>,
  holdings: Row[],
  n?: number
}

interface Row {
  etf_ticker: string;
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  currency: string;
  weight: number;
}

const TICKERS = ["IHVV.AX", "IVV.AX", "NDQ.AX", "VAS.AX"];
let holdings: Row[];

beforeAll(async () => {
  holdings = await sql<Row[]>`
    SELECT etf_ticker, holding_ticker, holding_name, sector, country, currency, weight
    FROM etf_holdings
    WHERE etf_ticker = ANY(${TICKERS})
  `;

  // Fail loudly rather than let every test below "pass" against an empty result set
  for (const ticker of TICKERS) {
    const count = holdings.filter((h) => h.etf_ticker === ticker).length;

    if (count === 0) {
      throw new Error(`
        No live etf_holdings rows found for ${ticker}.
        Check the DB/sync state before trusting this suite.
      `);
    }
  }
}, 30_000);

// Independent reference implementation for getting top n holdings
function getExpectedTopHoldings({ portfolio, prices, holdings, n = 10 }: HoldingsProps) {
  const values = portfolio.map((position) =>
    position.shares * prices[position.ticker]
  );
  const totalValue = values.reduce((sum, value) => sum + value, 0);

  if (totalValue === 0) {
    return [];
  }

  const weightByTicker = new Map(
    portfolio.map((p, i) => [p.ticker, values[i] / totalValue])
  );

  const aggregated = new Map<string, { holding_ticker: string; weight: number }>();

  for (const h of holdings) {
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

  return [...aggregated.values()].sort((a, b) => b.weight - a.weight).slice(0, n);
}

function buildRequest(portfolio: Position[]): Request {
  return new Request("http://localhost/api/holdings", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

// Tests
describe("Integration tests for POST /api/holdings", () => {
  it.each([
    ["Portfolio 1", MOCK_PORTFOLIOS.p1],
    ["Portfolio 2", MOCK_PORTFOLIOS.p2],
    ["Portfolio 3", MOCK_PORTFOLIOS.p3],
    ["Portfolio 4", MOCK_PORTFOLIOS.p4],
  ])("%s: matches the reference calculation over live holdings", async (_label, portfolio) => {
    const response = await POST(buildRequest(portfolio));
    const body = await response.json();

    expect(response.status).toBe(200);

    const expected = getExpectedTopHoldings({ 
      portfolio, 
      prices: MOCK_PRICES, 
      holdings: holdings 
    });

    expect(body.top_holdings).toHaveLength(expected.length);

    expected.forEach((exp, i) => {
      expect(body.top_holdings[i].holding_ticker, `rank ${i + 1}`).toBe(exp.holding_ticker);
      expect(body.top_holdings[i].weight, `${exp.holding_ticker} weight`).toBeCloseTo(exp.weight, 6);
    });
  });
});
