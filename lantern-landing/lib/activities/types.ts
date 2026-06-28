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
}
