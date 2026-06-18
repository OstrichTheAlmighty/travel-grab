"use client";

// Panel that explains WHY a neighborhood was recommended.
// Renders as a bottom sheet on mobile, inline sidebar on desktop.

export interface NbhdPanelData {
  id:             string;
  name:           string;
  description:    string;
  tags:           string[];
  isRecommended:  boolean;
  chooseIfCopy:   string | null;
  hotelCount:     number;
  avgPrice:       number;
  lowestPrice:    number;
  topHotelName:   string | null;
  topHotelPrice:  number | null;
  topHotelRating: number | null;
}

interface Props {
  data:        NbhdPanelData | null;
  onClose:     () => void;
  variant:     "sheet" | "sidebar";   // sheet = mobile overlay, sidebar = desktop inline
}

export default function MapNeighborhoodPanel({ data, onClose, variant }: Props) {
  // --- Mobile bottom sheet ---
  if (variant === "sheet") {
    return (
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          transition-transform duration-300 ease-out
          ${data ? "translate-y-0" : "translate-y-full"}
        `}
        style={{ willChange: "transform" }}
      >
        {/* Scrim */}
        {data && (
          <div
            className="fixed inset-0 -z-10"
            onClick={onClose}
          />
        )}

        <div className="bg-[#090e1a] rounded-t-2xl border-t border-white/[0.08] max-h-[62vh] overflow-y-auto">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-8 h-1 rounded-full bg-white/15" />
          </div>

          {data && <PanelBody data={data} onClose={onClose} />}
        </div>
      </div>
    );
  }

  // --- Desktop sidebar ---
  if (variant === "sidebar") {
    if (!data) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6 py-8">
          <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-3">
            <svg className="w-4 h-4 text-white/25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
          </div>
          <p className="text-[11px] text-white/25 leading-relaxed">
            Tap a neighborhood<br />to see why it was recommended
          </p>
        </div>
      );
    }
    return (
      <div className="overflow-y-auto h-full">
        <PanelBody data={data} onClose={onClose} />
      </div>
    );
  }

  return null;
}

function PanelBody({ data, onClose }: { data: NbhdPanelData; onClose: () => void }) {
  // Derive 2–3 "why" bullets from the neighborhood description
  const whyBullets = data.description
    .split(/\.\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.replace(/\.$/, "").trim());

  const priceRange = data.lowestPrice > 0 && data.avgPrice > data.lowestPrice
    ? `$${data.lowestPrice}–$${data.avgPrice}/night`
    : data.avgPrice > 0
      ? `avg $${data.avgPrice}/night`
      : null;

  return (
    <div className="px-4 pb-6 pt-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[14px] font-bold text-white leading-tight">{data.name}</h3>
            {data.isRecommended && (
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-lantern-mint/80 bg-lantern-mint/10 border border-lantern-mint/20 rounded-full px-2 py-0.5 flex-shrink-0">
                Top Pick
              </span>
            )}
          </div>
          {priceRange && (
            <p className="text-[10px] text-white/30 mt-0.5">
              {data.hotelCount} hotel{data.hotelCount !== 1 ? "s" : ""} · {priceRange}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.10] transition-colors mt-0.5"
          aria-label="Close"
        >
          <svg className="w-3 h-3" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>

      {/* Tags */}
      {data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {data.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-semibold uppercase tracking-wide text-white/40 bg-white/[0.05] border border-white/[0.07] rounded-full px-2 py-0.5"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Why this area */}
      {data.isRecommended && whyBullets.length > 0 && (
        <div className="mb-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/22 block mb-1.5">
            Why we recommend this area
          </span>
          <ul className="space-y-1.5">
            {whyBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="flex-shrink-0 w-1 h-1 rounded-full bg-lantern-mint/50 mt-[5px]" />
                <span className="text-[11.5px] text-white/55 leading-snug">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Description for alternatives */}
      {!data.isRecommended && (
        <p className="text-[11.5px] text-white/45 leading-relaxed mb-3">{data.description}</p>
      )}

      {/* Choose instead if... */}
      {!data.isRecommended && data.chooseIfCopy && (
        <div className="rounded-lg border border-lantern-violet/15 bg-lantern-violet/[0.04] px-3 py-2.5 mb-3">
          <span className="text-[9px] font-bold uppercase tracking-widest text-lantern-violet/60 block mb-1">
            Choose {data.name.split(" /")[0]} instead if
          </span>
          <p className="text-[11.5px] text-white/60 leading-snug">
            {
              // Strip leading "Choose X if" prefix if it's already in the copy
              data.chooseIfCopy.replace(/^Choose [^.]+if\s*/i, "")
            }
          </p>
        </div>
      )}

      {/* Top hotel */}
      {data.topHotelName && data.topHotelPrice && (
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/22 block mb-1.5">
            Top hotel here
          </span>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11.5px] font-semibold text-white/70 leading-snug">{data.topHotelName}</span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {data.topHotelRating && data.topHotelRating > 0 && (
                <span className="text-[10px] text-white/35">{data.topHotelRating.toFixed(1)}★</span>
              )}
              <span className="text-[11px] font-bold text-white/55">${Math.round(data.topHotelPrice)}</span>
              <span className="text-[9px] text-white/25">/night</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
