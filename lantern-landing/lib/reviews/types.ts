// Normalized review types shared between the server-side service and client UI.
// No provider-specific fields leak through here.

export type ReviewSource = "google_places" | "tripadvisor" | "future_provider";

export interface Review {
  id: string;               // stable: "{source}:{authorName}:{publishTime}"
  authorName: string;
  rating: number;           // 1–5
  relativeTime: string;     // human-readable, e.g. "2 months ago"
  publishTime: string;      // ISO 8601 — used for client-side date sort
  text: string;
  source: ReviewSource;
  profilePhotoUrl: string;
  externalUrl: string;      // deep-link to the review on the provider's site
}

export interface ReviewsResult {
  reviews: Review[];
  aggregateRating: number;   // overall rating (0 if unavailable)
  totalReviewCount: number;  // total reviews on the platform (may far exceed reviews.length)
  hasMore: boolean;          // true if a next page exists via cursor pagination
  nextCursor: string | null; // opaque cursor to pass back for the next page
  providerLimitReached: boolean; // true when the provider caps how many reviews it returns
  source: ReviewSource;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface FetchParams {
  hotelName: string;
  city: string;
  placeId?: string;   // skip searchText lookup when already known
  cursor?: string;    // for paginated providers
}

export interface ReviewProvider {
  readonly source: ReviewSource;
  fetchReviews(params: FetchParams): Promise<ReviewsResult>;
}

// ── AI summary ────────────────────────────────────────────────────────────────

export interface ReviewSummary {
  available: boolean;
  limitedCoverage: boolean; // true when based on ≤3 review snippets
  guestsLove: string[];
  commonComplaints: string[];
  bestFor: string[];
  notIdealFor: string[];
}

export const emptySummary: ReviewSummary = {
  available:        false,
  limitedCoverage:  false,
  guestsLove:       [],
  commonComplaints: [],
  bestFor:          [],
  notIdealFor:      [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function emptyResult(source: ReviewSource): ReviewsResult {
  return {
    reviews:             [],
    aggregateRating:     0,
    totalReviewCount:    0,
    hasMore:             false,
    nextCursor:          null,
    providerLimitReached: false,
    source,
  };
}
