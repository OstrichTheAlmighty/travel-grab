/**
 * Phase-one storage policy.
 *
 * Legacy rows remain readable for UI compatibility. New catalog writes are
 * disabled pending a provider-policy review and a migration plan.
 */
export const GOOGLE_STABLE_IDENTITY_FIELDS = ["place_id"] as const;

export const GOOGLE_LEGACY_READ_ONLY_FIELDS = [
  "image_url/photo resource name",
  "google_places_data.rating",
  "google_places_data.userRatingCount",
  "google_places_data.formattedAddress",
  "google_places_data.shortFormattedAddress",
  "google_places_data.regularOpeningHours",
  "google_places_data.websiteUri",
  "google_places_data.googleMapsUri",
  "google_places_data.location",
  "google_places_data.types",
  "google_places_data.priceLevel",
  "description derived from editorialSummary",
  "written reviews and review authors",
  "generated summaries derived from reviews",
] as const;

export function mayPersistNewGoogleField(field: string): boolean {
  return (GOOGLE_STABLE_IDENTITY_FIELDS as readonly string[]).includes(field);
}
