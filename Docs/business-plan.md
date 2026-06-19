# Business Plan

Last updated: 2026-06-11
Status: 🟡 Just Started

---

## 1. Overview

TravelGrab is an AI-powered travel planning platform that helps travelers search real flights, get preference-scored recommendations, and build a day-by-day itinerary — cutting the average trip planning time from 16+ hours down to _(target time-to-plan to be defined based on user testing)_. The platform is built primarily for group coordinators and experience-seeking individual travelers who want a personalized recommendation layer on top of live flight and activity data, without the noise of a generic search engine. Group travel is a core use case: TravelGrab aligns preferences across multiple travelers automatically, surfacing options that score well for the whole group rather than forcing manual compromise. Revenue will come from affiliate commissions on bookings and a freemium subscription tier for advanced planning features, with an initial go-to-market focused on group coordinators and solo travelers. The long-term moat is a preference model that improves with every trip planned, compounding into a data advantage that becomes harder to replicate as OTAs would need both the AI layer and years of preference signal to catch up.

---

## 2. Revenue Model

### Options Under Consideration

| Model | Description | Pros | Cons |
|---|---|---|---|
| Affiliate / Commission | Earn % on bookings via API partners | Zero friction to users, aligns incentives | Revenue delayed, margin thin |
| Subscription (B2C) | Monthly/annual fee for premium features | Predictable, high LTV | Harder to convert free users |
| B2B SaaS | White-label for travel agencies | High ACV, enterprise-grade revenue | Longer sales cycle |
| Freemium Hybrid | Free basic, paid for full proposals + booking | Best of both worlds | Complex to manage |

**Current lean:** Commission and subscription.

### Selected Model: Commission + Subscription Hybrid

**Commission (Affiliate) Layer** — TravelGrab earns a percentage on bookings completed through the platform via API partners. This keeps the core product free to use and aligns revenue directly with traveler success. Target rates:
- Flights (via Amadeus / Duffel): ~3–6% commission
- Hotels (via Booking.com / Expedia affiliate): ~5–12% commission
- Activities & experiences (via Viator / GetYourGuide): ~8–20% commission

**Subscription Layer** — A freemium model where the base product is free and a Pro tier unlocks advanced features. Suggested tiers:

| Tier | Price | Includes |
|---|---|---|
| Free | $0 | 2 AI proposals/month, basic preference filters |
| Pro | $10–12/mo | Unlimited proposals, full preference model, itinerary export, price alerts |
| Team | $28–35/mo | Group travel coordination, multi-user profiles, shared itineraries |

The hybrid approach reduces early conversion friction — users start free, experience value through proposals, and convert via bookings (commission) or feature depth (subscription). Both revenue streams reinforce each other: higher booking volume validates the commission channel while subscription revenue provides a predictable baseline.

---

## 3. Go-to-Market Strategy

### Beachhead Market
**Group coordinators and solo travelers** — two complementary entry points:

- **Group coordinators** — the person in a friend group or family who ends up organizing the trip. Disproportionately high pain point (aligning multiple people is 2–3× harder than solo planning), high booking value per transaction, and strong word-of-mouth potential (one coordinator brings 3–8 travelers per trip).
- **Solo travelers** — individual experience-seekers who want personalized recommendations without hours of research. Lower booking value per transaction but higher volume, faster to acquire, and a natural funnel into group trips as they invite others.

### Channels
- [ ] SEO / content (travel intent keywords)
- [ ] Social (Instagram, TikTok — travel inspiration)
- [ ] Influencer / travel creator partnerships
- [ ] B2B: direct outreach to travel agencies

### Launch Sequence
1. Phase 1 — Waitlist + landing page (validate demand)
2. Phase 2 — Closed beta with 50–100 users
3. Phase 3 — Public launch with core flow
4. Phase 4 — B2B / agency offering

---

## 4. Product Roadmap (High Level)

| Phase | Milestone | Key Feature |
|---|---|---|
| MVP | Single-user travel package composer | Preference input → AI proposal → shareable link |
| V1 | Booking integration | Click-to-book via affiliate APIs |
| V1.5 | Group travel *(elevated — primary segment)* | Multi-person preference alignment, group scoring, shared itinerary view |
| V2 | Group booking coordination | Unified group checkout, split payment support |
| V3 | B2B | Agency white-label dashboard |

---

## 5. Cost Model

> For a detailed, code-grounded breakdown of third-party API cost per itinerary (~$1.00–1.60, ~95% Google Places), see [api-cost-analysis.md](api-cost-analysis.md).

### Key Cost Drivers
- **Data APIs (live cost)** — Google Places (hotels + activities) is the dominant variable cost; SerpAPI (Google Flights + Google Shopping engines) bills per search; Duffel flight search is free (rev-share only on bookings). See [api-cost-analysis.md](api-cost-analysis.md).
- **AI inference** — OpenAI `gpt-4o-mini` for flight-advisor copy (one cached call per search); negligible today, scales only if the proposal flow adds more LLM steps
- **Analytics** — PostHog (free under 1M events/month at current scale)
- **Engineering** — Initial build cost
- **Marketing** — CAC estimates TBD

### Unit Economics (Early Estimates)

**Commission revenue per booking:**
- Avg booking value (flight + hotel + 2 activities): ~$1,200
- Blended commission rate: ~8%
- Revenue per converted booking: ~$96
- Target: 500 bookings/month at early scale → ~$48K/month

**Subscription revenue:**
- Target user mix at 10K active users: 75% free / 18% Pro / 7% Team
- Team tier mix is higher than initial estimate given group travel is a primary segment
- 1,800 Pro × $11 + 700 Team × $30 = **$40,800 MRR**
- Combined target MRR (bookings + subscriptions at 10K users): ~$89K/month

**Group travel booking uplift:**
- Group bookings (3–6 travelers) carry 3–5× the transaction value of solo bookings
- Even at the same conversion rate, group-heavy user mix significantly raises commission revenue per booking

**AI inference cost per proposal:**
- Current implementation: one cached `gpt-4o-mini` flight-advisor call (~$0.001 per search) — effectively negligible
- The $0.05–0.15/proposal figure applies only if the roadmap moves to a fuller multi-step LLM proposal (larger models and/or per-activity generation)
- At 50K proposals/month: ~$50/month at current scope; ~$2,500–7,500/month under a full-LLM proposal design

**API & infrastructure (actual stack):**
- **Google Places** — dominant variable cost: ~$1.00–1.60 per itinerary created (activities + hotel Text Search, Place Details, Photos). Free per-SKU monthly tiers can zero this out at low volume. See [api-cost-analysis.md](api-cost-analysis.md).
- **SerpAPI** — billed per search (~$0.01–0.015/search): Google Flights engine in the landing flight search **and** Google Shopping engine in the budget/affordability product
- **Duffel** — flight *search* is free; cost / rev-share applies only on completed bookings
- **OpenAI** — `gpt-4o-mini` advisor copy, ~$0.001 per search
- **PostHog** — analytics, free under 1M events/month at current scale
- **Amadeus** — integrated in code but currently disabled (no active cost); flip on as a flight-supply fallback once credentials are added
- **TripAdvisor** — optional activity enrichment; bills only when a key is configured
- Hosting & infra: ~$500–2,000/month at early scale

**Customer Acquisition Cost (CAC) target:**
- Commission model payback: CAC < $96 (one booking covers acquisition)
- Subscription payback target: CAC < 3× monthly ARPU (~$30–36)

---

## 6. Competitive Moat

- [x] Proprietary preference model (travel DNA / taste graph) — preference scoring engine is core to the product; gets more accurate with every proposal generated
- [ ] Supply-side relationships (exclusive rates, curated inventory)
- [x] Network effects (group travel, shared packages) — group travel as primary segment creates inherent viral loop: one coordinator brings multiple travelers per trip
- [x] Data moat (improving with every trip composed) — every user interaction (scores, edits, bookings) trains the preference model; advantage compounds with scale

---

## 7. Team & Gaps

| Role | Status |
|---|---|
| Product / Strategy | ✅ |
| Engineering (AI/backend) | ✅ Handled |
| Engineering (frontend/mobile) | 🟡 Partial |
| Travel industry expertise | 🟡 Partial |
| Growth / Marketing | ✅ Handled (in-house) |

---

## 8. Funding & Milestones

*To be defined once scope and cost model are clearer.*

---

## 9. Key Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OTAs copy the AI layer | High | High | Move fast, build taste/data moat |
| AI hallucinations in proposals | Medium | High | Human-in-the-loop review, source grounding |
| Low booking conversion | Medium | High | Nail the proposal quality first |
| API partner dependency | High | Medium | Multi-source fallbacks |

---

## 10. Legal & Compliance

Every revenue and product item above carries legal obligations that must be met before it ships. See [legal/legal-requirements-by-plan.md](legal/legal-requirements-by-plan.md), which maps each plan item to its requirements (entity/foundation, affiliate FTC disclosure, subscription tax + auto-renewal, group split-payment/money-transmission, B2B contracts, AI liability, and data/training rights). The sequenced execution list lives in [legal-compliance-checklist.md](legal-compliance-checklist.md).
