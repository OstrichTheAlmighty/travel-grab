# TravelGrab Hotels — Research & Coverage Report

**Date:** 2026-06-16  
**Scope:** Phases 1–5 — coverage confidence, hotel research drawer, amenity detail, outbound link disclosure

---

## Problem Addressed

Two friction points prevented TravelGrab from being a complete hotel research tool:

1. **Thin neighborhood coverage** — searches could return 1–2 hotels for a "recommended" area, making the recommendation feel hollow or misleading.
2. **Premature exit** — "Check availability" sent users to Google Hotels before they had enough information to commit. Users who researched externally often didn't return.

---

## What Was Built

### Phase 1 — Coverage Audit per Neighborhood

`NeighborhoodSummary` now computes and exposes:

| Field | Description |
|-------|-------------|
| `count` | Hotels found in this neighborhood for this search |
| `lowestPrice` | Cheapest nightly rate in the neighborhood |
| `avgPrice` | Average nightly rate |
| `bestHotel` | Highest TravelGrab score in the neighborhood |
| `topRated` | Highest guest rating (overall_rating) in the neighborhood |
| `coverageConfidence` | `"strong"` / `"good"` / `"limited"` |

The recommended area panel now shows both `lowestPrice` ("from $X") and `avgPrice` ("avg $Y"). A distinct "Top pick" line (by TravelGrab score) and a "Best rated" line (by guest reviews) appear — these are often different hotels.

### Phase 2 — Coverage Confidence Labels

Every neighborhood now carries a `coverageConfidence` rating:

| Label | Criteria | Badge color |
|-------|----------|-------------|
| Strong coverage | 5+ hotels AND avg NF score ≥ 55 | Green (lantern-mint) |
| Good coverage | 3–4 hotels | Blue (lantern-blue) |
| Limited coverage | 1–2 hotels | Amber |

The recommended area panel header shows this badge. The neighborhood guide cards (no-prefs mode) also show it on each card.

**Thin-coverage warning:** When the recommended area has fewer than 5 hotels, an amber inline alert appears:
> "2 hotels in Ginza / Chuo for these dates. Also compare Shinjuku and Roppongi for more options."
 
Alternative neighborhoods are rendered as clickable links that immediately filter to that area.

### Phase 3 — Hotel Research Drawer

A full-screen overlay drawer opens when a user clicks "Research" on any hotel card. The drawer slides in from the right (fixed panel, scrollable content, sticky header and footer).

**Contents:**
1. **Hero image** — larger than the card thumbnail (full-width, 48–56px tall on mobile/desktop)
2. **Name, neighborhood, address** with badge row (AI Pick, recommendation labels, eco certification)
3. **Rating row** — star rating, numeric score (e.g. 4.8), review count, TravelGrab score badge
4. **Price** — per-night, per-person (when group > 1), total price for stay
5. **Score breakdown** — same bars as the card, but with more breathing room; Neighborhood Fit row added when prefs active
6. **Amenities** — full amenity list as clickable chips (Phase 4 detail)
7. **About the neighborhood** — description and tags from city guide data (when available)
8. **Why this hotel fits** — `fitNote` (preference-matched reasoning) + `recommendation_why` (AI rationale)
9. **Consider before booking** — tradeoff flags when score components are weak (see below)
10. **Sticky CTA** — "Check availability →" with outbound disclosure (Phase 5)

**Tradeoffs shown automatically:**
- Price/Value score < 45 → "Priced above average for this search."
- Walkability score < 45 → "Limited walkability in the immediate area."
- Guest Reviews score < 45 → "Guest reviews below the search average."

These are derived from the existing `score_breakdown` — no additional data required, no values invented.

### Phase 4 — Amenity Deep-Dive

Inside the drawer, amenity chips are tappable. Clicking any chip with known detail shows an explanation panel below the chips.

Known amenity categories with details: pool, gym/fitness, spa, breakfast, restaurant, bar, parking, airport shuttle, beach, rooftop, pet-friendly, Wi-Fi, kitchen, laundry, EV charging, wheelchair access, childcare, concierge, casino, golf, tennis, air conditioning, hot tub/jacuzzi, sauna.

**Honesty principle:** Amenities without a known detail record show: *"Amenity listed by this hotel. Contact them directly to confirm availability and details."* No amenity quality or photo is invented.

**Chip styling:**
- Amenities with known details: full opacity, pointer cursor, highlights on click
- Amenities without details: reduced opacity, default cursor (not interactive)

This makes it immediately visible which amenities TravelGrab has data on vs. which are just tags.

### Phase 5 — Outbound Link Disclosure

**In hotel cards:**
- "Research" button added (left of "Check availability") — opens the drawer
- "Check availability" button unchanged visually
- Subtext changed from `"via Google Hotels"` to `"Opens Google Hotels · price may vary"`

**In the drawer CTA:**
```
Check availability →
Opens Google Hotels · Prices may change · Final booking happens off TravelGrab
```

The disclosure is factual, not alarming. It sets correct expectations without discouraging clicks — users who are ready to book see a clear path; users who need more research see the drawer content first.

---

## Architecture

### No new API calls

All data used by the drawer comes from the existing `HotelOffer` object already in client state. No additional SerpAPI calls, no geocoding, no external requests.

### Component structure

```
HotelSearch (main)
  ├── state: detailHotelId (string | null)
  │
  ├── HotelCard
  │     └── "Research" button → setDetailHotelId(offer.hotel_id)
  │
  └── HotelDetailDrawer
        props: offer (from offers[]), onClose, activePrefs, cityGuide, guests
        state: activeAmenity (for Phase 4 chip expansion)
        renders: fixed overlay + panel
```

### `coverageConfidence` is computed, not stored

The `coverageConfidence` field is derived from `count` and `avgNfScore` in `computeNeighborhoodSummaries()` on every render. No persistence needed — it changes with every search.

---

## What Data Is Available

| Data point | Source | Available? |
|------------|--------|------------|
| Hotel name, address | SerpAPI | ✓ Always |
| Star rating (1–5) | SerpAPI `hotel_class` | ✓ Most hotels |
| Guest rating (0–5) | SerpAPI `overall_rating` | ✓ Most hotels |
| Review count | SerpAPI `reviews` | ✓ Most hotels |
| Nightly price | SerpAPI `rate_per_night` | ✓ Always (required) |
| Amenity list | SerpAPI `amenities` | ✓ Most hotels |
| Hotel description | SerpAPI `description` | ✓ When available |
| Hero image | SerpAPI `images[0]` | ✓ Most hotels |
| GPS coordinates | SerpAPI `gps_coordinates` | ~85–95% of hotels |
| Score breakdown | Computed server-side | ✓ Always |
| Neighborhood fit | Computed server-side | ✓ When prefs active |
| Booking URL | SerpAPI `prices[]` or `link` | ✓ Most hotels |

## What Data Is Still Missing

| Missing data | Impact | Potential source |
|-------------|--------|-----------------|
| Multiple hotel photos | Drawer shows single thumbnail | SerpAPI `images[]` has multiple — not yet surfaced |
| Review text excerpts | No guest quotes | SerpAPI `reviews` endpoint (separate call) |
| Room types and availability | Can't show room-level pricing | Requires direct hotel API (Duffel, Beds24) |
| Amenity quality signals | No "heated outdoor pool" vs "small indoor pool" distinction | Manual data or structured hotel databases |
| Check-in/check-out times | Common research question | Hotel-level data not in SerpAPI response |
| Cancellation policy | High-stakes research question | Not in SerpAPI Google Hotels data |
| Distance to specific POIs | "How far from the Eiffel Tower?" | Would require geocoding + Haversine |

---

## Future Improvements

### F1 — Multiple photo gallery
SerpAPI returns `images[]` with multiple thumbnails. The drawer currently shows `images[0]`. A simple carousel (previous/next buttons) would make the drawer feel much more like a real hotel page.

### F2 — Review excerpts
SerpAPI's `google_hotels_property` endpoint returns user review snippets. These could be surfaced in the drawer as 2–3 quote cards. High trust signal — no AI-generated copy required.

### F3 — Room-level availability
The current "Check availability" CTA goes to Google Hotels. A future integration with a hotel booking API (Duffel, HotelBeds, etc.) would allow room selection inside TravelGrab, keeping users in-product through checkout.

### F4 — Saved hotels
A "Save for later" button in the drawer would let users build a shortlist without committing. State would persist via localStorage. Reduces the bounce-and-forget pattern where users check a hotel, leave, and can't find it again.

### F5 — Coverage warnings in search form
When a very specific destination query is likely to return < 3 hotels per neighborhood (e.g. "Kyoto Arashiyama"), a pre-search warning could nudge users toward broader city searches. Requires a lookup against historical result counts.

---

## Build Status

```
✓ Compiled successfully in 4.3s
✓ TypeScript: 0 errors
✓ Static pages: 11/11
```
