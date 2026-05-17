import os
import sys
import traceback

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

if FRONTEND not in sys.path:
    sys.path.insert(0, FRONTEND)

try:
    import frontend.app  # noqa: F401
except Exception as exc:
    try:
        import streamlit as st

        try:
            st.set_page_config(page_title="Lantern", layout="wide")
        except Exception:
            pass
        st.error("Lantern could not start.")
        st.write("The app hit an initialization error before the main interface could render.")
        st.code("".join(traceback.format_exception(type(exc), exc, exc.__traceback__)))
    except Exception:
        raise
