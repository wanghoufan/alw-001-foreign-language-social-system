# ALW-001 · N04 深度稳定性与可验证交付｜SDD V1.0

task_id: SM-ALW001-20261102-N04
project: ALW-001
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
status: EXECUTION_BRIEF_PREPARED
basis: 2026-11-02 REAL_REPOSITORY_READ_AND_OFFICIAL_ANDROID_GUIDANCE
relation: CONTINUATION_AFTER_N03
priority: 20
goal: 深入现有产品关键体验与可靠性，不增加新功能
user_scope: “先按专家深度审查，再完成现有功能的真实闭环；可自主任务连续执行，真人验收后置”
human_gate: ONE_FINAL_GATE_ONLY
relay_policy: 计划已写入本地但不能以此冒充GUI_SENT；转发员读取当前官方收件箱，防重且忙则不打断

## 01 真实进展（不要拿历史日志冒充当前版本）

- 最新实际读取：`android-poc/app/build.gradle` 当前 `versionName '0.7.0'`、`versionCode 25`、`compileSdk/targetSdk 35`。这是**当前源码配置**，不是已安装版本/已验收版本。
- 当前 `git status` 为 `main...origin/main`，存在大量未提交工作树改动：`AsrActivity.java`、`MainActivity.java`、`AndroidManifest.xml`、前端源码、网关、测试、截图、验收文档、甚至海南 `places.json` 等。**不能丢弃、清理、提交、推送或覆盖其他开发者修改**。首步做文件改动归属审查。
- `docs/handoff/HANDOFF.md` 仍称 0.6.6/21；`docs/plan/ALW001-N03-SDD-V1.1/ACCEPTANCE.md` 前部主要记录 0.6.0/15 的真机证据，N03b 0.6.6/21 标 PARTIAL。**尚未找到将 0.7.0/25、APK SHA、已安装手机、真机链路四者关联的证据**。
- `CHANGELOG.md` N03b 的旧记录出现 `test-live-asr.mjs` 9/10 和 `test-android-wiring.mjs` 4/7，是此前 0.6.6 改UI导致的旧断言失配；但是**更新的** `socialmate-v1.2/.local/qa/verify-20261101-224845.log` 证实 Web CTA/原生回调、Android接线测试全绿、Node及Gradle构建成功。**不要重新修已修掉的4条测试**；最新的0.7.0工作树尚缺同版本新实跑。
- N03 已有GUI_SENT，`docs/relay/CURRENT_TASK.md` = SENT；绝对不能重发N03。ALW-001 目前由外部桌面开发者持续修改的可能性很高，本文件只提供新的审查/续做指令，转发依照000转发管家治理。
- 已有明确完成的产品能力：5 Tab、底部录音面板、用户同意闸、腾讯云ASR、断网归档、N02复盘及Profile/People人工确认、历史检索、见面前准备、两张英文接话卡、表达收藏、图标/Splash、WebView Markdown SAF导出。不得再做一轮这些功能的从零开发。
- 继续保持现有真人单人/双人验收后置、Android12+系统Splash真机实拍与iPhone/OPPO缺设备NOT_RUN；不能据此停工。海南115公开PWA不在N04范围，特别注意当前`places.json`工作树已改，不得碰它。

## 02 顶尖专业人士会补做的四项深度工作（不是扩大功能）

### A. Release forensics（版本与改动归属核验）
- 将最新源码、真实Git diff、提交、构建环境、APK SHA/签名、手机已装包、服务正在运行的web资源版本，整理为同一张“运行工件证据表”；不要根据文档标题、versionName或UI文字推断验收。
- 记录当前未提交文件修改者/时间和可能冲突的工作区域，建立单文件所有权/并行协议；现有他人正在编辑文件一律不覆盖。
- 通过同一版本构建与回归证明“今天的代码”和“安装到手机的东西”是同一工件，避免伪成功。

### B. Model-based lifecycle / fault injection（关键链路状态正确）
- 用可执行状态机审查“点开始→打开原生录音面板→录音及留存同意→设备麦克风权限→实际AudioRecord启动→`smNativeRecordingStarted`→SSE订阅→final定稿→停止→队列出库→Mac落盘→本轮原文→复盘→人工确认→Profile/People回读”。
- 明确每个跃迁的**唯一事件源**：不能在原生未启动时网页先显示“录音中”；重复点/超时/错误回调不能触发双开麦克风、双订阅、重复上传、重复模型计费。
- 注入拒绝权限、连续快速点按、启动后按返回/切后台/锁屏、页面重载、SSE断连、Tailscale不可用、归档暂时401/403/429/500、服务重启、手机重启等故障。每种场景都必须有可理解的状态和一致的停录/回收。官方Activity生命周期以真实Android规范为准。

### C. Threat-model-driven WebView native bridge review
- 核查`AsrActivity.java` 的 `SaveTextBridge` 在`addJavascriptInterface` 注入前后的导航、iframe、错误页、重定向、同源Origin、JS桥可达性，结合`archive-history.html`及网关实际CSP、响应Header、输入转义、上传/下载参数与`trustedPageUrl`状态。
- Android官方明确`addJavascriptInterface`会对**所有frame**生效；只校验顶层可信URL不足以自动证明嵌入frame无权访问。必须构造**跨源iframe调用原生桥**的负面试验，连同恶意filename、超大text、blob/data、http(s)导出、导航到不可信页再返回、主窗口重复回调进行防护。
- 优先减少桥暴露面/阻断不可信frame和导航；若确需原生通信，评估官方推荐的来源受限消息接口，保持现有Java+WebView栈和最小变更。修复前明确威胁及可复现实验，不凭猜测声称漏洞已利用或修复。
- 保持令牌只走受限请求头，不能把token/音频/真实人物原文写入日志、截图、公开PWA或仓库；默认各类云AI/留存同意保持关闭，预算闸（ASR/DeepSeek各1元）不改变。

### D. Outside-in UX verification（真实用户操作证据）
- 按现有`docs/plan/ALW001-N03-SDD-V1.1/prototype.html`和真实`socialmate-v1.2/source/V1.1-baseline.html`比对当前主导航/底部面板/按钮/状态；优先录屏/屏幕坐标/可访问性树证实“找得到、点得到、点后真的发生了”。
- 重点不是颜色重设计，而是1) 从首页按一次CTA是否确实打开可操作录音流程；2) 拒绝同意/网络失败是否能恢复；3) 停止录音后是否能找到本轮原文；4) 已确认事实能否在人物页再看到；5)历史Markdown是否真正保存且能打开。
- Android 15 target35的edge-to-edge和IME、Android12+系统Splash应按当前官方规范做可控真机/模拟器检验；没有对应设备时标NOT_RUN，不假报PASS。

## 03 最原始的证据材料（优先于总结文档）

1. `git status --porcelain=v1`、`git diff --name-status`、`git diff -- <涉及文件>`、`git log -5 --oneline`；记录时间点、HEAD、未提交所有权，**不做reset/clean/checkout覆盖**。
2. Android实际源码：`android-poc/app/build.gradle`、`AndroidManifest.xml`、`MainActivity.java`、`AsrActivity.java`、`SessionArchive.java`、`res/values(-v31)`、`network_security_config.xml`。
3. Web/API真实源码：`socialmate-v1.2/source/V1.1-baseline.html`、`build-v12.py`、`socialmate-prototype/ai-gateway/server.mjs`、`archive-history.html`、N03新增的真实测试源码；勿只看已生成`index.html`。
4. 实际自动化输出：`socialmate-v1.2/.local/qa/verify-20261101-224845.log`是历史基线，不可当0.7.0新结果；本轮必须保留带时间、命令、Git HEAD/工作树摘要、退出码的**新**日志。
5. 真机原始证据：`adb devices -l`、`dumpsys package app.socialmate.dualmic`、`aapt2 dump badging`、APK `shasum -a 256`、`adb logcat`脱敏片段、`uiautomator dump`、手机截图、网络请求时序、按钮/回调事件时间戳。只有设备上同版本可运行才称真机PASS。
6. 用户隐私数据不要读取以完成一般QA；使用虚构合成会话、临时归档目录与隔离服务，测试前后文件hash对比确保正式`SocialMate-Data`没被写入。需要真人/其他人身份的内容后移。
7. Android官方一手规范：
   - https://developer.android.com/develop/ui/views/layout/edge-to-edge
   - https://developer.android.com/develop/ui/views/launch/splash-screen
   - https://developer.android.com/reference/android/webkit/WebView
   - https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
   - https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion
   - https://developer.android.com/guide/components/activities/activity-lifecycle
   - https://developer.android.com/training/data-storage/shared/documents-files

## 04 具体方法与工具（最小够用，不另建测试平台）

- **静态差分**：Git status/diff + 文件归属对照；`grep/rg`找事件和API契约，`node --check`验证新JS、`xmllint`可用时检查资源，Java通过Gradle真编译。
- **契约/状态机/变异测试**：Node `node --test`、既有`test-live-asr.mjs`、`test-android-wiring.mjs`、`qa-people-e2e.mjs`、`verify-v040.sh`；至少加入覆盖“原生未开始时0 SSE/无云AI”“仅启动成功后1次SSE”“拒绝或二次启动后资源状态一致”“多frame不得滥用原生桥”的断言。不得只把原始断言删除换成宽松正则。
- **真机/仿真**：ADB固定serial，`install -r`保留数据，`logcat`、`dumpsys`、`uiautomator`、WebView CDP/Playwright检查UI；证据文件放`socialmate-v1.2/.local/qa`。先查设备是否已授权，签名冲突不可自动卸载。
- **故障注入**：模拟服务器抖动与HTTP返回、断线SSE、后台/恢复、服务/设备重新连接，隔离数据目录+随机端口；不要对真实用户资料制造测试记录，也不需要消耗真人语音/付费模型。
- **安全评审**：针对WebView桥做入口—能力—数据—信任边界表，测试iframe跨源、恶意URL、JS桥调用和CSP/安全header；所有攻击用本地受控虚构页面，禁止向他人服务发请求。
- **质量衡量**：记录用户点击→首条字幕、停止→可阅读原文、回到人物页看到事实的实测耗时分布（记录原始样本，避免预定不切实际目标）、重复写入率、UI误操作率、无授权调用数等；不无依据地拍脑袋规定“必需1秒”。

## 05 N04执行计划：深入4步即可，不扩大产品

### S0：冻结证据与版本对齐
- 检查现有全部未提交改动及开发者正在工作的目标文件，不覆盖。对比0.6.6历史与当前0.7.0**实际差分**；阅读现有N03b未验收部分，执行一轮新的`bash socialmate-v1.2/verify-v040.sh`，记录完整输出/exit code。
- 通过可用SDK重建debug APK，记录versionCode/versionName、APK哈希/签名；已连接ADB且目标唯一时`install -r`到对应设备、截图、回读`dumpsys package`；否则保留构建结果并标`ADB_NOT_AVAILABLE`，继续S1–S3可做项。
- 更新事实表“0.7.0当前状态/已测/未测/他人正在修改”，不改历史回执和HEAD。

### S1：单人操作关键流修实
- 单一主链：网页开始→原生授权→原生启动→字幕订阅→停止→留存队列→Mac归档→复盘确认→正式人物回读，使用虚构数据和隔离服务；先写可失败的回归用例再修真正的缺陷。
- 针对双点/网络变化/界面切换/录音权限拒绝/APP重开做故障注入。每一种状态都要有**真实事件或回执**支持，不允许UI过早承诺成功；成功后只保存一次，原文逐字不改，所有费用/授权保持原限制。

### S2：WebView桥和导出最小安全闭环
- 构造iframe/不可信重定向/私有同源失效/恶意filename与过大文本的可复现实验，验证哪些方法可被调用；根据威胁评估最小改动修护`requestRecording/openRecordingPanel/openDiagnostics/saveText/reloadPage`等能力，未授权必须返回拒绝且0落盘/0录音/0额外请求。
- 验证SAF导出既有MD确实能保存并从手机打开；不能把“打开选择器”算“导出已完成”。不得申请全盘存储权限/绕过HTTPS。若有需要再微调UI，不做全新文件管理系统。

### S3：体验与可复现交付
- 将现有原型与真正0.7.0 UI在**相同手机条件**逐屏对比，只改高价值断点：主CTA是否一眼可见、录音面板可关可开、停止按钮始终可达、错误可自救、历史/人物链路不迷路；保留五Tab、海南115地点公开PWA、图标与系统Splash已有资源。
- 全量回归/独立复查：API权限、原文/AI三类授权、历史和People只处理真实已确认事实、断网幂等、Tailscale私有入口、0预算超限、Android15 Insets（有设备时）、旧Android 11，验收必须比对工件哈希和启动录屏证据。
- 同步`CHANGELOG.md`、`docs/handoff/HANDOFF.md`、`socialmate-v1.2/QA.md`、`android-poc/IMPLEMENTATION_STATUS.md`、本任务QA文档；明确原0.6.0/0.6.6证据是历史，0.7.0的新证据独立成列。

## 06 外部先决条件与权限边界

| 项目 | 类型 | 行动 |
|---|---|---|
| Mac项目源码与Git diff | 开工必须 | 已有工作区，可自行只读核查；并发所有权冲突时改做无冲突验证 |
| JDK17/SDK/Gradle & 当前USB ADB | 开工验收条件 | 已有工具与手机，先自动核验授权serial，不随意切换设备 |
| Android原有签名 | 安装条件 | 只用`install -r`；签名冲突保留手机旧应用，不自动卸载 |
| 归档/腾讯ASR/DeepSeek私有凭据和预算 | 服务条件 | 查本机是否已配置，不读取/打印秘钥；缺失真实联调可用mock完成其它工作，不强制用户再给明文Key |
| 真正真人单人/双人、iPhone/OPPO | **以后才需要** | 本轮不请求真人参与、不阻塞S0–S3 |
| DNS、GitHub、Netlify、数据库 | 本轮非依赖 | 不部署/不购买、不引入新平台 |
| git push、正式发布、删除个人资料、费用增加 | 需用户显式许可 | 本轮未经再次授权一律不做 |
| 录音参与者同意 | 任何真实人声测试必须 | 本轮合成/虚构数据测试替代，实际真人链后移 |

## 07 交付与第三方判定（不能自己说“PASS”就算成功）

| 验收合同 | 独立可复核的证据 | 判PASS条件 |
|---|---|---|
| R1: 代码→构建→手机同一版 | Git diff/时间、Gradle完整新日志、APK SHA+签名、adb dumpsys版本/截图 | 指向同一工件，无旧版冒充 |
| R2: 开始录音与SSE一致 | 事件时间线、原生回调与网络订阅日志、0次/重复触发断言 | 不早订阅、开麦最多1次、失败可恢复 |
| R3: 原文/复盘档案一致 | 隔离前后字节哈希、session和segment源、幂等/失败回滚用例 | 无授权0私有写入；确认后仅指定事实成功且重复不增 |
| R4: 原生桥权限边界 | 明确列出frame/redirect/恶意URL的测试输入、被拒结果、功能回归 | 不可信上下文0原生能力；可信下载仍可正常使用 |
| R5: 手机真正可操作 | ADB UI层级/点击顺序/手机屏幕截图/导出后系统文件可读 | 不只靠HTML模拟或源文件存在 |
| R6: 系统兼容 | Android11实测；Android15 insets/Splash若有设备才实测，否则NOT_RUN | 不把无设备测试写PASS |
| R7: 未破坏其它项目成果 | Git status/测试前后文件hash/公开PWA零更改 | 不重置提交、不更改私人或公开115地点数据 |
| R8: 真实执行完成 | S0–S3每项状态与日志索引、新发现问题清单、交接文档 | 每个自动化可做Task完成，无法代办的有明确证据与后移位置 |

**第三方证据优先级**：新真实手机录屏/系统日志 + 哈希 → 新执行测试日志 → 代码审查 → 文档声明。独立Reviewer可以用这些证据复核，不依赖开发者文字“自证”。

## 08 独立开发者连续执行总提示词（已针对项目精确重写）

你的任务单位是 **N04最终可验收结果**，不是回复一次、完成某阶段或写几份报告。

1. 首先读取本文件及项目最新`AGENTS/agent.md`、`CHANGELOG`、`HANDOFF`、QA、Git状态、Android/JS实际源码、原型和已有验收日志；先核验0.7.0实际工件。**不要将0.6.0/0.6.6历史PASS当0.7.0已通过**。
2. 从最原始材料入手：Git diff、Java/HTML/JS源码、真实测试脚本、设备状态、日志/工件哈希、官方Android规范。先列“证据→风险假设→反例实验→修复→复测”的最小矩阵，不做泛泛重构或增加新功能。
3. 一口气完成S0→S1→S2→S3。每阶段自主执行“检查→写可失败测试→针对性修复→构建/ADB预览→复测→保留证据→下一项”；没有需要用户本人的高风险动作时**中途不问、不等确认、不增加新的Gate**。可以按当前主开发者模式用子代理并行做只读审查/不重叠文件测试，但不能多智能体同时编辑同一文件。
4. 启动/录音/原生桥/私有档案是优先级最高的三个用户价值链；界面只做能证明消除操作失败的最小修正，原型是交互顺序参考，不能替代真机工件。
5. Git dirty且其他开发者可能在现场：不`git clean/reset/checkout`，不擅自提交/推送/部署；先检查文件所有权，无法证明时先做只读回归或没有冲突的独立改动，避免丢人家工作。
6. 真机已具USB ADB条件：第一阶段即检查`adb devices -l`与准确serial；用现有JDK17/Gradle构建预览APK，安全`install -r`保留现有数据，先记录APK哈希与安装版本，再按真正手机操作/截图复测。安装受限不卸载APP，继续可在电脑完成的Task。
7. 网络/API/证书/云AI授权、BOYA硬件与ASR 1元预算、人物确认和原文留存隐私限制保持，人工事实只能经用户确认。所有测试使用虚构数据和隔离目录，绝不自动读写真实私人资料或公开海南PWA。
8. 单人/真人双人及缺设备的iPhone/OPPO验收继续后置；无法代办的账号/授权/高风险删除等，在所有其它能完成的工作完结后**集中列一次Human Gate**，不反复中断。
9. 只有完成所有可自主执行的代码、真实测试和必要QA更新后才结束；最终简明交付：工件版本/哈希、真机截图、回归通过项、新发现/修复的高价值Bug、官方规范对照、仍然NOT_RUN的内容与下一步使用者点击步骤。没有运行证据的一律不得宣称PASS。

## 09 本次云端执行边界

- 本文件由云端按当前Mac项目源码、官方文档编制，**并不是主开发者已在Mac执行新一轮测试的证据**。项目连接器只能读Git/文件并往许可目录写文本，不能直接运行Mac终端、ADB或操作桌面窗口；必须由桌面开发者在真实Mac项目内完成S0–S3与本文件所列工件验收。
- 现有N03收件箱=SENT，既有回执留存；若准备实际通过桌面转发，应按照000唯一管家和现有工作区忙闲规则，用户批准后才变更CURRENT_TASK为新READY。不可因为本文件存在就视作消息已发送。
