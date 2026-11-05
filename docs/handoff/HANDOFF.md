# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-05 19:10 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.9.1 / vc69**（APK `dce4519b…`；已装 Note 11 5G；上一提交 d51360d）
> **V1.5.2 真机 PASS**；豆包朗读、统一音色、暂停/吸顶、中文整理、练习判定均已在 Note 12T 复测
> 真实 P066 录音 6 段→页面 6/归档 6/201/pending 0；30 分钟 TTS 回环 226/226

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`（旧条目在 `docs/archive/agent-pitfalls-*.md`）
- 阶段流水归档：`docs/archive/handoff-flow-20261031.md`、`docs/archive/handoff-flow-20261103-n05v12.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- **本轮证据**：V1.5.2 `docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`、`qa/t10-device/`
- 豆包接入说明：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/DOUBAO-TTS-INTEGRATION.md`；密钥文档 `docs/DOUBAO-TTS-KEY.md`
- 前序：V1.5.1 `.../ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md`；V1.5 `.../ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`
- 红城湖逐字原稿：`docs/archive/20261103-红城湖公园-实测文稿-逐字版-备份.md`
- 组合服务：`bash socialmate-v1.2/service-all.sh health | heal | up | down`（8790/8791/8781/8782）
- 真机取证：`node scripts/sm-cdp.mjs "<js>"`（adb forward + WebView DevTools；只连 127.0.0.1）
- 测量脚本：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/tools/`（`sm-device`、`person-density`）
- **项目级 skill**：`webview-media-control-guard-local-zh/SKILL.md`（改 WebView 连续音频必须先调用并出三项回执；`AGENTS.md` 已点名）
- 界面偏好接口：`GET/POST /v12/api/prefs`（`SocialMate-Data/Prefs/ui.json`）

## 1. 当前进展

### 1.1 已收口

- V1.4：TTS 前台服务 + 锁屏 45/45；Mac 归档 launchd 1800s；P016 交接。
- T3/0.8.20–0.8.27：Tailscale 断 WiFi PASS；一键开录 / 家庭 WiFi 选路；34 段、归档 201。
- V1.5 / 0.8.29：单栏聊天、字幕 156px、四方向、阅读冻结、资料横条。
- V1.5.1 / 0.8.30：ASR 握手鉴权（401/403）、归档 401 刷新、断线重连、10 话题、现场密度。
- P066 流式：`ASR_UPSTREAM=p066`，`sentence_type=1` 判 final、`end` 2500ms、补 `speaker_diarization`。

### 1.2 V1.5.2 / 人物 / 豆包 / N05（2026-11-05，0.8.31/66）

- 全屏录音：隐藏 `.top` 与 5 Tab；单排「对象 / 状态 / ⋯ / 停止」；系统返回先退全屏、录音不停。
- 对话区 `calc((100vh - 134px)/3)`；真机 219/438 = 0.500，首屏 5 条；停止弹层三选项；分享卡 + 原资料页；按需翻译（DeepSeek 单句、`consent:true`）。
- 人物档案：顶部「基本档案」按章节聚合；紧凑版 4563→1655；收藏 ☆⇄★；N05 控制栏 `sticky; top:56px`、高 105px。
- 豆包 TTS（`tts-adapter-doubao.mjs`，`X-Api-Key` + `seed-tts-2.0`）：Web Audio 连续播放、切换前 `smStopAudio`、暂停/继续走 `AudioContext.suspend()/resume()`；设置页只留一个「朗读音色（中英统一）」，默认 Tina。
- 偏好跨网络：音色/引擎改由 `/v12/api/prefs` 服务端持久化（局域网与 Tailscale 共用一份）。
- 预算：豆包 1→10 元；`TTS_BUDGET_*` / `RATE_LIMITED` 停止并提示，**不再静默回退系统声**。
- 中文整理：只改 4 段（`blk-hc-2/4/11/17`），revision 3→4，备份 `.bak-20261105-cn`。
- GPT 练习：中文说一种自然表达对上大意即算掌握；英文 A/B 仅作参考。
- 构建：`release/SocialMate-0.9.1-vc69-debug.apk`，SHA-256 `dce4519b…`。
- 弱网首屏：`/v12` 改 `no-cache`+ETag+gzip；地点详情/私有地点本地缓存，断网显「离线缓存」；非 WiFi 自动走 Tailscale。
- **V1.6 活资料库**：`private-cards.mjs` 三类卡片；三页统一「＋新建/回收站」；关于我中英直显；`/api/ai/draft-en`；原生 `onShowFileChooser`。分角色审查 P0 5 条已整改、复审可发布；新增 `sm-card-regression-local-zh`（项目级）与 `report-evidence-discipline-local-zh`（中央、SM 未导入）；证据见 `docs/qa/V1.6-Living-Card-Library/`。

## 2. 下一步

1. **V1.6 活资料库 MVP 已收口（0.9.1/69）；分角色审查 P0 全关**：剩覆盖层入口、备份恢复、相机拍照、393×852、Tailscale origin；见 `qa/FINAL-REPORT.md` 与 `docs/qa/V1.6-Living-Card-Library/`。
2. **工作树待收口**：4 个未提交文件（`CHANGELOG.md`、`docs/relay/CURRENT_TASK.md`、`ai-gateway/server.mjs`、`socialmate-v1.2/index.html`）+ 未跟踪 `AGENTS.md`、`apps/dialog-kit`、V1.6 计划、`docs/review/`、项目级 skill；未获授权前不 commit/push。
3. **长会话**：30 分钟 TTS 回环 226/226（约 0.50 元）；真人 30 分钟仍待。
4. **P066 余项**：402 预算不足、300 秒自动结束、撤销 401。
5. **P016 跟进**：`P016-TRANSFER.md` 的 18791 鉴权/绑定、投递状态机、跨天补传、22:00 重排。
6. **Polly / 照片 / 第二台设备**：Polly 密钥与预算后补；红城湖 `photos:[]` NO_SOURCE；Android 14 FGS 未验。
7. **翻译预算**：DeepSeek 剩余 0.78 元；按需翻译一次约 0.0003 元。

## 3. 未完成 / NOT_RUN

- **真人 30 分钟**、Wi‑Fi↔蜂窝切换、来电/耳机/音频焦点（BG04）仍 NOT_RUN；TTS 回环不是真人验收。
- P066 流式 402/300s/撤销 NOT_RUN；真实 Amazon Polly NOT_RUN。
- 豆包真实账单以火山控制台为准；本地账本为估算（3 元/万字符，当前上限 10 元）。
- 中文整理只覆盖 4 段；其余 15 段经检查未发现明显口水词，保持原样。
- 393×852 档未单独跑；真机 393×791。
- V1.6 未做：相机拍照、覆盖层前端入口、备份/恢复、393×852；测试卡已软删在回收站。
- 241M 日志 `qa/t4-device/` 待清理；治理仓库 S2 口径与 `com.alw.socialmate-stack` 待裁定。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得 `-k` 或跳过证书校验。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元、豆包 TTS 10 元；不得擅自调大。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway`，不 reset/clean 其他会话改动。
- 端口只停确属本仓库的进程；手机操作必须显式 `--serial`；不 commit/push/release 除非用户明确要求。
- **前台服务只用于朗读**：不得扩成后台录音、开机自启或常驻服务；通知栏不得出现原文/地点/人名。
- 对话翻译/豆包朗读不得用词典/模板冒充；密钥不进日志、文档、仓库（`.env` 已 gitignore）。
- **不确定的显示改动先不做**：用户没要求的折叠/精简不要自作主张；本轮误折叠英 B 已回退。

## 5. 三日流水

- 2026-11-03 V1.2/V1.3：私有地点 115→116；19 段入库；混合队列 + 词组 + 归档 33→85；0.8.12/0.8.13 真机。
- 2026-11-04：P066 流式 final 修复；V1.4 0.8.14/49；T3 0.8.15/50；V1.5 0.8.29/64；V1.5.1 0.8.30/65。
- 2026-11-05：V1.5.2 全屏压缩/停止弹层/分享卡/原资料；0.8.31/66；真机 A–F 通过。
- 2026-11-05：30 分钟 TTS 回环 226/226；人物档案聚合/紧凑/收藏 toggle；豆包 TTS 与双记账修复。
- 2026-11-05：豆包 Web Audio、统一音色、防叠加、暂停/吸顶；音色跨网络持久化；预算 1→10 元；项目级 skill 与 V1.6 计划入库。
- 2026-11-05：弱网加速 0.8.32/67；V1.6 活资料库 MVP 0.9.1/69（卡片 CRUD/软删恢复/媒体/AI 草稿）。
- 2026-11-05：V1.6 分角色 4 审查（P0 5）→ 整改（原子写/恢复冲突/图片/双入口/分享）→ 独立复审 P0 全关、158 测试；按用户选择保持未提交。

## 6. 接续提示词

先读 §0–§6；V1.6 已收口，等用户发布/提交指令，剩余项见 §3。
证据先核 `docs/qa/V1.6-Living-Card-Library/` 与 V1.6 计划目录 `qa/`。