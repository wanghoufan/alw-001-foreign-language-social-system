# ALW-001 N04 V1.3｜已批准 SDD / 连续执行开发计划

task_id: SM-ALW001-20261102-N04-V13
project: ALW-001
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
approved_at: 2026-11-02T14:22:00+08:00
approved_by: USER_EXPLICIT_APPROVAL_PLAN_1
status: APPROVED_EXECUTION_PACKAGE
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS

scope: T1-T5 ONLY; P0 defects and release acceptance, no new business features
status_of_delivery: PLAN_APPROVED_NOT_IMPLEMENTED
evidence_rule: never confuse installed version, source version, historical MOCK, GUI_SENT or draft as end-to-end PASS
last_checked: 2026-11-02T14:22:00+08:00

## 0. 原始资料与事实（每次开工重读）

- 当前官方登记：`000/转发管家/项目登记.json`，ALW-001 root在 `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`；旧收件箱 `docs/relay/CURRENT_TASK.md` = SENT（旧N04 task_id SM-ALW001-20261102-N04-PERSONAS），回执为 GUI_SENT。不要重发旧任务。
- 最新源码配置：`android-poc/app/build.gradle` -> versionName 0.7.7 / versionCode 32。但最新确证实际真机安装日志 `socialmate-v1.2/.local/qa/phone-install-20261102-125227.log` -> **0.7.4** (29), Android 11 Redmi Note11 5G。***未发现0.7.7的匹配安装、APK哈希、真机录音与归档验收***。
- Git 工作区本次有3个未提交的 `socialmate-prototype/public-share.html`、`public-share.js`、`sw.js`；这些属于其它业务改动，保留并检查编辑所有权，禁止被本任务覆盖。
- 已测试：N04三虚构人物 Oliver UK健身 / Maya US创意音乐 / Ji-eun KR摄影，9段54句、6基线事实与3待确认；演示人物单条/批量编辑与撤销；`docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/`的0.7.3与0.7.4合成QA和手机截图；9对Mac Demo原文及39断言PASS（但**不是安卓原生 outbox 全链**）。完整保留，不重跑无意义旧任务。
- 已发现确切缺陷：`demo-store.mjs` 的 `REPLAY_FINALS` 三条文本与 `fixtures/demo-personas.json`相同 sessionId+segmentIndex 的 `textOriginal` **3/3不相等**。不得拿摘要或新造句称逐字final。
- 代码内构建时从本机 `socialmate-v1.2/.local/archive-token` 读token并写入 Android `BuildConfig.ARCHIVE_TOKEN`；这属于APK逆向可提取的长期凭证风险，跟“文件未入Git”是不同问题。必须在T1做可证明的最小安全整改。
- 私有架构：Mac 8790 (腾讯ASR WS)、8791 (AI/UI)、8781 (正式归档)、8782 (Demo归档)，本机/已配置 Tailscale私有 HTTPS入口。现有ADB reverse安装只证明USB开发，不能代替无USB外出使用。
- 当前Log、旧文档 `CHANGELOG.md`、`docs/handoff/HANDOFF.md`、`android-poc/IMPLEMENTATION_STATUS.md`可能落后，变更以真源码/新测试证据为准。
- 本阶段不修改海南公开PWA、不部署新公网、不开新数据库、不重做已完成UI；保留当前项目主开发者架构与预算/知情同意闸。真人双人说话人分离、BOYA硬件测试需要真人同意，缺少则标 NOT_RUN，不能挡住其它部分。

## S0. 开发前置预检（必须先覆盖全部下游Task，一次性向用户提真正需其亲自操作的事项）
参照 `PREFLIGHT.md`逐项实际运行脱敏检查，保存路径、时间、状态与证据；把A(不可代办硬阻塞)、B(开发者自行解决)、C(可替代)、D(最后真人/发布)和依赖Task对应。发现A须**集中列出操作步骤**，无法自行解决才问用户；B/C继续，不要用历史日志当“当前可用”。

## T1：原文真实性与原生/服务安全最小闭环（P0）
1. 对照 `demo-store.mjs REPLAY_FINALS` 与fixture逐句纠正：优先按真实 sessionId、segmentIndex从唯一源文件读取 `textOriginal`，原文不可改写；用户可编辑候选摘要单独字段 `candidateFact`，附 `sourceExactText` 和证据ID。伪造不存在段/文本或用错误归属、重复最终事件不得导致真实People写入。之前三条错配必须各复现→修复→负面用例。
2. 检查原生 `addJavascriptInterface` 全frame暴露、恶意iframe/不可信URL/重定向、下载与选择器、WebView加载失败后的桥销毁；每条证明不可信调用 0 麦克风/0外部写入、正常私有UI仍可用。不因为顶层URL可信就假设frame安全。
3. APK长期 `BuildConfig.ARCHIVE_TOKEN` 风险：在不新增云账号/绕过私有网络的前提下，改为可轮换、短期/受限凭证或经过认证的安全配对/访问流程，令牌不作为常量嵌APK；仅依赖TLS/Tailscale不能代替服务端权限判定。存储时合理使用平台安全存储，审查重放/过期/撤销/无设备时fail closed；不要把密钥明文交给用户复制粘贴。旧长期凭证的轮换在明确不影响现有手机后安全执行，涉及不可逆用户授权列Human Gate。
4. 演示 `POST clear/restore/confirm` 必须有实际服务端写授权/同源和CSRF保护；单独 `confirm:true` 不等于身份鉴权。避免破坏现有读Demo无需输入令牌的体验。
验收：逐字一致性3/3与伪造反例、未知frame/跨源负例、敏感令牌无法从APK常量直接抽取、错误授权0写入、正常功能不回退。所有测试留准确命令与退出码。

## T2：真正的 ASR final → 人物事实更新（P0）
从 Android AudioRecord→8790腾讯ASR/WebSocket→8791 SSE→APP 会话final 的**真实集成**事件驱动候选卡。禁止把Demo `POST /api/demo/final` 或静态回放算真实ASR。
- 无有效录音同意不开麦；无原文留存同意不写完整录音/逐字文本到Mac或文件。可以在当前会话短暂内存展示final；离开后按隐私规则清理。只有用户明确选中某条事实并指定目标人物、确认保存才更新该人物档案。
- 单条事实必须保留 `sessionId`、`segmentIndex`、准确原文/摘要的不同字段、speaker unknown，禁止 `spk_0` 自动归属。
- 同轮“确认→人物资料变化→2条专属+1通用问题重算”及重启/重新访问持续；撤回则删去基于已撤回事实的问题。A事实不出现在B/C；断线或快速重复点不会双写/额外付费。
- 先用合成音频**经过同一真实输入协议与UI**做边界回归，再用明确已授权的少量真实腾讯ASR，先查剩余预算，不更改腾讯ASR/DeepSeek各1元闸。没有真人双人同意时不做真人音频测试。
证据：Android真实输入→真实ASR标识(mock:false)→final事件→pending→人选/确认→People diff→prep before/after→重启→撤销，包含时序/脱敏网络日志/点击截图。只有模拟输入的标PARTIAL。

## T3：Android原生 outbox → Mac完整归档（P0）
- 在明确打开“原文留存并导出”前，不得收集完整final或往Mac写原文。检查`SessionArchive.java`的 `current.json/outbox/exported` 状态机及token使用。
- **真手机**经网络断开/归档服务拒绝（隔离测试配置）→outbox保留→网络恢复/重启补传→受限Mac接收→.md + .json 与final逐字/数量/时间戳一致→手机显示已同步；两次上传幂等，失败不会擦除数据或伪报成功。
- 验证有限退避6次耗尽后的可理解状态与自动/手动恢复机制；服务重启、设备重启、离线、401/403/429/5xx、体积超限都不能静默丢原文。隔离会话不写真实个人档案，测试前后sha。
- 真实Android SAF导出md至用户选择目录并从系统文件管理器再打开，不把弹出选择器就算PASS。数据保存需保留真实演示9对母版且可清空/恢复。
证据：固定ADB serial/当前APK版本SHA、outbox文件元数据及转移回执（脱敏）、HTTP结果、Mac路径+SHA、手机系统打开导出的截图、重放幂等前后hash。

## T4：拔 USB 后安全外出使用 + Mac自恢复（P0）
- 真实移除USB与 `adb reverse`，手机切移动网络（或与Mac不处于同网的连接），验证已有 Tailscale TLS 私有入口（8790/8791/8781映射）可访问、WSS/HTTPS证书链有效，APP可以登录/配对/查看三人演示、实时字幕、记忆与归档，不依赖Mac现场终端。若没有设备的Tailscale授权，本机先做可替代测试，最后集中一次用户授权。
- 固定服务的健康检查、自启动（macOS已有service/LaunchAgent机制复用，8782演示归档一并受控），断网/服务崩溃/Mac重启后恢复；不杀其他项目进程，端口占用先查归属。正常使用无需远控，异常能用Mac图形界面一两步恢复。
- Mac服务不可用期间仍能只读查看最近的演示/本地历史，显示离线状态而不是白屏；“清空/恢复/上传”未成功就不得显示成功；恢复后可安全合并，不混真实人物资料。
- 不申请公网DNS、域名或Vercel等，禁止HTTP明文、`NODE_TLS_REJECT_UNAUTHORIZED=0`、`curl -k`；检查后端鉴权、cors/csrf与服务日志不泄露钥匙。
证据：USB拔除/无reverse、移动网络/Tailscale连接/真实证书、前后APP画面、服务重新启动日志、队列确认、无终端人工干预或一键自愈记录。

## T5：最新APK及端到端交付验收（P1）
- 从当时Git HEAD+工作树快照构建新的可重复APK，留下完整`Gradle`日志、versionName/versionCode、SHA256、签名指纹（不暴露私钥）。以唯一设备serial执行 `install -r` 保留数据，`dumpsys package`回读真机已装版本与权限；签名冲突不自动卸载正式App。
- 完整走一遍“打开即非空3演示人物→人物事实/分组编辑/批量/撤销→三人专属+通用→演示清空/重启/恢复→真实录音授权final→选人确认→推荐变化→停止→手机outbox→Mac保存→历史原文/导出→拔USB移动网络重测”，逐步骤真实设备截图及Mac原文件。
- WebView Android11及目前可用安卓12+/15、厂商浏览器等按实际设备验，缺机记 NOT_RUN，不写PASS。关键安全负例必须做。同步`CHANGELOG.md`、`HANDOFF.md`、`android-poc/IMPLEMENTATION_STATUS.md`、N04 QA台账，特别纠正过时0.6.6与0.7.0说法。
- Mac GUI可打开的永久QA目录，保留原`qa/20261102`不覆盖；新增按UTC/本地时间命名的本阶段证据索引和真实运行日志，保留哈希、测试退出码、截图、API/存储前后摘要、User Acceptance Checklist。
- 最终只在已有全部可由开发者完成的Task结束后进行一次Human Gate，真人双人知情同意、缺机高版本等单独NOT_RUN；未经批准不购买/发布/推送/删除隐私数据。

## 交付边界
继续已有**主开发者模式**，可以用无文件冲突的子代理审查，但不加ORCA Task Manager/Supervisor额外Gate。所有一般bug自行分析→修复→复测，不因里程碑停止。低风险局部决策自主处理；权限/2FA/真人、付费、不可逆删除必须用户本人集中授权。见 `PREFLIGHT.md` 的逐Task前置审计和 `ACCEPTANCE.md` 的可被第三方验证合同。
