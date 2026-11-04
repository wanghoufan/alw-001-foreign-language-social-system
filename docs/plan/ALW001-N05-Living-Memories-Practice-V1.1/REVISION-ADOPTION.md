# ALW-001 N05｜V1.1 修订版即时接手指令（不重启旧任务）

status: USER_REQUESTED_ACT_IMMEDIATELY
task_id: SM-ALW001-20261102-N05-V11-ADOPT
relation: VERSION_CORRECTION_OF_ALREADY_GUI_SENT_N05
parent_task_id: SM-ALW001-20261102-N05-LIVING
priority: 25
approved: USER_EXPLICIT_REQUEST_FOR_IMMEDIATE_CONTINUATION
date: 2026-11-02

## 接手对象
这是原 N05 已发送任务的**增量修订**，不是新增产品阶段、不是另一套开发任务、更不是要重做N04/N05已完成代码。
- 你原来已收到 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.0/README.md`。该文档顶部有正式升级指引。
- **最新版唯一执行入口**：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/README.md`。
- **唯一规范主文件**：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/SDD-REVIEW-V1.1.md`。
- **交互原型 HTML 已在Mac实际落盘**：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/prototype/interactive-prototype.html`，其中AI/STT部分为模拟，仅用作UI/交互顺序。
- **品牌视觉参考已落盘**：`assets/launcher-icon-current-brand.svg`、`assets/splash-preview-light.svg`、`assets/splash-preview-dark.svg`。正式APK应使用已有`android-poc/app/src/main/res` adaptive launcher图标和System Splash资源；不得擅自改成旧的双气泡或新增第二Splash Activity。
- **持续执行提示**：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/DEVELOPER-PROMPT.md`。
- ZIP `SocialMate_N05_SDD_V1.1.zip` 的9个独立MD及PNG截图目前仅在云端会话附件，**没有全部落到本地Mac**。本地单文件SDD+HTML+SVG已足够开展开发，不得以ZIP未落地为阻塞，也不可宣称PNG已在Mac。

## 先做一轮真实工程状态核对
1. **现在先读git status/diff及现有 N05/N04 QA**。近期0.8.1 (vc36) 与 N04 T5 证据存在，但项目源码仍是0.8.1，且Git脏；已有开发者正在改的文件不得覆盖。实际阶段不凭 README 的版本号猜。
2. 对照V1.0和V1.1差异，仅吸收增量：People正式界面去演示化；原来的演示资产保留在设置；Longxing Road `placeId=1` 私有感悟及版本记录；旧朋友文本/语音整理须用户确认；长文一中文+英文A/B来源可追溯；Android Native TTS正确定义初始化/语言引擎/stop/shutdown；GPT Voice阶段Prompt与复盘绑定 recordId/blockId/revision；Android APK早期预构建及每模块ADB复验；公开PWA零改。
3. 开工就检查 all-task preflight (A/B/C/D)：已有ASR/DeepSeek key、两个1元预算闸、SDK/Gradle、Android11 TTS/STT服务、Tailscale手机授权状态、8790/8791/8781/8782和权限。必要且不可代办的用户动作汇总一次；不会被阻塞的代码继续做。**不可要求重新提供已经存在且可用的 Key**。
4. 立即预构建APK并使用目标唯一ADB设备`install -r`保留数据、dump version/sha、实机查看People/海南/UI；不允许因为原型已可点击就免做Android真机预览。若另一开发者仍在同文件编辑，先只读验证，不抢。
5. 之后连续推进所有未完成Task直到唯一最终Human Gate。不能因阶段/Reviewer/QA/单次回复自行停工，也不能假报UI/API、TTS音质、APK安装或最终真人验收通过。

## 独立QA最低证据
- 新的`N05/qa/<timestamp>/`存 每Task PASS/PARTIAL/NOT_RUN、具体源码/命令/日志/版本、APK SHA/ADB serial/截图、原始人物与地点私有数据hash、TTS引擎结果、Prompt/复盘原文与来源记录。
- Person真实来源必须与Demo区分；清空演示只清Demo，不删用户新建人物/真实People。公开 `places-115.json` 和公开PWA源须前后SHA一致。
- 若当前N05工作已经在执行，不重做已通过的任务，只按V1.1必要修订继续；不要求用户中途再确认。

## 投递注意
原任务 `SM-ALW001-20261102-N05-LIVING` 已GUI_SENT且保持SENT，永不重发。本指令有独立 task_id，仅用于**通知同一开发会话采用新版文档**。Desktop GPT转发员必须先确认WorkBuddy当前项目/状态；BUSY不抢队、不打开其它已关闭开发工具。若该修订已被执行且可从项目QA证据验证，转发员判重后不要再投递。
