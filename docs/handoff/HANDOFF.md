# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-05 16:05 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.8.31 / vc66**（APK `b8fa8b24…`；已装 Note 11 5G 与 Note 12T Pro；上一提交 5ba9944）
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

## 1. 当前进展

### 1.1 已收口

- V1.4：TTS 前台服务 + 锁屏 45/45；Mac 归档 launchd 1800s；P016 交接。
- T3/0.8.20–0.8.27：Tailscale 断 WiFi PASS；一键开录 / 家庭 WiFi 选路；34 段、归档 201、复盘 12 候选。
- V1.5 / 0.8.29：单栏聊天、字幕 156px、四方向、阅读冻结、资料横条。
- V1.5.1 / 0.8.30：ASR 握手鉴权（401/403）、归档 401 刷新、断线重连、10 话题、现场密度。
- P066 流式：`ASR_UPSTREAM=p066`，`sentence_type=1` 判 final、`end` 2500ms、补 `speaker_diarization`。

### 1.2 V1.5.2 / 人物 / 豆包 / N05（2026-11-05，0.8.31/66）

- 全屏录音：隐藏 `.top` 与 5 Tab；单排「对象 / 状态 / ⋯ / 停止」；系统返回先退全屏、录音不停。
- 布局：对话区 `calc((100vh - 134px)/3)`；真机 219/438 = 0.500；首屏 5 条。
- 停止弹层三选项；分享卡 + 原资料页；按需翻译 `POST /api/ai/translate`；原生 `stream()` 等 `session/ended` 或 3s。
- 人物档案：顶部「基本档案」按章节聚合；紧凑版 4563→1655，正文 17px / 英文 18px；见面前准备第二；收藏 ☆→★→☆。
- N05 控制栏：`position:sticky; top:56px`，高 **105px**；滚到第 2 段后仍可暂停/停止。
- 暂停/继续：豆包走 Web Audio `suspend()/resume()`，已修 `TTS_NOT_PLAYING`；原生仅回退。
- 豆包 TTS：`tts-adapter-doubao.mjs`，`X-Api-Key` + `seed-tts-2.0`；普通朗读与 N05 全按钮优先豆包（`data-tts-lang`）。
- 连续播放：`<audio>` 第二项起被 WebView autoplay 拦截，已改 Web Audio（`AudioContext` + `BufferSource`）；15/15、12/12 全部 `doubao`。
- 统一音色：设置页只保留一个「朗读音色（中英统一）」，默认 Tina老师；只列小何/云舟/Tina 三个可读中英音色；旧英文音色值回退 Tina。
- 防叠加：切换/停止先 `stop` 旧 `AudioBufferSource`；旧队列 await 后检查 `SMQ` 不再续播；循环按钮点击高亮并提示。
- 中文整理：只改 `blk-hc-2/4/11/17`（残句标「（原话未完）」、删「知道吗/什么的/嘛」、去重复「孤单」），记录 revision 3→4，备份 `.bak-20261105-cn`；其余 15 段不动。
- N05 对照区：原文折叠、中文只显示一次；**英 A/B 平铺，不折叠**（用户明确要求）。
- GPT 练习 Prompt：中文考短语/整段，说一种自然表达对上大意即算掌握；英文 A/B 只作参考（`by the lake` 即可）。
- 构建：`release/SocialMate-0.8.31-vc66-debug.apk`，SHA-256 `b8fa8b24c6232aabeab661d7c379ef82f8c5f614c7583163daec669a1903b9a9`。

## 2. 下一步

1. **V1.5.2 已收口**：真机 A/B/C/E 与 D2–D5/F1 PASS；证据 `qa/QA-REPORT.md`、`qa/t10-device/`。
2. **长会话**：30 分钟 TTS 回环已跑（226/226，约 0.50 元）；真人 30 分钟仍待。
3. **N05 阅读页**：控制栏吸顶/紧凑、暂停/继续、对照区去重、中文整理均已完成；下一步按反馈继续。
4. **豆包 TTS**：统一音色 + 防叠加 + 循环反馈已收口；真实账单以火山控制台为准。
5. **P066 余项**：402 预算不足、300 秒自动结束、撤销 401。
6. **P016 跟进**：`P016-TRANSFER.md` 的 18791 鉴权/绑定、投递状态机、跨天补传、22:00 重排。
7. **Polly / 照片 / 第二台设备**：Polly 密钥与预算后补；红城湖 `photos:[]` NO_SOURCE；Android 14 FGS 未验。
8. **翻译预算**：DeepSeek 剩余 0.78 元；按需翻译一次约 0.0003 元。

## 3. 未完成 / NOT_RUN

- **真人 30 分钟**、Wi‑Fi↔蜂窝切换、来电/耳机/音频焦点（BG04）仍 NOT_RUN；TTS 回环不是真人验收。
- P066 流式 402/300s/撤销 NOT_RUN；真实 Amazon Polly NOT_RUN。
- 豆包真实账单以火山控制台为准；本地账本为估算（3 元/万字符）。
- 中文整理只覆盖 4 段；其余 15 段经检查未发现明显口水词，保持原样。
- 393×852 档未单独跑；真机 393×791。
- 治理仓库待裁定：skill 仓库 S2 目录口径与 `com.alw.socialmate-stack` 是否补登。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得 `-k` 或跳过证书校验。
- 腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元、豆包 TTS 1 元；不得擅自调大。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway`，不 reset/clean 其他会话改动。
- 端口只停确属本仓库的进程；手机操作必须显式 `--serial`；不 commit/push/release 除非用户明确要求。
- **前台服务只用于朗读**：不得扩成后台录音、开机自启或常驻服务；通知栏不得出现原文/地点/人名。
- 对话翻译/豆包朗读不得用词典/模板冒充；密钥不进日志、文档、仓库（`.env` 已 gitignore）。
- **不确定的显示改动先不做**：用户没要求的折叠/精简不要自作主张；本轮误折叠英 B 已回退。

## 5. 三日流水

- 2026-11-03 V1.2/V1.3：私有地点 115→116；19 段入库；混合队列 + 词组 + 归档 33→85；0.8.12/0.8.13 真机。
- 2026-11-04：P066 流式 final 修复；V1.4 0.8.14/49；T3 0.8.15/50；V1.5 0.8.29/64；V1.5.1 0.8.30/65。
- 2026-11-05：V1.5.2 全屏压缩/停止弹层/分享卡/原资料/归档尾部；0.8.31/66；真机 A–F 通过。
- 2026-11-05：30 分钟 TTS 回环 226/226；人物档案聚合/紧凑/收藏 toggle；豆包 TTS 接入与双记账修复。
- 2026-11-05：豆包改 Web Audio、统一音色、防叠加、暂停/吸顶、循环反馈；GPT 练习判定放宽；中文整理写回 4 段（版本 4）。

## 6. 接续提示词

先读 §0–§6，按 §2 从 N05 阅读页与豆包朗读继续；未跑项见 §3。
证据先核 V1.5.2 `qa/QA-REPORT.md` 与 `qa/t10-device/`，预算看 `TtsCache/ledger/doubao.json`。