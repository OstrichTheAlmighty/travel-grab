export type Category =
  | "food"
  | "nightlife"
  | "culture"
  | "adventure"
  | "nature"
  | "luxury"
  | "hidden_gems";

export type Badge =
  | "hidden_gem"
  | "worth_the_splurge"
  | "family_friendly"
  | "popular"
  | "free";

export interface Activity {
  id: string;
  title: string;
  neighborhood: string;
  duration: string;
  price: string;
  isFree: boolean;
  rating: number;
  reviewCount: number;
  description: string;
  whyVisit: string;
  category: Category;
  tags: string[];
  badges: Badge[];
  emoji: string;
  gradient: string;          // CSS gradient — fallback hero when no Google photo
  photoRef?: string;         // Places API (New) photo name → /api/activities/photo?name=...
  placeId?:  string;         // Google Place ID
  // Real Google fields surfaced when available
  websiteUri?: string;
  googleMapsUri?: string;
  openNow?: boolean;
  // Which Google search queries found this place (e.g. ["ramen restaurant", "restaurant"])
  // Used by search to match "ramen" even when the place name is in Japanese
  querySources?: string[];
}

export interface DestinationData {
  city: string;
  country: string;
  activities: Activity[];
}
