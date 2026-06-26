"use client";

import type { ReactNode } from "react";
import { TRAVEL_STYLE_LABELS } from "@/lib/trip-store";
import type { TravelStyle } from "@/lib/trip-store";

// ── Minimal local types ──────────────────────────────────────────────────────

type UIPace    = "relaxed" | "balanced" | "packed";
type UITransit = "walking" | "public transit" | "taxi" | "mixed";

interface CityStop {
  city: string;
  days: number;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function PreferencesPanel({
  cities, startDate, endDate, totalDays,
  onUpdateCity, onAddCity, onRemoveCity, onUpdateStartDate,
  wakeTime, bedTime, pace, transit,
  onUpdateWakeTime, onUpdateBedTime, onUpdatePace, onUpdateTransit,
  budgetTier, setBudgetTier, cuisinePrefs, setCuisinePrefs,
  obStyles, obFirstTime, onEditTrip,
}: PreferencesPanelProps) {
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

    </div>
  );
}
