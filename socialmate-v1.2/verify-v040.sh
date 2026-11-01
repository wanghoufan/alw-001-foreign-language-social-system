#!/usr/bin/env bash
# ALW-001 V0.4.0 preflight: real Mac Node regression, HTML rebuild, debug APK.
# Does NOT call paid Tencent/DeepSeek APIs.
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"
LOGDIR="socialmate-v1.2/.local/qa"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/verify-$(date '+%Y%m%d-%H%M%S').log"
{
  echo "ALW-001 live QA $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "Root: $ROOT"
  NODE_BIN="$(command -v node || true)"
  if [[ -z "$NODE_BIN" ]]; then
    for candidate in "$HOME"/.nvm/versions/node/*/bin/node "$HOME/.volta/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
      [[ -x "$candidate" ]] && NODE_BIN="$candidate"
    done
  fi
  [[ -n "$NODE_BIN" ]] || { echo "BLOCKED: Node.js required"; exit 2; }
  command -v python3 >/dev/null || { echo "BLOCKED: Python 3 required"; exit 2; }
  echo "Node: $NODE_BIN ($("$NODE_BIN" --version))"
  echo "1. Frontend regression and SSE tests"
  "$NODE_BIN" --test socialmate-v1.2/test-display-and-ai.mjs socialmate-v1.2/test-live-asr.mjs socialmate-v1.2/test-android-wiring.mjs socialmate-v1.2/test-live-e2e.mjs
  echo "1b. TLS + installer guidance regression tests"
  "$NODE_BIN" --test socialmate-v1.2/test-tls-guard.mjs socialmate-v1.2/test-install-guidance.mjs
  echo "2. AI gateway and SSE tests"
  "$NODE_BIN" --test socialmate-prototype/ai-gateway/core.test.mjs \
     socialmate-prototype/ai-gateway/asr-final-adapter.test.mjs \
     socialmate-prototype/ai-gateway/live-asr-hub.test.mjs
  echo "2b. 归档 / 复盘 / 本机档案 / 人物主档写入链路测试（临时目录，不碰真实档案）"
  "$NODE_BIN" --test socialmate-prototype/ai-gateway/conversation-archive.test.mjs \
     socialmate-prototype/ai-gateway/archive-history.test.mjs \
     socialmate-prototype/ai-gateway/profile-store.test.mjs \
     socialmate-prototype/ai-gateway/profile-apply.test.mjs \
     socialmate-prototype/ai-gateway/session-review.test.mjs \
     socialmate-prototype/ai-gateway/people-store.test.mjs \
     socialmate-prototype/ai-gateway/review-confirm.test.mjs
  echo "2c. N03 人物详情 / 见面前准备 / 收藏 / 检索 / HTTP 路由（P0-04）"
  "$NODE_BIN" --test socialmate-prototype/ai-gateway/people-slug.test.mjs \
     socialmate-prototype/ai-gateway/person-detail.test.mjs \
     socialmate-prototype/ai-gateway/prep.test.mjs \
     socialmate-prototype/ai-gateway/favorites-store.test.mjs \
     socialmate-prototype/ai-gateway/archive-search.test.mjs \
     socialmate-prototype/ai-gateway/server-routes.test.mjs
  echo "3. ASR bridge protocol / event callback tests"
  NPM_BIN="$(dirname "$NODE_BIN")/npm"
  [[ -x "$NPM_BIN" ]] || NPM_BIN="$(command -v npm || true)"
  [[ -n "$NPM_BIN" ]] || { echo "BLOCKED: npm not found next to Node"; exit 2; }
  (cd android-poc/asr-bridge && PATH="$(dirname "$NODE_BIN"):$PATH" "$NPM_BIN" test)
  echo "4. Rebuild 115-place UI from canonical baseline"
  python3 socialmate-v1.2/build-v12.py
  echo "5. Re-test freshly generated HTML"
  "$NODE_BIN" --test socialmate-v1.2/test-display-and-ai.mjs socialmate-v1.2/test-live-asr.mjs socialmate-v1.2/test-android-wiring.mjs
  echo "6. Android core algorithms"
  if [[ -z "$(printenv JAVA_HOME || true)" && -x "$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home"
  fi
  if [[ -z "$(printenv ANDROID_HOME || true)" && -d "$HOME/android-toolchain/sdk" ]]; then
    export ANDROID_HOME="$HOME/android-toolchain/sdk"
  fi
  export PATH="$JAVA_HOME/bin:$PATH"
  (cd android-poc && sh test-core.sh)
  echo "7. Android APK build"
  if [[ -z "$(printenv JAVA_HOME || true)" && -x "$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home/bin/java" ]]; then
    export JAVA_HOME="$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home"
  fi
  if [[ -z "$(printenv ANDROID_HOME || true)" && -d "$HOME/android-toolchain/sdk" ]]; then
    export ANDROID_HOME="$HOME/android-toolchain/sdk"
  fi
  if [[ -z "$(printenv JAVA_HOME || true)" || -z "$(printenv ANDROID_HOME || true)" ]]; then
    echo "ANDROID_BUILD_BLOCKED: JDK17 or Android SDK 35 missing"
    exit 2
  fi
  if [[ ! -d "$ANDROID_HOME/platforms/android-35" ]]; then
    echo "ANDROID_BUILD_BLOCKED: Android SDK Platform 35 missing"
    exit 2
  fi
  (cd android-poc && sh build-apk.sh)
  APK="android-poc/app/build/outputs/apk/debug/app-debug.apk"
  [[ -f "$APK" ]] || { echo "APK_NOT_FOUND"; exit 1; }
  shasum -a 256 "$APK"
  echo "PASS: test suites, HTML regeneration, and Android APK compiled."
  echo "This does NOT prove real Tencent / DeepSeek latency or real phone QA."
} 2>&1 | tee "$LOG"
echo "QA log: $LOG"
