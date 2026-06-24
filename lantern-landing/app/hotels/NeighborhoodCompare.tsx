"use client";

import { useState } from "react";
import {
  resolveProfile,
  COMPARE_CATEGORIES,
  PRICE_TIER_LABELS,
} from "@/app/data/neighborhood-profiles/index";
import type {
  NeighborhoodProfile,
  NeighborhoodScores,
} from "@/app/data/neighborhood-profiles/types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComparableSummary {
  nbhd: {
    id:          string;
    name:        string;
    description: string;
    tags:        string[];
  };
  count:         number;
  avgPrice:      number;
  avgRating:     number;
  avgHotelScore: number;
}

interface EnrichedSummary extends ComparableSummary {
  profile: NeighborhoodProfile | null;
}

// ── Verdict generation ────────────────────────────────────────────────────────

function generateVerdict(enriched: EnrichedSummary[]): {
  categoryLines: string[];
  recommendation: string;
  winnerMap: Partial<Record<keyof NeighborhoodScores, string | null>>;
  winsByName:     Record<string, string[]>;
} {
  const withProfiles = enriched.filter((e) => e.profile !== null);

  // Find per-category winners (tie = null when top-2 within 3 pts)
  const winnerMap: Partial<Record<keyof NeighborhoodScores, string | null>> = {};
  const winsByName: Record<string, string[]> = {};

  if (withProfiles.length >= 2) {
    for (const cat of COMPARE_CATEGORIES) {
      const scored = withProfiles.map((e) => ({
        id:    e.nbhd.id,
        name:  e.nbhd.name,
        score: e.profile!.scores[cat.key],
      }));
      const max = Math.max(...scored.map((s) => s.score));
      const top = scored.filter((s) => s.score >= max - 3);
      winnerMap[cat.key] = top.length === 1 ? top[0].id : null;

      if (top.length === 1) {
        const n = top[0].name;
        if (!winsByName[n]) winsByName[n] = [];
        winsByName[n].push(cat.label);
      }
    }
  }

  // Build sentence per neighborhood
  const sorted = [...enriched].sort(
    (a, b) => (winsByName[b.nbhd.name]?.length ?? 0) - (winsByName[a.nbhd.name]?.length ?? 0)
  );

  function joinCats(cats: string[]): string {
    if (cats.length === 0) return "";
    if (cats.length === 1) return cats[0];
    return `${cats.slice(0, -1).join(", ")} and ${cats[cats.length - 1]}`;
  }

  const categoryLines: string[] = [];
  for (const e of sorted) {
    const cats = winsByName[e.nbhd.name] ?? [];
    const shortName = e.nbhd.name.split(" /")[0].split(",")[0];
    if (withProfiles.length < 2) {
      // No profile data — fall back to live scores
      categoryLines.push(`${shortName} has ${e.count} hotel${e.count !== 1 ? "s" : ""} averaging ${e.avgHotelScore > 0 ? `a TravelGrab score of ${e.avgHotelScore}` : `$${e.avgPrice}/night`}.`);
    } else if (cats.length === 0) {
      categoryLines.push(`${shortName} offers a balanced experience across all categories.`);
    } else {
      categoryLines.push(`${shortName} leads on ${joinCats(cats)}.`);
    }
  }

  // Overall recommendation
  let recommendation = "";
  if (withProfiles.length < 2) {
    recommendation = "Compare hotel prices and scores above to find the best fit for your trip.";
  } else {
    const top1 = sorted[0];
    const top2 = sorted.length > 1 ? sorted[1] : null;
    const n1cats = winsByName[top1.nbhd.name] ?? [];
    const n2cats = top2 ? (winsByName[top2.nbhd.name] ?? []) : [];
    const t1 = top1.nbhd.name.split(" /")[0].split(",")[0];
    const t2 = top2?.nbhd.name.split(" /")[0].split(",")[0];

    if (n1cats.length >= n2cats.length + 2 && top2) {
      recommendation = `Choose ${t1} — it wins the most categories and is the stronger all-around option. Pick ${t2} if ${(n2cats[0] ?? "your priorities").toLowerCase()} matter most.`;
    } else if (top2) {
      const p1 = joinCats(n1cats.slice(0, 2)).toLowerCase() || "overall quality";
      const p2 = joinCats(n2cats.slice(0, 2)).toLowerCase() || "a different experience";
      recommendation = `Choose ${t1} for ${p1}. Choose ${t2} for ${p2}.`;
    } else {
      recommendation = `${t1} is the strongest option based on the categories above.`;
    }
  }

  return { categoryLines, recommendation, winnerMap, winsByName };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ScoreBar({ score, won }: { score: number; won: boolean }) {
  return (
    <div className="h-0.5 rounded-full bg-white/[0.06] mt-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${won ? "bg-lantern-mint/50" : "bg-white/18"}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function CompareModal({
  cityName,
  selected,
  onClose,
}: {
  cityName: string;
  selected: ComparableSummary[];
  onClose:  () => void;
}) {
  const enriched: EnrichedSummary[] = selected.map((s) => ({
    ...s,
    profile: resolveProfile(cityName, s.nbhd.id),
  }));

  const hasProfiles = enriched.some((e) => e.profile !== null);
  const { categoryLines, recommendation, winnerMap } = generateVerdict(enriched);

  // Highest hotel score for "winner" highlight in live rows
  const maxHotelScore = Math.max(...enriched.map((e) => e.avgHotelScore));
  const maxRating     = Math.max(...enriched.map((e) => e.avgRating));
  const minPrice      = Math.min(...enriched.filter((e) => e.avgPrice > 0).map((e) => e.avgPrice));

  const colCount  = enriched.length;
  // Tailwind grid col classes for dynamic column counts
  const gridClass = colCount === 2
    ? "grid-cols-[148px_1fr_1fr]"
    : colCount === 3
      ? "grid-cols-[120px_1fr_1fr_1fr]"
      : "grid-cols-[96px_1fr_1fr_1fr_1fr]";

  function LiveRow({
    label,
    getValue,
    format,
    higherWins,
  }: {
    label:      string;
    getValue:   (e: EnrichedSummary) => number;
    format:     (v: number) => string;
    higherWins: boolean;
  }) {
    const values  = enriched.map((e) => getValue(e));
    const best    = higherWins ? Math.max(...values) : Math.min(...values.filter((v) => v > 0));
    return (
      <div className={`grid ${gridClass} gap-2 py-2 border-b border-white/[0.04]`}>
        <div className="text-[11px] text-white/35 font-medium self-center">{label}</div>
        {enriched.map((e, i) => {
          const val = getValue(e);
          const won = val > 0 && val === best;
          return (
            <div key={e.nbhd.id} className={`rounded-lg px-2 py-1.5 text-center ${won ? "bg-lantern-mint/[0.07]" : ""}`}>
              <span className={`text-[13px] font-black tabular-nums ${won ? "text-lantern-mint" : "text-white/48"}`}>
                {val > 0 ? format(val) : "—"}
              </span>
              {won && <span className="text-[9px] text-lantern-mint/70 ml-0.5">✓</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[5vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/72 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#0d0d14] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-white/[0.07] bg-[#0d0d14]/95 backdrop-blur-sm">
          <div>
            <h2 className="text-sm font-bold text-white">Neighborhood Comparison</h2>
            <p className="text-[11px] text-white/30 mt-0.5">
              {enriched.map((e) => e.nbhd.name.split(" /")[0]).join(" · ")}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] transition-colors flex items-center justify-center text-white/50 hover:text-white/80 text-lg leading-none"
            aria-label="Close comparison"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {/* ── Verdict ──────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-lantern-violet/20 bg-lantern-violet/[0.05] p-4 mb-5">
            <div className="text-[9px] font-black uppercase tracking-widest text-lantern-violet/55 mb-2.5">
              TravelGrab Verdict
            </div>
            <div className="space-y-1.5 mb-3">
              {categoryLines.map((line, i) => (
                <p key={i} className="text-[12px] text-white/75 leading-relaxed flex items-start gap-2">
                  <svg className="w-2.5 h-2.5 text-lantern-violet/55 flex-shrink-0 mt-1" viewBox="0 0 8 8" fill="currentColor">
                    <circle cx="4" cy="4" r="3" />
                  </svg>
                  {line}
                </p>
              ))}
            </div>
            <div className="pt-2.5 border-t border-lantern-violet/15">
              <p className="text-[12px] text-lantern-violet/90 font-semibold leading-relaxed">
                {recommendation}
              </p>
            </div>
          </div>

          {/* ── Column headers ────────────────────────────────────────── */}
          <div className={`grid ${gridClass} gap-2 pb-3 mb-1 border-b border-white/[0.07]`}>
            <div />
            {enriched.map((e) => (
              <div key={e.nbhd.id} className="text-center">
                <div className="text-[11px] font-bold text-white/85 leading-snug">
                  {e.nbhd.name.split(" /")[0].split(",")[0]}
                </div>
                <div className="text-[10px] text-white/28 mt-0.5">{e.count} hotel{e.count !== 1 ? "s" : ""}</div>
              </div>
            ))}
          </div>

          {/* ── Profile category rows ─────────────────────────────────── */}
          {hasProfiles ? (
            <div className="mb-4">
              {COMPARE_CATEGORIES.map((cat) => {
                const winnerId = winnerMap[cat.key];
                const isTie    = winnerMap[cat.key] === null && enriched.filter(e => e.profile).length > 0;
                const maxScore = Math.max(
                  ...enriched.filter((e) => e.profile).map((e) => e.profile!.scores[cat.key])
                );

                return (
                  <div key={cat.key} className={`grid ${gridClass} gap-2 py-2.5 border-b border-white/[0.04]`}>
                    <div className="text-[11px] text-white/40 font-medium self-start pt-0.5">
                      {cat.label}
                    </div>
                    {enriched.map((e) => {
                      if (!e.profile) {
                        return (
                          <div key={e.nbhd.id} className="text-center">
                            <span className="text-[12px] text-white/18">—</span>
                          </div>
                        );
                      }
                      const score = e.profile.scores[cat.key];
                      const won   = winnerId === e.nbhd.id;
                      return (
                        <div
                          key={e.nbhd.id}
                          className={`rounded-lg px-2 py-1.5 ${won ? "bg-lantern-mint/[0.07]" : isTie ? "bg-amber-500/[0.03]" : ""}`}
                        >
                          <div className="flex items-center justify-center gap-1">
                            <span className={`text-[14px] font-black tabular-nums ${won ? "text-lantern-mint" : "text-white/52"}`}>
                              {score}
                            </span>
                            {won && (
                              <svg className="w-2.5 h-2.5 text-lantern-mint/80" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 5.5l3 3L9 2" />
                              </svg>
                            )}
                            {isTie && !won && (
                              <span className="text-[9px] text-amber-400/40">≈</span>
                            )}
                          </div>
                          <ScoreBar score={score} won={won} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[11px] text-white/25 mb-4 py-2">
              Detailed category scores are not yet available for this city. Check back soon.
            </p>
          )}

          {/* ── Live data rows ────────────────────────────────────────── */}
          <div>
            <div className="text-[9px] font-black uppercase tracking-widest text-white/18 mb-2">
              Live from this search
            </div>
            <LiveRow
              label="Hotel Quality"
              getValue={(e) => e.avgHotelScore}
              format={(v) => `${v}`}
              higherWins={true}
            />
            <LiveRow
              label="Avg Guest Rating"
              getValue={(e) => e.avgRating}
              format={(v) => `${v.toFixed(1)}★`}
              higherWins={true}
            />
            <LiveRow
              label="Avg Price / Night"
              getValue={(e) => e.avgPrice}
              format={(v) => `$${v}`}
              higherWins={false}
            />
            {hasProfiles && (
              <div className={`grid ${gridClass} gap-2 py-2.5`}>
                <div className="text-[11px] text-white/35 font-medium self-center">Price Tier</div>
                {enriched.map((e) => (
                  <div key={e.nbhd.id} className="text-center">
                    <span className="text-[13px] font-bold text-amber-400/65">
                      {e.profile ? PRICE_TIER_LABELS[e.profile.price_tier] : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function NeighborhoodCompare({
  cityName,
  summaries,
}: {
  cityName:  string;
  summaries: ComparableSummary[];
}) {
  const eligible = summaries.filter((s) => s.count > 0);

  const [selected, setSelected] = useState<string[]>(
    () => eligible.slice(0, 2).map((s) => s.nbhd.id)
  );
  const [open, setOpen] = useState(false);

  if (eligible.length < 2) return null;

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.length > 2 ? prev.filter((x) => x !== id) : prev; // enforce min 2
      }
      return prev.length >= 4 ? prev : [...prev, id];                  // enforce max 4
    });
  }

  const selectedSummaries = eligible.filter((s) => selected.includes(s.nbhd.id));

  return (
    <>
      {/* ── Trigger card ─────────────────────────────────────────────────── */}
      <div className="mb-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-white/28">
              Compare Neighborhoods
            </span>
            <p className="text-[11px] text-white/20 mt-0.5">
              Select 2–4 areas · side-by-side breakdown
            </p>
          </div>
          {selected.length >= 2 && (
            <span className="text-[10px] text-white/25">{selected.length} selected</span>
          )}
        </div>

        {/* Neighborhood chips */}
        <div className="flex flex-wrap gap-2 mb-4">
          {eligible.map((s) => {
            const isSelected = selected.includes(s.nbhd.id);
            const canAdd     = selected.length < 4;
            const shortName  = s.nbhd.name.split(" /")[0].split(",")[0];

            return (
              <button
                key={s.nbhd.id}
                onClick={() => toggle(s.nbhd.id)}
                disabled={!isSelected && !canAdd}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-all ${
                  isSelected
                    ? "bg-lantern-mint/15 border-lantern-mint/40 text-lantern-mint shadow-[0_0_0_1px_rgba(143,247,208,0.15)]"
                    : canAdd
                      ? "bg-white/[0.03] border-white/[0.09] text-white/40 hover:border-white/22 hover:text-white/60"
                      : "bg-transparent border-white/[0.04] text-white/18 cursor-not-allowed"
                }`}
              >
                {isSelected && (
                  <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 5.5l3 3L9 2" />
                  </svg>
                )}
                {shortName}
                {s.count > 0 && (
                  <span className="text-[9px] opacity-50">({s.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Compare button */}
        <button
          onClick={() => setOpen(true)}
          disabled={selected.length < 2}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-lantern-mint hover:bg-lantern-mint/90 text-ink text-[12px] font-bold transition-all disabled:opacity-35 disabled:cursor-not-allowed"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M3 7h8M7 3l4 4-4 4" />
          </svg>
          Compare {selected.length} Neighborhoods
        </button>
      </div>

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      {open && (
        <CompareModal
          cityName={cityName}
          selected={selectedSummaries}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
