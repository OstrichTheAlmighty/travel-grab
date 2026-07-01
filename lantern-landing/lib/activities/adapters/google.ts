import type { InventoryEntry, GooglePlace } from "../../../app/api/activities/_inventory";
import type {
  NormalizedActivity,
  ActivityPhoto,
  ActivityCapabilities,
  ActivityProviderIdentifier,
} from "../types";

export interface GoogleAdapterOptions {
  /**
   * UUID from activities.id. Falls back to Google place ID if absent
   * (e.g. when normalizing an in-memory entry before the DB write).
   */
  id?: string;
  /** Value of activities.image_url stored in the DB (may predate Phase 1 migration). */
  image_url?: string;
}

function buildCapabilities(place: GooglePlace): ActivityCapabilities {
  return {
    photos:            (place.photos?.length ?? 0) > 0,
    rating:            typeof place.rating === "number",
    review_count:      typeof place.userRatingCount === "number",
    written_reviews:   false, // Places API (New) does not surface review text
    opening_hours:     !!place.regularOpeningHours,
    phone:             false, // not in PLACES_FIELD_MASK
    website:           !!place.websiteUri,
    map_link:          !!place.googleMapsUri,
    booking:           false,
    live_availability: false,
    price:             !!place.priceLevel,
  };
}

function buildPhotos(place: GooglePlace): ActivityPhoto[] {
  if (!place.photos?.length) return [];
  return place.photos.map((p, i) => ({
    provider:         "google" as const,
    ref:              p.name,
    proxy_required:   true,
    width:            p.widthPx,
    height:           p.heightPx,
    attribution_name: "Google",
    attribution_url:  "https://www.google.com",
    license:          "Google Places API Terms",
    priority:         i,
    is_fallback:      false,
  }));
}

/**
 * Converts a Google-backed InventoryEntry into a provider-neutral NormalizedActivity.
 *
 * Preserves all fields required by the existing UI:
 *   - place_id and google_places_data (used by mapToActivity, photo proxy, place detail routes)
 *   - opaque Google photo names in photos[].ref (passed through /api/activities/photo)
 *   - querySources mapped to search_keywords (used by search route)
 *
 * Null Phase 1 columns (source, photos, capabilities, search_keywords, built_at) are
 * handled gracefully — missing querySources defaults to [] rather than throwing.
 */
export function normalizeGoogleEntry(
  entry: InventoryEntry,
  city: string,
  opts: GoogleAdapterOptions = {},
): NormalizedActivity {
  const { place, category, querySources } = entry;

  const providerIds: ActivityProviderIdentifier[] = [
    { source: "google", id: place.id },
  ];

  return {
    id:                  opts.id ?? place.id,
    provider_ids:        providerIds,
    place_id:            place.id,
    google_places_data:  place as unknown as Record<string, unknown>,
    title:               place.displayName?.text ?? "(unnamed)",
    description:         place.editorialSummary?.text,
    city,
    category,
    photos:              buildPhotos(place),
    image_url:           opts.image_url,
    rating:              place.rating,
    review_count:        place.userRatingCount,
    website:             place.websiteUri,
    map_link:            place.googleMapsUri,
    lat:                 place.location?.latitude,
    lng:                 place.location?.longitude,
    search_keywords:     querySources ?? [],
    capabilities:        buildCapabilities(place),
    source:              "google",
  };
}
