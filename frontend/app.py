import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st
from contextlib import redirect_stdout
from io import StringIO

PUBLIC_FLIGHTS_ONLY = os.getenv("PUBLIC_FLIGHTS_ONLY", "").strip().lower() in {"1", "true", "yes", "on"}

st.set_page_config(
    page_title="Byable Flights" if PUBLIC_FLIGHTS_ONLY else "Byable — AI Travel Concierge",
    layout="wide",
    initial_sidebar_state="collapsed" if PUBLIC_FLIGHTS_ONLY else "expanded",
)

from components.styles import inject_global_styles
from analytics import track_event, track_once

inject_global_styles()

st.session_state.setdefault("page", "flights")
track_once("streamlit_app_loaded")

if PUBLIC_FLIGHTS_ONLY:
    from pages import flights

    st.session_state["page"] = "flights"
    st.session_state["public_flights_only"] = True
    st.markdown(
        """
        <style>
        [data-testid="stSidebar"],
        [data-testid="stSidebarNav"],
        [data-testid="collapsedControl"] {
            display: none !important;
        }
        [data-testid="stAppViewContainer"] > section {
            margin-left: 0 !important;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
    if st.session_state.get("_last_page_viewed") != "flights":
        track_event("page_viewed", {"page_name": "flights"})
        st.session_state["_last_page_viewed"] = "flights"
    try:
        with redirect_stdout(StringIO()):
            flights.render()
    except Exception:
        st.error("TravelGrab couldn't load flight search right now. Please refresh and try again.")
    st.stop()

from components.nav import sidebar_nav, top_mobile_nav
from pages import overview, flights, hotels, activities, itinerary, ai_picks

try:
    if "flight_key" in st.query_params:
        st.session_state["page"] = "flights"
        del st.query_params["flight_key"]
except Exception:
    pass

sidebar_nav()
top_mobile_nav()

page = st.session_state.get("page", "flights")
if st.session_state.get("_last_page_viewed") != page:
    track_event("page_viewed", {"page_name": page})
    st.session_state["_last_page_viewed"] = page

if page == "overview":
    overview.render()
elif page == "flights":
    flights.render()
elif page == "hotels":
    hotels.render()
elif page == "activities":
    activities.render()
elif page == "itinerary":
    itinerary.render()
elif page == "ai_picks":
    ai_picks.render()
