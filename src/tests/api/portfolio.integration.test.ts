/**
 * Integration tests for api/portfolio/route.ts
 * 
 * This tests whether the pipeline from SQL query to
 * ticker matching behave the way the code assumes.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/portfolio/route";
import { type Position, MOCK_PORTFOLIOS, MOCK_PRICES, mockQuote } from "@/tests/fixtures";
import { sql } from "@/utils/postgres";

// Mock Yahoo Finance
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(function () {
    return { quote: vi.fn(mockQuote) };
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
  return new Request("http://localhost/api/portfolio", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

// Tests

describe("Integration tests for POST /api/portfolio", () => {
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

  it("returns a well-formed ranking for live holdings", async () => {
    const response = await POST(buildRequest(MOCK_PORTFOLIOS.p4));
    const { top_holdings } = await response.json();
    const weights: number[] = top_holdings.map((h: { weight: number }) => h.weight);

    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(weights.every((w) => w > 0)).toBe(true);
    // Shares of the portfolio can't exceed 100%; small tolerance for issuer rounding
    expect(weights.reduce((sum, w) => sum + w, 0)).toBeLessThanOrEqual(100.5);
  });

  it("rejects an ETF with no live holdings", async () => {
    const response = await POST(buildRequest([{ ticker: "FAKE.AX", shares: 10 }]));
    expect(response.status).toBe(500);
  });
});
