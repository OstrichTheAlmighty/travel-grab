# Business Plan

Last updated: 2026-06-11
Status: 🟡 Just Started

---

## 1. Overview

TravelGrab is an AI-powered travel planning platform that helps travelers search real flights, get preference-scored recommendations, and build a day-by-day itinerary — cutting the average trip planning time from 16+ hours down to _(target time-to-plan to be defined based on user testing)_. The platform is built primarily for group coordinators and experience-seeking individual travelers who want a personalized recommendation layer on top of live flight and activity data, without the noise of a generic search engine. Group travel is a core use case: TravelGrab aligns preferences across multiple travelers automatically, surfacing options that score well for the whole group rather than forcing manual compromise. Revenue will come from affiliate commissions on bookings and a freemium subscription tier for advanced planning features, with an initial go-to-market focused on _(beachhead channel and audience to be defined — see Section 3)_. The long-term moat is a preference model that improves with every trip planned, compounding into a data advantage that _(scale threshold and competitive defensibility to be defined)_ OTAs will find hard to replicate.

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

### Key Cost Drivers
- **AI inference** — LLM API calls per proposal (estimate per-query cost)
- **Data APIs** — Amadeus, Viator, Booking.com (rev share or flat fee)
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
- Estimated LLM cost (Claude Sonnet / GPT-4o): $0.05–0.15 per full proposal
- At 50K proposals/month: ~$2,500–7,500/month

**API & infrastructure:**
- Amadeus / Duffel: revenue-share on completed bookings (no upfront cost at low volume)
- Viator / GetYourGuide: affiliate model, no flat fee
- Hosting & infra: ~$500–2,000/month at early scale

**Customer Acquisition Cost (CAC) target:**
- Commission model payback: CAC < $96 (one booking covers acquisition)
- Subscription payback target: CAC < 3× monthly ARPU (~$30–36)

---

## 6. Competitive Moat

*What will be hard to copy at scale?*

- [ ] Proprietary preference model (travel DNA / taste graph)
- [ ] Supply-side relationships (exclusive rates, curated inventory)
- [x] Network effects (group travel, shared packages) — group travel as primary segment creates inherent viral loop: one coordinator brings multiple travelers per trip
- [ ] Data moat (improving with every trip composed)

---

## 7. Team & Gaps

*To be filled in — who is building this, and what's missing?*

| Role | Status |
|---|---|
| Product / Strategy | ✅ |
| Engineering (AI/backend) | 🔴 Gap |
| Engineering (frontend/mobile) | 🔴 Gap |
| Travel industry expertise | 🟡 Partial |
| Growth / Marketing | 🔴 Gap |

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
