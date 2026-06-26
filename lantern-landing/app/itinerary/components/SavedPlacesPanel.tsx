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
  food:        "text-amber-600   bg-amber-50   border-amber-200",
  nightlife:   "text-purple-600  bg-purple-50  border-purple-200",
  culture:     "text-teal-600    bg-teal-50    border-teal-200",
  adventure:   "text-orange-600  bg-orange-50  border-orange-200",
  nature:      "text-green-600   bg-green-50   border-green-200",
  luxury:      "text-amber-600   bg-amber-50   border-amber-200",
  hidden_gems: "text-pink-600    bg-pink-50    border-pink-200",
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
          ? "border-gray-100 bg-transparent opacity-40 hover:opacity-60"
          : "border-gray-200 bg-white hover:border-gray-300"
      }`}
    >
      <div className={`shrink-0 h-3.5 w-3.5 rounded border flex items-center justify-center transition-colors ${
        excluded ? "border-gray-300 bg-transparent" : "border-teal-400 bg-teal-50"
      }`}>
        {!excluded && (
          <svg viewBox="0 0 10 8" fill="none" className="w-2.5 h-2 text-teal-500" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4l3 3 5-6" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-900 truncate">{meta?.title ?? id}</p>
        {meta && (
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">
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
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-gray-200 bg-gray-50 p-10 text-center">
        <div className="h-12 w-12 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-xl mb-4">
          ♡
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">No saved places yet</h2>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-5">
          Browse activities and save places to include them in your itinerary.
        </p>
        <Link
          href="/activities"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-5 text-xs font-semibold text-teal-600 hover:bg-teal-100 transition-colors"
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
          <h2 className="text-base font-semibold text-gray-900">Saved places</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {included} of {savedIds.length} included in itinerary
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/activities"
            className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
          >
            Browse more →
          </Link>
          <button
            type="button"
            onClick={onClearAll}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 mb-3">
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
          <p className="text-[11px] text-gray-400 pt-1 text-center">
            + {savedIds.length - PREVIEW} more places
          </p>
        )}
      </div>
    </div>
  );
}
