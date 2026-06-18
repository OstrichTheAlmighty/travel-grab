import type { Review, ReviewProvider, ReviewsResult, FetchParams } from "../types";
import { emptyResult } from "../types";

// Google Places API (New) hard-caps responses at 5 reviews with no pagination token.
// providerLimitReached is set to true whenever the total count exceeds what was returned.
const GOOGLE_MAX_SNIPPETS = 5;

const PLACES_BASE = "https://places.googleapis.com/v1";

const PLACE_FIELD_MASK = [
  "id",
  "rating",
  "userRatingCount",
  "reviews.rating",
  "reviews.text",
  "reviews.relativePublishTimeDescription",
  "reviews.publishTime",
  "reviews.authorAttribution",
  "reviews.googleMapsUri",
].join(",");

type RawReview = {
  rating?: number;
  text?: { text?: string; languageCode?: string };
  relativePublishTimeDescription?: string;
  publishTime?: string;
  authorAttribution?: { displayName?: string; photoUri?: string };
  googleMapsUri?: string;
};

async function resolveGooglePlaceId(
  hotelName: string,
  city: string,
  apiKey: string,
): Promise<string | null> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type":    "application/json",
      "X-Goog-Api-Key":  apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
    },
    body: JSON.stringify({
      textQuery:      `${hotelName} hotel ${city}`,
      maxResultCount: 1,
    }),
  });

  if (!res.ok) {
    console.error("[google_places] searchText failed:", res.status, (await res.text()).slice(0, 200));
    return null;
  }

  const data = (await res.json()) as { places?: { id?: string }[] };
  return data.places?.[0]?.id ?? null;
}

async function fetchFromPlacesApi(
  placeId: string,
  apiKey: string,
): Promise<ReviewsResult | null> {
  const res = await fetch(`${PLACES_BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key":  apiKey,
      "X-Goog-FieldMask": PLACE_FIELD_MASK,
    },
  });

  if (!res.ok) {
    console.error("[google_places] place details failed:", res.status, (await res.text()).slice(0, 200));
    return null;
  }

  const data = (await res.json()) as {
    id?: string;
    rating?: number;
    userRatingCount?: number;
    reviews?: RawReview[];
  };

  const totalReviewCount = data.userRatingCount ?? 0;
  const reviews: Review[] = (data.reviews ?? []).map((r): Review => {
    const authorName  = r.authorAttribution?.displayName ?? "Guest";
    const publishTime = r.publishTime ?? "";
    return {
      id:              `google_places:${authorName}:${publishTime}`,
      authorName,
      rating:          r.rating ?? 0,
      relativeTime:    r.relativePublishTimeDescription ?? "",
      publishTime,
      text:            r.text?.text ?? "",
      source:          "google_places",
      profilePhotoUrl: r.authorAttribution?.photoUri ?? "",
      externalUrl:     r.googleMapsUri ?? "",
    };
  });

  return {
    reviews,
    aggregateRating:      data.rating ?? 0,
    totalReviewCount,
    hasMore:              false, // Places API (New) has no cursor pagination for reviews
    nextCursor:           null,
    // Google caps at GOOGLE_MAX_SNIPPETS; flag it when there are more reviews than snippets
    providerLimitReached: totalReviewCount > reviews.length || reviews.length >= GOOGLE_MAX_SNIPPETS,
    source:               "google_places",
  };
}

export function createGooglePlacesProvider(apiKey: string): ReviewProvider {
  return {
    source: "google_places",

    async fetchReviews(params: FetchParams): Promise<ReviewsResult> {
      let placeId = params.placeId ?? "";

      if (!placeId) {
        if (!params.city) {
          console.warn("[google_places] fetchReviews called without placeId or city");
          return emptyResult("google_places");
        }
        placeId = (await resolveGooglePlaceId(params.hotelName, params.city, apiKey)) ?? "";
      }

      if (!placeId) return emptyResult("google_places");

      const result = await fetchFromPlacesApi(placeId, apiKey);
      if (!result) return emptyResult("google_places");

      console.log(
        `[google_places] "${params.hotelName}" → ${placeId} · ${result.reviews.length} snippets of ${result.totalReviewCount} total`,
      );

      return result;
    },
  };
}
