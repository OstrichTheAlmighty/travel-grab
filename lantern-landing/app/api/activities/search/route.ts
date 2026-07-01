import { NextRequest, NextResponse } from "next/server";
import { getUserFromRequest, isAdminRequest } from "@/lib/auth-server";
import { checkUsage, incrementUsage } from "@/lib/usage";
import type { ActivitySearchApiResponse } from "@/lib/activities/activity-search-state";
import { hasFsqCity, loadFsqCity } from "@/lib/activities/fsq-supabase-reader";

export const runtime = "nodejs";
export const maxDuration = 300;

function cityNotBuiltPayload(destination: string): ActivitySearchApiResponse {
  const parts = destination.split(",").map((part) => part.trim()).filter(Boolean);
  return {
    error: "This city catalog has not been built yet.",
    cityNotBuilt: true,
    requestedDestination: destination,
    city: parts[0] ?? destination,
    country: parts.slice(1).join(", "),
    source: "catalog_unavailable",
    activities: [],
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const destination = (req.nextUrl.searchParams.get("destination") ?? "").trim();
  if (!destination) {
    return NextResponse.json({ error: "destination is required" }, { status: 400 });
  }

  // Per-user daily quota (skipped for admin)
  if (!isAdminRequest(req)) {
    const authUser = await getUserFromRequest(req);
    if (authUser) {
      const { allowed, count, limit } = await checkUsage(authUser.id, "activities");
      if (!allowed) {
        return NextResponse.json(
          { error: `Daily limit reached — ${count}/${limit} activity searches used today. Resets at midnight UTC.`, limitReached: true },
          { status: 429 }
        );
      }
      incrementUsage(authUser.id, "activities");
    }
  }

  // All cities are served from the FSQ pre-built Supabase catalog.
  const fsqCityAvailable = await hasFsqCity(destination);
  if (fsqCityAvailable) {
    const fsqResult = await loadFsqCity(destination);
    if (fsqResult && fsqResult.activities.length > 0) {
      console.log(`[activities/search] FSQ catalog: "${destination}" (${fsqResult.activities.length} activities)`);
      return NextResponse.json({
        activities:      fsqResult.activities,
        city:            fsqResult.city,
        country:         fsqResult.country,
        source:          "fsq_supabase",
        inventoryStatus: "ready" as const,
        inventorySize:   fsqResult.activities.length,
      } satisfies ActivitySearchApiResponse);
    }
  }

  return NextResponse.json(cityNotBuiltPayload(destination), { status: 404 });
}
