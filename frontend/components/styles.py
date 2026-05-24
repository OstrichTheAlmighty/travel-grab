import streamlit as st


def inject_global_styles():
    st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

/* ── Reset & base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, [data-testid="stAppViewContainer"] {
    background: #08090d !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    color: #e8e9f0;
}

/* Hide Streamlit chrome */
[data-testid="stHeader"],
[data-testid="stToolbar"],
[data-testid="stDecoration"],
footer,
#MainMenu { display: none !important; }

/* Content padding — hero breaks out via negative margin */
[data-testid="stAppViewContainer"] > section > div:first-child {
    padding-top: 0 !important;
}
.block-container {
    padding: 0 2.5rem 2rem !important;
    max-width: 100% !important;
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
</style>
""", unsafe_allow_html=True)
