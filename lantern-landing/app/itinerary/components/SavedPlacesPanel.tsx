"use client";

import Link from "next/link";

type SavedMeta = {
  title:        string;
  category:     string;
  neighborhood: string;
  duration:     string;
  rating:       number;
  photoRef?:    string;
  lat?:         number;
  lng?:         number;
  city?:        string;
};

const CAT_STYLE: Record<string, string> = {
  food:        "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  nightlife:   "text-purple-400    bg-purple-400/10    border-purple-400/20",
  culture:     "text-lantern-mint  bg-lantern-mint/10  border-lantern-mint/20",
  adventure:   "text-orange-400    bg-orange-400/10    border-orange-400/20",
  nature:      "text-green-400     bg-green-400/10     border-green-400/20",
  luxury:      "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  hidden_gems: "text-pink-400      bg-pink-400/10      border-pink-400/20",
};

interface SavedPlacesPanelProps {
  savedIds:             string[];
  savedMeta:            Record<string, SavedMeta>;
  excludedActivityIds:  string[];
  onToggle:             (id: string) => void;
  onClearAll:           () => void;
}

function ActivityRow({
  id, meta, excluded, onToggle,
}: {
  id:       string;
  meta:     SavedMeta | undefined;
  excluded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
        excluded
          ? "border-white/[0.04] bg-transparent opacity-40 hover:opacity-60"
          : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]"
      }`}
    >
      <div className={`shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
        excluded ? "border-white/20 bg-transparent" : "border-lantern-mint/60 bg-lantern-mint/15"
      }`}>
        {!excluded && (
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2 text-lantern-mint" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{meta?.title ?? id}</p>
        {meta && (
          <p className="text-[10px] text-white/30 mt-0.5 truncate">
            {[meta.neighborhood, meta.duration].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {meta?.category && meta.category in CAT_STYLE && (
        <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${CAT_STYLE[meta.category]}`}>
          {meta.category}
        </span>
      )}
    </button>
  );
}

const PREVIEW = 20;

export function SavedPlacesPanel({
  savedIds, savedMeta, excludedActivityIds, onToggle, onClearAll,
}: SavedPlacesPanelProps) {
  const included = savedIds.filter((id) => !excludedActivityIds.includes(id)).length;

  if (savedIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
        <div className="h-12 w-12 rounded-2xl border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-xl mb-4">
          ♡
        </div>
        <h2 className="text-lg font-bold text-white mb-2">No saved places yet</h2>
        <p className="text-sm text-white/40 max-w-xs leading-relaxed mb-5">
          Browse activities and save places to include them in your itinerary.
        </p>
        <Link
          href="/activities"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-lantern-mint/30 bg-lantern-mint/[0.08] px-5 text-xs font-semibold text-lantern-mint hover:bg-lantern-mint/15 transition-colors"
        >
          Browse activities →
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-white">Saved places</h2>
          <p className="text-xs text-white/35 mt-0.5">
            {included} of {savedIds.length} included in itinerary
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/activities"
            className="text-xs text-white/35 hover:text-lantern-mint transition-colors"
          >
            Browse more →
          </Link>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-white/25 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>

      <p className="text-[11px] text-white/30 mb-3">
        Checked places are included when you generate your itinerary.
      </p>

      <div className="space-y-1.5">
        {savedIds.slice(0, PREVIEW).map((id) => (
          <ActivityRow
            key={id}
            id={id}
            meta={savedMeta[id]}
            excluded={excludedActivityIds.includes(id)}
            onToggle={() => onToggle(id)}
          />
        ))}
        {savedIds.length > PREVIEW && (
          <p className="text-[11px] text-white/30 pt-1 text-center">
            + {savedIds.length - PREVIEW} more places
          </p>
        )}
      </div>
    </div>
  );
}
