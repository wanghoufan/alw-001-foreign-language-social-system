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

- **N03b 产品化收口已上机**：Android **0.7.3（28）**；打开即五 Tab、无原生顶栏、录音为底部面板、系统返回键四级回退（改前会白屏卡死）；中英双语覆盖五 Tab/设置/历史页/原生面板；海南卡图片化 + 每卡 `中|EN` 描述切换 + 详情同款切换。
- **N04 三人物演示闭环（T1→T3 完成）**：演示数据独立 `SocialMate-Data/Demo/`（真实 `People/` 零写入），3 人物 / 9 会话 / 54 段默认可见，清空可恢复；待确认事实确认后当轮专属问题即时变化；9 套会话落 `~/Documents/SocialMate/Demo/Conversations/`，断网补传幂等；QA 产物在 `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/`。
- 手机端界面形态（N03b）：**打开即五 Tab 主界面、录音是底部面板、Web 顶栏只有品牌名 + `⋮`**（其余收进菜单）；另新增：留存默认关＋三同意独立、断网补传四态、在线人物主档（详情带来源 / slug 建议 / 显式新建 / 事实撤回）、历史检索分页、见面前准备、一条接话+一条追问（窄屏内联到字幕下方）、收藏闭环、自适应图标 + Android 12+ Splash、SAF 导出桥。
- 复盘→确认→档案仍是 N02 链路：`/v12/history?session=` → 本地/云端复盘 → 勾选 → 确认 → `Profile` + `People/<slug>/00-profile.md`（来源与幂等标记、0600/0700、备份回滚）。
- 写接口一律令牌 + 同源（Origin 与 Host 一致）+ 60s/12 次限流；令牌只进 `sessionStorage`，关闭即失效。
- 归档：final-only 逐字落 `~/Documents/SocialMate/Conversations/YYYY/MM/`；历史 UI 支持词/人/日期/分页与 UTC 导出。
- 无 USB 链路、PWA 115/115、DeepSeek 与 ASR 授权链路均已验；账本 0.213634 / 0.129189（各 1 元，未重置）。
- 测试：`verify-v040.sh` **215 Node + 12 Android core + APK 构建**全绿；`qa-people-e2e` 10/10；`ai-gateway` 124/124；`asr-bridge` 40/40。

## 2. 下一步

1. 图标三方案等用户拍板（A 声波 / B 双气泡 / C 对话列表，预览图在 `docs/design/icon-options/`，决定后做成自适应图标 + 单色层）。
2. PWA 详情抽屉接入同一套 `中|EN`（列表卡已完成）；离线只读、真机断网补传仅接口级验证。
3. 真人全链与现场双人（需用户在场）；iPhone Safari 缺设备。
4. 架构与构建事实见 `docs/architecture-facts.md`，风险见 `docs/risks.md`，踩坑见 `agent.md`。

## 3. 未完成

- 真机「新建人物 / 撤回事实」写正式主档：只做单测 + 临时目录，未动真实档案 → PARTIAL。
- Android 12+ 系统启动画面实拍、软键盘遮挡（本机 IME 不绘制键盘）→ NOT_RUN。
- 真人说话/双人对话 → NOT_RUN；iPhone Safari 缺设备。
- `spk_N` 只是聚类编号，UI 固定「说话人待确认」。
- 中文名建人走 `person-YYYYMMDD-xxxx`，不转拼音（不为建人调第三方）。
- 服务只绑回环：真机靠 Tailscale 或 `adb reverse`，映射断开页面需重连。
- 原生面板两条动态文案（留存提示、归档状态）与「本轮原文与复盘」按钮仍是中文，未走词表 → PARTIAL。
- 演示数据「未归属 final 选人下拉」只有 API + UI 代码，真机未点过 → NOT_RUN。
- 6 个地点无干净实景，其中 3 个借同类型实景并标「示意」（25/26/69），另 3 个仍占位。

## 4. 红线

- 详见 `docs/risks.md`；密钥只在服务端、录音需同意且不入库、MOCK/合成语音/编译通过不得写成真人验收。
- 不得设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`、不得用 `-k` 或跳过证书校验；`service-v040.sh` 启动前剥离继承值，env 里的 `=0` 由 `live-server.mjs` 拒绝。
- 腾讯云 ASR 与 DeepSeek 各上限 1 元；不得改大或清账本，超限分别拒绝新会话 / 返回 402。
- BOYA 路由正常但 `-180 dBFS` 时先查发射器，不得把静音写成「双麦通过」。
- V1.4 与海南资料只读；`socialmate-prototype/` 只改 `ai-gateway` 相关文件，保留其他智能体未提交改动，不 reset/clean/覆盖。
- 端口只停 cwd/命令确属本仓库的进程；未知进程占端口时拒绝 kill；手机操作必须显式 `--serial`。

## 5. 三日流水

- 2026-10-31～11-01 早期流水（V0.3.2→0.5.3、双麦、ASR、归档、TLS 根因等）已迁至 `docs/archive/handoff-flow-20261031.md`。

- 2026-11-01：真机 WebView + MOCK 全链 + 真实腾讯云/DeepSeek + 单人/TTS-B 测完；新增 1 元预算闸。
- 2026-11-01：本机档案：`profile-store` 5/5、API 三分支（无确认 400 / 确认 200 / 回读一致）、同源点击端到端通过。
- 2026-11-01：Note 12T Pro USB 物理拔除后零 `adb reverse` 跑通 ASR/UI/归档，双说话人分离成立。
- 2026-11-01：归档历史 UI 落地（只读索引 + 三个令牌接口 + `/v12` 同源反代 + 聊天页入口），5/5 新测试，真机 WebView 内可读原文。
- 2026-11-01：DeepSeek 授权端到端；PWA Note 12T Pro 自带浏览器 `115/115` 与 `?selected` 回显；**清单回发按用户决定暂停**（代码保留）。
- 2026-11-01 N02：`people-store.mjs` + `review-confirm.mjs` 打通「确认 → People 正式主档」；`/apply` 加令牌+段号+限流；修复 Tailscale 同源 403；`current.md` 收紧 0600；真机（隔离实例+合成会话）点击式确认保存与二次读取 PASS；`verify-v040.sh` 158 项全绿；测试基建修 3 处历史红灯。

- 2026-11-01 N03：SDD V1.1 P0→P3；0.6.0（15）`972eed42…`；215 Node + 12 core 全绿；手机端接话卡原在屏外（y≈917）改内联并折叠会话设置；`68a77ce` 已推送；Android 12+ Splash、IME 遮挡 NOT_RUN。
- 2026-11-02 N03b：0.6.1→0.7.0 连续收口（五 Tab 直达、底部面板、去演示文案、返回键白屏根因修复、字号下限 17/14/13、卡片收紧、Tab 69→57px、字号/图标/名字）。
- 2026-11-02 N03b：中英双语落地（I18N 词表 306 key、设置里三档语言、历史页 149 key）；海南卡图片化（115 地点补图至 112）+ 每卡 `中|EN`。
- 2026-11-02 N04：演示命名空间 / 待确认事实联动 / 归档与 QA 产物三子代理并行完成，0.7.3（28），真机截图 `qa/20261102/shots/`。

## 6. 接续提示词

先读本文件 §0–§6 与 `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/README.md`，用 `bash socialmate-v1.2/service-v040.sh ensure` 起服务后按 §2 继续（图标方案等用户拍板）。不关 TLS 校验、不超 1 元 ASR/DeepSeek 预算、不覆盖 V1.4 与海南资料、不写真实档案。