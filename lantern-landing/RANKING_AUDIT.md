# TravelGrab Hotels — Ranking Engine Audit

**Date:** 2026-06-16  
**Engineer role:** Principal Engineer + Head of Product  
**Scope:** Full audit of every scoring component, scoring formulas, and ranking logic

---

## 1. Scoring Formulas

### No preferences:
```
Score = Price×0.28 + Reviews×0.27 + Location×0.20 + Stars×0.14 + Walk×0.11
```

### Preferences active (non-budget):
```
Score = NeighborhoodFit×0.35 + Stars×0.25 + Reviews×0.20 + Price×0.10 + Walk×0.10
```

### Budget-only:
```
Score = Price×0.50 + Reviews×0.25 + Location×0.10 + Stars×0.08 + Walk×0.07
```

---

## 2. Component-by-Component Audit

### 2.1 Price Score

**Formula:** `(maxP - hotelPrice) / priceRange * 100`

**Issue: Relative pricing with wide ranges creates misleading signals.**

If the search returns hotels between $50 and $500:
- $50 hotel: priceScore = 100
- $275 hotel: priceScore = 50
- $500 hotel: priceScore = 0

In no-prefs mode, price is weighted 28%. A hotel at $50 (score=100) vs $100 (score=89) gets a 3-point advantage — that seems right. But if the cheapest is $50 and most expensive is $2000:
- $50 = 100
- $100 = 97.4
- $500 = 76

Now the $500 hotel still scores 76/100 on "price" even though it's 10× the cheapest. The relative scoring compresses meaningful differences.

**Root issue:** Price score compares hotels against EACH OTHER within the search, not against any absolute value. A $400/night hotel at a luxury resort scores "well" on price if the other results are $450–$600. Users don't know this.

**Verdict:** Acceptable for internal ranking but creates confusion when users see the score breakdown (a $400 hotel scoring 65 on "Price / Value" makes no sense to a user who considers $400 expensive).

**Fix:** Rename "Price / Value" in the breakdown panel to "Price vs. Others in Search" and add a note explaining it's relative.

---

### 2.2 Review Score

**Formula:** `min(100, (overallRating / 5) * 100)`

**Issue 1: No confidence weighting by review count.**

- Hotel A: 5.0 rating / 3 reviews → reviewScore = 100
- Hotel B: 4.7 rating / 2,847 reviews → reviewScore = 94

Hotel A beats Hotel B on review score. This is statistically unjustifiable. With 3 reviews, a 5.0 rating has massive variance. With 2,847 reviews, a 4.7 is extremely reliable.

**Bayesian correction formula:**
```
reviewConfidence = min(1.0, reviewCount / 200)
adjustedReviewScore = rawScore × reviewConfidence + 70 × (1 - reviewConfidence)
```

Effect:
- 0 reviews → 70 (baseline)
- 50 reviews → (score × 0.25 + 70 × 0.75) 
- 200+ reviews → full raw score

This shrinks 5.0/3reviews from 100 → 82, while keeping 4.7/2847reviews at ~94.

**Issue 2: 5.0 hotels with fake reviews.**

Any hotel can have 5.0 from a handful of friends/family. Without review volume, this number is meaningless.

**Issue 3: Review score is the same whether rating is from guests or operators.**

SerpAPI's `overallRating` comes from Google Hotels, which aggregates from multiple sources. Quality varies by hotel.

**Verdict: HIGH PRIORITY FIX.** Implement Bayesian review score.

---

### 2.3 Location Score

**Formula:** `h.locationRating > 0 ? min(100, (locationRating / 10) * 100) : 50`

**Issue 1: Location rating scale is ambiguous.**

SerpAPI returns `locationRating` on what appears to be a 0–10 scale. But some hotels return ratings like 4.2 (which would give 42/100) while others return 8.5 (giving 85/100). The scale isn't consistent — some providers use 0-5, others use 0-10.

**Issue 2: Fallback of 50 is neutral but misleading.**

A hotel in a peripheral suburb that provides no location rating defaults to 50 — same as a well-located hotel. This is probably fine overall but a hotel in a bad location that lacks location data won't be penalized.

**Issue 3: Location score doesn't connect to neighborhood fit.**

The `locationScore` from SerpAPI and the `neighborhood_fit_score` from NF tables are two separate dimensions. They overlap conceptually but don't reinforce each other. A hotel can have a high location score from Google (e.g., because it has a pretty pool) but a low NF score (because it's in the wrong neighborhood for the user's prefs).

**Verdict:** MEDIUM PRIORITY. Add a note in the breakdown showing this is Google's location score, not neighborhood fit.

---

### 2.4 Stars Score

**Formula:** `h.starRating > 0 ? min(100, (starRating / 5) * 100) : 40`

**Issue 1: 4-star hotels score 80 in preference mode.**

In preference mode, stars contribute 25% of the score. So 4-star = 80, 5-star = 100. The 20-point gap between 4-star and 5-star (contributing 5 points to final score) is probably fine.

**Issue 2: 1-star and 2-star hotels score 20 and 40.**

A hostel (1-star) scores 20, a budget hotel (2-star) scores 40. In luxury preference mode, these get multiplied by 25% = 5/10 out of 100. That's a meaningful penalty that helps prevent budget hotels from winning luxury searches.

**Issue 3: Unrated hotels default to 40.**

The fix from the previous session (defaulting to 40 instead of 0) is correct — boutique hotels often lack star ratings but are high quality. 40 is a reasonable neutral.

**Issue 4: A 3.9-star hotel scoring 80 overall.**

Let me trace this:
- Reviewed 3.9/5 → reviewScore = 78
- Unrated (no stars) → starsScore = 40
- Good location → locationScore = 80
- Cheapest in set → priceScore = 100
- Default walkability → walkScore = 40

No-prefs score: 100×0.28 + 78×0.27 + 80×0.20 + 40×0.14 + 40×0.11
= 28 + 21.1 + 16 + 5.6 + 4.4 = **75**

With preference mode (NF=85 for the right neighborhood):
85×0.35 + 40×0.25 + 78×0.20 + 100×0.10 + 40×0.10
= 29.75 + 10 + 15.6 + 10 + 4 = **69**

So a 3.9/5 hotel CAN score ~75 when:
1. It's the cheapest in the search
2. It has good location data
3. It has no star rating (gets 40 not 0)

This is **arguably correct** — a 3.9-rated hotel that's the cheapest option in a great location deserves to score well. The problem is users equate the "AI Score" with "quality" rather than "value-adjusted fit." This is a communication problem, not a scoring problem.

**Verdict:** Stars formula is fine. Communication of what the score means is the issue.

---

### 2.5 Walkability Score

**Formula:**
```typescript
if (walkable.length === 0) return 40; // no data
const under10 = walkable.filter((m) => m <= 10).length;
const under20 = walkable.filter((m) => m <= 20).length;
return min(100, under10 * 18 + under20 * 6 + 10);
```

**Issue: No-data (40) beats data-with-far-places (10).**

If SerpAPI returns 5 nearby places but all are 25+ min walk:
- `walkable.length` = 5 (not zero)
- `under10` = 0, `under20` = 0
- Score = 0 + 0 + 10 = **10**

If SerpAPI returns no nearby places at all:
- Score = **40** (no-data default)

A hotel in a known car-dependent suburb scores 10; an unknown hotel with no data scores 40. This penalizes hotels where Google Places found distant walkable places.

**Fix:**
```typescript
if (walkable.length === 0) return 40;
const under5  = walkable.filter((m) => m <=  5).length;
const under10 = walkable.filter((m) => m <= 10).length;
const under20 = walkable.filter((m) => m <= 20).length;
// Floor at 20 when we have data: having walkable places nearby (even far) 
// means the hotel has neighbors. Truly isolated hotels return 40 (no data).
return min(100, max(20, under5 * 22 + (under10 - under5) * 14 + (under20 - under10) * 5 + 15));
```

New behavior:
- 0 places data → 40 (unchanged)
- 5 places all >20 min → max(20, 0+0+0+15) = **20** (not 10)
- 1 place within 10 min → max(20, 14+15) = **29**
- 1 place within 5 min → max(20, 22+15) = **37**
- 3 places within 5 min → max(20, 66+15) = 81

**Verdict: LOW PRIORITY FIX.** Improves consistency but doesn't materially affect rankings in central cities.

---

### 2.6 Neighborhood Fit Score

**City table lookup (priority path):** Pre-calibrated 0–100 scores. Works correctly for Tokyo, Barcelona, London, NYC.

**Dynamic scoring path:** Uses Places enrichment (65 if bestFor matches) + proximity bonuses + keyword matching. Produces scores in range 12–100.

**Issue 1: Dynamic scores are not calibrated to table scores.**

Table scores are careful human-calibrated values (e.g., Ginza luxury = 95). Dynamic scores for Paris a luxury hotel might be: 65 (bestFor match) + 15 (summary keywords) + 28 (3-min transit) = 108 → capped at 100. Or for a less-matched hotel: 12 + 0 + 8 = 20.

So dynamic scores produce 20–100 range, roughly comparable to table scores. This is acceptable.

**Issue 2: Cities without tables get unreliable neighborhood fit.**

Bangkok, Singapore, Seoul, Rome, Paris, Sydney — users selecting prefs for these cities will get NF scores based entirely on keyword/Places matching. These scores are less precise and can't distinguish sub-neighborhoods (e.g., Sukhumvit Soi 11 vs Soi 71 in Bangkok).

**Issue 3: Averaging across multiple prefs masks conflicts.**

If user selects both "quiet" and "nightlife" (contradictory), scores are averaged. A hotel in Shibuya might get:
- quiet: 37
- nightlife: 90
- Average: 63.5

A hotel in Meguro might get:
- quiet: 87
- nightlife: 62
- Average: 74.5

Meguro wins even though Shibuya is the objectively better nightlife area. The quiet preference is dragging Shibuya down more than it should, given the user explicitly selected nightlife too.

**Potential fix:** When prefs are contradictory (quiet + nightlife), weight the higher NF score more. Or detect contradictions and warn the user.

**Verdict for NF overall:** The system works well for the 4 supported cities. Main gaps are (a) missing cities and (b) conflict detection.

---

## 3. AI Pick Gate Logic

```
IF prefs active:
  pool = hotels with NF >= 50 AND (if luxury: stars >= 70)
  IF pool empty: relax to NF >= 40
  IF still empty: use all hotels
  bestOverall = highest ai_score in pool
```

**Issue: Luxury gate requires stars >= 70 (3.5 stars) but doesn't filter unrated hotels.**

An unrated boutique hotel (starsScore=40) would fail the luxury gate's stars >= 70 requirement. This is CORRECT — an unrated hotel shouldn't be the luxury AI Pick. Good.

**Issue: When no hotels pass NF >= 50, fallback to all hotels feels arbitrary.**

In a city without NF tables (e.g., Bangkok), all hotels return NF = 0. The AI Pick gate then applies to all hotels (the final fallback), and the winner is just the highest overall score — which means price/reviews dominate, not neighborhood fit. This makes the AI Pick feel wrong for these cities.

**Potential fix:** For cities without NF tables, switch the gate to require Google Places `bestFor` to include the pref.

---

## 4. Score Compression Analysis

**Issue: All scores end up in the 55–80 range for most searches.**

In a typical London luxury search:
- Mayfair 5-star hotel: NF=98, stars=100, reviews=90, price=15, walk=75 → 34.3+25+18+1.5+7.5 = **86**
- Shoreditch 3-star hotel: NF=42, stars=60, reviews=82, price=80, walk=68 → 14.7+15+16.4+8+6.8 = **61**
- Westminster 4-star hotel: NF=78, stars=80, reviews=85, price=45, walk=72 → 27.3+20+17+4.5+7.2 = **76**

Range: 61–86. The scores look like "75 vs 76 vs 77" for many hotels. The AI Pick score might be 78 vs the 2nd place at 76. A 2-point difference creates an aura of false precision.

**This is a communication problem more than a scoring problem.** The scores correctly rank the hotels but users expect a 78 to feel meaningfully better than a 76.

**Fix:** Add a label system:
- 85–100: "Excellent match"
- 70–84: "Great match"
- 55–69: "Good match"
- <55: "Partial match"

Show the label instead of (or alongside) the number for non-power-users.

---

## 5. Specific Pathological Cases

### Case A: Budget hotel ranks #1 in no-preference search
**Cause:** Price (28%) + review (27%) = 55% of score. A cheap hotel with decent reviews wins.
**Fix:** This is intentional design for no-prefs mode. Acceptable.

### Case B: 3.9-rated hotel scoring 75+
**Cause:** Cheap + good location + no star rating (40 default) + decent reviews.
**Fix:** Communication: the score means "value-adjusted fit," not "quality." Add tooltip.

### Case C: Luxury explanation mentions "dining scene"
**Cause:** `buildWhy` adds "outstanding local dining scene" as a secondary pref copy when NF includes food.
**Fix:** The building logic is correct. This only appears when the hotel also scores well for food, which is accurate for a luxury Ginza hotel.

### Case D: Budget hotel survives luxury AI Pick pool
**Cause:** If NF >= 50 AND stars >= 70, budget hotels are already excluded (unrated or 3-star fail the stars gate). 
**Verdict:** Actually handled correctly.

### Case E: Hotels in great neighborhoods with poor hotels
**Cause:** A mediocre 2-star hotel in Mayfair might have NF=98 (Mayfair luxury score) but overall score = 98×0.35 + 40×0.25 + 70×0.20 + 100×0.10 + 50×0.10 = 34.3+10+14+10+5 = **73.3**
A good 4-star hotel in Kensington: NF=90, stars=80, reviews=85, price=50, walk=75 → 31.5+20+17+5+7.5 = **81**
The Kensington hotel correctly beats the Mayfair dive. ✅

---

## 6. Changes Implemented (Phase 6)

See implementation notes in Phase 6. Key changes:

1. **Bayesian review score** — weight by `min(1, reviewCount/200)` to prevent low-review hotels dominating
2. **Walkability floor fix** — raise minimum when walkable data exists from 10 to 20
3. **Amenity filter chips** — UI change
4. **Expand poor-fit warnings** — added food/sightseeing/nightlife/transit/walkable
5. **Score label copy** — added human-readable score labels
6. **NF tables for Bangkok, Singapore, Seoul** — prevent keyword-only scoring for top destinations
