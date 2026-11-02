# HANDOFF 三日流水 · 归档（2026-10-31 ~ 11-01 早期）
> 由 HANDOFF §5 迁移而来，原文逐条保留；HANDOFF 只留指针。

- 2026-10-31：APK 0.3.2 → Note 11/12T 启动；双麦 `MONO_MIX` 实测；ASR 桥接 34/34；内容层（V1.4 51 + 海南 115）真机建议验证；端口 8787→8790。
- 2026-10-31：V1.2 UI 落地；修「从聊天卡片进详情会切走 Tab、丢会话视图」；5 话题回归。
- 2026-10-31：真实腾讯云 ASR 跑通（A/B + 混音）；修 `speaker_diarization` 与 `sentence_list`；35/35。
- 2026-10-31：确认 `socialmate-prototype/` 由另一智能体开发中，只读核对、保留未提交改动。
- 2026-11-01：V0.4.0 服务阻塞修复：新增 `service-v040.sh`、`/api/asr/status`、组合服务自动恢复、安装脚本 `--serial/--skip-install`。
- 2026-11-01：Mac 收尾：TLS 根因=CodeArts kernel 注入并在 service 剥离；102/102 + TLS 2/2 + 12；0.4.0 SHA `da46425f…`；九项 UI PASS。
- 2026-11-01：归档：10/10；接收端 401/201/duplicate/400 四分支；0.5.0 真机 real-final 落盘；PWA E2E 与 Note 11 原生浏览器通过。
- 2026-11-01：Android 0.5.2 关闭全局明文、仅放行回环；真机差分验证明文与自签名证书边界。
- 2026-11-01：会后复盘闭环：`session-review.mjs`（本地规则 / DeepSeek 双引擎）、`POST /v12/api/review` 与 `/apply`、历史详情复盘 UI 与 `?session=` 深链、Android 0.5.3 入口按钮；定向 13/13；真实 AI 成本 0.002574 元（累计 0.213634 / 1 元）；写入链路在临时档案目录验完，正式档案未被污染。
