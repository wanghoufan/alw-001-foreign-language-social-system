#!/usr/bin/env bash
# ALW-001 V0.4.0 combined service control.
# One process owns BOTH ports: 8790 Tencent ASR WebSocket + 8791 private UI/AI/SSE.
# Safe by design: only processes whose cwd is inside THIS repo are stopped.
set -uo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT" || exit 1
LOG_DIR="$ROOT/socialmate-v1.2/.local/qa"
PID_FILE="$LOG_DIR/live-v040.pid"
mkdir -p "$LOG_DIR"
AI_PORT="${SOCIALMATE_AI_PORT:-8791}"
ASR_PORT="${ASR_PORT:-8790}"
AI_URL="http://127.0.0.1:$AI_PORT"
ASR_URL="http://127.0.0.1:$ASR_PORT"
NODE_BIN=""
resolve_node() {
  local candidate
  if command -v node >/dev/null 2>&1; then NODE_BIN="$(command -v node)"; return 0; fi
  # CodeArts/tool shells often omit nvm from PATH; use the user's installed Node.
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node "$HOME/.volta/bin/node" \
                   /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then NODE_BIN="$candidate"; fi
  done
  [[ -n "$NODE_BIN" ]]
}

port_pid() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1
}
pid_cwd() {
  local raw
  raw="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  [[ -n "$raw" ]] || return 0
  # macOS lsof escapes non-ASCII bytes (e.g. Chinese folder names) as \xNN.
  python3 - "$raw" <<'PYEOF' 2>/dev/null || printf '%s\n' "$raw"
import sys
text=sys.argv[1]
try:
    print(text.encode("latin1").decode("unicode_escape").encode("latin1").decode("utf-8"))
except Exception:
    print(text)
PYEOF
}
pid_cmd() {
  ps -p "$1" -o command= 2>/dev/null | tr -d '\r'
}
owned_pid() {
  local pid="$1" cwd cmd
  [[ -n "$pid" ]] || return 1
  cwd="$(pid_cwd "$pid")"
  cmd="$(pid_cmd "$pid")"
  [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT"/* ]] || return 1
  [[ "$cmd" == *"$ROOT/socialmate-prototype/ai-gateway/live-server.mjs"* ||
     "$cmd" == *"socialmate-prototype/ai-gateway/live-server.mjs"* ]] && return 0
  # Old standalone services are also ours, and must be replaced by the combined one.
  [[ "$cwd" == "$ROOT/socialmate-prototype/ai-gateway" && "$cmd" == *"server.mjs"* ]] && return 0
  [[ "$cmd" == *"asr-bridge"* ]] && return 0
  return 1
}
describe_pid() {
  local pid="$1"
  echo "  pid=$pid"
  echo "  cmd=$(pid_cmd "$pid")"
  echo "  cwd=$(pid_cwd "$pid")"
  echo "  owned_by_this_repo=$(owned_pid "$pid" && echo yes || echo no)"
}
wait_port_free() {
  local port="$1" i
  for i in {1..40}; do
    [[ -z "$(port_pid "$port")" ]] && return 0
    sleep 0.25
  done
  return 1
}
stop_owned_pid() {
  local pid="$1" port="$2" i
  if ! owned_pid "$pid"; then
    echo "BLOCKED: port $port is held by a process that does NOT belong to this repo; refusing to kill it."
    describe_pid "$pid"
    return 3
  fi
  echo "Stopping project-owned process on $port: pid=$pid"
  kill -TERM "$pid" 2>/dev/null || true
  for i in {1..40}; do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    echo "Process $pid did not stop after 10s; sending SIGKILL (verified project-owned)."
    kill -KILL "$pid" 2>/dev/null || true
    sleep 0.5
  fi
  wait_port_free "$port" || { echo "BLOCKED: port $port is still in use."; return 3; }
  return 0
}
combined_healthy() {
  curl -fsS --max-time 3 "$AI_URL/api/asr/status" 2>/dev/null | grep -q '"combined":true'
}
health_summary() {
  echo "AI health:  $(curl -fsS --max-time 3 "$AI_URL/api/ai/health" 2>/dev/null || echo UNREACHABLE)"
  echo "ASR status: $(curl -fsS --max-time 3 "$AI_URL/api/asr/status" 2>/dev/null || echo UNREACHABLE)"
  echo "ASR health: $(curl -fsS --max-time 3 "$ASR_URL/health" 2>/dev/null || echo UNREACHABLE)"
}
status() {
  local p8791 p8790
  p8791="$(port_pid "$AI_PORT")"
  p8790="$(port_pid "$ASR_PORT")"
  echo "ALW-001 combined service status"
  if [[ -n "$p8791" ]]; then echo "8791 listener:"; describe_pid "$p8791"; else echo "8791 listener: none"; fi
  if [[ -n "$p8790" ]]; then echo "8790 listener:"; describe_pid "$p8790"; else echo "8790 listener: none"; fi
  if [[ -f "$PID_FILE" ]]; then echo "pid file: $(cat "$PID_FILE")"; else echo "pid file: none"; fi
  health_summary
  if combined_healthy; then echo "RESULT: combined service is healthy (ASR + AI in one process)."
  else echo "RESULT: combined service is NOT healthy."; fi
}
start_service() {
  local pid log now i
  local p
  p="$(port_pid "$AI_PORT")"
  if [[ -n "$p" ]]; then
    echo "Port $AI_PORT conflict found before start:"
    describe_pid "$p"
    stop_owned_pid "$p" "$AI_PORT" || return $?
  fi
  p="$(port_pid "$ASR_PORT")"
  if [[ -n "$p" ]]; then
    echo "Port $ASR_PORT conflict found before start:"
    describe_pid "$p"
    stop_owned_pid "$p" "$ASR_PORT" || return $?
  fi
  resolve_node || { echo "BLOCKED: Node.js not found (looked in PATH, nvm, Homebrew)"; return 2; }
  echo "Node: $NODE_BIN ($("$NODE_BIN" --version))"
  now="$(date '+%Y%m%d-%H%M%S')"
  log="$LOG_DIR/live-v040-$now.log"
  # CodeArts' agent-kernel exports NODE_TLS_REJECT_UNAUTHORIZED=0 into every tool
  # shell. Strip that inherited value here (never set it to 0 and never disable
  # verification); values coming from the Node env files are still rejected by
  # live-server.mjs after Node loads them.
  if [[ "${NODE_TLS_REJECT_UNAUTHORIZED:-}" == "0" ]]; then
    echo "Sanitized inherited NODE_TLS_REJECT_UNAUTHORIZED=0; certificate verification stays enabled."
    unset NODE_TLS_REJECT_UNAUTHORIZED
  fi
  echo "Starting combined ASR+AI service; log: $log"
  # 家庭 WiFi 模式：默认同时监听局域网，便于手机不插 USB 直连；来源仍限 RFC1918/回环。
  export SOCIALMATE_HOST="${SOCIALMATE_HOST:-0.0.0.0}"
  export HOST="$SOCIALMATE_HOST"
  # ASR 上游：有 P066 令牌就走 P066 流式中继；没有令牌保持腾讯直连，不静默降级。
  if [ -f "$ROOT/.local/p066-asr.env" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ROOT/.local/p066-asr.env"
    set +a
    export ASR_UPSTREAM="${ASR_UPSTREAM:-p066}"
  fi
  # 单次录音硬上限，避免一次长会话把总额度跑穿；仍受总预算约束。
  export ASR_BUDGET_CNY="${ASR_BUDGET_CNY:-2}"
  export ASR_MAX_SESSION_SECONDS="${ASR_MAX_SESSION_SECONDS:-300}"
  nohup "$NODE_BIN" \
    --env-file-if-exists=android-poc/asr-bridge/.env \
    --env-file-if-exists=socialmate-prototype/ai-gateway/.env \
    --env-file-if-exists=.local/aws-polly.env \
    socialmate-prototype/ai-gateway/live-server.mjs \
    </dev/null >"$log" 2>&1 &
  echo $! >"$PID_FILE"
  for i in {1..40}; do
    pid="$(cat "$PID_FILE")"
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "BLOCKED: combined service exited during startup."
      tail -n 40 "$log"
      return 3
    fi
    if combined_healthy && curl -fsS --max-time 2 "$ASR_URL/health" >/dev/null 2>&1; then
      echo "READY: combined ASR+AI service on pid=$pid"
      health_summary
      return 0
    fi
    sleep 0.5
  done
  echo "BLOCKED: combined service did not become healthy within 20s."
  tail -n 40 "$log"
  return 3
}
ensure_service() {
  local pid
  if combined_healthy && curl -fsS --max-time 2 "$ASR_URL/health" >/dev/null 2>&1; then
    echo "OK: combined ASR+AI service already healthy; reusing it (no duplicate start)."
    health_summary
    return 0
  fi
  # 8791 may be the old AI-only server. It has no /api/asr/status capability.
  pid="$(port_pid "$AI_PORT")"
  if [[ -n "$pid" ]]; then
    if owned_pid "$pid"; then
      echo "Detected a project service without combined ASR capability; replacing it."
      describe_pid "$pid"
      stop_owned_pid "$pid" "$AI_PORT" || return $?
    else
      echo "BLOCKED: 8791 is used by a process outside this repo."
      describe_pid "$pid"
      return 3
    fi
  fi
  pid="$(port_pid "$ASR_PORT")"
  if [[ -n "$pid" ]]; then
    if owned_pid "$pid"; then
      echo "Detected a leftover project ASR listener on 8790; stopping it."
      describe_pid "$pid"
      stop_owned_pid "$pid" "$ASR_PORT" || return $?
    else
      echo "BLOCKED: 8790 is used by a process outside this repo."
      describe_pid "$pid"
      return 3
    fi
  fi
  start_service
}
stop_service() {
  local pid p
  if [[ -f "$PID_FILE" ]]; then
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      stop_owned_pid "$pid" "$AI_PORT" || return $?
    fi
  fi
  for p in $(port_pid "$AI_PORT") $(port_pid "$ASR_PORT"); do
    [[ -n "$p" ]] || continue
    stop_owned_pid "$p" "$AI_PORT" || return $?
  done
  rm -f "$PID_FILE"
  echo "STOPPED: no project-owned combined service is listening."
  return 0
}

case "${1:-status}" in
  status) status ;;
  start) start_service ;;
  ensure) ensure_service ;;
  stop) stop_service ;;
  restart) stop_service && start_service ;;
  *) echo "Usage: $0 {status|ensure|start|stop|restart}"; exit 2 ;;
esac