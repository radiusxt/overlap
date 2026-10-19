import { NextResponse } from "next/server"
import { sql } from "@/utils/postgres"

export async function GET() {
  return NextResponse.json({
    status: 200,
    timestamp: new Date().toISOString(),
  });
}
