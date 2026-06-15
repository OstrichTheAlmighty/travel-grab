import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    serpapi_present: !!process.env.SERPAPI_API_KEY,
    serpapi_length:  process.env.SERPAPI_API_KEY?.length ?? 0,
    vercel_env:      process.env.VERCEL_ENV  ?? null,
    node_env:        process.env.NODE_ENV    ?? null,
  });
}
