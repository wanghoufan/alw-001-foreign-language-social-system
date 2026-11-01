# ALW-001 · 下一步执行单 · 双麦 PoC → 安卓 APK → 腾讯云 ASR

日期：2026-10-31｜状态：任务已交接，**源代码已写入；实际构建和真机测试尚未执行**。

> 执行回执（2026-10-31 18:30）：构建、真机安装、博雅双麦测试、ASR 桥接与 MOCK 真机联调已完成；实际结论与证据见 `IMPLEMENTATION_STATUS.md` 与 `artifacts/dualmic-20261031/`。后续只剩真实腾讯云密钥、可选立体声复测与 V1.4 语料接入。

## 现场既有条件

- 目标项目：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- 独立 Android 工程：`android-poc/`
- 硬件：用户已有 BOYA 博雅一拖二（具体型号未核实），一台红米安卓手机，接收器由 USB-C 接入。
- 正式软件介绍主稿：用户上传的 `2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`，不能用 `temp/intros-A～I` 替代。
- 当前工程：无网络/无腾讯 ASR，仅 USB 音频设备检测、双声道/单声道测试、A/B 各 5 秒 WAV 保存、结果导出。
- Project Reader 允许对 ALW-001 写入，但**不支持 Mac shell 命令和真实手机操控**。须由拥有桌面终端与安卓真机能力的执行者完成下列步骤。

## 不要再重复方案讨论；立即执行

### 第一段：环境与静态代码 QA（无需用户）

1. 读取 `~/.agents/AGENTS.md` 和工程 `README.md`、`IMPLEMENTATION_STATUS.md`、源代码与构建脚本。
2. 检查 JDK 17、Android SDK、SDK Platform 35、Android Studio、`adb`、gradle 是否存在。缺的、无需用户付费/授权即可安装的自行安装。
3. 运行：
   ```sh
   cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/android-poc"
   sh test-core.sh
   sh build-apk.sh
   ```
4. 任何 Gradle/Java/Android Manifest 编译错误都要自己修复、重编、直至获得 APK；不能因一个依赖问题就停止。
5. 用 `adb install -r app/build/outputs/apk/debug/app-debug.apk` 安装；如果未连接设备，完成可离线的构建与测试，保留 APK，并在用户接入设备时继续真机测试。
6. 先核验：麦克风权限拒绝/授权、USB 输入选择、UI 布局、保存 WAV 及 JSON，安卓应用不请求网络或后台录音权限。

### 第二段：BOYA 真机 QA（只在这里需要用户配合）

1. 两个麦配对、插 USB-C 接收器；界面确认确实选中 USB 而非内置麦。
2. 用户对 A 说英文 5 秒（B 静音）；再对 B 说英文 5 秒（A 静音），手机保持前台。
3. 导出两次 `original.wav`、`left.wav`、`right.wav`、`diagnostics.json`，比对采样率/声道/实际路由和左右音量。
4. 人工试听左右音轨，验证是否一人主要落在一侧，不能只看手机返回 stereo 就宣称分轨。
5. 若设备有 MONO/STEREO 模式，分别实测。增加两人同时讲话、嘈杂环境、重插 USB、异常停止的测试，保存证据。
6. 得出明确结论：`TRUE_STEREO_CANDIDATE`、`MONO_MIX`、`ROUTING_FAILED` 或 `INCONCLUSIVE`，并附两段真实设备证据。

### 第三段：确认结果后直接接 ASR（不要再重启产品规划）

- 真正双轨：拆成两路 16kHz PCM16 mono，建立两条腾讯云实时 ASR 会话，A/B 身份由独立通道对应。原声可 48k 采集，发送前必须做正确重采样；严格检验混线/串音。
- 混音或单轨：以腾讯云支持说话人分离的实时引擎单路识别，并允许修改或标记未知说话人。
- ASR 输出需逐轮英语原始转写、准确时间戳、说话人来源与不确定性；不把 AI 润色文本覆盖转写。
- 腾讯云密钥只放服务端，安卓客户端不能内置 SecretId/SecretKey；若尚未具备 API 账户或余额，先用本地模拟传输和录音样本跑通无密钥模块，不阻塞其他开发。
- 再接三类内容检索：软件作品集 V1.4、海南 115 地点、已确认个人故事；实时推荐 2-3 条自然英文追问/自己的分享，会后经用户确认更新人物档案。
- 录音必须双方知情同意；提供停止和删除。不要在未核实权限前开放公共服务。

## 本轮立即验收

- 第一交付物：Android Debug APK 确实完成编译，记录确切路径、版本、构建日志（PASS/FAIL），不可说「源代码存在＝已编译」。
- 第二交付物：博雅真机 A/B 两段测音及 JSON/WAV，确认具体设备是否真正分轨。
- 第三交付物：所选 ASR 路由说明及最小连通验证；如账户阻塞，分别列出已完成的无 Key 工作和唯一需要用户操作的项目。
- 更新本目录 `IMPLEMENTATION_STATUS.md`，记录测试证据；不要覆盖正式数据、不擅自部署。
