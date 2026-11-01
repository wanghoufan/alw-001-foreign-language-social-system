# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-01 ｜ 分支：main ｜ 线上：http://127.0.0.1:4173（Docker）｜ 组合服务：http://127.0.0.1:8791/v12

## 0. 常驻指针

- 架构与构建：`docs/architecture-facts.md`
- 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- 内容检索层：`android-poc/asr-bridge/src/content/`（说明见 asr-bridge/README §6.1）
- 组合服务：`socialmate-v1.2/service-v040.sh`（8790 ASR + 8791 UI/AI，一个进程）
- V0.4.0 QA：`socialmate-v1.2/QA.md`
- V1.2 正式 UI：`socialmate-v1.2/index.html`（ZIP `dist/SocialMate-V1.2-UI.zip`）
- 海南 115 图文指南：`docs/成果整理/Hainan-Travel-Guide/`（说明 `docs/DELIVERY_REPORT.md`，ZIP `artifacts/Hainan_115_Real_Photo_Guide_V3.0.zip`）
- 正式软件介绍主稿：`docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`

## 1. 当前进展

- 2026-11-01：Mac 收尾完成；组合服务单进程提供 8790/8791，`/api/asr/status` 为 `combined:true`。
- Note 11 已装 0.4.0（保留数据，61 个数据文件）；APK SHA-256 `da46425f7e5e1e69b243ac87171bf47f1301c2f32a25c52a23399236fdf69b7e`。
- 回归 **102/102 Node + 2/2 TLS + 12 Android**；Gradle `BUILD SUCCESSFUL`。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 根因是 CodeArts agent-kernel 注入；`service-v040.sh` 启动前剥离，`live-server.mjs` 仍拒绝 env 文件中的 `=0`；新进程 PID 40845 环境无该变量，真实 TLS 证书验证通过。
- Note 11 新 UI 九项 PASS：首页 SocialMate、录音同意、实时字幕、AI 独立授权、聊天/后台停止、高级设置、布局；详见 QA。
- 腾讯云 ASR 1 元预算闸已启用：**0.033884 / 1 元，121.981 秒，8 次**；DeepSeek **0.20641 / 1 元，49 次**。
- 双音色直连 8790：28.8 秒 7 条 final，A 全 `spk_0`、B 全 `spk_1`，分离成功；手机+BOYA 现场双人仍被 `-180 dBFS` 静音阻断。
- 细节与证据以 `socialmate-v1.2/QA.md` 为准；不把 MOCK、合成语音或代码级结果写成真人验收。

## 2. 下一步

1. 先给 BOYA 两个发射器开机/配对/确认未静音；`dumpsys audio` 有 `USB-Audio - BOYA mini` 但 A/B 仍 `-180 dBFS` 时不要改音频代码。
2. 电平恢复后只对 Note 11 重跑手机现场双人（显式 `--serial`），一轮即可；重点看 `spk_0/spk_1` 与聊天页字幕。
3. 可选：Note 12T 安装 0.4.0；两台手机分别 reverse、分别 `--serial`。
4. 需要跨网络时再设计无 USB/TLS/鉴权方案；当前不开放公网。

## 3. 未完成

- 手机 + BOYA 现场双人仍被 `-180 dBFS` 数字静音阻断；双音色直连 ASR 已成功，但不等同手机现场验收。
- Note 12T 当前未安装本项目 APK；未操作。
- 无 USB/公网方案、正式分享页未接；个人故事文件仍为空。
- 服务只绑本机回环，真机依赖无线/USB `adb reverse`；端口映射断开后页面会重连失败。
- `spk_N` 只是聚类编号，不保证真实身份；UI 固定“待确认”。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得用 `-k` 或跳过证书校验；服务启动由 `service-v040.sh` 剥离继承值，env 文件由 `live-server.mjs` fail-closed。
- 腾讯云 ASR 上限 1 元、DeepSeek 上限 1 元；不得自行改大或清账本，超限分别拒绝新会话/返回 402。
- BOYA 路由正常但 `-180 dBFS` 时先查发射器，不得把静音写成“双麦通过”。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway` 相关文件，保留其他智能体未提交改动，不 reset/clean/覆盖。
- 端口只停 cwd/命令确属本仓库的进程；未知进程占端口时拒绝 kill；手机操作必须显式 `--serial`。

## 5. 三日流水

- 2026-10-31：构建 APK 0.3.2；Note 11/12T 安装启动；双麦 `MONO_MIX` 实测；ASR 桥接 34/34；内容层（V1.4 51 + 海南 115）与 Note 11 真机建议验证；端口从 8787 改为 8790。
- 2026-10-31：AI 网关修复 `x-opencode-session`、thinking 关闭、JSON 宽松解析、无效 JSON 单次重试、常规话题不推地点；12/12 测试通过。
- 2026-10-31：V1.2 UI 落地（`socialmate-v1.2/`），修复从聊天卡片进详情会切走 Tab、丢失会话视图；5 话题回归通过。
- 2026-10-31：真实腾讯云 ASR 跑通（A/B + 混音真实转写）；修复 `speaker_diarization` 与 `sentence_list`；测试 35/35。
- 2026-10-31：海南指南迁入 `docs/成果整理/Hainan-Travel-Guide/`；清理 .DS_Store；ASR 桥接建立空 `.env`。
- 2026-10-31：确认 `socialmate-prototype/` 由另一智能体开发中；只读核对，保留未提交改动。
- 2026-11-01：V0.4.0 服务阻塞修复；新增 `service-v040.sh`、`/api/asr/status`、组合服务自动恢复、安装脚本 `--serial/--skip-install`。
- 2026-11-01：真机 WebView、MOCK 全链、真实腾讯云/DeepSeek、真人单人与 TTS-B 真实环境测试完成；新增 1 元预算闸。
- 2026-11-01：Mac 收尾：TLS 根因=CodeArts kernel 注入并在 service 剥离；102/102 + TLS 2/2 + 12；APK 0.4.0 SHA `da46425f…`；九项 UI PASS；ASR 1 元闸与双音色 A/B 分离通过；BOYA `-180 dBFS` 阻断手机现场双人。

## 6. 接续提示词

先读本文件 §0–§6、`socialmate-v1.2/QA.md` 与 `docs/architecture-facts.md`。服务用 `bash socialmate-v1.2/service-v040.sh ensure`，先确认 BOYA 发射器有电平，再按 `--serial` 重跑手机现场双人；不关闭 TLS 校验、不超 1 元 ASR/DeepSeek 预算、不覆盖 V1.4/海南。