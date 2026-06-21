export type ActivityType =
  | "nightlife"    // clubs, bars, lounges — must start 8pm+
  | "sightseeing"  // temples, parks, museums, landmarks
  | "restaurant"   // sit-down food experiences
  | "market"       // markets, shopping districts
  | "adventure";   // hiking, theme parks, sports

export type TimePreference = "morning" | "afternoon" | "evening" | "flexible";

export interface ActivityProfile {
  activityType:    ActivityType;
  timePreference:  TimePreference;
  durationMinutes: number;
}

const FOOD_EXCEPTIONS = ["ramen", "sushi", "tempura", "oyster", "noodle", "izakaya"];

export function profileActivity(activity: {
  title:            string;
  category?:        string;
  durationMinutes?: number;
}): ActivityProfile {
  const title    = (activity.title ?? "").toLowerCase();
  const category = (activity.category ?? "").toLowerCase();
  const dur      = activity.durationMinutes ?? defaultDuration(category, title);

  // Nightlife: category flag OR title keywords (but not food bars)
  if (
    category === "nightlife" ||
    title.includes("nightclub") ||
    title.includes("burlesque") ||
    title.includes(" club") ||
    title.includes(" lounge") ||
    (title.includes(" bar") && !FOOD_EXCEPTIONS.some((f) => title.includes(f)))
  ) {
    return { activityType: "nightlife", timePreference: "evening", durationMinutes: dur };
  }

  // Restaurant: food category + recognisable meal keywords
  if (
    (category === "food" || category === "cuisine") &&
    ["ramen", "sushi", "restaurant", "izakaya", "kaiseki", "yakiniku", "tempura",
     "omakase", "tonkatsu", "gyoza", "wagyu", "okonomiyaki", "seafood", "grill",
     "cafe", "café", "dining"].some((k) => title.includes(k))
  ) {
    return { activityType: "restaurant", timePreference: "flexible", durationMinutes: dur };
  }

  // Market: shopping districts best in the morning
  if (["market", "bazaar", "shopping", "arcade", "tsukiji", "nishiki", "kuromon"].some((k) => title.includes(k))) {
    return { activityType: "market", timePreference: "morning", durationMinutes: dur };
  }

  // Adventure: physical, best started early
  if (category === "adventure" || ["hiking", "trek", "cycling", "kayak", "surf"].some((k) => title.includes(k))) {
    return { activityType: "adventure", timePreference: "morning", durationMinutes: dur };
  }

  // Sightseeing (default) — time preference from title hints
  const timePreference: TimePreference =
    ["sunrise", "morning market", "fish market"].some((k) => title.includes(k))    ? "morning"   :
    ["observation", "skytree", "tower", "sunset", "skyline"].some((k) => title.includes(k)) ? "afternoon" :
    "flexible";

  return { activityType: "sightseeing", timePreference, durationMinutes: dur };
}

function defaultDuration(category: string, title: string): number {
  if (["disney", "universal", "theme park"].some((k) => title.includes(k))) return 360;
  if (["onsen", "spa", "hot spring"].some((k) => title.includes(k))) return 120;
  if (["museum", "gallery"].some((k) => title.includes(k))) return 90;
  if (["shrine", "temple", "jinja"].some((k) => title.includes(k))) return 60;
  if (["castle", "palace"].some((k) => title.includes(k))) return 75;
  if (["market"].some((k) => title.includes(k))) return 90;
  if (["park", "garden", "forest"].some((k) => title.includes(k))) return 75;
  if (["tower", "observation"].some((k) => title.includes(k))) return 60;
  switch (category) {
    case "food":      return 75;
    case "nightlife": return 120;
    case "culture":   return 90;
    case "adventure": return 180;
    case "nature":    return 90;
    case "luxury":    return 120;
    default:          return 90;
  }
}
