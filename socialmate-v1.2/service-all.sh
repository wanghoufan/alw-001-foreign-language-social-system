#!/usr/bin/env bash
# ALW-001 N04 V1.3 T4｜四端口统一健康检查 / 自愈 / 开机自启。
#
# 覆盖端口（全部只绑 127.0.0.1，经 Tailscale Serve 或 adb reverse 进入）：
#   8790  腾讯 ASR WebSocket 桥（由 service-v040.sh 统一进程托管）
#   8791  私有 UI / AI / SSE   （同上，一个进程两个端口）
#   8781  正式归档接收端       （archive-service.sh）
#   8782  演示归档接收端       （demo-archive-service.sh，仅服务端到服务端）
#
# 用法：
#   bash socialmate-v1.2/service-all.sh health [--json]   只检查，不修改
#   bash socialmate-v1.2/service-all.sh heal [--quiet]    只修复不健康的项目自有服务
#   bash socialmate-v1.2/service-all.sh up / down / status
#   bash socialmate-v1.2/service-all.sh watch             看门狗循环（LaunchAgent 用）
#   bash socialmate-v1.2/service-all.sh agent-install|agent-status|agent-uninstall
#
# 红线：只停止/重启 cwd 在本仓库内、且命令行匹配本项目入口的进程；
#       端口被外部进程占用时只报告 BLOCKED，绝不 kill。
set -uo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
LOCAL="$ROOT/socialmate-v1.2/.local"
QA_DIR="$LOCAL/qa"
AGENT_LABEL="com.alw.socialmate-stack"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"
STACK_LOG="$QA_DIR/stack.log"
mkdir -p "$QA_DIR"
# 统一工作目录：LaunchAgent 的初始 cwd 是 /，子进程要落在仓库里才好判定归属。
cd "$ROOT" || exit 1

# launchd 的 PATH 只有 /usr/bin:/bin:/usr/sbin:/sbin，node 可能不在里面。
# 统一在这里解析一次并前置到 PATH，三个子脚本都继承同一份。
resolve_node_path() {
  local candidate dir
  if command -v node >/dev/null 2>&1; then
    dirname "$(command -v node)"; return 0
  fi
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node \
                   "$HOME"/.workbuddy/binaries/node/versions/*/bin/node \
                   "$HOME/.volta/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then dirname "$candidate"; return 0; fi
  done
  return 1
}
NODE_DIR="$(resolve_node_path || true)"
if [[ -n "$NODE_DIR" ]]; then PATH="$NODE_DIR:$PATH"; export PATH; fi

log() {
  local line
  line="$(date '+%Y-%m-%dT%H:%M:%S%z') $*"
  printf '%s\n' "$line"
  printf '%s\n' "$line" >>"$STACK_LOG"
}

# 端口归属：pid -> cwd + 命令行，只有本仓库的项目入口才算「自己的」。
port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -n 1; }
pid_cwd() {
  local raw
  raw="$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -n 1)"
  [[ -n "$raw" ]] || return 0
  python3 - "$raw" <<'PYEOF' 2>/dev/null || printf '%s\n' "$raw"
import sys
text = sys.argv[1]
try:
    print(text.encode("latin1").decode("unicode_escape").encode("latin1").decode("utf-8"))
except Exception:
    print(text)
PYEOF
}
pid_cmd() { ps -p "$1" -o command= 2>/dev/null | tr -d '\r'; }
owned_pid() {
  local pid="$1" cwd cmd
  [[ -n "$pid" ]] || return 1
  cwd="$(pid_cwd "$pid")"; cmd="$(pid_cmd "$pid")"
  # launchd 启动的 job 初始 cwd 是 /，子进程可能不在仓库目录里；
  # 因此「命令行里带本仓库绝对入口路径」同样算自有进程（路径本身就是本仓库）。
  [[ "$cmd" == *"$ROOT/socialmate-prototype/ai-gateway/live-server.mjs"* ]] && return 0
  [[ "$cmd" == *"$ROOT/socialmate-prototype/ai-gateway/archive-receiver.mjs"* ]] && return 0
  [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT"/* ]] || return 1
  [[ "$cmd" == *"socialmate-prototype/ai-gateway/live-server.mjs"* ]] && return 0
  [[ "$cmd" == *"socialmate-prototype/ai-gateway/archive-receiver.mjs"* ]] && return 0
  return 1
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$1" 2>/dev/null; }
http_has() { curl -fsS --max-time 3 "$1" 2>/dev/null | grep -q -- "$2"; }

# 单端口健康：返回 0/1，并回填 DETAIL。
DETAIL=""
check_port() {
  local port="$1" pid
  case "$port" in
    8790)
      pid="$(port_pid 8790)"
      if [[ -z "$pid" ]]; then DETAIL="no listener"; return 1; fi
      if ! owned_pid "$pid"; then DETAIL="BLOCKED foreign pid=$pid cwd=$(pid_cwd "$pid")"; return 2; fi
      http_has "http://127.0.0.1:8790/health" '"ok":true' || { DETAIL="health failed"; return 1; }
      DETAIL="tencent-asr pid=$pid"; return 0 ;;
    8791)
      pid="$(port_pid 8791)"
      if [[ -z "$pid" ]]; then DETAIL="no listener"; return 1; fi
      if ! owned_pid "$pid"; then DETAIL="BLOCKED foreign pid=$pid cwd=$(pid_cwd "$pid")"; return 2; fi
      http_has "http://127.0.0.1:8791/api/ai/health" '"ok":true' || { DETAIL="ai health failed"; return 1; }
      http_has "http://127.0.0.1:8791/api/asr/status" '"combined":true' || { DETAIL="not combined ASR+AI"; return 1; }
      DETAIL="private-ui+ai pid=$pid"; return 0 ;;
    8781)
      pid="$(port_pid 8781)"
      if [[ -z "$pid" ]]; then DETAIL="no listener"; return 1; fi
      if ! owned_pid "$pid"; then DETAIL="BLOCKED foreign pid=$pid cwd=$(pid_cwd "$pid")"; return 2; fi
      http_has "http://127.0.0.1:8781/health" '"service":"socialmate-archive"' || { DETAIL="health failed"; return 1; }
      DETAIL="archive pid=$pid"; return 0 ;;
    8782)
      pid="$(port_pid 8782)"
      if [[ -z "$pid" ]]; then DETAIL="no listener"; return 1; fi
      if ! owned_pid "$pid"; then DETAIL="BLOCKED foreign pid=$pid cwd=$(pid_cwd "$pid")"; return 2; fi
      http_has "http://127.0.0.1:8782/health" '"service":"socialmate-archive"' || { DETAIL="health failed"; return 1; }
      DETAIL="demo-archive pid=$pid"; return 0 ;;
    *) DETAIL="unknown port"; return 1 ;;
  esac
}

PORTS=(8790 8791 8781 8782)
UNHEALTHY=()
FOREIGN=()
collect_health() {
  UNHEALTHY=(); FOREIGN=(); DETAILS=()
  local p rc
  for p in "${PORTS[@]}"; do
    check_port "$p"; rc=$?
    DETAILS+=("$p|$rc|$DETAIL")
    [[ "$rc" -eq 1 ]] && UNHEALTHY+=("$p")
    [[ "$rc" -eq 2 ]] && FOREIGN+=("$p")
  done
}

print_health_table() {
  local row p rc detail state
  for row in "${DETAILS[@]}"; do
    IFS='|' read -r p rc detail <<<"$row"
    case "$rc" in
      0) state="OK    " ;;
      1) state="DOWN  " ;;
      *) state="BLOCKED" ;;
    esac
    printf '  %-8s %s %s\n' "$p" "$state" "$detail"
  done
}

health_json() {
  local rows="" row p rc detail
  for row in "${DETAILS[@]}"; do
    IFS='|' read -r p rc detail <<<"$row"
    rows+="$p"$'\t'"$rc"$'\t'"$detail"$'\n'
  done
  printf '%s' "$rows" | python3 -c '
import json, sys, time
ports = {"8790": "asr-ws", "8791": "private-ui-ai", "8781": "archive", "8782": "demo-archive"}
items = []
for line in sys.stdin.read().splitlines():
    if not line.strip():
        continue
    port, rc, detail = line.split("\t")
    rc = int(rc)
    items.append({
        "port": int(port),
        "service": ports.get(port, "?"),
        "ok": rc == 0,
        "blocked": rc == 2,
        "detail": detail,
    })
print(json.dumps({
    "ok": all(i["ok"] for i in items),
    "blockedAny": any(i["blocked"] for i in items),
    "checkedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    "ports": items,
}, ensure_ascii=False))
'
}

cmd_health() {
  local json_flag=0
  [[ "${1:-}" == "--json" ]] && json_flag=1
  collect_health
  if [[ "$json_flag" -eq 1 ]]; then
    health_json
  else
    echo "ALW-001 服务健康检查 $(date '+%Y-%m-%d %H:%M:%S')"
    print_health_table
    if [[ ${#FOREIGN[@]} -gt 0 ]]; then
      echo "RESULT: BLOCKED（端口被本仓库外的进程占用：${FOREIGN[*]}，不处理）"
      return 2
    fi
    if [[ ${#UNHEALTHY[@]} -gt 0 ]]; then
      echo "RESULT: UNHEALTHY（${UNHEALTHY[*]}）"
      return 1
    fi
    echo "RESULT: HEALTHY（4/4）"
  fi
  if [[ ${#FOREIGN[@]} -gt 0 ]]; then return 2; fi
  [[ ${#UNHEALTHY[@]} -eq 0 ]]
}

heal_one() {
  local port="$1"
  case "$port" in
    8790|8791) bash "$ROOT/socialmate-v1.2/service-v040.sh" ensure ;;
    8781)      bash "$ROOT/socialmate-v1.2/archive-service.sh" ensure ;;
    8782)      bash "$ROOT/socialmate-v1.2/demo-archive-service.sh" ensure ;;
  esac
}

cmd_heal() {
  local quiet="${1:-}" restored=0
  collect_health
  if [[ ${#FOREIGN[@]} -gt 0 ]]; then
    log "BLOCKED: 端口 ${FOREIGN[*]} 被本仓库外进程占用，本次不做任何替换。"
    [[ "$quiet" == "--quiet" ]] || print_health_table
    return 2
  fi
  if [[ ${#UNHEALTHY[@]} -eq 0 ]]; then
    [[ "$quiet" == "--quiet" ]] || echo "OK: 4/4 端口健康，无需修复。"
    return 0
  fi
  local port
  for port in "${UNHEALTHY[@]}"; do
    log "HEAL: 端口 $port 不健康，调用该端口的既有启动脚本恢复"
    heal_one "$port"
    restored=$((restored + 1))
  done
  sleep 1
  collect_health
  if [[ ${#UNHEALTHY[@]} -eq 0 && ${#FOREIGN[@]} -eq 0 ]]; then
    log "HEAL: 完成，4/4 恢复健康（本次重新拉起 $restored 个端口）"
    [[ "$quiet" == "--quiet" ]] || print_health_table
    return 0
  fi
  log "HEAL: 未能全部恢复（仍不健康：${UNHEALTHY[*]:-none}，blocked：${FOREIGN[*]:-none}）"
  print_health_table
  return 1
}

cmd_up() { cmd_heal "${1:-}"; }

cmd_down() {
  bash "$ROOT/socialmate-v1.2/service-v040.sh" stop || return $?
  bash "$ROOT/socialmate-v1.2/archive-service.sh" stop || return $?
  bash "$ROOT/socialmate-v1.2/demo-archive-service.sh" stop || return $?
  log "DOWN: 四个端口已按项目脚本停止（只停本项目进程）"
}

cmd_status() {
  collect_health
  echo "ALW-001 stack status $(date '+%Y-%m-%d %H:%M:%S')"
  print_health_table
  if launchctl print "gui/$(id -u)/$AGENT_LABEL" >/dev/null 2>&1; then
    echo "  LaunchAgent: loaded ($AGENT_LABEL)"
  else
    echo "  LaunchAgent: not loaded ($AGENT_LABEL)"
  fi
  tail -n 5 "$STACK_LOG" 2>/dev/null | sed 's/^/  log| /'
}

cmd_watch() {
  local stop=0 child
  local la_interval="${LEARNING_ARCHIVE_INTERVAL:-300}"
  local la_next=0
  trap 'stop=1' TERM INT
  log "WATCH: supervisor 启动 (pid=$$), 每 ${WATCH_INTERVAL:-20}s 巡检一次；学习资料索引每 ${la_interval}s 一轮"
  # 让 launchd 在退出时也收走子进程：子进程用 nohup 起，不绑定本 shell 生命周期。
  while [[ "$stop" -eq 0 ]]; do
    cmd_heal --quiet || true
    if [[ -f "$ROOT/socialmate-prototype/ai-gateway/learning-archive-worker.mjs" ]]; then
      local la_now
      la_now="$(date +%s)"
      if (( la_now >= la_next )); then
        # 归档已由独立 LaunchAgent（com.alw.learning-archive-watch）承担时不再重复调度，
        # 避免两个扫描器互相抢 run.lock / 产生重复 run 记录。
        if launchctl print "gui/$(id -u)/com.alw.learning-archive-watch" >/dev/null 2>&1; then
          la_next=$(( la_now + la_interval ))
        else
          ( node "$ROOT/socialmate-prototype/ai-gateway/learning-archive-worker.mjs" --once --quiet \
              >>"$QA_DIR/learning-archive.log" 2>&1 || true ) &
          la_next=$(( la_now + la_interval ))
        fi
      fi
    fi
    for ((i = 0; i < ${WATCH_INTERVAL:-20}; i++)); do
      [[ "$stop" -eq 1 ]] && break
      sleep 1
    done
  done
  log "WATCH: supervisor 收到停止信号，退出（不动已健康的子服务）"
  exit 0
}

agent_plist() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$ROOT/socialmate-v1.2/service-all.sh</string>
    <string>watch</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>${NODE_DIR:-/usr/local/bin}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$QA_DIR/stack-agent.out.log</string>
  <key>StandardErrorPath</key><string>$QA_DIR/stack-agent.err.log</string>
</dict>
</plist>
PLIST
}

cmd_agent_install() {
  mkdir -p "$HOME/Library/LaunchAgents"
  agent_plist >"$AGENT_PLIST"
  launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
  # bootout 之后 launchd 需要一点时间释放旧 job，立即 bootstrap 会返回 EIO；最多重试 5 次。
  local i loaded=0
  for i in {1..5}; do
    sleep 1
    if launchctl bootstrap "gui/$(id -u)" "$AGENT_PLIST" 2>/dev/null \
       && launchctl print "gui/$(id -u)/$AGENT_LABEL" >/dev/null 2>&1; then
      loaded=1; break
    fi
  done
  if [[ "$loaded" -eq 1 ]]; then
    log "AGENT: 已安装并加载 ${AGENT_LABEL}（开机自动运行、崩溃自动重启）"
  else
    launchctl load -w "$AGENT_PLIST" 2>/dev/null || {
      echo "BLOCKED: LaunchAgent 加载失败（${AGENT_PLIST}）"; return 3; }
    log "AGENT: legacy load -w 方式加载 ${AGENT_LABEL}"
  fi
  sleep 2
  launchctl print "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null | sed -n '1,6p'
  launchctl print "gui/$(id -u)/$AGENT_LABEL" >/dev/null 2>&1 || { echo "BLOCKED: agent 未加载"; return 3; }
  return 0
}

cmd_agent_status() {
  if launchctl print "gui/$(id -u)/$AGENT_LABEL" >/dev/null 2>&1; then
    launchctl print "gui/$(id -u)/$AGENT_LABEL" | grep -E '^\s*(state|pid|program|last exit code)' || true
    return 0
  fi
  echo "LaunchAgent not loaded"; return 1
}

cmd_agent_uninstall() {
  launchctl bootout "gui/$(id -u)/$AGENT_LABEL" 2>/dev/null || true
  launchctl unload -w "$AGENT_PLIST" 2>/dev/null || true
  rm -f "$AGENT_PLIST"
  log "AGENT: 已卸载 $AGENT_LABEL"
}

case "${1:-status}" in
  health)          shift; cmd_health "${1:-}" ;;
  heal|up)         shift; cmd_heal "${1:-}" ;;
  down)            cmd_down ;;
  status)          cmd_status ;;
  watch)           cmd_watch ;;
  learning-archive)
                   shift
                   node "$ROOT/socialmate-prototype/ai-gateway/learning-archive-worker.mjs" "$@" ;;
  agent-install)   cmd_agent_install ;;
  agent-status)    cmd_agent_status ;;
  agent-uninstall) cmd_agent_uninstall ;;
  *)
    echo "usage: $0 {health [--json]|heal [--quiet]|up|down|status|watch|learning-archive <args>|agent-install|agent-status|agent-uninstall}"
    exit 2 ;;
esac
