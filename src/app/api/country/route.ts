import { NextResponse } from "next/server";
import { HoldingsProps, Holding, Position, Row } from "@/types/api";
import { sql } from "@/utils/postgres";

export async function GET() {
  return NextResponse.json({
    status: 200,
    timestamp: new Date().toISOString(),
  });
}
