# ALW-001 · UI 接管执行记录 · 2026-11-01

## 基线与现状
以 ALW001-State-Handoff-V1.0.md、最新 socialmate-v1.2/QA.md 以及 2026-11-01 08:29 验证日志为基线。原 Android MainActivity 是 BOYA 双麦工程诊断页，用户需再点击进入「实时英文 ASR（实验）」后才能看到 SocialMate。正式 WebView 具备 51 软件、204 步、115 地点和五 Tab，不应重做。

## 本轮已经实际写入源代码
1. android-poc/app/src/main/java/app/socialmate/dualmic/MainActivity.java：首页优先展示 SocialMate 日常入口，主按钮「开始实时对话」直达现有 AsrActivity；保留录音与云端 AI 分别授权的说明；原 BOYA A/B WAV 诊断、设备选择和导出功能均保留于默认折叠的「高级工具」，不删除原逻辑。
2. socialmate-v1.2/test-android-wiring.mjs：增加日常入口、诊断保留的源代码回归断言。
3. docs/SocialMate-Recording-Entry-UI-Preview-V1.0.html：此前独立可浏览设计参考，不参与打包。

## 尚未验证／不得冒充通过
Mac Project Reader 不支持 Mac shell、Gradle、adb，本轮没有执行构建或更新 Redmi Note 11 5G 上 APK。故 UI 改动仅属于「代码已写」，**不是 APK 构建通过或手机 UI 验收通过**。原 ASR/AI 93/93 测试为先前版本的历史证据。

## 必须完成的下一轮
1. 本机执行 bash socialmate-v1.2/verify-v040.sh，检查新 MainActivity 编译、代码断言与 115 地点重建，修复任何错误。
2. 使用已确认的设备序列号 &lt;note11-serial&gt;，保留数据安装更新的 Debug APK，测试首页按钮→AsrActivity→录音同意→真实字幕→聊天卡；确认「高级工具」能展开且 BOYA A/B 诊断仍正常。不得操作另一台手机。
3. Android AsrActivity 当前仍保留工程式录音页；后续需将录音状态、停止按钮融入正式聊天 UI，服务器地址/日志留在高级设置，而非取消录音控制。此项没有在本轮冒险重构。
4. 重点排查反复出现的 NODE_TLS_REJECT_UNAUTHORIZED=0 警告：在系统环境/启动上下文确定来源，移除关闭 TLS 验证的配置，并以真实腾讯云连接复测；未定位前不得声称安全问题解决。不要在项目文件中写密钥。
5. 无 USB 连接需在 HTTPS/身份校验和默认私有边界验证后才上线，禁止直接公开 localhost 私有 SSE。

## 禁止回退
保留当前 BOYA、腾讯云 ASR、DeepSeek 1 元预算闸、SSE、独立录音与云端文字同意、五 Tab、默认浅色和可调字号，51/204/115 数据。不得清空手机数据、擅自重置工作树或推送部署。

## 第二轮：录音页日常化（当前会话追加）

已直接修改 `android-poc/app/src/main/java/app/socialmate/dualmic/AsrActivity.java`：
- 默认页面改为 SocialMate 实时对话操作，保留录音同意、开始、停止、打开聊天和状态。
- 服务器 URL、轨道选择、USB 细节、原始 interim/final 调试、清空、手动检索均放入默认折叠的高级设置；所有原控件仍初始化，旧 ASR 逻辑继续使用，不改 TCP/ASR 接口。
- WebView 聊天页顶部新增「停止录音」按钮，仍调用原 `stopStreaming("用户停止")`；切后台即停录及独立云端文字授权规则未修改。
- 扩充 `socialmate-v1.2/test-android-wiring.mjs` 的静态回归断言，保护控件、隐私和录音停止路线。

验证口径：Project Reader 已回读源码核对关键控件存在，仅完成静态检查；Mac 真实 Node/Gradle 和 Redmi 真机尚未执行。本轮源代码待构建，严禁把此前 V0.4.0 的 93/93 PASS 套用到修改之后。

执行交接：在 Mac mini 执行 `bash socialmate-v1.2/verify-v040.sh`；若通过再仅对目标序列号 `&lt;note11-serial&gt;` 更新 APK，验证首页→录音→WebView→停止、折叠高级设置、退出停录、BOYA 路由及隐私许可；不要清空数据或操作其他设备。

## 第三轮：Android 原生视觉层级和停止录音一致性

已实际写入：
- `MainActivity.java`：白色圆角卡片、墨绿主操作按钮、浅色背景与设备诊断折叠区，修正文案不再将测试实验页当作用户入口。
- `AsrActivity.java`：将录音同意、开始/停止、连接状态组合在主卡片，专业诊断维持次级折叠；聊天顶栏直接停止录音，危险动作使用区别色。
- `test-android-wiring.mjs`：增加 UI 结构与关键调用回归断言。

安全边界：不改 ASR/WebSocket/腾讯云/DeepSeek/计费策略；不改五 Tab HTML 数据。当前仍是安卓原生控件而非完整设计系统，视觉改善需以目标手机截图评审。没有获得 Mac shell 能力，不能将静态检查视为 Node 或 Gradle PASS。

本轮风险关注：`NODE_TLS_REJECT_UNAUTHORIZED=0` 日志警告在最新服务仍存在。必须检查 shell 与服务运行环境并清除不安全值、用真实腾讯云证书验证复测；不应通过禁用 TLS 校验解决上游连接问题。

下一次具有本机执行权限时按序：
```bash
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
bash socialmate-v1.2/verify-v040.sh
# 成功后仅安装到用户已经授权的 Redmi Note 11 5G
bash socialmate-v1.2/install-phone-v040.sh --serial &lt;note11-serial&gt;
```
APK 更新前先确认 App 数据保留、无其他开发进程/未提交修改被覆盖。录音同意与云端 AI 同意必须分开验收。最新 UI 改动不提升 APK versionCode，因此安装后需通过实际界面与构建日志确认安装的是新产物。

## 第四轮：TLS fail-closed 与桌面执行职责隔离
云端本轮已写：
- `socialmate-prototype/ai-gateway/live-server.mjs`：Node 载入环境文件后检测 `NODE_TLS_REJECT_UNAUTHORIZED=0`，拒绝启动并退出 78。不得打印密钥。
- `socialmate-v1.2/service-v040.sh`：在创建新服务进程前，拦截继承的危险环境变量。
- `socialmate-v1.2/test-tls-guard.mjs`：两组源码回归断言。

**限制**：已有运行中的不安全服务不会由本次源码编辑自动终止；现有 ensure 模式可能复用旧进程。桌面开发者应定位根因、删除危险环境配置、使用已有安全 stop/restart 流程替换受影响的进程，并以真实腾讯 ASR + DeepSeek 网络请求复测。代码尚未在 Mac 执行，不能报告 TLS PASS。

并行分工：云端负责 UI 源代码和安全防护审查；桌面仅负责 Mac shell/构建/ADB/浏览器截图/真实 TLS 根因与验收，并且如果需要修改冲突文件，先记录差异、保留云端改动后修复，不重置 git 工作树。

## 第五轮：修复 TLS 防护检查的导入时序
发现 Node ES module 静态 import 会在模块主体执行前先评估依赖。因此原版检查虽然写在 import 之前，仍不能保证在依赖初始化前运行。
已将 `live-server.mjs` 的业务静态 import 替换为顶层 await 动态 import，在 `NODE_TLS_REJECT_UNAUTHORIZED === "0"` 检查之后才加载依赖；`test-tls-guard.mjs` 同步断言先后顺序。
**未做 Mac Node 真执行**；这不代表现有旧进程已安全、也不能证明腾讯 ASR 证书连接成功。桌面执行者需运行新增测试并做实际重启连接验收。
