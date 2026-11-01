# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-01 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12

## 0. 常驻指针

- 架构 / 端口 / 版本 / 网络策略：`docs/architecture-facts.md`
- 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- 全部实测证据与已验/未验边界：`socialmate-v1.2/QA.md`
- 组合服务：`bash socialmate-v1.2/service-v040.sh ensure`（8790 ASR + 8791 UI/AI）
- 会话归档：`socialmate-v1.2/archive-service.sh`（8781，令牌鉴权；历史 UI `/v12/history`）
- 私有入口：Tailscale `443/alw`→8781、`8443`→8791、`10000`→8790（仅 tailnet）
- 海南公开 PWA：**https://wanghoufan.github.io/alw-001-foreign-language-social-system/**（gh-pages，7 文件）
- V1.2 正式 UI：`socialmate-v1.2/index.html`；海南 115 指南：`docs/成果整理/Hainan-Travel-Guide/`
- 正式软件介绍主稿：`docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`

## 1. 当前进展

- **会后复盘闭环已落地**：停止录音 → `/v12/history?session=` 本轮原文 → 本地/云端复盘 → 逐条勾选编辑归属 → 显式确认写 `SocialMate-Data/Profile`（只追加、按会话+段号+文本指纹去重、来源入 `sources`）。Android **0.5.3（13）** 录音页新增「本轮原文与复盘」。
- Android **0.5.2（versionCode 12）** 已装 Note 12T Pro；明文只放行回环、坏证书默认拒绝（细节见 `docs/architecture-facts.md` §Android）。
- **无 USB 链路已验收**：`adb reverse` 为空，录音→`wss:10000`→ASR→`https:8443` 聊天页→`/alw` 归档全程走 Tailscale。
- **归档**：final-only 逐字落 `~/Documents/SocialMate/Conversations/YYYY/MM/`；历史 UI（列表 / 原文 / 按 UTC 日期导出）已完成并真机验收。
- **海南 PWA** 已上线 gh-pages：115/115、中英、筛选、单点 `Share place` 均通；清单回发按用户决定暂停。
- **DeepSeek 独立授权**端到端通过：未勾选 0 次 `/api/ai/*`，勾选后出真实建议卡；累计 0.21106 / 1 元。ASR 0.129 / 1 元。
- 测试：归档 10/10、历史 5/5；其余回归 102/102 Node + 12 Android（本轮未重跑）。
- BOYA 确认为 **MONO_MIX**（A -24.1 / B -27.96 dBFS，L−R=0）；现场真人双人仍 NOT_RUN。

## 2. 下一步

1. **现场双人**（需用户在场）：本人对着发射器说话，看 `spk_0 / spk_1` 与聊天页字幕是否稳定。
2. 真机走一遍「停止录音 → 本轮原文与复盘 → 勾选 → 确认保存」（需真人说话产生 final）。
3. 借到 iPhone 后补 PWA Safari 验收。
4. 复盘候选落正式 `SocialMate-Data/People/<slug>/00-profile.md`：需先定模板与写入约定，当前只写本机 Profile。
5. 确认后的话题/人物再落 `SocialMate-Data/People/<slug>/00-profile.md`，与正式 Markdown 对齐。

## 3. 未完成

- 真机复盘端到端点击未跑；按钮态与深链分别验过（0.5.3 真机截图在 `socialmate-v1.2/screenshots/`）。
- 本机档案未与正式 `People/*.md` 打通（本轮只落 Profile）。
- 现场真人双人 NOT_RUN（非硬件无声问题）。
- PWA 机型矩阵缺 **iPhone Safari**；国内访问速度可能波动，无自定义域名。
- 真机点 `☆ Want to go` 后计数 0→1 未取到 a11y 证据（星标不在 a11y 树，一次点击后浏览器跳走）。
- 历史 UI 的「按日期导出」只在 Mac 与桌面浏览器验过，**手机内未点过下载**。
- 服务只绑回环，真机依赖 Tailscale 或 `adb reverse`；映射断开后页面需重连。
- `spk_N` 只是聚类编号，不保证真实身份；UI 固定「待确认」。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得用 `-k` 或跳过证书校验；`service-v040.sh` 启动前剥离继承值，env 里的 `=0` 由 `live-server.mjs` 拒绝。
- 腾讯云 ASR 与 DeepSeek 各上限 1 元；不得改大或清账本，超限分别拒绝新会话 / 返回 402。
- BOYA 路由正常但 `-180 dBFS` 时先查发射器，不得把静音写成「双麦通过」。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway` 相关文件，保留其他智能体未提交改动，不 reset/clean/覆盖。
- 端口只停 cwd/命令确属本仓库的进程；未知进程占端口时拒绝 kill；手机操作必须显式 `--serial`。

## 5. 三日流水

- 2026-10-31：APK 0.3.2 → Note 11/12T 启动；双麦 `MONO_MIX` 实测；ASR 桥接 34/34；内容层（V1.4 51 + 海南 115）真机建议验证；端口 8787→8790。
- 2026-10-31：AI 网关修 `x-opencode-session`、thinking 关闭、JSON 宽松解析与单次重试、常规话题不推地点；12/12。
- 2026-10-31：V1.2 UI 落地；修「从聊天卡片进详情会切走 Tab、丢会话视图」；5 话题回归。
- 2026-10-31：真实腾讯云 ASR 跑通（A/B + 混音）；修 `speaker_diarization` 与 `sentence_list`；35/35。
- 2026-10-31：海南指南迁入 `docs/成果整理/Hainan-Travel-Guide/`；清 `.DS_Store`；ASR 桥接建空 `.env`。
- 2026-10-31：确认 `socialmate-prototype/` 由另一智能体开发中，只读核对、保留未提交改动。
- 2026-11-01：V0.4.0 服务阻塞修复：新增 `service-v040.sh`、`/api/asr/status`、组合服务自动恢复、安装脚本 `--serial/--skip-install`。
- 2026-11-01：真机 WebView + MOCK 全链 + 真实腾讯云/DeepSeek + 单人/TTS-B 测完；新增 1 元预算闸。
- 2026-11-01：Mac 收尾：TLS 根因=CodeArts kernel 注入并在 service 剥离；102/102 + TLS 2/2 + 12；0.4.0 SHA `da46425f…`；九项 UI PASS。
- 2026-11-01：本机档案：`profile-store` 5/5、API 三分支（无确认 400 / 确认 200 / 回读一致）、同源点击端到端通过。
- 2026-11-01：归档：10/10；接收端 401/201/duplicate/400 四分支；0.5.0 真机 real-final 落盘；PWA E2E 与 Note 11 原生浏览器通过。
- 2026-11-01：Note 12T Pro USB 物理拔除后零 `adb reverse` 跑通 ASR/UI/归档，双说话人分离成立。
- 2026-11-01：归档历史 UI 落地（只读索引 + 三个令牌接口 + `/v12` 同源反代 + 聊天页入口），5/5 新测试，真机 WebView 内可读原文。
- 2026-11-01：Android 0.5.2 关闭全局明文、仅放行回环；真机差分验证明文与自签名证书边界。
- 2026-11-01：DeepSeek 授权端到端；PWA Note 12T Pro 自带浏览器 `115/115` 与 `?selected` 回显；**清单回发按用户决定暂停**（代码保留）。
- 2026-11-01：会后复盘闭环：`session-review.mjs`（本地规则 / DeepSeek 双引擎）、`POST /v12/api/review` 与 `/apply`、历史详情复盘 UI 与 `?session=` 深链、Android 0.5.3 入口按钮；定向 13/13；真实 AI 成本 0.002574 元（累计 0.213634 / 1 元）；写入链路在临时档案目录验完，正式档案未被污染。

## 6. 接续提示词

先读本文件 §0–§6、`socialmate-v1.2/QA.md` 与 `docs/architecture-facts.md`，服务用 `bash socialmate-v1.2/service-v040.sh ensure` 起来后按 §2 继续。不关 TLS 校验、不超 1 元 ASR/DeepSeek 预算、不覆盖 V1.4 与海南资料。