<!-- USER_APPROVED 2026-11-03 | ALW-001 | N05 V1.3 | continuation not dispatch proof -->
# ALW-001 N05 V1.3｜批准后的云转桌候补指针（未 GUI 发送）

status: WAITING_PREVIOUS_READY_TASK
user_approved: true
approval: USER_REPLY_1_APPROVED_N05_V13_20261103
approved_date: 2026-11-03
task_id: SM-ALW001-20261103-N05-V13-UX-ARCHIVE
priority: 30
target_project: ALW-001
project_reader_id: 001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/README.md
scope: N05_V1_3_PLAYBACK_REAL_CONTENT_AUTO_ARCHIVE_FINAL_UX
human_gate: FINAL_ONCE
no_public_pwa_changes: true
supersedes_unexecuted_stage_plan: SM-ALW001-20261103-N05-V12-HONGCHENG
prior_ready_task_id: SM-ALW001-20261103-POLLY-ADOPT

send_text: 读取并执行：docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/README.md

## 排队纪律
此文件**只是留给后续桌面开发者的已批准指针**，不属于转发员正式 `docs/relay/CURRENT_TASK.md` 收件箱，禁止凭此文档标GUI_SENT或推断任务已送达。
截至2026-11-03晚，官方收件箱仍为Amazon Polly `SM-ALW001-20261103-POLLY-ADOPT` `READY`，最新回执未证明GUI_SEND。保护该任务和之前V1.2文档，不抢队、不改SENT。
V1.3依据比V1.2更新的真实源码/Q A差异提出，**已覆盖V1.2尚未完工的听读、内容和归档余项**；到将来队列释放时由有权限的派单者逐项核查最新HANDOFF后在**V1.2旧候补与V1.3新候补中只选仍未完成的最新增量任务**，不得重复投递旧任务。正式READY只允许覆盖已合法结束/确认取消的旧指针，覆盖前保存回执与审计轨迹。
发送仍需已运行的唯一ALW-001开发工作区、IDLE且无审批阻塞；经Computer Use GUI真实点击Send及消息气泡证明才写GUI_SENT，不能由文件落盘代替。


## 固定执行红线
- 单一现有主开发者连续完成本阶段，内部QA不要求逐个用户审批，**只在真实最终验收与任何必要付费/云隐私授权时请求用户**。不重做N05 V1.2 T0–T4和已通过的底层T5/T6测试；先核实最新HEAD、工作树和当前手机已安装版本，再增量补足。
- 只在SocialMate Android私有WebView、Java原生TTS与Mac本机服务/私有数据目录内改动；不得触碰公开海南 PWA、115个公开地点、V1.4作品资料；保留Android现有应用数据，禁止清空、卸载或重置。每次安装应使用同签名 `adb install -r`，目标serial必须核对。
- 不擅自修改P016「懒得打字」项目；需修P016导出可靠性/未鉴权HTTP时给独立项目主管精确需求和测试接口，不跨项目写码。绝不把旧 18791 无鉴权明文接收扩大至真实聊天或其他私有资料。
- 用户真实原文逐字保存、任何AI加工另存版本与溯源；人物档案必须用户确认；个人笔记/真人聊天不得未经明确相关授权传云；AWS Polly预算默认0、不索要密钥、不把假语音当真实音质。DeepSeek预算维持现有1元闸门，不清账本或提高限额。
- 禁止误伤当前其他开发者的dirty文件、reset/clean、误杀服务、改原有ASR/录音权限，禁止在没有用户明确授权下commit/push/release。仅真实UI/ADB视频+日志+源文件hash才能标完整用户体验PASS。
