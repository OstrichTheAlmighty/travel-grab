# TravelGrab Hotels — User Simulation Report

**Date:** 2026-06-16  
**Method:** Simulated 30 distinct traveler types across 10 cities. For each, evaluated: ranking intelligence, recommendation believability, neighborhood logic, trust, and comprehension of #1 result.

---

## Simulation Matrix

| # | Persona | City | Prefs Selected | Key Findings |
|---|---------|------|---------------|-------------|
| 1 | Luxury couple | Tokyo | luxury | ✅ Ginza wins. Believable. |
| 2 | Budget backpacker | Tokyo | budget | ⚠️ Asakusa hotels rank well but generic copy |
| 3 | Digital nomad | Tokyo | transit + walkable | ✅ Shinjuku/Shibuya surface correctly |
| 4 | Family | Tokyo | family | ⚠️ Ueno hotels rank well but no family-specific copy |
| 5 | Honeymoon | Tokyo | quiet + luxury | ⚠️ Meguro correct but score explanation confusing |
| 6 | First-time visitor | Barcelona | first-time | ✅ Gothic Quarter wins correctly |
| 7 | Food traveler | Barcelona | food | ✅ Eixample / El Born surface correctly |
| 8 | Backpacker | Barcelona | budget | ⚠️ l'Hospitalet wins on score but feels wrong |
| 9 | Nightlife traveler | Barcelona | nightlife | ✅ El Raval/El Born surface correctly |
| 10 | Business traveler | Barcelona | transit | ⚠️ Transit copy feels generic |
| 11 | First-time visitor | Paris | first-time | ❌ No NF tables — relies on keyword scoring |
| 12 | Luxury traveler | Paris | luxury | ❌ No NF tables — 8th arr. copy generic |
| 13 | Food traveler | Paris | food | ❌ Marais/Saint-Germain may surface but unscored |
| 14 | Romantic couple | Paris | quiet + luxury | ❌ Wrong hotels may rank — Eiffel area isn't quiet |
| 15 | First-time visitor | Rome | first-time | ❌ No NF tables at all — full keyword fallback |
| 16 | Sightseeing | Rome | sightseeing | ❌ Scoring will be arbitrary near Colosseum |
| 17 | Business traveler | London | transit | ✅ King's Cross / Canary Wharf surface |
| 18 | Luxury couple | London | luxury | ✅ Mayfair / Knightsbridge surface correctly |
| 19 | Food traveler | London | food | ✅ Soho / Shoreditch surface correctly |
| 20 | Family | London | family | ⚠️ Kensington correct but poor-fit warning missing for non-family areas |
| 21 | Luxury traveler | New York | luxury | ✅ UES / Midtown surface correctly |
| 22 | Nightlife | New York | nightlife | ✅ LES / East Village surface correctly |
| 23 | Budget backpacker | New York | budget | ⚠️ Queens hotels may not surface (SerpAPI coverage) |
| 24 | Family | New York | family | ⚠️ UES wins but no family copy explaining why |
| 25 | Digital nomad | Bangkok | transit + walkable | ❌ No NF tables — Sukhumvit advantages not captured |
| 26 | Luxury traveler | Bangkok | luxury | ❌ Riverside premium not scored |
| 27 | Food traveler | Singapore | food | ❌ Chinatown/Maxwell hawker area not scored |
| 28 | First-time visitor | Singapore | first-time | ❌ Marina Bay vs Orchard not differentiated |
| 29 | Luxury traveler | Seoul | luxury | ❌ Gangnam excellence not captured |
| 30 | First-time visitor | Sydney | first-time | ❌ CBD vs Bondi Beach not differentiated |

---

## Detailed Failure Analysis

### FAILURE TYPE 1: NF Tables Missing for High-Traffic Cities

**Cities without NF tables:** Paris (has postal profiles but not NF tables), Rome, Bangkok, Singapore, Seoul, Sydney, Amsterdam, Madrid, Berlin.

**Impact:** For these cities, scoring falls back to keyword matching and Google Places enrichment. This produces:
- Scores that don't differentiate neighborhoods meaningfully
- Generic recommendation copy ("excellent luxury options" instead of city-specific)
- Hotels in inferior neighborhoods ranking above better-located options

**Example — Paris Luxury traveler:**
- 8th arrondissement (Champs-Élysées) hotel: keyword match on "luxury" in description = score ~55
- 18th arrondissement (Montmartre) hotel at same price: if it mentions "luxury" in amenities = also ~55
- **Result:** User gets no clear neighborhood preference signal in Paris, despite NF tables being trivially addable from existing Paris profiles.

**Example — Bangkok (no NF tables):**
- Sukhumvit hotel near BTS: no bonus for transit proximity beyond keyword match
- A hotel on Silom that mentions "luxury" in desc: ranks same as Sathorn
- User asking for "quiet + luxury" may rank a Pratunam hotel above a Riverside resort

**Severity:** HIGH. These are top-10 global destinations. Paris especially — it's likely the #1 or #2 searched city.

---

### FAILURE TYPE 2: Budget Neighborhood Winning Premium Searches

**Scenario:** User searches Barcelona with no preferences (no chips selected).

**Ranking formula (no prefs):** Price×0.28 + Reviews×0.27 + Location×0.20 + Stars×0.14 + Walk×0.11

A hostel in l'Hospitalet:
- Price score: 100 (cheapest)
- Reviews: 78 (3.9 rating)
- Location: 50 (default / unknown)
- Stars: 40 (unrated)
- Walk: 40 (no data)

Score: 28 + 21.1 + 10 + 5.6 + 4.4 = **69**

A 4-star hotel in Eixample:
- Price score: 40 (mid-range)
- Reviews: 90 (4.5 rating)
- Location: 80 (good location rating)
- Stars: 80 (4-star)
- Walk: 70 (walkable)

Score: 11.2 + 24.3 + 16 + 11.2 + 7.7 = **70.4**

The hostel nearly beats the Eixample hotel with no prefs active. A new user who hasn't selected any chips sees l'Hospitalet as "almost as good." This is confusing.

**Why it happens:** Price at 28% weight is very powerful, and unrated/unknown hotels default to neutral scores instead of low scores.

**Severity:** MEDIUM. Budget users benefit; everyone else confused.

---

### FAILURE TYPE 3: Poor-Fit Warnings Too Narrow

**Scenario:** User selects "sightseeing" for Tokyo. A hotel in Edogawa (outer suburb, NF=20 for sightseeing) gets no warning badge.

**Current behavior:** Poor-fit warnings only trigger for luxury/quiet/family. Sightseeing, food, nightlife, transit, first-time, walkable users get NO warning when their hotel is in a bad area.

**Example - Nightlife user in Barcelona:**
- Hotel in Sarrià-Sant Gervasi (NF=22 for nightlife, quiet residential area)
- No warning badge displayed
- User doesn't realize this neighborhood is terrible for nightlife until they arrive

**Severity:** HIGH. This makes the ranking feel random when prefs are active but no warning appears.

---

### FAILURE TYPE 4: Review Score Doesn't Account for Sample Size

**Scenario:** Honeymoon traveler looking at Tokyo hotels.

Hotel A: 5.0 rating from 3 reviews → reviewScore = 100  
Hotel B: 4.7 rating from 2,847 reviews → reviewScore = 94

Hotel A with 3 reviews **beats** Hotel B on review score. A statistically meaningless 5.0 from 3 guests ranks above a statistically robust 4.7 from 2,847 guests.

**In practice:** Many boutique/new hotels have very high ratings from few reviews. They shouldn't dominate the ranking on that basis.

**Severity:** MEDIUM. Affects every search. Boutiquehotels with 5 reviews inflate the top.

---

### FAILURE TYPE 5: Recommendation Panel Duplicates Card Content

**Scenario:** Any search with results.

The "TravelGrab Recommendation" panel at the top of results shows:
1. Neighborhood
2. Hotel name
3. Hotel address  
4. `recommendation_why` text

Then immediately below, the #1 hotel card shows:
1. Same neighborhood
2. Same hotel name
3. Same address
4. Same `recommendation_why` text

**Result:** The first visible thing after results load is the same hotel shown TWICE. Users scroll past the recommendation panel thinking it's a duplicate of the card, missing its intent.

**Severity:** MEDIUM. Wastes prime screen real estate.

---

### FAILURE TYPE 6: Walkability Score Inconsistency

**Scenario:** Hotels with SerpAPI data showing nearby places >20 min away.

Hotel with 5 nearby places, all 25+ min walk: `walkScore = 10` (formula returns 0+0+10)
Hotel with NO nearby place data at all: `walkScore = 40` (no-data default)

**A hotel with some walkable data (but inconveniently located) scores LOWER than a hotel with NO data.**

This means: a hotel in a suburban area with good data quality (e.g., SerpAPI found places nearby but they're far) gets punished vs a hotel in an unknown location. This is backwards — more data should help, not hurt.

**Severity:** LOW-MEDIUM. Affects peripheral hotels more than central ones.

---

### FAILURE TYPE 7: No Context for Score Numbers

**Scenario:** Business traveler sees Hotel A scored 73, Hotel B scored 71.

User question: "Is 73 vs 71 meaningful? Should I pick the 73 over the 71 if the 71 has better reviews?"

There is no plain-language explanation of what the number means. The score breakdown helps but requires a click. Most users won't discover it. The number creates false precision — a 73 vs 71 could be entirely driven by one hotel being $10 cheaper.

**Severity:** MEDIUM. Undermines trust in the whole scoring concept.

---

### FAILURE TYPE 8: Luxury Copy Bleeds Into Other Contexts

**Example:** Tokyo food traveler. Hotel in Ginza (NF=95 for food).

The `prefStrengthCopy` for food+ginza returns: "premium shopping, Michelin-starred restaurants, and upscale hotels" — this is the LUXURY copy, not the food copy. Because Ginza's food copy correctly mentions "Michelin" but the luxury branch runs first.

Wait — looking at the code: the food branch is separate (`pref === "food"` check). But the copy reads `"premium shopping, Michelin-starred restaurants..."` for luxury. For food specifically in Ginza, there's no city-specific override, so it returns generic "outstanding local dining scene."

**Actual issue:** Generic fallback for food in top food cities. Tokyo food travelers get "outstanding local dining scene" for Ginza instead of "Ginza's legendary restaurant culture with more Michelin stars per capita than any city on earth."

**Severity:** LOW. Copy quality issue, not a ranking issue.

---

## City-by-City Summary

| City | NF Tables | Address Detection | Copy | Overall |
|------|-----------|------------------|------|---------|
| Tokyo | ✅ Full | ✅ Full | ✅ Good | 8/10 |
| Barcelona | ✅ Full | ✅ Full | ✅ Good | 8/10 |
| London | ✅ Full | ✅ Full | ✅ Good | 8/10 |
| New York | ✅ Full | ✅ Full | ✅ Good | 8/10 |
| Paris | ⚠️ Postal only | ❌ No NF lookup | ❌ Generic | 4/10 |
| Rome | ❌ None | ❌ None | ❌ Generic | 2/10 |
| Bangkok | ❌ None | ❌ None | ❌ Generic | 2/10 |
| Singapore | ❌ None | ❌ None | ❌ Generic | 2/10 |
| Seoul | ❌ None | ❌ None | ❌ Generic | 2/10 |
| Sydney | ❌ None | ❌ None | ❌ Generic | 2/10 |

---

## Top Ranked Fixes by Severity

1. **Add NF tables for Bangkok, Singapore, Seoul** — 3 major cities with zero neighborhood intelligence
2. **Expand poor-fit warnings to all pref types** — Users selecting food/sightseeing/nightlife get no mismatch feedback
3. **Fix Bayesian review score** — Weight review score by review count to avoid 5-review hotels dominating
4. **Redesign recommendation panel** — Remove duplicate; use it for "vs. alternatives" comparison instead
5. **Fix walkability floor** — Hotels with data but far places shouldn't score below hotels with no data
