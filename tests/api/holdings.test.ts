/**
 * Unit tests for api/holdings/route.ts
 *
 * This tests on whether the formula behind the logic is correct
 * and producing exact outputs.
 */ 

import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/holdings/route";
import { MOCK_HOLDINGS, MOCK_PRICES } from "@/tests/fixtures/db.fixtures";
import { MOCK_PORTFOLIOS, type Position } from "@/tests/fixtures/portfolio.fixtures";

// Mock DB 
vi.mock("@/utils/postgres", () => ({
  sql: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
    const tickers = values[0] as string[];
    return Promise.resolve(MOCK_HOLDINGS.filter((h) => tickers.includes(h.etf_ticker)));
  }),
}));

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

interface ExpectedHolding {
  holding_ticker: string;
  weight: number; // as a percentage
}

function buildRequest(portfolio: Position[]): Request {
  return new Request("http://localhost/api/holdings", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

async function getTopHoldings(portfolio: Position[]) {
  const response = await POST(buildRequest(portfolio));
  const body = await response.json();
  return { status: response.status, body };
}

function assertTopHoldings(actual: any[], expected: ExpectedHolding[]) {
  expect(actual).toHaveLength(expected.length);

  expected.forEach((exp, i) => {
    expect(actual[i].holding_ticker, `rank ${i + 1}`).toBe(exp.holding_ticker);
    expect(actual[i].weight, `${exp.holding_ticker} pct`).toBeCloseTo(exp.weight, 3);
  });
}

// Tests
describe("Unit tests for POST /api/holdings", () => {
  // The result should match the ETF's underlying exactly
  it("Portfolio 1", async () => {
    const { status, body } = await getTopHoldings(MOCK_PORTFOLIOS.p1);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "CBA", weight: 10.0 },
      { holding_ticker: "BHP", weight: 8.0 },
      { holding_ticker: "CSL", weight: 6.0 },
      { holding_ticker: "NAB", weight: 5.0 },
      { holding_ticker: "WBC", weight: 4.5 },
      { holding_ticker: "ANZ", weight: 4.0 },
      { holding_ticker: "WES", weight: 3.5 },
      { holding_ticker: "MQG", weight: 3.0 },
      { holding_ticker: "TLS", weight: 2.5 },
      { holding_ticker: "WOW", weight: 2.0 },
    ]);
  });

  it("Portfolio 2", async () => {
    const { status, body } = await getTopHoldings(MOCK_PORTFOLIOS.p2);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", weight: 4.281553 },
      { holding_ticker: "MSFT", weight: 3.975728 },
      { holding_ticker: "CBA", weight: 3.883495 },
      { holding_ticker: "NVDA", weight: 3.669903 },
      { holding_ticker: "BHP", weight: 3.106796 },
      { holding_ticker: "CSL", weight: 2.330097 },
      { holding_ticker: "AMZN", weight: 2.140777 },
      { holding_ticker: "NAB", weight: 1.941748 },
      { holding_ticker: "WBC", weight: 1.747573 },
      { holding_ticker: "ANZ", weight: 1.553398 },
    ]);
  });

  it("Portfolio 3", async () => {
    const { status, body } = await getTopHoldings(MOCK_PORTFOLIOS.p3);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", weight: 4.439024 },
      { holding_ticker: "MSFT", weight: 4.121951 },
      { holding_ticker: "NVDA", weight: 3.804878 },
      { holding_ticker: "CBA", weight: 3.658537 },
      { holding_ticker: "BHP", weight: 2.926829 },
      { holding_ticker: "AMZN", weight: 2.219512 },
      { holding_ticker: "CSL", weight: 2.195122 },
      { holding_ticker: "NAB", weight: 1.829268 },
      { holding_ticker: "WBC", weight: 1.646341 },
      { holding_ticker: "ANZ", weight: 1.463415 },
    ]);
  });

  it("Portfolio 4", async () => {
    const { status, body } = await getTopHoldings(MOCK_PORTFOLIOS.p4);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", weight: 6.264228 }, // 275*60/61500*8.5 + 500*70/61500*7.0
      { holding_ticker: "MSFT", weight: 5.845528 },
      { holding_ticker: "NVDA", weight: 5.426829 },
      { holding_ticker: "AMZN", weight: 3.333333 },
      { holding_ticker: "META", weight: 2.077236 },
      { holding_ticker: "AVGO", weight: 1.926829 },
      { holding_ticker: "GOOGL", weight: 1.889431 },
      { holding_ticker: "GOOG", weight: 1.695122 },
      { holding_ticker: "CBA", weight: 1.626016 }, // 100*100/61500*10.0
      { holding_ticker: "TSLA", weight: 1.524390 },
    ]);
  });

  it("Portfolio with fake ticker", async () => {
    const portfolio: Position[] = [
      { ticker: "VAS.AX", shares: 100 },
      { ticker: "FAKE.AX", shares: 50 },
    ];

    const { status, body } = await getTopHoldings(portfolio);

    expect(status).toBe(500);
    expect(body.message).toContain("FAKE.AX");
  });
});
