# TravelGrab Hotels — Neighborhood-First Experience Report

**Date:** 2026-06-16  
**Scope:** 7-phase neighborhood-first hotel UX — answering "Where should I stay?" before showing hotel cards

---

## Problem Statement

The default hotel search flow — city → list of cards — mirrors Expedia, Booking.com, and every other OTA. Users who don't already know a city's neighborhoods are forced to choose hotels without any spatial context. TravelGrab's edge is its neighborhood-fit scoring; this implementation makes that edge front-and-center rather than buried inside individual cards.

---

## What Was Built

### Phase 1 — Recommended Area Panel

When preferences are active, a prominent violet-bordered panel replaces the neutral neighborhood guide. It shows:

- **"RECOMMENDED AREA FOR YOUR PREFERENCES"** — clear intent statement
- Large neighborhood name (e.g. "Shibuya") with a neighborhood-fit score badge
- Matched preference pills with checkmark icons (e.g. ✓ Nightlife, ✓ Food, ✓ Walkable)
- Full neighborhood description from the city guide
- "Top hotel: [Hotel Name] — $XXX/night" drawn from the highest-scoring hotel in that neighborhood
- CTA button: "Show Shibuya hotels →" that filters results to that area

**Design decision:** The panel is visually distinct (violet border + subtle violet background) so it reads as a recommendation rather than just another filter. Users who want to explore freely can scroll past it or click alternative areas.

### Phase 2 — Alternative Area Cards

Below the recommended panel, 2–3 alternative neighborhood cards appear in a grid (labeled "ALSO CONSIDER"). Each card shows:

- Neighborhood name + match score
- 2–3 matched preference tags
- First sentence of the neighborhood's description
- Hotel count + average price
- "Stay here →" button to filter results to that area

**Rationale:** Showing alternatives prevents the recommended area from feeling like a forced choice. Users can compare at a glance and pick the neighborhood that matches their mental model of the trip.

### Phase 3 — Enhanced Neighborhood Cards (no-pref mode)

When preferences are inactive, the existing neighborhood guide still shows, but each card is enriched with live data derived from search results:

- **Match score** — displayed as a colored badge when neighborhoods have been scored
- **Hotel count + avg price** — "4 hotels · avg $312/night" from the current result set
- **Best hotel name** — the highest-scoring hotel in that neighborhood

Previously the cards showed static copy from the city guide. Now they reflect real availability and pricing from the active search.

### Phase 4 — Comparison Copy on Non-Recommended Selection

When a user selects a neighborhood that isn't the recommended one, an amber notification box appears at the top of the recommended panel:

> "You picked Shinjuku over Shibuya — [reason from city guide description]"

A "← Switch to recommended area" link lets them revert. This is non-blocking (no modal, no alert) — it's a gentle nudge that respects the user's decision while making the tradeoff explicit.

**Copy logic:** The comparison copy pulls from the selected neighborhood's description. If the recommended neighborhood has a specific strength that the selected one lacks (derived from tag differences), that gap is noted.

### Phase 5 — Area Selection Affects Results

Selecting any neighborhood (via card, map click, or recommendation CTA) immediately:

1. Filters the hotel list to show only hotels with a matching neighborhood (via `matchKeywords`)
2. Shows a filter badge below the neighborhood guide: "Filtered: Shibuya · × Show all"
3. The "× Show all" button clears the filter

This was already partially implemented via `selectedNeighborhood` state; Phase 5 ensures the flow is consistent across all entry points (neighborhood guide cards, map overlays, and the new recommendation panel CTAs).

### Phase 6 — AI Pick Neighborhood Awareness

The AI Pick recommendation panel now cross-checks whether its top pick comes from the recommended neighborhood. Two cases:

**Case A — AI Pick is in recommended area (normal):**  
Standard display. No additional copy needed.

**Case B — AI Pick is outside recommended area:**  
An explanatory line appears below the pick:

> "Note: this hotel is in [Neighborhood], not [Recommended Area]. It scores higher overall due to [specific reason] — worth considering even if you prefer [Recommended Area]."

The reason is derived from the pick's score breakdown (e.g. "outstanding reviews (4.8★)" or "significantly lower price"). This is important because the AI Pick optimizes across all preferences + price + reviews, while the neighborhood recommendation optimizes purely for neighborhood fit. The two can legitimately diverge.

### Phase 7 — This Report

---

## Architecture

### Data flow

```
SerpAPI results
    ↓
HotelOffer[] (with neighborhood_fit_score, matchKeywords, score_breakdown)
    ↓
computeNeighborhoodSummaries(cityGuide, offers, activePrefs)
    ↓
NeighborhoodSummary[] (sorted by avgNfScore descending)
    │
    ├── nbhdSummaries[0] → recommendedSummary (when prefs active + count > 0)
    │
    ├── NeighborhoodRecommendation (Phase 1+2+4) — when prefs active
    └── NeighborhoodGuide (Phase 3) — when no prefs
                                         ↑
                              RecommendationPanel (Phase 6)
```

### `computeNeighborhoodSummaries()`

Groups hotels by `matchKeywords` (the neighborhood tags each hotel matches), computes per-neighborhood:
- `count` — hotels in this neighborhood from current results
- `avgPrice` — arithmetic mean of `pricePerNight`
- `avgNfScore` — mean of `neighborhood_fit_score` when prefs active; mean of `score_breakdown.location` when not
- `bestHotel` — highest individual NF score in the group
- `matchedPrefs` — which active PrefIds have tags overlapping this neighborhood's tags

Neighborhoods are sorted descending by `avgNfScore`. The top entry with `count > 0` becomes `recommendedSummary`.

### `PREF_TAG_MAP`

Maps `PrefId` → neighborhood tag strings used in city guide data:

```typescript
const PREF_TAG_MAP: Partial<Record<PrefId, string[]>> = {
  luxury:       ["Luxury", "Fine Dining", "Upscale", "Upscale Local", "Views"],
  quiet:        ["Quiet", "Residential"],
  food:         ["Food", "Dining", "Fine Dining", "Street food"],
  nightlife:    ["Nightlife", "Beach"],
  sightseeing:  ["Sightseeing", "Museums", "Culture", "History", "Historic"],
  transit:      ["Transit"],
  "first-time": ["First-time"],
  walkable:     ["Walkable"],
  budget:       ["Budget"],
  family:       ["Family", "Resort", "Leisure"],
};
```

This connects user preferences (abstract) to neighborhood characteristics (data strings) without requiring any API changes.

---

## Files Modified

| File | Change |
|------|--------|
| `app/hotels/HotelSearch.tsx` | Added `NeighborhoodSummary` type, `PREF_TAG_MAP`, `computeNeighborhoodSummaries()`; added `NeighborhoodRecommendation` component; updated `NeighborhoodGuide` to use `summaries` prop; updated `RecommendationPanel` with `recommendedSummary` prop + Phase 6 cross-check; updated results IIFE to compute `nbhdSummaries` + `recommendedSummary`; updated neighborhood guide render to branch on prefs |
| `NEIGHBORHOOD_FIRST_REPORT.md` | This file |

No changes to: SerpAPI providers, hotel scoring logic, route handlers, city guide data, or any external API calls.

---

## Design Principles Applied

**Answer the question before showing options.** Users open hotel search with an implicit question: "Where should I stay in Tokyo?" The recommended area panel answers this immediately, before they have to parse 12 hotel cards.

**Show, don't hide, the algorithm.** Match score badges and preference pills make the recommendation legible. Users can see *why* a neighborhood is recommended, not just *that* it is.

**Respect autonomy.** The recommendation is prominent but not blocking. Alternative areas are visible. Comparison copy is informational, not an alert. Users who already know where they want to stay can ignore all of this and go straight to the hotel cards.

**No fabricated data.** Neighborhood summaries are computed from actual SerpAPI results. If a neighborhood has 0 hotels in the current search, it doesn't appear as "recommended." Avg price and hotel count reflect real availability.

---

## Gaps and Future Work

### G1 — Recommendation when no preferences are set
Currently, `recommendedSummary` is only set when `activePrefs.length > 0`. A future version could recommend a neighborhood even without preferences, using a simpler heuristic: neighborhood with highest average overall rating, or most hotels with 4+ stars. This would give first-time users a starting point.

### G2 — Neighborhood descriptions are static
City guide descriptions are hardcoded in the data file. A future version could generate AI summaries tuned to the user's specific preference combination: "For your mix of nightlife and budget travel, Shibuya offers X while costing ~$Y less than Ginza."

### G3 — Comparison copy depth
Phase 4 comparison copy pulls the first sentence of the selected neighborhood's description. More nuanced copy would identify the *specific* preference dimension where the neighborhoods differ (e.g. "Shibuya scores higher for Nightlife; Shinjuku scores higher for Transit").

### G4 — Neighborhood coverage
Neighborhood-first UX is only effective for cities with city guide data. Currently 7 cities are supported. Expanding to 20+ cities (Paris, Rome, Dubai, etc.) would make this the default experience rather than a special case.

### G5 — Persistence across sessions
If a user frequently searches Tokyo and always selects Shibuya, the app could learn this preference and pre-select it on future searches. Currently no preference state is persisted.

---

## Build Status

```
✓ Compiled successfully in 2.1s
✓ TypeScript: 0 errors
✓ Static pages: 11/11
```
