import os
import sys

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(dotenv_path):
        if not dotenv_path or not os.path.exists(dotenv_path):
            return False
        with open(dotenv_path, "r") as env_file:
            for raw_line in env_file:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        return True

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")

load_dotenv(dotenv_path=".env")
load_dotenv(os.path.join(ROOT, ".env"))

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
        {"__file__": _app_path, "__name__": "__main__"},
    )
