export type TravelStyle =
  | "food" | "culture" | "nightlife" | "hidden_gems" | "photography"
  | "luxury" | "family" | "history" | "nature" | "shopping"
  | "anime" | "first_time" | "budget";

export type Verdict = "must_do" | "worth_if" | "skip_if" | "overrated" | "hidden_gem";
export type CrowdLevel = "low" | "moderate" | "high" | "very_high";
export type DayPart = "morning" | "afternoon" | "evening";

export interface Activity {
  id: string;
  name: string;
  category: string;
  categoryIcon: string;
  worthItScore: number;       // 0–100: overall advisability
  timeRequiredHours: number;
  bestTime: string;
  crowdLevel: CrowdLevel;
  whyItMatches: string;       // personalised to the matched styles
  skipIf: string;
  neighborhood: string;
  styles: TravelStyle[];

  // ROI breakdown
  experienceValue: number;    // 0–100: payoff density
  timeCost: number;           // hours including transit to/from center
  transitFriction: number;    // 0–100: higher = harder/farther to reach
  crowdPenalty: number;       // 0–100: crowd drag on experience
  timeRoiScore: number;       // final ROI score 0–100

  // Worth It / Skip It
  verdict: Verdict;
  worthIfCondition?: string;  // shown when verdict === "worth_if"
  skipIfCondition?: string;   // shown when verdict === "skip_if"
  overratedReason?: string;   // shown when verdict === "overrated"
  hiddenGemReason?: string;   // shown when verdict === "hidden_gem"

  // Optional
  price?: string;             // "Free", "¥2,000", etc.
  bookingRequired?: boolean;
}

export interface Neighborhood {
  id: string;
  name: string;
  tagline: string;
  description: string;
  styles: TravelStyle[];
  highlights: string[];
  bestFor: string;
  notFor: string;
  transitScore: number;       // 0–100
  crowdLevel: CrowdLevel;
}

export interface ItineraryBlock {
  dayPart: DayPart;
  label: string;              // e.g. "Morning · Asakusa"
  activityIds: string[];
  neighborhood: string;
  transitNote?: string;
  vibe: string;               // one-line mood description
}

export interface DestinationData {
  city: string;
  country: string;
  tagline: string;
  activities: Activity[];
  neighborhoods: Neighborhood[];
  sampleDay: ItineraryBlock[];  // one suggested day (3 blocks)
}
