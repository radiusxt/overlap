import { NextResponse } from "next/server";
import { HoldingsProps, Holding, Position, Row } from "@/types";
import { sql } from "@/utils";
import YahooFinance from "yahoo-finance2";

export async function POST(request: Request) {
  return NextResponse.json({
    status: 200,
    timestamp: new Date().toISOString(),
  });
}
