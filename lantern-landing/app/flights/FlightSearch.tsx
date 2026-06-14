"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

// ── Airport data ──────────────────────────────────────────────────────────────

const AIRPORTS = [
  { code: "JFK", city: "New York", name: "John F. Kennedy Intl", country: "US" },
  { code: "LGA", city: "New York", name: "LaGuardia", country: "US" },
  { code: "EWR", city: "Newark", name: "Newark Liberty Intl", country: "US" },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles Intl", country: "US" },
  { code: "BUR", city: "Burbank", name: "Hollywood Burbank Airport", country: "US" },
  { code: "LGB", city: "Long Beach", name: "Long Beach Airport", country: "US" },
  { code: "SNA", city: "Santa Ana", name: "John Wayne Airport", country: "US" },
  { code: "ONT", city: "Ontario", name: "Ontario Intl", country: "US" },
  { code: "SFO", city: "San Francisco", name: "San Francisco Intl", country: "US" },
  { code: "OAK", city: "Oakland", name: "Oakland Intl", country: "US" },
  { code: "SJC", city: "San Jose", name: "San Jose Intl", country: "US" },
  { code: "ORD", city: "Chicago", name: "O'Hare Intl", country: "US" },
  { code: "MDW", city: "Chicago", name: "Midway Intl", country: "US" },
  { code: "DCA", city: "Washington", name: "Ronald Reagan National", country: "US" },
  { code: "IAD", city: "Washington", name: "Dulles Intl", country: "US" },
  { code: "BWI", city: "Baltimore", name: "Baltimore/Washington Intl", country: "US" },
  { code: "MIA", city: "Miami", name: "Miami Intl", country: "US" },
  { code: "BOS", city: "Boston", name: "Logan Intl", country: "US" },
  { code: "SEA", city: "Seattle", name: "Seattle-Tacoma Intl", country: "US" },
  { code: "DEN", city: "Denver", name: "Denver Intl", country: "US" },
  { code: "ATL", city: "Atlanta", name: "Hartsfield-Jackson Intl", country: "US" },
  { code: "DFW", city: "Dallas", name: "Dallas/Fort Worth Intl", country: "US" },
  { code: "IAH", city: "Houston", name: "George Bush Intercontinental", country: "US" },
  { code: "PHX", city: "Phoenix", name: "Sky Harbor Intl", country: "US" },
  { code: "LAS", city: "Las Vegas", name: "Harry Reid Intl", country: "US" },
  { code: "MCO", city: "Orlando", name: "Orlando Intl", country: "US" },
  { code: "MSP", city: "Minneapolis", name: "Minneapolis-Saint Paul Intl", country: "US" },
  { code: "DTW", city: "Detroit", name: "Detroit Metropolitan", country: "US" },
  { code: "PDX", city: "Portland", name: "Portland Intl", country: "US" },
  { code: "SAN", city: "San Diego", name: "San Diego Intl", country: "US" },
  { code: "BNA", city: "Nashville", name: "Nashville Intl", country: "US" },
  { code: "AUS", city: "Austin", name: "Austin-Bergstrom Intl", country: "US" },
  { code: "LHR", city: "London", name: "Heathrow", country: "GB" },
  { code: "LGW", city: "London", name: "Gatwick", country: "GB" },
  { code: "STN", city: "London", name: "Stansted", country: "GB" },
  { code: "LCY", city: "London", name: "London City", country: "GB" },
  { code: "LTN", city: "London", name: "Luton Airport", country: "GB" },
  { code: "CDG", city: "Paris", name: "Charles de Gaulle", country: "FR" },
  { code: "ORY", city: "Paris", name: "Orly", country: "FR" },
  { code: "AMS", city: "Amsterdam", name: "Schiphol", country: "NL" },
  { code: "FRA", city: "Frankfurt", name: "Frankfurt Intl", country: "DE" },
  { code: "MUC", city: "Munich", name: "Munich Intl", country: "DE" },
  { code: "BER", city: "Berlin", name: "Brandenburg Intl", country: "DE" },
  { code: "MAD", city: "Madrid", name: "Adolfo Suárez Barajas", country: "ES" },
  { code: "BCN", city: "Barcelona", name: "El Prat", country: "ES" },
  { code: "FCO", city: "Rome", name: "Fiumicino", country: "IT" },
  { code: "MXP", city: "Milan", name: "Malpensa", country: "IT" },
  { code: "ZRH", city: "Zurich", name: "Zurich Intl", country: "CH" },
  { code: "VIE", city: "Vienna", name: "Vienna Intl", country: "AT" },
  { code: "CPH", city: "Copenhagen", name: "Copenhagen Airport", country: "DK" },
  { code: "ARN", city: "Stockholm", name: "Arlanda", country: "SE" },
  { code: "OSL", city: "Oslo", name: "Gardermoen", country: "NO" },
  { code: "HEL", city: "Helsinki", name: "Helsinki-Vantaa", country: "FI" },
  { code: "DUB", city: "Dublin", name: "Dublin Airport", country: "IE" },
  { code: "LIS", city: "Lisbon", name: "Humberto Delgado", country: "PT" },
  { code: "ATH", city: "Athens", name: "Eleftherios Venizelos", country: "GR" },
  { code: "IST", city: "Istanbul", name: "Istanbul Airport", country: "TR" },
  { code: "DXB", city: "Dubai", name: "Dubai Intl", country: "AE" },
  { code: "AUH", city: "Abu Dhabi", name: "Zayed Intl", country: "AE" },
  { code: "DOH", city: "Doha", name: "Hamad Intl", country: "QA" },
  { code: "NRT", city: "Tokyo", name: "Narita", country: "JP" },
  { code: "HND", city: "Tokyo", name: "Haneda", country: "JP" },
  { code: "KIX", city: "Osaka", name: "Kansai Intl", country: "JP" },
  { code: "ICN", city: "Seoul", name: "Incheon Intl", country: "KR" },
  { code: "PEK", city: "Beijing", name: "Capital Intl", country: "CN" },
  { code: "PKX", city: "Beijing", name: "Daxing Intl", country: "CN" },
  { code: "PVG", city: "Shanghai", name: "Pudong Intl", country: "CN" },
  { code: "HKG", city: "Hong Kong", name: "Hong Kong Intl", country: "HK" },
  { code: "SIN", city: "Singapore", name: "Changi", country: "SG" },
  { code: "BKK", city: "Bangkok", name: "Suvarnabhumi", country: "TH" },
  { code: "KUL", city: "Kuala Lumpur", name: "International", country: "MY" },
  { code: "CGK", city: "Jakarta", name: "Soekarno-Hatta Intl", country: "ID" },
  { code: "SYD", city: "Sydney", name: "Kingsford Smith", country: "AU" },
  { code: "MEL", city: "Melbourne", name: "Melbourne Airport", country: "AU" },
  { code: "AKL", city: "Auckland", name: "Auckland Airport", country: "NZ" },
  { code: "YYZ", city: "Toronto", name: "Pearson Intl", country: "CA" },
  { code: "YVR", city: "Vancouver", name: "Vancouver Intl", country: "CA" },
  { code: "YUL", city: "Montreal", name: "Trudeau Intl", country: "CA" },
  { code: "MEX", city: "Mexico City", name: "Benito Juárez Intl", country: "MX" },
  { code: "GRU", city: "São Paulo", name: "Guarulhos Intl", country: "BR" },
  { code: "EZE", city: "Buenos Aires", name: "Ezeiza Intl", country: "AR" },
  { code: "BOG", city: "Bogotá", name: "El Dorado Intl", country: "CO" },
  { code: "SCL", city: "Santiago", name: "Arturo Merino Benítez", country: "CL" },
  { code: "JNB", city: "Johannesburg", name: "O.R. Tambo Intl", country: "ZA" },
  { code: "NBO", city: "Nairobi", name: "Jomo Kenyatta Intl", country: "KE" },
  { code: "CAI", city: "Cairo", name: "Cairo Intl", country: "EG" },
  { code: "BOM", city: "Mumbai", name: "Chhatrapati Shivaji Maharaj Intl", country: "IN" },
  { code: "DEL", city: "Delhi", name: "Indira Gandhi Intl", country: "IN" },
];

// ── Metro groups ──────────────────────────────────────────────────────────────

interface MetroGroup {
  kind: "metro";
  id: string;
  label: string;
  codes: string[];
  searchTerms: string[];
}

const METRO_GROUPS: MetroGroup[] = [
  {
    kind: "metro", id: "NYC", label: "New York City Area", codes: ["JFK", "LGA", "EWR"],
    searchTerms: ["new york", "nyc", "jfk", "lga", "ewr", "newark"],
  },
  {
    kind: "metro", id: "LAX_METRO", label: "Los Angeles Area", codes: ["LAX", "BUR", "LGB", "SNA", "ONT"],
    searchTerms: ["los angeles", "la", "lax", "bur", "lgb", "sna", "ont", "burbank", "long beach", "orange county"],
  },
  {
    kind: "metro", id: "SFO_METRO", label: "San Francisco Bay Area", codes: ["SFO", "OAK", "SJC"],
    searchTerms: ["san francisco", "sf", "bay area", "sfo", "oak", "sjc", "oakland", "san jose"],
  },
  {
    kind: "metro", id: "TYO", label: "Tokyo Area", codes: ["HND", "NRT"],
    searchTerms: ["tokyo", "hnd", "nrt", "haneda", "narita"],
  },
  {
    kind: "metro", id: "LON", label: "London Area", codes: ["LHR", "LGW", "STN", "LCY", "LTN"],
    searchTerms: ["london", "lhr", "lgw", "stn", "lcy", "ltn", "heathrow", "gatwick", "stansted"],
  },
  {
    kind: "metro", id: "PAR", label: "Paris Area", codes: ["CDG", "ORY"],
    searchTerms: ["paris", "cdg", "ory", "de gaulle", "orly"],
  },
  {
    kind: "metro", id: "CHI", label: "Chicago Area", codes: ["ORD", "MDW"],
    searchTerms: ["chicago", "ord", "mdw", "ohare", "midway"],
  },
  {
    kind: "metro", id: "WAS", label: "Washington DC Area", codes: ["DCA", "IAD", "BWI"],
    searchTerms: ["washington", "dc", "dca", "iad", "bwi", "reagan", "dulles", "baltimore"],
  },
];

type Airport = (typeof AIRPORTS)[0];
type AirportEntry = Airport & { kind: "airport" };
type Selection = MetroGroup | AirportEntry;
type TripType = "roundtrip" | "oneway";
type CabinClass = "economy" | "premium_economy" | "business" | "first";
type SearchState = "idle" | "loading" | "results" | "error";

interface FlightOffer {
  airline: string;
  airline_code: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_time: string;
  arrive_time: string;
  duration: string;
  stops: number;
  stop_label: string;
  cabin: string;
  baggage: string;
  price_total: number;
  price_per_person: number;
  currency: string;
  ai_score: number;
  score_breakdown: Record<string, number>;
  recommendation_label: string;
  recommendation_why: string;
  recommendation_bullets: string[];
  wins_on: string[];
  tradeoffs: string[];
  comparison_summary: string;
  is_recommended: boolean;
  arrival_timing: string;
  jet_lag: string;
  travel_fatigue: string;
  city_access: string;
  aircraft_comfort: string;
  connection_airports?: string;
}

interface SearchMeta {
  origin: string;
  destination: string;
  trip_type: string;
  cabin_class: string;
  adults: number;
  offer_count?: number;
}

const CABIN_LABELS: Record<CabinClass, string> = {
  economy: "Economy",
  premium_economy: "Premium Economy",
  business: "Business",
  first: "First Class",
};

function selectionLabel(s: Selection): string {
  if (s.kind === "metro") return `${s.label} · ${s.codes.join(", ")}`;
  return `${s.code} — ${s.city}`;
}

function selectionCodes(s: Selection): string {
  return s.kind === "metro" ? s.codes.join("/") : s.code;
}

function searchLocations(query: string): Selection[] {
  if (!query.trim()) return METRO_GROUPS;
  const q = query.toLowerCase();
  const metroMatches = METRO_GROUPS.filter(
    (m) => m.label.toLowerCase().includes(q) || m.searchTerms.some((t) => t.includes(q))
  );
  const airportMatches = AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
  ).map((a) => ({ ...a, kind: "airport" as const }));
  return [...metroMatches, ...airportMatches].slice(0, 10);
}

// ── Score / indicator helpers ─────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 85) return "text-lantern-mint";
  if (score >= 70) return "text-lantern-blue";
  return "text-lantern-gold";
}

function scoreBg(score: number): string {
  if (score >= 85) return "bg-lantern-mint/15 text-lantern-mint border-lantern-mint/25";
  if (score >= 70) return "bg-lantern-blue/15 text-lantern-blue border-lantern-blue/25";
  return "bg-lantern-gold/15 text-lantern-gold border-lantern-gold/25";
}

function indicatorColor(label: string): string {
  if (["Great", "Good", "Low", "Excellent", "Morning", "Afternoon"].includes(label)) return "text-lantern-mint";
  if (["Okay", "Moderate", "Basic", "Evening", "Early Morning"].includes(label)) return "text-lantern-gold";
  return "text-red-400"; // High, Very High, Limited, Late Night
}

// ── Priority / reranking ──────────────────────────────────────────────────────

type Priority =
  | "best_overall"
  | "cheapest"
  | "fastest"
  | "nonstop"
  | "arrival"
  | "jet_lag"
  | "fatigue"
  | "comfort"
  | "airport";

// Selectable chips — "best_overall" is the implicit fallback when none are selected
const PRIORITY_CHIPS: { id: Priority; label: string }[] = [
  { id: "cheapest", label: "Cheapest" },
  { id: "fastest",  label: "Fastest" },
  { id: "nonstop",  label: "Fewer stops" },
  { id: "arrival",  label: "Best arrival" },
  { id: "jet_lag",  label: "Low jet lag" },
  { id: "fatigue",  label: "Less fatigue" },
  { id: "comfort",  label: "Best comfort" },
  { id: "airport",  label: "Best airport" },
];

// Base weights (sum = 100); keys match score_breakdown fields from scoreComponents in route.ts
const BASE_WEIGHTS: Record<string, number> = {
  price: 35, duration: 20, stops: 20, timing: 10, cabin: 10, baggage: 5,
};

// Additive boosts applied on top of base weights when a priority is selected
const PRIORITY_BOOSTS: Partial<Record<Priority, Record<string, number>>> = {
  cheapest: { price: 35 },
  fastest:  { duration: 35 },
  nonstop:  { stops: 35 },
  arrival:  { timing: 35 },
  jet_lag:  { timing: 20, duration: 10, stops: 10 },
  fatigue:  { duration: 20, stops: 20, cabin: 10 },
  comfort:  { cabin: 40, duration: 10 },
  airport:  { timing: 15, stops: 15, price: 10 },
};

function buildCompoundWeights(priorities: Priority[]): Record<string, number> {
  const raw: Record<string, number> = { ...BASE_WEIGHTS };
  for (const p of priorities) {
    for (const [k, v] of Object.entries(PRIORITY_BOOSTS[p] ?? {})) {
      raw[k] = (raw[k] ?? 0) + v;
    }
  }
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = Math.round((v / total) * 1000) / 1000;
  }
  return out;
}

const PRIORITY_TOP_LABEL: Record<Priority, string> = {
  best_overall: "AI Pick",
  cheapest:     "Cheapest",
  fastest:      "Fastest",
  nonstop:      "Nonstop Pick",
  arrival:      "Best Arrival",
  jet_lag:      "Lowest Fatigue",
  fatigue:      "Lowest Fatigue",
  comfort:      "Most Comfortable",
  airport:      "AI Pick",
};

function buildPriorityNote(o: FlightOffer, priorities: Priority[]): string {
  if (!priorities.length) return "";
  const tradeoff = o.tradeoffs[0] ? `, even though ${o.tradeoffs[0].toLowerCase()}` : "";
  if (priorities.length === 1) {
    switch (priorities[0]) {
      case "cheapest":
        return `Because you prioritized cheapest, this flight wins on lowest total fare ($${Math.round(o.price_total).toLocaleString()})${tradeoff}.`;
      case "fastest":
        return `Because you prioritized fastest, this flight wins on shortest travel time (${o.duration})${tradeoff}.`;
      case "nonstop":
        return o.stops === 0
          ? `Because you prioritized fewer stops, this nonstop flight ranks highest${tradeoff}.`
          : `No nonstop available — this has the fewest connections (${o.stop_label}).`;
      case "arrival":
        return `Because you prioritized arrival timing, this ${o.arrival_timing.toLowerCase()} arrival ranks highest${tradeoff}.`;
      case "jet_lag":
        return `Because you prioritized lower jet lag, this flight has ${o.jet_lag.toLowerCase()} jet lag risk${tradeoff}.`;
      case "fatigue":
        return `Because you prioritized less fatigue, this flight has ${o.travel_fatigue.toLowerCase()} travel fatigue${tradeoff}.`;
      case "comfort":
        return `Because you prioritized aircraft comfort, this flight has ${o.aircraft_comfort.toLowerCase()} comfort${tradeoff}.`;
      case "airport":
        return `Because you prioritized airport convenience, this flight has ${o.city_access.toLowerCase()} city access${tradeoff}.`;
      default:
        return "";
    }
  }
  const labels = priorities.map((p) => PRIORITY_CHIPS.find((c) => c.id === p)?.label ?? p);
  const joined =
    labels.length === 2
      ? `${labels[0]} and ${labels[1]}`
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  const firstWin = o.wins_on[0];
  const because = firstWin ? ` — ${firstWin.toLowerCase()}` : "";
  return `Because you prioritized ${joined}, this flight ranks highest${because}.`;
}

function labelSummary(label: string): string {
  switch (label) {
    case "AI Pick":          return "Highest overall score in this result set.";
    case "Cheapest":         return "Lowest visible fare.";
    case "Fastest":          return "Fastest itinerary available.";
    case "Best Arrival":     return "Best arrival timing among visible results.";
    case "Lowest Fatigue":   return "Lowest fatigue among visible results.";
    case "Most Comfortable": return "Most comfortable option available.";
    case "Nonstop Pick":     return "Best nonstop option available.";
    default:                 return "";
  }
}

function rerankOffers(
  rawOffers: FlightOffer[],
  weights: Record<string, number>,
  priorities: Priority[]
): FlightOffer[] {
  if (!rawOffers.length) return rawOffers;

  // Result-set bounds for min-max normalization
  const prices = rawOffers.map((o) => o.price_total);
  const durs   = rawOffers.map((o) => parseMins(o.duration) || 999);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const minD = Math.min(...durs),   maxD = Math.max(...durs);
  const priceRange = maxP - minP;
  const durRange   = maxD - minD;

  console.log(`[rerank] BEFORE: ${rawOffers.map((o) => `${o.airline}(${o.flight_number})=${o.ai_score}`).join(", ")}`);
  console.log(`[rerank] priorities=${JSON.stringify(priorities)}`);
  console.log(`[rerank] price $${Math.round(minP)}–$${Math.round(maxP)}  dur ${Math.round(minD)}–${Math.round(maxD)} min`);

  // Compute per-metric normalized scores [0, 100] for a single offer.
  // Uses result-set min/max for price and duration; fixed scales for everything else.
  const computeNorms = (o: FlightOffer): Record<string, number> => ({
    price:       priceRange > 1 ? 100 * (maxP - o.price_total)                  / priceRange : 50,
    duration:    durRange   > 1 ? 100 * (maxD - (parseMins(o.duration) || 0))   / durRange   : 50,
    stops:       stopsScore(o.stops),
    timing:      arrivalTimingScore(o.arrive_time),
    cabin:       cabinScore(o.cabin),
    baggage:     o.baggage.trim() ? 65 : 35,
    // Server signals are in [-1, 1]; convert to [0, 100]
    jet_lag:     ((o.score_breakdown.jet_lag     ?? 0) + 1) / 2 * 100,
    fatigue:     ((o.score_breakdown.fatigue     ?? 0) + 1) / 2 * 100,
    city_access: ((o.score_breakdown.city_access ?? 0) + 1) / 2 * 100,
  });

  const rescored = rawOffers.map((o) => {
    const norms   = computeNorms(o);
    // Weighted average — norms are [0,100] and weights sum to 1 → result is naturally [0,100]
    const weighted = Object.entries(weights).reduce(
      (sum, [k, wt]) => sum + (norms[k] ?? 50) * wt,
      0
    );
    const score = Math.round(Math.max(10, Math.min(99, weighted)));
    // Replace score_breakdown with new [0,100] normalized values for the breakdown modal
    return { ...o, ai_score: score, score_breakdown: norms };
  });

  rescored.sort((a, b) => b.ai_score - a.ai_score);

  console.log(`[rerank] AFTER:  ${rescored.map((o) => `${o.airline}(${o.flight_number})=${o.ai_score}`).join(", ")}`);
  console.log(`[rerank] detail:`);
  rescored.slice(0, 5).forEach((o, i) => {
    const parts = Object.entries(weights)
      .map(([k, wt]) => `${k}=${Math.round(o.score_breakdown[k] ?? 0)}×${Math.round(wt * 100)}%→${((o.score_breakdown[k] ?? 0) * wt).toFixed(1)}`)
      .join("  ");
    console.log(`  #${i + 1} ${o.airline} $${Math.round(o.price_total)} ${o.duration} score=${o.ai_score} | ${parts}`);
  });

  const topLabel =
    priorities.length === 0
      ? "AI Pick"
      : priorities.length === 1
      ? (PRIORITY_TOP_LABEL[priorities[0]] ?? "Best Match")
      : "Best Match";

  return rescored.map((o, i) => ({
    ...o,
    is_recommended: i === 0,
    recommendation_label: i === 0 ? topLabel : o.recommendation_label,
  }));
}

// ── AirportCombobox ───────────────────────────────────────────────────────────

function AirportCombobox({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: Selection | null;
  onChange: (selection: Selection | null) => void;
}) {
  const [inputValue, setInputValue] = useState(value ? selectionLabel(value) : "");
  const [suggestions, setSuggestions] = useState<Selection[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setInputValue(value ? selectionLabel(value) : "");
  }, [value, open]);

  const handleFocus = () => {
    setInputValue("");
    setSuggestions(searchLocations(""));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setSuggestions([]);
      setInputValue(value ? selectionLabel(value) : "");
    }, 150);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    setSuggestions(searchLocations(q));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const selectItem = useCallback(
    (item: Selection) => {
      onChange(item);
      setInputValue(selectionLabel(item));
      setOpen(false);
      setSuggestions([]);
    },
    [onChange]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectItem(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative flex-1 min-w-0">
      <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-xl border transition-colors ${
          open ? "border-lantern-violet/60 bg-panel" : "border-white/10 bg-white/[0.04] hover:border-white/20"
        }`}
      >
        <svg
          className="absolute left-3 w-4 h-4 text-white/30 pointer-events-none flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx={11} cy={11} r={8} />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          placeholder={placeholder}
          className="w-full bg-transparent pl-9 pr-3.5 py-3 text-sm text-white placeholder-white/30 outline-none"
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0e1422] shadow-card overflow-hidden">
          {suggestions.map((item, i) => (
            <li
              key={item.kind === "metro" ? item.id : item.code}
              onMouseDown={() => selectItem(item)}
              className={`flex items-center gap-3 px-3.5 py-2 cursor-pointer transition-colors ${
                i === highlightedIndex ? "bg-lantern-violet/20" : "hover:bg-white/[0.06]"
              }`}
            >
              {item.kind === "metro" ? (
                <>
                  <span className="text-[10px] font-bold font-mono text-lantern-gold bg-lantern-gold/10 border border-lantern-gold/20 rounded px-1.5 py-0.5 flex-shrink-0 leading-tight">
                    ALL
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">{item.label}</div>
                    <div className="text-xs text-white/40 truncate">All airports: {item.codes.join(", ")}</div>
                  </div>
                  <span className="ml-auto text-[10px] font-semibold uppercase tracking-wider text-lantern-gold/50 flex-shrink-0">
                    metro
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold font-mono text-lantern-blue w-8 flex-shrink-0">
                    {item.code}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{item.city}</div>
                    <div className="text-xs text-white/40 truncate">{item.name}</div>
                  </div>
                  <span className="ml-auto text-xs text-white/25 flex-shrink-0">{item.country}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Score / breakdown helpers ─────────────────────────────────────────────────

const BREAKDOWN_LABELS: Record<string, string> = {
  price:       "Price",
  duration:    "Duration",
  stops:       "Routing / Stops",
  timing:      "Arrival Timing",
  cabin:       "Cabin Class",
  baggage:     "Baggage",
  jet_lag:     "Jet Lag",
  fatigue:     "Travel Fatigue",
  city_access: "City Access",
};


function toDisplayScore(v: number): number {
  return Math.round(v);
}

function breakdownColor(ds: number): string {
  if (ds >= 60) return "text-lantern-mint";
  if (ds >= 40) return "text-white/50";
  return "text-lantern-gold";
}

function breakdownBarColor(ds: number): string {
  if (ds >= 60) return "bg-lantern-mint";
  if (ds >= 40) return "bg-white/20";
  return "bg-lantern-gold/70";
}

// ── Trip impact descriptions ──────────────────────────────────────────────────

const ARRIVAL_TIMING_DESC: Record<string, string> = {
  "Early Morning": "Very early arrival — plan for limited transit options.",
  "Morning": "Morning arrival, giving you the full day at your destination.",
  "Afternoon": "Afternoon arrival, good timing for most itineraries.",
  "Evening": "Evening arrival — limited daytime hours on arrival day.",
  "Late Night": "Late night arrival — plan ahead for transport and rest.",
};

const JET_LAG_DESC: Record<string, string> = {
  "Low": "Minimal time zone shift, easy to adjust.",
  "Moderate": "Moderate time zone change, expect mild adjustment.",
  "High": "Significant time zone shift — plan for jet lag recovery.",
  "Very High": "Major time zone difference — budget extra recovery days.",
};

const FATIGUE_DESC: Record<string, string> = {
  "Low": "Short or comfortable journey with minimal fatigue expected.",
  "Moderate": "Moderate journey length or a short connecting itinerary.",
  "High": "Long flight or multiple connections — expect fatigue.",
  "Very High": "Very long or heavily connected journey — high fatigue risk.",
};

const CITY_ACCESS_DESC: Record<string, string> = {
  "Good": "Well-connected airport with convenient city transit.",
  "Moderate": "Standard airport access, may need a transfer.",
  "Limited": "Secondary or remote airport — allow extra time to reach the city.",
};

const COMFORT_DESC: Record<string, string> = {
  "Excellent": "Modern wide-body aircraft with premium comfort signals.",
  "Good": "Modern aircraft with solid amenity and comfort ratings.",
  "Basic": "Standard economy with limited comfort signals.",
};

// ── RecommendationPanel ───────────────────────────────────────────────────────

function RecommendationPanel({
  offers,
  topPickRef,
  priorities,
}: {
  offers: FlightOffer[];
  topPickRef: React.RefObject<HTMLDivElement | null>;
  priorities: Priority[];
}) {
  const pick = offers.find((o) => o.is_recommended) ?? offers[0];
  if (!pick) return null;

  const reasons = (pick.wins_on.length > 0 ? pick.wins_on : pick.recommendation_bullets).slice(0, 3);
  const priorityNote = buildPriorityNote(pick, priorities);

  return (
    <div className="mb-4 max-w-3xl mx-auto rounded-xl border border-lantern-violet/40 bg-lantern-violet/[0.07] px-4 sm:px-5 py-4 shadow-[0_0_24px_rgba(139,92,246,0.10)]">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <svg className="w-3.5 h-3.5 text-lantern-violet flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet">
            TravelGrab Recommendation
          </span>
        </div>
        <span className="text-lg font-black text-white tabular-nums leading-none flex-shrink-0">
          ${Math.round(pick.price_total).toLocaleString()}
        </span>
      </div>

      {/* Airline + route summary */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-2 text-xs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.gstatic.com/flights/airline_logos/70px/${pick.airline_code}.png`}
          alt={pick.airline}
          width={16}
          height={16}
          className="rounded object-contain flex-shrink-0"
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <span className="font-bold text-white">{pick.airline}</span>
        <span className="text-white/25">·</span>
        <span className="font-mono font-semibold text-white/60">{pick.origin}</span>
        <span className="text-white/30">→</span>
        <span className="font-mono font-semibold text-white/60">{pick.destination}</span>
        <span className="text-white/25">·</span>
        <span className="text-white/50">{pick.duration}</span>
        <span className="text-white/25">·</span>
        <span className="text-white/50">{pick.stop_label}</span>
      </div>

      {/* Priority note (shown when a non-default priority is active) */}
      {priorityNote && (
        <p className="text-[11px] text-lantern-violet/80 leading-relaxed mb-1.5">{priorityNote}</p>
      )}

      {/* Advisor sentence */}
      {pick.recommendation_why && (
        <p className="text-[11px] text-white/60 leading-relaxed mb-2.5">{pick.recommendation_why}</p>
      )}

      {/* Reason bullets */}
      {reasons.length > 0 && (
        <ul className="space-y-1 mb-3">
          {reasons.map((r, i) => (
            <li key={i} className="flex gap-1.5 text-[11px] text-white/60 leading-relaxed">
              <span className="text-lantern-violet mt-0.5 flex-shrink-0">›</span>
              {r}
            </li>
          ))}
        </ul>
      )}

      {/* CTA */}
      <button
        onClick={() => topPickRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-lantern-violet border border-lantern-violet/40 bg-lantern-violet/10 hover:bg-lantern-violet/20 rounded-lg px-3.5 py-1.5 transition-colors"
      >
        View top pick
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}

// ── CompareTable ─────────────────────────────────────────────────────────────

function parseMins(dur: string): number {
  const h = dur.match(/(\d+)h/);
  const m = dur.match(/(\d+)m/);
  return (h ? parseInt(h[1]) * 60 : 0) + (m ? parseInt(m[1]) : 0);
}

function clockMins(time: string): number {
  const parts = time.split(":");
  return parseInt(parts[0] ?? "12") * 60 + parseInt(parts[1] ?? "0");
}

// Per-metric scores in [0, 100]; larger = better for that dimension
function stopsScore(stops: number): number {
  if (stops === 0) return 100;
  if (stops === 1) return 55;
  if (stops === 2) return 20;
  return 5;
}

function arrivalTimingScore(arriveTime: string): number {
  const h = Math.floor(clockMins(arriveTime) / 60);
  if (h >= 8 && h < 21) return 100;                          // 8 am – 8:59 pm: great
  if ((h >= 6 && h < 8) || (h >= 21 && h < 23)) return 60;  // early morning / late evening
  if ((h >= 4 && h < 6) || h === 23) return 25;              // very early / midnight
  return 5;                                                   // 0–3 am
}

function cabinScore(cabin: string): number {
  const c = cabin.toLowerCase();
  if (c.includes("first"))    return 100;
  if (c.includes("business")) return 80;
  if (c.includes("premium"))  return 55;
  return 40;
}

function CompareTable({ offers }: { offers: FlightOffer[] }) {
  // Keep up to 3 rows that are meaningfully distinct (differ in price, duration, or stop count)
  const distinct: FlightOffer[] = [];
  for (const o of offers) {
    if (distinct.length >= 3) break;
    const tooSimilar = distinct.some(
      (prev) =>
        Math.abs(o.price_total - prev.price_total) < 15 &&
        Math.abs(parseMins(o.duration) - parseMins(prev.duration)) < 20 &&
        o.stops === prev.stops
    );
    if (!tooSimilar) distinct.push(o);
  }
  const top = distinct;
  if (top.length < 2) return null;

  const thCls =
    "text-[9px] font-bold uppercase tracking-widest text-white/25 px-3 py-2.5 text-left whitespace-nowrap";
  const tdCls = "px-3 py-2.5 align-top";

  return (
    <div className="mb-4 max-w-3xl mx-auto">
      <div className="mb-2.5">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/35">
          Compare top picks
        </span>
        <p className="text-[11px] text-white/25 mt-0.5">
          See why TravelGrab ranked these options differently.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/[0.07]">
        <table className="w-full min-w-[600px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07] bg-white/[0.025]">
              {["Flight", "Score", "Price", "Duration", "Stops", "Best for", "Tradeoff"].map((c) => (
                <th key={c} className={thCls}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {top.map((o, i) => (
              <tr
                key={i}
                className={`border-b border-white/[0.04] last:border-0 ${
                  o.is_recommended ? "bg-lantern-violet/[0.05]" : "bg-transparent"
                }`}
              >
                {/* Flight */}
                <td className={tdCls}>
                  <div className="flex items-start gap-1.5 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://www.gstatic.com/flights/airline_logos/70px/${o.airline_code}.png`}
                      alt=""
                      width={14}
                      height={14}
                      className="rounded object-contain mt-0.5 flex-shrink-0"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[11px] font-semibold text-white leading-tight">{o.airline}</span>
                        {o.is_recommended && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/40 bg-lantern-violet/10 rounded-full px-1.5 py-px leading-none">
                            #1
                          </span>
                        )}
                      </div>
                      <div className="text-[9px] font-mono text-white/30 mt-px">{o.flight_number}</div>
                    </div>
                  </div>
                </td>

                {/* Score */}
                <td className={tdCls}>
                  <span className={`text-sm font-black tabular-nums leading-none ${scoreColor(o.ai_score)}`}>
                    {o.ai_score}
                  </span>
                </td>

                {/* Price */}
                <td className={tdCls}>
                  <span className="text-[12px] font-bold text-white tabular-nums whitespace-nowrap">
                    ${Math.round(o.price_total).toLocaleString()}
                  </span>
                </td>

                {/* Duration */}
                <td className={tdCls}>
                  <span className="text-[11px] text-white/65 whitespace-nowrap">{o.duration}</span>
                </td>

                {/* Stops */}
                <td className={tdCls}>
                  <span className={`text-[11px] font-medium whitespace-nowrap ${
                    o.stops === 0 ? "text-lantern-mint" : "text-white/50"
                  }`}>
                    {o.stop_label}
                  </span>
                </td>

                {/* Best for */}
                <td className={tdCls}>
                  {o.recommendation_label && (
                    <span className={`inline-block text-[9px] font-bold uppercase tracking-wider border rounded-full px-2 py-0.5 leading-none mb-1 ${scoreBg(o.ai_score)}`}>
                      {o.recommendation_label}
                    </span>
                  )}
                  {o.wins_on[0] && (
                    <p className="text-[10px] text-white/40 leading-snug max-w-[130px]">{o.wins_on[0]}</p>
                  )}
                </td>

                {/* Tradeoff */}
                <td className={tdCls}>
                  {o.tradeoffs[0] ? (
                    <p className="text-[10px] text-white/40 leading-snug max-w-[130px]">{o.tradeoffs[0]}</p>
                  ) : (
                    <span className="text-[10px] text-white/20">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── FlightCard ────────────────────────────────────────────────────────────────

function FlightCard({ offer, cardRef, priorityWeights, priorities }: {
  offer: FlightOffer;
  cardRef?: React.RefObject<HTMLDivElement | null>;
  priorityWeights: Record<string, number>;
  priorities: Priority[];
}) {
  const rec = offer.is_recommended;
  const [scoreOpen, setScoreOpen] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(rec);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (!scoreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setScoreOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scoreOpen]);

  const whyBullets: string[] = offer.wins_on.length > 0 ? offer.wins_on : offer.recommendation_bullets;
  const whyNot: string[] = offer.tradeoffs;

  const breakdownRows = Object.entries(offer.score_breakdown)
    .map(([k, v]) => ({
      key: k,
      label: BREAKDOWN_LABELS[k] ?? k,
      displayScore: toDisplayScore(v),
      weight: Math.round((priorityWeights[k] ?? 0) * 100),
    }))
    .filter((row) => row.weight > 0)
    .sort((a, b) => b.displayScore - a.displayScore);

  const tripImpact = [
    { key: "timing", label: "Arrival Timing", value: offer.arrival_timing, desc: ARRIVAL_TIMING_DESC[offer.arrival_timing] },
    { key: "jetlag", label: "Jet Lag", value: offer.jet_lag, desc: JET_LAG_DESC[offer.jet_lag] },
    { key: "fatigue", label: "Travel Fatigue", value: offer.travel_fatigue, desc: FATIGUE_DESC[offer.travel_fatigue] },
    { key: "access", label: "City Access", value: offer.city_access, desc: CITY_ACCESS_DESC[offer.city_access] },
    { key: "comfort", label: "Aircraft Comfort", value: offer.aircraft_comfort, desc: COMFORT_DESC[offer.aircraft_comfort] },
  ].filter((b) => b.value);

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border transition-all ${
        rec
          ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_32px_rgba(167,139,250,0.07)]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="p-4 sm:p-5">

        {/* ── Header: airline + advisor sentence + price ── */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div className="flex-shrink-0 mt-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://www.gstatic.com/flights/airline_logos/70px/${offer.airline_code}.png`}
                alt={offer.airline}
                width={22}
                height={22}
                className="rounded object-contain"
                onError={(e) => {
                  const el = e.currentTarget;
                  el.style.display = "none";
                  const sib = el.nextElementSibling as HTMLElement | null;
                  if (sib) sib.style.display = "flex";
                }}
              />
              <div className="w-[22px] h-[22px] rounded bg-white/[0.08] items-center justify-center text-[9px] font-bold text-white/60 hidden">
                {offer.airline_code.slice(0, 2)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap mb-1">
                <span className="text-sm font-bold text-white leading-tight">{offer.airline}</span>
                {rec && (
                  <span className="text-[10px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/50 bg-lantern-violet/15 rounded-full px-2 py-0.5 leading-none">
                    AI Pick
                  </span>
                )}
                {offer.recommendation_label && (
                  <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 leading-none ${scoreBg(offer.ai_score)}`}>
                    {offer.recommendation_label}
                  </span>
                )}
              </div>
              {offer.recommendation_why && (
                <p className={`text-[11px] leading-relaxed ${rec ? "text-white/60" : "text-white/40"}`}>
                  {offer.recommendation_why}
                </p>
              )}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className={`text-2xl font-black tabular-nums leading-none ${scoreColor(offer.ai_score)}`}>
              ${Math.round(offer.price_total).toLocaleString()}
            </div>
            <div className="text-[11px] text-white/35 mt-0.5">{offer.cabin}</div>
          </div>
        </div>

        {/* ── Route bar ── */}
        <div className="flex items-center gap-2 mb-3 py-2 px-3 rounded-lg bg-white/[0.025] border border-white/[0.05]">
          <div className="text-center flex-shrink-0 min-w-[3rem]">
            <div className="text-base font-black text-white tabular-nums leading-tight">{offer.depart_time}</div>
            <div className="text-[10px] font-mono font-bold text-white/40">{offer.origin}</div>
          </div>
          <div className="flex-1 flex flex-col items-center gap-0.5 min-w-0 px-1">
            <div className="text-[10px] text-white/30 font-medium">{offer.duration}</div>
            <div className="w-full flex items-center gap-1">
              <div className="flex-1 h-px bg-white/10" />
              <svg className="w-3 h-3 text-white/20 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
              </svg>
              <div className="flex-1 h-px bg-white/10" />
            </div>
            <div className="text-[10px] text-white/30 font-medium">{offer.stop_label}</div>
          </div>
          <div className="text-center flex-shrink-0 min-w-[3rem]">
            <div className="text-base font-black text-white tabular-nums leading-tight">{offer.arrive_time}</div>
            <div className="text-[10px] font-mono font-bold text-white/40">{offer.destination}</div>
          </div>
        </div>

        {/* ── AI Score bar ── */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-white/25 flex-shrink-0 w-14">AI Score</span>
          <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className={`h-full rounded-full ${offer.ai_score >= 85 ? "bg-lantern-mint" : offer.ai_score >= 70 ? "bg-lantern-blue" : "bg-lantern-gold"}`}
              style={{ width: `${offer.ai_score}%` }}
            />
          </div>
          <span className={`text-[11px] font-bold tabular-nums flex-shrink-0 ${scoreColor(offer.ai_score)}`}>
            {offer.ai_score}
          </span>
        </div>

        {/* ── Analysis section: expanded on rec, toggleable on others ── */}
        {analysisOpen && (
          <div className="space-y-3 mt-1">

            {/* Why this flight */}
            {whyBullets.length > 0 && (
              <div className={`rounded-lg px-3.5 py-2.5 ${rec ? "bg-lantern-violet/[0.08] border border-lantern-violet/20" : "bg-white/[0.03] border border-white/[0.06]"}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${rec ? "text-lantern-violet" : "text-white/30"}`}>
                  Why this flight
                </div>
                <ul className="space-y-1">
                  {whyBullets.map((b, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-white/55 leading-relaxed">
                      <span className={`mt-0.5 flex-shrink-0 ${rec ? "text-lantern-violet" : "text-white/30"}`}>›</span>
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Why not */}
            {whyNot.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-lantern-gold/60 uppercase tracking-wider mb-1.5">Why not</div>
                <ul className="space-y-1">
                  {whyNot.map((w, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-white/45 leading-relaxed">
                      <svg className="w-3 h-3 text-lantern-gold/50 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} />
                      </svg>
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Trip impact blocks */}
            {tripImpact.length > 0 && (
              <div>
                <div className="text-[10px] font-bold text-white/20 uppercase tracking-wider mb-2">Trip impact</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {tripImpact.map(({ key, label, value, desc }) => (
                    <div key={key} className="rounded-lg bg-white/[0.025] border border-white/[0.06] px-2.5 py-2">
                      <div className="text-[10px] text-white/25 font-medium mb-0.5">{label}</div>
                      <div className={`text-[11px] font-bold mb-0.5 ${indicatorColor(value)}`}>{value}</div>
                      {desc && <div className="text-[10px] text-white/25 leading-snug">{desc}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── Flight details ── */}
        {detailsOpen && (
          <div className="mt-3 rounded-lg bg-white/[0.02] border border-white/[0.05] px-3.5 py-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
              {(
                [
                  ["Airline", offer.airline],
                  ["Flight", offer.flight_number],
                  ["From", offer.origin],
                  ["To", offer.destination],
                  ["Departs", offer.depart_time],
                  ["Arrives", offer.arrive_time],
                  ["Duration", offer.duration],
                  ["Stops", offer.stop_label],
                  ["Cabin", offer.cabin],
                  ["Baggage", offer.baggage],
                  ["Total", `$${Math.round(offer.price_total).toLocaleString()}`],
                  ...(offer.price_per_person !== offer.price_total
                    ? [["Per person", `$${Math.round(offer.price_per_person).toLocaleString()}`] as [string, string]]
                    : []),
                ] as [string, string][]
              ).map(([label, val]) => (
                <div key={label} className="flex items-baseline gap-1.5">
                  <span className="text-[10px] text-white/25 w-14 flex-shrink-0">{label}</span>
                  <span className="text-[11px] text-white/60 font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Action row ── */}
        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-white/[0.05]">
          <button
            onClick={() => setScoreOpen(true)}
            className="flex items-center gap-1.5 text-[11px] font-medium text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
            </svg>
            Score
          </button>
          {!rec && (
            <button
              onClick={() => setAnalysisOpen((o) => !o)}
              className={`flex items-center gap-1.5 text-[11px] font-medium border rounded-lg px-3 py-1.5 transition-colors ${
                analysisOpen
                  ? "text-white/60 border-white/15 bg-white/[0.04]"
                  : "text-white/40 hover:text-white/70 border-white/[0.08] hover:border-white/20"
              }`}
            >
              <svg
                className={`w-3 h-3 transition-transform ${analysisOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
              {analysisOpen ? "Hide analysis" : "Analysis"}
            </button>
          )}
          <button
            onClick={() => setDetailsOpen((o) => !o)}
            className="ml-auto flex items-center gap-1.5 text-[11px] font-medium text-white/40 hover:text-white/70 border border-white/[0.08] hover:border-white/20 rounded-lg px-3 py-1.5 transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            {detailsOpen ? "Hide details" : "Details"}
          </button>
        </div>
      </div>

      {/* ── AI Score breakdown modal ── */}
      {scoreOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setScoreOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-[#0d1220] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-sm font-bold text-white">Score Breakdown</div>
                <div className="text-[11px] text-white/35 mt-0.5">{offer.airline} · {offer.flight_number}</div>
              </div>
              <button
                onClick={() => setScoreOpen(false)}
                className="p-1 -mr-1 -mt-0.5 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/[0.06]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-start gap-3 mb-3 pb-3 border-b border-white/[0.07]">
              <div className={`text-4xl font-black tabular-nums leading-none flex-shrink-0 ${scoreColor(offer.ai_score)}`}>
                {offer.ai_score}
              </div>
              <div className="min-w-0">
                {offer.recommendation_label && (
                  <span className={`inline-block text-[10px] font-bold uppercase tracking-widest border rounded-full px-2 py-0.5 mb-1 ${scoreBg(offer.ai_score)}`}>
                    {offer.recommendation_label}
                  </span>
                )}
                {(() => {
                  const summary = labelSummary(offer.recommendation_label);
                  return summary ? (
                    <p className="text-[11px] text-white/40 leading-relaxed">{summary}</p>
                  ) : offer.recommendation_why ? (
                    <p className="text-[11px] text-white/40 leading-relaxed">{offer.recommendation_why}</p>
                  ) : null;
                })()}
              </div>
            </div>

            {priorities.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 text-[10px]">
                <span className="text-white/30">Weighted for:</span>
                <span className="text-lantern-violet/80 font-semibold">
                  {priorities.map((p) => PRIORITY_CHIPS.find((c) => c.id === p)?.label ?? p).join(" + ")}
                </span>
              </div>
            )}
            <p className="text-[10px] text-white/25 leading-relaxed mb-3">
              Each metric scored 0–100 relative to this result set, then combined using your priority weights.
            </p>

            {breakdownRows.length > 0 ? (
              <div className="space-y-2.5">
                {breakdownRows.map(({ key, label, displayScore, weight }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] text-white/65">{label}</span>
                        <span className="text-[10px] text-white/25">{weight}%</span>
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${breakdownColor(displayScore)}`}>
                        {displayScore}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${breakdownBarColor(displayScore)}`}
                        style={{ width: `${displayScore}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-white/30 text-center py-2">Breakdown unavailable.</p>
            )}

            <button
              onClick={() => setScoreOpen(false)}
              className="mt-4 w-full py-2 rounded-xl text-[11px] font-semibold text-white/40 border border-white/[0.08] hover:text-white/70 hover:border-white/20 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FeatureCard (empty state) ─────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-5">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-lantern-violet/15 text-lantern-violet">
        {icon}
      </div>
      <div className="mb-1 text-sm font-semibold text-white">{title}</div>
      <div className="text-xs text-white/45 leading-relaxed">{body}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function getAirportCodes(s: Selection): string[] {
  return s.kind === "metro" ? s.codes : [s.code];
}

export default function FlightSearch() {
  const today = new Date().toISOString().split("T")[0];
  const resultsRef = useRef<HTMLDivElement>(null);
  const topPickRef = useRef<HTMLDivElement>(null);

  const [origin, setOrigin] = useState<Selection | null>(null);
  const [destination, setDestination] = useState<Selection | null>(null);
  const [tripType, setTripType] = useState<TripType>("roundtrip");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [errors, setErrors] = useState<string[]>([]);

  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);
  const [priorities, setPriorities] = useState<Priority[]>([]);

  const activeWeights = useMemo(() => buildCompoundWeights(priorities), [priorities]);

  const displayOffers = useMemo(() => {
    const result = offers.length > 0 ? rerankOffers(offers, activeWeights, priorities) : offers;
    console.log(`[pipeline] 8_offers_rendered_as_cards=${result.length}`);
    return result;
  }, [offers, activeWeights, priorities]);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorBody, setErrorBody] = useState("");
  const [searchedParams, setSearchedParams] = useState<{
    origin: Selection; destination: Selection; tripType: TripType; cabin: CabinClass; travelers: number;
  } | null>(null);

  const handleSearch = async () => {
    const errs: string[] = [];
    if (!origin) errs.push("Please select an origin.");
    if (!destination) errs.push("Please select a destination.");
    if (!departureDate) errs.push("Please select a departure date.");
    if (tripType === "roundtrip" && !returnDate) errs.push("Please select a return date.");
    if (tripType === "roundtrip" && departureDate && returnDate && returnDate < departureDate) {
      errs.push("Return date must be after departure date.");
    }
    setErrors(errs);
    if (errs.length > 0) return;

    setSearchState("loading");
    setSearchedParams({ origin: origin!, destination: destination!, tripType, cabin, travelers });

    const originCodes = getAirportCodes(origin!);
    const destCodes = getAirportCodes(destination!);

    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: originCodes[0],
          destination: destCodes[0],
          ...(origin!.kind === "metro" && { origin_airports: originCodes }),
          ...(destination!.kind === "metro" && { destination_airports: destCodes }),
          departure_date: departureDate,
          return_date: tripType === "roundtrip" ? returnDate : null,
          adults: travelers,
          cabin_class: cabin,
          trip_type: tripType,
        }),
      });

      const data = await res.json() as {
        status: string;
        message?: string;
        offers?: FlightOffer[];
        meta?: SearchMeta;
      };

      if (data.status === "not_configured") {
        setErrorTitle("Search unavailable");
        setErrorBody(data.message ?? "Flight search is temporarily unavailable. Please try again later.");
        setSearchState("error");
        return;
      }
      if (data.status === "error" || data.status === "validation_error") {
        setErrorTitle("Search failed");
        setErrorBody(data.message ?? "We couldn't complete this search. Try again in a moment.");
        setSearchState("error");
        return;
      }
      if (data.status === "empty" || !data.offers?.length) {
        setErrorTitle("No flights found");
        setErrorBody(data.message ?? "No fares found for these dates. Try different dates or airports.");
        setSearchState("error");
        return;
      }

      console.log(`[pipeline] 7_offers_received_by_frontend=${data.offers!.length}`);
      data.offers!.forEach((o, i) => {
        console.log(`  #${i + 1} ${o.airline} ${o.flight_number} ${o.depart_time}->${o.arrive_time} stops=${o.stops} conn="${o.connection_airports}" $${o.price_total}`);
      });
      setOffers(data.offers!);
      setSearchMeta(data.meta ?? null);
      setSearchState("results");
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setErrorTitle("Network error");
      setErrorBody("Couldn't reach TravelGrab's servers. Check your connection and try again.");
      setSearchState("error");
    }
  };

  // searchMeta is kept for potential future use but summary pill uses searchedParams
  void searchMeta;

  return (
    <div className="min-h-screen bg-ink text-white">
      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <svg className="w-5 h-5 text-lantern-violet group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <span className="text-sm font-medium text-lantern-violet">Flights</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Hero */}
        <div className="mb-7 text-center">
          <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-white mb-2">
            Find your flight
          </h1>
          <p className="text-sm text-white/50 max-w-md mx-auto leading-relaxed">
            TravelGrab checks nearby airports automatically and ranks flights by comfort, timing, and value.
          </p>
        </div>

        {/* Search panel */}
        <div className="max-w-3xl mx-auto rounded-2xl border border-white/[0.09] bg-white/[0.03] p-5 sm:p-6 mb-4 shadow-card">
          {/* Trip type toggle */}
          <div className="flex gap-1 mb-4 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 w-fit">
            {(["roundtrip", "oneway"] as TripType[]).map((t) => (
              <button
                key={t}
                onClick={() => setTripType(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  tripType === t
                    ? "bg-lantern-violet/25 text-lantern-violet border border-lantern-violet/30"
                    : "text-white/45 hover:text-white/70"
                }`}
              >
                {t === "roundtrip" ? "Round Trip" : "One Way"}
              </button>
            ))}
          </div>

          {/* Origin / Destination */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <AirportCombobox label="From" placeholder="City, metro, or airport" value={origin} onChange={setOrigin} />
            <button
              onClick={() => { const tmp = origin; setOrigin(destination); setDestination(tmp); }}
              className="self-end mb-0.5 sm:self-center mt-auto sm:mt-6 p-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/40 hover:text-white/80 hover:border-white/25 hover:bg-white/[0.08] transition-all flex-shrink-0"
              title="Swap airports"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M7 16V4m0 0L3 8m4-4 4 4" />
                <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
              </svg>
            </button>
            <AirportCombobox label="To" placeholder="City, metro, or airport" value={destination} onChange={setDestination} />
          </div>

          {/* Dates + Travelers + Cabin */}
          <div className="flex flex-col sm:flex-row gap-2.5 mb-3">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Departure</label>
              <input
                type="date"
                min={today}
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]"
              />
            </div>
            {tripType === "roundtrip" && (
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Return</label>
                <input
                  type="date"
                  min={departureDate || today}
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white outline-none transition-colors [color-scheme:dark]"
                />
              </div>
            )}
            <div className="w-full sm:w-32 flex-shrink-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Travelers</label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setTravelers((n) => Math.max(1, n - 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{travelers}</span>
                <button onClick={() => setTravelers((n) => Math.min(9, n + 1))} className="px-3 py-3 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Cabin</label>
              <select
                value={cabin}
                onChange={(e) => setCabin(e.target.value as CabinClass)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-3.5 py-3 text-sm text-white outline-none transition-colors appearance-none [color-scheme:dark]"
              >
                {(Object.entries(CABIN_LABELS) as [CabinClass, string][]).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
            </div>
          </div>

          {/* What matters most? */}
          <div className="mb-5 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                What matters most?
              </div>
              {priorities.length > 0 && (
                <button
                  onClick={() => setPriorities([])}
                  className="text-[10px] text-white/25 hover:text-white/55 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_CHIPS.map(({ id, label }) => {
                const selected = priorities.includes(id);
                const maxed = !selected && priorities.length >= 3;
                return (
                  <button
                    key={id}
                    onClick={() =>
                      setPriorities((prev) =>
                        prev.includes(id)
                          ? prev.filter((p) => p !== id)
                          : prev.length >= 3
                          ? prev
                          : [...prev, id]
                      )
                    }
                    disabled={maxed}
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                      selected
                        ? "bg-lantern-violet/30 text-lantern-violet border-lantern-violet/70 shadow-[0_0_0_1px_rgba(139,92,246,0.3)]"
                        : maxed
                        ? "bg-transparent text-white/15 border-white/[0.04] cursor-not-allowed"
                        : "bg-transparent text-white/30 border-white/[0.09] hover:border-white/[0.18] hover:text-white/55"
                    }`}
                  >
                    {selected && (
                      <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 6l3.5 3.5L11 2" />
                      </svg>
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-white/25">
              <span>Ranking by:</span>
              {priorities.length === 0 ? (
                <span>Best Overall</span>
              ) : (
                priorities.map((p, i) => (
                  <span key={p} className="flex items-center gap-1">
                    {i > 0 && <span className="text-white/15">+</span>}
                    <span className="text-lantern-violet/70">
                      {PRIORITY_CHIPS.find((c) => c.id === p)?.label}
                    </span>
                  </span>
                ))
              )}
              {priorities.length > 0 && priorities.length < 3 && (
                <span className="text-white/15 ml-1">
                  · {3 - priorities.length} more available
                </span>
              )}
            </div>
          </div>

          {/* Validation errors */}
          {errors.length > 0 && (
            <div className="mb-4 rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {errors.map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}

          <button
            onClick={() => { void handleSearch(); }}
            disabled={searchState === "loading"}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-lantern-violet via-[#7c3aed] to-[#6366f1] hover:from-[#8B5CF6] hover:via-[#7c3aed] hover:to-[#4F46E5] shadow-[0_0_24px_rgba(139,92,246,0.25)] hover:shadow-[0_0_36px_rgba(139,92,246,0.45)] transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {searchState === "loading" ? "Searching…" : "Search Flights"}
          </button>
        </div>

        {/* Loading state */}
        {searchState === "loading" && (
          <div className="mt-8 flex flex-col items-center gap-3 py-14 text-center">
            <div className="w-9 h-9 rounded-full border-2 border-lantern-violet/30 border-t-lantern-violet animate-spin" />
            <div className="text-sm text-white/50">Searching live fares and ranking options…</div>
          </div>
        )}

        {/* Error state */}
        {searchState === "error" && (
          <div className="mt-5 max-w-3xl mx-auto rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4">
            <div className="text-sm font-semibold text-red-300 mb-1">{errorTitle}</div>
            <div className="text-sm text-white/50">{errorBody}</div>
          </div>
        )}

        {/* Results */}
        {searchState === "results" && (
          <div ref={resultsRef} className="mt-6">
            {/* Search summary pill */}
            {searchedParams && (
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4 max-w-3xl mx-auto">
                <div className="inline-flex items-center gap-2 flex-wrap rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs">
                  <span className="font-mono font-semibold text-white">{selectionCodes(searchedParams.origin)}</span>
                  <span className="text-white/30">→</span>
                  <span className="font-mono font-semibold text-white">{selectionCodes(searchedParams.destination)}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-white/55">{searchedParams.tripType === "roundtrip" ? "Round trip" : "One way"}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-white/55">{CABIN_LABELS[searchedParams.cabin]}</span>
                  <span className="text-white/15">·</span>
                  <span className="text-white/55">{searchedParams.travelers} traveler{searchedParams.travelers !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-xs text-white/25">
                  Showing {displayOffers.length} unique itinerar{displayOffers.length !== 1 ? "ies" : "y"} — ranked by AI
                </span>
              </div>
            )}
            <RecommendationPanel offers={displayOffers} topPickRef={topPickRef} priorities={priorities} />
            <CompareTable offers={displayOffers} />
            <div className="space-y-3 max-w-3xl mx-auto">
              {displayOffers.map((offer, i) => (
                <FlightCard
                  key={i}
                  offer={offer}
                  cardRef={i === 0 ? topPickRef : undefined}
                  priorityWeights={activeWeights}
                  priorities={priorities}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state (only shown before first search) */}
        {searchState === "idle" && (
          <div className="mt-10 max-w-3xl mx-auto">
            <div className="text-center mb-6">
              <div className="text-xs font-extrabold uppercase tracking-widest text-white/25 mb-2">How TravelGrab thinks</div>
              <h2 className="text-lg sm:text-xl font-bold text-white/70 mb-1.5">More than just the lowest fare</h2>
              <p className="text-sm text-white/35 max-w-sm mx-auto leading-relaxed">
                TravelGrab's AI evaluates every option and explains which flight is actually worth booking.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
                title="Multi-factor scoring"
                body="Each flight is scored across price, layovers, timing, airline quality, airports, and travel fatigue."
              />
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M9 12l2 2 4-4" /><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" /></svg>}
                title="Plain-language explanation"
                body="Your #1 pick comes with an advisor-style summary of why it beats the alternatives."
              />
              <FeatureCard
                icon={<svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} /></svg>}
                title="Watch-outs surfaced"
                body="Tight connections, redeye arrivals, or inconvenient airports are flagged before you book."
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
