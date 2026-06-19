"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type {
  Activity, DestinationData, Neighborhood, ItineraryBlock,
  TravelStyle, Verdict, CrowdLevel,
} from "./data/types";
import { DESTINATION_DATA } from "./data/tokyo";

// ── Constants ─────────────────────────────────────────────────────────────────

const STYLE_CHIPS: { id: TravelStyle; label: string; icon: string }[] = [
  { id: "food",        label: "Food",            icon: "🍜" },
  { id: "culture",     label: "Culture",          icon: "🎭" },
  { id: "nightlife",   label: "Nightlife",        icon: "🌃" },
  { id: "hidden_gems", label: "Hidden Gems",      icon: "💎" },
  { id: "photography", label: "Photography",      icon: "📸" },
  { id: "luxury",      label: "Luxury",           icon: "✨" },
  { id: "family",      label: "Family",           icon: "👨‍👩‍👧" },
  { id: "history",     label: "History",          icon: "🏛️" },
  { id: "nature",      label: "Nature",           icon: "🌿" },
  { id: "shopping",    label: "Shopping",         icon: "🛍️" },
  { id: "anime",       label: "Anime",            icon: "🎮" },
  { id: "first_time",  label: "First-time visitor", icon: "🗺️" },
  { id: "budget",      label: "Budget-friendly",  icon: "💴" },
];

const VERDICT_META: Record<Verdict, { label: string; color: string; bg: string; border: string }> = {
  must_do:    { label: "Must Do",     color: "text-lantern-mint",   bg: "bg-lantern-mint/10",    border: "border-lantern-mint/30"    },
  worth_if:   { label: "Worth It If", color: "text-lantern-blue",   bg: "bg-lantern-blue/10",    border: "border-lantern-blue/30"    },
  skip_if:    { label: "Skip If",     color: "text-amber-400",      bg: "bg-amber-500/8",        border: "border-amber-500/25"       },
  overrated:  { label: "Overrated",   color: "text-red-400",        bg: "bg-red-500/8",          border: "border-red-500/20"         },
  hidden_gem: { label: "Hidden Gem",  color: "text-lantern-violet", bg: "bg-lantern-violet/10",  border: "border-lantern-violet/30"  },
};

const CROWD_LABELS: Record<CrowdLevel, { label: string; color: string }> = {
  low:       { label: "Low crowds",    color: "text-lantern-mint/80"  },
  moderate:  { label: "Moderate",      color: "text-lantern-blue/80"  },
  high:      { label: "Busy",          color: "text-amber-400/80"     },
  very_high: { label: "Very crowded",  color: "text-red-400/80"       },
};

const DAY_PART_META: Record<ItineraryBlock["dayPart"], { label: string; icon: string; accent: string }> = {
  morning:   { label: "Morning",   icon: "🌅", accent: "from-amber-500/20 to-amber-500/5"  },
  afternoon: { label: "Afternoon", icon: "☀️",  accent: "from-lantern-blue/20 to-lantern-blue/5"   },
  evening:   { label: "Evening",   icon: "🌙", accent: "from-lantern-violet/20 to-lantern-violet/5" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s >= 85) return "text-lantern-mint";
  if (s >= 70) return "text-lantern-blue";
  if (s >= 50) return "text-white/60";
  return "text-amber-400";
}

function barColor(s: number): string {
  if (s >= 80) return "bg-lantern-mint";
  if (s >= 60) return "bg-lantern-blue";
  if (s >= 40) return "bg-white/30";
  return "bg-amber-400/70";
}

function normalizeDestinationKey(raw: string): string {
  const cleaned = raw.trim();
  if (DESTINATION_DATA[cleaned]) return cleaned;
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(DESTINATION_DATA)) {
    if (key.toLowerCase() === lower) return key;
    // Prefix match: "Tokyo" matches "Tokyo, Japan"
    if (key.toLowerCase().startsWith(lower + ",")) return key;
    if (key.toLowerCase() === lower.split(",")[0].trim()) return key;
  }
  return cleaned;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-lg font-black text-white tracking-tight">{title}</h2>
      {subtitle && <p className="text-[12px] text-white/40 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function WorthItBadge({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Worth-it</span>
      <span className={`text-xl font-black tabular-nums leading-none ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function TimeTag({ hours }: { hours: number }) {
  const label = hours < 1 ? `${Math.round(hours * 60)}min` : hours === Math.floor(hours) ? `${hours}h` : `${hours}h`;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/35 bg-white/[0.04] border border-white/[0.07] rounded-full px-2 py-0.5">
      <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        <circle cx="6" cy="6" r="4.5" /><path d="M6 3.5v2.5l2 1" />
      </svg>
      {label}
    </span>
  );
}

function CrowdTag({ level }: { level: CrowdLevel }) {
  const { label, color } = CROWD_LABELS[level];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] ${color} bg-white/[0.03] border border-white/[0.06] rounded-full px-2 py-0.5`}>
      <svg className="w-2 h-2" viewBox="0 0 8 8" fill="currentColor">
        <circle cx="2.5" cy="2.5" r="1.2" /><circle cx="4" cy="2" r="1.4" /><circle cx="5.5" cy="2.5" r="1.2" />
        <ellipse cx="2.5" cy="5.5" rx="1.5" ry="1.2" /><ellipse cx="4" cy="5" rx="1.8" ry="1.4" /><ellipse cx="5.5" cy="5.5" rx="1.5" ry="1.2" />
      </svg>
      {label}
    </span>
  );
}

// ── Experience Card ───────────────────────────────────────────────────────────

function ExperienceCard({ activity, rank }: { activity: Activity; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const vm = VERDICT_META[activity.verdict];

  return (
    <div
      className={`rounded-xl border transition-all ${
        rank === 1
          ? "border-lantern-violet/40 bg-lantern-violet/[0.04] shadow-[0_0_24px_rgba(167,139,250,0.06)]"
          : "border-white/[0.07] bg-white/[0.02]"
      }`}
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-white/[0.05] border border-white/[0.07] flex items-center justify-center text-lg">
            {activity.categoryIcon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-white/30">#{rank}</span>
              <span className={`text-[9px] font-bold uppercase tracking-wider border rounded-full px-1.5 py-0.5 leading-none ${vm.color} ${vm.bg} ${vm.border}`}>
                {vm.label}
              </span>
              {rank === 1 && (
                <span className="text-[9px] font-black uppercase tracking-widest text-lantern-violet border border-lantern-violet/50 bg-lantern-violet/15 rounded-full px-2 py-0.5 leading-none">
                  Top Pick
                </span>
              )}
            </div>
            <h3 className="text-sm font-bold text-white leading-snug">{activity.name}</h3>
            <p className="text-[11px] text-white/35 mt-0.5">{activity.category} · {activity.neighborhood}</p>
          </div>
          <WorthItBadge score={activity.worthItScore} />
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          <TimeTag hours={activity.timeRequiredHours} />
          <CrowdTag level={activity.crowdLevel} />
          <span className="inline-flex items-center gap-1 text-[10px] text-lantern-blue/70 bg-white/[0.03] border border-white/[0.06] rounded-full px-2 py-0.5">
            <svg className="w-2 h-2" viewBox="0 0 8 8" fill="currentColor"><path d="M4 0L4 8M0 4H8" strokeWidth="0" /><circle cx="4" cy="4" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.2"/><path d="M4 1.5L4 4L5.5 5.5" stroke="currentColor" strokeWidth="1.2" fill="none"/></svg>
            {activity.bestTime}
          </span>
          {activity.price && (
            <span className="text-[10px] text-white/30 bg-white/[0.03] border border-white/[0.06] rounded-full px-2 py-0.5">
              {activity.price}
            </span>
          )}
        </div>

        {/* Why it matches */}
        <p className="text-[12px] text-white/55 leading-relaxed mb-2">{activity.whyItMatches}</p>

        {/* Skip if */}
        <div className="flex items-start gap-1.5 rounded-lg bg-amber-500/[0.05] border border-amber-500/15 px-2.5 py-1.5">
          <svg className="w-2.5 h-2.5 text-amber-400/60 flex-shrink-0 mt-[1px]" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 1v5M6 8v1M3 11h6L6 1 3 11z" />
          </svg>
          <span className="text-[10px] text-amber-300/65 leading-tight">
            <span className="font-bold">Skip if:</span> {activity.skipIf}
          </span>
        </div>

        {/* Expanded ROI detail */}
        <button
          onClick={() => setExpanded((o) => !o)}
          className="flex items-center gap-1 mt-3 text-[10px] text-white/25 hover:text-white/45 transition-colors"
        >
          <svg className={`w-2.5 h-2.5 transition-transform ${expanded ? "rotate-90" : ""}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M4 2l4 4-4 4" />
          </svg>
          {expanded ? "Less detail" : "Time ROI detail"}
        </button>

        {expanded && (
          <div className="mt-2.5 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
            {[
              { label: "Experience value", value: activity.experienceValue },
              { label: "Crowd penalty",    value: 100 - activity.crowdPenalty },
              { label: "Transit ease",     value: 100 - activity.transitFriction },
              { label: "Time ROI score",   value: activity.timeRoiScore },
            ].map(({ label, value }) => (
              <div key={label}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-[10px] text-white/40">{label}</span>
                  <span className={`text-[10px] font-bold tabular-nums ${scoreColor(value)}`}>{value}</span>
                </div>
                <div className="h-1 rounded-full bg-white/[0.06]">
                  <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Worth It / Skip It ────────────────────────────────────────────────────────

function WorthItSkipItSection({ activities }: { activities: Activity[] }) {
  const groups = useMemo(() => {
    const map: Record<Verdict, Activity[]> = {
      must_do: [], worth_if: [], skip_if: [], overrated: [], hidden_gem: [],
    };
    for (const a of activities) map[a.verdict].push(a);
    return map;
  }, [activities]);

  const order: Verdict[] = ["must_do", "hidden_gem", "worth_if", "skip_if", "overrated"];

  return (
    <div className="space-y-3">
      {order.map((verdict) => {
        const items = groups[verdict];
        if (items.length === 0) return null;
        const vm = VERDICT_META[verdict];
        return (
          <div key={verdict} className={`rounded-xl border ${vm.border} ${vm.bg} p-4`}>
            <div className={`text-[9px] font-black uppercase tracking-widest ${vm.color} mb-3`}>
              {vm.label}
            </div>
            <div className="space-y-3">
              {items.map((a) => (
                <div key={a.id} className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{a.categoryIcon}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-bold text-white">{a.name}</span>
                      <TimeTag hours={a.timeRequiredHours} />
                    </div>
                    {verdict === "worth_if" && a.worthIfCondition && (
                      <p className="text-[11px] text-white/45 leading-snug">{a.worthIfCondition}</p>
                    )}
                    {verdict === "skip_if" && a.skipIfCondition && (
                      <p className="text-[11px] text-white/45 leading-snug">{a.skipIfCondition}</p>
                    )}
                    {verdict === "overrated" && a.overratedReason && (
                      <p className="text-[11px] text-white/45 leading-snug">{a.overratedReason}</p>
                    )}
                    {verdict === "hidden_gem" && a.hiddenGemReason && (
                      <p className="text-[11px] text-white/45 leading-snug">{a.hiddenGemReason}</p>
                    )}
                    {verdict === "must_do" && (
                      <p className="text-[11px] text-white/45 leading-snug">{a.whyItMatches}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Time ROI Table ────────────────────────────────────────────────────────────

function TimeROISection({ activities }: { activities: Activity[] }) {
  const sorted = useMemo(
    () => [...activities].sort((a, b) => b.timeRoiScore - a.timeRoiScore),
    [activities],
  );

  return (
    <div className="space-y-2">
      {sorted.map((a, i) => (
        <div
          key={a.id}
          className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
        >
          <div className="flex items-center gap-3 mb-2.5">
            <span className="text-[10px] font-black text-white/20 w-4 flex-shrink-0">#{i + 1}</span>
            <span className="text-lg">{a.categoryIcon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12px] font-bold text-white truncate">{a.name}</div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-lg font-black tabular-nums leading-none ${scoreColor(a.timeRoiScore)}`}>
                {a.timeRoiScore}
              </div>
              <div className="text-[9px] text-white/25 uppercase tracking-wider">ROI</div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Value",   value: a.experienceValue        },
              { label: "Time",    value: 100 - Math.round((a.timeCost / 4) * 100)   },
              { label: "Transit", value: 100 - a.transitFriction  },
              { label: "Crowds",  value: 100 - a.crowdPenalty     },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <div className="text-[9px] text-white/25 mb-1">{label}</div>
                <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
                </div>
                <div className={`text-[10px] font-bold tabular-nums mt-0.5 ${scoreColor(value)}`}>{Math.max(0, Math.min(100, value))}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Neighborhood Fit ──────────────────────────────────────────────────────────

function NeighborhoodFitSection({
  neighborhoods,
  selectedStyles,
}: {
  neighborhoods: Neighborhood[];
  selectedStyles: TravelStyle[];
}) {
  const scored = useMemo(() => {
    return neighborhoods
      .map((n) => {
        const matchCount = selectedStyles.length === 0
          ? n.styles.length
          : n.styles.filter((s) => selectedStyles.includes(s)).length;
        return { ...n, matchCount };
      })
      .sort((a, b) => b.matchCount - a.matchCount);
  }, [neighborhoods, selectedStyles]);

  const crowdMeta = CROWD_LABELS;

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {scored.map((n, i) => {
        const isTopMatch = i === 0 && selectedStyles.length > 0;
        const matchedStyles = selectedStyles.length > 0
          ? n.styles.filter((s) => selectedStyles.includes(s))
          : n.styles;

        return (
          <div
            key={n.id}
            className={`rounded-xl border p-4 transition-all ${
              isTopMatch
                ? "border-lantern-violet/40 bg-lantern-violet/[0.04]"
                : "border-white/[0.07] bg-white/[0.02]"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                {isTopMatch && (
                  <div className="text-[9px] font-black uppercase tracking-widest text-lantern-violet mb-0.5">Best match</div>
                )}
                <h3 className="text-[13px] font-bold text-white">{n.name}</h3>
                <p className="text-[10px] text-white/35 mt-0.5">{n.tagline}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-[10px] text-white/25">Transit</div>
                <div className={`text-sm font-black tabular-nums ${scoreColor(n.transitScore)}`}>{n.transitScore}</div>
              </div>
            </div>

            <p className="text-[11px] text-white/45 leading-relaxed mb-2.5">{n.description}</p>

            <div className="flex flex-wrap gap-1 mb-2">
              {matchedStyles.map((s) => {
                const chip = STYLE_CHIPS.find((c) => c.id === s);
                const isMatch = selectedStyles.includes(s);
                return (
                  <span
                    key={s}
                    className={`text-[10px] rounded-full px-2 py-0.5 border transition-colors ${
                      isMatch && selectedStyles.length > 0
                        ? "text-lantern-violet border-lantern-violet/40 bg-lantern-violet/10"
                        : "text-white/30 border-white/[0.08] bg-white/[0.02]"
                    }`}
                  >
                    {chip?.icon} {chip?.label ?? s}
                  </span>
                );
              })}
            </div>

            <div className="flex items-center justify-between text-[10px]">
              <span className={`${crowdMeta[n.crowdLevel].color}`}>
                {crowdMeta[n.crowdLevel].label}
              </span>
              <span className="text-white/20">·</span>
              <span className="text-white/30 truncate">{n.bestFor}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Build My Day ──────────────────────────────────────────────────────────────

function BuildMyDaySection({
  itinerary,
  allActivities,
}: {
  itinerary: ItineraryBlock[];
  allActivities: Activity[];
}) {
  return (
    <div className="space-y-3">
      {itinerary.map((block) => {
        const meta = DAY_PART_META[block.dayPart];
        const blockActivities = block.activityIds
          .map((id) => allActivities.find((a) => a.id === id))
          .filter((a): a is Activity => Boolean(a));

        return (
          <div
            key={block.dayPart}
            className={`rounded-xl border border-white/[0.07] bg-gradient-to-br ${meta.accent} p-4`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">{meta.icon}</span>
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-white/30">{meta.label}</div>
                <div className="text-[12px] font-bold text-white">{block.label}</div>
              </div>
            </div>

            <p className="text-[11px] text-white/40 italic mb-3">{block.vibe}</p>

            <div className="space-y-2.5">
              {blockActivities.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2">
                  <span className="text-base flex-shrink-0">{a.categoryIcon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-white truncate">{a.name}</div>
                    <div className="text-[10px] text-white/35">{a.bestTime}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <TimeTag hours={a.timeRequiredHours} />
                    <span className={`text-sm font-black tabular-nums ${scoreColor(a.worthItScore)}`}>{a.worthItScore}</span>
                  </div>
                </div>
              ))}
            </div>

            {block.transitNote && (
              <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-white/[0.06]">
                <svg className="w-3 h-3 text-lantern-blue/60 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                <span className="text-[10px] text-white/30 leading-snug">{block.transitNote}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Search Form ───────────────────────────────────────────────────────────────

function SearchForm({
  destination,
  setDestination,
  days,
  setDays,
  selectedStyles,
  toggleStyle,
  onSearch,
  noData,
}: {
  destination: string;
  setDestination: (v: string) => void;
  days: number;
  setDays: (v: number) => void;
  selectedStyles: TravelStyle[];
  toggleStyle: (s: TravelStyle) => void;
  onSearch: () => void;
  noData: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Destination + days row */}
      <div className="flex flex-col sm:flex-row gap-2.5 mb-4">
        <div className="flex-1 relative">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
          </svg>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
            placeholder="City (e.g. Tokyo, Japan)"
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:border-white/20 focus:border-lantern-violet/60 pl-9 pr-3.5 py-3 text-sm text-white placeholder-white/25 outline-none transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 bg-white/[0.04] border border-white/10 rounded-xl px-3.5 py-3">
          <button
            onClick={() => setDays(Math.max(1, days - 1))}
            className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/25 transition-colors text-sm font-bold"
          >−</button>
          <span className="text-sm font-semibold text-white min-w-[80px] text-center">{days} day{days !== 1 ? "s" : ""}</span>
          <button
            onClick={() => setDays(Math.min(30, days + 1))}
            className="w-6 h-6 rounded-full border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:border-white/25 transition-colors text-sm font-bold"
          >+</button>
        </div>
      </div>

      {/* Style chips */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {STYLE_CHIPS.map((chip) => {
          const active = selectedStyles.includes(chip.id);
          return (
            <button
              key={chip.id}
              onClick={() => toggleStyle(chip.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                active
                  ? "bg-lantern-violet/20 text-lantern-violet border-lantern-violet/50"
                  : "bg-white/[0.03] text-white/45 border-white/[0.08] hover:border-white/20 hover:text-white/70"
              }`}
            >
              <span>{chip.icon}</span>
              {chip.label}
            </button>
          );
        })}
      </div>

      {noData && destination.trim() && (
        <p className="text-[12px] text-amber-400/70 mb-3 text-center">
          No activity data yet for &ldquo;{destination}&rdquo; — Tokyo sample loaded instead.
        </p>
      )}

      <button
        onClick={onSearch}
        className="w-full h-12 rounded-xl bg-gradient-to-r from-lantern-violet to-lantern-blue text-sm font-bold text-white transition hover:opacity-90 active:scale-[0.99]"
      >
        Plan my activities →
      </button>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────

function Results({
  data,
  selectedStyles,
  days,
  destination,
}: {
  data: DestinationData;
  selectedStyles: TravelStyle[];
  days: number;
  destination: string;
}) {
  const personalized = useMemo(() => {
    let pool = data.activities;
    if (selectedStyles.length > 0) {
      pool = pool.filter((a) => a.styles.some((s) => selectedStyles.includes(s)));
      pool.sort((a, b) => {
        const aMatch = a.styles.filter((s) => selectedStyles.includes(s)).length;
        const bMatch = b.styles.filter((s) => selectedStyles.includes(s)).length;
        if (bMatch !== aMatch) return bMatch - aMatch;
        return b.worthItScore - a.worthItScore;
      });
    } else {
      pool = [...pool].sort((a, b) => b.worthItScore - a.worthItScore);
    }
    // Cap at ~4 activities per day
    return pool.slice(0, Math.max(6, days * 4));
  }, [data.activities, selectedStyles, days]);

  const totalHours = useMemo(
    () => personalized.reduce((s, a) => s + a.timeRequiredHours, 0),
    [personalized],
  );

  return (
    <div className="space-y-10">

      {/* Destination context banner */}
      <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-white/25 mb-0.5">Showing results for</div>
          <div className="text-sm font-bold text-white">{destination} · {days} day{days !== 1 ? "s" : ""}</div>
        </div>
        <div className="h-6 w-px bg-white/[0.08] hidden sm:block" />
        <div className="text-[11px] text-white/35">
          {personalized.length} experiences · ~{Math.round(totalHours)}h total time
          {selectedStyles.length > 0 && ` · filtered for ${selectedStyles.length} interest${selectedStyles.length !== 1 ? "s" : ""}`}
        </div>
        {selectedStyles.length > 0 && (
          <>
            <div className="h-6 w-px bg-white/[0.08] hidden sm:block" />
            <div className="flex flex-wrap gap-1">
              {selectedStyles.map((s) => {
                const chip = STYLE_CHIPS.find((c) => c.id === s);
                return (
                  <span key={s} className="text-[10px] text-lantern-violet/80 border border-lantern-violet/30 bg-lantern-violet/10 rounded-full px-1.5 py-0.5">
                    {chip?.icon} {chip?.label}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Section 1: Experiences For You */}
      <section>
        <SectionHeader
          title="Experiences For You"
          subtitle="Ranked by worth-it score, personalised to your travel style"
        />
        {personalized.length === 0 ? (
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-8 text-center text-white/30 text-sm">
            No activities match your selected interests for this destination yet.
          </div>
        ) : (
          <div className="space-y-3">
            {personalized.map((a, i) => (
              <ExperienceCard key={a.id} activity={a} rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Worth It / Skip It */}
      <section>
        <SectionHeader
          title="Worth It / Skip It"
          subtitle="Honest decision guide — save yourself from spending time on the wrong things"
        />
        <WorthItSkipItSection activities={data.activities} />
      </section>

      {/* Section 3: Vacation Time ROI */}
      <section>
        <SectionHeader
          title="Vacation Time ROI"
          subtitle="Activities ranked by payoff per hour — factoring in transit, crowds, and experience value"
        />
        <TimeROISection activities={personalized.length > 0 ? personalized : data.activities} />
      </section>

      {/* Section 4: Neighborhood Fit */}
      <section>
        <SectionHeader
          title="Neighborhood Fit"
          subtitle="Which areas match your travel style — and what to expect in each"
        />
        <NeighborhoodFitSection
          neighborhoods={data.neighborhoods}
          selectedStyles={selectedStyles}
        />
      </section>

      {/* Section 5: Build My Day */}
      <section>
        <SectionHeader
          title="Build My Day"
          subtitle="A sample itinerary that makes geographic sense and avoids backtracking"
        />
        <BuildMyDaySection itinerary={data.sampleDay} allActivities={data.activities} />
        <p className="text-[11px] text-white/20 mt-3 text-center">
          Sample day is optimised for first-time visitors. Rearrange blocks based on your hotel location.
        </p>
      </section>

    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ActivitySearch() {
  const [destination, setDestination]       = useState("Tokyo, Japan");
  const [days, setDays]                     = useState(5);
  const [selectedStyles, setSelectedStyles] = useState<TravelStyle[]>([]);
  const [searchedDest, setSearchedDest]     = useState("");
  const [resultData, setResultData]         = useState<DestinationData | null>(null);
  const [usedFallback, setUsedFallback]     = useState(false);

  function toggleStyle(s: TravelStyle) {
    setSelectedStyles((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  }

  function handleSearch() {
    const key = normalizeDestinationKey(destination);
    const found = DESTINATION_DATA[key];
    if (found) {
      setResultData(found);
      setSearchedDest(destination.trim());
      setUsedFallback(false);
    } else {
      // Fallback to Tokyo sample data so the page is always useful
      const fallback = Object.values(DESTINATION_DATA)[0];
      setResultData(fallback ?? null);
      setSearchedDest(destination.trim() || "Tokyo, Japan");
      setUsedFallback(true);
    }
  }

  const hasResults = resultData !== null;

  return (
    <div className="min-h-screen bg-ink text-white">

      {/* Nav */}
      <nav className="border-b border-white/[0.07] bg-ink/80 backdrop-blur-md sticky top-0 z-40">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 flex items-center h-14 gap-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/travelgrab-logo.svg" alt="TravelGrab" width={36} height={36} className="h-9 w-9 flex-shrink-0 object-contain" />
            <span className="text-sm font-bold tracking-tight text-white/90">TravelGrab</span>
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <Link href="/flights"    className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">Flights</Link>
          <Link href="/hotels"     className="text-sm font-medium text-white/45 hover:text-white/80 transition-colors">Hotels</Link>
          <span                    className="text-sm font-medium text-lantern-violet">Activities</span>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-10">

        {/* Hero */}
        {!hasResults && (
          <div className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-lantern-violet/30 bg-lantern-violet/10 px-4 py-2 text-sm font-semibold text-lantern-violet">
              <span className="h-1.5 w-1.5 rounded-full bg-lantern-violet animate-pulse" />
              Advisor-style · Not just a list
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight mb-3">
              What&apos;s actually worth doing<br className="hidden sm:block" />{" "}
              <span className="bg-gradient-to-r from-lantern-violet to-lantern-blue bg-clip-text text-transparent">
                with your limited time?
              </span>
            </h1>
            <p className="text-white/45 text-base max-w-xl mx-auto mb-8">
              Skip the generic attraction lists. TravelGrab ranks activities by time ROI, tells you what&apos;s overrated, and builds you a day that makes geographic sense.
            </p>
          </div>
        )}

        {/* Search form (always visible, compact when results shown) */}
        <div className={`${hasResults ? "mb-8 p-4 rounded-xl border border-white/[0.07] bg-white/[0.02]" : "mb-10"}`}>
          {hasResults && (
            <div className="text-[9px] font-black uppercase tracking-widest text-white/25 mb-3">Refine search</div>
          )}
          <SearchForm
            destination={destination}
            setDestination={setDestination}
            days={days}
            setDays={setDays}
            selectedStyles={selectedStyles}
            toggleStyle={toggleStyle}
            onSearch={handleSearch}
            noData={usedFallback}
          />
        </div>

        {/* Results */}
        {hasResults && resultData && (
          <Results
            data={resultData}
            selectedStyles={selectedStyles}
            days={days}
            destination={usedFallback ? resultData.city + ", " + resultData.country : searchedDest}
          />
        )}

        {/* Empty state */}
        {!hasResults && (
          <div className="text-center py-8 text-white/20 text-sm">
            Enter a destination and tap &ldquo;Plan my activities&rdquo; to get started.
            <br />
            <span className="text-white/12">Tokyo sample data available now.</span>
          </div>
        )}

      </main>
    </div>
  );
}
