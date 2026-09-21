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
describe("POST /api/holdings", () => {
  // Portfolio 1: 500 x VAS.AX only.
  // totalValue = 500 * 100 = 50,000 -> VAS.AX weight = 1.0
  // Every VAS holding's weight = 1.0 * its own weight, i.e. unchanged.
  // Price-independent: VAS.AX is the only ETF held, so this portfolio's
  // result doesn't change with the IVV/IHVV/NDQ price update.
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

  // Portfolio 2: 200 x VAS.AX + 450 x IVV.AX.
  // VAS.AX value = 20,000, IVV.AX value = 450*70 = 31,500, total = 51,500
  // VAS.AX weight = 20,000/51,500 = 0.388350, IVV.AX weight = 31,500/51,500 = 0.611650
  // No overlap between VAS (ASX) and IVV (US) holdings, so no merging.
  // None of IVV.AX's ranks 11-15 (AMD, JNJ, XOM, UNH, HD) are big enough,
  // even at 61% portfolio weight, to crack the top 10 here.
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

  // Portfolio 3: 150 x VAS.AX + 400 x IHVV.AX.
  // VAS.AX value = 15,000, IHVV.AX value = 400*65 = 26,000, total = 41,000
  // VAS.AX weight = 15,000/41,000 = 0.365854
  // IHVV.AX weight = 26,000/41,000 = 0.634146
  // IHVV.AX shares IVV.AX's constituents (same index, hedged).
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

  // Portfolio 4: 100 x VAS.AX + 275 x NDQ.AX + 500 x IVV.AX.
  // VAS.AX value = 10,000, NDQ.AX value = 275*60 = 16,500, IVV.AX value = 500*70 = 35,000, total = 61,500
  // VAS.AX weight = 10,000/61,500 = 0.162602
  // NDQ.AX weight = 16,500/61,500 = 0.268293
  // IVV.AX weight = 35,000/61,500 = 0.569106
  // NDQ.AX and IVV.AX share several mega-cap tech names (AAPL, MSFT, NVDA,
  // AMZN, META, GOOGL, GOOG, AVGO, TSLA, AMD) — this exercises
  // getTopHoldings' merge branch (existing.weight += contributionPct).
  //
  // Note: AMD (rank 11 in both NDQ.AX and IVV.AX, never top 10 in either
  // individually) sums to ~1.052% here — real, but it lands at rank 12,
  // just short of this portfolio's actual 10th place (TSLA, ~1.524%, itself
  // boosted by being top-10 in both funds already). See etf-holdings.ts's
  // top comment for the full explanation of why the ceiling for a
  // stays-below-both-cutoffs holding (~1.22%) can't quite clear that bar
  // in this specific blend.
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
