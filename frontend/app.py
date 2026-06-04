import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st

st.set_page_config(
    page_title="Byable — AI Travel Concierge",
    layout="wide",
    initial_sidebar_state="expanded",
)

from components.styles import inject_global_styles
from components.nav import sidebar_nav, top_mobile_nav
from analytics import track_once
from pages import overview, flights, hotels, activities, itinerary, ai_picks

inject_global_styles()

st.session_state.setdefault("page", "flights")
track_once("streamlit_app_loaded")

try:
    if "flight_key" in st.query_params:
        st.session_state["page"] = "flights"
        del st.query_params["flight_key"]
except Exception:
    pass

sidebar_nav()
top_mobile_nav()

page = st.session_state.get("page", "flights")

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
