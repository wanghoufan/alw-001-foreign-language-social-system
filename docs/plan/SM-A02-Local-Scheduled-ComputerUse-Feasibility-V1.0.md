# A02：桌面 GPT 定时自主唤醒 + Computer Use 转发（最小验收）

日期：2026-11-01
项目绝对根目录：/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
任务状态：READY_FOR_DESKTOP_LOCAL_SCHEDULE；**本文件创建不代表已经开启定时运行或已发送任何消息**。

## 固定架构
用户从手机在**当前普通 ChatGPT 会话**下达任务 → 云端 GPT 用 Mac Mini Project Reader 写入项目任务文件 → Mac mini **桌面 GPT 本地定时任务**自主读取新任务 → **桌面 GPT 通过 Computer Use GUI**找前台开发者窗口、输入并点击发送 → 开发者写 PONG → 桌面 GPT 写 GUI relay 回执；云端可读结果。

禁止将普通云端聊天替换为云端 Work，也禁止使用 CodeArts/OpenCode 的 CLI/API 替代 Computer Use。允许操作系统守护进程只做提醒，但不能代替 GPT 点击开发者窗口。

## 官方能力边界
- ChatGPT 官方 Scheduled tasks 文档（https://learn.chatgpt.com/docs/automations）称桌面版可在本地项目运行 scheduled tasks，选择 local project 或 isolated worktree；Mac 要保持开机、桌面应用运行。
- Computer Use 官方（https://learn.chatgpt.com/docs/computer-use）称桌面 Work/Codex 在 macOS 可使用应用 GUI；需相关系统权限和应用授权。
- **尚无已经实测的证据证明「本地 scheduled task 可以自动使用 Computer Use 并点击 Send」；这正是 A02 的唯一待检点。** 不得凭本地定时任务成功读文件就宣布转发成功。
- 最低定时间隔以本机实际 UI 支持为准，不得猜测支持1分钟或5分钟；首次采用“一次性本地定时任务”，减少模型与 CodeArts 积分消耗。若确实只能每小时运行一次，需要报告实际观察到的限制及延迟。
- Mac 上若能跑项目本地 Scheduled task，但不能调用 Computer Use，则严格报告 `SCHEDULE_LOCAL_PASS_GUI_BLOCKED`；不要自动改成 AppleScript、模拟按键、浏览器自动化或开发工具 API 发送消息。

## 现成输入（不要重新生成 A02）
A02 任务绝对路径：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Cloud-to-Desktop-PING-20261101-A02.md

A01 历史成功：`docs/plan/SM-Desktop-GPT-RELAY-20261101-A01.md`、`docs/plan/SM-Cloud-to-Desktop-PONG-20261101-A01.md`；不要重复发送A01。

A02 桌面 GUI 发送回执绝对路径：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Desktop-GPT-RELAY-20261101-A02.md

A02 开发者 PONG 绝对路径：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Cloud-to-Desktop-PONG-20261101-A02.md

## 桌面 GPT 一次性部署与测试指令
1. 在 Mac mini 的 ChatGPT **桌面版**检查「Scheduled / 定时任务」及本地项目任务能力，并核对当前会话是否有 **Computer Use** 插件/权限（Mac 屏幕录制、辅助功能及 CodeArts 操作授权）。不要把一般 Chat 里的云端定时任务当成本地项目任务。
2. 如 UI 支持，创建一个**一次性、尚未执行**的「本地项目」定时任务，工作目录为项目绝对路径，任务内容见下方“可直接用于定时的完整提示词”。尽量选择即将发生的一次执行时间；不需一直占用额度循环。禁止在建立定时任务的当下直接通过 GUI 转发 A02——那样测到的只是手动转发。
3. 配置完成后，人工不再给桌面 GPT 输入任何新内容、不点“Run now”，让定时器自行触发，检查实际运行日志。**用户若没有完成首次配置，此文件不会自动创建桌面定时任务**。
4. 定时任务执行时先只读检查 A02 文件、当前前台开发者窗口和是否已有 A02 relay/PONG。若 relay 已 GUI_SENT 或 PONG 已存在，就不要重复发送。
5. 若可调用 Computer Use 且窗口确认是用户授权的 ALW-001 开发者 CodeArts（或该项目正在工作的其他开发者），通过 GUI 输入 A02 文件里指定的单行指令并点击发送。不可凭前台窗口属于其他任务而盲发。验明 GUI 发送事实后才写 relay 文件；看到开发者真实 PONG 后写 ACKED 状态。
6. 如果定时任务根本不能使用 Computer Use、权限弹窗导致暂停、当前前台窗口不合适、文件访问失败、或 Scheduled 不支持本地任务，则**不能伪造 GUI_SENT**。仅写独立诊断文件 `docs/plan/SM-A02-Local-Schedule-Diagnostic.md` 说明工具/界面证据、时间、阻塞类型和下一步。
7. 只测试文件读取、Computer Use GUI 发一条 PING 与回执；不进行开发、不部署、不调用 Tencent/DeepSeek 等付费 API、不打印私人数据、不 git push/reset/clean。CodeArts GUI 测试也可能消耗平台积分，执行一轮即可。

### 可直接用于本地 Scheduled task 的完整提示词

你是 **Mac mini 桌面 ChatGPT 的本地收件箱转发测试任务**，仅处理编号 A02，不处理其他开发任务。

项目绝对路径：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统

读取：
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-A02-Local-Scheduled-ComputerUse-Feasibility-V1.0.md
以及
/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/SM-Cloud-to-Desktop-PING-20261101-A02.md

确保不存在 A02 已发送回执/PONG。使用 **Computer Use** 检查当前前台开发者窗口。如果确认为 ALW-001 正在工作的开发者，使用 Computer Use 在其输入框输入 A02 文件指定单行测试消息，**实际点击发送**。目视验证发出后写出 SM-Desktop-GPT-RELAY-20261101-A02.md，检查开发者写入的 SM-Cloud-to-Desktop-PONG-20261101-A02.md，逐项记录触发类型、发送时间、目标窗口及收件回执。若无法使用 Computer Use 或其它阻塞，只写 SM-A02-Local-Schedule-Diagnostic.md，绝不假称成功、绝不改成CLI/API。**不要在创建定时任务的这一次会话中执行实际发送；必须等系统自动到点执行。**
