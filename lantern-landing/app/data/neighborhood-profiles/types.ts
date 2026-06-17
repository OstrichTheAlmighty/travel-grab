export interface NeighborhoodScores {
  luxury:          number;  // 0-100
  food:            number;
  nightlife:       number;
  transit:         number;
  walkability:     number;
  shopping:        number;
  local_character: number;
}

export type PriceTier = "budget" | "mid" | "upscale" | "luxury";

export interface NeighborhoodProfile {
  id:         string;      // matches NeighborhoodCard.id in CITY_GUIDES
  name:       string;
  scores:     NeighborhoodScores;
  price_tier: PriceTier;
  vibe:       string;      // one-line character summary
  best_for:   string[];    // traveler types
}

export interface CompareCategory {
  key:   keyof NeighborhoodScores;
  label: string;
}

export const COMPARE_CATEGORIES: CompareCategory[] = [
  { key: "luxury",          label: "Luxury" },
  { key: "food",            label: "Food & Dining" },
  { key: "nightlife",       label: "Nightlife" },
  { key: "transit",         label: "Transit" },
  { key: "walkability",     label: "Walkability" },
  { key: "shopping",        label: "Shopping" },
  { key: "local_character", label: "Local Character" },
];

export const PRICE_TIER_LABELS: Record<PriceTier, string> = {
  budget:  "$",
  mid:     "$$",
  upscale: "$$$",
  luxury:  "$$$$",
};
