import type {
  FlightSearchProvider,
  PerOfferDebugRow,
  ProviderDebugInfo,
  ProviderOffer,
  ProviderResult,
  SearchParams,
} from "./types";

type R = Record<string, unknown>;

// ── Duffel-specific parsing helpers ──────────────────────────────────────────

function airportIata(a: R | undefined): string {
  return (a?.iata_code as string | undefined) ?? (a?.name as string | undefined) ?? "";
}

function segmentCabin(seg: R): string {
  const passengers = (seg.passengers as R[] | undefined) ?? [];
  const val =
    (passengers[0]?.cabin_class_marketing_name as string | undefined) ??
    (passengers[0]?.cabin_class as string | undefined) ??
    "Economy";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractBaggage(offer: R): string {
  try {
    const conds = (offer.conditions as R | undefined) ?? {};
    const bags = (conds.baggage as R | undefined) ?? {};
    if (bags.quantity && Number(bags.quantity) > 0) {
      return `${bags.quantity} checked bag${Number(bags.quantity) > 1 ? "s" : ""}`;
    }
    for (const slice of ((offer.slices as R[]) ?? [])) {
      for (const seg of ((slice.segments as R[]) ?? [])) {
        for (const pax of ((seg.passengers as R[]) ?? [])) {
          for (const b of ((pax.baggages as R[]) ?? [])) {
            if (b.type === "checked" && Number(b.quantity) > 0) {
              return `${b.quantity} checked bag${Number(b.quantity) > 1 ? "s" : ""}`;
            }
          }
        }
      }
    }
  } catch { /* ignore */ }
  return "";
}

// Parse ISO 8601 duration strings: PT19H35M, P1DT2H10M, PT90M, etc.
function parseDurationMinutes(iso: string | null | undefined): number {
  if (!iso) return 0;
  const s = String(iso).toUpperCase();
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return 0;
  const days  = parseInt(m[1] ?? "0") || 0;
  const hours = parseInt(m[2] ?? "0") || 0;
  const mins  = parseInt(m[3] ?? "0") || 0;
  return days * 24 * 60 + hours * 60 + mins;
}

// ── DuffelProvider ────────────────────────────────────────────────────────────

export class DuffelProvider implements FlightSearchProvider {
  readonly name = "Duffel";
  readonly source = "duffel" as const;

  constructor(private readonly apiKey: string) {}

  async search(params: SearchParams): Promise<ProviderResult> {
    const slices: Array<{ origin: string; destination: string; departure_date: string }> = [
      { origin: params.origin, destination: params.destination, departure_date: params.departure_date },
    ];
    if (params.trip_type === "roundtrip" && params.return_date) {
      slices.push({ origin: params.destination, destination: params.origin, departure_date: params.return_date });
    }

    const payload = {
      data: {
        slices,
        passengers: Array.from({ length: params.adults }, () => ({ type: "adult" })),
        cabin_class: params.cabin_class,
        // No carrier_filters, content_source_filters, max_connections, or limit_params
      },
    };

    const requestPayloadJson = JSON.stringify(payload);
    const t0 = Date.now();
    let resp: Response;

    // return_offers=true makes Duffel block until all offers are ready and return
    // them inline, avoiding a separate polling step and giving 100+ results.
    try {
      resp = await fetch("https://api.duffel.com/air/offer_requests?return_offers=true", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Duffel-Version": "v2",
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: requestPayloadJson,
      });
    } catch (err) {
      console.error("[duffel] network error:", String(err).slice(0, 120));
      return emptyResult(requestPayloadJson, Date.now() - t0);
    }

    const latencyMs = Date.now() - t0;

    if (!resp.ok) {
      let errMsg = `HTTP ${resp.status}`;
      try {
        const e = await resp.json() as { errors?: Array<{ message?: string }> };
        errMsg = e?.errors?.[0]?.message ?? errMsg;
      } catch { /* ignore */ }
      console.error(`[duffel] error: ${errMsg}`);
      return emptyResult(requestPayloadJson, latencyMs, resp.status);
    }

    const body = await resp.json() as {
      data?: { id?: string; offers?: R[] };
      meta?: { after?: string | null };
    };
    const offerRequestId = body?.data?.id ?? "";
    let rawOffers: R[] = body?.data?.offers ?? [];
    let afterCursor: string | null = body?.meta?.after ?? null;

    // Paginate through remaining offer pages (Duffel uses cursor-based pagination).
    // Cap at 3 extra pages (~600 additional offers) to stay within the 55s timeout.
    let pagesFetched = 0;
    while (afterCursor && offerRequestId && pagesFetched < 3) {
      pagesFetched++;
      try {
        const pageUrl =
          `https://api.duffel.com/air/offers` +
          `?offer_request_id=${encodeURIComponent(offerRequestId)}` +
          `&limit=200&sort=total_amount` +
          `&after=${encodeURIComponent(afterCursor)}`;
        const pageResp = await fetch(pageUrl, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Duffel-Version": "v2",
            Accept: "application/json",
          },
        });
        if (!pageResp.ok) break;
        const pageBody = await pageResp.json() as { data?: R[]; meta?: { after?: string | null } };
        const pageOffers = pageBody?.data ?? [];
        if (!pageOffers.length) break;
        rawOffers = rawOffers.concat(pageOffers);
        afterCursor = pageBody?.meta?.after ?? null;
        console.log(`[duffel] page ${pagesFetched}: +${pageOffers.length} offers (total ${rawOffers.length})`);
      } catch (pageErr) {
        console.error(`[duffel] pagination page ${pagesFetched} error:`, String(pageErr).slice(0, 120));
        break;
      }
    }

    const offers: ProviderOffer[] = [];
    const perOfferRows: PerOfferDebugRow[] = [];

    for (const raw of rawOffers) {
      const owner = (raw.owner as R | undefined) ?? {};
      const ownerCode = (owner.iata_code as string | undefined) ?? (owner.name as string | undefined) ?? "?";
      const sl0 = ((raw.slices as R[] | undefined) ?? [])[0];
      const segs0 = (sl0?.segments as R[] | undefined) ?? [];
      const first0 = segs0[0];
      const mc0 = (first0?.marketing_carrier as R | undefined) ?? {};
      const price = parseFloat((raw.total_amount as string) ?? "0") || 0;

      perOfferRows.push({
        airline: (mc0.name as string | undefined) ?? (owner.name as string | undefined) ?? "?",
        airlineCode: (mc0.iata_code as string | undefined) ?? "??",
        owner: ownerCode,
        price: price > 0 ? `$${price.toFixed(0)}` : "?",
        stops: Math.max(0, segs0.length - 1),
        offerId: (raw.id as string | undefined) ?? "",
        source: "duffel",
      });

      const offer = this.normalizeOffer(raw, params.origin, params.destination);
      if (offer) offers.push(offer);
    }

    const debug: ProviderDebugInfo = {
      httpStatus: resp.status,
      latencyMs,
      rawOfferCount: rawOffers.length,
      requestPayloadJson,
      perOfferRows,
    };

    return { offers, debug };
  }

  // In Duffel v2 each connecting leg is its own slice, so `offer.slices` for a
  // KIX→ICN→LAX round-trip looks like [KIX→ICN, ICN→LAX, LAX→ICN, ICN→KIX].
  // We walk all segments and find the outbound chain from reqOrigin to reqDest.
  private normalizeOffer(offer: R, reqOrigin: string, reqDest: string): ProviderOffer | null {
    const offerId = (offer.id as string | undefined) ?? "";
    const slices = (offer.slices as R[] | undefined) ?? [];
    if (!slices.length) return null;

    // Flatten all segments in offer order
    const allSegs: R[] = [];
    for (const sl of slices) {
      for (const seg of ((sl.segments as R[] | undefined) ?? [])) allSegs.push(seg);
    }
    if (!allSegs.length) return null;

    // Find outbound chain: start at reqOrigin, end at reqDest
    const originSet = new Set(reqOrigin.split(",").map((c) => c.trim().toUpperCase()));
    const destSet   = new Set(reqDest.split(",").map((c) => c.trim().toUpperCase()));
    const outboundSegs: R[] = [];
    let started = false;
    let outboundEndIdx = -1;
    for (let i = 0; i < allSegs.length; i++) {
      const seg = allSegs[i];
      const segOri  = airportIata(seg.origin      as R | undefined).toUpperCase();
      const segDest = airportIata(seg.destination as R | undefined).toUpperCase();
      if (!started && originSet.has(segOri)) started = true;
      if (started) {
        outboundSegs.push(seg);
        if (destSet.has(segDest)) { outboundEndIdx = i; break; }
      }
    }

    // Find return chain after outbound ends: from reqDest back to reqOrigin
    const returnSegs: R[] = [];
    if (outboundEndIdx >= 0) {
      let retStarted = false;
      for (let i = outboundEndIdx + 1; i < allSegs.length; i++) {
        const seg = allSegs[i];
        const segOri  = airportIata(seg.origin      as R | undefined).toUpperCase();
        const segDest = airportIata(seg.destination as R | undefined).toUpperCase();
        if (!retStarted && destSet.has(segOri)) retStarted = true;
        if (retStarted) {
          returnSegs.push(seg);
          if (originSet.has(segDest)) break;
        }
      }
    }

    // Fall back to all segments only when outbound detection fails; this produces
    // detectable wrong durations that the < 60 min filter below will reject.
    const useSegs = outboundSegs.length > 0 ? outboundSegs : allSegs;
    if (!useSegs.length) return null;

    const firstSeg = useSegs[0];
    const lastSeg  = useSegs[useSegs.length - 1];
    const owner    = (offer.owner as R | undefined) ?? {};
    const mc       = (firstSeg.marketing_carrier as R | undefined) ?? {};
    const airline  = (mc.name as string | undefined) ?? (owner.name as string | undefined) ?? (owner.iata_code as string | undefined) ?? "";
    const mcCode   = (mc.iata_code as string | undefined) ?? "";
    const fn       = (firstSeg.marketing_carrier_flight_number as string | undefined) ?? "";

    // Collect all flight numbers for the outbound trip
    const flightNumbers = useSegs.map((seg) => {
      const mc_ = (seg.marketing_carrier as R | undefined) ?? {};
      const code = (mc_.iata_code as string | undefined) ?? "";
      const num  = (seg.marketing_carrier_flight_number as string | undefined) ?? "";
      return `${code} ${num}`.trim();
    }).filter(Boolean);

    const connectionAirports = useSegs
      .slice(0, -1)
      .map((seg) => airportIata(seg.destination as R | undefined))
      .filter(Boolean)
      .join(",");

    const dep = (firstSeg.departing_at as string | undefined) ?? "";
    const arr = (lastSeg.arriving_at   as string | undefined) ?? "";

    // Primary source: Duffel's pre-computed slice.duration (ISO 8601), which includes all
    // layovers within the outbound journey. slices[0] is always the outbound direction.
    const rawSliceDur = (slices[0].duration as string | undefined) ?? "";
    let durationMinutes = parseDurationMinutes(rawSliceDur);

    // Fallback: timestamp subtraction (new Date() handles ISO offsets correctly)
    if (!durationMinutes && dep && arr) {
      const depMs = new Date(dep).getTime();
      const arrMs = new Date(arr).getTime();
      if (!isNaN(depMs) && !isNaN(arrMs) && arrMs > depMs) {
        durationMinutes = Math.round((arrMs - depMs) / 60000);
      }
    }

    if (durationMinutes < 60) {
      console.log(
        `[duffel][filter_removed] id=${offerId} "${airline}" ${mcCode}${fn} ` +
        `price=$${(offer.total_amount as string) ?? "?"} ` +
        `reason="duration ${durationMinutes}min < 60min (slice_dur=${rawSliceDur})"`
      );
      return null;
    }

    if (durationMinutes < 180) {
      console.log(`[duffel][dur-short] ${durationMinutes}min id=${offerId} "${airline}" ${mcCode}${fn} slice_dur="${rawSliceDur}"`);
    }

    const sl0Pax = ((slices[0].segments as R[] | undefined)?.[0]?.passengers as R[] | undefined)?.[0];
    const fareBrand =
      (slices[0].fare_brand_name as string | undefined) ??
      (sl0Pax?.fare_brand_name as string | undefined) ??
      "";

    // Extract return leg metadata if return segments were found
    let returnLegFields: Partial<ProviderOffer> = {};
    if (returnSegs.length > 0) {
      const firstRet = returnSegs[0];
      const lastRet  = returnSegs[returnSegs.length - 1];
      const retDep = (firstRet.departing_at as string | undefined) ?? "";
      const retArr = (lastRet.arriving_at   as string | undefined) ?? "";
      const retFlightNumbers = returnSegs.map((seg) => {
        const mc_ = (seg.marketing_carrier as R | undefined) ?? {};
        const code_ = (mc_.iata_code as string | undefined) ?? "";
        const num_  = (seg.marketing_carrier_flight_number as string | undefined) ?? "";
        return `${code_} ${num_}`.trim();
      }).filter(Boolean);
      const retConnectionAirports = returnSegs.slice(0, -1)
        .map((seg) => airportIata(seg.destination as R | undefined))
        .filter(Boolean).join(",");
      const rawRetSliceDur = (slices[1]?.duration as string | undefined) ?? "";
      let retDurMins = parseDurationMinutes(rawRetSliceDur);
      if (!retDurMins && retDep && retArr) {
        const depMs = new Date(retDep).getTime();
        const arrMs = new Date(retArr).getTime();
        if (!isNaN(depMs) && !isNaN(arrMs) && arrMs > depMs) {
          retDurMins = Math.round((arrMs - depMs) / 60000);
        }
      }
      returnLegFields = {
        returnOrigin:             airportIata(firstRet.origin      as R | undefined),
        returnDestination:        airportIata(lastRet.destination  as R | undefined),
        returnDepartureTime:      retDep,
        returnArrivalTime:        retArr,
        returnDurationMinutes:    retDurMins,
        returnStops:              Math.max(0, returnSegs.length - 1),
        returnConnectionAirports: retConnectionAirports,
        returnFlightNumbers:      retFlightNumbers,
      };
    }

    return {
      source: "duffel",
      sourceOfferId: offerId,
      airline,
      airlineCode: mcCode,
      flightNumbers: flightNumbers.length > 0 ? flightNumbers : [`${mcCode} ${fn}`.trim()],
      origin:      airportIata(firstSeg.origin      as R | undefined),
      destination: airportIata(lastSeg.destination  as R | undefined),
      departureTime: dep,
      arrivalTime:   arr,
      durationMinutes,
      stops: Math.max(0, useSegs.length - 1),
      connectionAirports,
      cabin:   segmentCabin(firstSeg),
      baggage: extractBaggage(offer),
      price:    parseFloat((offer.total_amount   as string | undefined) ?? "0") || 0,
      currency: (offer.total_currency as string | undefined) ?? "USD",
      isBookableInTravelGrab: true,
      fareBrand,
      ...returnLegFields,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyResult(requestPayloadJson: string, latencyMs: number, httpStatus?: number): ProviderResult {
  return {
    offers: [],
    debug: { httpStatus, latencyMs, rawOfferCount: 0, requestPayloadJson, perOfferRows: [] },
  };
}
