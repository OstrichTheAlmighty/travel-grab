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
  text:      string;   // city name
  secondary: string;   // country / state
}

type PlacesAutoSuggestion = {
  placePrediction?: {
    text?: { text?: string };
    structuredFormat?: {
      mainText?:      { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

function localFallback(q: string): AutocompleteSuggestion[] {
  const ql = q.toLowerCase();
  return LOCAL_CITIES
    .filter(({ city }) => city.toLowerCase().includes(ql))
    .sort((a, b) => {
      // Exact prefix first
      const aStart = a.city.toLowerCase().startsWith(ql) ? 0 : 1;
      const bStart = b.city.toLowerCase().startsWith(ql) ? 0 : 1;
      return aStart - bStart || a.city.localeCompare(b.city);
    })
    .slice(0, 8)
    .map(({ city, country }) => ({ text: city, secondary: country }));
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
      .map((s) => ({
        text:      s.placePrediction?.structuredFormat?.mainText?.text
                ?? s.placePrediction?.text?.text
                ?? "",
        secondary: s.placePrediction?.structuredFormat?.secondaryText?.text ?? "",
      }))
      .filter((s) => s.text.length > 0);

    // Blend with local results in case API returns nothing useful
    if (suggestions.length === 0) return NextResponse.json({ suggestions: localFallback(q) });

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: localFallback(q) });
  }
}
