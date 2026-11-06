# ALW-001 N05 V1.7 R2｜手机本地优先 + 外出 AI/ASR 脱 Mac｜用户已批准

status: PARTIAL
task_id: SM-ALW001-20261105-N05-V17-OFFLINE-FIRST
user_approved: true
approval: USER_APPROVED_V17_OFFLINE_FIRST_CLOUD_AI_20261105
approved_at: 2026-11-05
priority: 10
target_project: ALW-001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
project_reader_id: 001
target_app_mode: AUTO_BY_WORKSPACE
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-V1.7-R2-CrossValidated-Execution-20261105.md
routing_rules: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md
gui_dispatch_completed: false
human_gate: FINAL_ONCE
development_mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

send_text: 读取并执行：docs/plan/ALW001-N05-V1.7-R2-CrossValidated-Execution-20261105.md

## 最新批准事项
- 手机离线独立启动 + 本地读写完整资料 + 局域网同步/备份；外出 4G/5G 下 AI 翻译、真实流式 ASR 必须不依赖家里 Mac/P066 本地进程。
- 不重做已完成的五 Tab UI、V1.6 活资料库、原有同意/归档/预算；P066 只读参考，跨项目写入另走明确授权。
- S0 预检与安全备份先行；本地 P0 不受云资源申请拖累；云端发布需验证服务、权限、费用和真实手机联网。
- 旧任务原始指针保存在 `docs/relay/archive/SM-ALW001-20261105-N05-V16-LIVE-CARDS-PRIOR-READY.md`；V1.6 MVP 真机已部分通过，但备份恢复/相机/其它 NOT_RUN 不能标全部完成。
- 当前工作树 dirty；只允许 1 名主开发者在该工作区写入。不自行 commit/push/生产发布或提升费用上限。
- 只有用户显式说“转发”才尝试 GUI 投递；本次仅写本地并回读，不触发 GUI。
## 本轮执行结果（2026-11-06）
- 已完成：C0 四份盘点；C1 本机 origin（127.0.0.1 随机端口 + APK assets）；C2 SQLite 本地真源与迁移；C3 备份 ZIP 导出 39,802B / 恢复 imported 41 + media 3；C4 云网关 33 测试通过；C5 断网冷启动 666ms，五 Tab/人物 8/收藏 1/海南 116/地点 36/搜索/卡片 CRUD 全通过。
- 未完成：4G/5G 真实 AI/ASR/TTS、300s、393×852、深色/拍照、P50/P95、备份加密、LAN 同步、公开 115 图片离线、C4 部署。
- **方案 2（用户选择）**：手机端 Key + Android Keystore + DeepSeek/豆包/**腾讯 ASR** 直连已实现；假 Key 验证请求到达厂商（DeepSeek 401→403、豆包 401/45000010→403、腾讯 WS 被拒触发重连），清除后 503 / 回退 Mac；真实 Key 待用户录入。详见 `docs/plan/ALW001-N05-V1.7-R2/DIRECT-KEY-MODE.md`。
- 结论：V1.7 不得标 DONE；证据与不合规项见 `docs/plan/ALW001-N05-V1.7-R2/EXECUTION-REPORT-20261106.md`。
