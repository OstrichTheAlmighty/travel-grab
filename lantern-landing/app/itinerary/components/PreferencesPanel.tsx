"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { TRAVEL_STYLE_LABELS } from "@/lib/trip-store";
import type { TravelStyle } from "@/lib/trip-store";

// ── Minimal local types ──────────────────────────────────────────────────────

type UIPace    = "relaxed" | "balanced" | "packed";
type UITransit = "walking" | "public transit" | "taxi" | "mixed";

interface CityStop {
  city: string;
  days: number;
}

interface SelectedFlight {
  flightKey:          string;
  airline:            string;
  airlineCode:        string;
  flightNumber:       string;
  origin:             string;
  destination:        string;
  departTime:         string;
  arriveTime:         string;
  duration:           string;
  stops:              number;
  stopLabel:          string;
  price:              number;
  currency:           string;
  returnOrigin?:       string;
  returnDestination?:  string;
  returnDepartTime?:   string;
  returnArriveTime?:   string;
  returnDuration?:     string;
  returnStopLabel?:    string;
}

interface SelectedHotel {
  hotelId:      string;
  name:         string;
  neighborhood: string;
  address:      string;
  lat?:         number;
  lng?:         number;
  pricePerNight: number;
  currency:     string;
  rating:       number;
  imageUrl:     string;
  aiScore:      number;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PreferencesPanelProps {
  cities:               CityStop[];
  startDate:            string;
  endDate:              string;
  totalDays:            number;
  onUpdateCity:         (i: number, patch: Partial<CityStop>) => void;
  onAddCity:            () => void;
  onRemoveCity:         (i: number) => void;
  onUpdateStartDate:    (v: string) => void;
  wakeTime:             string;
  bedTime:              string;
  pace:                 UIPace;
  transit:              UITransit;
  onUpdateWakeTime:     (v: string) => void;
  onUpdateBedTime:      (v: string) => void;
  onUpdatePace:         (v: UIPace) => void;
  onUpdateTransit:      (v: UITransit) => void;
  budgetTier:           "budget" | "moderate" | "premium";
  setBudgetTier:        (v: "budget" | "moderate" | "premium") => void;
  cuisinePrefs:         string[];
  setCuisinePrefs:      React.Dispatch<React.SetStateAction<string[]>>;
  selectedFlight:         SelectedFlight | null;
  selectedReturnFlight:   SelectedFlight | null;
  selectedHotel:          SelectedHotel | null;
  manualArrivalTime:      string;
  manualDepartureTime:    string;
  manualHotelName:        string;
  onUpdateManualArrival:   (v: string) => void;
  onUpdateManualDeparture: (v: string) => void;
  onUpdateManualHotel:     (v: string) => void;
  onClearFlight:           () => void;
  onClearReturnFlight:     () => void;
  onClearHotel:            () => void;
  obStyles:             TravelStyle[];
  obFirstTime:          boolean | null;
  onEditTrip:           () => void;
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors";

function FieldLabel({ label, note }: { label: string; note?: string }) {
  return (
    <label className="text-xs text-gray-500 block mb-1.5">
      {label}
      {note && <span className="ml-1 text-gray-400">{note}</span>}
    </label>
  );
}

function SectionCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ToggleGroup<T extends string>({
  label, options, value, onChange, cols = 2,
}: {
  label:    string;
  options:  T[];
  value:    T;
  onChange: (v: T) => void;
  cols?:    2 | 3;
}) {
  const gridCls = cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div>
      <FieldLabel label={label} />
      <div className={`grid ${gridCls} gap-2`}>
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
              value === opt
                ? "border-teal-400 bg-teal-50 text-teal-700"
                : "border-gray-200 bg-white text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

function fmt24(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayH}:${(m ?? 0).toString().padStart(2, "0")} ${period}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

// Reusable flight card for a selected flight
function FlightCard({ flight, onClear, changeHref }: {
  flight:     SelectedFlight;
  onClear:    () => void;
  changeHref: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://www.gstatic.com/flights/airline_logos/70px/${flight.airlineCode}.png`}
            alt={flight.airline}
            width={18}
            height={18}
            className="rounded object-contain shrink-0"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-xs font-semibold text-gray-900 truncate">{flight.airline}</span>
          {flight.flightNumber && (
            <span className="text-[10px] text-gray-400 shrink-0">{flight.flightNumber}</span>
          )}
        </div>
        <span className="text-xs font-bold text-gray-600 shrink-0">
          ${Math.round(flight.price).toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-white border border-gray-200 px-3 py-2">
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-gray-900">{fmt24(flight.departTime)}</div>
          <div className="text-[10px] font-mono text-gray-400">{flight.origin}</div>
        </div>
        <div className="flex-1 text-center px-1">
          <div className="text-[10px] text-gray-400">{flight.duration}</div>
          <div className="w-full h-px bg-gray-200 my-1" />
          <div className="text-[10px] text-gray-400">{flight.stopLabel}</div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-sm font-bold text-gray-900">{fmt24(flight.arriveTime)}</div>
          <div className="text-[10px] font-mono text-gray-400">{flight.destination}</div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <Link href={changeHref} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
          Change flight <span>→</span>
        </Link>
        <button type="button" onClick={onClear} className="text-[11px] text-gray-400 hover:text-red-400 transition-colors">
          Remove
        </button>
      </div>
    </div>
  );
}

export function PreferencesPanel({
  cities, startDate, endDate, totalDays,
  onUpdateCity, onAddCity, onRemoveCity, onUpdateStartDate,
  wakeTime, bedTime, pace, transit,
  onUpdateWakeTime, onUpdateBedTime, onUpdatePace, onUpdateTransit,
  budgetTier, setBudgetTier, cuisinePrefs, setCuisinePrefs,
  selectedFlight, selectedReturnFlight, selectedHotel,
  manualArrivalTime, manualDepartureTime, manualHotelName,
  onUpdateManualArrival, onUpdateManualDeparture, onUpdateManualHotel,
  onClearFlight, onClearReturnFlight, onClearHotel,
  obStyles, obFirstTime, onEditTrip,
}: PreferencesPanelProps) {
  const isMultiCity = cities.length > 1;
  const firstCity   = cities[0]?.city ?? "";
  const lastCity    = cities[cities.length - 1]?.city ?? "";
  return (
    <div className="max-w-xl space-y-4">

      {/* Travel style summary */}
      {(obStyles.length > 0 || obFirstTime !== null) && (
        <SectionCard
          title="Travel style"
          action={
            <button type="button" onClick={onEditTrip} className="text-[11px] text-gray-400 hover:text-teal-600 transition-colors">
              Edit style
            </button>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {obFirstTime !== null && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-500">
                {obFirstTime ? "First visit" : "Been before"}
              </span>
            )}
            {obStyles.map((s) => (
              <span key={s} className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] text-teal-700">
                {TRAVEL_STYLE_LABELS[s]}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Trip basics */}
      <SectionCard title="Cities &amp; dates">
        <div className="space-y-2">
          {cities.map((stop, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={i === 0 ? "e.g. Tokyo, Japan" : "e.g. Kyoto, Japan"}
                value={stop.city}
                onChange={(e) => onUpdateCity(i, { city: e.target.value })}
                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-300 transition-colors"
              />
              <input
                type="number"
                min={1}
                max={21}
                value={stop.days}
                onChange={(e) => onUpdateCity(i, { days: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-14 rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm text-gray-900 text-center focus:border-teal-400 focus:outline-none transition-colors"
              />
              <span className="text-[11px] text-gray-400 shrink-0">d</span>
              {cities.length > 1 ? (
                <button type="button" onClick={() => onRemoveCity(i)} className="shrink-0 w-5 text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">
                  ×
                </button>
              ) : (
                <div className="w-5" />
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddCity}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-teal-600 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Add city stop
        </button>
        <div>
          <FieldLabel label="Start date" />
          <input
            type="date"
            value={startDate}
            min={todayIso()}
            onChange={(e) => onUpdateStartDate(e.target.value)}
            className={inputCls}
          />
        </div>
        {startDate && (
          <p className="text-[11px] text-gray-400">
            {totalDays} {totalDays === 1 ? "day" : "days"} · {shortDate(startDate)} – {shortDate(endDate)}
          </p>
        )}
      </SectionCard>

      {/* Schedule */}
      <SectionCard title="Schedule">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Wake time" />
            <input
              type="time"
              value={wakeTime}
              onChange={(e) => onUpdateWakeTime(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <FieldLabel label="Bedtime" />
            <input
              type="time"
              value={bedTime}
              onChange={(e) => onUpdateBedTime(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <ToggleGroup
          label="Travel pace"
          options={["relaxed", "balanced", "packed"] as UIPace[]}
          value={pace}
          onChange={onUpdatePace}
          cols={3}
        />

        <ToggleGroup
          label="Getting around"
          options={["walking", "public transit", "taxi", "mixed"] as UITransit[]}
          value={transit}
          onChange={onUpdateTransit}
        />
      </SectionCard>

      {/* Budget + cuisine */}
      <SectionCard title="Budget &amp; food">
        <ToggleGroup
          label="Daily budget (per person)"
          options={["budget", "moderate", "premium"] as ("budget" | "moderate" | "premium")[]}
          value={budgetTier}
          onChange={setBudgetTier}
          cols={3}
        />
        <div>
          <FieldLabel label="Cuisine preferences" note="(affects AI recommendations)" />
          <div className="flex flex-wrap gap-1.5">
            {["Street food", "Ramen & noodles", "Izakaya & sake", "Fine dining", "Cooking classes", "Local markets", "Sushi & sashimi", "Vegetarian"].map((opt) => {
              const active = cuisinePrefs.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setCuisinePrefs((prev) =>
                    prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt]
                  )}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    active
                      ? "border-amber-300 bg-amber-50 text-amber-700"
                      : "border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* Outbound flight */}
      <SectionCard
        title={isMultiCity ? "Outbound flight" : "Flight"}
        action={<span className="text-[11px] text-gray-400">(optional)</span>}
      >
        {selectedFlight ? (
          <>
            <FlightCard
              flight={selectedFlight}
              onClear={onClearFlight}
              changeHref={firstCity ? `/flights?autofill_to=${encodeURIComponent(firstCity)}` : "/flights"}
            />
            {/* Round-trip return leg (only for single-city where the return is bundled) */}
            {!isMultiCity && selectedFlight.returnDepartTime && (
              <div className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                <div className="text-center shrink-0">
                  <div className="text-sm font-bold text-gray-600">{fmt24(selectedFlight.returnDepartTime)}</div>
                  <div className="text-[10px] font-mono text-gray-400">{selectedFlight.returnOrigin}</div>
                </div>
                <div className="flex-1 text-center px-1">
                  <div className="text-[10px] text-gray-400">{selectedFlight.returnDuration}</div>
                  <div className="w-full h-px bg-gray-200 my-1" />
                  <div className="text-[10px] text-gray-400">{selectedFlight.returnStopLabel}</div>
                </div>
                <div className="text-center shrink-0">
                  <div className="text-sm font-bold text-gray-600">{fmt24(selectedFlight.returnArriveTime ?? "")}</div>
                  <div className="text-[10px] font-mono text-gray-400">{selectedFlight.returnDestination}</div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div>
              <FieldLabel label="Arrival date &amp; time" />
              <input
                type="datetime-local"
                value={manualArrivalTime}
                onChange={(e) => onUpdateManualArrival(e.target.value)}
                className={inputCls}
              />
            </div>
            {!isMultiCity && (
              <div>
                <FieldLabel label="Return departure date &amp; time" />
                <input
                  type="datetime-local"
                  value={manualDepartureTime}
                  onChange={(e) => onUpdateManualDeparture(e.target.value)}
                  className={inputCls}
                />
              </div>
            )}
            <Link
              href={firstCity ? `/flights?autofill_to=${encodeURIComponent(firstCity)}` : "/flights"}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
            >
              Search on Flights and add <span>→</span>
            </Link>
          </>
        )}
      </SectionCard>

      {/* Return flight — only for multi-city trips */}
      {isMultiCity && (
        <SectionCard
          title="Return flight"
          action={<span className="text-[11px] text-gray-400">(optional)</span>}
        >
          {selectedReturnFlight ? (
            <FlightCard
              flight={selectedReturnFlight}
              onClear={onClearReturnFlight}
              changeHref={lastCity ? `/flights?autofill_from=${encodeURIComponent(lastCity)}&mode=return` : "/flights?mode=return"}
            />
          ) : (
            <>
              <div>
                <FieldLabel label="Departure date &amp; time" />
                <input
                  type="datetime-local"
                  value={manualDepartureTime}
                  onChange={(e) => onUpdateManualDeparture(e.target.value)}
                  className={inputCls}
                />
              </div>
              <Link
                href={lastCity ? `/flights?autofill_from=${encodeURIComponent(lastCity)}&mode=return` : "/flights?mode=return"}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors"
              >
                Search on Flights and add <span>→</span>
              </Link>
            </>
          )}
        </SectionCard>
      )}

      {/* Hotel */}
      <SectionCard title="Hotel / base" action={<span className="text-[11px] text-gray-400">(optional)</span>}>
        {selectedHotel ? (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            {selectedHotel.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selectedHotel.imageUrl}
                alt={selectedHotel.name}
                className="w-full h-24 object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="p-3.5 space-y-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 leading-snug">{selectedHotel.name}</p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {selectedHotel.neighborhood}
                  {selectedHotel.pricePerNight > 0 && ` · $${Math.round(selectedHotel.pricePerNight)}/night`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {selectedHotel.rating > 0 && (
                  <span className="text-[11px] text-gray-500">★ {selectedHotel.rating.toFixed(1)}</span>
                )}
                {selectedHotel.aiScore > 0 && (
                  <span className="text-[11px] text-teal-600">TG score {selectedHotel.aiScore}</span>
                )}
              </div>
              <div className="flex items-center justify-between pt-0.5">
                <Link href="/hotels" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
                  Change hotel <span>→</span>
                </Link>
                <button
                  type="button"
                  onClick={onClearHotel}
                  className="text-[11px] text-gray-400 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div>
              <FieldLabel label="Hotel name or neighborhood" />
              <input
                type="text"
                placeholder="e.g. Park Hyatt Shinjuku"
                value={manualHotelName}
                onChange={(e) => onUpdateManualHotel(e.target.value)}
                className={inputCls}
              />
            </div>
            <Link href="/hotels" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-teal-600 transition-colors">
              Search on Hotels and add <span>→</span>
            </Link>
          </>
        )}
      </SectionCard>
    </div>
  );
}
