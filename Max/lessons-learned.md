# Lessons Learned

Running log of decisions, pivots, dead-ends, and insights. Append only — never overwrite entries.
Timezone: Pacific (PT) — timestamps in ISO 24hr format.

Entry format:
```
### YYYY-MM-DD HH:MM PT | [Type] | [Rating] | Title
Description — written to be useful to someone reading cold, months later.
Affects: [list of files or sections impacted]
```

**Types:** Decision · Insight · Dead-End · Pivot · Validation · Risk · Assumption
**Ratings:** ⭐ Minor · ⭐⭐ Moderate · ⭐⭐⭐ Major

---

## Log

### 2026-06-03 17:00 PT | Decision | ⭐⭐⭐ | Operating instructions v3 finalized

Full governing ruleset established for how Claude runs this project. Key rules:
1. All research lives in `market-research.md`; raw sources in `sources.md`.
2. Multi-source validation required (2–3 sources minimum per material claim).
3. Complex research uses structured specialist/agent team approach — triggered when a task spans 3+ search queries or 2+ domains.
4. `abbreviations-and-terms.md` auto-maintained every session.
5. Lessons-learned entries require date, type, rating, description, and Affects field.
6. No assumptions recorded as fact without HU validation — labeled `[ASSUMPTION]` until confirmed.
7. Correction protocol defined: HU flags error → Claude corrects → logs Dead-End or Risk entry → updates affected file.
8. ISO date format (YYYY-MM-DD), 24hr time, Pacific timezone throughout.
Affects: `chat-instructions.md`

### 2026-06-03 17:00 PT | Decision | ⭐⭐⭐ | File structure expanded to nine files

Added `session-log.md` (context snapshot for session continuity) and `sources.md` (raw evidence trail, split from `market-research.md`).
Rationale: Claude has no memory between sessions — `session-log.md` solves cold-start problem. Separating sources from analysis keeps `market-research.md` readable as research scales.
Affects: `chat-instructions.md` § File Map, `session-log.md`, `sources.md`, `market-research.md`

### 2026-06-03 17:00 PT | Decision | ⭐⭐ | Todo format upgraded

Added `[Added: YYYY-MM-DD]` and `[By: HU|Claude]` fields to all todo items. Added Stale / On Hold section.
Rationale: Without dates and owners, todo lists become unauditable noise after a few sessions.
Affects: `todo.md`

### 2026-06-03 17:00 PT | Decision | ⭐⭐ | Project initialization — seven-file structure

Initial file structure created: `chat-instructions.md`, `market-research.md`, `pitch.md`, `business-plan.md`, `lessons-learned.md`, `todo.md`, `abbreviations-and-terms.md`.
Rationale: Topic-scoped files enable focused sessions and async continuity with Claude.
Affects: All files

### 2026-06-03 17:00 PT | Decision | ⭐⭐⭐ | Initial scope defined

Phase 1 scope: market research + idea definition and refinement.
Core concept: AI-powered platform that composes personalized travel packages from user preferences (budget, travel style, experience type, etc.).
Still open: B2C vs B2B vs hybrid; revenue model; product name.
Affects: `pitch.md`, `business-plan.md`, `todo.md`

---

## Open Questions Log

*Strategic unknowns requiring HU input or research to resolve. Move to resolved once closed.*

| # | Question | Added | Priority |
|---|---|---|---|
| 1 | B2C vs B2B vs hybrid — who is the primary customer? | 2026-06-03 | P1 |
| 2 | What is the product name / codename? | 2026-06-03 | P1 |
| 3 | Does "travel package" include flights + hotels only, or full experience layer? | 2026-06-03 | P1 |
| 4 | AI architecture — pure LLM, RAG hybrid, or agentic? | 2026-06-03 | P2 |
| 5 | Is there genuine willingness-to-pay, or will OTAs absorb this as a feature? | 2026-06-03 | P2 |

### Resolved
*(None yet)*
