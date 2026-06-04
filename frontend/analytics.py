import os
import time
import uuid

import requests

try:
    import streamlit as st
except Exception:  # pragma: no cover - analytics must never break non-Streamlit contexts
    st = None


POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com"


def init_posthog():
    """Return PostHog config from environment, or None when unavailable."""
    api_key = os.getenv("POSTHOG_API_KEY", "").strip()
    if not api_key:
        return None
    return {
        "api_key": api_key,
        "host": os.getenv("POSTHOG_HOST", POSTHOG_DEFAULT_HOST).rstrip("/"),
    }


def _distinct_id():
    if st is None:
        return os.getenv("POSTHOG_DISTINCT_ID") or "server"
    try:
        if "posthog_distinct_id" not in st.session_state:
            st.session_state["posthog_distinct_id"] = str(uuid.uuid4())
        return st.session_state["posthog_distinct_id"]
    except Exception:
        return "streamlit"


def track_event(event_name, properties=None, distinct_id=None):
    """Send a PostHog event. Fails silently when unavailable or misconfigured."""
    config = init_posthog()
    if not config:
        return False
    try:
        payload = {
            "api_key": config["api_key"],
            "event": event_name,
            "distinct_id": distinct_id or _distinct_id(),
            "properties": {
                "app": "byable",
                "source": "streamlit",
                "timestamp": time.time(),
                **(properties or {}),
            },
        }
        requests.post(f"{config['host']}/capture/", json=payload, timeout=1.0)
        return True
    except Exception:
        return False


def track_once(event_name, key=None, properties=None):
    if st is None:
        return track_event(event_name, properties)
    try:
        state_key = f"_posthog_once_{key or event_name}"
        if st.session_state.get(state_key):
            return False
        st.session_state[state_key] = True
    except Exception:
        pass
    return track_event(event_name, properties)
