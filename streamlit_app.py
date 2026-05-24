import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")

for p in (FRONTEND, ROOT):
    if p not in sys.path:
        sys.path.insert(0, p)

# Execute frontend/app.py as a script so Streamlit replays it properly on reruns.
# Using exec() rather than import avoids the module-cache problem where
# subsequent Streamlit reruns skip re-executing top-level code.
_app_path = os.path.join(FRONTEND, "app.py")
with open(_app_path, "r") as _f:
    exec(
        compile(_f.read(), _app_path, "exec"),
        {"__file__": _app_path, "__name__": "__main__", "_ENTRYPOINT_TEST_LABEL": "streamlit_app.py"},
    )
