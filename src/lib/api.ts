import { NextResponse } from "next/server";
import { Position, Row } from "@/types/api";
import { sql } from "@/utils/postgres";
import YahooFinance from "yahoo-finance2";

export interface PortfolioData {
  portfolio: Position[];
  prices: Map<string, number>;
  holdings: Row[];
}

// A holding row from one ETF, with `weight` rescaled to its share of the whole portfolio
export type Contribution = Row;

// Fetch ETF holdings and live prices for every ticker in the portfolio
export async function loadPortfolioData(portfolio: Position[]): Promise<PortfolioData> {
  const tickers = portfolio.map(p => p.ticker);
  const yf = new YahooFinance();

  const [holdings, quotes] = await Promise.all([
    sql<Row[]>`
      SELECT etf_ticker, holding_ticker, holding_name,
        sector, country, currency, weight
      FROM etf_holdings
      WHERE etf_ticker = ANY(${tickers})
    `,
    Promise.all(tickers.map(ticker => yf.quote(ticker))),
  ]);

  const prices = new Map<string, number>();
  const missing: string[] = [];

  tickers.forEach((ticker, i) => {
    const price = quotes[i].regularMarketPrice;
    if (price) prices.set(ticker, price);
    else missing.push(ticker);
  });

  // Fail loudly: a missing price would silently skew every exposure figure
  if (missing.length > 0) {
    throw new Error(`No pricing data available for: ${missing.join(", ")}`);
  }

  return { portfolio, prices, holdings };
}

// Rescale each ETF holding row so `weight` is its share of the whole portfolio
export function getContributions({ portfolio, prices, holdings }: PortfolioData): Contribution[] {
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
export function groupBy(contributions: Contribution[], field: "sector" | "country" | "currency") {
  const totals = new Map<string, number>();

  for (const c of contributions) {
    totals.set(c[field], (totals.get(c[field]) ?? 0) + c.weight);
  }

  return [...totals]
    .map(([name, weight]) => ({ name, weight }))
    .sort((a, b) => b.weight - a.weight);
}

// Builds a POST handler: parse portfolio -> load data -> compute -> respond
export function exposureRoute<T>(
  responseKey: string,
  compute: (contributions: Contribution[]) => T
) {
  return async function POST(request: Request) {
    try {
      const portfolio: Position[] = await request.json();
      const data = await loadPortfolioData(portfolio);

      return NextResponse.json({
        [responseKey]: compute(getContributions(data)),
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return NextResponse.json(
        { message: (error as Error).message },
        { status: 500 }
      );
    }
  };
}
