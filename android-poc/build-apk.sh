#!/bin/sh
set -eu
cd "$(dirname "$0")"

# V1.7：本机可用的离线构建链。
# 之前只用 gradle-8.9 + 默认 ~/.gradle，会去 dl.google.com 重新拉 AGP（TLS 失败）。
# 现有 AGP 8.7.3 依赖缓存在 ~/.gradle-alw001（Gradle 8.14 metadata），故优先用它。
GRADLE_HOME="${GRADLE_HOME:-$HOME/android-toolchain/gradle-8.14.3}"
GRADLE_BIN="$GRADLE_HOME/bin/gradle"
if [ ! -x "$GRADLE_BIN" ]; then
  VERSION=8.9
  CACHE="$HOME/.gradle/alw001-bootstrap"
  if [ ! -x "$CACHE/gradle-$VERSION/bin/gradle" ]; then
    mkdir -p "$CACHE"
    curl -fL --retry 3 -o "$CACHE/gradle-$VERSION-bin.zip" "https://services.gradle.org/distributions/gradle-$VERSION-bin.zip"
    shasum -a 256 "$CACHE/gradle-$VERSION-bin.zip"
    unzip -q -o "$CACHE/gradle-$VERSION-bin.zip" -d "$CACHE"
  fi
  GRADLE_BIN="$CACHE/gradle-$VERSION/bin/gradle"
fi
if [ -d "$HOME/.gradle-alw001" ]; then
  export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.gradle-alw001}"
fi
if [ -d "$GRADLE_USER_HOME/caches/modules-2" ]; then
  "$GRADLE_BIN" --no-daemon --console plain --offline :app:assembleDebug
else
  "$GRADLE_BIN" --no-daemon --console plain :app:assembleDebug
fi
echo "APK: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"