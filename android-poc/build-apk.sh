#!/bin/sh
set -eu
cd "$(dirname "$0")"
VERSION=8.9
CACHE="$HOME/.gradle/alw001-bootstrap"
if [ ! -x "$CACHE/gradle-$VERSION/bin/gradle" ]; then
  mkdir -p "$CACHE"
  curl -fL --retry 3 -o "$CACHE/gradle-$VERSION-bin.zip" "https://services.gradle.org/distributions/gradle-$VERSION-bin.zip"
  shasum -a 256 "$CACHE/gradle-$VERSION-bin.zip"
  unzip -q -o "$CACHE/gradle-$VERSION-bin.zip" -d "$CACHE"
fi
"$CACHE/gradle-$VERSION/bin/gradle" --no-daemon --console plain :app:assembleDebug
echo "APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
