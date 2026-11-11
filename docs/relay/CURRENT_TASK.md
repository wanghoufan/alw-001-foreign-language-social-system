# P001 / ALW-001｜N07 现场中文译英 + 暂停继续 + 聊天顶部收口｜已批准

status: READY
task_id: SM-ALW001-20261111-N07-LIVE-ZHEN-PAUSE-TOPBAR
user_approved: true
approved_at: 2026-11-11
approval: USER_APPROVED_P001_N07_20261111_LIVE_ZHEN_PAUSE_TOPBAR
priority: 10
target_project: ALW-001
target_project_folder: alw-001-外语社交系统
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
project_reader_id: 001
target_app_mode: AUTO_BY_WORKSPACE
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
instruction_file: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/P001-N07-LiveZhToEn-PauseResume-ChatTopbar-V1.0-Approved-20261111.md
routing_rules: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md
gui_dispatch_completed: false
human_gate: APPROVED_N07_IMPLEMENTATION
development_mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

send_text: 读取并执行：docs/plan/P001-N07-LiveZhToEn-PauseResume-ChatTopbar-V1.0-Approved-20261111.md

## N07 本轮批准及执行边界
- 目标：面对面录音中，本人说中文→点「译英」→同一句下出现一条可直接照念的英文；暂停/继续与结束本轮真实分离；聊天常用操作搬到页面顶部。
- 禁止：中英识别模式开关、发送/推送/自动朗读、第二套 AI 或云网关、重做其他四个 Tab、为演示牺牲真实数据。
- **真机验收机：Redmi Note 12T Pro（用户 2026-11-11 明确指令）。** 计划原文写 OPPO PLG110，本轮不适用；相关项记 NOT_RUN，不写成 PASS。
- 复用现有 `/api/ai/draft-en`、腾讯混合 ASR（`16k_zh_en_speaker_2.0`）与既有预算；发布/推送/付费新服务仍需单独同意。
- 旧 N06 任务 `SM-ALW001-20261109-N06-HG-FESTIVAL-PROTOTYPE` 及其证据、未完成项原样保留，见下方历史区。

## N07 进展（2026-11-11）
- 原生：`pauseRecording()/resumeRecording()/recordingState()`；暂停真停麦与 WS、停前台服务、按段结算预算、不结束归档；继续回同一应用层会话。
- 页面：顶栏迁入 `#topActions`（人物 44px 首字母按钮 + 状态 + 译英 + 开始/暂停/继续 + 一级结束 + ⋯）；字幕区 : 建议区 = 2:1（真机 449/224/50）。
- 译英：中文气泡按钮为「译英」，点选优先、走 `/api/ai/draft-en` 回填同一气泡；英文气泡保留「翻译」；消除空白译文块；同 id 不重复请求。
- 修复 P0：腾讯只给 `spk_N`，`who=unknown` 导致译英永不触发。
- 真机：0.9.32/vc100；中英混说识别正确、译英/翻译双向通过、暂停零新字幕、继续同轮追加；SHA `8336ecb6…edfa`；覆盖安装保数据。
- 未完成：3 分钟长测、430px 带「结束」实测、暂停的声学证据、真人语音复核。

## 历史：N06 阶段（已完成部分，保留）

### 阶段 2 进展（2026-11-09）
- 正式页面已接入：软件→话题（五 Tab 不变）、47 节日筛选与双语复制、我的作品原功能、海南 13 地点 26 图轮播/全屏、默认 SYSTEM、聊天节日小标签、游玩记录识别预览。
- 网页验证：`socialmate-v1.2/verify-n06-s2.mjs` PASS 26/26；结果 `n06-s2-result.json`，截图 `qa/n06-s2/`。
- APK：0.9.13 / vc81，SHA `d04635a5…9af8`，覆盖安装 Success，Key/配置/SQLite 大小保留。
- 真机：PASS；证据 `docs/qa/2026-11-09-n06-s2/README.md`。

### 阶段 3 进展（2026-11-10）
- 话题补齐 170 条（日常 20 / 文化 20 / 健身 46 / 更多 84），每条含中英说明、双语问句与来源；节日 47 条核验为 fixed 44 / pending 3。
- 接入字幕主动点词查询（`/api/ai/term` + `DirectCloud.term()`），默认不扫描，缓存 120 条。
- 版本 0.9.28 / vc96；网页 29/29；真机通过。
- 未完成：3 条海南节日来源；录音中并发点词；记录保存落库。

### 点词卡 v2（2026-11-10）
- 中文解释 + ENGLISH + 四类顺势问（喜好/对比/体验/收获），每条单独复制。
- 版本 0.9.28 / vc96；网页 29/29；真机复验通过。
