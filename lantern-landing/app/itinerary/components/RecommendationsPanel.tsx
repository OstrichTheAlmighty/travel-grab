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
  food:        "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  nightlife:   "text-purple-400    bg-purple-400/10    border-purple-400/20",
  culture:     "text-lantern-mint  bg-lantern-mint/10  border-lantern-mint/20",
  adventure:   "text-orange-400    bg-orange-400/10    border-orange-400/20",
  nature:      "text-green-400     bg-green-400/10     border-green-400/20",
  luxury:      "text-lantern-gold  bg-lantern-gold/10  border-lantern-gold/20",
  hidden_gems: "text-pink-400      bg-pink-400/10      border-pink-400/20",
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
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
        <p className="text-sm text-white/40">
          Set up your trip and travel style first — then we&apos;ll recommend activities tailored to you.
        </p>
      </div>
    );
  }

  if (aiRecsStatus === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] rounded-2xl border border-white/[0.06] bg-white/[0.01] p-10 text-center">
        <div className="h-12 w-12 rounded-2xl border border-white/[0.1] bg-white/[0.03] flex items-center justify-center text-xl mb-4">
          ✦
        </div>
        <h2 className="text-lg font-bold text-white mb-2">AI-curated for you</h2>
        <p className="text-sm text-white/40 max-w-xs leading-relaxed mb-5">
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
        <div className="h-10 w-10 rounded-full border-2 border-white/10 border-t-lantern-mint animate-spin mb-6" />
        <p className="text-sm text-white/50">Finding activities for you…</p>
      </div>
    );
  }

  if (aiRecsStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[320px] p-10 text-center">
        <p className="text-sm text-red-400/70 mb-3">Couldn&apos;t load recommendations</p>
        <button
          type="button"
          onClick={onLoad}
          className="text-sm text-lantern-mint border border-lantern-mint/30 rounded-lg px-4 py-2 hover:bg-lantern-mint/10 transition-colors"
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
          <h2 className="text-base font-semibold text-white">AI Recommendations</h2>
          <p className="text-xs text-white/35 mt-0.5">
            {available.length} personalised suggestions
          </p>
        </div>
        <button
          type="button"
          onClick={onLoad}
          className="text-[11px] text-white/30 hover:text-lantern-mint transition-colors flex items-center gap-1"
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
                ? "border-lantern-mint/50 bg-lantern-mint/10 text-lantern-mint"
                : "border-white/[0.08] text-white/35 hover:text-white/60"
            }`}
          >
            {FILTER_LABELS[f] ?? f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-white/25 text-center py-8">No more in this category.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {visible.map((rec) => {
            const isAdded  = addedRecIds.has(rec.id) || savedIds.includes(`ai-rec-${rec.id}`);
            const catStyle = CAT_STYLE[rec.category] ?? "text-white/50 bg-white/5 border-white/10";
            return (
              <div
                key={rec.id}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-snug">{rec.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-white/40">{rec.city}</span>
                      <span className="text-white/15">·</span>
                      <span className="text-[11px] text-white/40">{rec.duration}</span>
                      <span className="text-white/15">·</span>
                      <span className="text-[11px] text-white/40">{rec.estimatedCost}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={() => setDismissedIds((prev) => new Set([...prev, rec.id]))}
                    className="shrink-0 text-white/15 hover:text-white/45 transition-colors text-lg leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Reason */}
                <p className="text-[11px] text-white/45 leading-relaxed italic flex-1">
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
                        className="rounded-full border border-white/[0.07] px-1.5 py-0.5 text-[9px] text-white/30"
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
                        ? "text-lantern-mint/60 bg-lantern-mint/10 cursor-default"
                        : "text-lantern-mint border border-lantern-mint/30 hover:bg-lantern-mint/10"
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
