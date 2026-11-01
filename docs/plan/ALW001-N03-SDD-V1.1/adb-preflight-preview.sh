#!/usr/bin/env bash
# ALW-001 N03 SDD V1.1 safe Android prebuild + wired ADB preview
# Never runs uninstall/pm clear, never installs to guessed device when several connected.
set -eo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
ROOT="$PROJECT_ROOT"
if [ -z "$ROOT" ]; then ROOT="$(cd "$D/../../.." && pwd)"; fi
APP="$ROOT/android-poc"
if [ ! -d "$APP/app" ]; then echo "[BLOCKED] Invalid project root: $ROOT" >&2; exit 2; fi
if [ -z "$JAVA_HOME" ] && [ -d "$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home" ]; then export JAVA_HOME="$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home"; fi
if [ -n "$JAVA_HOME" ]; then export PATH="$JAVA_HOME/bin:$PATH"; fi
if [ -z "$ANDROID_HOME" ] && [ -d "$HOME/android-toolchain/sdk" ]; then export ANDROID_HOME="$HOME/android-toolchain/sdk"; fi
if [ -n "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then export ANDROID_SDK_ROOT="$ANDROID_HOME"; fi
ADB="$(command -v adb || true)"
if [ -z "$ADB" ] && [ -x "$HOME/android-toolchain/sdk/platform-tools/adb" ]; then ADB="$HOME/android-toolchain/sdk/platform-tools/adb"; fi
if [ -z "$ADB" ]; then echo "[BLOCKED] ADB not found" >&2; exit 3; fi
OUT="$ROOT/socialmate-v1.2/.local/qa"; mkdir -p "$OUT"
STAMP="$(date '+%Y%m%d-%H%M%S')"
LOG="$OUT/n03-sdd-v11-prebuild-$STAMP.log"
exec > >(tee -a "$LOG") 2>&1
echo "[N03] project: $ROOT"
"$ADB" devices -l
ONLINE="$("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}')"
if [ -n "$ADB_SERIAL" ]; then
  SERIAL="$ADB_SERIAL"
  printf '%s\n' "$ONLINE" | grep -Fxq "$SERIAL" || { echo "[BLOCKED] Specified ADB_SERIAL is not an authorized online device"; exit 4; }
else
  COUNT="$(printf '%s\n' "$ONLINE" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$COUNT" != 1 ]; then echo "[BLOCKED] Choose an authorized target using ADB_SERIAL; never guess"; exit 5; fi
  SERIAL="$ONLINE"
fi
MODEL="$("$ADB" -s "$SERIAL" shell getprop ro.product.model | tr -d '\r')"
echo "[ADB] verified serial $SERIAL model $MODEL"
echo "[N03] Stage0: core test and debug APK prebuild"
(cd "$APP" && bash ./test-core.sh && bash ./build-apk.sh)
APK="$APP/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -s "$APK" ]; then echo "[ERROR] Debug APK not produced"; exit 6; fi
shasum -a 256 "$APK"
echo "[N03] install -r, preserve phone app data"
"$ADB" -s "$SERIAL" install -r "$APK" || { echo "[BLOCKED] Install failed; preserve old version and report precise error"; exit 7; }
"$ADB" -s "$SERIAL" shell am start -n app.socialmate.dualmic/.MainActivity
sleep 2
"$ADB" -s "$SERIAL" exec-out screencap -p > "$OUT/n03-sdd-v11-preview-$STAMP.png"
"$ADB" -s "$SERIAL" shell dumpsys package app.socialmate.dualmic | grep -E '(versionName|versionCode)' | head -5 || true
echo "[PASS] APK prebuild, install and phone screenshot; log=$LOG"
echo "[N03] Subsequent Java/XML native changes require re-build, install -r and screenshot; private WebView change may refresh private UI only."
