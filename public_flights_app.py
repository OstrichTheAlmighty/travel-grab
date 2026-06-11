import os
import re
import sys
from pathlib import Path

import streamlit as st


os.environ["PUBLIC_FLIGHTS_ONLY"] = "true"
os.environ["BYABLE_PAGE"] = "flights"

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
sys.path.insert(0, str(FRONTEND_DIR))

st.set_page_config(
    page_title="Byable Flights",
    page_icon="✈",
    layout="wide",
    initial_sidebar_state="collapsed",
)

from analytics import track_event, track_once
from components.styles import inject_global_styles
from pages import flights


EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _inject_public_styles():
    st.markdown(
        """
        <style>
        [data-testid="stSidebar"],
        [data-testid="stSidebarNav"],
        [data-testid="collapsedControl"],
        button[kind="header"],
        [data-testid="stToolbar"],
        [data-testid="stDecoration"],
        #MainMenu,
        footer {
            display: none !important;
        }
        [data-testid="stAppViewContainer"] > section {
            margin-left: 0 !important;
        }
        .block-container {
            max-width: 1180px !important;
            padding-top: 1.25rem !important;
        }
        .public-flight-hero {
            border: 1px solid rgba(196,181,253,.16);
            border-radius: 24px;
            background:
                radial-gradient(circle at top left, rgba(139,92,246,.22), transparent 34%),
                radial-gradient(circle at top right, rgba(16,185,129,.10), transparent 28%),
                linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.018)),
                rgba(7,9,15,.94);
            padding: 26px;
            margin: 8px 0 18px;
            box-shadow: 0 24px 70px rgba(0,0,0,.28);
        }
        .public-flight-kicker {
            color: #a78bfa;
            font-size: 11px;
            font-weight: 850;
            letter-spacing: .12em;
            text-transform: uppercase;
            margin-bottom: 10px;
        }
        .public-flight-title {
            color: #fff;
            font-size: clamp(34px, 5vw, 60px);
            font-weight: 900;
            letter-spacing: -.045em;
            line-height: 1.02;
            max-width: 820px;
        }
        .public-flight-subtitle {
            color: rgba(255,255,255,.62);
            font-size: 16px;
            line-height: 1.55;
            max-width: 760px;
            margin-top: 12px;
        }
        .public-flight-pills {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 18px;
        }
        .public-flight-pill {
            border: 1px solid rgba(255,255,255,.10);
            border-radius: 999px;
            background: rgba(255,255,255,.045);
            color: rgba(255,255,255,.72);
            font-size: 12px;
            font-weight: 750;
            padding: 7px 10px;
        }
        .public-email-card {
            border: 1px solid rgba(255,255,255,.09);
            border-radius: 16px;
            background: rgba(255,255,255,.035);
            padding: 14px 16px;
            margin: 0 0 18px;
        }
        .public-email-title {
            color: rgba(255,255,255,.88);
            font-size: 14px;
            font-weight: 850;
            margin-bottom: 3px;
        }
        .public-email-subtitle {
            color: rgba(255,255,255,.50);
            font-size: 12px;
            margin-bottom: 10px;
        }
        @media(max-width: 768px) {
            .block-container { padding-left: 12px !important; padding-right: 12px !important; }
            .public-flight-hero { padding: 20px; border-radius: 20px; }
            .public-flight-subtitle { font-size: 14px; }
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _render_public_hero():
    st.markdown(
        """
        <section class="public-flight-hero">
            <div class="public-flight-kicker">Byable Flights</div>
            <div class="public-flight-title">Find the best flight — not just the cheapest one.</div>
            <div class="public-flight-subtitle">
                AI compares price, layovers, timing, airlines, and comfort to explain which flight is actually worth booking.
            </div>
            <div class="public-flight-pills">
                <span class="public-flight-pill">Live fares</span>
                <span class="public-flight-pill">Open-jaw support</span>
                <span class="public-flight-pill">Airport + comfort tradeoffs</span>
                <span class="public-flight-pill">Advisor-style recommendation</span>
            </div>
        </section>
        """,
        unsafe_allow_html=True,
    )


def _render_email_capture():
    st.markdown(
        """
        <div class="public-email-card">
            <div class="public-email-title">Want early access to the full Byable planner?</div>
            <div class="public-email-subtitle">Leave your email and we’ll follow up when the private travel planner opens up.</div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    with st.form("public_flights_email_capture", clear_on_submit=True):
        col_email, col_submit = st.columns([3, 1])
        with col_email:
            email = st.text_input("Email", placeholder="you@example.com", label_visibility="collapsed")
        with col_submit:
            submitted = st.form_submit_button("Notify me", use_container_width=True)
    if submitted:
        clean_email = str(email or "").strip()
        if not EMAIL_PATTERN.match(clean_email):
            st.warning("Enter a valid email address.")
            return
        track_event("public_flights_email_submitted", {"email": clean_email})
        st.success("Thanks — we’ll keep you posted.")


def main():
    st.session_state["page"] = "flights"
    st.session_state["public_flights_only"] = True
    inject_global_styles()
    _inject_public_styles()
    track_once("public_flights_app_loaded", key="public_flights_app_loaded")
    _render_public_hero()
    _render_email_capture()
    flights.render()


if __name__ == "__main__":
    main()
