import streamlit as st


def inject_global_styles():
    st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

:root {
    color-scheme: dark !important;
    --byable-bg: #08090d;
    --byable-panel: #10121a;
    --byable-border: #1e2035;
    --byable-text: #e8e9f0;
    --byable-muted: #8b8fa8;
    --byable-purple: #a89cf7;
}

/* ── Reset & base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
    color-scheme: dark !important;
}

html, body, [data-testid="stAppViewContainer"] {
    background: var(--byable-bg) !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: var(--byable-text) !important;
    overflow-x: hidden !important;
}

[data-testid="stApp"],
[data-testid="stMain"],
[data-testid="stAppViewContainer"] > section {
    background: var(--byable-bg) !important;
    color: var(--byable-text) !important;
}

/* Hide Streamlit chrome */
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"],
footer,
#MainMenu { display: none !important; }

/* Hide Streamlit's automatic multipage nav; Byable uses its own sidebar nav. */
[data-testid="stSidebarNav"],
[data-testid="stSidebarNavItems"],
section[data-testid="stSidebarNav"],
nav[data-testid="stSidebarNav"] {
    display: none !important;
    height: 0 !important;
    overflow: hidden !important;
}

[data-testid="stSidebar"] {
    background: #0c0d14 !important;
    color: var(--byable-text) !important;
}

[data-testid="stSidebar"] label,
[data-testid="stSidebar"] p,
[data-testid="stSidebar"] span {
    color: var(--byable-muted) !important;
    -webkit-text-fill-color: var(--byable-muted) !important;
}

[data-testid="stSidebar"] .stRadio [data-baseweb="radio"]:has(input:checked) label,
[data-testid="stSidebar"] .stRadio [data-baseweb="radio"]:has(input:checked) span {
    color: var(--byable-purple) !important;
    -webkit-text-fill-color: var(--byable-purple) !important;
}

/* Content padding — hero breaks out via negative margin */
[data-testid="stAppViewContainer"] > section > div:first-child {
    padding-top: 0 !important;
}
.block-container {
    padding: 0 2.5rem 2rem !important;
    max-width: 100% !important;
    overflow-x: hidden !important;
}

/* Keep Streamlit controls readable in browser/system light mode. */
div[data-testid="stButton"] > button,
button[data-testid^="baseButton"],
[data-testid="baseButton-secondary"],
[data-testid="baseButton-primary"] {
    background: rgba(255,255,255,0.045) !important;
    color: var(--byable-text) !important;
    border: 1px solid rgba(255,255,255,0.13) !important;
    box-shadow: none !important;
    -webkit-text-fill-color: var(--byable-text) !important;
}

div[data-testid="stButton"] > button p,
button[data-testid^="baseButton"] p,
[data-testid="baseButton-secondary"] p,
[data-testid="baseButton-primary"] p {
    color: inherit !important;
    -webkit-text-fill-color: inherit !important;
}

div[data-testid="stButton"] > button:hover,
div[data-testid="stButton"] > button:focus {
    background: rgba(255,255,255,0.075) !important;
    color: #ffffff !important;
    border-color: rgba(168,156,247,0.36) !important;
    -webkit-text-fill-color: #ffffff !important;
}

div[data-testid="stButton"] > button:disabled,
button[data-testid^="baseButton"]:disabled {
    background: rgba(124,110,247,0.16) !important;
    color: #ffffff !important;
    border-color: rgba(168,156,247,0.34) !important;
    opacity: 1 !important;
    -webkit-text-fill-color: #ffffff !important;
}

div[data-testid="stButton"] > button:disabled p,
button[data-testid^="baseButton"]:disabled p {
    color: #ffffff !important;
    -webkit-text-fill-color: #ffffff !important;
}

/* Mobile top nav is rendered with Streamlit buttons so it can change page state. */
.byable-mobile-nav-heading,
[class*="st-key-top_mobile_nav_"] {
    display: none !important;
}

.byable-mobile-nav-heading {
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 10px 0 8px;
    color: #f0f1ff;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.02em;
}

.byable-mobile-beta {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #a89cf7;
    background: rgba(124,110,247,0.14);
    border: 1px solid rgba(124,110,247,0.28);
    padding: 2px 7px;
    border-radius: 999px;
}

/* ── Typography tokens ── */
.byable-eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #7c6ef7;
}
.byable-headline {
    font-size: clamp(32px, 5vw, 64px);
    font-weight: 800;
    line-height: 1.05;
    letter-spacing: -0.03em;
    color: #f0f1ff;
}
.byable-subhead {
    font-size: 17px;
    font-weight: 400;
    color: #8b8fa8;
    line-height: 1.6;
}
.byable-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #5a5e78;
}
.byable-value {
    font-size: 15px;
    font-weight: 600;
    color: #e8e9f0;
}

/* ── Cards ── */
.byable-card {
    background: #10121a;
    border: 1px solid #1e2035;
    border-radius: 16px;
    padding: 24px;
    transition: border-color 0.2s, transform 0.2s;
}
.byable-card:hover {
    border-color: #2d3055;
    transform: translateY(-1px);
}
.byable-card-accent {
    border-left: 3px solid;
}

/* ── Badges ── */
.badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
}
.badge-purple { background: rgba(124,110,247,0.15); color: #a89cf7; border: 1px solid rgba(124,110,247,0.3); }
.badge-green  { background: rgba(5,150,105,0.15);  color: #34d399; border: 1px solid rgba(5,150,105,0.3); }
.badge-amber  { background: rgba(217,119,6,0.15);  color: #fbbf24; border: 1px solid rgba(217,119,6,0.3); }
.badge-red    { background: rgba(220,38,38,0.15);  color: #f87171; border: 1px solid rgba(220,38,38,0.3); }
.badge-teal   { background: rgba(8,145,178,0.15);  color: #22d3ee; border: 1px solid rgba(8,145,178,0.3); }
.badge-dark   { background: rgba(255,255,255,0.05); color: #8b8fa8; border: 1px solid #1e2035; }

/* ── Buttons ── */
.byable-btn-primary {
    display: inline-block;
    background: linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    padding: 12px 28px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    letter-spacing: 0.01em;
    text-decoration: none;
    transition: opacity 0.2s, transform 0.15s;
}
.byable-btn-primary:hover { opacity: 0.9; transform: translateY(-1px); }

.byable-btn-ghost {
    display: inline-block;
    background: transparent;
    color: #8b8fa8;
    font-size: 14px;
    font-weight: 500;
    padding: 12px 28px;
    border-radius: 10px;
    border: 1px solid #1e2035;
    cursor: pointer;
    text-decoration: none;
    transition: border-color 0.2s, color 0.2s;
}
.byable-btn-ghost:hover { border-color: #3d4168; color: #e8e9f0; }

/* ── Divider ── */
.byable-divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, #1e2035 20%, #1e2035 80%, transparent);
    margin: 32px 0;
}

/* ── Score circle ── */
.score-circle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 2px solid;
    font-size: 15px;
    font-weight: 700;
}

/* ── Itinerary timeline ── */
.timeline-block {
    border-left: 2px solid #1e2035;
    padding-left: 16px;
    margin-left: 52px;
    position: relative;
}
.timeline-dot {
    position: absolute;
    left: -7px;
    top: 16px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid #08090d;
}

/* ── Stars ── */
.stars { color: #f59e0b; letter-spacing: 1px; }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #1e2035; border-radius: 4px; }

@media (max-width: 768px) {
    html,
    body {
        height: auto !important;
        min-height: 100% !important;
        max-height: none !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch !important;
    }

    html,
    body,
    .stApp,
    .main,
    section.main,
    [data-testid="stApp"],
    [data-testid="stMain"],
    [data-testid="stAppViewContainer"],
    [data-testid="stAppViewContainer"] > section,
    [data-testid="stVerticalBlock"],
    .block-container {
        max-width: 100vw !important;
        overflow-x: hidden !important;
        max-height: none !important;
    }

    html,
    body,
    [data-testid="stAppViewContainer"],
    .stApp,
    .main,
    section.main,
    [data-testid="stApp"],
    [data-testid="stMain"],
    [data-testid="stAppViewContainer"] > section,
    [data-testid="stVerticalBlock"] {
        height: auto !important;
        min-height: 100dvh !important;
        max-height: none !important;
        overflow-y: visible !important;
        -webkit-overflow-scrolling: touch !important;
    }

    [data-testid="stVerticalBlock"],
    [data-testid="stElementContainer"],
    [data-testid="stIFrame"] {
        max-height: none !important;
        overflow: visible !important;
    }

    [data-testid="stSidebar"] {
        display: none !important;
        width: 0 !important;
        min-width: 0 !important;
    }

    .block-container {
        height: auto !important;
        min-height: auto !important;
        overflow-y: visible !important;
        padding: 0 0.72rem calc(220px + env(safe-area-inset-bottom, 0px)) !important;
    }

    .byable-mobile-nav-heading {
        display: flex !important;
        margin: 7px 0 5px !important;
    }

    [class*="st-key-top_mobile_nav_"] {
        display: block !important;
    }

    [class*="st-key-top_mobile_nav_"] div[data-testid="stButton"] {
        margin: 0 !important;
    }

    [class*="st-key-top_mobile_nav_"] button {
        min-height: 34px !important;
        height: 34px !important;
        border-radius: 999px !important;
        padding: 4px 6px !important;
        font-size: 11px !important;
        font-weight: 800 !important;
        white-space: normal !important;
        line-height: 1.12 !important;
        background: rgba(255,255,255,0.045) !important;
        color: rgba(232,233,240,0.72) !important;
        border: 1px solid rgba(255,255,255,0.10) !important;
        box-shadow: none !important;
        -webkit-appearance: none !important;
        appearance: none !important;
    }

    [class*="st-key-top_mobile_nav_"] button[kind="primary"],
    [class*="st-key-top_mobile_nav_"] button[data-testid="baseButton-primary"] {
        background: linear-gradient(135deg, rgba(124,58,237,0.92), rgba(79,70,229,0.88)) !important;
        color: #ffffff !important;
        border-color: rgba(168,156,247,0.48) !important;
        box-shadow: 0 7px 18px rgba(124,58,237,0.20) !important;
    }

    [class*="st-key-top_mobile_nav_"] button:hover,
    [class*="st-key-top_mobile_nav_"] button:focus,
    [class*="st-key-top_mobile_nav_"] button:active {
        color: #ffffff !important;
        border-color: rgba(168,156,247,0.36) !important;
        background: rgba(255,255,255,0.075) !important;
    }

    [data-testid="stHorizontalBlock"] {
        gap: 0.22rem !important;
        margin-bottom: 0.22rem !important;
    }

    [data-testid="stBottomBlockContainer"],
    [data-testid="stStatusWidget"],
    [data-testid="stToolbar"],
    [data-testid="stDecoration"] {
        display: none !important;
    }
}

@media (max-width: 480px) {
    .block-container {
        padding-left: 0.55rem !important;
        padding-right: 0.55rem !important;
    }

    .byable-mobile-nav-heading {
        font-size: 13px !important;
    }

    .byable-mobile-beta {
        font-size: 8px !important;
        padding: 1px 6px !important;
    }

    [class*="st-key-top_mobile_nav_"] button {
        min-height: 31px !important;
        height: 31px !important;
        padding: 3px 4px !important;
        font-size: 10px !important;
    }
}

@media (prefers-color-scheme: light) {
    html,
    body,
    [data-testid="stApp"],
    [data-testid="stMain"],
    [data-testid="stAppViewContainer"],
    [data-testid="stAppViewContainer"] > section,
    .block-container {
        background: var(--byable-bg) !important;
        color: var(--byable-text) !important;
    }

    [data-testid="stSidebar"] {
        background: #0c0d14 !important;
        color: var(--byable-text) !important;
    }

    [data-testid="stSidebar"] label,
    [data-testid="stSidebar"] p,
    [data-testid="stSidebar"] span {
        color: var(--byable-muted) !important;
        -webkit-text-fill-color: var(--byable-muted) !important;
    }

    [data-testid="stSidebar"] .stRadio [data-baseweb="radio"]:has(input:checked) label,
    [data-testid="stSidebar"] .stRadio [data-baseweb="radio"]:has(input:checked) span {
        color: var(--byable-purple) !important;
        -webkit-text-fill-color: var(--byable-purple) !important;
    }

    [data-testid="stAppViewContainer"] label,
    [data-testid="stAppViewContainer"] label span,
    [data-testid="stAppViewContainer"] [data-testid="stWidgetLabel"],
    [data-testid="stAppViewContainer"] [data-testid="stWidgetLabel"] span,
    [data-testid="stAppViewContainer"] [data-testid="stMarkdownContainer"],
    [data-testid="stAppViewContainer"] [data-testid="stMarkdownContainer"] p,
    [data-testid="stAppViewContainer"] [data-testid="stCaptionContainer"],
    [data-testid="stAppViewContainer"] [data-testid="stCaptionContainer"] p {
        color: rgba(226,232,240,0.74) !important;
        -webkit-text-fill-color: rgba(226,232,240,0.74) !important;
    }

    [data-testid="stAppViewContainer"] h1,
    [data-testid="stAppViewContainer"] h2,
    [data-testid="stAppViewContainer"] h3,
    [data-testid="stAppViewContainer"] h4,
    [data-testid="stAppViewContainer"] h5,
    [data-testid="stAppViewContainer"] strong {
        color: #f8fafc !important;
        -webkit-text-fill-color: #f8fafc !important;
    }

    div[data-testid="stButton"] > button,
    button[data-testid^="baseButton"],
    [data-testid="baseButton-secondary"],
    [data-testid="baseButton-primary"] {
        background: rgba(255,255,255,0.045) !important;
        color: var(--byable-text) !important;
        border-color: rgba(255,255,255,0.13) !important;
        -webkit-text-fill-color: var(--byable-text) !important;
    }

    div[data-testid="stButton"] > button p,
    button[data-testid^="baseButton"] p {
        color: inherit !important;
        -webkit-text-fill-color: inherit !important;
    }

    div[data-testid="stButton"] > button:disabled,
    button[data-testid^="baseButton"]:disabled {
        background: rgba(124,110,247,0.16) !important;
        color: #ffffff !important;
        border-color: rgba(168,156,247,0.34) !important;
        -webkit-text-fill-color: #ffffff !important;
    }

    [class*="st-key-top_mobile_nav_"] button {
        background: rgba(255,255,255,0.045) !important;
        color: rgba(232,233,240,0.78) !important;
        border-color: rgba(255,255,255,0.12) !important;
        -webkit-text-fill-color: rgba(232,233,240,0.78) !important;
    }

    [class*="st-key-top_mobile_nav_"] button[kind="primary"],
    [class*="st-key-top_mobile_nav_"] button[data-testid="baseButton-primary"] {
        background: linear-gradient(135deg, rgba(124,58,237,0.92), rgba(79,70,229,0.88)) !important;
        color: #ffffff !important;
        -webkit-text-fill-color: #ffffff !important;
    }
}
</style>
""", unsafe_allow_html=True)
