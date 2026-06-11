import json
import os
import time
import uuid

import requests

try:
    import streamlit as st
except Exception:  # pragma: no cover - analytics must never break non-Streamlit contexts
    st = None


POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com"
_POSTHOG_STATUS_PRINTED = False


def _analytics_debug_enabled():
    return os.getenv("PUBLIC_FLIGHTS_ONLY", "").strip().lower() not in {"1", "true", "yes", "on"}


def _print_posthog_status(api_key_present, initialized):
    global _POSTHOG_STATUS_PRINTED
    if not _analytics_debug_enabled():
        return
    if _POSTHOG_STATUS_PRINTED:
        return
    print(
        "POSTHOG STATUS\n"
        f"API KEY PRESENT: {str(bool(api_key_present)).lower()}\n"
        f"POSTHOG INITIALIZED: {str(bool(initialized)).lower()}",
        flush=True,
    )
    _POSTHOG_STATUS_PRINTED = True


def init_posthog():
    """Return PostHog config from environment, or None when unavailable."""
    api_key = os.getenv("POSTHOG_API_KEY", "").strip()
    if not api_key:
        _print_posthog_status(False, False)
        return None
    config = {
        "api_key": api_key,
        "host": os.getenv("POSTHOG_HOST", POSTHOG_DEFAULT_HOST).rstrip("/"),
    }
    _print_posthog_status(True, True)
    return config


def _distinct_id():
    if st is None:
        return os.getenv("POSTHOG_DISTINCT_ID") or "server"
    try:
        if "posthog_distinct_id" not in st.session_state:
            st.session_state["posthog_distinct_id"] = str(uuid.uuid4())
        return st.session_state["posthog_distinct_id"]
    except Exception:
        return "streamlit"


def _current_page():
    if st is None:
        return os.getenv("BYABLE_PAGE") or "unknown"
    try:
        return str(st.session_state.get("page") or "unknown")
    except Exception:
        return "unknown"


def _app_url():
    if st is None:
        return os.getenv("BYABLE_APP_URL") or ""
    try:
        context = getattr(st, "context", None)
        for attr in ("url", "page_url"):
            value = getattr(context, attr, "") if context is not None else ""
            if value:
                return str(value)
        headers = getattr(context, "headers", {}) if context is not None else {}
        host = ""
        if isinstance(headers, dict):
            host = headers.get("Host") or headers.get("host") or ""
        if host:
            scheme = "http" if host.startswith(("localhost", "127.0.0.1")) else "https"
            return f"{scheme}://{host}"
    except Exception:
        pass
    return os.getenv("BYABLE_APP_URL") or ""


def _environment_from_url(app_url):
    host = str(app_url or os.getenv("BYABLE_APP_URL") or "").lower()
    if "localhost" in host or "127.0.0.1" in host:
        return "local"
    if "byable-demo.streamlit.app" in host:
        return "streamlit_cloud"
    if "byable.app" in host:
        return "production_landing"
    if os.getenv("STREAMLIT_CLOUD") or os.getenv("STREAMLIT_SHARING_MODE"):
        return "streamlit_cloud"
    return os.getenv("BYABLE_ENVIRONMENT") or "local"


def _event_properties(properties=None):
    session_id = _distinct_id()
    current_page = _current_page()
    app_url = _app_url()
    return {
        "app": "byable",
        "source": "streamlit",
        "timestamp": time.time(),
        "session_id": session_id,
        "page": current_page,
        "current_page": current_page,
        "app_url": app_url,
        "environment": _environment_from_url(app_url),
        **(properties or {}),
    }


def posthog_client_script(page_name):
    """Return no-UI JS tracking for HTML components that cannot call Python callbacks."""
    config = init_posthog()
    session_id = _distinct_id()
    app_url = _app_url()
    environment = _environment_from_url(app_url)
    if not config:
        return """
<script>
window.byableTrack = function(){};
</script>
"""
    if os.getenv("PUBLIC_FLIGHTS_ONLY", "").strip().lower() in {"1", "true", "yes", "on"}:
        return """
<script>
window.byableTrack = function(){};
</script>
"""
    return f"""
<script>
window.byableTrack = function(eventName, properties) {{
  try {{
    fetch({json.dumps(config["host"] + "/capture/")}, {{
      method: "POST",
      headers: {{"Content-Type": "application/json"}},
      body: JSON.stringify({{
        api_key: {json.dumps(config["api_key"])},
        event: eventName,
        distinct_id: {json.dumps(session_id)},
        properties: Object.assign({{
          app: "byable",
          source: "streamlit_component",
          timestamp: Date.now() / 1000,
          session_id: {json.dumps(session_id)},
          page: {json.dumps(page_name)},
          current_page: {json.dumps(page_name)},
          app_url: {json.dumps(app_url)},
          environment: {json.dumps(environment)}
        }}, properties || {{}})
      }})
    }}).then(function(response) {{
      if (response.ok) {{
        console.log("POSTHOG EVENT SENT: " + eventName);
      }} else {{
        console.log("POSTHOG EVENT FAILED: " + response.status);
      }}
    }}).catch(function(error) {{
      console.log("POSTHOG EVENT FAILED: " + error);
    }});
  }} catch (error) {{
    console.log("POSTHOG EVENT FAILED: " + error);
  }}
}};
</script>
"""


def track_event(event_name, properties=None, distinct_id=None):
    """Send a PostHog event. Fails silently when unavailable or misconfigured."""
    config = init_posthog()
    if not config:
        if _analytics_debug_enabled():
            print(f"POSTHOG EVENT FAILED: {event_name} not sent because POSTHOG_API_KEY is missing", flush=True)
        return False
    try:
        payload = {
            "api_key": config["api_key"],
            "event": event_name,
            "distinct_id": distinct_id or _distinct_id(),
            "properties": _event_properties(properties),
        }
        response = requests.post(f"{config['host']}/capture/", json=payload, timeout=1.0)
        response.raise_for_status()
        if _analytics_debug_enabled():
            print(f"POSTHOG EVENT SENT: {event_name}", flush=True)
        return True
    except Exception as exc:
        if _analytics_debug_enabled():
            print(f"POSTHOG EVENT FAILED: {exc}", flush=True)
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
