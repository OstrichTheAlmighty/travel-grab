export type ActivitySource =
  | "google"
  | "overture"
  | "wikimedia"
  | "wikipedia"
  | "wikivoyage"
  | "viator"
  | "manual";

export interface ActivityPhoto {
  provider: ActivitySource;
  /** Opaque provider reference (e.g. Google Places photo name) — must be passed through proxy */
  ref?: string;
  /** Direct URL when no proxy is required */
  url?: string;
  proxy_required: boolean;
  width?: number;
  height?: number;
  attribution_name?: string;
  attribution_url?: string;
  license?: string;
  /** Lower number = higher priority */
  priority: number;
  is_fallback: boolean;
}

export interface ActivityCapabilities {
  photos: boolean;
  rating: boolean;
  review_count: boolean;
  written_reviews: boolean;
  opening_hours: boolean;
  phone: boolean;
  website: boolean;
  map_link: boolean;
  booking: boolean;
  live_availability: boolean;
  price: boolean;
}

export interface ActivityProviderIdentifier {
  source: ActivitySource;
  id: string;
}

export interface NormalizedActivity {
  /** Canonical identity — maps to activities.id (UUID PK) or provider ID before DB write */
  id: string;

  provider_ids: ActivityProviderIdentifier[];

  /** Google Place ID — preserved for backward compatibility with existing UI and API routes */
  place_id?: string;
  /** Raw GooglePlace object as stored in the google_places_data JSONB column */
  google_places_data?: Record<string, unknown>;

  title: string;
  description?: string;
  city: string;
  category: string;

  photos: ActivityPhoto[];
  /** Legacy direct image URL stored in the DB activities.image_url column */
  image_url?: string;

  rating?: number;
  review_count?: number;

  website?: string;
  map_link?: string;
  lat?: number;
  lng?: number;

  /** Corresponds to activities.search_keywords (Phase 1 column); derived from querySources */
  search_keywords: string[];

  capabilities: ActivityCapabilities;

  source: ActivitySource;
  /** ISO timestamp of when the normalized record was built */
  built_at?: string;

  /**
   * Local-language primary name when it differs from the English title.
   * Populated by the Overture adapter (e.g. Japanese: "東京タワー").
   * Used by the cross-provider entity-matching pipeline.
   */
  name_local?: string;
  /**
   * All language variants of the name keyed by BCP-47 language code.
   * Populated by the Overture adapter from names.common entries.
   * Example: { "en": "Tokyo Tower", "ja": "東京タワー", "ja-Latn": "Tōkyō Tawā" }
   */
  name_alts?: Record<string, string>;

  /**
   * Source attribution — populated when the provider aggregates data from
   * multiple upstream datasets (e.g. Overture Places, which combines Meta,
   * OpenStreetMap, and other contributors).
   */
  source_dataset?: string;     // primary contributing dataset (e.g. "meta")
  source_record_id?: string;   // original record ID in that dataset
  attribution?: string;        // human-readable attribution string
  license?: string;            // SPDX license identifier or descriptive name
  /** Provider-specific source fields preserved without shaping the shared UI model. */
  source_metadata?: Record<string, unknown>;
}
