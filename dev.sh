#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
UVICORN_LOG="/tmp/uvicorn.log"
STREAMLIT_LOG="/tmp/streamlit.log"
UVICORN_WATCH_PID="/tmp/runway_uvicorn_watch.pid"
STREAMLIT_WATCH_PID="/tmp/runway_streamlit_watch.pid"

PYTHON_BIN="python3"
STREAMLIT_BIN="streamlit"

if [[ -x "$VENV_DIR/bin/python" ]]; then
  PYTHON_BIN="$VENV_DIR/bin/python"
fi
if [[ -x "$VENV_DIR/bin/streamlit" ]]; then
  STREAMLIT_BIN="$VENV_DIR/bin/streamlit"
fi

cmd="${1:-start}"

start() {
  echo "Starting backend and frontend..."
  cd "$ROOT_DIR"

  if [[ -f "$VENV_DIR/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
  fi

  nohup "$PYTHON_BIN" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 > "$UVICORN_LOG" 2>&1 &
  nohup "$STREAMLIT_BIN" run frontend/app.py --server.port 8501 --server.address 127.0.0.1 --server.enableCORS=false --server.enableXsrfProtection=false > "$STREAMLIT_LOG" 2>&1 &

  sleep 1
  echo "Backend log: $UVICORN_LOG"
  echo "Frontend log: $STREAMLIT_LOG"
  echo "Open: http://127.0.0.1:8501"
}

start_watch() {
  echo "Starting backend and frontend with auto-restart..."
  cd "$ROOT_DIR"

  if [[ -f "$VENV_DIR/bin/activate" ]]; then
    # shellcheck disable=SC1091
    source "$VENV_DIR/bin/activate"
  fi

  nohup bash -c "
    while true; do
      \"$PYTHON_BIN\" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
      echo \"[uvicorn] exited, restarting in 1s...\" >> \"$UVICORN_LOG\"
      sleep 1
    done
  " > "$UVICORN_LOG" 2>&1 &
  echo $! > "$UVICORN_WATCH_PID"

  nohup bash -c "
    while true; do
      \"$STREAMLIT_BIN\" run frontend/app.py --server.port 8501 --server.address 127.0.0.1 --server.enableCORS=false --server.enableXsrfProtection=false
      echo \"[streamlit] exited, restarting in 1s...\" >> \"$STREAMLIT_LOG\"
      sleep 1
    done
  " > "$STREAMLIT_LOG" 2>&1 &
  echo $! > "$STREAMLIT_WATCH_PID"

  sleep 1
  echo "Backend log: $UVICORN_LOG"
  echo "Frontend log: $STREAMLIT_LOG"
  echo "Open: http://127.0.0.1:8501"
}

stop() {
  echo "Stopping backend and frontend..."
  if [[ -f "$UVICORN_WATCH_PID" ]]; then
    kill "$(cat "$UVICORN_WATCH_PID")" 2>/dev/null || true
    rm -f "$UVICORN_WATCH_PID"
  fi
  if [[ -f "$STREAMLIT_WATCH_PID" ]]; then
    kill "$(cat "$STREAMLIT_WATCH_PID")" 2>/dev/null || true
    rm -f "$STREAMLIT_WATCH_PID"
  fi
  pkill -f "uvicorn backend.main:app" || true
  pkill -f "streamlit run frontend/app.py" || true
}

status() {
  echo "Backend:"
  pgrep -fl "uvicorn backend.main:app" || echo "  not running"
  echo "Frontend:"
  pgrep -fl "streamlit run frontend/app.py" || echo "  not running"
}

case "$cmd" in
  start) start ;;
  watch) start_watch ;;
  stop) stop ;;
  status) status ;;
  *)
    echo "Usage: ./dev.sh [start|watch|stop|status]"
    exit 1
    ;;
esac
