# Abbreviations & Terms

A shared glossary for this project. Add new terms as they emerge. Keeps everyone aligned on language — especially important when pitching, writing the business plan, or briefing new collaborators.

Format: **Term / Abbreviation** — Definition. *(Context or usage note if needed.)*

Last updated: 2026-06-03

---

## Business & Strategy

**TAM** — Total Addressable Market. The total revenue opportunity if 100% market share were achieved.

**SAM** — Serviceable Addressable Market. The portion of TAM targeted by our product and business model.

**SOM** — Serviceable Obtainable Market. The realistic share of the SAM we can capture, especially in early stages.

**GTM** — Go-to-Market. Strategy for how the product reaches its target customers.

**ACV** — Annual Contract Value. The average annualized revenue per customer contract. Common in B2B SaaS.

**LTV** — Lifetime Value. Total revenue expected from a single customer over their relationship with the product.

**CAC** — Customer Acquisition Cost. Total cost to acquire one paying customer.

**MRR** — Monthly Recurring Revenue.

**ARR** — Annual Recurring Revenue.

**B2C** — Business to Consumer. Product sold directly to individual end users (travelers).

**B2B** — Business to Business. Product sold to companies (e.g. travel agencies, corporate travel desks).

**B2B2C** — Business to Business to Consumer. We sell to a business (e.g. travel agency) who then serves their end customers using our platform.

**MVP** — Minimum Viable Product. The smallest version of the product that delivers core value and can be tested.

**PMF** — Product-Market Fit. The point at which a product satisfies a strong market demand.

**PoC** — Proof of Concept. A prototype or experiment to validate a key assumption before full build.

**LOI** — Letter of Intent. A non-binding document indicating a party's intention to enter a business agreement. Used as early B2B validation.

---

## Product & Tech

**AI Composer** — Our term for the core engine that takes user preferences as input and outputs a structured, personalized travel package proposal.

**Travel Package** — In this context: a coherent, ready-to-book (or ready-to-hand-off) bundle of travel components — which may include flights, accommodation, experiences/activities, and transfers. Exact scope TBD.

**Preference Graph / Travel DNA** — Hypothesized internal model of a user's travel tastes, built from their inputs and refined over time. May become a proprietary data asset.

**LLM** — Large Language Model. AI models like GPT-4, Claude, Gemini that understand and generate natural language. Core technology candidate for the AI composer.

**Agentic AI** — AI that takes autonomous multi-step actions (e.g. querying APIs, comparing options, iterating on a proposal) rather than just generating a single response.

**RAG** — Retrieval-Augmented Generation. A technique where an LLM is grounded with retrieved external data (e.g. live flight prices, hotel availability) before generating a response.

**API** — Application Programming Interface. How our platform connects to external data sources (flights, hotels, experiences).

**Affiliate API** — An API integration where we earn a commission on bookings made through our referral (e.g. Booking.com, Skyscanner affiliate programs).

**White-label** — A product built by us but rebranded and sold by another business (e.g. a travel agency using our AI composer under their own brand).

---

## Travel Industry

**OTA** — Online Travel Agency. Platforms like Expedia, Booking.com, or Kayak that aggregate and sell travel inventory.

**GDS** — Global Distribution System. Backend infrastructure (Sabre, Amadeus, Travelport) that distributes airline, hotel, and car rental inventory to travel agents and OTAs.

**Bleisure** — Business + leisure travel. Trips that blend work commitments with personal travel.

**Itinerary** — A day-by-day plan of a trip, including transport, accommodation, and activities.

**Package Tour** — A pre-bundled trip sold as a unit, typically including flights + hotel + transfers (e.g. TUI, G Adventures).

**FIT** — Fully Independent Traveler. A traveler who plans and books independently rather than through a package or group tour. Often our primary persona.

**Yield Management** — Pricing strategy used by airlines and hotels to maximize revenue by dynamically adjusting prices based on demand.

**Rate Parity** — The requirement by OTAs that hotels offer the same price across all booking channels. Relevant to our affiliate/commission model.

---

## Metrics & Research

**DAU / MAU** — Daily / Monthly Active Users.

**NPS** — Net Promoter Score. A measure of user satisfaction and likelihood to recommend.

**Churn** — Rate at which customers cancel or stop using the product.

**Conversion Rate** — % of users who complete a desired action (e.g. going from a proposal to a booking).

---

## Project-Specific Shorthand

**The Composer** — Internal shorthand for the AI engine at the core of our platform.

**Proposal** — The AI-generated output: a structured travel package presented to the user for review, refinement, or booking.

**Preference Capture** — The UX step where the user inputs their travel preferences (budget, style, dates, interests, constraints).

**P1 / P2 / P3** — Priority tiers used in `todo.md`. P1 = critical/blocking, P2 = important, P3 = nice-to-have.

**HU** — Human. Refers to the human collaborator / project lead in this project. Used in `chat-instructions.md` to distinguish the human decision-maker from Claude's autonomous actions.

**Specialist Team** — A structured research approach where Claude simulates multiple expert roles (e.g. Market Analyst, Tech Architect, Finance Modeler) to cover complex topics from different angles before synthesizing findings. Triggered when a task spans 3+ search queries or 2+ domains.

**Session Log** — The `session-log.md` file. A tight, always-current project snapshot pasted into every new Claude conversation to restore context instantly, compensating for Claude's lack of memory between sessions.

**Correction Protocol** — The defined process when Claude makes an error: HU flags it → Claude corrects the file → logs a Dead-End or Risk entry in `lessons-learned.md` → updates `session-log.md` if needed. No silent edits.

**ISO Date Format** — The date/time standard used throughout this project: `YYYY-MM-DD` for dates, `YYYY-MM-DD HH:MM PT` for timestamps. 24-hour clock. Pacific timezone.
