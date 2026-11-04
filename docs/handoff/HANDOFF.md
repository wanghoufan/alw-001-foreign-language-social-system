# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-04 23:15 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12
> **版本：Android 0.8.30 / vc65**（APK `794e68a8…`；HEAD `fc2379c`，工作树未提交）
> **V1.5.1 已收口**：握手鉴权 / 归档 401 / 10 话题 / 393px 密度 / 断线重连 PASS；真人长会话、蜂窝切网、来电/耳机 NOT_RUN
> **8781 归档端已恢复；QA 假端与设备 fixture 已清理**（过程见 V1.5.1 `qa/QA-REPORT.md`）

## 0. 常驻指针

- 架构 / 端口 / 版本 / 构建：`docs/architecture-facts.md` ｜ 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`（旧条目在 `docs/archive/agent-pitfalls-*.md`）
- 阶段流水归档：`docs/archive/handoff-flow-20261031.md`、`docs/archive/handoff-flow-20261103-n05v12.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- **本轮证据**：V1.5 `docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`；P066 `qa/20261104-p066/REPORT.md`；T3 `qa/20261104-t3/REPORT.md`；V1.4 `qa/20261104-t5/REPORT.md`
- V1.3 证据：`docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5/REPORT.md`
- 红城湖逐字原稿：`docs/archive/20261103-红城湖公园-实测文稿-逐字版-备份.md`
- 组合服务：`bash socialmate-v1.2/service-all.sh health | heal | up | down`（8790/8791/8781/8782）
- 真机取证工具：`node scripts/sm-cdp.mjs "<js>"`（adb forward + WebView DevTools；只连 127.0.0.1）

## 1. 当前进展

### 1.1 已收口（细节见 `architecture-facts.md` / `CHANGELOG.md`）

- V1.4：TTS 前台服务 + 锁屏 45/45；Mac 归档 launchd 1800s；P016 交接。
- T3：Tailscale 断 WiFi PASS；0.8.20 一键开录 / 家庭 WiFi 自动选路；0.8.25 全链路 34 段、归档 201、复盘 12 候选、Mia 写入 2 条。
- 0.8.27：最新置顶/回到最新、关于我卡、状态条/连接胶囊、会话级说话人映射、档案分节自动归类。

### 1.2 聊天页 UX V1.5（2026-11-04）

- 单栏：顶部对象/录音/连接/停止；字幕最近 3 句固定 156px，历史 44vh；四类建议每类 2–3 条、英文主中文折叠；阅读冻结 + 「有新的接话建议」；资料横条四类；诊断收进设置（细节见 architecture-facts）。
- 0.8.29/64；Note 12 Pro 120 句 DOM 压测 PASS；截图 `qa-v15-120.png`，报告 `qa/QA-REPORT.md`。
- P066 真机回归 PASS：麦克风恢复后 2 final、归档 201、复盘写档案；流式 401/403 PASS；402/300s/撤销 NOT_RUN；证据 `qa-v15-p066.png`。
- 0.8.29/64 已装 Note 12 Pro 与 Note 12T Pro；配对/令牌保留。

### 1.2b V1.5.1（2026-11-04，0.8.30/65）

- ASR WS 握手鉴权（`x-asr-token` + Origin/限流），非法握手先拒、不建 P066；真实负例 401/403，合法原生通过。
- 断线实测：停服务→看门狗拉起→客户端自动重连、字幕继续；阻断端口 3 次失败后停录并显示「已结束 · 可复盘」。
- TTS 自测入口 release 关闭、debug 白名单；归档 401 一次刷新重试（实测新令牌二次 201）。
- 10 话题接话模板，四方向各 3 条、0 重复、0 编造；页面建议区 23vh 独立滚动、结束吸底。
- 真机 TTS 回环（SYNTHETIC）10 final→归档 201→Mac 落地；证据 `docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md`。

### 1.3 P066 流式 ASR（2026-11-04 收口）

- `ASR_UPSTREAM=p066`，上游 `ws://127.0.0.1:8078/api/asr/stream`，令牌只在 `x-asr-token` 头；P066 侧 `sentence_type=1` 判 final、`end` 2500ms、补 `speaker_diarization`（备份 `stream-relay.mjs.bak-20261104-finalfix`，细节见 architecture-facts）。
- 真机闭环：2 条 final、`spk_0/spk_1`、归档 201、复盘写 Mia 档案；生产 `mode=p066`，本地腾讯账本停扣。
- Note 12T Pro 已配对，归档/复盘可选复跑。

## 2. 下一步

1. **用户人工试玩（唯一 Human Gate）**：红城湖第 1 段「循环 ×3」→ 熄屏放口袋 → 确认音质/顺序/控制。
2. **P066 余项**：402 预算不足、300 秒自动结束、令牌撤销 401；按零费用优先，不轻易烧额度。
3. **P016 跟进**：按 `P016-TRANSFER.md` 修 18791 鉴权/绑定、投递状态机、跨天补传、22:00 重排。
4. **Polly / 照片 / 第二台设备**：Polly 密钥与预算后补；红城湖 `photos:[]` NO_SOURCE；Android 14 FGS 未验。

## 3. 未完成 / NOT_RUN

- **BG04 来电/耳机拔出/音频焦点** NOT_RUN：现场无耳机、无法制造来电；`AUDIO_BECOMING_NOISY` 为系统保护广播，`am broadcast` 被拒。代码路径已接（暂停且不自动恢复），但无真实事件证据。
- **蜂窝下原生录音** NOT_RUN：配对已完成（读归档 200、上传 201），但断 WiFi 后 Tailscale relay 曾超时，未跑完整蜂窝录音会话。
- ~~**ASR 端点无握手鉴权、`AsrClient` 无自动重连**~~（V1.5.1 已修：握手鉴权 PASS；服务中断重连 PASS；Wi‑Fi↔蜂窝切换 NOT_RUN）。
- **P066 流式 402/300s/撤销令牌** NOT_RUN：需预算或撤销动作；401/403 已 PASS。
- 真实 Amazon Polly 合成 / DescribeVoices / 音质试听 NOT_RUN（预算 0、无授权）。
- P016 真实投递与 22:00 自然触发 NOT_RUN（跨项目，需其自行批准）。
- 有线耳机插拔、倍速（小米引擎对 `setSpeechRate` 响应弱）仍属待验项。
- **本地未 commit / 未 push**：工作树含多个会话改动，未经明确指令不提交。
- **治理仓库待裁定**（非本项目代码）：skill 仓库 S2 子目录口径与 `com.alw.socialmate-stack` 是否补登，见其 `后台服务登记表.md` 变更记录。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得 `-k` 或跳过证书校验。
- 本地腾讯 ASR 2 元、P066 ASR 3 元/月、DeepSeek 1 元；不得擅自调大。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway`，不 reset/clean 其他会话改动。
- 端口只停确属本仓库的进程；手机操作必须显式 `--serial`；不 commit/push/release 除非用户明确要求。
- **前台服务只用于朗读**：不得扩成后台录音、开机自启或常驻服务；通知栏不得出现原文/地点/人名。

## 5. 三日流水

- 2026-11-01/02：流水已迁 `docs/archive/handoff-flow-20261103-n05v12.md`（有效结论在 `architecture-facts.md`）。
- 2026-11-03 V1.2：私有地点 115→116；19 段入库；AI 分段；T5 真机 0.8.12；T6 8/8；归档 A0–A4。
- 2026-11-03 V1.3：混合队列 + 词组结构 + rev3 + 归属修复 + 归档 33→85；0.8.13/48 真机；20 轮 300 项 PASS。
- 2026-11-04 P066：流式适配 + final 修复 + Note 12 Pro 真机 PASS；归档待配对。
- 2026-11-04 V1.4：后台朗读前台服务（0.8.14/49）锁屏 45 项 PASS；Mac 归档 launchd 修复；fixture 语义修正；P016 交接；`data-lang` 与中文声线两个缺陷修复；10:31 归档周期 300→1800s（用户 A2+B2，`--watch` 形态不变）。
- 2026-11-04 T3：Tailscale 断 WiFi 蜂窝 PASS（0.8.15/50）；修 SSE/AI 白名单与令牌覆盖；Tailnet 无线 ADB 安装成功；归档写入待配对。
- 2026-11-04 P066/V1.5：流式 final 修复 + 401/403 + 闭环；聊天页四方向/置顶/冻结/资料条；0.8.29/64 双机。
- 2026-11-04 V1.5.1：ASR 握手鉴权 + TTS 入口收敛 + 归档 401 刷新 + 10 话题质量 + 现场密度；0.8.30/65；服务中断重连 PASS，蜂窝切网 NOT_RUN。

## 6. 接续提示词

先读 §0–§6，按 §2 推进；V1.5.1/P066 已闭环，余项见 §3。
证据先核 `docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md` 与 `docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`。
