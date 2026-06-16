# Legal Requirements by Business Plan Item

Last updated: 2026-06-15
Status: 🟡 Not Started

> ⚠️ **Not legal advice.** This maps each item in [business-plan.md](../business-plan.md) to the legal work it triggers, so nothing in the plan ships without its compliance piece. US-default jurisdiction. Confirm specifics — Seller of Travel, money transmission, sales-tax/VAT, and any B2B contract — with a qualified attorney and accountant before taking money.
>
> This is the **plan-by-plan map**. For the sequenced execution checklist, see [legal-compliance-checklist.md](../legal-compliance-checklist.md). Where they overlap, the checklist is the to-do list; this doc explains *why each plan needs it* and covers items the checklist doesn't (B2B, split payment, AI liability, data/training rights).

---

## How to read this

Every row of the business plan that touches money, user data, or a third party creates a legal obligation. Below, each plan item is matched to what must be true *before* it can launch. Priorities: **P1** = blocker (can't launch the item legally without it), **P2** = required soon after, **P3** = ongoing/lower-urgency.

Legal load rises with each revenue layer:

| Plan layer | Core legal trigger | Heaviest new obligation |
|---|---|---|
| Affiliate / commission | Referrals + data collection | FTC disclosure |
| Subscription (freemium/Pro/Team) | We take recurring payment | Sales tax/VAT + auto-renewal law |
| Group booking + split payment (V2) | We **hold/route others' money** | Money transmission + Seller of Travel |
| B2B white-label (V3) | We supply software + data to businesses | Negotiated contracts, DPA, liability |
| AI proposals (all phases) | Automated advice on real bookings | Disclaimers, accuracy, no-warranty |
| Data moat / preference model | Training on user behavior | Consent, privacy law, data rights |

---

## 0. Foundation (required before ANY plan item earns money)

Maps to: entire plan — nothing below is safe without this.

- [ ] [P1] Form a business entity (LLC recommended — liability shield; processors and affiliate networks expect it)
- [ ] [P1] EIN from the IRS (free) — needed for bank account and tax forms
- [ ] [P1] Business bank account — keep revenue separate from personal
- [ ] [P1] **Privacy Policy** — legally required the moment any data is collected (emails, search queries, cookies, preference signals). Mandated by CCPA/CPRA, GDPR, and required by affiliate networks + processors.
- [ ] [P1] **Terms of Service** — limits liability, sets the rules; effectively mandatory once money changes hands
- [ ] [P2] Cookie consent banner for EU/UK visitors (GDPR / ePrivacy)
- [ ] [P2] CAN-SPAM / GDPR compliance for the waitlist (consent + working unsubscribe)
- [ ] [P1] Confirm home state for formation and its Seller-of-Travel / money-transmission exposure

---

## 1. Go-to-Market: Waitlist + Landing Page (Plan §3, Phase 1)

The landing page collects emails before any product exists — that alone triggers data law.

- [ ] [P1] Privacy Policy live on the landing page before the first email is captured
- [ ] [P1] Waitlist opt-in: affirmative consent + clear statement of what you'll send (CAN-SPAM, GDPR Art. 6)
- [ ] [P2] Every marketing email has a working unsubscribe and a physical postal address (CAN-SPAM)
- [ ] [P2] If running ads / influencer / creator partnerships (Plan §3 channels): creators must disclose paid/affiliate relationships (FTC endorsement guides) — put this in every creator contract
- [ ] [P3] Keep proof of consent (timestamp, source) for each subscriber

---

## 2. Commission / Affiliate Layer (Plan §2 — launch here)

Covers flights (Amadeus/Duffel), hotels (Booking.com/Expedia), activities (Viator/GetYourGuide). In the **affiliate** model the partner takes payment, so you are a *referrer* — the lightest path.

- [ ] [P1] Site live and real-looking before applying (networks review it)
- [ ] [P1] Apply + get approved to each program; **read and comply with each program's terms** (common rule: no bidding on their trademarks, no fake scarcity)
- [ ] [P1] **FTC affiliate disclosure** — clear and visible near the links ("We may earn a commission when you book through our links"). Affiliate sites are a top FTC enforcement target.
- [ ] [P1] **Seller of Travel — affiliate stays exempt:** because the user pays the *partner*, not us, we're generally a referrer and usually exempt in CA/FL/WA/HI/IA. **Confirm this holds** for each program (some flag you if you appear to "arrange" travel).
- [ ] [P2] Disclose affiliate cookies/tracking in the Privacy Policy
- [ ] [P3] Tax: commissions are ordinary business income; expect a 1099; no sales tax to collect on commission received

---

## 3. Subscription Layer — Free / Pro / Team (Plan §2)

The moment we charge a recurring fee, we are a merchant and a tax collector.

- [ ] [P1] Choose a processor:
  - **Merchant of record (Paddle / Lemon Squeezy)** — handles sales tax/VAT *for you*; recommended for a solo founder
  - **Stripe** — more control, but **you** register and remit tax
- [ ] [P1] **Sales tax / VAT** — digital subscriptions are taxable in many US states and require VAT on EU/UK sales from the *first* sale (no threshold for non-EU sellers). Merchant-of-record solves this; otherwise Stripe Tax + self-registration.
- [ ] [P1] **Auto-renewal compliance** (FTC click-to-cancel, California ARL): disclose price + renewal terms before purchase, get affirmative consent, make cancellation as easy as signup
- [ ] [P1] **Refund / cancellation policy** (EU = 14-day digital-services withdrawal right)
- [ ] [P2] ToS + Privacy Policy must cover paid accounts, billing, suspension, and termination
- [ ] [P2] **Team tier** (multi-user / shared profiles): define who the account owner is, who can see shared data, and how a removed member's data is handled — write this into the ToS
- [ ] [P3] PCI compliance — handled by the processor; never store raw card data yourself

---

## 4. AI Proposals & Recommendations (Plan §1, §4 — every phase)

The product gives automated advice on real, bookable trips. The legal risk is being held responsible for bad/wrong recommendations (this is also Plan §9's "AI hallucinations" risk).

- [ ] [P1] **No-warranty / accuracy disclaimer** in ToS: proposals are AI-generated suggestions, prices/availability are not guaranteed and confirmed only at the partner's checkout
- [ ] [P1] Make clear TravelGrab is **not a travel agent or fiduciary** — it's a planning tool; the user's contract is with the airline/hotel/activity provider
- [ ] [P2] Source-grounding + human-in-the-loop where feasible (mitigation already noted in Plan §9) — reduces both liability and refund disputes
- [ ] [P2] If using a third-party LLM (Claude / GPT), comply with that provider's usage policy and disclose AI use to users where required (emerging US state AI-transparency rules, EU AI Act transparency obligations)
- [ ] [P2] Don't present results as paid/sponsored placement without disclosing it (FTC — applies if commission rate ever influences ranking)
- [ ] [P3] Accessibility (ADA / WCAG) for the planning UI — rising litigation area for consumer web apps

---

## 5. Data Moat / Preference Model (Plan §1, §6)

The moat is training a preference model on user behavior (scores, edits, bookings). Using personal data to train a model is itself a regulated activity.

- [ ] [P1] Privacy Policy must **explicitly state** you use user data to train/improve recommendations, and the legal basis (consent or legitimate interest)
- [ ] [P1] ToS must grant TravelGrab a license to use user inputs to improve the service
- [ ] [P2] Honor data-subject rights: access, deletion, opt-out of "sale/sharing" (CCPA/CPRA), and GDPR access/erasure/portability — deletion must also address model/training data handling
- [ ] [P2] If preference profiles ever include sensitive inferences (health, religion via destinations/activities), apply stricter GDPR Art. 9 handling
- [ ] [P3] Data-retention policy: how long behavior signals are kept and when anonymized/deleted

---

## 6. Group Travel & Split Payment (Plan §4 — V1.5 and V2)

Two very different legal profiles. V1.5 (alignment/scoring) is low-risk software. **V2 (unified group checkout + split payment) is the heaviest item in the plan** because we would route money between travelers.

### V1.5 — Group preference alignment & shared itineraries (low load)
- [ ] [P1] ToS rules for shared itineraries: who owns a shared plan, what co-travelers can see, how an invited member's data is handled (ties to §5 consent)
- [ ] [P2] Invited-member consent before processing their preferences/data

### V2 — Unified group checkout + split payment (HIGH load — research before building)
- [ ] [P1] **Money transmission risk:** collecting funds from multiple travelers and disbursing/applying them can make you a *money transmitter* — triggering state MTL licensing (costly, slow) **and** federal FinCEN MSB registration. **Do not build split payment without legal review.**
- [ ] [P1] **Avoid the trigger by design:** use a processor/facilitator (Stripe Connect, or the booking partner's own split-pay) so **you never take custody of funds** — funds flow payer → processor → provider, not through your balance. Confirm the chosen model keeps you out of money-transmitter status.
- [ ] [P1] **Seller of Travel becomes live:** taking payment *for the trip itself* (vs. referring out) is the trigger that makes Seller-of-Travel registration apply in CA/FL/WA/HI/IA (registration, bond, sometimes restitution fund). Research per state before launch.
- [ ] [P2] Clear terms on refunds, one traveler dropping out, partial payment, and who is liable if a booking fails after collection
- [ ] [P1] **Decision gate:** keep V2 affiliate-style (each traveler pays the partner directly) as long as possible to defer both money-transmission and Seller-of-Travel obligations

---

## 7. B2B / Agency White-Label (Plan §2, §3, §4 — V3)

Selling/licensing the platform to travel agencies shifts from consumer law to negotiated commercial contracts.

- [ ] [P1] **Master Services Agreement / license agreement** per agency client (scope, SLA, fees, IP ownership, liability cap, indemnity, termination)
- [ ] [P1] **Data Processing Agreement (DPA)** — when an agency's end-users' data flows through us, we're a processor; GDPR Art. 28 requires a DPA. CCPA service-provider terms too.
- [ ] [P2] Define liability if the white-label tool produces a bad recommendation for the agency's customer (carries §4 AI risk into a B2B contract)
- [ ] [P2] If agencies take payment for travel through the white-label, **they** likely need Seller of Travel — clarify in contract that compliance is theirs, not ours
- [ ] [P2] Trademark/brand terms for white-labeling (their brand on our software)
- [ ] [P3] Business insurance (E&O / tech liability) — typically required by enterprise clients before they sign

---

## 8. Cross-Cutting & Ongoing

- [ ] [P2] **Trademark** "TravelGrab" — clear the name and consider registering before public launch
- [ ] [P2] **Domain / IP ownership** — ensure code, brand, and content are owned by the entity, not personally (assignment agreements for any contractor)
- [ ] [P2] Business insurance: general liability + E&O/tech liability (scales with B2B and any payment handling)
- [ ] [P3] Contractor/employee agreements with IP assignment + confidentiality as the team (Plan §7) grows
- [ ] [P3] Annual entity upkeep: state filings, registered agent, tax returns

---

## Priority Summary (sequenced)

| Order | Action | Plan item it unlocks |
|---|---|---|
| 1 | LLC + EIN + bank account | Everything (§0) |
| 2 | Privacy Policy + ToS + waitlist consent | Landing page / waitlist (§1) |
| 3 | FTC affiliate disclosure + program approvals | Commission layer (§2) |
| 4 | AI no-warranty disclaimer + data/training clauses | AI proposals + data moat (§4, §5) |
| 5 | Merchant-of-record + auto-renewal/refund policy | Subscriptions (§3) |
| 6 | Shared-itinerary terms + invited-member consent | Group V1.5 (§6) |
| 7 | Money-transmission + Seller-of-Travel research | Group split payment V2 (§6) — gate before building |
| 8 | MSA + DPA + insurance | B2B white-label V3 (§7) |

---

## Open Questions / To Confirm with Counsel

- [ ] Home state for LLC formation and its Seller-of-Travel + money-transmission rules
- [ ] Does the affiliate model keep us exempt from Seller of Travel in CA/FL/WA/HI/IA?
- [ ] Processor decision: merchant-of-record (Paddle/Lemon Squeezy) vs. Stripe + Stripe Tax
- [ ] **Split payment (V2):** can Stripe Connect / partner split-pay keep us out of money-transmitter status entirely? What's the exact fund-flow?
- [ ] AI-transparency obligations (EU AI Act + emerging US state rules) for recommendation disclosure
- [ ] Standard MSA + DPA templates for the B2B tier
- [ ] One-time consult: attorney (Seller of Travel + money transmission) and accountant (sales tax/VAT) before subscriptions and before V2
