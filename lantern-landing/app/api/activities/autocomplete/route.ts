import { NextRequest, NextResponse } from "next/server";

// POST /api/activities/autocomplete
// Body: { input: string }
// Proxies to Places API (New) :autocomplete, returning city/region/country suggestions.
// The API key never leaves the server.

const acCache = new Map<string, { suggestions: unknown[]; ts: number }>();
const AC_TTL = 5 * 60 * 1000;

interface AutocompleteSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
    types?: string[];
  };
  queryPrediction?: unknown;
}

interface AutocompleteResponse {
  suggestions?: AutocompleteSuggestion[];
  error?: { message: string; code: number; status: string };
}

// Geographic types we accept — excludes pure businesses/establishments
const GEO_TYPES = new Set([
  "locality",
  "sublocality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "political",
  "neighborhood",
  "postal_town",
  "colloquial_area",
  "natural_feature",
  "archipelago",
  "continent",
]);

function isGeoSuggestion(types: string[] | undefined): boolean {
  if (!types || types.length === 0) return true; // keep if unknown
  return types.some((t) => GEO_TYPES.has(t));
}

export async function POST(req: NextRequest) {
  let input = "";
  try {
    const body = await req.json() as { input?: unknown };
    input = typeof body.input === "string" ? body.input.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!input) {
    return NextResponse.json({ suggestions: [] });
  }

  const apiKey = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 503 });
  }

  const cacheKey = input.toLowerCase();
  if (acCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of acCache) {
      if (now - v.ts > AC_TTL) acCache.delete(k);
    }
  }
  const cachedAc = acCache.get(cacheKey);
  if (cachedAc && Date.now() - cachedAc.ts < AC_TTL) {
    return NextResponse.json({ suggestions: cachedAc.suggestions });
  }

  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        languageCode: "en",
        includedPrimaryTypes: ["(regions)"],
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[activities/autocomplete] HTTP ${res.status} body="${body.slice(0, 300)}"`);
      return NextResponse.json({ suggestions: [] });
    }

    const data = await res.json() as AutocompleteResponse;
    const raw = data.suggestions ?? [];

    const suggestions = raw
      .filter((s) => s.placePrediction != null)
      .filter((s) => isGeoSuggestion(s.placePrediction?.types))
      .slice(0, 6)
      .map((s) => {
        const pp = s.placePrediction!;
        return {
          placeId:       pp.placeId ?? "",
          text:          pp.text?.text ?? "",
          mainText:      pp.structuredFormat?.mainText?.text ?? pp.text?.text ?? "",
          secondaryText: pp.structuredFormat?.secondaryText?.text ?? "",
        };
      });

    acCache.set(cacheKey, { suggestions, ts: Date.now() });
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("[activities/autocomplete] error", err);
    return NextResponse.json({ suggestions: [] });
  }
}
