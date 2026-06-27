import type {
  HotelProviderResult,
  HotelSearchParams,
  NearbyPlace,
  NearbyTransportation,
  ProviderHotel,
} from "./types";

type R = Record<string, unknown>;

// SerpAPI Google Hotels returns ~16-20 properties per page.
// Each page costs 1 SerpAPI credit. 2 pages → ~35 hotels, enough for scoring.
// Pagination stops early when SerpAPI returns no next_page_token (provider exhausted).
// MAX_PAGES capped at 2 to keep Google Places enrichment cost at ~$1.20/search.
const MAX_PAGES = 2;
const PAGE_TIMEOUT_MS = 8_000;

function parseStarRating(hotelClass: string | undefined): number {
  if (!hotelClass) return 0;
  const m = String(hotelClass).match(/(\d)/);
  return m ? Math.min(5, Math.max(0, parseInt(m[1]))) : 0;
}

function parseNearbyPlaces(raw: unknown): NearbyPlace[] {
  if (!Array.isArray(raw)) return [];
  return (raw as R[]).map((p) => ({
    name: (p.name as string | undefined) ?? "",
    transportations: ((p.transportations as R[] | undefined) ?? []).map(
      (t): NearbyTransportation => ({
        type:     (t.type     as string | undefined) ?? "",
        duration: (t.duration as string | undefined) ?? "",
      })
    ),
  })).filter((p) => p.name);
}

function parseHotel(raw: R, params: HotelSearchParams): ProviderHotel | null {
  const name = (raw.name as string | undefined) ?? "";
  if (!name) return null;

  const rateObj        = (raw.rate_per_night as R | undefined) ?? {};
  const totalObj       = (raw.total_rate     as R | undefined) ?? {};
  const pricePerNight  = (rateObj.extracted_lowest  as number | undefined) ?? 0;
  const totalPrice     = (totalObj.extracted_lowest as number | undefined) ?? 0;
  if (pricePerNight <= 0) return null;

  const images   = (raw.images as R[] | undefined) ?? [];
  const imageUrl = (images[0]?.original  as string | undefined)
                ?? (images[0]?.thumbnail as string | undefined)
                ?? "";
  const imageUrls = images.slice(0, 8).map((img) =>
    (img.original as string | undefined) ?? (img.thumbnail as string | undefined) ?? ""
  ).filter(Boolean);

  // Prefer a direct property booking link from prices[]; fall back to the Google Hotels link
  const prices     = (raw.prices as R[] | undefined) ?? [];
  const directLink = prices.find(
    (p) => !(p.source as string | undefined)?.toLowerCase().includes("google")
  );
  const bookingUrl =
    (directLink?.link as string | undefined) ??
    (raw.link          as string | undefined) ??
    "";

  const id = (raw.property_token as string | undefined)
           ?? (raw.serpapi_property_details_link as string | undefined)
           ?? `${name.replace(/\W/g, "_").slice(0, 40)}_${Math.round(pricePerNight)}`;

  const gps = raw.gps_coordinates as { latitude?: number; longitude?: number } | undefined;

  return {
    source:         "google_hotels",
    sourceHotelId:  id,
    name,
    address:        (raw.address as string | undefined) ?? "",
    starRating:     parseStarRating(raw.hotel_class as string | undefined),
    overallRating:  (raw.overall_rating  as number | undefined) ?? 0,
    reviewCount:    (raw.reviews         as number | undefined) ?? 0,
    locationRating: (raw.location_rating as number | undefined) ?? 0,
    pricePerNight,
    totalPrice:     totalPrice || pricePerNight,
    currency:       "USD",
    amenities:      (raw.amenities as string[] | undefined) ?? [],
    nearbyPlaces:   parseNearbyPlaces(raw.nearby_places),
    imageUrl,
    imageUrls,
    bookingUrl,
    checkIn:        params.check_in,
    checkOut:       params.check_out,
    hotelType:      (raw.type        as string | undefined) ?? "Hotel",
    ecoCertified:   !!(raw.eco_certified),
    description:    (raw.description as string | undefined) ?? "",
    latitude:       typeof gps?.latitude  === "number" ? gps.latitude  : undefined,
    longitude:      typeof gps?.longitude === "number" ? gps.longitude : undefined,
  };
}

export async function searchGoogleHotels(
  params: HotelSearchParams,
  apiKey: string,
): Promise<HotelProviderResult> {
  const baseQs = new URLSearchParams({
    engine:         "google_hotels",
    q:              params.destination,
    check_in_date:  params.check_in,
    check_out_date: params.check_out,
    adults:         String(params.guests),
    rooms:          String(params.rooms),
    currency:       "USD",
    hl:             "en",
    gl:             "us",
    api_key:        apiKey,
  });

  const t0            = Date.now();
  const allHotels: ProviderHotel[] = [];
  let rawCount        = 0;
  let pagesFetched    = 0;
  let nextPageToken: string | null = null;
  let stopReason      = "max_pages_reached";
  const debugUrl      = `https://serpapi.com/search?${new URLSearchParams({ ...Object.fromEntries(baseQs), api_key: "[REDACTED]" })}`;

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams(baseQs);
    if (nextPageToken) qs.set("next_page_token", nextPageToken);

    const url = `https://serpapi.com/search?${qs}`;

    let resp: Response;
    try {
      const ac = new AbortController();
      const tid = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
      try {
        resp = await fetch(url, { headers: { Accept: "application/json" }, signal: ac.signal });
      } finally {
        clearTimeout(tid);
      }
    } catch (err) {
      console.error(`[google_hotels] page=${page} network error:`, String(err).slice(0, 120));
      stopReason = "network_error";
      break;
    }

    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const e = await resp.json() as { error?: string };
        msg = e?.error ?? msg;
      } catch { /* ignore */ }
      console.error(`[google_hotels] page=${page} error: ${msg}`);
      stopReason = `http_error_${resp.status}`;
      break;
    }

    const body = await resp.json() as R;
    pagesFetched++;

    const sponsored = (body.sponsored_properties as R[] | undefined) ?? [];
    const organic   = (body.properties           as R[] | undefined) ?? [];
    const pageRaw   = [...sponsored, ...organic];

    rawCount += pageRaw.length;

    let parsed = 0;
    for (const raw of pageRaw) {
      const hotel = parseHotel(raw, params);
      if (hotel) { allHotels.push(hotel); parsed++; }
    }

    console.log(`[google_hotels] page=${page} raw=${pageRaw.length} parsed=${parsed} (sponsored=${sponsored.length} organic=${organic.length})`);

    if (pageRaw.length === 0) { stopReason = "empty_page"; break; }

    // Follow next_page_token if SerpAPI provides one
    const pagination  = body.serpapi_pagination as R | undefined;
    nextPageToken     = (pagination?.next_page_token as string | undefined)
                     ?? (body.next_page_token         as string | undefined)
                     ?? null;
    if (!nextPageToken) { stopReason = "provider_exhausted"; break; }
  }

  const latencyMs = Date.now() - t0;
  if (stopReason === "max_pages_reached") {
    console.log(`[google_hotels] hit MAX_PAGES=${MAX_PAGES} ceiling — provider may have more results`);
  } else if (stopReason === "provider_exhausted") {
    console.log(`[google_hotels] provider returned all available hotels (${rawCount} raw) — no more pages`);
  }
  console.log(`[google_hotels] done: stop=${stopReason} pages=${pagesFetched} raw_total=${rawCount} parsed=${allHotels.length} (${latencyMs}ms)`);

  return { hotels: allHotels, rawCount, pagesFetched, requestUrl: debugUrl, latencyMs };
}
