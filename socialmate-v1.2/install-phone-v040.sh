#!/usr/bin/env bash
# Install V0.4.0 without clearing data; start/reuse the combined ASR+AI service;
# forward both ports and launch the selected phone explicitly.
#
# Usage:
#   bash socialmate-v1.2/install-phone-v040.sh [--serial <ADB_SERIAL>] [--skip-install]
#   SOCIALMATE_SERIAL=<ADB_SERIAL> bash socialmate-v1.2/install-phone-v040.sh
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
APK="android-poc/app/build/outputs/apk/debug/app-debug.apk"
LOG_DIR="socialmate-v1.2/.local/qa"
mkdir -p "$LOG_DIR"
INSTALL_LOG="$LOG_DIR/phone-install-$(date '+%Y%m%d-%H%M%S').log"
exec > >(tee -a "$INSTALL_LOG") 2>&1
echo "Phone installation log: $INSTALL_LOG"

WANT_SERIAL="${SOCIALMATE_SERIAL:-}"
SKIP_INSTALL=0
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --serial) WANT_SERIAL="${2:-}"; shift 2 ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    --help|-h) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "BLOCKED: unknown argument $1"; exit 2 ;;
  esac
done

if [[ "$SKIP_INSTALL" -eq 0 && ! -s "$APK" ]]; then
  echo "BLOCKED: APK not found; run bash socialmate-v1.2/verify-v040.sh"; exit 2
fi

ADB=""
if command -v adb >/dev/null 2>&1; then ADB="$(command -v adb)"; fi
if [[ -z "$ADB" && -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/platform-tools/adb" ]]; then ADB="${ANDROID_HOME}/platform-tools/adb"; fi
if [[ -z "$ADB" && -x "$HOME/android-toolchain/sdk/platform-tools/adb" ]]; then ADB="$HOME/android-toolchain/sdk/platform-tools/adb"; fi
if [[ -z "$ADB" && -x "/opt/homebrew/bin/adb" ]]; then ADB="/opt/homebrew/bin/adb"; fi
if [[ -z "$ADB" ]]; then
  echo "BLOCKED: adb not found; Android SDK platform-tools required"; exit 2
fi
echo "ADB: $ADB"
DEVICES="$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1}')"
COUNT="$(printf "%s\n" "$DEVICES" | grep -c . || true)"
if [[ "$COUNT" -eq 0 ]]; then
  echo "BLOCKED: no authorized Android phone detected."
  "$ADB" devices -l
  echo "Connect your Redmi by USB, enable USB debugging, then approve this Mac on the phone."
  echo "Run the same command again after approval."; exit 2
fi
PHONE_SERIALS=()
while IFS= read -r line; do
  [[ -n "$line" ]] && PHONE_SERIALS+=("$line")
done <<< "$DEVICES"
SERIAL=""
if [[ -n "$WANT_SERIAL" ]]; then
  for device in "${PHONE_SERIALS[@]}"; do
    [[ "$device" == "$WANT_SERIAL" ]] && SERIAL="$device"
  done
  if [[ -z "$SERIAL" ]]; then
    echo "BLOCKED: requested serial $WANT_SERIAL is not an authorized device."
    "$ADB" devices -l; exit 2
  fi
  echo "Selected phone by explicit serial: $SERIAL"
elif [[ "$COUNT" -eq 1 ]]; then
  SERIAL="${PHONE_SERIALS[0]}"
else
  echo "Mac detected $COUNT authorized phones. Choose the one to install SocialMate:"
  i=1
  for device in "${PHONE_SERIALS[@]}"; do
    DEVICE_MODEL="$("$ADB" -s "$device" shell getprop ro.product.model | tr -d '\r')"
    DEVICE_NAME="$("$ADB" -s "$device" shell getprop ro.product.marketname | tr -d '\r')"
    [[ -n "$DEVICE_NAME" ]] || DEVICE_NAME="$DEVICE_MODEL"
    echo "  $i) $DEVICE_NAME [model: $DEVICE_MODEL; serial: $device]"
    i=$((i+1))
  done
  if [[ ! -t 0 ]]; then
    echo "BLOCKED: non-interactive terminal; pass --serial <ADB_SERIAL> (or SOCIALMATE_SERIAL)."
    echo "Example: bash socialmate-v1.2/install-phone-v040.sh --serial <note11-serial>"
    exit 2
  fi
  echo
  read -r -p "输入要安装的手机编号 (1-$COUNT): " PICK
  if [[ ! "$PICK" =~ ^[1-9][0-9]*$ ]] || (( PICK < 1 || PICK > COUNT )); then
    echo "CANCELLED: invalid selection; nothing was installed."
    exit 2
  fi
  SERIAL="${PHONE_SERIALS[PICK-1]}"
  echo "Selected phone $PICK of $COUNT."
fi
MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')"
echo "Phone: $MODEL [serial: $SERIAL]"
if [[ "$SKIP_INSTALL" -eq 0 ]]; then
  echo "APK sha256:"; shasum -a 256 "$APK"
  echo "Installing without clearing app data..."
  "$ADB" -s "$SERIAL" install -r "$APK"
else
  echo "Skipping APK install by request (existing app data preserved)."
fi
INSTALLED_VERSION="$("$ADB" -s "$SERIAL" shell dumpsys package app.socialmate.dualmic | awk -F= '/versionName=/{print $2; exit}' | tr -d ' \r')"
echo "Installed versionName: ${INSTALLED_VERSION:-unknown}"

echo "--- Combined service (single process owns 8790 ASR + 8791 AI/UI) ---"
bash socialmate-v1.2/service-v040.sh ensure
if ! curl -fsS --max-time 3 "http://127.0.0.1:8791/api/asr/status" | grep -q '"combined":true'; then
  echo "BLOCKED: 8791 is not the combined service (old AI-only process still running?)."
  bash socialmate-v1.2/service-v040.sh status
  exit 3
fi
if ! curl -fsS --max-time 3 "http://127.0.0.1:8790/health" >/dev/null; then
  echo "BLOCKED: 8790 ASR health failed after service ensure."; exit 3
fi

echo "--- ADB reverse for this phone only ($SERIAL) ---"
"$ADB" -s "$SERIAL" reverse tcp:8790 tcp:8790
"$ADB" -s "$SERIAL" reverse tcp:8791 tcp:8791
REVERSES="$("$ADB" -s "$SERIAL" reverse --list)"
echo "$REVERSES"
for port in 8790 8791; do
  if ! grep -q "tcp:$port tcp:$port" <<< "$REVERSES"; then
    echo "BLOCKED: adb reverse for $port is missing."; exit 3
  fi
done

echo "--- Launching SocialMate ---"
"$ADB" -s "$SERIAL" shell am force-stop app.socialmate.dualmic
"$ADB" -s "$SERIAL" shell am start -W -n app.socialmate.dualmic/.MainActivity
sleep 2
PID="$("$ADB" -s "$SERIAL" shell pidof app.socialmate.dualmic | tr -d '\r')"
if [[ -z "$PID" ]]; then
  echo "BLOCKED: app process is not running after launch."
  "$ADB" -s "$SERIAL" logcat -d -t 200 | grep -E "FATAL EXCEPTION|AndroidRuntime" || true
  exit 4
fi
RESUMED="$("$ADB" -s "$SERIAL" shell dumpsys activity activities | grep -m1 'mResumedActivity' | tr -d '\r')"
echo "App pid: $PID"
echo "Resumed: $RESUMED"
if ! grep -q "app.socialmate.dualmic" <<< "$RESUMED"; then
  echo "WARN: SocialMate is not the resumed activity; phone may have opened another screen."
fi
CRASH="$("$ADB" -s "$SERIAL" logcat -d -t 400 | grep -E 'FATAL EXCEPTION|AndroidRuntime.*app.socialmate' || true)"
if [[ -n "$CRASH" ]]; then
  echo "BLOCKED: crash lines found:"; echo "$CRASH"; exit 4
fi

echo "--- Health summary (no keys shown) ---"
curl -sS --max-time 3 "http://127.0.0.1:8790/health"; echo
curl -sS --max-time 3 "http://127.0.0.1:8791/api/asr/status"; echo
echo ""
echo "V0.4.0 APK installed/launched; service is the combined ASR+AI process."
echo "New UI quick acceptance (real user consent required before mic/AI):"
echo "1. Open SocialMate home and tap 开始实时对话."
echo "2. Confirm both people consent to recording; tap 开始实时对话 on the recording screen."
echo "3. The embedded conversation page opens automatically; verify live captions and Hainan cards."
echo "4. Text is sent to DeepSeek only after separate in-chat cloud-AI consent."
echo "5. Tap 停止录音 in the chat toolbar. Confirm ASR activeSessions returns to 0."
echo "6. BOYA input/channel diagnostics stay under 录音设备检测与高级工具."
echo "7. This is an ADB reverse DEV build: removing USB disables the bridge; it is not an outside-use release."
