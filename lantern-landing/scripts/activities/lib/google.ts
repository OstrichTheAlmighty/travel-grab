import type { GoogleRow } from "./types";

export type { GoogleRow } from "./types";

export function getGoogleCoords(row: GoogleRow): { lat: number; lng: number } | null {
  const data = row.google_places_data as {
    location?: { latitude?: number; longitude?: number };
  } | null;
  const lat = data?.location?.latitude;
  const lng = data?.location?.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || lat === 0 || lng === 0) return null;
  return { lat, lng };
}
