# Legal & Compliance Checklist

Last updated: 2026-06-15
Status: 🟡 Not Started

> ⚠️ **Not legal advice.** This is a general checklist (US-default jurisdiction) to organize the work and questions. Confirm specifics — especially Seller of Travel and sales-tax/VAT — with a lawyer and accountant before taking payment.

---

## How to use this

Three revenue paths, in increasing order of legal load:

1. **Affiliate** — you refer users out; a partner books and takes payment. *Lightest.*
2. **Subscriptions** — you charge for a software/planning tool. *Medium (tax + auto-renewal law).*
3. **Booking flights yourself** — you collect payment for the trip. *Heaviest (Seller of Travel).*

Recommended order: do the **Foundation**, launch on **Affiliate only**, add **Subscriptions** once a merchant-of-record is in place, and avoid **taking payment for travel** until specifically researched.

---

## 1. Foundation (needed for ALL paths)

- [ ] [P1] Form a business entity (LLC recommended — liability separation, processors/networks expect it)
- [ ] [P1] Get an EIN (federal tax ID) from the IRS — free, needed for bank account + tax forms
- [ ] [P1] Open a business bank account (keep revenue separate from personal)
- [ ] [P1] Publish a **Privacy Policy** — legally required once any user data is collected (emails, search queries, cookies). Required by CCPA/CPRA, GDPR, and by affiliate networks + payment processors.
- [ ] [P1] Publish **Terms of Service** — limits liability, sets the rules; effectively mandatory once money changes hands
- [ ] [P2] Cookie consent banner if serving EU/UK visitors (GDPR / ePrivacy)
- [ ] [P2] CAN-SPAM / GDPR compliance for the waitlist email capture (consent + unsubscribe)

---

## 2. Affiliate Programs (lightest path — launch here)

- [ ] [P1] Get the site live and real-looking *before* applying (networks review the site)
- [ ] [P1] Apply + get approved to each program (Travelpayouts, Skyscanner, Booking.com affiliate, etc.)
- [ ] [P1] Read and comply with each program's Terms (e.g. no bidding on their trademarks)
- [ ] [P1] Add **FTC affiliate disclosure** — clear, visible near the links ("We may earn a commission when you book through our links"). #1 FTC enforcement target for affiliate sites.
- [ ] [P2] Disclose affiliate cookies/tracking in the Privacy Policy
- [ ] [P3] Tax: commissions are ordinary business income; expect a 1099; no sales tax to collect on commissions received

---

## 3. Subscriptions (medium load — add after affiliate works)

- [ ] [P1] Choose a payment processor:
  - **Merchant of record (Paddle / Lemon Squeezy)** — handles sales tax/VAT *for you*. Recommended for solo founder.
  - **Stripe** — more control, but YOU handle tax registration/remittance.
- [ ] [P1] **Sales tax / VAT** — digital subscriptions are taxable in many US states and require VAT on EU/UK sales from the first sale (no threshold for non-EU sellers). Use a merchant of record OR Stripe Tax + self-registration. *Most commonly missed obligation.*
- [ ] [P1] **Auto-renewal compliance** (FTC click-to-cancel rule, California ARL): disclose price + renewal terms before purchase, get affirmative consent, make cancellation as easy as signup
- [ ] [P1] Publish a **Refund / cancellation policy** (note: EU = 14-day digital-services withdrawal right)
- [ ] [P2] Ensure ToS + Privacy Policy cover paid accounts, billing, and termination
- [ ] [P3] PCI compliance — handled by the processor (Stripe/Paddle), but don't store raw card data yourself

---

## 4. ⚠️ Travel-Specific: Seller of Travel

States requiring registration to sell/book/collect payment for travel: **California, Florida, Washington, Hawaii, Iowa** (registration, bond, sometimes restitution fund).

- [ ] [P1] **Affiliate-only model:** user pays the partner, not us → generally a *referrer*, usually **exempt**. Confirm this stays true.
- [ ] [P1] A **subscription to a planning tool** is software, not travel → does not trigger Seller of Travel by itself
- [ ] [P1] **DO NOT take payment for flights/trips** (e.g. Duffel booking path) without first researching Seller of Travel registration for the relevant state(s) — this is the trigger that makes it apply

---

## Priority Summary

| Order | Action | Path it unlocks |
|---|---|---|
| 1 | LLC + EIN + business bank account | Everything |
| 2 | Privacy Policy + ToS + FTC affiliate disclosure | Affiliate |
| 3 | Launch affiliate only | First revenue, lightest load |
| 4 | Merchant-of-record + auto-renewal/refund compliance | Subscriptions |
| 5 | Research Seller of Travel before any flight payment | Booking (later) |

---

## Open Questions / To Confirm

- [ ] Confirm home state for LLC formation and Seller of Travel exposure
- [ ] Confirm whether affiliate model keeps us exempt from Seller of Travel in target states
- [ ] Decide processor: merchant-of-record (Paddle/Lemon Squeezy) vs. Stripe + Stripe Tax
- [ ] One-time consult with a lawyer (Seller of Travel) and accountant (sales tax/VAT) before subscriptions launch
