import { NextResponse } from "next/server";
import { parse, loadPortfolio, getContributions, getTopHoldings, groupBy } from "@/lib";
import { Position } from "@/types";

// Returns different groupings of underlying holdings in a portfolio
export async function POST(request: Request) {
  let portfolio: Position[];

  try {
    portfolio = parse(await request.json());
  } catch (error) {
    return NextResponse.json({ message: (error as Error).message }, { status: 400 });
  }

  try {
    const contributions = getContributions(await loadPortfolio(portfolio));

    return NextResponse.json({
      top_holdings: getTopHoldings(contributions),
      sectors: groupBy(contributions, "sector"),
      countries: groupBy(contributions, "country"),
      currencies: groupBy(contributions, "currency"),
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json(
      { message: (error as Error).message },
      { status: 500 }
    );
  }
}
