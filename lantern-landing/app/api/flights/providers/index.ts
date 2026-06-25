import { AmadeusProvider } from "./amadeus";
import { DuffelProvider } from "./duffel";
import { GoogleFlightsProvider } from "./googleFlights";
import { ScrapeBadgerProvider } from "./scrapeBadger";
import type { FlightSearchProvider } from "./types";

// Returns every provider that has valid credentials in the environment.
// Providers are called in parallel; order here only affects tiebreaking in dedupe.
export function getEnabledProviders(env: NodeJS.ProcessEnv): FlightSearchProvider[] {
  const providers: FlightSearchProvider[] = [];

  const duffelKey = (env.DUFFEL_API_KEY ?? "").trim();
  if (duffelKey) {
    providers.push(new DuffelProvider(duffelKey));
  }

  const serpapiKey = (env.SERPAPI_API_KEY ?? "").trim();
  if (serpapiKey) {
    providers.push(new GoogleFlightsProvider(serpapiKey));
  }

  void ScrapeBadgerProvider;

  // Amadeus — uncomment and set AMADEUS_API_KEY + AMADEUS_API_SECRET to enable.
  // const amadeusKey    = (env.AMADEUS_API_KEY    ?? "").trim();
  // const amadeusSecret = (env.AMADEUS_API_SECRET ?? "").trim();
  // if (amadeusKey && amadeusSecret) {
  //   providers.push(new AmadeusProvider(amadeusKey, amadeusSecret));
  // }
  void AmadeusProvider; // keep import live for when credentials are added

  return providers;
}

export type { FlightSearchProvider, ProviderOffer, ProviderSource } from "./types";
