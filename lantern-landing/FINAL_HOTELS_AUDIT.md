# TravelGrab Hotels — Final Audit Report

**Date:** 2026-06-16  
**Auditor role:** Lead PM / Designer / Engineer  
**Scope:** Full review of hotels UX, ranking, neighborhood intelligence, AI recommendations, conversion, and competitive positioning

---

## PHASE 1 — UX Audit

### Search Panel
**Strengths:** Destination combobox with debounced autocomplete (Google Places + local city fallback). Date pickers with `[color-scheme:dark]`. Stepper controls for guests/rooms. Inline validation with red error cards. Single large CTA button.

**Issues found & fixed:**
- "What kind of area?" chip label → changed to **"What matters to you?"** (more intuitive framing)
- Hero subtitle was generic ("ranks hotels by reviews, walkability, location quality, and value") → rewritten to lead with preference chips: **"Tell us the kind of area you want and we'll rank hotels by neighborhood fit, reviews, and value — not commission rates."**
- Idle-state feature cards were vague → rewritten with concrete differentiators: Neighborhood Fit Score, Review-first ranking, No hidden incentives

**Remaining gaps (future work):**
- No map view (significant gap vs Booking.com / Google Hotels)
- No price range filter slider
- No photo gallery (only one image per card)
- No "cheapest nearby dates" hint
- No mobile-specific keyboard handling (auto-dismiss keyboard after date selection)

### Results Section
**Strengths:** Neighborhood guide cards with "Stay here" filter. RecommendationPanel highlighting AI Pick. Expandable score breakdown per card. Fit labels + fit notes + poor-fit warning badges.

**Issues found & fixed:**
- No sort options → added **Sort bar: Best match / Price ↑ / Price ↓ / Rating** buttons above results
- Summary bar showed "Ranked by TravelGrab" which told users nothing → replaced with sort control
- Neighborhood guide hover states and "Showing these hotels" states work correctly

**Remaining gaps:**
- RecommendationPanel duplicates the AI Pick card below it — content is identical; panel could instead show "why this vs. the alternatives" comparison
- No "results per page" or lazy-load for long lists
- No amenity quick-filter (pool, breakfast, etc.)

---

## PHASE 2 — Ranking Audit

### Scoring Formulas

**No preferences selected:**
```
Score = Price×0.28 + Reviews×0.27 + Location×0.20 + Stars×0.14 + Walk×0.11
```

**Preferences active (non-budget):**
```
Score = NeighborhoodFit×0.35 + Stars×0.25 + Reviews×0.20 + Price×0.10 + Walk×0.10
```

**Budget-only:**
```
Score = Price×0.50 + Reviews×0.25 + Location×0.10 + Stars×0.08 + Walk×0.07
```

### Bugs Fixed
1. **`starsScore` = 0 for unrated hotels** — A hotel with no official star rating (many boutique hotels, hostels) received starsScore=0, which penalized them 25% of the score under preference mode. Fixed: unrated hotels now default to **40** (neutral, not penalized).

2. **Tokyo `cityKey` not set in `buildWhy`** — The `buildWhy` function only set `cityKey = "barcelona"`, so Tokyo hotels never received city-specific recommendation copy from `prefStrengthCopy()`. All Tokyo preference searches got generic phrases ("excellent luxury options") instead of copy like "premium shopping, Michelin-starred restaurants, and upscale hotels." Fixed: `cityKey` now also checks for "tokyo", "london", and "new york".

### AI Pick Gates
When preferences active:
- Pool: neighborhood_fit_score ≥ 50
- Relaxation: NF ≥ 40 if no hotels pass
- Final fallback: all hotels
- Luxury gate: additionally requires stars_score ≥ 70 (≥ 3.5 stars)

**Test scenarios verified (conceptually):**
| Search | Prefs | Before | After |
|--------|-------|--------|-------|
| Tokyo, Luxury | luxury | Hotel Tavinos Asakusa (NF=12, $60/night) | Should pick Ginza/Roppongi hotel |
| Barcelona, Quiet+Luxury | quiet+luxury | Room Mate Collection Gerard (NF=12) | Should pick Eixample hotel |
| London, Quiet | quiet | Any central hotel | Should prefer Kensington/Notting Hill |
| NYC, Food | food | Any Manhattan hotel | Should prefer West Village/SoHo |

---

## PHASE 3 — Neighborhood Intelligence

### Cities with Full Pre-calibrated Fit Tables

| City | Preferences Covered | Neighborhoods |
|------|--------------------|----|
| Tokyo | All 10 prefs | 30+ areas (Ginza, Shinjuku, Shibuya, Asakusa, Roppongi, Meguro, etc.) |
| Barcelona | All 10 prefs | 15+ areas (Eixample, Gothic Quarter, El Born, Gràcia, etc.) |
| **London** ✨ NEW | All 10 prefs | 20+ areas (Mayfair, Shoreditch, Covent Garden, South Bank, Kensington, etc.) |
| **NYC** ✨ NEW | All 10 prefs | 18+ areas (Midtown, Upper East Side, SoHo, West Village, LES, etc.) |

### Cities with Postal-Code Profiles
- **Paris** — 20 arrondissements (75001–75020) with `bestFor[]` and `traits[]` arrays. Used by Google Places enrichment path.

### Cities with Generic Fallback Only
Amsterdam, Rome, Madrid, Berlin, Sydney, etc. — fall through to Places enrichment + keyword scoring. Still produces reasonable results but with less precision.

### Address-Based Sub-district Detection
`lookupCityNeighborhoodScore` performs address-level matching before neighborhood-level matching, so:
- A hotel at "4 Rue de Rivoli, Mayfair, London" → gets Mayfair-level scores (not generic Westminster)
- A hotel at "1 Times Square, New York" → gets Times Square/Midtown scores
- A hotel at "23-1 Ginza, Chuo City" → gets Ginza scores (not generic Chuo)

### Display Name Normalization
Admin district names from Google Places are mapped to friendly display names:
- Tokyo: "Chuo City" → "Ginza / Chuo", "Taito City" → "Asakusa / Taito", etc.
- London: "Royal Borough of Kensington and Chelsea" → "Kensington / Chelsea", "London Borough of Hackney" → "Shoreditch / Hackney", etc.

### Neighborhood Guide Cards
Interactive cards above results for: Tokyo (7 areas), Barcelona (6 areas), **London (6 areas)** ✨, **New York (6 areas)** ✨. Each card shows description, tags, hotel count, and "Stay here" filter.

---

## PHASE 4 — AI Recommendations

### `buildWhy()` — Recommendation Copy Logic

**When preferences active + avg score ≥ 50 (good fit):**
Generates: `"{Neighborhood} — {prefStrengthCopy}, and {price note}"`

Examples of city-specific copy now generated:
- Tokyo Luxury, Ginza hotel: "Ginza / Chuo — premium shopping, Michelin-starred restaurants, and upscale hotels, excellent reviews, and only $X/night more than the cheapest option."
- London Luxury, Mayfair hotel: "Mayfair — London's most exclusive address — Michelin restaurants, designer boutiques, and world-class hotels, outstanding guest reviews."
- NYC Food, West Village hotel: "West Village — some of New York's most acclaimed restaurants and most diverse food culture, excellent reviews."

**When preferences active + avg score < 50 (poor fit):**
Generates mismatch explanation: "Not ideal for Luxury: Asakusa / Taito suits budget travelers better than premium stays"

**When no preferences:**
Uses Places enrichment: `"{Neighborhood} — {locationSummary}"`

### Fit Labels & Badges
| Label | Condition | Display |
|-------|-----------|---------|
| Great fit | NF ≥ 68 (luxury: also stars≥75, reviews≥80, NF≥80) | Mint green badge |
| Good fit / Good area fit | NF 42–67 | Blue badge |
| Partial fit / Location fit, but basic hotel | NF 22–41 | Gold badge |
| (none) | NF < 22 | No badge |
| Poor Luxury Fit / Not Quiet / Not Family-Friendly | NF < 50 with luxury/quiet/family active | Red warning badge |

---

## PHASE 5 — Conversion Optimization

### Current CTAs
- **"View hotel"** button — links to Google Hotels booking URL (SerpAPI `booking_url`)
- Score badge is clickable → reveals score breakdown panel

### Strengths
- Score breakdown is transparent and builds trust
- Fit notes appear in-card next to the fit badge (visible context)
- RecommendationPanel puts the AI Pick name/price at the top of results

### Remaining Gaps
- "View hotel" is mild — Booking.com / Expedia use "See availability", "Book now"
- No price-per-person calculation (currently price_per_night × rooms, no per-person)
- No "book before this price expires" urgency (competitors use countdown timers)
- No photo gallery thumbnail strip (only one image, hidden if URL errors)
- `onError` on hotel image hides the element — fallback placeholder shows generic house icon but could show a nicer skeleton or city photo

---

## PHASE 6 — Competitive Analysis

### vs. Expedia / Booking.com
| Feature | TravelGrab | Booking.com | Expedia |
|---------|-----------|-------------|---------|
| Map view | ❌ | ✅ | ✅ |
| Photo gallery | ❌ (1 image) | ✅ (many) | ✅ (many) |
| Price calendar | ❌ | ✅ | ✅ |
| Neighborhood guidance | ✅ (unique) | Partial (map-only) | Partial |
| Preference-aware ranking | ✅ (unique) | ❌ | ❌ |
| AI Pick explanation | ✅ (unique) | ❌ | ❌ |
| Score breakdown | ✅ (unique) | ❌ | ❌ |
| Sort by price/rating | ✅ | ✅ | ✅ |
| Amenity filters | ❌ | ✅ | ✅ |
| Review snippets in card | ❌ | ✅ | ✅ |
| Currency selector | ❌ | ✅ | ✅ |

### Our Differentiators (Lean Into These)
1. **Preference chips** — No competitor asks "what kind of area?" upfront
2. **Neighborhood Fit score** — Unique concept: a property-level AND area-level score
3. **Score transparency** — Expandable breakdown; competitors hide their algorithms
4. **Honest mismatch copy** — We tell you when a hotel is poorly located for your needs

---

## PHASE 7 — Summary of Changes Made This Session

### Bug Fixes
1. **`starsScore` default** (`route.ts:693`) — Unrated hotels got starsScore=0 (a 25% penalty in pref mode). Now defaults to 40 (neutral).
2. **`buildWhy` cityKey** (`route.ts:~949`) — Was `barcelona`-only. Now covers tokyo, london, new york. Tokyo recommendation copy now city-specific.

### New Features
3. **Sort bar** (`HotelSearch.tsx`) — "Best match / Price ↑ / Price ↓ / Rating" buttons appear above results. Resets on new search.
4. **London neighborhood tables** (`route.ts`) — Full 10-pref fit tables for 20+ London neighborhoods (Mayfair, Shoreditch, Covent Garden, South Bank, Kensington, Bloomsbury, etc.)
5. **NYC neighborhood tables** (`route.ts`) — Full 10-pref fit tables for 18+ NYC neighborhoods (Midtown, UES, SoHo, West Village, LES, Brooklyn, etc.)
6. **London neighborhood guide** (`HotelSearch.tsx`) — 6 interactive cards with "Stay here" filter (Mayfair, Covent Garden, Shoreditch, South Bank, Kensington, Bloomsbury)
7. **NYC neighborhood guide** (`HotelSearch.tsx`) — 6 interactive cards (Midtown, Upper East Side, SoHo/West Village, Brooklyn, LES/East Village, Financial District)
8. **London + NYC address detection** (`route.ts`) — Sub-district matching in `lookupCityNeighborhoodScore` for 15+ London areas and 15+ NYC areas
9. **London + NYC neighborhood fallback** (`route.ts`) — `inferNeighborhoodFallback` patterns for 30+ landmarks across both cities
10. **London admin-name normalization** (`route.ts`) — Maps Google Places borough names to friendly display names
11. **London + NYC city-specific copy** (`route.ts`, `HotelSearch.tsx`) — `prefStrengthCopy` and `getNeighborhoodPrefDetail` now generate specific copy for London and NYC preference combinations
12. **London + NYC best-neighborhood table** (`route.ts`) — Used in "less X than Y" comparisons in recommendation copy
13. **Hero subtitle improved** (`HotelSearch.tsx`) — Leads with neighborhood preference framing
14. **Chip label improved** (`HotelSearch.tsx`) — "What kind of area?" → "What matters to you?"
15. **Idle feature cards rewritten** (`HotelSearch.tsx`) — Concrete, specific, differentiating

---

## Top 10 Future Improvements

1. **Map view** — Interactive map with hotel pins, neighborhood overlays. Biggest gap vs competitors.
2. **Photo carousel** — 3–5 images per hotel card with swipe/arrow navigation.
3. **Price calendar** — Show cheapest check-in dates in a ±7-day window.
4. **Amenity filter chips** — Pool, Breakfast, Pet-friendly, Gym, Parking above results.
5. **Review snippets** — Show the single most relevant review phrase per hotel (extractable from SerpAPI).
6. **Paris neighborhood fit tables** — Paris has postal-code profiles but not the pre-calibrated NF tables. Add for 20 arrondissements.
7. **More cities** — Rome, Madrid, Amsterdam, Berlin, Sydney, Dubai are high-traffic with no pre-calibrated tables.
8. **RecommendationPanel differentiation** — Instead of repeating the AI Pick's card text, show a "vs. alternatives" comparison ("$42 more than the Budget Pick but 23 points higher on neighborhood fit").
9. **Mobile UX** — Test and optimize full flow on mobile. Date pickers need native mobile input fallback. Neighborhood guide cards need horizontal scroll on small screens.
10. **"Book now" vs "View hotel" CTA split** — Deep-link directly into the booking flow when a checkout date is selected, not just the hotel page.
