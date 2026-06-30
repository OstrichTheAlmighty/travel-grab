export const GOOGLE_DETAIL_LEVELS = [
  "modal_standard",
  "modal_rich_reviews",
  "modal_gallery",
] as const;

export type GoogleDetailLevel = (typeof GOOGLE_DETAIL_LEVELS)[number];

export interface GoogleAuthorAttribution {
  displayName?: string;
  uri?: string;
  photoUri?: string;
}

export interface GooglePhotoMetadata {
  name: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: GoogleAuthorAttribution[];
}

export interface GooglePlaceReview {
  name?: string;
  relativePublishTimeDescription?: string;
  rating?: number;
  text?: { text: string; languageCode?: string };
  originalText?: { text: string; languageCode?: string };
  authorAttribution?: GoogleAuthorAttribution;
  publishTime?: string;
  googleMapsUri?: string;
}

export interface GooglePlaceDetail {
  id: string;
  displayName?: { text: string; languageCode?: string };
  photos?: GooglePhotoMetadata[];
  rating?: number;
  userRatingCount?: number;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  types?: string[];
  regularOpeningHours?: {
    openNow?: boolean;
    weekdayDescriptions?: string[];
    periods?: Array<{
      open?: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  reviews?: GooglePlaceReview[];
  attributions?: Array<{ provider?: string; providerUri?: string }>;
  detailLevel?: GoogleDetailLevel;
  source?: "places_api" | "cache";
}

export const GOOGLE_DETAIL_FIELD_MASKS: Record<GoogleDetailLevel, string> = {
  // Enterprise fields (rating/hours/phone/website) are intentionally isolated
  // from reviews. Places returns photo metadata as a collection, so the route
  // trims this response to the first hero photo before sending it to the client.
  modal_standard: [
    "id",
    "displayName",
    "formattedAddress",
    "shortFormattedAddress",
    "rating",
    "userRatingCount",
    "regularOpeningHours",
    "websiteUri",
    "nationalPhoneNumber",
    "internationalPhoneNumber",
    "googleMapsUri",
    "photos",
    "attributions",
  ].join(","),
  // Enterprise + Atmosphere because written reviews are requested.
  modal_rich_reviews: ["id", "reviews"].join(","),
  // Photo metadata itself is returned by Place Details; media bytes are billed
  // separately only when /api/activities/photo is requested.
  modal_gallery: ["id", "photos"].join(","),
};

export function parseGoogleDetailLevel(value: string | null): GoogleDetailLevel | null {
  const candidate = value ?? "modal_standard";
  return GOOGLE_DETAIL_LEVELS.includes(candidate as GoogleDetailLevel)
    ? candidate as GoogleDetailLevel
    : null;
}

export function sanitizeDetailResponse(
  detail: GooglePlaceDetail,
  level: GoogleDetailLevel,
): GooglePlaceDetail {
  if (level === "modal_standard") {
    return { ...detail, photos: detail.photos?.slice(0, 1), reviews: undefined, detailLevel: level };
  }
  if (level === "modal_rich_reviews") {
    return { id: detail.id, reviews: detail.reviews, detailLevel: level };
  }
  return { id: detail.id, photos: detail.photos, detailLevel: level };
}

export function mergeGalleryPhotos(
  current: GooglePhotoMetadata[] | undefined,
  gallery: GooglePhotoMetadata[] | undefined,
): GooglePhotoMetadata[] | undefined {
  if (!current?.[0]) return gallery;
  if (!gallery?.length) return current;
  // Google can mint a different resource name for the same lead photo on each
  // Details response. Keep the already-loaded hero and use the remaining gallery.
  return [current[0], ...gallery.slice(1)];
}
