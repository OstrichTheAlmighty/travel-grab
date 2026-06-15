import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const key = (process.env.DUFFEL_API_KEY ?? "").trim();
  return NextResponse.json({
    DUFFEL_MODE:    process.env.DUFFEL_MODE ?? "(not set)",
    DUFFEL_KEY_SET: key.length > 0,
    DUFFEL_KEY_PREFIX: key.length >= 8 ? key.slice(0, 8) : key.slice(0, key.length) || "(empty)",
    NODE_ENV: process.env.NODE_ENV ?? "(not set)",
  });
}
