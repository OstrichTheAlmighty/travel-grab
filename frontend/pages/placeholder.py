import streamlit as st


def render(title: str, description: str, icon: str = "◈"):
    st.write("ENTRYPOINT TEST: frontend/pages/placeholder.py")
    st.markdown(f"""
<div style="padding:80px 48px;text-align:center;">
    <div style="font-size:48px;margin-bottom:20px;">{icon}</div>
    <div style="font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;
                color:#7c6ef7;margin-bottom:12px;">Coming next</div>
    <div style="font-size:32px;font-weight:700;color:#f0f1ff;margin-bottom:12px;
                letter-spacing:-0.02em;">{title}</div>
    <div style="font-size:15px;color:#5a5e78;max-width:440px;margin:0 auto;line-height:1.65;">
        {description}
    </div>
</div>
""", unsafe_allow_html=True)
