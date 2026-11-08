# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-08 18:25 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.9.12 / vc80（OPPO PLG110 已装机）；0.9.2/vc70 为上一版，0.9.1/vc69 回滚包**
> **V1.7 R3 PARTIAL**：蜂窝/对话/双人分离/豆包原生队列已通过；真人字幕、豆包听音、T4 实景仍缺
> 报告：`docs/plan/ALW001-N05-V1.7-R2/EXECUTION-REPORT-20261106.md`；R3 状态：`docs/plan/ALW001-N05-V1.7-R3/STATUS-20261107.md`

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
- **媒体守卫**：中央 `webview-media-control-guard-local-zh`（改 WebView 连续音频必须先调用并出回执；`AGENTS.md` 已点名）
- 界面偏好接口：`GET/POST /v12/api/prefs`（`SocialMate-Data/Prefs/ui.json`）

## 1. 当前进展

### 1.1 已收口

- V1.4–V1.5.1 已收口，细节见 `docs/archive/handoff-flow-*.md`：TTS 前台服务、T3 Tailscale、单栏聊天、ASR 鉴权/归档刷新/断线重连、P066 流式 final。

### 1.2 V1.5.2 / 人物 / 豆包 / N05（2026-11-05，0.8.31/66）

- V1.5.2：全屏录音单排控制、停止弹层、分享卡、按需翻译；豆包 Web Audio 连续播放与暂停/继续，预算 10 元；中文整理 4 段；0.9.1/vc69。
- V1.6：三类活资料库、三页「新建/回收站」、`/api/ai/draft-en`、原生文件选择；分角色审查 P0 全整改；`sm-card-regression-local-zh` 项目级。
- **V1.7 R2（0.9.2/vc70，APK 约 55MB）**：本机 origin + 211 张离线 webp + SQLite 真源；断网冷启动 P50 1039/P95 1064ms；五 Tab/人物 8/收藏 1/海南 116/地点 36/搜索/CRUD 通过；393×852 深色 `#192d35`；加密备份 `.smbak`、LAN 同步、方案 2 三项 Key、300s 直连、相机入卡片、原生 TTS 直连。修卡片保存、ASR P0-1/P0-2、P1-2/3/5/6/7、录音按钮；海南重负载 P95 205.3ms。
- **V1.7 R3（2026-11-07，蜂窝，PARTIAL）**：蜂窝独立冷启动、五 Tab、切网录音保持、Tailscale 同步、覆盖安装全 PASS；Key 误报修复；`AsrBudget` 30 分钟/日费用闸；300 秒续接；备份含原文 27 条、导入 `imported 2/conflicts 8`；未关联人物录音可用。**外放双音色双角色对话**：ASR 得 `spk_0/spk_1`、页面「朋友/我」、13/15 归属正确；AI 接话/追问/分享正常；豆包 3 段连续+暂停/继续/停止通过。真人字幕、豆包听音、T4 实景仍缺。
- **OPPO 换机（2026-11-08，0.9.12/vc80）**：PLG110 / Android 17 / ColorOS 17；迁移 people 8、cards 1、favorites 1、privatePlaces 1、placeRecords 1、practice 4、media 3；覆盖安装保留 Key 与数据。页面字号线（正文 19/标题 23/控件 15/最小 14）、底部双份安全区留白（导航 107→62px）、人物字母头像（117→76px）、卡片 3 行截断恢复（463→296px）。ASR 默认 `mac` → 切 `direct`；原生 TTS 默认 `system` → 有豆包 Key 默认 `remote`，修复 `RemoteTtsAdapter` 线程池 release 后复用异常；日志 `direct doubao ok`，3 段队列与暂停/继续/停止通过。

## 2. 下一步

1. **用户现场确认**：OPPO 学习页点「听本段」确认出声（底层队列已验走豆包）；ColorOS 自启动/后台/电池已由用户设置。
2. **R3 收尾（需用户在场）**：A04 真人中英字幕、A06 豆包听音、T4 离 Wi-Fi 实景。
3. **A08 夹具**：`scripts/v17-backup-restore.mjs` 备份不含新增收藏导致断言失败；修后补跑。
4. **C3 剩余**：LAN 双向冲突合并、传输加密；5G pull 46.6s 可优化。
5. **工作树**：29 项待提交（含并行会话改动，需拆分；未授权不 commit）。

## 3. 未完成 / NOT_RUN

- **真人 30 分钟**、来电/耳机/音频焦点（BG04）仍 NOT_RUN；TTS 回环不是真人验收。
- **R3 真人项未完成**：A04 中英字幕真机采集、A06 豆包听音、T4 离 Wi-Fi 实景；A08 恢复夹具待修。
- **OPPO 待确认**：学习页「听本段」UI 路径未点开（底层队列已验豆包）；ColorOS 后台保活未做长时观察；系统无 TTS 引擎，原生队列已切豆包。
- P066 流式 402/300s/撤销 NOT_RUN；真实 Amazon Polly NOT_RUN；豆包账单以火山控制台为准。
- V1.6/V1.7 剩余：LAN 双向冲突合并、传输加密；App 内相机入口已做。
- 241M 日志已归档 `.local/archive/v151-t4-device-logcat-20261102.tar.gz`（18M）；治理仓库 S2 口径待裁定。
- 本轮未 commit/push（用户未授权，按 §4 红线）。

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


- 2026-11-05：V1.5.2 0.8.31/66；30 分钟 TTS 226/226；V1.6 0.9.1/69。
- 2026-11-06：V1.7 C0–C5 收口；方案 2 三项 Key 直连、加密备份、LAN 同步、性能、相机入卡片、P0/P1 全关。
- 2026-11-07：R3 蜂窝实测；单/双音色对话；真人字幕与 T4 实景仍 PARTIAL。
- 2026-11-08：OPPO 换机迁移；字号/留白/头像/卡片修复（0.9.9）；ASR 直连与原生豆包队列修复（0.9.12）。

## 6. 接续提示词

先读 §0–§6；当前 0.9.12/vc80 在 OPPO 可用，剩真人验收与学习页确认。
证据核 `STATUS-20261107.md`、`docs/qa/2026-11-08-oppo-record-audio/`、`EXECUTION-REPORT-20261106.md`。