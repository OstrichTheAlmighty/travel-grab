import { NextResponse } from "next/server";

export const runtime = "edge";

// ── Local city fallback ───────────────────────────────────────────────────────
// Used when GOOGLE_PLACES_API_KEY is absent or the Places call fails.

const LOCAL_CITIES: Array<{ city: string; country: string }> = [
  { city: "Amsterdam",      country: "Netherlands" },
  { city: "Athens",         country: "Greece" },
  { city: "Bangkok",        country: "Thailand" },
  { city: "Barcelona",      country: "Spain" },
  { city: "Beijing",        country: "China" },
  { city: "Berlin",         country: "Germany" },
  { city: "Bali",           country: "Indonesia" },
  { city: "Buenos Aires",   country: "Argentina" },
  { city: "Cairo",          country: "Egypt" },
  { city: "Cape Town",      country: "South Africa" },
  { city: "Chicago",        country: "United States" },
  { city: "Copenhagen",     country: "Denmark" },
  { city: "Dubai",          country: "United Arab Emirates" },
  { city: "Dublin",         country: "Ireland" },
  { city: "Edinburgh",      country: "Scotland" },
  { city: "Florence",       country: "Italy" },
  { city: "Hong Kong",      country: "China" },
  { city: "Istanbul",       country: "Turkey" },
  { city: "Kyoto",          country: "Japan" },
  { city: "Las Vegas",      country: "United States" },
  { city: "Lisbon",         country: "Portugal" },
  { city: "London",         country: "United Kingdom" },
  { city: "Los Angeles",    country: "United States" },
  { city: "Madrid",         country: "Spain" },
  { city: "Marrakech",      country: "Morocco" },
  { city: "Miami",          country: "United States" },
  { city: "Milan",          country: "Italy" },
  { city: "Montreal",       country: "Canada" },
  { city: "Mumbai",         country: "India" },
  { city: "Munich",         country: "Germany" },
  { city: "Nashville",      country: "United States" },
  { city: "New Orleans",    country: "United States" },
  { city: "New York",       country: "United States" },
  { city: "Osaka",          country: "Japan" },
  { city: "Paris",          country: "France" },
  { city: "Prague",         country: "Czech Republic" },
  { city: "Rio de Janeiro", country: "Brazil" },
  { city: "Rome",           country: "Italy" },
  { city: "San Francisco",  country: "United States" },
  { city: "Santiago",       country: "Chile" },
  { city: "Seoul",          country: "South Korea" },
  { city: "Singapore",      country: "Singapore" },
  { city: "Sydney",         country: "Australia" },
  { city: "Tokyo",          country: "Japan" },
  { city: "Toronto",        country: "Canada" },
  { city: "Vancouver",      country: "Canada" },
  { city: "Venice",         country: "Italy" },
  { city: "Vienna",         country: "Austria" },
  { city: "Warsaw",         country: "Poland" },
  { city: "Washington DC",  country: "United States" },
  { city: "Zurich",         country: "Switzerland" },
];

export interface AutocompleteSuggestion {
  text:      string;    // city name (dropdown primary line)
  secondary: string;    // country / region (dropdown secondary line)
  label:     string;    // unambiguous full label sent to hotel search: "Nara, Japan"
  placeId?:  string;    // Google Place ID for accurate server-side geocoding
}

type PlacesAutoSuggestion = {
  placePrediction?: {
    place?:   string;
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?:      { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

// Build an unambiguous label like "Nara, Japan" from mainText and secondaryText.
// Takes only the last segment of secondary (the country) to avoid "Nara, Nara, Japan".
function buildLabel(text: string, secondary: string): string {
  if (!secondary) return text;
  const parts = secondary.split(",");
  const country = parts[parts.length - 1].trim();
  return country ? `${text}, ${country}` : text;
}

function localFallback(q: string): AutocompleteSuggestion[] {
  const ql = q.toLowerCase();
  return LOCAL_CITIES
    .filter(({ city }) => city.toLowerCase().includes(ql))
    .sort((a, b) => {
      const aStart = a.city.toLowerCase().startsWith(ql) ? 0 : 1;
      const bStart = b.city.toLowerCase().startsWith(ql) ? 0 : 1;
      return aStart - bStart || a.city.localeCompare(b.city);
    })
    .slice(0, 8)
    .map(({ city, country }) => ({
      text:      city,
      secondary: country,
      label:     `${city}, ${country}`,
      placeId:   undefined,
    }));
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q       = searchParams.get("q")?.trim() ?? "";
  const apiKey  = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] as AutocompleteSuggestion[] });
  }

  if (!apiKey) {
    return NextResponse.json({ suggestions: localFallback(q) });
  }

  // ── Google Places Autocomplete (New API) ──────────────────────────────────
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type":   "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input: q,
        includedPrimaryTypes: ["locality", "administrative_area_level_3"],
        languageCode: "en",
      }),
    });

    if (!res.ok) return NextResponse.json({ suggestions: localFallback(q) });

    const body = await res.json() as { suggestions?: PlacesAutoSuggestion[] };

    const suggestions: AutocompleteSuggestion[] = (body.suggestions ?? [])
      .slice(0, 8)
      .map((s) => {
        const text      = s.placePrediction?.structuredFormat?.mainText?.text
                       ?? s.placePrediction?.text?.text
                       ?? "";
        const secondary = s.placePrediction?.structuredFormat?.secondaryText?.text ?? "";
        // placeId is returned as placePrediction.placeId in the Places Autocomplete (New) API
        const placeId   = s.placePrediction?.placeId ?? undefined;
        return { text, secondary, label: buildLabel(text, secondary), placeId };
      })
      .filter((s) => s.text.length > 0);

    // Blend with local results in case API returns nothing useful
    if (suggestions.length === 0) return NextResponse.json({ suggestions: localFallback(q) });

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: localFallback(q) });
  }
}
