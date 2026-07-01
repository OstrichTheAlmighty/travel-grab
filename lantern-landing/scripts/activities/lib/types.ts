export interface BoundingBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export interface GoogleRow {
  id: string;
  title: string;
  city: string;
  category: string | null;
  image_url: string | null;
  google_places_data: Record<string, unknown> | null;
}

export type AttractionFinding =
  | "found_and_retained"
  | "outside_bbox"
  | `not_in_${string}`;

export interface AttractionStatus {
  name: string;
  finding: AttractionFinding;
  matchedTitle?: string;
  matchedId?: string;
  lat?: number;
  lng?: number;
  note?: string;
}
