import type { HotelProviderResult, HotelSearchParams, ProviderHotel } from "./types";

// ── LiteAPI response shapes (defensive — logs will confirm exact structure) ────

interface LiteApiCity {
  id?:          string;
  cityId?:      string;
  name?:        string;
  countryCode?: string;
}

interface LiteApiAddress {
  street?:    string;
  city?:      string;
  country?:   string;
  latitude?:  number;
  longitude?: number;
  zipCode?:   string;
}

interface LiteApiAmenityGroup {
  groupName?: string;
  amenities?: string[];
}

interface LiteApiHotelData {
  id?:                 string;
  name?:               string;
  hotelDescription?:   string;
  description?:        string;
  // flat lat/lng (some API versions) OR nested in address
  latitude?:           number;
  longitude?:          number;
  address?:            LiteApiAddress;
  starRating?:         number;
  star_rating?:        number;
  thumbnail?:          string;
  photos?:             Array<string | { url?: string; thumbnail?: string }>;
  amenities?:          Array<string | { name?: string }>;
  amenityGroups?:      LiteApiAmenityGroup[];
}

interface LiteApiRateEntry {
  hotelId?:    string;
  currency?:   string;
  // Structure varies — handle both known shapes
  roomTypes?:  Array<{ offerRetailRate?: { amount?: number; currency?: string } }>;
  rooms?:      Array<{ rates?: Array<{ price?: { offerPrice?: number }; retailRate?: { total?: Array<{ amount?: number; currency?: string }> } }> }>;
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

const LITEAPI_BASE = "https://api.liteapi.travel/v3.0";

function headers(apiKey: string, withJson = false): Record<string, string> {
  const h: Record<string, string> = { "X-API-Key": apiKey, Accept: "application/json" };
  if (withJson) h["Content-Type"] = "application/json";
  return h;
}

async function apiFetch<T>(
  url: string,
  init: RequestInit,
  label: string,
): Promise<T | null> {
  console.log(`[liteapi/${label}] ${init.method ?? "GET"} ${url}`);
  let resp: Response;
  try {
    resp = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    console.error(`[liteapi/${label}] network error:`, String(err));
    return null;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error(`[liteapi/${label}] HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return null;
  }
  try {
    const body = await resp.json() as T;
    return body;
  } catch (err) {
    console.error(`[liteapi/${label}] JSON parse error:`, String(err));
    return null;
  }
}

// ── Step 1: Find city ID ──────────────────────────────────────────────────────

async function findCityId(search: string, apiKey: string): Promise<string | null> {
  const body = await apiFetch<{ data?: LiteApiCity[] }>(
    `${LITEAPI_BASE}/data/cities`,
    {
      method:  "POST",
      headers: headers(apiKey, true),
      body:    JSON.stringify({ search }),
    },
    "cities",
  );

  if (!body) return null;

  console.log(`[liteapi/cities] response keys: ${Object.keys(body).join(", ")}`);
  const cities = body.data ?? [];
  console.log(`[liteapi/cities] count=${cities.length}`);
  if (cities.length > 0) {
    console.log(`[liteapi/cities] sample[0]:`, JSON.stringify(cities[0]));
  }

  const city = cities[0];
  const id   = city?.id ?? city?.cityId;
  if (!id) {
    console.error(`[liteapi/cities] no city id found for "${search}"`);
    return null;
  }

  console.log(`[liteapi/cities] matched: "${city?.name}" id=${id}`);
  return id;
}

// ── Step 2: Get hotels by city ID ─────────────────────────────────────────────

async function getHotelsByCityId(
  cityId: string,
  apiKey: string,
  limit = 100,
): Promise<LiteApiHotelData[]> {
  const qs   = new URLSearchParams({ cityId, limit: String(limit) });
  const body = await apiFetch<{ data?: LiteApiHotelData[] }>(
    `${LITEAPI_BASE}/data/hotels?${qs}`,
    { headers: headers(apiKey) },
    "hotels",
  );

  if (!body) return [];

  console.log(`[liteapi/hotels] response keys: ${Object.keys(body).join(", ")}`);
  const list = body.data ?? [];
  console.log(`[liteapi/hotels] count=${list.length}`);
  if (list.length > 0) {
    console.log(`[liteapi/hotels] sample[0] keys: ${Object.keys(list[0]).join(", ")}`);
    console.log(`[liteapi/hotels] sample[0]: ${JSON.stringify(list[0]).slice(0, 600)}`);
  }

  return list;
}

// ── Step 3: Get rates for hotel IDs ──────────────────────────────────────────

async function getRates(
  hotelIds: string[],
  checkIn:  string,
  checkOut: string,
  adults:   number,
  apiKey:   string,
): Promise<Map<string, { price: number; currency: string }>> {
  const prices = new Map<string, { price: number; currency: string }>();
  if (hotelIds.length === 0) return prices;

  const body = await apiFetch<unknown>(
    `${LITEAPI_BASE}/hotels/rates`,
    {
      method:  "POST",
      headers: headers(apiKey, true),
      body:    JSON.stringify({
        hotelIds,
        checkIn,
        checkOut,
        occupancies: [{ adults, children: [] }],
        currency:    "USD",
      }),
    },
    "rates",
  );

  if (!body) return prices;

  // Log the raw structure so we can verify field names
  const preview = JSON.stringify(body).slice(0, 1200);
  console.log(`[liteapi/rates] raw (first 1200 chars): ${preview}`);

  // Parse defensively — handles two known LiteAPI rate shapes
  const rawBody  = body as Record<string, unknown>;
  const dataArr  = Array.isArray(rawBody.data) ? rawBody.data as LiteApiRateEntry[]
                 : Array.isArray(rawBody.hotels) ? rawBody.hotels as LiteApiRateEntry[]
                 : [];

  for (const h of dataArr) {
    const id = h.hotelId;
    if (!id) continue;

    let lowest = Infinity;

    // Shape A: roomTypes[].offerRetailRate.amount
    for (const rt of h.roomTypes ?? []) {
      const amt = rt.offerRetailRate?.amount;
      if (typeof amt === "number" && amt < lowest) lowest = amt;
    }

    // Shape B: rooms[].rates[].price.offerPrice
    for (const room of h.rooms ?? []) {
      for (const rate of room.rates ?? []) {
        const offerPrice = rate.price?.offerPrice;
        if (typeof offerPrice === "number" && offerPrice < lowest) lowest = offerPrice;
        // Shape C: rooms[].rates[].retailRate.total[].amount
        for (const total of rate.retailRate?.total ?? []) {
          if (typeof total.amount === "number" && total.amount < lowest) lowest = total.amount;
        }
      }
    }

    if (lowest !== Infinity) {
      prices.set(id, { price: lowest, currency: h.currency ?? "USD" });
    }
  }

  console.log(`[liteapi/rates] prices extracted: ${prices.size}/${hotelIds.length}`);
  return prices;
}

// ── Map to ProviderHotel ──────────────────────────────────────────────────────

function extractPhotos(h: LiteApiHotelData): string[] {
  const out: string[] = [];
  if (h.thumbnail) out.push(h.thumbnail);
  for (const p of h.photos ?? []) {
    const url = typeof p === "string" ? p : (p.url ?? p.thumbnail ?? "");
    if (url && !out.includes(url)) out.push(url);
  }
  return out.slice(0, 8);
}

function extractAmenities(h: LiteApiHotelData): string[] {
  const out: string[] = [];
  for (const a of h.amenities ?? []) {
    const name = typeof a === "string" ? a : (a.name ?? "");
    if (name && !out.includes(name)) out.push(name);
  }
  for (const g of h.amenityGroups ?? []) {
    for (const a of g.amenities ?? []) {
      if (a && !out.includes(a)) out.push(a);
    }
  }
  return out;
}

function mapToProviderHotel(
  h:      LiteApiHotelData,
  rate:   { price: number; currency: string } | undefined,
  params: HotelSearchParams,
): ProviderHotel | null {
  const name = h.name?.trim();
  if (!name) return null;

  const id  = h.id ?? `liteapi_${name.replace(/\W/g, "_").slice(0, 40)}`;
  const lat = h.latitude  ?? h.address?.latitude;
  const lng = h.longitude ?? h.address?.longitude;

  const addressStr = h.address
    ? [h.address.street, h.address.city, h.address.country].filter(Boolean).join(", ")
    : "";

  const photos       = extractPhotos(h);
  const pricePerNight = rate?.price ?? 0;

  return {
    source:         "liteapi",
    sourceHotelId:  id,
    name,
    address:        addressStr,
    starRating:     h.starRating ?? h.star_rating ?? 0,
    overallRating:  0,
    reviewCount:    0,
    locationRating: 0,
    pricePerNight,
    totalPrice:     pricePerNight,
    currency:       rate?.currency ?? "USD",
    amenities:      extractAmenities(h),
    nearbyPlaces:   [],
    imageUrl:       photos[0] ?? "",
    imageUrls:      photos,
    bookingUrl:     "",
    checkIn:        params.check_in,
    checkOut:       params.check_out,
    hotelType:      "Hotel",
    ecoCertified:   false,
    description:    h.hotelDescription ?? h.description ?? "",
    latitude:       typeof lat === "number" ? lat : undefined,
    longitude:      typeof lng === "number" ? lng : undefined,
  };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function searchLiteApiHotels(
  params: HotelSearchParams,
  apiKey: string,
): Promise<HotelProviderResult> {
  const t0 = Date.now();

  // Step 1: city → city ID
  const cityId = await findCityId(params.destination, apiKey);
  if (!cityId) {
    return { hotels: [], rawCount: 0, pagesFetched: 0, requestUrl: LITEAPI_BASE, latencyMs: Date.now() - t0 };
  }

  // Step 2: city ID → hotel list (static data)
  const hotelList = await getHotelsByCityId(cityId, apiKey, 100);
  if (hotelList.length === 0) {
    return { hotels: [], rawCount: 0, pagesFetched: 0, requestUrl: LITEAPI_BASE, latencyMs: Date.now() - t0 };
  }

  // Step 3: hotel IDs → rates (cap at 50 for latency)
  const hotelIds = hotelList.slice(0, 50).map((h) => h.id).filter((id): id is string => !!id);
  const rates    = await getRates(hotelIds, params.check_in, params.check_out, params.guests, apiKey);

  // Combine and map
  const hotels: ProviderHotel[] = [];
  for (const h of hotelList) {
    const rate   = h.id ? rates.get(h.id) : undefined;
    const mapped = mapToProviderHotel(h, rate, params);
    if (mapped) hotels.push(mapped);
  }

  const latencyMs = Date.now() - t0;
  console.log(`[liteapi] done: ${hotels.length} hotels (${rates.size} with rates) in ${latencyMs}ms`);

  return { hotels, rawCount: hotelList.length, pagesFetched: 1, requestUrl: LITEAPI_BASE, latencyMs };
}
