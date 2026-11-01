#!/bin/bash
# ALW-001 prototype: real Mac-side regression and private/public package verification.
# Usage: bash socialmate-prototype/verify-and-package.sh
# This script does NOT deploy, install apps, touch android-poc, or start background services.
set -eu
# Mac /bin/sh supports pipefail; without it, a failing test piped to tee could be mistaken for PASS.
set -o pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

command -v node >/dev/null 2>&1 || { echo "BLOCKED: Node.js is not installed"; exit 2; }
command -v zip >/dev/null 2>&1 || { echo "BLOCKED: zip is not available"; exit 2; }
command -v unzip >/dev/null 2>&1 || { echo "BLOCKED: unzip is not available"; exit 2; }

mkdir -p "socialmate-prototype/.local/qa"
STAMP="$(date '+%Y%m%d-%H%M%S')"
LOG="socialmate-prototype/.local/qa/verify-$STAMP.log"

# tee writes a local test receipt without sending private content to external services.
{
  echo "## ALW-001 SocialMate HTML prototype verification"
  echo "Started: $(date '+%Y-%m-%dT%H:%M:%S%z')"
  echo "Node: $(node --version)"
  echo "Project: $ROOT"
  echo
  echo "[1] Verify source documents and generated corpus:"
  node socialmate-prototype/build-data.cjs --check
  echo
  echo "[2] Run actual Node tests:"
  node --test socialmate-prototype/test-prototype.cjs
  echo
  echo "[3] Generate private prototype ZIP:"
  node socialmate-prototype/package-prototype.cjs
  echo
  echo "[4] Generate public-only Hainan ZIP:"
  node socialmate-prototype/package-public-share.cjs
  echo
  echo "[5] Validate ZIP integrity and expected private/public separation:"
  OUT="socialmate-prototype/.local/releases"
  PRIVATE="$OUT/2026-10-31 - Mac Mini - ChatGPT - ALW001 SocialMate-HTML Prototype - V1.0.zip"
  PUBLIC="$OUT/2026-10-31 - Mac Mini - ChatGPT - ALW001 Hainan Guide-Public Share - V1.0.zip"
  [ -f "$PRIVATE" ] || { echo "FAIL: private zip missing"; exit 1; }
  [ -f "$PUBLIC" ] || { echo "FAIL: public zip missing"; exit 1; }
  unzip -t "$PRIVATE" | tail -n 1
  unzip -t "$PUBLIC" | tail -n 1
  unzip -Z1 "$PUBLIC" | grep -qx 'public-share.html'
  unzip -Z1 "$PUBLIC" | grep -qx 'public-share.js'
  unzip -Z1 "$PUBLIC" | grep -qx 'public-places.js'
  unzip -Z1 "$PUBLIC" | grep -qx 'styles.css'
  COUNT="$(unzip -Z1 "$PUBLIC" | wc -l | tr -d ' ')"
  [ "$COUNT" = 4 ] || { echo "FAIL: public package must contain exactly 4 files; found $COUNT"; exit 1; }
  if unzip -Z1 "$PUBLIC" | grep -E '(data\.js|story-seeds|People|session|private|\.env|Secret|README)' ; then
    echo "FAIL: public package contains unexpected private or development file"; exit 1
  fi
  shasum -a 256 "$PRIVATE" "$PUBLIC"
  echo
  echo "PASS: source check, Node tests, ZIP integrity and public/private separation."
  echo "Note: Real browser visual QA and Android integration are NOT covered by this command."
} 2>&1 | tee "$LOG"
echo "QA receipt: $LOG"
