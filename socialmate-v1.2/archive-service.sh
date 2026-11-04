#!/usr/bin/env bash
# ALW-001 私有归档接收端（仅 127.0.0.1；经 Tailscale Serve 或 adb reverse 访问）
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL="$ROOT/socialmate-v1.2/.local"
TOKEN_FILE="$LOCAL/archive-token"
PID_FILE="$LOCAL/archive.pid"
LOG_DIR="$LOCAL/qa"
PORT="${SM_ARCHIVE_PORT:-8781}"
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ] && [ -x "$HOME/.nvm/versions/node/v24.19.0/bin/node" ]; then
  NODE_BIN="$HOME/.nvm/versions/node/v24.19.0/bin/node"
fi
[ -n "$NODE_BIN" ] || { echo "BLOCKED: node not found"; exit 2; }

ensure_token() {
  mkdir -p "$LOCAL" "$LOG_DIR"
  if [ ! -s "$TOKEN_FILE" ]; then
    "$NODE_BIN" -e "console.log(require('crypto').randomBytes(24).toString('hex'))" > "$TOKEN_FILE"
    chmod 600 "$TOKEN_FILE"
    echo "GENERATED: $TOKEN_FILE (0600)"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "RUNNING pid=$(cat "$PID_FILE")"
    curl -s -m 3 "http://127.0.0.1:$PORT/health" || true
    echo
  else
    echo "STOPPED"
  fi
}

case "${1:-status}" in
  status)
    status
    ;;
  start|ensure)
    ensure_token
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      status; exit 0
    fi
    unset NODE_TLS_REJECT_UNAUTHORIZED || true
    SM_ARCHIVE_TOKEN="$(cat "$TOKEN_FILE")" SM_ARCHIVE_PORT="$PORT" \
      SM_ARCHIVE_HOST="${SM_ARCHIVE_HOST:-0.0.0.0}" \
      nohup "$NODE_BIN" "$ROOT/socialmate-prototype/ai-gateway/archive-receiver.mjs" \
      >"$LOG_DIR/archive-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
    echo $! > "$PID_FILE"
    sleep 0.8
    status
    ;;
  stop)
    if [ -f "$PID_FILE" ]; then kill "$(cat "$PID_FILE")" 2>/dev/null || true; rm -f "$PID_FILE"; fi
    echo "STOPPED"
    ;;
  token)
    ensure_token; cat "$TOKEN_FILE"
    ;;
  *)
    echo "usage: $0 {start|ensure|stop|status|token}"; exit 2
    ;;
esac
