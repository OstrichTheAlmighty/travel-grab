// ── AmadeusProvider stub ──────────────────────────────────────────────────────
// Full implementation requires AMADEUS_API_KEY + AMADEUS_API_SECRET env vars.
// Once credentials are available, replace the stub body with real API calls.
// Amadeus Self-Service: https://developers.amadeus.com/self-service/category/flights
//
// Key difference from Duffel: Amadeus covers United, American, Delta, Alaska
// (full ATPCO GDS inventory) but Southwest still does not participate in any GDS.
// Offers from Amadeus should have isBookableInTravelGrab = false until a booking
// integration is built; set bookingUrl to a deep-link to the airline's own site.
import type {
  FlightSearchProvider,
  ProviderResult,
  SearchParams,
} from "./types";

export class AmadeusProvider implements FlightSearchProvider {
  readonly name = "Amadeus";
  readonly source = "amadeus" as const;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async search(_params: SearchParams): Promise<ProviderResult> {
    // No credentials configured — return empty result without throwing.
    return {
      offers: [],
      debug: {
        latencyMs: 0,
        rawOfferCount: 0,
        requestPayloadJson: "{}",
        perOfferRows: [],
      },
    };
  }
}
