/**
 * Unit tests for api/portfolio/route.ts
 *
 * This tests on whether the math behind the logic is correct on producing exact outputs.
 */ 

import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/portfolio/route";
import { type Position, MOCK_HOLDINGS, MOCK_PORTFOLIOS, mockQuote } from "@/tests/fixtures";

// Mock DB 
vi.mock("@/utils/postgres", () => ({
  sql: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
    const tickers = values[0] as string[];
    return Promise.resolve(MOCK_HOLDINGS.filter((h) => tickers.includes(h.etf_ticker)));
  }),
}));

// Mock Yahoo Finance
const { quote } = vi.hoisted(() => ({ quote: vi.fn() }));

vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(function () {
    return { quote };
  }),
}));

interface ExpectedHolding {
  holding_ticker: string;
  weight: number; // as a percentage
}

function buildRequest(portfolio: unknown): Request {
  return new Request("http://localhost/api/portfolio", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

async function postPortfolio(portfolio: unknown) {
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

beforeEach(() => {
  quote.mockReset();
  quote.mockImplementation(mockQuote);
});

// Input Validation
describe("Input validation", () => {
  it("rejects a body that isn't valid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/portfolio", { method: "POST", body: "not json" })
    );
    expect(response.status).toBe(400);
  });

  it.each([
    ["an object", { ticker: "VAS.AX", shares: 100 }],
    ["an empty array", []],
    ["null", null],
  ])("rejects a body that is %s", async (_label, body) => {
    expect((await postPortfolio(body)).status).toBe(400);
  });

  it.each([
    ["a missing ticker", [{ shares: 100 }]],
    ["a blank ticker", [{ ticker: "  ", shares: 100 }]],
    ["a non-string ticker", [{ ticker: 123, shares: 100 }]],
    ["zero shares", [{ ticker: "VAS.AX", shares: 0 }]],
    ["negative shares", [{ ticker: "VAS.AX", shares: -5 }]],
    ["string shares", [{ ticker: "VAS.AX", shares: "100" }]],
    ["null shares", [{ ticker: "VAS.AX", shares: null }]],
    ["a null position", [null]],
  ])("rejects a position with %s", async (_label, body) => {
    expect((await postPortfolio(body)).status).toBe(400);
  });

  it("merges duplicate tickers by summing their shares", async () => {
    const merged = await postPortfolio([
      { ticker: "VAS.AX", shares: 200 },
      { ticker: "VAS.AX", shares: 300 },
    ]);
    const single = await postPortfolio(MOCK_PORTFOLIOS.p1); // 500 shares

    expect(merged.status).toBe(200);
    expect(merged.body.top_holdings).toEqual(single.body.top_holdings);
  });

  it("normalises ticker case and whitespace", async () => {
    const { status, body } = await postPortfolio([{ ticker: " vas.ax ", shares: 500 }]);
    const single = await postPortfolio(MOCK_PORTFOLIOS.p1);

    expect(status).toBe(200);
    expect(body.top_holdings).toEqual(single.body.top_holdings);
  });
});

// YF & DB Failure Testing
describe("Pricing failures", () => {
  it.each([
    ["no quote at all", []],
    ["a zero price", [{ symbol: "VAS.AX", regularMarketPrice: 0 }]],
  ])("fails when Yahoo returns %s", async (_label, quotes) => {
    quote.mockResolvedValueOnce(quotes);

    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p1);

    expect(status).toBe(500);
    expect(body.message).toContain("VAS.AX");
  });

  it("matches quotes to tickers by symbol, not by position", async () => {
    const baseline = await postPortfolio(MOCK_PORTFOLIOS.p2);

    quote.mockImplementationOnce(async (symbols: string[]) =>
      (await mockQuote(symbols)).reverse()
    );
    const reversed = await postPortfolio(MOCK_PORTFOLIOS.p2);

    expect(reversed.body.top_holdings).toEqual(baseline.body.top_holdings);
  });

  it("returns a 500 with the message when Yahoo throws", async () => {
    quote.mockRejectedValueOnce(new Error("Yahoo unavailable"));

    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p1);

    expect(status).toBe(500);
    expect(body.message).toBe("Yahoo unavailable");
  });
});

describe("Unit tests for POST /api/portfolio", () => {
  // The result should match the ETF's underlying exactly
  it("Portfolio 1", async () => {
    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p1);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      {
        holding_ticker: "CBA",
        weight: 10.0
      },
      {
        holding_ticker: "BHP",
        weight: 8.0
      },
      {
        holding_ticker: "CSL",
        weight: 6.0
      },
      {
        holding_ticker: "NAB",
        weight: 5.0
      },
      {
        holding_ticker: "WBC",
        weight: 4.5
      },
      {
        holding_ticker: "ANZ",
        weight: 4.0
      },
      {
        holding_ticker: "WES",
        weight: 3.5
      },
      {
        holding_ticker: "MQG",
        weight: 3.0
      },
      {
        holding_ticker: "TLS",
        weight: 2.5
      },
      {
        holding_ticker: "WOW",
        weight: 2.0
      },
    ]);
  });

  it("Portfolio 2", async () => {
    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p2);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      {
        holding_ticker: "AAPL",
        weight: 4.281553
      },
      {
        holding_ticker: "MSFT",
        weight: 3.975728
      },
      {
        holding_ticker: "CBA",
        weight: 3.883495
      },
      {
        holding_ticker: "NVDA",
        weight: 3.669903
      },
      {
        holding_ticker: "BHP",
        weight: 3.106796
      },
      {
        holding_ticker: "CSL",
        weight: 2.330097
      },
      {
        holding_ticker: "AMZN",
        weight: 2.140777
      },
      {
        holding_ticker: "NAB",
        weight: 1.941748
      },
      {
        holding_ticker: "WBC",
        weight: 1.747573
      },
      {
        holding_ticker: "ANZ",
        weight: 1.553398
      },
    ]);
  });

  it("Portfolio 3", async () => {
    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p3);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      {
        holding_ticker: "AAPL",
        weight: 4.439024
      },
      {
        holding_ticker: "MSFT",
        weight: 4.121951
      },
      {
        holding_ticker: "NVDA",
        weight: 3.804878
      },
      {
        holding_ticker: "CBA",
        weight: 3.658537
      },
      {
        holding_ticker: "BHP",
        weight: 2.926829
      },
      {
        holding_ticker: "AMZN",
        weight: 2.219512
      },
      {
        holding_ticker: "CSL",
        weight: 2.195122
      },
      {
        holding_ticker: "NAB",
        weight: 1.829268
      },
      {
        holding_ticker: "WBC",
        weight: 1.646341
      },
      {
        holding_ticker: "ANZ",
        weight: 1.463415
      },
    ]);
  });

  it("Portfolio 4", async () => {
    const { status, body } = await postPortfolio(MOCK_PORTFOLIOS.p4);

    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      {
        holding_ticker: "AAPL",
        weight: 6.264228
      },
      {
        holding_ticker: "MSFT",
        weight: 5.845528
      },
      {
        holding_ticker: "NVDA",
        weight: 5.426829
      },
      {
        holding_ticker: "AMZN",
        weight: 3.333333
      },
      {
        holding_ticker: "META",
        weight: 2.077236
      },
      {
        holding_ticker: "AVGO",
        weight: 1.926829
      },
      {
        holding_ticker: "GOOGL",
        weight: 1.889431
      },
      {
        holding_ticker: "GOOG",
        weight: 1.695122
      },
      {
        holding_ticker: "CBA",
        weight: 1.626016
      },
      {
        holding_ticker: "TSLA",
        weight: 1.524390
      },
    ]);
  });

  it("returns full holding details and a timestamp", async () => {
    const { body } = await postPortfolio(MOCK_PORTFOLIOS.p1);

    expect(body.top_holdings[0]).toEqual({
      holding_ticker: "CBA",
      holding_name: "Commonwealth Bank of Australia",
      sector: "Financials",
      country: "Australia",
      weight: expect.closeTo(10.0, 3),
    });
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("Portfolio with unsupported ticker", async () => {
    const portfolio: Position[] = [
      { ticker: "VAS.AX", shares: 100 },
      { ticker: "FAKE.AX", shares: 50 },
    ];

    const { status, body } = await postPortfolio(portfolio);

    expect(status).toBe(500);
    expect(body.message).toContain("FAKE.AX");
  });
});
