#!/bin/bash
# N05 S4 真机 TTS 证据采集（小米 mibrain / Android 11 / Redmi Note 11 5G）。
# 只读取设备状态、打开自检页并朗读自测文本；不写真实用户数据、不读 token。
set -u
SERIAL="${SERIAL:-REDACTED-SERIAL}"
PKG="app.socialmate.dualmic"
ACT="$PKG/.TtsSelfTestActivity"
OUT="${OUT:-docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261102-s4}"
ADB="adb -s $SERIAL"
mkdir -p "$OUT"

run() { echo "\$ $*" >> "$OUT/commands.log"; eval "$@" >> "$OUT/commands.log" 2>&1; }

: > "$OUT/commands.log"
$ADB logcat -c
$ADB logcat -v time -s SocialMateTts:I SocialMateBridge:I > "$OUT/logcat-tts.txt" 2>&1 &
LOGPID=$!
trap 'kill $LOGPID 2>/dev/null' EXIT
$ADB shell am force-stop "$PKG"
$ADB shell am start -n "$ACT" >/dev/null
sleep 4

start_cmd() { $ADB shell "am start -n $ACT $*" >/dev/null 2>&1; }

echo "== 中文原文 =="
start_cmd --es cmd speak --es lang zh-CN --es text "'我们今天沿着龙兴路走一走，顺便看看老街这些年的变化。'"
sleep 9

echo "== 英文 A（内置原句） =="
start_cmd --es cmd segment --ei index 1
sleep 9

echo "== 英文 B（内置原句） =="
start_cmd --es cmd segment --ei index 2
sleep 8

echo "== 循环 2 次 =="
start_cmd --es cmd speak --es lang en-US --ei loop 2 --es text "'We could stroll down Longxing Road and check out what is new on the old street.'"
sleep 16

echo "== 停止（长句 loop 3，3 秒后 stop） =="
start_cmd --es cmd speak --es lang en-US --ei loop 3 --es text "'We will take a walk along Longxing Road and see how the old street has changed over the years.'"
sleep 3
start_cmd --es cmd stop
sleep 3

echo "== 切段（长句 loop 3，3 秒后 next） =="
start_cmd --es cmd speak --es lang en-US --ei loop 3 --es text "'We will take a walk along Longxing Road and see how the old street has changed over the years.'"
sleep 3
start_cmd --es cmd next
sleep 9

echo "== 0.75 倍速 =="
start_cmd --es cmd rate --ef rate 0.75
sleep 1
start_cmd --es cmd speak --es lang en-US --es text "'We will take a walk along Longxing Road and see how the old street has changed over the years.'"
sleep 10

echo "== 1.0 倍速 =="
start_cmd --es cmd rate --ef rate 1.0
sleep 1
start_cmd --es cmd speak --es lang en-US --es text "'We will take a walk along Longxing Road and see how the old street has changed over the years.'"
sleep 9

echo "== 缺失语言 ja-JP =="
start_cmd --es cmd missing
sleep 2
$ADB shell uiautomator dump /sdcard/n05-s4-ui.xml >/dev/null 2>&1
$ADB shell cat /sdcard/n05-s4-ui.xml > "$OUT/ui-ja-jp.xml"
$ADB exec-out screencap -p > "$OUT/screenshot-ja-jp.png"

echo "== 持久化 =="
start_cmd --es cmd listen --ez value true
sleep 1
start_cmd --es cmd loop --ei loop 2
sleep 1
$ADB shell run-as "$PKG" cat /data/data/$PKG/shared_prefs/socialmate-tts.xml > "$OUT/tts-prefs-before-restart.xml"
$ADB shell am force-stop "$PKG"
sleep 2
$ADB shell am start -n "$ACT" >/dev/null
sleep 4
$ADB shell run-as "$PKG" cat /data/data/$PKG/shared_prefs/socialmate-tts.xml > "$OUT/tts-prefs-after-restart.xml"
$ADB shell am start -n "$ACT" --es cmd status >/dev/null

echo "== 生命周期：back -> shutdown -> re-enter =="
$ADB shell input keyevent KEYCODE_BACK
sleep 2
$ADB shell am start -n "$ACT" >/dev/null
sleep 3

kill $LOGPID 2>/dev/null
wait $LOGPID 2>/dev/null
$ADB shell dumpsys package "$PKG" > "$OUT/dumpsys-package.txt"
$ADB shell dumpsys audio > "$OUT/dumpsys-audio.txt"
$ADB exec-out screencap -p > "$OUT/screenshot-selftest.png"
echo "DONE $OUT"