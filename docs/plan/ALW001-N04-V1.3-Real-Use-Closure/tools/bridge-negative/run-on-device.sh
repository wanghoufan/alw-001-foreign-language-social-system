#!/usr/bin/env bash
# T1-2 真机负例：跨源 iframe / 未知 origin 页面不得拿到原生桥。
#
# 步骤：起两个测试 origin → adb reverse → 临时把 App 的 ui_url 指到替身页 →
# 冷启动 → 收集页面回报 → 还原配置并核对。全程只改本机调试用的 ui_url，不动业务数据。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
SERIAL="${SM_TEST_DEVICE:-REDACTED-SERIAL}"
QA="${1:-$ROOT/docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/$(date +%Y%m%d-%H%M%S)}"
PKG="app.socialmate.dualmic"
UI_PORT=18792
EVIL_PORT=18793
REPORT="$QA/bridge-negative-report.ndjson"
SRV="$ROOT/docs/plan/ALW001-N04-V1.3-Real-Use-Closure/tools/bridge-negative/serve.mjs"
mkdir -p "$QA"
: > "$REPORT"

cleanup() {
  [[ -n "${SRV_PID:-}" ]] && kill "$SRV_PID" 2>/dev/null || true
  adb -s "$SERIAL" reverse --remove tcp:$UI_PORT >/dev/null 2>&1 || true
  adb -s "$SERIAL" reverse --remove tcp:$EVIL_PORT >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[1/6] 记录原始 App 配置"
ORIG_PREFS="$QA/app-config-before.xml"
adb -s "$SERIAL" shell run-as "$PKG" cat shared_prefs/socialmate-config.xml > "$ORIG_PREFS" 2>/dev/null || true
cat "$ORIG_PREFS"

echo "[2/6] 启动测试 origin: 私有替身 ${UI_PORT} / 攻击者 ${EVIL_PORT}"
node "$SRV" --report "$REPORT" --ui-port "$UI_PORT" --evil-port "$EVIL_PORT" > "$QA/bridge-negative-server.log" 2>&1 &
SRV_PID=$!
sleep 1

echo "[3/6] adb reverse 两个测试端口"
adb -s "$SERIAL" reverse "tcp:$UI_PORT" "tcp:$UI_PORT"
adb -s "$SERIAL" reverse "tcp:$EVIL_PORT" "tcp:$EVIL_PORT"

echo "[4/6] 只改 ui_url 指向替身页（其余配置不动）"
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" shell "run-as $PKG sh -c 'cat > shared_prefs/socialmate-config.xml'" <<XML
<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <boolean name="ui_en" value="true" />
    <string name="ui_url">http://127.0.0.1:$UI_PORT</string>
</map>
XML

echo "[5/6] 冷启动并等待页面回报"
# AsrActivity 未导出，必须从 launcher 入口启动（monkey 走 MAIN/LAUNCHER）。
adb -s "$SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 12
adb -s "$SERIAL" shell appops get "$PKG" RECORD_AUDIO > "$QA/bridge-negative-appops.txt" 2>&1 || true
adb -s "$SERIAL" shell dumpsys activity activities 2>/dev/null | grep -ciE "documentsui|com.android.documentsui" > "$QA/bridge-negative-saf-count.txt" || true
adb -s "$SERIAL" shell dumpsys activity top 2>/dev/null | grep -E "ACTIVITY|mResumed" | head -5 > "$QA/bridge-negative-activity.txt" || true
adb -s "$SERIAL" logcat -d -t 400 2>/dev/null | grep -iE "chromium|cr_|WebView" | tail -40 > "$QA/bridge-negative-logcat.txt" || true

echo "[6/6] 还原配置并重启到正常私有 UI"
adb -s "$SERIAL" shell am force-stop "$PKG"
adb -s "$SERIAL" shell "run-as $PKG sh -c 'cat > shared_prefs/socialmate-config.xml'" < "$ORIG_PREFS"
adb -s "$SERIAL" reverse tcp:8790 tcp:8790 >/dev/null 2>&1 || true
adb -s "$SERIAL" reverse tcp:8791 tcp:8791 >/dev/null 2>&1 || true
adb -s "$SERIAL" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null

echo "报告：$REPORT"
cat "$REPORT"
