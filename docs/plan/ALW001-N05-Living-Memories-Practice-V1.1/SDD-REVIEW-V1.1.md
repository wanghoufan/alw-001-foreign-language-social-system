# ALW-001 SocialMate · N05 V1.1｜正式SDD审查版（Android Only）

version: 1.1
date: 2026-11-02
status: REVIEWED_SCOPE_READY_FOR_IMPLEMENTATION
governance: SINGLE_MAIN_DEVELOPER_CONTINUOUS
platform: EXISTING_ANDROID_JAVA_WEBVIEW_AND_MAC_MINI_PRIVATE_GATEWAY
source_version_at_read: Android 0.8.1 / versionCode 36
previous_task: SM-ALW001-20261102-N04-V13
task_scope: EXISTING_N05_FEATURE_SCOPE_WITH_DESIGN_AND_SECURITY_CORRECTIONS
ui_proto: 本次会话交付 ZIP SocialMate_N05_SDD_V1.1.zip 内 prototype/interactive-prototype.html
native_assets: assets/launcher-icon-current-brand.svg, assets/splash-preview-light.svg, assets/splash-preview-dark.svg
handoff_note: 本文完整可执行；ZIP内另附带可点击原型、真实流程截图、全套9份独立MD规格和启动/图标PNG概念图。Mac Reader只能写入UTF-8，不能声称ZIP内PNG已自动进入Mac工作区。开发者应优先复用下述Mac项目当前原生资源。

## 一、四项专家审查结论与修订
1. 价值：本阶段解决三个连续闭环：旧友自由文字/语音补记→AI候选核对→人物档案；游玩长文中英/英文多版本→绑定海南固定地点ID→持久时间线；分段中英语音反复听→复制GPT Voice单段Prompt练习→回贴弱项复盘。**不是再添第六Tab**。
2. 原始证据：真实源码 \`android-poc/app/build.gradle\`(0.8.1/36)、\`socialmate-v1.2/source/V1.1-baseline.html\`的People演示渲染、\`socialmate-v1.2/source/places-115.json\`龙兴路id=1、\`socialmate-prototype/ai-gateway/server.mjs\`、\`SocialMate-Data/People\`、N04 QA-LEDGER (T1/T2 PASS，T3/T4/T5 PARTIAL)、当前Git大量N04 dirty改动。不得拿旧0.8.1日志代表未来真机新APK PASS。
3. 方法：以已有Mac单一People/Archive真源、现有Node网关、Android Java+WebView为基础，设计schema→单元/契约/安全负例→真机ADB全链验证；AI仅建议、不直接改人/地点；地图/地点以数字placeId关联，不能直接改115源或公开PWA。
4. 第三方可证：Git HEAD+dirty / rawInput SHA / Mac权威JSON与MD /服务端HTTP回执与权限负例/ Gradle完整日志/APK SHA/手机dumpsys版本/截图/真实TTS音频/外部GPT人工复盘。模拟原型和合成数据不能冒充真机或真人QA。

## 二、修订已发现矛盾：均需执行
- People主页不得再出现“演示人物、恢复演示、清空演示、测试令牌、QA统计、合成final”等；全部搬至“设置→高级→演示与测试”，保留3人物9段母版，清空仅演示副本，不能丢正式人物或用户新增内容。
- 长文地点匹配必须使用\`placeId\`，龙兴路为1；AI返回Top3候选，人手选/确认才绑定。地点原档案只读，个人记录独立永久存储。
- 用户中文一句对应1~2种英文，源片段\`sourceSpan\`和\`rawInputHash\`需能逐字回查，允许用户调整分段。AI误删内容为FAIL。
- GPT训练复盘必须关联\`recordId/blockId/contentRevision\`，旧文章版本报告仍保留，不能错归档；Voice由ChatGPT外部完成，App只复制Prompt/回贴报告，不擅自访问用户ChatGPT私有会话或语音音频。
- 安卓当前正式icon为**单绿色气泡**\`res/drawable/ic_socialmate_foreground.xml\`与monochrome和mipmap adaptive层；N03双气泡SVG只是历史设计草稿。继续用原生Android12+SystemSplash\`res/values-v31/styles.xml\`与night，不创建第二SplashActivity，不把全屏概念图当真正系统Splash；本包\`assets/*.svg\`是品牌预览。
- Android11当前设备：SpeechRecognizer 需要\`<queries><intent><action android:name="android.speech.RecognitionService"/></intent></queries>\`；TextToSpeech需要TTS_SERVICE queries，并分别destroy/shutdown；Android11没有保证可用的离线语音包，若无STT则可手工输入，若缺TTS语音包给出设置/安装说明。验证官方API再改。
- N04旧Tailscale手机尚未登录：不把ADB reverse当真实外出无USB PASS，最终验收集中处理用户授权。

## 三、内容与交互（逐条必须按本内容实际实现）
**五Tab不改**：软件／海南／聊天／关于我／人物；设置在右上角，不额外加“英语练习”Tab。
**People首页**：顶栏「我的人物」+搜索+新增→真实联系人列表→低密度「补充朋友信息」。点选目标人物后可以粘贴或口述多条旧信息，点“AI整理”得到可编辑候选事实（基本信息、兴趣、计划、经历、习惯），可勾选、修改、辨重复/矛盾，确认后只写该人物，触发已确认事实重算定制话题。无确认或错人0写。现有AI配额不可提高。
**海南活地点**：龙兴路原始图文介绍照常显示；下方“我的游玩记录”按时间。点“记录新想法”，可粘贴10+段中英混排/中文对应英文A/B/搭配→建议最多3个地点或手动选择，需确认；可拆并段落、核对翻译/来源→追加私有时间线。保存失败保原稿；未匹配可暂存待归属草稿。
**双语听读**：每次记录内学习段第N/M段，中文原句/英文A/B/常用表达按钮，原生Android TTS可单项朗读、0.75/0.9/1.0倍速、循环、停止、前后段；切段离页停读，voice按中文/英语分别设置，手机无可用引擎时不能假成功。
**GPT语音练习**：复制本段Prompt到ChatGPT Voice，由GPT先中文考固定词组，等用户英文回答，然后中文整段让用户用两种自然英文表达，最后才给改进和带段ID的复盘。用户从ChatGPT复制总结回App，先确认归属/版本/文字后追加记录，弱点/练习次数在同段可见；不宣称自动回传。
**状态和主题**：初次默认浅色，同时提供深色/跟随系统、跨重启保持；主字至少15-16sp、点按目标≥44dp，弱网/离线/等待/预算不足/失败/冲突清楚说明、失败不丢输入。Android真实APK不是浏览器原型。

## 四、数据合同与安全
已有\`SocialMate-Data/People/<slug>/00-profile.md\`为人物真源，人工补记使用\`manual_text|manual_voice\`、批次ID、原文摘录、确认人、时间、幂等事务；不得给手动输入伪造\`sessionId/segmentIndex\`。
地点新增\`SocialMate-Data/PlaceNotes/<placeId>/records/<recordId>.json\`（建议；真实代码要先核对目录权限和部署映射），字段\`placeId,recordId,rawInput,rawSha256,revision,blocks[],createdAt,changeHistory\`；Block至少\`blockId,order,sourceSpan,cnSentences,enVariants[],phrases[],reviews[]\`。服务端路径只能从合法placeId派生，不接受客户端路径；写API绑定现有配对短令牌/Origin与CSRF检查、容量和频率限制、源文XSS转义、原子写/备份和compare-and-swap。所有真人内容私有，不进入静态PWA或Git。
复盘\`practiceReport\`保存\`recordId,blockId,contentRevision,rawReport,weakPhrases,practiceTime,status\`，旧版本保留并标记。AI生成的不确定摘要不得自动标已掌握。

## 五、唯一主开发者连续执行S0→S6
S0前置依赖全扫描+旧N04并发归属检查+**提前Android APK预构建/ADB install -r与真实手机预览**，保存HEAD/dirty、APK哈希和已装版本；API Key只探针不读明文。
S1 People UI去开发化，把演示管理移设置、回归3人9会话且普通首屏无调试控件。
S2 人物文字与语音输入→AI可编辑候选→确认入档/撤销→个性化话题变化；测新增/重复/矛盾/错人、权限拒绝、AI额度/超时。
S3 私有地点记录→placeId确认→多段对齐CN/EN A/B→两次记录时间线与历史/恢复，不动115源。
S4 Android Native TextToSpeech中英可用性与朗读队列→循环/停播/切段/耳机实听，系统Voice缺失时有可理解反馈；只读概念原型不得当APK实测。
S5 单段GPT Voice Prompt复制/手工外部练习与两份报告回贴，版本不串档，无自动抓ChatGPT聊天。
S6 全量安全与回归，最新APK构建并adb install -r保留数据，准确serial截图/测试日志/QA，更新HANDOFF/CHANGELOG/Android状态；最后一次Human Gate。N04已经PASS功能不重做，只补相应回归。

## 六、全阶段 A/B/C/D前置条件（必须在S0实际核查，完整矩阵以旧N05 PREFLIGHT及本SDD为准）
A当前**没有已确认需要你现在额外提供的硬阻塞**。B主开发者处理：Node22、JDK17/SDK35/Gradle8.9、ADB连线/版本、8790/8791/8781/8782 Mac服务、People/Archive与新PlaceNotes文件权限、源数据hash、现有DeepSeek/腾讯云Key的有效性与各1元预算、系统TTS/STT可用性、Mac磁盘/自动恢复。C：AI或系统STT失效则先完成文字/人工整理与离线输入；无语音引擎时不停止其它Task，但真TTS不能假PASS。
D最后需要用户本人：在Redmi11手机完成Tailscale登录同Mac tailnet、可能的USB/麦克风/语音包授权、最终试听中英文、在已登录ChatGPT APP上做一段Voice练习并粘贴复盘、真人双人BOYA同意（如要验）。本阶段不需要Vercel/Netlify/Cloudflare/DNS/GitHub新账号/数据库/新TTS付费Key或ChatGPT API Key。若实际Key失效或2FA必须用户本人操作，开发者S0一次性汇报且先做可独立完成部分，任何新费用或提高预算先另获许可。

## 七、ADB真实预构建与真机查看（Mac开发者执行）
\`\`\`bash
cd /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
adb devices -l
bash android-poc/build-apk.sh
APK=android-poc/app/build/outputs/apk/debug/app-debug.apk
shasum -a 256 "$APK"
# 先核实唯一目标serial，以当前设备为准；避免卸载造成用户数据丢失
adb -s REDACTED-SERIAL install -r "$APK"
adb -s REDACTED-SERIAL shell dumpsys package app.socialmate.dualmic
adb -s REDACTED-SERIAL shell monkey -p app.socialmate.dualmic 1
adb -s REDACTED-SERIAL exec-out screencap -p > /tmp/socialmate-N05-preview.png
\`\`\`
安装签名冲突须保护数据、不自动uninstall。每完成一个核心UI/原生模块重新构建安装预览，以实际手机显示和操作回执为准。APK初构建是开工义务不是最后才做。

## 八、最终验收与真实交付
QA01: People首屏0演示按钮；设置里3人9会话恢复/清空且真People hash不变。
QA02: 任意旧朋友3条输入→候选→确认/撤销，重复与错误归属0写，重启后话题确实个性化。
QA03: 龙兴路id=1原资料不变，2次私有记录、10+段一中文两英的来源对齐与版本可读。
QA04: Android11真实中英TTS/循环三轮/切段停止/系统缺声线异常不假报。
QA05: GPT Prompt含固定recordId/blockId/revision，ChatGPT Voice人工练习后两个报告可回贴、旧版分离。
QA06: 原公开PWA/115源git diff与sha零变，未授权网路/路径/重复等负面测试通过，未提高AI预算。
QA07: 真机安装版本、APK SHA、有效截屏、测试退出码、Mac原始记录和独立Reviewer可复查，真人和手机尾项NOT_RUN透明。
所有可完成任务按“分析→改→测→修→复测→下一步”连续推进；最后才一次Human Gate。演示母版、私人数据和历史QA不得因为重构清掉。

## 九、视觉资产与使用规范
这三份文本 SVG 已直接写到本目录\`assets/\`：\`launcher-icon-current-brand.svg\`、\`splash-preview-light.svg\`、\`splash-preview-dark.svg\`。**它们是对用户的设计效果参考**。正式安卓图标必须使用\`android-poc/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml\`、\`res/drawable/ic_socialmate_foreground.xml\`、\`res/drawable/ic_socialmate_monochrome.xml\`和色板；Splash继续\`res/values-v31/styles.xml\`与night，当前系统只显示图标/底色，概念长画布含SocialMate文字不应作为Android12系统Splash。ZIP中的PNG四屏设计是概念而非真实拍摄，任何文字/地点内容仍以原有115数据为真源。
官方对应：Android TextToSpeech、SpeechRecognizer、Splash和Adaptive Icons及ChatGPT Voice应按本轮交叉审查的官方规范逐项复验。
