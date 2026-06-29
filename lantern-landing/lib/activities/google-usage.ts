export type GoogleUsageKind =
  | "text_search"
  | "nearby_search"
  | "geocoding"
  | "place_details_modal_standard"
  | "place_details_modal_rich_reviews"
  | "place_details_modal_gallery"
  | "place_photo"
  | "review_insights";

export interface GoogleUsageSnapshot {
  date: string;
  counts: Record<GoogleUsageKind, number>;
  cacheHits: number;
  inFlightDeduplicationHits: number;
}

const KINDS: GoogleUsageKind[] = [
  "text_search", "nearby_search", "geocoding",
  "place_details_modal_standard", "place_details_modal_rich_reviews",
  "place_details_modal_gallery", "place_photo", "review_insights",
];

function emptyCounts(): Record<GoogleUsageKind, number> {
  return Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<GoogleUsageKind, number>;
}

let state: GoogleUsageSnapshot = {
  date: new Date().toISOString().slice(0, 10),
  counts: emptyCounts(),
  cacheHits: 0,
  inFlightDeduplicationHits: 0,
};

function currentState(): GoogleUsageSnapshot {
  const date = new Date().toISOString().slice(0, 10);
  if (state.date !== date) state = { date, counts: emptyCounts(), cacheHits: 0, inFlightDeduplicationHits: 0 };
  return state;
}

const ENV_CAPS: Record<GoogleUsageKind, string> = {
  text_search: "GOOGLE_DAILY_CAP_TEXT_SEARCH",
  nearby_search: "GOOGLE_DAILY_CAP_NEARBY_SEARCH",
  geocoding: "GOOGLE_DAILY_CAP_GEOCODING",
  place_details_modal_standard: "GOOGLE_DAILY_CAP_DETAILS_STANDARD",
  place_details_modal_rich_reviews: "GOOGLE_DAILY_CAP_DETAILS_RICH_REVIEWS",
  place_details_modal_gallery: "GOOGLE_DAILY_CAP_DETAILS_GALLERY",
  place_photo: "GOOGLE_DAILY_CAP_PLACE_PHOTOS",
  review_insights: "GOOGLE_DAILY_CAP_REVIEW_INSIGHTS",
};

export function getDailyCap(kind: GoogleUsageKind): number {
  const raw = process.env[ENV_CAPS[kind]];
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.POSITIVE_INFINITY;
}

export function canSpend(kind: GoogleUsageKind): boolean {
  return currentState().counts[kind] < getDailyCap(kind);
}

export function recordGoogleUsage(kind: GoogleUsageKind): boolean {
  if (!canSpend(kind)) return false;
  currentState().counts[kind]++;
  return true;
}

export function recordServerCacheHit(): void { currentState().cacheHits++; }
export function recordServerInFlightHit(): void { currentState().inFlightDeduplicationHits++; }

export function getGoogleUsageSnapshot(): GoogleUsageSnapshot {
  const current = currentState();
  return { ...current, counts: { ...current.counts } };
}

export function resetGoogleUsageForTests(): void {
  state = { date: new Date().toISOString().slice(0, 10), counts: emptyCounts(), cacheHits: 0, inFlightDeduplicationHits: 0 };
}
