#!/bin/bash
# ALW-001 N05 · 0.8.4「Amazon Polly 声线选择」Android 侧证据采集。
#
# 本轮范围：只编译、只校版本，不安装、不启动/重启 8791、不改真实档案数据。
# 真机播放验收留给 P3，本脚本把 P3 要用的 adb 命令固定下来（白名单与后端契约一致）：
#
#   aws-polly-fake   本地预置 provider（可测，无需云凭证）
#   aws-polly        真实 Amazon Polly（未配置时后端返回 501）
#   zh-CN → Zhiyu
#   en-US → Ruth（默认）/ Joanna
#   en-GB → Amy（默认）/ Brian
#
# 用法：
#   bash android-poc/tools/n05-tts-v084-evidence.sh            # 只做构建/APK 自证（默认，不碰手机）
#   bash android-poc/tools/n05-tts-v084-evidence.sh build      # 同上，clean assembleDebug
#   bash android-poc/tools/n05-tts-v084-evidence.sh commands   # 只打印 P3 可直接复制的 adb 命令
#   SERIAL=<序列号> bash android-poc/tools/n05-tts-v084-evidence.sh device   # 真机下发（需手动装包）
#   SERIAL=<序列号> bash ... device --install                 # 真机下发前先 adb install -r
#
# 不打印任何密钥；脚本本身不发出云 TTS 请求（真实 Polly 只会在设备端由远端服务代理）。
set -u

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT" || exit 1

APK="$ROOT/android-poc/app/build/outputs/apk/debug/app-debug.apk"
PKG="app.socialmate.dualmic"
ACT="$PKG/.TtsSelfTestActivity"
MODE="${1:-build}"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

find_aapt2() {
  local in_path; in_path="$(type -P aapt2 || true)"
  if [ -n "$in_path" ]; then echo "$in_path"; return; fi
  ls -d "$ANDROID_HOME"/build-tools/* 2>/dev/null | tail -1 | sed 's|$|/aapt2|'
}

print_apk_meta() {
  echo "APK: $APK"
  if [ ! -f "$APK" ]; then
    echo "MISSING: 先跑 build 模式（clean assembleDebug）"
    return 1
  fi
  echo "bytes: $(wc -c < "$APK" | tr -d ' ')"
  echo "sha256: $(shasum -a 256 "$APK" | cut -d' ' -f1)"
  local tool; tool="$(find_aapt2)"
  if [ -x "$tool" ]; then
    echo "--- aapt2 dump badging（版本三行）---"
    "$tool" dump badging "$APK" 2>/dev/null | grep -E "^package:|^application-label" | head -3
  else
    echo "WARN: 未找到 aapt2，跳过 badging（可用 apkanalyzer 手工核对）"
  fi
}

print_commands() {
  local serial="${SERIAL:-<序列号>}"
  local adb="adb -s $serial"
  cat <<EOF
# 1) 装包（P3 真机）
adb -s $serial install -r "$APK"

# 2) 远端服务商：fake / aws-polly-fake / aws-polly
$adb shell am start -n $ACT --es cmd serverProvider --es value aws-polly-fake
$adb shell am start -n $ACT --es cmd serverProvider --es value aws-polly

# 3) 远端声线：白名单内设置 / voice 传空 = 清除该 locale（回到服务端默认）
$adb shell am start -n $ACT --es cmd voice --es locale zh-CN --es voice Zhiyu
$adb shell am start -n $ACT --es cmd voice --es locale en-US --es voice Ruth
$adb shell am start -n $ACT --es cmd voice --es locale en-US --es voice Joanna
$adb shell am start -n $ACT --es cmd voice --es locale en-GB --es voice Amy
$adb shell am start -n $ACT --es cmd voice --es locale en-GB --es voice Brian
$adb shell am start -n $ACT --es cmd voice --es locale en-US      # 清除 en-US

# 4) 负例（应返回 UNKNOWN_VOICE + httpStatus=400）
$adb shell am start -n $ACT --es cmd voice --es locale en-US --es voice Zhiyu
$adb shell am start -n $ACT --es cmd voice --es locale ja-JP --es voice Zhiyu

# 5) 远端朗读（provider=remote，声线取上面的偏好）
$adb shell am start -n $ACT --es cmd provider --es provider remote
$adb shell am start -n $ACT --es cmd speak --es segment enA --ei loop 1 \\
  --es text "Let's take a walk along Longxing Road."

# 6) 读回状态与偏好（含 remoteVoices / remote_voice_*）
$adb shell am start -n $ACT --es cmd status
$adb shell run-as $PKG cat shared_prefs/socialmate-tts.xml
$adb logcat -d -s SocialMateTts
EOF
}

run_device() {
  local serial="${SERIAL:-}"
  local flag="${1:-}"
  if [ -z "$serial" ]; then
    echo "ERROR: 需要 SERIAL=<设备序列号>（adb devices 取）" >&2
    return 2
  fi
  if [ "$flag" = "--install" ]; then
    adb -s "$serial" install -r "$APK" || return 1
  fi
  local adb="adb -s $serial"
  echo "== 服务商 aws-polly-fake =="
  $adb shell am start -n "$ACT" --es cmd serverProvider --es value aws-polly-fake
  sleep 1
  echo "== en-US / Joanna =="
  $adb shell am start -n "$ACT" --es cmd voice --es locale en-US --es voice Joanna
  sleep 1
  echo "== provider remote + 朗读 =="
  $adb shell am start -n "$ACT" --es cmd provider --es provider remote
  sleep 1
  $adb shell am start -n "$ACT" --es cmd speak --es segment enA --ei loop 1 \
    --es text "Let's take a walk along Longxing Road."
  sleep 3
  echo "== 负例：en-US + Zhiyu（期望 UNKNOWN_VOICE / 400）=="
  $adb shell am start -n "$ACT" --es cmd voice --es locale en-US --es voice Zhiyu
  sleep 1
  echo "== 状态 =="
  $adb shell am start -n "$ACT" --es cmd status
  sleep 1
  $adb shell run-as "$PKG" cat shared_prefs/socialmate-tts.xml
  echo "== logcat（SocialMateTts）=="
  $adb logcat -d -s SocialMateTts | tail -60
}

case "$MODE" in
  build)
    echo "== 0.8.4 构建自证（clean assembleDebug）=="
    export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"
    export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
    GRADLE="$HOME/.gradle/alw001-bootstrap/gradle-8.9/bin/gradle"
    if [ -x "$GRADLE" ]; then
      ( cd android-poc && "$GRADLE" --no-daemon --console plain :app:clean :app:assembleDebug )
    else
      echo "WARN: 未找到 ${GRADLE}，改用 android-poc/build-apk.sh 首次拉取"
      bash android-poc/build-apk.sh
    fi
    print_apk_meta
    ;;
  commands)
    print_commands
    ;;
  device)
    shift || true
    print_apk_meta || exit 1
    run_device "$@"
    ;;
  meta)
    print_apk_meta
    ;;
  *)
    echo "用法: $0 [build|commands|device|meta]" >&2
    exit 2
    ;;
esac