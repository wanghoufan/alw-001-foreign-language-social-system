# ALW-001 N03｜SDD V1.1 主开发包（用户已批准，一次性做到P3）

## 00 — 状态与继承
- 项目：ALW-001 外语社交系统；任务：SM-ALW001-20261101-N03；状态：已批准，待GUI转发。
- 项目根：/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
- 本入口：docs/plan/ALW001-N03-SDD-V1.1/README.md
- 本目录还包含实际可点击原型 prototype.html、Android矢量图标资产 assets/socialmate-icon.svg、assets/ic_launcher_foreground.xml、assets/ic_launcher_monochrome.xml、assets/ic_launcher.xml、assets/splash-light.svg、assets/splash-dark.svg、ADB预构建预览脚本 adb-preflight-preview.sh。
- 继承已批准的 **docs/plan/ALW001-N03-Social-Experience-Enhancement-V1.0.md** 所有P0→P3业务范围、安全与验收限制。本版补充和纠正视觉资产、Android官方适配、交互状态、APK预构建/实机预览、连续执行与交接，冲突时以本版为准。
- 现有证据：Android 0.5.4(versionCode14)，N02复盘/确认/正式People主档/幂等/60秒限流已实现，166项Node +12 Android核心断言及Gradle构建有历史通过日志；**历史通过不等于本轮新代码已经测试通过**。
- 真人人声对话、真人双人、iPhone/OPPO缺设备场景全部留到未来，不做本轮P3阻塞。禁止强行声称真人验收完成。

## 01 — 开工前外部依赖预检（一次性，不频繁打断）
检查：Git差异与同仓库并发修改所有权；JDK17+Android SDK+Gradle8.9+AGP8.7.3及Android 35；ADB物理连接、device serial、应用签名和是否有安装限制；Mac私有服务8790/8791/8781、Tailscale Serve、档案读写权限；已有腾讯云ASR/DeepSeek后端Key与**各自累计1元预算**、余额、授权状态；对需要账号登录、设备首次授权、正式发布/域名/DNS/付费的操作列开工硬阻塞/开发者可办/临时配置可替代/最终验收才需要。**本轮不新建云服务/数据库、不需要新Key**。
实际缺某个Key：先Mock/本地规则完成不依赖它的工作，绝不向用户聊天索取明文Key；只在所有可自办工作完成后汇报无法代办的事情。已有用户数据不能清空或覆盖。

## 02 — 开发规范（必须遵守）
1. 保留现有 Java + WebView + Node/Markdown 服务，不转 Kotlin/Compose，不因为版本新就无理由升级架构。Android资源与Manifest沿用工程。
2. 私人APP原有底部5个一级Tab不增减：聊天、软件、海南、关于我、人物。每个Tab做一项核心任务，禁止到处塞其它Tab跳转卡/说明书文字。
3. 现有生产UI源是 socialmate-v1.2/source/V1.1-baseline.html，build-v12.py生成 index.html。不得只改构建产物；必要时改源+生成器并复核重建。
4. 默认浅色，深色必须可读；墨水屏可读，对比清晰。Android系统暗色防白字白底回退；Android15 target35边缘系统栏/insets/键盘安全区按当前官方平台行为适配；不得隐藏重要录音停止控件。
5. 三项同意独立：录音、final原文留存、向云端AI传文字（另有个人资料上下文授权）。默认不向云端AI发送；留存 **每轮默认未勾选**，不得把已给录音权限视为留存同意。不能将自己/他人的说话人spk_0自动认成已知身份。
6. 权威档案是经用户确认的 Mac Profile + People/<slug>/00-profile.md，浏览器localStorage只能是草稿或显式标示的离线缓存；未确认事实不能自动转正式人物，虚构演示数据不能自动流入正式档案。音频逐字原文不得被AI润色覆盖。
7. Tailscale/localhost私有网络、鉴权Origin/CSRF/令牌、TLS校验、路径白名单、目录0600/0700、备份/原子/幂等仍有效；严禁把原始归档token放URL/持久JS localStorage/日志或外网。不得重置腾讯云/DeepSeek累计账本或抬高1元上限。
8. 不改已上线的海南115地公开PWA、不恢复用户已取消的朋友清单回发。禁止Git clean/reset、自动push/deploy、擅自杀服务、删真实档案或替用户审批付款。

## 03 — 交互顺序与唯一事实源
**见面前（人物详情）→ 聊天中（聊天Tab及录音UI）→ 结束后（本轮原文/复盘）→ 人工确认保存 → 下次见面（该人物的历史与3条追问）**。
- 见面前：从已确认事实摘要、上次聊天主题和来源生成最多3条中英追问，优先本地确定性规则，不额外向云端上传个人档案。
- 聊天中：主要区域是字幕，一张「自然接话」卡+一张「继续追问」卡，中英文、复制，可选设备TTS。用户没确认“我也跑步”等关于自己事实时绝不可编造。
- 结束后：只有本轮同意留存且有final才出现相应可读原文；原文逐字不可修改。生成本地复盘0AI请求或在本轮AI授权后计费闸内调用云端；候选每条带来源session/段号，人物归属默认未知。
- 确认保存：用户选择明确候选/人物/章节，勾选后人工点击确认，Profile和People原子/补偿写入，重复不新增；失败显示可恢复理由。之后人物Tab直接显示正式已确认事实，与历史来源一致。
- 隐私/错误：无权限、断线、拒绝云授权、额度不足、模型错误均可查看本地可用功能，不应该被长堆栈或工程术语挡住操作。

## 04 — 强制使用的视觉资源与交互原型
**不是“参考不落地”。** 必须实际打开本目录 prototype.html、测试其中的「见面前→聊天→停止→复盘→人物」点击逻辑并对照Android真实界面。原型用虚构人物与模拟数据，不能冒充生产API/真实社交记录。
图标最终矢量源：assets/socialmate-icon.svg。Android可直接适配的资源：assets/ic_launcher_foreground.xml、ic_launcher_monochrome.xml、ic_launcher.xml；落地到 app/src/main/res/drawable / mipmap-anydpi-v26 + Manifest android:icon。检查108dp图层、66dp核心安全区、图标主题单色/圆形裁切。SVG母版可由开发者在Mac本地导出1024/512 PNG并和截图留证，不得用大段说明代替实际资源。
启动参考 assets/splash-light.svg + splash-dark.svg；应在Mac导出 PNG供设计核对，并在 Android12+ 使用**系统SplashScreen**：单色背景+居中矢量图标+进入真实首页。允许经兼容检查使用androidx.core:core-splashscreen；不增加单独Splash Activity、不用全屏1080x2400静态图强制显示、不要为启动故意sleep。冷启动/主题/insets真实截图必须比对。
颜色建议 #F5F7F3(浅色)、#0C7766(主绿)、#1E3C54(深蓝)、#DDE5E7(描边)。正式样式若与既有主题有冲突，采用和原有产品保持一致的最小融合设计。
**验收表每项须包含：资源源路径 → 目标代码路径 → 真机应用截图/日志 → PASS/PARTIAL；未实际集成即不算完成。**

## 05 — Stage0，先做APK预构建与有线ADB预览
先运行本目录 adb-preflight-preview.sh（建议开发者读取脚本，再在正确的项目根与环境执行）。如果缺执行权限用 bash 脚本路径。
- 项目已有 Android JDK17路径、Gradle8.9构建工具、Android SDK按现有工程预检复用；本脚本调用 android-poc/test-core.sh 与 android-poc/build-apk.sh。
- 先列 adb devices -l，若只有一台device且授权则锁定其serial，若多台必须先使用既有device target lock或ADB_SERIAL，禁止猜。手机有线连接仍须确认实际授权态；offline/unauthorized是真阻塞而不是乱装另一个设备。
- 先**预构建**当前版本debug APK并保存完整日志、SHA256、版本信息；安装采用 adb -s SERIAL install -r （保留数据，不自动卸载/pm clear），失败保留用户现有APP，继续其它代码工作。
- 真实手机安装后启动 MainActivity，Mac捕捉手机 screenshot 到 .local/qa，不提交隐私图到Git。Android原生改动再增量构建/reinstall-r/截图；私有HTML/WebView改动走已有私有服务刷新，**不能把Web改动视作无需更新原生资源的APK热更新**。
- 每个P完成在同一已核验设备上做可控QA或明确标NOT_RUN，修复后继续下一个P。不要偷用模拟器截图替代真机实测。

## 06 — P0→P3任务（连续不断）
### P0：可靠性与授权
P0-01：Android当轮留存默认未勾选，三项授权独立，未同意的原文0写盘/0同步。
P0-02：断网恢复队列少量退避、重启保持、自动补传并幂等；中文状态为「手机已保存」「待上传N条」「已同步Mac」「失败可重试」，不得未上传就报成功。
P0-03：归档令牌 localStorage安全整改，需安全短期凭证或受限原生桥/同源鉴权，不能因为减少手工输入把私有token放URL或公开JS。
P0-04：自动QA覆盖网络切换、401/403/429/路径注入、TLS拒绝、未同意计费0、存储0600/0700，必要时可控ADB模拟。

### P1：人物资料和会话统一
P1-01：人物Tab在私有在线模式从已鉴权 People/已确认Profile 读取真正资料及来源，旧SAV.people演示资料仅作为明确标示的演示/离线草稿，不得静默写入正式主档。
P1-02：名字输入后自动建议安全唯一英文slug或无含义短ID，允许高级修改；后端继续验证重名、非法路径，用户点击确认前绝不创建正式人物。
P1-03：私有历史按人/词/日期搜索和分页/上限；搜索词与原文不出第三方，不为搜索把全部历史批量下载。
P1-04：已确认事实的精准源映射编辑/撤回能力（原人工段落保留），二次确认；无法保证精确删除时安全拒绝。测试仅用沙盒，不删真实数据。

### P2：社交价值提升
P2-01：人物详情增加「见面前准备」最多3条来自已确认事实的中英追问，不加第五以外新Tab，不杜撰事实，首选离线模板。
P2-02：实时建议固定为一条自然接话+一条继续追问，英文优先/中文释义、复制可用；长文本折叠。严格既有云AI授权/节流/预算，不因字幕interim反复付费。
P2-03：手动收藏好的英语句子，记录中英文、来源（仅授权）、时间与可选人物；支持浏览/撤销/复制/本机离线朗读，轻量实现，不另建一个学习平台。

### P3：手机UI与资源、自动QA收口
P3-01：对比 prototype.html 五Tab和内部流程，默认浅色深色可读，适配360/390/412/430手机宽、字体、软键盘、状态导航栏及Android15 edge-to-edge。
P3-02：**落地Android自适应图标+系统SplashScreen**；桌面实际图标和手机启动画面截图验收，不要只放素材。
P3-03：历史Markdown导出在Android WebView内通过系统安全Downloads/SAF可保存、打开、定位，不申请全盘存储权限，未操作成功不得写PASS。
P3-04：全量 Node、既有 qa-people-e2e、verify-v040.sh、Gradle、功能回归，必要时保留数据增量安装与截图。不得复制历史测试数冒充新运行。
P3-05：更新CHANGELOG、QA、handoff、版本、APK路径/hash；说明每项功能用户怎么点及各项PASS/PARTIAL/NOT_RUN。

## 07 — 一次性持续执行提示词
你是本 ALW-001 项目的独立主开发者（可自行派生继承模型的子代理做互不冲突的工作），**用户已批准从Stage0一直开发到P3**。读取本包和旧N03已批准业务计划、项目代码/测试，先预构建APK与ADB手机预览，再按 Stage0→P0→P1→P2→P3 持续迭代「检查→实现→测试→修复→复测→下一项」，不在每个Task、阶段、Milestone或QA停问用户「是否继续」。能自动完成的优先做；无真人/第二人/iPhone/OPPO条件的场景移入未来TODO，绝不阻塞其它软件开发。发现普通BUG、依赖缺失、构建失败自行定位修复。只有用户独有的付费授权、必要设备确认、危险删除/正式发布不能越权，集中列出且先完成所有其余任务。**最后只有一次Human Gate**。
最终交付：使用者操作步骤、真正改动的源码、产品原型对比、图标与Splash在APK中的集成证据、预构建与迭代安装的ADB serial及截图、APK versionName/versionCode/SHA256、全部测试日志、仍需用户做的少量后置真人项。禁止用文档完成代替实际开发。
