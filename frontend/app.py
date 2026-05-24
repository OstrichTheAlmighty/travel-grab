import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import streamlit as st

st.set_page_config(
    page_title="Byable — AI Travel Concierge",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.write(f"ENTRYPOINT TEST: {globals().get('_ENTRYPOINT_TEST_LABEL', 'frontend/app.py')}")

from components.styles import inject_global_styles
from components.nav import sidebar_nav
from pages import overview, flights, hotels, activities, itinerary, ai_picks

inject_global_styles()

st.session_state.setdefault("page", "overview")

sidebar_nav()

page = st.session_state.get("page", "overview")

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
