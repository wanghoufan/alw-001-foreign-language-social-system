# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-06 13:56 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.9.2 / vc70（本机 origin + SQLite 本地真源）；0.9.1/vc69 为回滚包**
> **V1.7 R2 已收口**：C0–C5、方案 2 直连、加密备份、LAN 同步、性能、相机、P0/P1 全关；真实 4G 未测（手机 SIM ABSENT）
> 报告：`docs/plan/ALW001-N05-V1.7-R2/EXECUTION-REPORT-20261106.md`；复盘：`.../RETRO-20261106.md`；实现：`.../IMPLEMENTATION-NOTES.md`

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`（旧条目在 `docs/archive/agent-pitfalls-*.md`）
- 阶段流水归档：`docs/archive/handoff-flow-20261031.md`、`docs/archive/handoff-flow-20261103-n05v12.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- **本轮证据**：V1.5.2 `.../V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`、`qa/t10-device/`；V1.7 `docs/plan/ALW001-N05-V1.7-R2/`（含 PERF/ASR-AUDIT/RETRO）
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

- V1.4–V1.5.1 已收口，细节见 `docs/archive/handoff-flow-*.md`：TTS 前台服务、T3 Tailscale、单栏聊天、ASR 鉴权/归档刷新/断线重连、P066 流式 final。

### 1.2 V1.5.2 / 人物 / 豆包 / N05（2026-11-05，0.8.31/66）

- 全屏录音单排控制；对话区 219/438=0.500；停止弹层、分享卡、按需翻译；人物档案聚合/紧凑/收藏 toggle。
- 豆包 TTS：Web Audio 连续播放、切换前 `smStopAudio`、暂停/继续 `AudioContext.suspend()/resume()`；音色中英统一；预算上限 10 元，超额停止不再静默回退。
- 中文整理只改 4 段（revision 3→4）；GPT 练习中文对上大意即算掌握；弱网 `/v12` no-cache+ETag+gzip，非 WiFi 走 Tailscale。
- 构建 0.9.1/vc69 `dce4519b…`；V1.5.2 真机 A–F 通过；30 分钟 TTS 回环 226/226。
- **V1.6 活资料库**：`private-cards.mjs` 三类卡片；三页统一「＋新建/回收站」；关于我中英直显；`/api/ai/draft-en`；原生 `onShowFileChooser`。分角色审查 P0 5 条已整改、复审可发布；新增 `sm-card-regression-local-zh`（项目级）与 `report-evidence-discipline-local-zh`（中央、SM 未导入）；证据见 `docs/qa/V1.6-Living-Card-Library/`。
- **V1.7 R2（0.9.2/vc70，SHA `5cfb736c…`，APK 约 55MB）**：本机 origin + 211 张离线 webp + SQLite 真源；断网冷启动 P50 1039/P95 1064ms；五 Tab/人物 8/收藏 1/海南 116/地点 36/搜索/CRUD 通过；393×852 无横向溢出、深色 `#192d35`；加密备份 `.smbak`、LAN 同步 push/pull/status、方案 2 三项 Key、真实 300s 直连（15 段 final）、相机入卡片（rev 10/media 5）、原生 TTS 直连（direct-a34c…）。修卡片保存、ASR P0-1/P0-2、P1-2/3/5/6/7、录音按钮；海南重负载 P95 205.3ms。切后台 12s/锁屏 10s 录音保持。真实 4G 未测（SIM ABSENT）。

## 2. 下一步

1. **5G/Tailscale 同步已验证**：Note 12T Pro 关 WiFi 后 push 76,106B、pull `imported 2`（46.6s）；另一台无 SIM 的 4G 仍 NOT_RUN。
2. **C3 剩余**：LAN 双向冲突合并、传输加密；5G pull 46.6s 可做压缩/分页优化。
3. **C4 云端（可选）**：需平台/账号/域名/费用授权，未部署。
4. **工作树**：已提交 `0d5b5d4`/`86ccab0` 并推送 `main`；本轮 Key/5G 修复待提交；未跟踪 `sp` 与 `V1.1-baseline.html.bak-*` 为本地临时。

## 3. 未完成 / NOT_RUN

- **真人 30 分钟**、Wi‑Fi↔蜂窝切换、来电/耳机/音频焦点（BG04）仍 NOT_RUN；TTS 回环不是真人验收。
- 真实 4G NOT_RUN：手机 `gsm.sim.state=ABSENT`、无 rmnet，关 WiFi 后腾讯直连无网。
- P066 流式 402/300s/撤销 NOT_RUN；真实 Amazon Polly NOT_RUN；豆包账单以火山控制台为准（本地为估算）。
- 中文整理只覆盖 4 段；其余 15 段未发现明显口水词。
- V1.6/V1.7 剩余：LAN 双向冲突合并、传输加密；App 内相机入口已做。
- 241M 日志 `qa/t4-device/` 待清理；治理仓库 S2 口径与 `com.alw.socialmate-stack` 待裁定。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得 `-k` 或跳过证书校验。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元、豆包 TTS 10 元；不得擅自调大。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway`，不 reset/clean 其他会话改动。
- 端口只停确属本仓库的进程；手机操作必须显式 `--serial`；不 commit/push/release 除非用户明确要求。
- **前台服务**：朗读用 `mediaPlayback`、录音用 `microphone`；不得扩成开机自启或常驻；通知栏不得出现原文/地点/人名。
- 对话翻译/豆包朗读不得用词典/模板冒充；密钥不进日志、文档、仓库（`.env` 已 gitignore）。
- **不确定的显示改动先不做**：用户没要求的折叠/精简不要自作主张；本轮误折叠英 B 已回退。

## 5. 三日流水

- 2026-11-03：V1.2/V1.3 私有地点 116、19 段入库、归档 85（细节见 archive）。
- 2026-11-04：P066 流式 final；V1.4–V1.5.1（0.8.14/49 → 0.8.30/65）。
- 2026-11-05：V1.5.2 0.8.31/66；30 分钟 TTS 226/226；豆包 Web Audio/暂停吸顶/预算 10；V1.6 0.9.1/69。
- 2026-11-06：V1.7 C0–C5 收口；方案 2 三项 Key 直连（DeepSeek/豆包/腾讯）、加密备份、LAN 同步、性能（冷启动 P95 1064ms、Tab 最大 P95 205.3ms）、相机入卡片、P0/P1 全关；真实 4G 因 SIM ABSENT NOT_RUN。

## 6. 接续提示词

先读 §0–§6；V1.7 R2 已收口，剩 LAN 双向/加密与真实 4G（需插卡）。
证据先核 `EXECUTION-REPORT-20261106.md`、`RETRO-20261106.md`、`PERF-REPORT.md`。