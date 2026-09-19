import { NextResponse } from "next/server"
import { sql } from "@/utils/postgres"

export async function GET() {
  try {
    const result = await sql `SELECT count(*) FROM etf_holdings`

    return NextResponse.json({
      status: 200,
      holdings_count: result[0].count,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    return NextResponse.json({
      message: (error as Error).message
    },
    {
      status: 500
    });
  }
}
