#!/bin/bash
# ALW-001 N05 · 0.8.3「Android TTS 播放控制与可切换适配」真机证据采集。
#
# 只做本地验收：不卸载 App、不动真实数据、不配置厂商 Key、不发真实云 TTS 请求、
# 不重启 8790/8791/8781/8782。远端路径走临时夹具（8799，TtsCache 与 pairings 均在 /tmp）。
#
# 用法：bash android-poc/tools/n05-tts-v083-evidence.sh
set -u
SERIAL="${SERIAL:-REDACTED-SERIAL}"
PKG="app.socialmate.dualmic"
ACT="$PKG/.TtsSelfTestActivity"
OUT="${OUT:-docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261103-tts/android}"
ADB="adb -s $SERIAL"
CMDS="$OUT/00-commands.log"
mkdir -p "$OUT"
: > "$CMDS"

device() { # device <logfile> <device shell command...>
  local target="$1"; shift
  echo "\$ adb -s $SERIAL shell $*" >> "$CMDS"
  adb -s "$SERIAL" shell "$@" > "$target" 2>&1
  local code=$?
  echo "  exit=$code → $(basename "$target")" >> "$CMDS"
  return $code
}

start() { # start <logfile> <extra am args...>  先清日志，再下发命令，最后按标签抓日志
  local target="$1"; shift
  adb -s "$SERIAL" logcat -c
  echo "\$ adb -s $SERIAL shell am start -n $ACT $*" >> "$CMDS"
  adb -s "$SERIAL" shell "am start -n $ACT $*" >> "$CMDS" 2>&1
  echo "  exit=$? → $(basename "$target")" >> "$CMDS"
}

snapshot() { # snapshot <logfile>  抓 SocialMateTts / AudioTrack 相关日志
  local target="$1"
  adb -s "$SERIAL" logcat -d -v time > "$target.raw" 2>&1
  grep -E "SocialMateTts|AudioTrack|AudioFlinger" "$target.raw" > "$target"
  rm -f "$target.raw"
}

echo "== 0. 元数据 =="
APK="android-poc/app/build/outputs/apk/debug/app-debug.apk"
{ echo "# APK 元数据（0.8.3 / versionCode 38）"; echo;
  ls -l "$APK"; echo;
  echo "sha256: $(shasum -a 256 "$APK" | cut -d' ' -f1)";
  echo; echo "## apksigner verify"; } > "$OUT/apk-metadata.txt"
source "$HOME/android-toolchain/android-env.zsh" >/dev/null 2>&1
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | tail -1)"
"$BUILD_TOOLS/apksigner" verify --print-certs "$APK" >> "$OUT/apk-metadata.txt" 2>&1
echo "apksigner exit=$?" >> "$CMDS"
device "$OUT/dumpsys-package.txt" "dumpsys package $PKG | grep -E 'versionCode|versionName|firstInstallTime|lastUpdateTime|codePath'"

echo "== 0. 基线复位（provider=fake / 系统声音关 / 远端地址清空 / rate=0.9 / loop=1） =="
adb -s "$SERIAL" shell "am start -n $ACT --es cmd system --ez value false" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd provider --es provider fake" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd base --es value ''" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd rate --ef rate 0.9" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd loop --ei loop 1" >/dev/null 2>&1
sleep 2
device "$OUT/00-baseline-prefs.xml" "run-as $PKG cat shared_prefs/socialmate-tts.xml"

echo "== 1. fake 播放（真实音频输出） =="
start "$OUT/01-fake-play.txt" --es cmd speak --es segment enA --es provider fake --ei loop 5 --es text "'We could stroll down Longxing Road.'"
sleep 2
device "$OUT/01-dumpsys-audio-playing.txt" "dumpsys audio | grep -E 'u/pid:[0-9]+/[0-9]+ *state:' | tail -8"
device "$OUT/01-dumpsys-flinger-playing.txt" "dumpsys media.audio_flinger | grep -A6 'app.socialmate'"
adb -s "$SERIAL" exec-out screencap -p > "$OUT/01-fake-playing.png" 2>/dev/null
adb -s "$SERIAL" shell "am start -n $ACT --es cmd stop" >/dev/null 2>&1
sleep 2
snapshot "$OUT/01-fake-play.txt"
grep -q "play start loop=1/5" "$OUT/01-fake-play.txt"; echo "  fake_play_started=$?" >> "$CMDS"

echo "== 2. 循环 5 次：本地只重放缓存 =="
start "$OUT/02-loop5-local.txt" --es cmd speak --es segment enA --es provider fake --ei loop 5 --es text "'loop five probe'"
sleep 10
snapshot "$OUT/02-loop5-local.txt"

echo "== 3. 停止 / 切段 =="
start "$OUT/03-stop.txt" --es cmd speak --es segment enB --es provider fake --ei loop 5 --es text "'stop probe long enough'"
sleep 2
echo "\$ adb -s $SERIAL shell am start -n $ACT --es cmd stop" >> "$CMDS"
adb -s "$SERIAL" shell "am start -n $ACT --es cmd stop" >> "$CMDS" 2>&1; echo "  exit=$?" >> "$CMDS"
sleep 3
snapshot "$OUT/03-stop.txt"
start "$OUT/03-switch-segment.txt" --es cmd speak --es segment enA --es provider fake --ei loop 5 --es text "'switch probe long enough'"
sleep 2
echo "\$ adb -s $SERIAL shell am start -n $ACT --es cmd next" >> "$CMDS"
adb -s "$SERIAL" shell "am start -n $ACT --es cmd next" >> "$CMDS" 2>&1; echo "  exit=$?" >> "$CMDS"
sleep 4
snapshot "$OUT/03-switch-segment.txt"

echo "== 4. 倍速：0.75 与 1.0 时长差 + 音高不变 =="
start "$OUT/04-rate-100.txt" --es cmd speak --es segment enA --es provider fake --ei loop 3 --ef rate 1.0 --es text "'rate probe one zero'"
sleep 8
snapshot "$OUT/04-rate-100.txt"
start "$OUT/04-rate-075.txt" --es cmd speak --es segment enA --es provider fake --ei loop 3 --ef rate 0.75 --es text "'rate probe zero seven five'"
sleep 9
snapshot "$OUT/04-rate-075.txt"
{
  echo "# 同一段预置音频（fileMs=1250）各播 3 次，取 wallMs 均值"
  for f in 04-rate-100.txt 04-rate-075.txt; do
    grep -oE "loop=[0-9]+/[0-9]+ wallMs=[0-9]+ fileMs=[0-9]+ rate=[0-9.]+" "$OUT/$f" |
      awk -v n="$f" '{split($2,a,"="); split($4,b,"="); s+=a[2]; c++; r=b[2]}
        END {printf "%s: loops=%d meanWallMs=%.0f rate=%s\n", n, c, s/c, r}'
  done
  echo; echo "## PlaybackParams（speed/pitch 实测）"
  grep -h "PlaybackParams" "$OUT/04-rate-100.txt" "$OUT/04-rate-075.txt" | head -8
} > "$OUT/04-rate-summary.txt"

echo "== 5. 远端不可达（8798 无服务）：可读错误、不自动切系统 =="
adb -s "$SERIAL" shell "am start -n $ACT --es cmd base --es value http://127.0.0.1:8798" >/dev/null 2>&1
sleep 1
start "$OUT/05-remote-unreachable.txt" --es cmd speak --es segment enA --es provider remote --ei loop 1 --es text "'unreachable probe'"
sleep 8
snapshot "$OUT/05-remote-unreachable.txt"

echo "== 6. 远端夹具 8799：合成 1 次、循环 5 次 =="
FIXTURE_LOG=/tmp/alw001-n05-android/fixture.log
if lsof -nP -iTCP:8799 -sTCP:LISTEN >/dev/null 2>&1; then
  adb -s "$SERIAL" reverse tcp:8799 tcp:8799 >> "$CMDS" 2>&1
  adb -s "$SERIAL" shell "am start -n $ACT --es cmd base --es value http://127.0.0.1:8799" >/dev/null 2>&1
  sleep 1
  BEFORE=$(grep -c "synthesize" "$FIXTURE_LOG" 2>/dev/null || echo 0)
  RUN_TAG="$(date +%H%M%S)"
  start "$OUT/06-remote-loop5.txt" --es cmd speak --es segment enA --es provider remote --ei loop 5 --es text "'We could stroll down Longxing Road, run $RUN_TAG.'"
  sleep 14
  snapshot "$OUT/06-remote-loop5.txt"
  AFTER=$(grep -c "synthesize" "$FIXTURE_LOG" 2>/dev/null || echo 0)
  {
    echo "# 临时夹具服务（127.0.0.1:8799，仅 fake provider，TtsCache 在 /tmp）"
    echo "synth_before=$BEFORE synth_after=$AFTER delta=$((AFTER - BEFORE))"
    echo; tail -20 "$FIXTURE_LOG"
  } > "$OUT/06-remote-fixture-count.txt"
else
  echo "NOT_RUN: 夹具 8799 未监听（先运行 android-poc/tools/n05-tts-remote-fixture.mjs）" > "$OUT/06-remote-loop5.txt"
fi

echo "== 7. 系统声音：默认被门控，手动开启后可播 =="
adb -s "$SERIAL" shell "am start -n $ACT --es cmd system --ez value false" >/dev/null 2>&1
sleep 1
start "$OUT/07-system-gated.txt" --es cmd speak --es segment enA --es provider system --ei loop 1 --es text "'system gated probe'"
sleep 3
snapshot "$OUT/07-system-gated.txt"
adb -s "$SERIAL" shell "am start -n $ACT --es cmd system --ez value true" >/dev/null 2>&1
sleep 2
start "$OUT/07-system-enabled.txt" --es cmd speak --es segment enA --es provider system --ei loop 1 --es text "'We could stroll down Longxing Road.'"
sleep 8
snapshot "$OUT/07-system-enabled.txt"

echo "== 8. 复位并截图 =="
adb -s "$SERIAL" shell "am start -n $ACT --es cmd system --ez value false" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd base --es value ''" >/dev/null 2>&1
adb -s "$SERIAL" shell "am start -n $ACT --es cmd provider --es provider fake" >/dev/null 2>&1
sleep 2
adb -s "$SERIAL" exec-out screencap -p > "$OUT/08-settings-provider.png" 2>/dev/null
device "$OUT/08-ui-dump.xml" "uiautomator dump /sdcard/n05-tts-ui.xml >/dev/null && cat /sdcard/n05-tts-ui.xml"
device "$OUT/08-tts-prefs.xml" "run-as $PKG cat shared_prefs/socialmate-tts.xml"

echo "== 完成：证据目录 $OUT =="
