"use client";

export interface AiRecommendation {
  id:            string;
  title:         string;
  city:          string;
  category:      string;
  estimatedCost: string;
  duration:      string;
  reason:        string;
  tags:          string[];
}

const CAT_STYLE: Record<string, string> = {
  food:        "text-amber-600   bg-amber-50   border-amber-200",
  nightlife:   "text-purple-600  bg-purple-50  border-purple-200",
  culture:     "text-teal-600    bg-teal-50    border-teal-200",
  adventure:   "text-orange-600  bg-orange-50  border-orange-200",
  nature:      "text-green-600   bg-green-50   border-green-200",
  luxury:      "text-amber-600   bg-amber-50   border-amber-200",
  hidden_gems: "text-pink-600    bg-pink-50    border-pink-200",
};

const FILTER_LABELS: Record<string, string> = {
  all:         "All",
  food:        "Food",
  culture:     "Culture",
  adventure:   "Adventure",
  nightlife:   "Nightlife",
  nature:      "Nature",
  hidden_gems: "Hidden Gems",
  luxury:      "Luxury",
};

interface RecommendationsPanelProps {
  aiRecs:          AiRecommendation[];
  aiRecsStatus:    "idle" | "loading" | "loaded" | "error";
  aiRecsFilter:    string;
  setAiRecsFilter: (f: string) => void;
  dismissedIds:    Set<string>;
  setDismissedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  addedRecIds:     Set<string>;
  savedIds:        string[];
  onLoad:          () => void;
  onAdd:           (rec: AiRecommendation) => void;
  hasTripInfo:     boolean;
}

export function RecommendationsPanel({
  aiRecs, aiRecsStatus, aiRecsFilter, setAiRecsFilter,
  dismissedIds, setDismissedIds, addedRecIds, savedIds,
  onLoad, onAdd, hasTripInfo,
}: RecommendationsPanelProps) {

  if (!hasTripInfo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-gray-200 bg-gray-50 p-10 text-center">
        <p className="text-sm text-gray-500">
          Set up your trip and travel style first — then we&apos;ll recommend activities tailored to you.
        </p>
      </div>
    );
  }

  if (aiRecsStatus === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-gray-200 bg-gray-50 p-10 text-center">
        <div className="h-12 w-12 rounded-2xl border border-gray-200 bg-white flex items-center justify-center text-xl mb-4">
          ✦
        </div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">AI-curated for you</h2>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed mb-5">
          Get 10 activity recommendations personalised to your travel style, budget, and destinations.
        </p>
        <button
          type="button"
          onClick={onLoad}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-lantern-mint px-6 text-sm font-bold text-ink hover:opacity-90 transition-opacity"
        >
          <span>✦</span> Generate recommendations
        </button>
      </div>
    );
  }

  if (aiRecsStatus === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] p-10 text-center">
        <div className="h-10 w-10 rounded-full border-2 border-gray-200 border-t-teal-400 animate-spin mb-6" />
        <p className="text-sm text-gray-500">Finding activities for you…</p>
      </div>
    );
  }

  if (aiRecsStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] p-10 text-center">
        <p className="text-sm text-red-500 mb-3">Couldn&apos;t load recommendations</p>
        <button
          type="button"
          onClick={onLoad}
          className="text-sm text-teal-600 border border-teal-200 rounded-lg px-4 py-2 hover:bg-teal-50 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // Loaded
  const available = aiRecs.filter((r) => !dismissedIds.has(r.id));
  const visible   = available.filter((r) => aiRecsFilter === "all" || r.category === aiRecsFilter);
  const cats      = ["all", ...Array.from(new Set(available.map((r) => r.category)))];

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">AI Recommendations</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {available.length} personalised suggestions
          </p>
        </div>
        <button
          type="button"
          onClick={onLoad}
          className="text-[11px] text-gray-400 hover:text-teal-600 transition-colors flex items-center gap-1"
        >
          <span>↺</span> Refresh
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {cats.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setAiRecsFilter(f)}
            className={`text-xs px-3 py-1 rounded-full border capitalize transition-colors ${
              aiRecsFilter === f
                ? "border-teal-400 bg-teal-50 text-teal-700"
                : "border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            {FILTER_LABELS[f] ?? f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No more in this category.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map((rec) => {
            const isAdded  = addedRecIds.has(rec.id) || savedIds.includes(`ai-rec-${rec.id}`);
            const catStyle = CAT_STYLE[rec.category] ?? "text-gray-500 bg-gray-50 border-gray-200";
            return (
              <div
                key={rec.id}
                className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 leading-snug">{rec.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-gray-400">{rec.city}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-[11px] text-gray-400">{rec.duration}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-[11px] text-gray-400">{rec.estimatedCost}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setDismissedIds((prev) => new Set([...prev, rec.id]))}
                    className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Reason */}
                <p className="text-[11px] text-gray-500 leading-relaxed italic flex-1">
                  {rec.reason}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex gap-1 flex-wrap min-w-0">
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize ${catStyle}`}>
                      {rec.category === "hidden_gems" ? "Hidden Gem" : rec.category}
                    </span>
                    {rec.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-gray-200 px-1.5 py-0.5 text-[9px] text-gray-400"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { if (!isAdded) onAdd(rec); }}
                    disabled={isAdded}
                    className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                      isAdded
                        ? "text-teal-500 bg-teal-50 cursor-default"
                        : "text-teal-600 border border-teal-200 hover:bg-teal-50"
                    }`}
                  >
                    {isAdded ? "Added ✓" : "+ Add"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
