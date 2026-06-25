import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth-server";
import { getAllUsage, DAILY_LIMITS } from "@/lib/usage";

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    // Return full limits with 0 used for unauthenticated (shouldn't happen — pages are guarded)
    const empty = Object.fromEntries(
      Object.entries(DAILY_LIMITS).map(([f, limit]) => [f, { allowed: true, count: 0, limit, remaining: limit }])
    );
    return NextResponse.json(empty);
  }

  const usage = await getAllUsage(user.id);
  return NextResponse.json(usage);
}
