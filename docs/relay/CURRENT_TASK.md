# ALW-001 / P001 V1.7 R3-Final｜Note 12T Pro 5G 实用性最小收口｜用户批准并取消加密扩项

status: READY
task_id: SM-ALW001-20261107-N05-V17-R3-FINAL-MINIMAL
user_approved: true
approval: USER_APPROVED_R3_FINAL_20261107_WITH_SCOPE_CORRECTION_NO_NEW_ENCRYPTION
approved_at: 2026-11-07
priority: 10
target_project: ALW-001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
project_reader_id: 001
target_app_mode: AUTO_BY_WORKSPACE
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-V1.7-R3-Final-Minimal-20261107.md
routing_rules: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md
gui_dispatch_completed: false
human_gate: FINAL_ONCE
development_mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

send_text: 读取并执行：docs/plan/ALW001-N05-V1.7-R3-Final-Minimal-20261107.md

## 最新范围（覆盖旧 R3 的所有未完成扩项）
- 用户明确反对额外加密和越做越复杂；本轮**不得新做加密/HTTPS/TLS/双向同步架构/证书系统**。既有 `.smbak` 与 Tailscale 沿用，不拆不重写；不得开放公网或泄露私有资料。
- 目标仅：Note 12T Pro 真正使用 5G → 真实翻译/真人 ASR/豆包朗读 → 复盘正常跳转 → 专用测试资料备份恢复 → 回家按现有方式同步 → 一次性终验。
- 不测其他手机、不做全量回归、不新增 30 分钟压测；已通过能力直接复用。
- 上一个 READY 任务 SM-ALW001-20261106-N05-V17-R3-NOTE12TPRO-MOBILE 已由本指针接续替代，不是两条并行 READY；原计划文件及证据不删除。
- 仅写入 P001 的 `docs/plan` 和此 `CURRENT_TASK.md`，回读确认；**未执行 GUI 转发、未修改业务代码、未部署**。桌面转发只有用户明确触发“转发”并有真实 GUI 发送证据才能改 SENT。
