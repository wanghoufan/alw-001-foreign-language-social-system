# HANDOFF · SocialMate（ALW-001 外语社交系统）

> 交接时间：2026-11-01 ｜ 分支：main ｜ 组合服务：http://127.0.0.1:8791/v12

## 0. 常驻指针

- 架构 / 端口 / 版本 / 网络策略：`docs/architecture-facts.md`
- 风险与红线：`docs/risks.md`
- 踩坑：`agent.md`
- Android 验收台账：`android-poc/IMPLEMENTATION_STATUS.md`
- N03 逐项验收（PASS/PARTIAL/NOT_RUN + 证据路径）：`docs/plan/ALW001-N03-SDD-V1.1/ACCEPTANCE.md`
- 全部实测证据与已验/未验边界：`socialmate-v1.2/QA.md`
- 组合服务：`bash socialmate-v1.2/service-v040.sh ensure`（8790 ASR + 8791 UI/AI）
- 多人档案 E2E（自跑自清）：`node socialmate-v1.2/qa-people-e2e.mjs`
- 会话归档：`socialmate-v1.2/archive-service.sh`（8781，令牌鉴权；历史 UI `/v12/history`）
- 私有入口：Tailscale `443/alw`→8781、`8443`→8791、`10000`→8790（仅 tailnet）
- 海南公开 PWA：**https://wanghoufan.github.io/alw-001-foreign-language-social-system/**（gh-pages，7 文件）
- V1.2 正式 UI：`socialmate-v1.2/index.html`；海南 115 指南：`docs/成果整理/Hainan-Travel-Guide/`
- 正式软件介绍主稿：`docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`

## 1. 当前进展

- **N03（SDD V1.1）P0→P3 已交付并推送**：`68a77ce`（HEAD==origin/main）；验收表 `docs/plan/ALW001-N03-SDD-V1.1/ACCEPTANCE.md`；Android **0.6.0（15）** `972eed42…` 已 `install -r` 装 Note 11（保留数据）。
- 手机端新增：留存默认关＋三同意独立、断网补传四态、在线人物主档（详情带来源 / slug 建议 / 显式新建 / 事实撤回）、历史检索分页、见面前准备、一条接话+一条追问（窄屏内联到字幕下方）、收藏闭环、自适应图标 + Android 12+ Splash、SAF 导出桥。
- 复盘→确认→档案仍是 N02 链路：`/v12/history?session=` → 本地/云端复盘 → 勾选 → 确认 → `Profile` + `People/<slug>/00-profile.md`（来源与幂等标记、0600/0700、备份回滚）。
- 写接口一律令牌 + 同源（Origin 与 Host 一致）+ 60s/12 次限流；令牌只进 `sessionStorage`，关闭即失效。
- 归档：final-only 逐字落 `~/Documents/SocialMate/Conversations/YYYY/MM/`；历史 UI 支持词/人/日期/分页与 UTC 导出。
- 无 USB 链路、PWA 115/115、DeepSeek 与 ASR 授权链路均已验；账本 0.213634 / 0.129189（各 1 元，未重置）。
- 测试：`verify-v040.sh` **215 Node + 12 Android core + APK 构建**全绿；`qa-people-e2e` 10/10；`ai-gateway` 124/124；`asr-bridge` 40/40。

## 2. 下一步

1. **视觉档位等用户选**：①只改原生顶栏（去掉三个大按钮）②顶栏 + 聊天页层次（推荐）③整页重做对齐原型。
2. 大清理等用户说「大阶段结束」再动（临时产物已清，`.local/qa`、`release/` 保留）。
3. 真人全链与现场双人（需用户在场）。
4. 借到 Android 12+ 机与 iPhone 后补启动画面实拍与 PWA Safari。

## 3. 未完成

- 真机「新建人物 / 撤回事实」写正式主档：只做单测 + 临时目录，未动真实档案 → PARTIAL。
- Android 12+ 系统启动画面实拍、软键盘遮挡（本机 IME 不绘制键盘）→ NOT_RUN。
- 真人说话/双人对话 → NOT_RUN；iPhone Safari 缺设备。
- `spk_N` 只是聚类编号，UI 固定「说话人待确认」。
- 中文名建人走 `person-YYYYMMDD-xxxx`，不转拼音（不为建人调第三方）。
- 服务只绑回环：真机靠 Tailscale 或 `adb reverse`，映射断开页面需重连。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得用 `-k` 或跳过证书校验；`service-v040.sh` 启动前剥离继承值，env 里的 `=0` 由 `live-server.mjs` 拒绝。
- 腾讯云 ASR 与 DeepSeek 各上限 1 元；不得改大或清账本，超限分别拒绝新会话 / 返回 402。
- BOYA 路由正常但 `-180 dBFS` 时先查发射器，不得把静音写成「双麦通过」。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway` 相关文件，保留其他智能体未提交改动，不 reset/clean/覆盖。
- 端口只停 cwd/命令确属本仓库的进程；未知进程占端口时拒绝 kill；手机操作必须显式 `--serial`。

## 5. 三日流水

- 2026-10-31：APK 0.3.2 → Note 11/12T 启动；双麦 `MONO_MIX` 实测；ASR 桥接 34/34；内容层（V1.4 51 + 海南 115）真机建议验证；端口 8787→8790。
- 2026-10-31：V1.2 UI 落地；修「从聊天卡片进详情会切走 Tab、丢会话视图」；5 话题回归。
- 2026-10-31：真实腾讯云 ASR 跑通（A/B + 混音）；修 `speaker_diarization` 与 `sentence_list`；35/35。
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
- 2026-11-01 N02：`people-store.mjs` + `review-confirm.mjs` 打通「确认 → People 正式主档」；`/apply` 加令牌+段号+限流；修复 Tailscale 同源 403；`current.md` 收紧 0600；真机（隔离实例+合成会话）点击式确认保存与二次读取 PASS；`verify-v040.sh` 158 项全绿；测试基建修 3 处历史红灯。

- 2026-11-01 N03：SDD V1.1 P0→P3；0.6.0（15）`972eed42…`；215 Node + 12 core 全绿；手机端接话卡原在屏外（y≈917）改内联并折叠会话设置；`68a77ce` 已推送；Android 12+ Splash、IME 遮挡 NOT_RUN。

## 6. 接续提示词

先读本文件 §0–§6 与 `docs/plan/ALW001-N03-SDD-V1.1/ACCEPTANCE.md`，用 `bash socialmate-v1.2/service-v040.sh ensure` 起服务后按 §2 继续（视觉档位等用户选）。不关 TLS 校验、不超 1 元 ASR/DeepSeek 预算、不覆盖 V1.4 与海南资料、不写真实档案。
