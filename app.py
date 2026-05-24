import os
import sys


ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")

for path in (FRONTEND, ROOT):
    if path not in sys.path:
        sys.path.insert(0, path)

app_path = os.path.join(FRONTEND, "app.py")
with open(app_path, "r") as app_file:
    exec(
        compile(app_file.read(), app_path, "exec"),
        {"__file__": app_path, "__name__": "__main__", "_ENTRYPOINT_TEST_LABEL": "app.py"},
    )
