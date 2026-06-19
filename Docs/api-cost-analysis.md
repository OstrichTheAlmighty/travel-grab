# API Cost Analysis — Per-Itinerary Unit Cost

Last updated: 2026-06-18
Status: 🟡 Draft (code-grounded counts, list-price rates)

---

## Purpose

Estimates the third-party API cost for **one user creating one itinerary** (flights → hotel → activities → itinerary assembly). Call counts are traced from the actual code; per-call rates are 2025 list prices and should be confirmed against live billing dashboards.

**Headline: ≈ $1.00–1.60 per itinerary, ~95% of it Google Places.** Duffel flight search is free, SerpAPI is not in the itinerary path, OpenAI is one tiny call, and PostHog is free at current scale.

---

## What fires per itinerary

| API | What triggers it (code) | Calls per itinerary |
|---|---|---|
| **Google Places — Text Search** | `activities.py` runs `GOOGLE_ACTIVITY_SEARCHES` = **13 fixed queries** every time a destination loads (`_search_google_places_activities`, `per_query_limit=15`); hotels add 1 per neighborhood searched | ~13 (activities) + 1–3 (hotels) |
| **Google Places — Place Details** | `_get_google_place_details` fires when a user opens an activity modal (field mask includes `reviews`, `editorialSummary` → atmosphere tier) | ~5–10 (modals opened) |
| **Google Places — Place Photo** | `_photo_uri_cached(..., fetch_if_missing=True)` fires on the **grid render** (page size 24) + modal hero/thumbs | ~30–60 |
| **Duffel — offer search** | `search_flight_offers` (POST `/air/offer_requests`) | 1 (search is **free**) |
| **OpenAI — gpt-4o-mini** | `generate_ai_advisor_copy` runs **once for the best offer only** (`flights.py`), rate-limited + cached | 1 |
| **SerpAPI** | Not in the **Streamlit** itinerary flow (that uses Duffel via backend). Note: the **landing** flight app (`lantern-landing`) enables SerpAPI's Google Flights engine alongside Duffel, and `serpapi.py`'s Google Shopping engine powers the budget/affordability product — both bill per search outside this flow | 0 (Streamlit itinerary) |
| **PostHog** | ~20–40 `track_event` calls across the flow | ~30 |

---

## Per-action cost (list prices, Places API "New" 2025 SKUs)

### Google Places (priced by the richest field in the mask)

- **Text Search** w/ rating + priceLevel = Enterprise tier ≈ **$0.035/call**
  - Activities: 13 × $0.035 = **$0.46**
  - Hotels: ~2 × $0.035 = **$0.07**
- **Place Details** w/ reviews = Enterprise+Atmosphere ≈ **$0.040/call**
  - ~8 modals × $0.040 = **$0.32**
- **Place Photo** = **$0.007/call**
  - ~45 photos × $0.007 = **$0.32**

→ **Google Places subtotal ≈ $1.15–1.20**

### Duffel

Flight search via `/air/offer_requests` is **$0**. Duffel charges only on a *booking* (managed-content / margin model). Itinerary creation never books. → **$0**

### OpenAI (gpt-4o-mini)

One call. Prompt ~2–2.5K input tokens (`prompt_payload` includes `top_ranked_flights`), ~350 output tokens. At $0.15/$0.60 per 1M tokens → **≈ $0.0006–0.002**. Negligible.

### SerpAPI

**$0** in the Streamlit itinerary flow. Outside it, SerpAPI bills ~$0.01–0.015/search: the landing flight app runs a Google Flights search per query, and the budget/affordability product runs Google Shopping searches.

### PostHog

~30 events. Free up to 1M events/month → **$0** at current scale (≈ $0.0015 only past the free tier).

---

## Bottom line

> **≈ $1.00–1.60 per itinerary**, ~95% Google Places.

---

## Why it could be **higher**

- **Free tiers ignored above.** Rates quoted are list prices. Once free allowances are exceeded, the $1+ is real and linear per user.
- **More modals / photos.** A browsy user opening 20 activity modals and scrolling multiple 24-card pages pushes Place Details + Photos up fast — each page render re-fetches uncached photos.
- **Multiple destinations or re-searches.** The 13-query activity batch reruns per destination (cached only 6h). Comparing 3 cities ≈ 3× the $0.46 activity cost.
- **Hotel neighborhood exploration.** Each neighborhood typed = another Text Search + its photos.
- **Atmosphere-tier creep.** Field masks request `reviews`/`priceLevel`/`rating`, bumping Text Search and Details into the most expensive SKUs. Trimming the field mask is the single biggest cost lever.
- **Booking.** Wiring up Duffel *booking* introduces Duffel cost (and airline margin) — not present in search.

## Why it could be **lower**

- **Google's free monthly per-SKU allowances** (the model that replaced the old $200 credit). At low volume a single user — or the first few hundred users/month — can land entirely in the free tier, making marginal cost effectively **$0**.
- **Caching.** `st.cache_data(ttl=6h)` + session caches mean repeat views, back-navigation, and re-renders within a session don't re-bill. The 13 activity searches hit once per destination per 6h, not per page load.
- **Photo lazy-loading + dedup.** Photos are cached by `place_id|photo_name|width`; the deadline guard skips cold-cache photos under time pressure, and low-quality (<12KB) photos are dropped before billing.
- **OpenAI rate-limiting.** `_rate_limit_action` + cache prevent repeat advisor calls in a session, and only the *single best* flight is enriched — not all results.
- **Demo fallback.** If `GOOGLE_PLACES_API_KEY` is missing or returns nothing, `_demo_activities_for_destination` serves canned data at **$0**.

---

## Caveats

- **Call counts are exact** (traced from code as of 2026-06-18). **Per-call rates are 2025 list prices from reference, not pulled from the billing dashboard** — confirm against current Google Cloud pricing and free-tier allowances, which swing the per-user number between ~$0 and ~$1.50.
- This covers itinerary *creation* only. Booking flows, the budget/affordability product (where SerpAPI lives), and TripAdvisor enrichment are out of scope here.
