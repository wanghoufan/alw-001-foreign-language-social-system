#!/usr/bin/env bash
# 生成「SocialMate 服务恢复.app」——用户双击一次就能恢复四个私有服务，不需要终端。
#
# 设计要点（T4）：
# 1. 只做只读健康检查 + `launchctl kickstart`，不直接 spawn node；
#    否则 GUI 进程拉起 node 会弹「node 想要访问文稿文件夹」的隐私授权框，反而多一步。
# 2. 服务本身由 LaunchAgent（com.alw.socialmate-stack）托管：开机自启、崩溃自动重启；
#    这个 .app 只是给人用的兜底按钮。
# 3. 输出固定到 release/t4/（release/ 不入 Git），可随时重新生成。
set -uo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/../../../../.." && pwd)"
OUT_DIR="$ROOT/release/t4"
APP="$OUT_DIR/SocialMate 服务恢复.app"
SRC="$OUT_DIR/recovery.applescript"
mkdir -p "$OUT_DIR"

cat >"$SRC" <<EOF
on run
	set repoRoot to "$ROOT"
	set healthScript to repoRoot & "/socialmate-v1.2/service-all.sh"
	set homePath to (do shell script "echo \$HOME")
	set uidText to (do shell script "id -u")
	set agentLabel to "com.alw.socialmate-stack"
	set plistPath to homePath & "/Library/LaunchAgents/" & agentLabel & ".plist"

	-- 第一步：只读健康检查（只有 curl/lsof，不碰 ~/Documents，不会触发隐私授权弹窗）
	set healthy to false
	try
		do shell script "/bin/bash " & quoted form of healthScript & " health > /dev/null 2>&1"
		set healthy to true
	end try
	if healthy then
		display dialog "四个私有服务都正常，不需要修复。" buttons {"好"} default button "好" with title "SocialMate 服务恢复"
		return
	end if

	-- 第二步：让 launchd 重启看门狗（服务由 launchd 拉起，不需要终端、不需要给 node 授权文件夹）
	try
		set loaded to (do shell script "launchctl print gui/" & uidText & "/" & agentLabel & " >/dev/null 2>&1 && echo yes || echo no")
		if loaded is "no" then
			do shell script "launchctl bootstrap gui/" & uidText & " " & quoted form of plistPath
		end if
		do shell script "launchctl kickstart -k gui/" & uidText & "/" & agentLabel
	on error errMsg number errNum
		display dialog "无法启动自愈守护（" & errNum & "）：" & errMsg & return & "请把这句提示发给开发者。" buttons {"好"} default button "好" with icon caution with title "SocialMate 服务恢复"
		return
	end try

	-- 第三步：等最多 40 秒，再确认一次
	set finalHealthy to false
	repeat 20 times
		delay 2
		try
			do shell script "/bin/bash " & quoted form of healthScript & " health > /dev/null 2>&1"
			set finalHealthy to true
			exit repeat
		end try
	end repeat
	if finalHealthy then
		display dialog "已自动恢复，手机可以继续使用。" & return & return & "8790 语音识别 / 8791 界面与 AI / 8781 正式归档 / 8782 演示归档 全部在线。" buttons {"好"} default button "好" with title "SocialMate 服务恢复"
	else
		display dialog "还没恢复成功。" & return & return & "请确认 Mac 已联网，然后再次双击本应用；仍失败请联系开发者。" buttons {"好"} default button "好" with icon caution with title "SocialMate 服务恢复"
	end if
end run
EOF

rm -rf "$APP"
osacompile -o "$APP" "$SRC" || { echo "BLOCKED: osacompile 失败"; exit 3; }
echo "BUILT: $APP"
echo "双击即可恢复；检查结果会弹窗显示，不需要终端。"
