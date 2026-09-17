import { NextResponse } from "next/server"
import { sql } from "@/lib/postgres"

export async function GET() {
  return NextResponse.json({
    status: 200,
    timestamp: new Date().toISOString(),
  });
}
