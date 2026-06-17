import type {
  HotelProviderResult,
  HotelSearchParams,
  NearbyPlace,
  NearbyTransportation,
  ProviderHotel,
} from "./types";

type R = Record<string, unknown>;

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

export async function searchGoogleHotels(
  params: HotelSearchParams,
  apiKey: string,
): Promise<HotelProviderResult> {
  const qs = new URLSearchParams({
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

  const url = `https://serpapi.com/search?${qs}`;
  const debugUrl = url.replace(apiKey, "[REDACTED]");
  const t0 = Date.now();

  let resp: Response;
  try {
    resp = await fetch(url, { headers: { Accept: "application/json" } });
  } catch (err) {
    console.error("[google_hotels] network error:", String(err).slice(0, 120));
    return { hotels: [], rawCount: 0, requestUrl: debugUrl, latencyMs: Date.now() - t0 };
  }

  const latencyMs = Date.now() - t0;

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const e = await resp.json() as { error?: string };
      msg = e?.error ?? msg;
    } catch { /* ignore */ }
    console.error(`[google_hotels] error: ${msg}`);
    return { hotels: [], rawCount: 0, requestUrl: debugUrl, latencyMs };
  }

  const body = await resp.json() as R;

  const sponsored = (body.sponsored_properties as R[] | undefined) ?? [];
  const organic   = (body.properties          as R[] | undefined) ?? [];
  const allRaw    = [...sponsored, ...organic];

  console.log(`[google_hotels] raw=${allRaw.length} (sponsored=${sponsored.length} organic=${organic.length}) (${latencyMs}ms)`);

  const hotels: ProviderHotel[] = [];

  for (const raw of allRaw) {
    const name = (raw.name as string | undefined) ?? "";
    if (!name) continue;

    const rateObj   = (raw.rate_per_night as R | undefined) ?? {};
    const totalObj  = (raw.total_rate     as R | undefined) ?? {};
    const pricePerNight = (rateObj.extracted_lowest  as number | undefined) ?? 0;
    const totalPrice    = (totalObj.extracted_lowest as number | undefined) ?? 0;
    if (pricePerNight <= 0) continue;

    const images  = (raw.images  as R[] | undefined) ?? [];
    const imageUrl = (images[0]?.thumbnail as string | undefined) ?? (images[0]?.original as string | undefined) ?? "";

    // Prefer a direct property booking link from prices[]; fall back to the Google Hotels link
    const prices = (raw.prices as R[] | undefined) ?? [];
    const directLink = prices.find(
      (p) => !(p.source as string | undefined)?.toLowerCase().includes("google")
    );
    const bookingUrl =
      (directLink?.link as string | undefined) ??
      (raw.link          as string | undefined) ??
      "";

    const id = (raw.property_token as string | undefined) ??
               (raw.serpapi_property_details_link as string | undefined) ??
               `${name.replace(/\W/g, "_").slice(0, 40)}_${Math.round(pricePerNight)}`;

    const gps = raw.gps_coordinates as { latitude?: number; longitude?: number } | undefined;

    hotels.push({
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
      bookingUrl,
      checkIn:        params.check_in,
      checkOut:       params.check_out,
      hotelType:      (raw.type        as string | undefined) ?? "Hotel",
      ecoCertified:   !!(raw.eco_certified),
      description:    (raw.description as string | undefined) ?? "",
      latitude:       typeof gps?.latitude  === "number" ? gps.latitude  : undefined,
      longitude:      typeof gps?.longitude === "number" ? gps.longitude : undefined,
    });
  }

  return { hotels, rawCount: allRaw.length, requestUrl: debugUrl, latencyMs };
}
