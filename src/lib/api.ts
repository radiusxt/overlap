import { PortfolioProps, Holding, Position, Row } from "@/types";
import { sql } from "@/utils/postgres";
import YahooFinance from "yahoo-finance2";

// Validate raw request JSON and normalise it into a clean portfolio
export function parse(input: unknown): Position[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error(`Portfolio must be an array.`);
  }

  const sharesByTicker = new Map<string, number>();

  for (const p of input) {
    const ticker = typeof p?.ticker === "string" ? p.ticker.trim().toUpperCase() : "";

    if (!ticker || !Number.isFinite(p.shares) || p.shares <= 0) {
      throw new Error(`Invalid position: ${JSON.stringify(p)}`);
    }

    // Merge duplicate tickers by summing their shares
    sharesByTicker.set(ticker, (sharesByTicker.get(ticker) ?? 0) + p.shares);
  }

  return [...sharesByTicker].map(([ticker, shares]) => ({ ticker, shares }));
}

// Fetch ETF holdings and live prices for every ticker in the portfolio
export async function loadPortfolio(portfolio: Position[]): Promise<PortfolioProps> {
  const tickers = portfolio.map(p => p.ticker);
  const yf = new YahooFinance();

  const [holdings, quotes] = await Promise.all([
    sql<Row[]>`
      SELECT etf_ticker, holding_ticker, holding_name, sector, country, currency, weight
      FROM etf_holdings
      WHERE etf_ticker = ANY(${tickers})
    `,
    yf.quote(tickers),
  ]);

  const prices = new Map<string, number>();
  const covered = new Set(holdings.map(h => h.etf_ticker));
  const unsupported = tickers.filter(ticker => !covered.has(ticker));

  if (unsupported.length > 0) {
    throw new Error(`
      These ETFs are currently unsupported and have no holdings data available,
      ${unsupported.join(", ")}
    `);
  }

  for (const q of quotes) {
    if (q.regularMarketPrice) {
      prices.set(q.symbol, q.regularMarketPrice);
    }
  }

  // If a ticker is missed, fail loudly since it throws off exposure calculations
  const missing = tickers.filter(ticker => !prices.has(ticker));

  if (missing.length > 0) {
    throw new Error(`No pricing data available for: ${missing.join(", ")}`);
  }

  return { portfolio, prices, holdings };
}

// Returns the top n underlying holdings
export function getTopHoldings(contributions: Row[], n = 10) {
  const byTicker = new Map<string, Holding>();

  for (const c of contributions) {
    const existing = byTicker.get(c.holding_ticker);

    if (existing) {
      existing.weight += c.weight;
    } else {
      byTicker.set(c.holding_ticker, {
        holding_ticker: c.holding_ticker,
        holding_name: c.holding_name,
        sector: c.sector,
        country: c.country,
        weight: c.weight,
      });
    }
  }

  return [...byTicker.values()].sort((a, b) => b.weight - a.weight).slice(0, n);
}

// Rescale each ETF holding row so its `weight` is its share of the whole portfolio
export function getContributions({ portfolio, prices, holdings }: PortfolioProps): Row[] {
  const values = new Map(
    portfolio.map(p => [p.ticker, p.shares * prices.get(p.ticker)!])
  );

  const totalValue = [...values.values()].reduce((sum, v) => sum + v, 0);

  if (totalValue === 0) {
    return [];
  }

  return holdings.map(h => ({
    ...h,
    weight: ((values.get(h.etf_ticker) ?? 0) / totalValue) * h.weight,
  }));
}

// Sum contributions by sector, country or currency, largest first
export function groupBy(contributions: Row[], field: "sector" | "country" | "currency") {
  const totals = new Map<string, number>();

  for (const c of contributions) {
    totals.set(c[field], (totals.get(c[field]) ?? 0) + c.weight);
  }

  return [...totals].map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight);
}
