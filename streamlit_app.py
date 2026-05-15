import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FRONTEND = os.path.join(ROOT, "frontend")

if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

if FRONTEND not in sys.path:
    sys.path.insert(0, FRONTEND)

from frontend.app import main

main()