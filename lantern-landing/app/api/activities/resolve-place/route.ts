import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// GET /api/activities/resolve-place?name=X&lat=Y&lng=Z&fsq_id=A
//
// Resolves an FSQ activity to its Google Place ID via Text Search.
// Caches result to Supabase (google_places_data.google_place_id) so subsequent
// modal opens skip the API call. Also caches first photo resource name.
//
// Returns: { googlePlaceId?: string; photoUrl?: string }

const memCache = new Map<string, { googlePlaceId: string; photoUrl?: string; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Supabase env vars not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name  = searchParams.get("name") ?? "";
  const lat   = parseFloat(searchParams.get("lat") ?? "");
  const lng   = parseFloat(searchParams.get("lng") ?? "");
  const fsqId = searchParams.get("fsq_id") ?? "";

  if (!name || isNaN(lat) || isNaN(lng) || !fsqId) {
    return NextResponse.json({ error: "name, lat, lng, fsq_id required" }, { status: 400 });
  }

  const placeId = `fsq:${fsqId}`;

  // Memory cache
  const hit = memCache.get(placeId);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return NextResponse.json({ googlePlaceId: hit.googlePlaceId, photoUrl: hit.photoUrl });
  }

  // Supabase cache
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("activities")
      .select("google_places_data")
      .eq("place_id", placeId)
      .single();

    const gd = (data?.google_places_data ?? {}) as Record<string, unknown>;
    if (gd.google_place_id) {
      const result = {
        googlePlaceId: gd.google_place_id as string,
        photoUrl: (gd.photo_url as string | undefined),
        ts: Date.now(),
      };
      memCache.set(placeId, result);
      return NextResponse.json({ googlePlaceId: result.googlePlaceId, photoUrl: result.photoUrl });
    }
  } catch {
    // Non-fatal — fall through to Google API
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Google Places API key not configured" }, { status: 503 });
  }

  try {
    const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.id,places.photos",
      },
      body: JSON.stringify({
        textQuery: name,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 500.0,
          },
        },
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) {
      console.error(`[resolve-place] Google Text Search HTTP ${resp.status} for "${name}"`);
      return NextResponse.json({});
    }

    const body = await resp.json() as {
      places?: Array<{ id: string; photos?: Array<{ name: string }> }>;
    };
    const place = body.places?.[0];
    if (!place?.id) {
      console.log(`[resolve-place] No match for "${name}" near ${lat},${lng}`);
      return NextResponse.json({});
    }

    const googlePlaceId = place.id;
    const photoUrl = place.photos?.[0]?.name ?? undefined;

    // Write-back to Supabase (read-modify-write; race is benign — same value)
    try {
      const sb = getSupabase();
      const { data: row } = await sb
        .from("activities")
        .select("google_places_data")
        .eq("place_id", placeId)
        .single();

      const existing = (row?.google_places_data ?? {}) as Record<string, unknown>;
      await sb.from("activities").update({
        google_places_data: {
          ...existing,
          google_place_id: googlePlaceId,
          ...(photoUrl ? { photo_url: photoUrl } : {}),
        },
      }).eq("place_id", placeId);
    } catch {
      // Cache write failure is non-fatal
    }

    const result = { googlePlaceId, photoUrl, ts: Date.now() };
    memCache.set(placeId, result);
    console.log(`[resolve-place] "${name}" → ${googlePlaceId}`);
    return NextResponse.json({ googlePlaceId, photoUrl });
  } catch (err) {
    console.error("[resolve-place] error:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({});
  }
}
