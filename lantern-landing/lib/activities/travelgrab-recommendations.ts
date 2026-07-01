export interface TravelGrabRecommendationActivity {
  category?: string;
  tags?: string[];
  description?: string;
  duration?: string;
  isFree?: boolean;
  neighborhood?: string;
  reviewCount?: number;
  badges?: string[];
}

export interface TravelGrabRecommendationContext {
  travelStyles?: string[];
  pace?: "relaxed" | "balanced" | "packed";
  travelers?: number;
  firstTime?: boolean | null;
  startDate?: string;
  returnDate?: string;
}

export interface TravelGrabRecommendationCard {
  id: "best_for" | "watch_out" | "best_time" | "planning_tip";
  label: "Best for" | "Watch out" | "Best time" | "Planning tip";
  text: string;
}

const CATEGORY_AUDIENCE: Record<string, string> = {
  food: "food-focused travelers",
  nightlife: "evening outings",
  culture: "culture-focused travelers",
  adventure: "active itineraries",
  nature: "outdoor-focused travelers",
  luxury: "special-occasion travelers",
  hidden_gems: "travelers exploring beyond the headline sights",
};

function hasSignal(signals: string[], needles: string[]): boolean {
  return needles.some((needle) => signals.some((signal) => signal.includes(needle)));
}

function compactUnique(items: Array<string | null | undefined>, limit = 3): string[] {
  return [...new Set(items.filter((item): item is string => Boolean(item)))].slice(0, limit);
}

function buildBestFor(
  activity: TravelGrabRecommendationActivity,
  context?: TravelGrabRecommendationContext,
): string {
  const signals = [...(activity.tags ?? []), ...(activity.badges ?? [])].map((value) => value.toLowerCase());
  const styles = new Set(context?.travelStyles ?? []);
  const audiences = compactUnique([
    signals.includes("family_friendly") || styles.has("family") ? "families" : null,
    hasSignal(signals, ["museum", "gallery", "historical", "temple", "shrine"])
      ? "history and culture interests"
      : null,
    hasSignal(signals, ["park", "garden", "nature", "beach"])
      ? "parks and outdoor time"
      : null,
    hasSignal(signals, ["market", "food", "restaurant", "cafe"])
      ? "food and market culture"
      : null,
    hasSignal(signals, ["interactive", "theme park", "amusement", "aquarium", "zoo"])
      ? "interactive and family attractions"
      : null,
    context?.firstTime && hasSignal(signals, ["landmark", "sightseeing", "observation", "temple", "shrine"])
      ? "first-time city highlights"
      : null,
    CATEGORY_AUDIENCE[activity.category ?? ""],
  ]);

  return audiences.length > 0
    ? audiences.join(", ")
    : "Travelers looking for a flexible sightseeing stop";
}

function buildWatchOut(activity: TravelGrabRecommendationActivity): string {
  const reviewCount = activity.reviewCount ?? 0;
  if (reviewCount >= 5_000) {
    return "Popular place; leave flexibility around peak periods and weekends";
  }
  if (activity.isFree === false) {
    return "Paid activity; confirm current admission details before visiting";
  }
  if (activity.category === "nightlife") {
    return "Evening-focused stop; check how it fits with your return plans";
  }
  return "Confirm current opening information before setting a fixed schedule";
}

function buildBestTime(activity: TravelGrabRecommendationActivity): string {
  const signals = (activity.tags ?? []).map((value) => value.toLowerCase());
  if (activity.category === "nightlife") return "Plan this as an evening stop";
  if (activity.category === "food") return "Place it around your preferred meal time";
  if (activity.category === "nature" || hasSignal(signals, ["park", "garden", "nature", "beach"])) {
    return "Morning or late afternoon fits an outdoor-focused visit";
  }
  if (activity.category === "culture" || hasSignal(signals, ["museum", "gallery", "temple", "shrine"])) {
    return "A weekday morning is an easy slot to build around";
  }
  return "Use a flexible morning or afternoon slot";
}

function buildPlanningTip(
  activity: TravelGrabRecommendationActivity,
  context?: TravelGrabRecommendationContext,
): string {
  const duration = activity.duration?.trim();
  const neighborhood = activity.neighborhood?.trim();
  const firstSentence = duration ? `Allow ${duration}.` : "Leave flexible time around this stop.";

  if (context?.pace === "relaxed" && neighborhood) {
    return `${firstSentence} Keep the next stop nearby in ${neighborhood}.`;
  }
  if (neighborhood) {
    return `${firstSentence} Pair it with another ${neighborhood} stop to reduce transit.`;
  }
  if (activity.isFree === false) {
    return `${firstSentence} Confirm current admission details before visiting.`;
  }
  return `${firstSentence} Confirm current practical details before visiting.`;
}

export function buildTravelGrabRecommendations(
  activity: TravelGrabRecommendationActivity,
  context?: TravelGrabRecommendationContext,
): TravelGrabRecommendationCard[] {
  return [
    { id: "best_for", label: "Best for", text: buildBestFor(activity, context) },
    { id: "watch_out", label: "Watch out", text: buildWatchOut(activity) },
    { id: "best_time", label: "Best time", text: buildBestTime(activity) },
    { id: "planning_tip", label: "Planning tip", text: buildPlanningTip(activity, context) },
  ];
}
