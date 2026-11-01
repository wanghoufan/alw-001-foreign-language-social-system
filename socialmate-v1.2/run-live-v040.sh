#!/usr/bin/env bash
# ALW-001 combined ASR + AI + HTML preview.
# V0.4.0: always go through service-v040.sh so an old AI-only process is
# detected and replaced safely; never start a duplicate listener.
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

if [[ "$#" -gt 0 && "$1" == "--phone" ]]; then
  ADB="$(command -v adb || true)"
  if [[ -z "$ADB" && -n "${ANDROID_HOME:-}" && -x "${ANDROID_HOME}/platform-tools/adb" ]]; then ADB="${ANDROID_HOME}/platform-tools/adb"; fi
  if [[ -z "$ADB" && -x "$HOME/android-toolchain/sdk/platform-tools/adb" ]]; then ADB="$HOME/android-toolchain/sdk/platform-tools/adb"; fi
  if [[ -z "$ADB" && -x "/opt/homebrew/bin/adb" ]]; then ADB="/opt/homebrew/bin/adb"; fi
  [[ -n "$ADB" ]] || { echo "BLOCKED: adb is missing"; exit 2; }
  SERIAL="${SOCIALMATE_SERIAL:-}"
  if [[ -z "$SERIAL" ]]; then
    DEVICES="$("$ADB" devices | awk 'NR>1 && $2=="device" && $1 !~ /^emulator-/ {print $1}')"
    COUNT="$(printf "%s\n" "$DEVICES" | grep -c . || true)"
    if [[ "$COUNT" -ne 1 ]]; then
      echo "BLOCKED: set SOCIALMATE_SERIAL when zero or multiple phones are attached."
      "$ADB" devices -l
      exit 2
    fi
    SERIAL="$DEVICES"
  fi
  "$ADB" -s "$SERIAL" reverse tcp:8790 tcp:8790
  "$ADB" -s "$SERIAL" reverse tcp:8791 tcp:8791
  echo "Android adb reverse ready for $SERIAL: 8790 ASR, 8791 UI/AI."
fi

bash socialmate-v1.2/service-v040.sh ensure
echo "Private UI: http://127.0.0.1:8791/v12"
echo "Never expose localhost gateway publicly; NO transcript persistence."
echo "Stop with: bash socialmate-v1.2/service-v040.sh stop"