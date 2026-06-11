# TravelGrab Public Launch Security Checklist

Public scope: flights-only Streamlit app launched via `public_flights_app.py` or `PUBLIC_FLIGHTS_ONLY=true`.

## Checked

- Secrets are read server-side from `st.secrets` or environment variables.
- `.env`, `backend/.env`, and `.streamlit/secrets.toml` are ignored by Git.
- No private planner navigation is rendered in the public flights app.
- Public mode imports and renders only the Flights page.
- Public mode hides Streamlit sidebar navigation and collapsed sidebar controls.
- Public mode suppresses internal diagnostic stdout from the Flights renderer.
- Public mode catches unexpected Flights page exceptions and shows a generic user message.
- Public flight search errors are sanitized so raw provider/API errors are not shown to users.
- Flight search input validation exists for origin city, destination city, return city, dates, travelers, cabin, and return-date ordering.
- Flight search has per-session cooldown abuse protection.
- Public mode adds a per-session hourly flight-search cap.
- Public Streamlit app does not require login by default.
- Waitlist/email capture is not present in `public_flights_app.py`; landing-page waitlist submissions post directly to Formspree and do not log emails in app code.

## Deployment Requirements

- Run public launch with:
  - `streamlit run public_flights_app.py`, or
  - `PUBLIC_FLIGHTS_ONLY=true streamlit run frontend/app.py`
- Do not deploy the private full app entrypoint without `PUBLIC_FLIGHTS_ONLY=true`.
- Keep API keys only in Streamlit secrets or server environment variables.
- Do not commit `.env` files, `.streamlit/secrets.toml`, logs, or key files.

## Notes

- PostHog server-side analytics are silent in public mode.
- The browser-side PostHog helper is disabled in public mode so no analytics key is injected by the Streamlit app.
- The public app intentionally exposes no Hotels, Activities, Itinerary, AI Picks, debug, or admin tools.
