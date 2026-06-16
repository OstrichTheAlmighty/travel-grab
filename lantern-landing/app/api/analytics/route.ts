import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json() as { event?: string; props?: unknown; ts?: number };
    console.log(`[analytics] event=${body.event ?? "unknown"}`, JSON.stringify(body.props ?? {}));
  } catch {
    // ignore malformed payloads
  }
  return NextResponse.json({ ok: true });
}
