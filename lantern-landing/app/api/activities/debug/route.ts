/**
 * GET /api/activities/debug
 * Development-only endpoint: returns the Places API call log for this server process.
 * Add ?clear=1 to reset the log.
 */
import { NextRequest, NextResponse } from "next/server";
import { PLACES_API_LOG, purgeExpiredCache } from "../_inventoryCache";
import { getGoogleUsageSnapshot, resetGoogleUsageForTests } from "@/lib/activities/google-usage";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production" && process.env.DEBUG_PLACES !== "1") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);

  if (searchParams.get("clear") === "1") {
    PLACES_API_LOG.length = 0;
    resetGoogleUsageForTests();
    return NextResponse.json({ cleared: true });
  }

  if (searchParams.get("purge") === "1") {
    const result = await purgeExpiredCache();
    return NextResponse.json({ purged: result });
  }

  const cacheMisses = PLACES_API_LOG.filter((l) => !l.cacheHit).length;
  const cacheHits   = PLACES_API_LOG.filter((l) => l.cacheHit).length;

  return NextResponse.json({
    total:      PLACES_API_LOG.length,
    cacheMisses,
    cacheHits,
    hitRate:    PLACES_API_LOG.length > 0 ? Math.round((cacheHits / PLACES_API_LOG.length) * 100) : 0,
    counters:   getGoogleUsageSnapshot(),
    log:        PLACES_API_LOG.slice(-50),  // last 50 calls
  });
}
