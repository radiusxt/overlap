import { describe, expect, it } from "vitest";
import { getContributions, getTopHoldings } from "@/lib/api";

const row = (holding_ticker: string, weight: number, etf_ticker = "A") => ({
  etf_ticker, holding_ticker, holding_name: holding_ticker,
  sector: "S", country: "C", currency: "AUD", weight,
});

describe("getTopHoldings", () => {
  const rows = [row("X", 5), row("Y", 4), row("Z", 3)];

  it("respects n", () => {
    expect(getTopHoldings(rows, 2).map(h => h.holding_ticker)).toEqual(["X", "Y"]);
  });

  it("returns everything when n exceeds the number of holdings", () => {
    expect(getTopHoldings(rows, 10)).toHaveLength(3);
  });

  it("sums the same holding across ETFs", () => {
    const result = getTopHoldings([row("X", 3, "A"), row("X", 4, "B")]);
    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(7);
  });

  it("returns an empty list for no rows", () => {
    expect(getTopHoldings([])).toEqual([]);
  });
});

describe("getContributions", () => {
  it("returns nothing when the portfolio has no value", () => {
    expect(getContributions({
      portfolio: [], prices: new Map(), holdings: [row("X", 5)]
    })).toEqual([]);
  });
});
