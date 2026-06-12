"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { FlightOffer } from "@/app/api/flights/search/route";

// ── Airport data ──────────────────────────────────────────────────────────────

const AIRPORTS = [
  { code: "JFK", city: "New York", name: "John F. Kennedy Intl", country: "US" },
  { code: "LGA", city: "New York", name: "LaGuardia", country: "US" },
  { code: "EWR", city: "Newark", name: "Newark Liberty Intl", country: "US" },
  { code: "LAX", city: "Los Angeles", name: "Los Angeles Intl", country: "US" },
  { code: "SFO", city: "San Francisco", name: "San Francisco Intl", country: "US" },
  { code: "ORD", city: "Chicago", name: "O'Hare Intl", country: "US" },
  { code: "MDW", city: "Chicago", name: "Midway Intl", country: "US" },
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

type Airport = (typeof AIRPORTS)[0];
type TripType = "roundtrip" | "oneway";
type CabinClass = "economy" | "premium_economy" | "business" | "first";
type SearchState = "idle" | "loading" | "results" | "error";

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

function searchAirports(query: string): Airport[] {
  if (!query.trim()) return AIRPORTS.slice(0, 8);
  const q = query.toLowerCase();
  return AIRPORTS.filter(
    (a) =>
      a.code.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
  ).slice(0, 8);
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
  if (["Great", "Good", "Low", "Excellent"].includes(label)) return "text-lantern-mint";
  if (["Okay", "Moderate", "Basic"].includes(label)) return "text-lantern-gold";
  return "text-red-400";
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
  value: Airport | null;
  onChange: (airport: Airport | null) => void;
}) {
  const [inputValue, setInputValue] = useState(value ? `${value.code} — ${value.city}` : "");
  const [suggestions, setSuggestions] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) setInputValue(value ? `${value.code} — ${value.city}` : "");
  }, [value, open]);

  const handleFocus = () => {
    setInputValue("");
    setSuggestions(searchAirports(""));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      setSuggestions([]);
      setInputValue(value ? `${value.code} — ${value.city}` : "");
    }, 150);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setInputValue(q);
    setSuggestions(searchAirports(q));
    setOpen(true);
    setHighlightedIndex(-1);
  };

  const selectAirport = useCallback(
    (airport: Airport) => {
      onChange(airport);
      setInputValue(`${airport.code} — ${airport.city}`);
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
      selectAirport(suggestions[highlightedIndex]);
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
          className="absolute left-3.5 w-4 h-4 text-white/30 pointer-events-none flex-shrink-0"
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
          className="w-full bg-transparent pl-10 pr-4 py-3.5 text-sm text-white placeholder-white/30 outline-none"
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1.5 w-full rounded-xl border border-white/10 bg-[#0e1422] shadow-card overflow-hidden">
          {suggestions.map((airport, i) => (
            <li
              key={airport.code}
              onMouseDown={() => selectAirport(airport)}
              className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                i === highlightedIndex ? "bg-lantern-violet/20" : "hover:bg-white/[0.06]"
              }`}
            >
              <span className="text-xs font-bold font-mono text-lantern-blue w-8 flex-shrink-0">
                {airport.code}
              </span>
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{airport.city}</div>
                <div className="text-xs text-white/40 truncate">{airport.name}</div>
              </div>
              <span className="ml-auto text-xs text-white/25 flex-shrink-0">{airport.country}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── FlightCard ────────────────────────────────────────────────────────────────

function FlightCard({ offer }: { offer: FlightOffer }) {
  const rec = offer.is_recommended;
  return (
    <div
      className={`rounded-2xl border p-5 sm:p-6 transition-all ${
        rec
          ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_40px_rgba(167,139,250,0.08)]"
          : "border-white/[0.08] bg-white/[0.025]"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Airline logo */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.gstatic.com/flights/airline_logos/70px/${offer.airline_code}.png`}
            alt={offer.airline}
            width={28}
            height={28}
            className="rounded-md flex-shrink-0 object-contain"
            onError={(e) => {
              const el = e.currentTarget;
              el.style.display = "none";
              const sibling = el.nextElementSibling as HTMLElement | null;
              if (sibling) sibling.style.display = "flex";
            }}
          />
          <div
            className="w-7 h-7 rounded-md bg-white/[0.08] items-center justify-center text-xs font-bold text-white/60 flex-shrink-0 hidden"
          >
            {offer.airline_code.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white truncate">{offer.airline}</div>
            <div className="text-xs text-white/40">{offer.flight_number}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {rec && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-lantern-violet border border-lantern-violet/40 bg-lantern-violet/10 rounded-full px-2.5 py-0.5">
              AI Pick
            </span>
          )}
          <span className={`text-[10px] font-bold uppercase tracking-widest border rounded-full px-2.5 py-0.5 ${scoreBg(offer.ai_score)}`}>
            {offer.recommendation_label}
          </span>
        </div>
      </div>

      {/* Route bar */}
      <div className="flex items-center gap-2 mb-4">
        <div className="text-center flex-shrink-0">
          <div className="text-xl font-black text-white tabular-nums">{offer.depart_time}</div>
          <div className="text-xs font-mono font-bold text-white/50">{offer.origin}</div>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 min-w-0 px-1">
          <div className="text-[10px] text-white/35 font-medium">{offer.duration}</div>
          <div className="w-full flex items-center gap-1">
            <div className="flex-1 h-px bg-white/15" />
            <svg className="w-3 h-3 text-white/25 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
            </svg>
            <div className="flex-1 h-px bg-white/15" />
          </div>
          <div className="text-[10px] text-white/35 font-medium">{offer.stop_label}</div>
        </div>
        <div className="text-center flex-shrink-0">
          <div className="text-xl font-black text-white tabular-nums">{offer.arrive_time}</div>
          <div className="text-xs font-mono font-bold text-white/50">{offer.destination}</div>
        </div>
        <div className="ml-auto pl-3 text-right flex-shrink-0">
          <div className={`text-2xl font-black tabular-nums ${scoreColor(offer.ai_score)}`}>
            ${Math.round(offer.price_total).toLocaleString()}
          </div>
          <div className="text-xs text-white/35">{offer.cabin}</div>
        </div>
      </div>

      {/* AI Score bar */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-white/40 font-medium">AI Score</span>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${offer.ai_score >= 85 ? "bg-lantern-mint" : offer.ai_score >= 70 ? "bg-lantern-blue" : "bg-lantern-gold"}`}
            style={{ width: `${offer.ai_score}%` }}
          />
        </div>
        <span className={`text-xs font-bold tabular-nums ${scoreColor(offer.ai_score)}`}>{offer.ai_score}</span>
      </div>

      {/* Indicators */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mb-4">
        {[
          ["Arrival", offer.arrival_timing],
          ["Jet lag", offer.jet_lag],
          ["Fatigue", offer.travel_fatigue],
          ["City access", offer.city_access],
          ["Comfort", offer.aircraft_comfort],
        ].filter(([, v]) => v).map(([label, val]) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="text-xs text-white/35">{label}</span>
            <span className={`text-xs font-semibold ${indicatorColor(val)}`}>{val}</span>
          </div>
        ))}
      </div>

      {/* Why bullets (recommended only) */}
      {rec && offer.recommendation_bullets.length > 0 && (
        <div className="rounded-xl bg-lantern-violet/[0.07] border border-lantern-violet/20 px-4 py-3 mt-2">
          <div className="text-xs font-bold text-lantern-violet uppercase tracking-wider mb-2">Why this flight</div>
          <ul className="space-y-1.5">
            {offer.recommendation_bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-xs text-white/65 leading-relaxed">
                <span className="text-lantern-violet mt-0.5 flex-shrink-0">›</span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── FeatureCard (empty state) ─────────────────────────────────────────────────

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6">
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-lantern-violet/15 text-lantern-violet">
        {icon}
      </div>
      <div className="mb-1.5 text-sm font-semibold text-white">{title}</div>
      <div className="text-sm text-white/50 leading-relaxed">{body}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FlightSearch() {
  const today = new Date().toISOString().split("T")[0];
  const resultsRef = useRef<HTMLDivElement>(null);

  const [origin, setOrigin] = useState<Airport | null>(null);
  const [destination, setDestination] = useState<Airport | null>(null);
  const [tripType, setTripType] = useState<TripType>("roundtrip");
  const [departureDate, setDepartureDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [travelers, setTravelers] = useState(1);
  const [cabin, setCabin] = useState<CabinClass>("economy");
  const [errors, setErrors] = useState<string[]>([]);

  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [offers, setOffers] = useState<FlightOffer[]>([]);
  const [searchMeta, setSearchMeta] = useState<SearchMeta | null>(null);
  const [errorTitle, setErrorTitle] = useState("");
  const [errorBody, setErrorBody] = useState("");

  const handleSearch = async () => {
    const errs: string[] = [];
    if (!origin) errs.push("Please select an origin airport.");
    if (!destination) errs.push("Please select a destination airport.");
    if (!departureDate) errs.push("Please select a departure date.");
    if (tripType === "roundtrip" && !returnDate) errs.push("Please select a return date.");
    if (tripType === "roundtrip" && departureDate && returnDate && returnDate < departureDate) {
      errs.push("Return date must be after departure date.");
    }
    setErrors(errs);
    if (errs.length > 0) return;

    setSearchState("loading");

    try {
      const res = await fetch("/api/flights/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: origin!.code,
          destination: destination!.code,
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

  const cabinLabel = CABIN_LABELS[cabin];

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

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-10 sm:py-14">
        {/* Hero */}
        <div className="mb-10">
          <div className="mb-2 text-xs font-extrabold uppercase tracking-widest text-lantern-violet">
            AI Flight Search
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-white mb-3">
            Find the best flight,
            <br />
            <span className="text-lantern-blue">not just the cheapest one.</span>
          </h1>
          <p className="text-base text-white/55 max-w-xl leading-relaxed">
            AI weighs price, layovers, timing, airlines, airports, and comfort — then explains which flight is actually worth booking.
          </p>
        </div>

        {/* Search panel */}
        <div className="rounded-2xl border border-white/[0.09] bg-white/[0.03] p-6 sm:p-8 mb-4 shadow-card">
          {/* Trip type toggle */}
          <div className="flex gap-1 mb-6 bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 w-fit">
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
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <AirportCombobox label="From" placeholder="City or airport" value={origin} onChange={setOrigin} />
            <button
              onClick={() => { const tmp = origin; setOrigin(destination); setDestination(tmp); }}
              className="self-end mb-0.5 sm:self-center mt-auto sm:mt-6 p-2.5 rounded-xl border border-white/10 bg-white/[0.04] text-white/40 hover:text-white/80 hover:border-white/25 hover:bg-white/[0.08] transition-all flex-shrink-0"
              title="Swap airports"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
                <path d="M7 16V4m0 0L3 8m4-4 4 4" />
                <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
              </svg>
            </button>
            <AirportCombobox label="To" placeholder="City or airport" value={destination} onChange={setDestination} />
          </div>

          {/* Dates + Travelers + Cabin */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Departure</label>
              <input
                type="date"
                min={today}
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-4 py-3.5 text-sm text-white outline-none transition-colors [color-scheme:dark]"
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
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-4 py-3.5 text-sm text-white outline-none transition-colors [color-scheme:dark]"
                />
              </div>
            )}
            <div className="w-full sm:w-36 flex-shrink-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Travelers</label>
              <div className="flex items-center rounded-xl border border-white/10 bg-white/[0.04] overflow-hidden">
                <button onClick={() => setTravelers((n) => Math.max(1, n - 1))} className="px-3.5 py-3.5 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">−</button>
                <span className="flex-1 text-center text-sm font-semibold text-white">{travelers}</span>
                <button onClick={() => setTravelers((n) => Math.min(9, n + 1))} className="px-3.5 py-3.5 text-white/50 hover:text-white hover:bg-white/[0.06] transition-colors text-lg leading-none">+</button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5 px-0.5">Cabin</label>
              <select
                value={cabin}
                onChange={(e) => setCabin(e.target.value as CabinClass)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 focus:bg-panel px-4 py-3.5 text-sm text-white outline-none transition-colors appearance-none [color-scheme:dark]"
              >
                {(Object.entries(CABIN_LABELS) as [CabinClass, string][]).map(([val, lbl]) => (
                  <option key={val} value={val}>{lbl}</option>
                ))}
              </select>
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
            className="w-full sm:w-auto px-10 py-3.5 rounded-xl font-bold text-sm text-white bg-gradient-to-br from-lantern-violet to-[#6366f1] hover:from-[#8B5CF6] hover:to-[#4F46E5] shadow-glow/30 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {searchState === "loading" ? "Searching…" : "Search Flights"}
          </button>
        </div>

        {/* Loading state */}
        {searchState === "loading" && (
          <div className="mt-10 flex flex-col items-center gap-4 py-16 text-center">
            <div className="w-10 h-10 rounded-full border-2 border-lantern-violet/30 border-t-lantern-violet animate-spin" />
            <div className="text-sm text-white/50">Searching live fares — this usually takes 5–15 seconds</div>
          </div>
        )}

        {/* Error state */}
        {searchState === "error" && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6">
            <div className="text-sm font-semibold text-red-300 mb-1">{errorTitle}</div>
            <div className="text-sm text-white/50">{errorBody}</div>
          </div>
        )}

        {/* Results */}
        {searchState === "results" && (
          <div ref={resultsRef} className="mt-8">
            {/* Trip summary */}
            {searchMeta && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-5 px-1 text-sm text-white/50">
                <span className="font-semibold text-white">{searchMeta.origin} → {searchMeta.destination}</span>
                <span>·</span>
                <span>{searchMeta.trip_type === "roundtrip" ? "Round trip" : "One way"}</span>
                <span>·</span>
                <span>{cabinLabel}</span>
                <span>·</span>
                <span>{travelers} traveler{travelers !== 1 ? "s" : ""}</span>
                <span className="ml-auto text-xs text-white/30">{offers.length} fares — ranked by AI</span>
              </div>
            )}
            <div className="space-y-4">
              {offers.map((offer, i) => <FlightCard key={i} offer={offer} />)}
            </div>
          </div>
        )}

        {/* Empty state (only shown before first search) */}
        {searchState === "idle" && (
          <div className="mt-14">
            <div className="text-center mb-8">
              <div className="text-xs font-extrabold uppercase tracking-widest text-white/30 mb-3">How TravelGrab thinks</div>
              <h2 className="text-xl sm:text-2xl font-bold text-white/80 mb-2">More than just the lowest fare</h2>
              <p className="text-sm text-white/40 max-w-md mx-auto leading-relaxed">
                Enter your trip above and TravelGrab's AI will evaluate every option and explain which flight is actually worth booking.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard
                icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" /></svg>}
                title="Multi-factor scoring"
                body="Each flight is scored across price, layovers, departure and arrival timing, airline quality, airports, and total travel fatigue."
              />
              <FeatureCard
                icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M9 12l2 2 4-4" /><path d="M21 12c0 4.97-4.03 9-9 9S3 16.97 3 12 7.03 3 12 3s9 4.03 9 9z" /></svg>}
                title="Plain-language explanation"
                body="Your #1 pick comes with an advisor-style summary of why it beats the alternatives — not just a score, but actual reasoning."
              />
              <FeatureCard
                icon={<svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1={12} y1={9} x2={12} y2={13} /><line x1={12} y1={17} x2="12.01" y2={17} /></svg>}
                title="Watch-outs surfaced"
                body="Hidden catches like tight connections, redeye arrivals, or inconvenient airports are flagged before you book."
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
