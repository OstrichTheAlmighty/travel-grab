# Business Plan

Last updated: 2026-06-11
Status: 🟡 Just Started

---

## 1. Overview

TravelGrab is an AI-powered travel planning platform that helps travelers search real flights, get preference-scored recommendations, and build a day-by-day itinerary — cutting the average trip planning time from 16+ hours down to _(target time-to-plan to be defined based on user testing)_. The platform is built for _(primary customer segment to be confirmed)_ who want a personalized recommendation layer on top of live flight and activity data, without the noise of a generic search engine. Revenue will come from _(revenue model to be decided — see Section 2)_, with an initial go-to-market focused on _(beachhead channel and audience to be defined — see Section 3)_. The long-term moat is a preference model that improves with every trip planned, compounding into a data advantage that _(scale threshold and competitive defensibility to be defined)_ OTAs will find hard to replicate.

---

## 2. Revenue Model

### Options Under Consideration

| Model | Description | Pros | Cons |
|---|---|---|---|
| Affiliate / Commission | Earn % on bookings via API partners | Zero friction to users, aligns incentives | Revenue delayed, margin thin |
| Subscription (B2C) | Monthly/annual fee for premium features | Predictable, high LTV | Harder to convert free users |
| B2B SaaS | White-label for travel agencies | High ACV, enterprise-grade revenue | Longer sales cycle |
| Freemium Hybrid | Free basic, paid for full proposals + booking | Best of both worlds | Complex to manage |

**Current lean:** *TBD — to be decided in idea refinement sessions.*

---

## 3. Go-to-Market Strategy

### Beachhead Market
*To be defined — who is the very first customer?*

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
| V2 | Group travel | Multi-person preference alignment |
| V3 | B2B | Agency white-label dashboard |

---

## 5. Cost Model

### Key Cost Drivers
- **AI inference** — LLM API calls per proposal (estimate per-query cost)
- **Data APIs** — Amadeus, Viator, Booking.com (rev share or flat fee)
- **Engineering** — Initial build cost
- **Marketing** — CAC estimates TBD

*Detailed unit economics to be built out once revenue model is confirmed.*

---

## 6. Competitive Moat

*What will be hard to copy at scale?*

- [ ] Proprietary preference model (travel DNA / taste graph)
- [ ] Supply-side relationships (exclusive rates, curated inventory)
- [ ] Network effects (group travel, shared packages)
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
