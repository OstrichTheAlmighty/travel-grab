import streamlit as st


NAV_ITEMS = [
    ("Overview", "overview"),
    ("Flights", "flights"),
    ("Hotels", "hotels"),
    ("Activities", "activities"),
    ("Itinerary", "itinerary"),
    ("AI Picks", "ai_picks"),
]


def render_nav():
    active = st.session_state.get("page", "overview")

    tab_html = ""
    for label, key in NAV_ITEMS:
        is_active = key == active
        active_style = (
            "color:#a89cf7; border-bottom:2px solid #7c3aed;"
            if is_active
            else "color:#5a5e78; border-bottom:2px solid transparent;"
        )
        tab_html += f"""
        <button onclick="window.parent.postMessage({{type:'byable_nav',page:'{key}'}},'*')"
                style="background:none;border:none;cursor:pointer;padding:14px 20px;
                       font-family:inherit;font-size:13px;font-weight:600;
                       letter-spacing:0.02em;{active_style};
                       transition:color 0.2s;">
            {label}
        </button>"""

    st.markdown(f"""
<div style="
    position:sticky;top:0;z-index:100;
    background:rgba(8,9,13,0.92);
    backdrop-filter:blur(20px);
    border-bottom:1px solid #1e2035;
    display:flex;align-items:center;
    padding:0 40px;
    gap:4px;
">
    <div style="margin-right:32px;display:flex;align-items:center;gap:8px;">
        <div style="width:28px;height:28px;background:linear-gradient(135deg,#7c3aed,#4f46e5);
                    border-radius:8px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:13px;font-weight:800;">B</span>
        </div>
        <span style="font-size:15px;font-weight:700;color:#f0f1ff;letter-spacing:-0.02em;">Byable</span>
        <span style="font-size:9px;font-weight:600;letter-spacing:0.12em;color:#7c6ef7;
                     background:rgba(124,110,247,0.12);border:1px solid rgba(124,110,247,0.25);
                     padding:2px 6px;border-radius:4px;margin-left:4px;">BETA</span>
    </div>
    {tab_html}
    <div style="margin-left:auto;display:flex;align-items:center;gap:12px;">
        <div style="width:8px;height:8px;border-radius:50%;background:#34d399;
                    box-shadow:0 0 8px rgba(52,211,153,0.5);"></div>
        <span style="font-size:12px;color:#5a5e78;">3 travelers</span>
    </div>
</div>
""", unsafe_allow_html=True)

    # Capture nav clicks via query params (Streamlit-compatible fallback)
    for label, key in NAV_ITEMS:
        if st.session_state.get(f"_nav_{key}"):
            st.session_state["page"] = key
            st.session_state[f"_nav_{key}"] = False


def sidebar_nav():
    """Streamlit radio nav — used as the real page switcher."""
    with st.sidebar:
        st.markdown("""
<div style="padding:16px 0 24px;border-bottom:1px solid #1e2035;margin-bottom:8px;">
    <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,#7c3aed,#4f46e5);
                    border-radius:9px;display:flex;align-items:center;justify-content:center;">
            <span style="color:#fff;font-size:16px;font-weight:800;">B</span>
        </div>
        <span style="font-size:17px;font-weight:700;color:#f0f1ff;letter-spacing:-0.02em;">Byable</span>
    </div>
    <div style="margin-top:8px;">
        <span style="font-size:9px;font-weight:600;letter-spacing:0.12em;color:#7c6ef7;
                     background:rgba(124,110,247,0.12);border:1px solid rgba(124,110,247,0.25);
                     padding:2px 8px;border-radius:4px;">BETA</span>
    </div>
</div>
""", unsafe_allow_html=True)

        labels = [label for label, _ in NAV_ITEMS]
        keys = [key for _, key in NAV_ITEMS]
        current = st.session_state.get("page", "overview")
        current_idx = keys.index(current) if current in keys else 0

        choice = st.radio(
            "Navigation",
            labels,
            index=current_idx,
            key="_sidebar_nav",
            label_visibility="collapsed",
        )
        selected_key = keys[labels.index(choice)]
        if selected_key != st.session_state.get("page"):
            st.session_state["page"] = selected_key

        st.markdown("""
<style>
[data-testid="stSidebar"] {
    background: #0c0d14 !important;
    border-right: 1px solid #1e2035 !important;
    min-width: 180px !important;
    max-width: 200px !important;
}
[data-testid="stSidebar"] .stRadio label {
    font-size: 13px !important;
    font-weight: 500 !important;
    color: #8b8fa8 !important;
    padding: 8px 0 !important;
}
[data-testid="stSidebar"] .stRadio [data-baseweb="radio"]:has(input:checked) label {
    color: #a89cf7 !important;
    font-weight: 600 !important;
}
</style>
""", unsafe_allow_html=True)
