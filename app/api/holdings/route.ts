import { NextResponse } from "next/server"
import { sql } from "@/utils/postgres"
import YahooFinance from "yahoo-finance2"

interface HoldingsProps {
  portfolio: Position[],
  prices: Map<string, number>,
  holdings: Row[],
  n?: number
}

interface Holding {
  holding_ticker: string;
  holding_name: string;
  sector: string;
  country: string;
  exposure_pct: number;
}

interface Position {
  ticker: string;
  shares: number;
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

function getTopHoldings({ portfolio, prices, holdings, n = 10 }: HoldingsProps) {
  // Find value of each position and total portfolio value
  const values = portfolio.map(position => position.shares * prices.get(position.ticker)!);
  const totalValue = values.reduce((sum, value) => sum + value, 0);

  if (totalValue === 0) {
    return [];
  }

  const weightByTicker = new Map(
    portfolio.map((p, i) => [p.ticker, values[i] / totalValue])
  );

  const aggregated = holdings.reduce((acc, h) => {
    const portfolioWeight = weightByTicker.get(h.etf_ticker) ?? 0;
    const contributionPct = portfolioWeight * h.weight;
    const existing = acc.get(h.holding_ticker);

    if (existing) {
      existing.exposure_pct += contributionPct;

    } else {
      acc.set(h.holding_ticker, {
        holding_ticker: h.holding_ticker,
        holding_name: h.holding_name,
        sector: h.sector,
        country: h.country,
        exposure_pct: contributionPct,
      });
    }

    return acc;
  }, new Map<string, Holding>());

  return [...aggregated.values()]
    .sort((a, b) => b.exposure_pct - a.exposure_pct).slice(0, n);
}

export async function POST(request: Request) {
  try {
    const portfolio: Position[] = await request.json();
    const tickers = portfolio.map(position => position.ticker);

    const holdings = await sql<Row[]>`
      SELECT etf_ticker, holding_ticker, holding_name,
        sector, country, currency, weight
      FROM etf_holdings
      WHERE etf_ticker = ANY(${tickers})
    `;

    const yf = new YahooFinance();
    const quotes = await Promise.all(tickers.map(ticker => yf.quote(ticker)));
    const prices = new Map(tickers.map((ticker, i) => [ticker, quotes[i].regularMarketPrice]));

    const missing = tickers.filter(ticker => !prices.get(ticker));
    
    if (missing.length > 0) {
      throw new Error(`No price available for: ${missing.join(", ")}`);
    }

    const topHoldings = getTopHoldings({ portfolio, prices, holdings });

    return NextResponse.json({
      status: 200,
      top_holdings: topHoldings,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      message: (error as Error).message
    }, {
      status: 500
    });
  }
}
