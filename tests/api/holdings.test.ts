import { describe, expect, it, vi } from "vitest";
import { MOCK_PORTFOLIOS, type Position } from "@/tests/fixtures/portfolio.fixtures";
import { MOCK_HOLDINGS, MOCK_PRICES } from "@/tests/fixtures/db.fixtures";

// --- Mock the DB layer ---------------------------------------------------
// Adjust this specifier if route.ts's import path differs in your repo.
vi.mock("@/utils/postgres", () => ({
  sql: vi.fn((_strings: TemplateStringsArray, ...values: unknown[]) => {
    const tickers = values[0] as string[];
    return Promise.resolve(
      MOCK_HOLDINGS.filter((h) => tickers.includes(h.etf_ticker))
    );
  }),
}));

// --- Mock yahoo-finance2 ---------------------------------------------------
vi.mock("yahoo-finance2", () => ({
  default: vi.fn().mockImplementation(() => ({
    quote: vi.fn(async (ticker: string) => ({
      regularMarketPrice: MOCK_PRICES[ticker],
    })),
  })),
}));

// Adjust this relative path to wherever route.ts actually lives in your
// project (per your project notes, that's app/api/holdings/route.ts).
import { POST } from "../../app/api/holdings/route";

function buildRequest(portfolio: Position[]): Request {
  return new Request("http://localhost/api/holdings", {
    method: "POST",
    body: JSON.stringify(portfolio),
  });
}

interface ExpectedHolding {
  holding_ticker: string;
  exposure_pct: number;
}

async function getTopHoldingsFromRoute(portfolio: Position[]) {
  const response = await POST(buildRequest(portfolio));
  const body = await response.json();
  return { status: response.status, body };
}

function assertTopHoldings(actual: any[], expected: ExpectedHolding[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((exp, i) => {
    expect(actual[i].holding_ticker, `rank ${i + 1}`).toBe(exp.holding_ticker);
    expect(actual[i].exposure_pct, `${exp.holding_ticker} exposure_pct`).toBeCloseTo(
      exp.exposure_pct,
      3
    );
  });
}

describe("POST /api/holdings", () => {
  // Portfolio 1: 500 x VAS.AX only.
  // totalValue = 500 * 100 = 50,000 -> VAS.AX weight = 1.0
  // Every VAS holding's exposure_pct = 1.0 * its own weight, i.e. unchanged.
  // Price-independent: VAS.AX is the only ETF held, so this portfolio's
  // result doesn't change with the IVV/IHVV/NDQ price update.
  it("portfolio 1 (500 VAS.AX): top holdings equal VAS.AX's own top 10", async () => {
    const { status, body } = await getTopHoldingsFromRoute(
      MOCK_PORTFOLIOS.p1
    );
    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "CBA", exposure_pct: 10.0 },
      { holding_ticker: "BHP", exposure_pct: 8.0 },
      { holding_ticker: "CSL", exposure_pct: 6.0 },
      { holding_ticker: "NAB", exposure_pct: 5.0 },
      { holding_ticker: "WBC", exposure_pct: 4.5 },
      { holding_ticker: "ANZ", exposure_pct: 4.0 },
      { holding_ticker: "WES", exposure_pct: 3.5 },
      { holding_ticker: "MQG", exposure_pct: 3.0 },
      { holding_ticker: "TLS", exposure_pct: 2.5 },
      { holding_ticker: "WOW", exposure_pct: 2.0 },
    ]);
  });

  // Portfolio 2: 200 x VAS.AX + 450 x IVV.AX.
  // VAS.AX value = 20,000, IVV.AX value = 450*70 = 31,500, total = 51,500
  // VAS.AX weight = 20,000/51,500 = 0.388350, IVV.AX weight = 31,500/51,500 = 0.611650
  // No overlap between VAS (ASX) and IVV (US) holdings, so no merging.
  // None of IVV.AX's ranks 11-15 (AMD, JNJ, XOM, UNH, HD) are big enough,
  // even at 61% portfolio weight, to crack the top 10 here.
  it("portfolio 2 (200 VAS.AX + 450 IVV.AX): blends AU banks with US mega-caps", async () => {
    const { status, body } = await getTopHoldingsFromRoute(
      MOCK_PORTFOLIOS.p2
    );
    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", exposure_pct: 4.281553 },
      { holding_ticker: "MSFT", exposure_pct: 3.975728 },
      { holding_ticker: "CBA", exposure_pct: 3.883495 },
      { holding_ticker: "NVDA", exposure_pct: 3.669903 },
      { holding_ticker: "BHP", exposure_pct: 3.106796 },
      { holding_ticker: "CSL", exposure_pct: 2.330097 },
      { holding_ticker: "AMZN", exposure_pct: 2.140777 },
      { holding_ticker: "NAB", exposure_pct: 1.941748 },
      { holding_ticker: "WBC", exposure_pct: 1.747573 },
      { holding_ticker: "ANZ", exposure_pct: 1.553398 },
    ]);
  });

  // Portfolio 3: 150 x VAS.AX + 400 x IHVV.AX.
  // VAS.AX value = 15,000, IHVV.AX value = 400*65 = 26,000, total = 41,000
  // VAS.AX weight = 15,000/41,000 = 0.365854
  // IHVV.AX weight = 26,000/41,000 = 0.634146
  // IHVV.AX shares IVV.AX's constituents (same index, hedged).
  it("portfolio 3 (150 VAS.AX + 400 IHVV.AX): AU-heavier blend via the hedged S&P 500 ETF", async () => {
    const { status, body } = await getTopHoldingsFromRoute(
      MOCK_PORTFOLIOS.p3
    );
    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", exposure_pct: 4.439024 },
      { holding_ticker: "MSFT", exposure_pct: 4.121951 },
      { holding_ticker: "NVDA", exposure_pct: 3.804878 },
      { holding_ticker: "CBA", exposure_pct: 3.658537 },
      { holding_ticker: "BHP", exposure_pct: 2.926829 },
      { holding_ticker: "AMZN", exposure_pct: 2.219512 },
      { holding_ticker: "CSL", exposure_pct: 2.195122 },
      { holding_ticker: "NAB", exposure_pct: 1.829268 },
      { holding_ticker: "WBC", exposure_pct: 1.646341 },
      { holding_ticker: "ANZ", exposure_pct: 1.463415 },
    ]);
  });

  // Portfolio 4: 100 x VAS.AX + 275 x NDQ.AX + 500 x IVV.AX.
  // VAS.AX value = 10,000, NDQ.AX value = 275*60 = 16,500, IVV.AX value = 500*70 = 35,000, total = 61,500
  // VAS.AX weight = 10,000/61,500 = 0.162602
  // NDQ.AX weight = 16,500/61,500 = 0.268293
  // IVV.AX weight = 35,000/61,500 = 0.569106
  // NDQ.AX and IVV.AX share several mega-cap tech names (AAPL, MSFT, NVDA,
  // AMZN, META, GOOGL, GOOG, AVGO, TSLA, AMD) — this exercises
  // getTopHoldings' merge branch (existing.exposure_pct += contributionPct).
  //
  // Note: AMD (rank 11 in both NDQ.AX and IVV.AX, never top 10 in either
  // individually) sums to ~1.052% here — real, but it lands at rank 12,
  // just short of this portfolio's actual 10th place (TSLA, ~1.524%, itself
  // boosted by being top-10 in both funds already). See etf-holdings.ts's
  // top comment for the full explanation of why the ceiling for a
  // stays-below-both-cutoffs holding (~1.22%) can't quite clear that bar
  // in this specific blend.
  it("portfolio 4 (100 VAS.AX + 275 NDQ.AX + 500 IVV.AX): merges overlapping tech exposure from NDQ.AX and IVV.AX", async () => {
    const { status, body } = await getTopHoldingsFromRoute(
      MOCK_PORTFOLIOS.p4
    );
    expect(status).toBe(200);
    assertTopHoldings(body.top_holdings, [
      { holding_ticker: "AAPL", exposure_pct: 6.264228 }, // 275*60/61500*8.5 + 500*70/61500*7.0
      { holding_ticker: "MSFT", exposure_pct: 5.845528 },
      { holding_ticker: "NVDA", exposure_pct: 5.426829 },
      { holding_ticker: "AMZN", exposure_pct: 3.333333 },
      { holding_ticker: "META", exposure_pct: 2.077236 },
      { holding_ticker: "AVGO", exposure_pct: 1.926829 },
      { holding_ticker: "GOOGL", exposure_pct: 1.889431 },
      { holding_ticker: "GOOG", exposure_pct: 1.695122 },
      { holding_ticker: "CBA", exposure_pct: 1.626016 }, // 100*100/61500*10.0
      { holding_ticker: "TSLA", exposure_pct: 1.524390 },
    ]);
  });

  // Error path: a ticker with no available price should fail the whole
  // request with a 500, never silently drop the ticker or default to 0.
  it("returns 500 with a descriptive message when a ticker has no price data", async () => {
    const portfolio: Position[] = [
      { ticker: "VAS.AX", shares: 100 },
      { ticker: "FAKE.AX", shares: 50 },
    ];
    const { status, body } = await getTopHoldingsFromRoute(portfolio);
    expect(status).toBe(500);
    expect(body.message).toContain("FAKE.AX");
  });
});