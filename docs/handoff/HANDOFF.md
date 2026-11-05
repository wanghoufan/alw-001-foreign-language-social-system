# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-05 13:10 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.8.31 / vc66**（APK `b8fa8b24…`；已装 Note 11 5G 与 Note 12T Pro；本轮将 commit）
> **V1.5.2 真机 PASS**：393×791 全屏 1:2、停止弹层、分享卡、原资料、按需翻译、归档尾部
> 真实 P066 录音 6 段→页面 6/归档 6/201/pending 0；继续录音 1/1；放弃不写档案

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`（旧条目在 `docs/archive/agent-pitfalls-*.md`）
- 阶段流水归档：`docs/archive/handoff-flow-20261031.md`、`docs/archive/handoff-flow-20261103-n05v12.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- **本轮证据**：V1.5.2 `docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`、`qa/t10-device/`
- 豆包接入说明：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/DOUBAO-TTS-INTEGRATION.md`；密钥文档 `docs/DOUBAO-TTS-KEY.md`
- 前序：V1.5.1 `docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md`；V1.5 `.../ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`
- 红城湖逐字原稿：`docs/archive/20261103-红城湖公园-实测文稿-逐字版-备份.md`
- 组合服务：`bash socialmate-v1.2/service-all.sh health | heal | up | down`（8790/8791/8781/8782）
- 真机取证：`node scripts/sm-cdp.mjs "<js>"`（adb forward + WebView DevTools；只连 127.0.0.1）
- 测量脚本：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/tools/`（`sm-device`、`person-density`）

## 1. 当前进展

### 1.1 已收口（细节见 `architecture-facts.md` / `CHANGELOG.md`）

- V1.4：TTS 前台服务 + 锁屏 45/45；Mac 归档 launchd 1800s；P016 交接。
- T3/0.8.20–0.8.27：Tailscale 断 WiFi PASS；一键开录 / 家庭 WiFi 选路；全链路 34 段、归档 201、复盘 12 候选。
- V1.5 / 0.8.29：单栏聊天、字幕 156px、四方向、阅读冻结、资料横条；双机与 120 句压测 PASS。
- V1.5.1 / 0.8.30：ASR 握手鉴权（401/403）、归档 401 刷新、断线重连、10 话题、现场密度；真机 4 分钟 40 段→201。
- P066 流式：`ASR_UPSTREAM=p066`，`sentence_type=1` 判 final、`end` 2500ms、补 `speaker_diarization`。

### 1.2 V1.5.2 与人物 / 豆包（2026-11-05，0.8.31/66）

- 全屏录音：隐藏 `.top` 与 5 Tab；单排「对象 / 状态 / ⋯ / 停止」；系统返回先退全屏、录音不停。
- 布局：对话区 `calc((100vh - 134px)/3)`（791 下 219px）+ 建议 flex；真机 219/438 = 0.500；首屏 5 条。
- 建议卡删朗读/复制，「中文」+「☆」同行；停止弹层三选项；分享卡 + 原资料页；按需翻译 `POST /api/ai/translate`。
- 原生 `stream()`：`finish()` 后等 `session/ended` 或 3s 再 `archive.end()`；真机 6/6 与 1/1。
- 人物档案：顶部「基本档案」按 `# 章节` 聚合；紧凑版 4563→1655，正文 17px / 英文 18px；见面前准备第二。
- 收藏：☆→★→☆ 可二次取消；收藏列表正文占满，复制/朗读/取消改为 32px 图标放正文下方。
- 豆包 TTS：`tts-adapter-doubao.mjs`，`X-Api-Key` + `seed-tts-2.0`；普通朗读与 N05「听本段 / 听词组 / 听中英」都优先豆包，失败回退系统 TTS；默认授权、不弹 confirm。
- 音色：设置页支持中文小何/云舟/Tina、英文 Tim/Dacey/Stokie，`localStorage` 持久化；账本 `TtsCache/ledger/doubao.json` 1 元，已用 0.0069。
- 构建：`release/SocialMate-0.8.31-vc66-debug.apk`，SHA-256 `b8fa8b24c6232aabeab661d7c379ef82f8c5f614c7583163daec669a1903b9a9`。

## 2. 下一步

1. **V1.5.2 已收口**：真机 A/B/C/E 与 D2–D5/F1 PASS；证据 `qa/QA-REPORT.md`、`qa/t10-device/`。
2. **长会话**：30 分钟 TTS 回环已跑（226 段/226 归档/201/pending 0，约 0.50 元）；真人 30 分钟仍待。
3. **人物详情**：基本档案/字号/收藏 toggle 已完成；如需继续压缩，先看 `qa/t10-device/12-person-readable.png`。
4. **豆包 TTS**：普通朗读与 N05 队列均优先豆包；设置页可切换中英音色；失败回退系统 TTS。
5. **P066 余项**：402 预算不足、300 秒自动结束、撤销 401。
6. **P016 跟进**：`P016-TRANSFER.md` 的 18791 鉴权/绑定、投递状态机、跨天补传、22:00 重排。
7. **Polly / 照片 / 第二台设备**：Polly 密钥与预算后补；红城湖 `photos:[]` NO_SOURCE；Android 14 FGS 未验。
8. **翻译预算**：DeepSeek 剩余 0.786 元；按需翻译一次约 0.0003 元，接近 0.01 元时 402。

## 3. 未完成 / NOT_RUN

- **真人 30 分钟**、Wi‑Fi↔蜂窝切换、来电/耳机/音频焦点（BG04）仍 NOT_RUN；30 分钟 TTS 回环不是真人验收。
- P066 流式 402/300s/撤销 NOT_RUN；真实 Amazon Polly NOT_RUN。
- 豆包真实账单以火山控制台为准；本地账本为估算（3 元/万字符）。
- 系统 TTS 回退路径仍保留；豆包失败时不会静默，会回退并发提示。
- 393×852 档未单独跑；本轮 393×791。
- 治理仓库待裁定（非本项目代码）：skill 仓库 S2 目录口径与 `com.alw.socialmate-stack` 是否补登。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得 `-k` 或跳过证书校验。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元、豆包 TTS 1 元；不得擅自调大。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway`，不 reset/clean 其他会话改动。
- 端口只停确属本仓库的进程；手机操作必须显式 `--serial`；不 commit/push/release 除非用户明确要求。
- **前台服务只用于朗读**：不得扩成后台录音、开机自启或常驻服务；通知栏不得出现原文/地点/人名。
- 对话翻译/豆包朗读不得用词典/模板冒充；密钥不进日志、文档、仓库（`.env` 已 gitignore）。

## 5. 三日流水

- 2026-11-03 V1.2/V1.3：私有地点 115→116；19 段入库；混合队列 + 词组 + 归档 33→85；0.8.12/0.8.13 真机。
- 2026-11-04：P066 流式 final 修复；V1.4 前台朗读 0.8.14/49；T3 断 WiFi 蜂窝 0.8.15/50；V1.5 聊天页 0.8.29/64。
- 2026-11-04：V1.5.1 握手鉴权/归档 401/断线重连/10 话题；0.8.30/65。
- 2026-11-05：V1.5.2 全屏压缩/停止弹层/分享卡/原资料/归档尾部；0.8.31/66；真机 A–F 通过。
- 2026-11-05：30 分钟 TTS 回环 226/226；人物基本档案聚合 + 紧凑 + 字号 + 收藏 toggle；豆包 TTS 接入、音色切换、N05 队列豆包、缓存与双记账修复。

## 6. 接续提示词

先读 §0–§6，按 §2 从 V1.5.2 证据与豆包朗读继续；未跑项见 §3。
证据先核 V1.5.2 `qa/QA-REPORT.md` 与 `qa/t10-device/`，预算看 `TtsCache/ledger/doubao.json`。