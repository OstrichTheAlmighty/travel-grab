import type { HotelProviderResult, HotelSearchParams, ProviderHotel } from "./types";

// LiteAPI v3 response shapes — fields are defensive (some may be absent)
interface LiteApiHotelRaw {
  id?:             string;
  name?:           string;
  description?:    string;
  hotelDescription?: string;
  // location nested vs. flat on address
  location?: { lat?: number; lng?: number; latitude?: number; longitude?: number };
  address?:  string | {
    street?: string; city?: string; country?: string;
    latitude?: number; longitude?: number;
  };
  star_rating?: number;
  starRating?:  number;
  // photos may be an array of URLs or objects
  photos?:    Array<string | { url?: string; original?: string }>;
  thumbnail?: string;
  amenities?: string[] | Array<{ name?: string }>;
  reviews?: {
    average?: number;
    score?:   number;
    count?:   number;
    reviewCount?: number;
  };
  // pricing — not always present in search responses
  min_cost?: { price?: number; currency?: string };
  price?:    number;
  currency?: string;
  bookingUrl?: string;
  booking_url?: string;
}

interface LiteApiSearchResponse {
  data?:   LiteApiHotelRaw[];
  hotels?: LiteApiHotelRaw[];
  status?: { code?: number; message?: string };
  error?:  { message?: string };
}

function extractPhotos(raw: LiteApiHotelRaw): string[] {
  if (!raw.photos?.length) return raw.thumbnail ? [raw.thumbnail] : [];
  return raw.photos
    .map((p) => (typeof p === "string" ? p : (p.url ?? p.original ?? "")))
    .filter(Boolean)
    .slice(0, 8);
}

function extractAmenities(raw: LiteApiHotelRaw): string[] {
  if (!raw.amenities?.length) return [];
  return raw.amenities
    .map((a) => (typeof a === "string" ? a : (a.name ?? "")))
    .filter(Boolean);
}

function extractLatLng(raw: LiteApiHotelRaw): { lat?: number; lng?: number } {
  if (raw.location) {
    return {
      lat: raw.location.lat ?? raw.location.latitude,
      lng: raw.location.lng ?? raw.location.longitude,
    };
  }
  if (raw.address && typeof raw.address === "object") {
    return { lat: raw.address.latitude, lng: raw.address.longitude };
  }
  return {};
}

function extractAddress(raw: LiteApiHotelRaw): string {
  if (typeof raw.address === "string") return raw.address;
  if (raw.address && typeof raw.address === "object") {
    return [raw.address.street, raw.address.city, raw.address.country]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

function mapToProviderHotel(raw: LiteApiHotelRaw, params: HotelSearchParams): ProviderHotel | null {
  const name = raw.name?.trim();
  if (!name) return null;

  const id = raw.id ?? `liteapi_${name.replace(/\W/g, "_").slice(0, 40)}`;
  const { lat, lng } = extractLatLng(raw);
  const photos       = extractPhotos(raw);
  const pricePerNight = raw.min_cost?.price ?? raw.price ?? 0;

  return {
    source:         "liteapi",
    sourceHotelId:  id,
    name,
    address:        extractAddress(raw),
    starRating:     raw.star_rating  ?? raw.starRating ?? 0,
    overallRating:  raw.reviews?.average ?? raw.reviews?.score ?? 0,
    reviewCount:    raw.reviews?.count   ?? raw.reviews?.reviewCount ?? 0,
    locationRating: 0,
    pricePerNight,
    totalPrice:     pricePerNight,
    currency:       raw.min_cost?.currency ?? raw.currency ?? "USD",
    amenities:      extractAmenities(raw),
    nearbyPlaces:   [],
    imageUrl:       photos[0] ?? "",
    imageUrls:      photos,
    bookingUrl:     raw.bookingUrl ?? raw.booking_url ?? "",
    checkIn:        params.check_in,
    checkOut:       params.check_out,
    hotelType:      "Hotel",
    ecoCertified:   false,
    description:    raw.description ?? raw.hotelDescription ?? "",
    latitude:       typeof lat === "number" ? lat : undefined,
    longitude:      typeof lng === "number" ? lng : undefined,
  };
}

const LITEAPI_BASE = "https://api.liteapi.travel";

export async function searchLiteApiHotels(
  params: HotelSearchParams,
  apiKey: string,
): Promise<HotelProviderResult> {
  const t0 = Date.now();

  const qs = new URLSearchParams({
    destination:   params.destination,
    checkIn:       params.check_in,
    checkOut:      params.check_out,
    adults:        String(params.guests),
    rooms:         String(params.rooms),
    currency:      "USD",
  });

  const url = `${LITEAPI_BASE}/v3/hotels/search?${qs}`;
  console.log(`[liteapi] GET ${url}`);

  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "X-API-Key": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error(`[liteapi] network error:`, String(err));
    return { hotels: [], rawCount: 0, pagesFetched: 0, requestUrl: url, latencyMs: Date.now() - t0 };
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(`[liteapi] HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return { hotels: [], rawCount: 0, pagesFetched: 0, requestUrl: url, latencyMs: Date.now() - t0 };
  }

  let body: LiteApiSearchResponse;
  try {
    body = await resp.json() as LiteApiSearchResponse;
  } catch (err) {
    console.error(`[liteapi] JSON parse error:`, String(err));
    return { hotels: [], rawCount: 0, pagesFetched: 0, requestUrl: url, latencyMs: Date.now() - t0 };
  }

  // Log raw response shape so we can verify the field mapping
  console.log(`[liteapi] response keys: ${Object.keys(body).join(", ")}`);
  const rawList = body.data ?? body.hotels ?? [];
  console.log(`[liteapi] raw hotel count: ${rawList.length}`);
  if (rawList.length > 0) {
    console.log(`[liteapi] sample[0] keys: ${Object.keys(rawList[0]).join(", ")}`);
    console.log(`[liteapi] sample[0]: ${JSON.stringify(rawList[0]).slice(0, 500)}`);
  }

  const hotels: ProviderHotel[] = [];
  for (const raw of rawList) {
    const mapped = mapToProviderHotel(raw, params);
    if (mapped) hotels.push(mapped);
  }

  const latencyMs = Date.now() - t0;
  console.log(`[liteapi] mapped ${hotels.length}/${rawList.length} hotels (${latencyMs}ms)`);

  return { hotels, rawCount: rawList.length, pagesFetched: 1, requestUrl: url, latencyMs };
}
