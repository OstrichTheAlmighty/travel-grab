# TravelGrab Hotels — Conversion Audit

**Date:** 2026-06-16  
**Role:** Head of Growth / UX Researcher  
**Question:** Why would someone hesitate to click "View hotel"?

---

## The Conversion Funnel

```
Landing on /hotels
    ↓
See search form + preference chips
    ↓
Enter destination + dates
    ↓ (optional) Select preference chips
Submit search
    ↓
See results: recommendation panel + hotel cards
    ↓ CONVERSION POINT
Click "View hotel"
    ↓
Redirect to booking site
```

Each step has friction. This audit identifies every friction point and its severity.

---

## Step 1: Landing on /hotels

### Trust problems
**T1.1 — No brand trust signals above the fold.**
"TravelGrab" as a brand is unknown. The page opens with "Find your hotel" and a search form. There is no "2.3M hotels compared" or "Trusted by 400k travelers" or any signal that this isn't a blank-slate prototype.

Users arriving from an external link have no reason to trust TravelGrab over Google Hotels, which they already know. The page must earn trust in the first 2 seconds.

**T1.2 — "Prices from Google Hotels via SerpAPI" footer.**
This is buried at the bottom of results and reads like a legal disclaimer, not a trust signal. It should be surfaced higher: "We search Google Hotels — you see the same prices you'd find there, ranked better."

**T1.3 — No logo credibility.**
TravelGrab's plane icon is minimal. There is no "As seen in..." or external validation. For a booking tool, this is a gap.

### Cognitive load
**C1.1 — Preference chips shown before search.**
The user arrives, sees a form, then immediately sees 10 preference chips below it. These chips are unlabeled in terms of HOW they affect ranking. A new user thinks: "Should I select these? What happens if I do? Do I have to?" This is choice paralysis.

**C1.2 — Chip header "What matters to you?" is ambiguous.**
"What matters to you?" could mean anything. It doesn't communicate "these chips change how hotels are ranked for you." A better label: "Rank hotels by:" or "I want to stay somewhere..."

---

## Step 2: Filling in the Search Form

### Friction points
**F2.1 — Destination input requires typing.**
The autocomplete kicks in after 2 characters, which is fast. But if users have been using Google Hotels (which now defaults to a map search), typing into a text box feels retro.

**F2.2 — No date default / smart suggestion.**
Check-in and check-out fields start blank. Competitors default to "2 nights from tonight" or "this weekend." Having to think about dates before you've even picked a city is backwards.

**F2.3 — Guests/rooms stepper is below the date.**
Most users don't change guests/rooms. The placement of these inputs before the search button is fine, but the space could be used for more useful things (free cancellation filter, star class selector).

---

## Step 3: Submitting Search

### Loading state friction
**F3.1 — Loading state is passive.**
"Searching hotels in Tokyo…" with a spinner tells the user nothing is wrong, but doesn't build anticipation or trust. Compare Hopper's loading state which shows "Checking 1,847 hotels..." with a counter.

**F3.2 — No loading skeleton.**
A blank page with a spinner is fine, but a skeleton of the card layout would make the wait feel shorter. This is cosmetic but affects perceived performance.

---

## Step 4: Seeing Results

### Trust problems at this step
**T4.1 — Recommendation panel appears redundant.**
The "TravelGrab Recommendation" panel shows the same hotel that appears first in the list. Users may think it's an advertisement or duplicate. The panel should explain WHY this hotel won vs. alternatives — currently it just restates the card content.

**T4.2 — AI score numbers feel arbitrary.**
Seeing "78" vs "76" vs "74" next to hotels creates the impression of precision that isn't there. Users may discount the entire scoring concept when they see scores clustered so close together. If the top 5 hotels score 78/76/75/74/73, the ranking logic looks coin-flippy.

**T4.3 — No "how we rank" explanation accessible from the results page.**
The three feature cards in the idle state explain the ranking philosophy. But these disappear when results load. After seeing the results, if a user wonders "why is hotel #3 ranked #3?", there's no quick link to explain the methodology.

**T4.4 — Score label "Great fit" / "Good fit" appears on cards but the criteria aren't explained.**
What makes something "Great fit" vs "Good fit"? NF ≥ 68? Users don't know this. The badge creates a question in their mind without answering it.

**T4.5 — "View hotel" button color (violet) matches the preference chip active state.**
On a preference-heavy search, a user might have many violet elements on screen (selected chips, AI Pick badge, score badge, View hotel button). The button doesn't stand out as a CTA.

### Cognitive overload at this step
**O4.1 — Too much information per card.**
A single hotel card displays:
1. AI Pick badge (if applicable)
2. Recommendation label (Luxury Pick, Best Location, etc.)
3. Fit badge (Great fit / Good fit / Partial fit)
4. Poor fit warning (red badge)
5. Eco badge
6. Neighborhood name
7. Hotel name
8. Address
9. Stars
10. Rating + review count
11. Hotel type
12. Price per night
13. Total price
14. Fit note (preference-specific sentence)
15. Recommendation why (sentence)
16. Transit note
17. Amenity chips (up to 5)
18. Check-in/check-out dates
19. Score button (opens breakdown)
20. "View hotel" button

That is **20 distinct pieces of information**. Eye-tracking research shows users process ~3 things before making a decision. Everything after item 3 is competing for attention and adding to cognitive load.

**O4.2 — Fit note AND recommendation_why both appear.**
When both are shown (which happens when prefs are active), the user reads the fit note ("In Covent Garden — ideal first-visit location, vibrant nightlife scene, and excellent reviews") and then reads the recommendation_why ("Covent Garden — ideal first-visit location, vibrant nightlife scene; and only $15/night more than the cheapest option."). These overlap significantly.

**O4.3 — Score breakdown shows 5–6 rows.**
When the score breakdown is open (it is by default for the AI Pick), 6 metric rows + explanatory text appear. This is correct and valuable information, but combined with the card content above = cognitive overload.

---

## Step 5: The "View hotel" Decision Moment

### Why users hesitate

**H5.1 — "View hotel" is weak as a CTA.**
"View hotel" suggests browsing, not committing. "Check availability" or "See prices at [site]" creates urgency and implies the next step is booking. "View hotel" implies the user is just going to look.

**H5.2 — Where does it go? Trust uncertainty.**
Users don't know if "View hotel" goes to Booking.com, Expedia, the hotel directly, or a TravelGrab page. The tiny "Prices from Google Hotels via SerpAPI" footer is the only indication. A "Book via [partner logo]" label under the button would explain what happens next.

**H5.3 — No free cancellation signal.**
The #1 conversion driver on Booking.com is "Free cancellation" in a green badge. A user who sees a hotel they like but doesn't know if it's refundable will hesitate. TravelGrab has no cancellation policy data displayed anywhere.

**H5.4 — No urgency or scarcity.**
Nothing on the page creates any reason to act now vs. later. Competitors use: "Only 3 rooms left at this price," "12 people viewing," "Book now — price may change." TravelGrab has none of this (and none of it is data TravelGrab has access to).

**H5.5 — Score transparency creates doubt, not confidence.**
Counterintuitive: the score breakdown COULD build trust, but it also shows price score as "relative to search set." A sophisticated user reading the breakdown note ("Each dimension scored 0–100 relative to this result set") realizes the price score of 65 doesn't mean "$265/night is cheap" — it means "this is cheaper than the others in this search." This creates doubt about the entire scoring system.

**H5.6 — No social proof for TravelGrab itself.**
When clicking "View hotel" on Booking.com, the user knows they're going to Booking.com — a trusted brand. When clicking on TravelGrab, they don't know if the destination site is trustworthy. This is solved by labeling the destination ("Book on Booking.com" / "Book on Hotels.com").

---

## Severity Matrix

| Issue | Severity | Effort to Fix | Priority |
|-------|----------|--------------|---------|
| H5.3 — No free cancellation badge | 🔴 High | Medium | P1 |
| H5.1 — Weak CTA "View hotel" | 🔴 High | Low | P1 |
| H5.2 — Destination site uncertainty | 🔴 High | Low | P1 |
| T4.1 — Recommendation panel redundant | 🟠 Medium | Medium | P2 |
| T4.2 — AI score false precision | 🟠 Medium | Low | P2 |
| O4.1 — Card information overload | 🟠 Medium | High | P2 |
| T1.1 — No brand trust signals | 🟠 Medium | Low | P2 |
| T1.2 — SerpAPI credit buried | 🟠 Medium | Low | P2 |
| F2.2 — No date defaults | 🟡 Low | Low | P3 |
| O4.2 — Fit note + why overlap | 🟡 Low | Low | P3 |
| C1.1 — Chips shown before search | 🟡 Low | Medium | P3 |
| F3.1 — Passive loading state | 🟡 Low | Low | P3 |

---

## Top Conversion Wins to Implement

1. **Change "View hotel" to "Check availability"** — 1 line of code, likely 10–20% CTR lift
2. **Add booking partner label** — "Book via Google Hotels" under CTA — eliminates destination uncertainty
3. **Add score label** — Replace bare "78" with "78 · Great match" — reduces false precision anxiety
4. **Add source trust line** — "Same prices as Google Hotels, ranked by your preferences" in search header
5. **Reduce card information density** — Move fit note / why copy into collapsible section OR pick one (not both)
6. **Redesign recommendation panel** — Show alternatives comparison instead of duplicate card content
