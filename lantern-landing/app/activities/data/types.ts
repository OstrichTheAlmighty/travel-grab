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
  gradient: string;    // CSS gradient string for hero background (fallback when no photo)
  photoRef?: string;   // Google Places photo_reference — fetched via /api/activities/photo
  placeId?:  string;   // Google Place ID
}

export interface DestinationData {
  city: string;
  country: string;
  activities: Activity[];
}
