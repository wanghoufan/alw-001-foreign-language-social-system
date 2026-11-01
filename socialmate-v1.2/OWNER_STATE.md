# ALW-001 V1.2.1 · 主开发者接管状态

日期：2026-10-31
用户明确告知：桌面开发者已经停止工作，由当前云端 ChatGPT 直接接管。

## 唯一正式 UI 修改主线

- 真实 115 地点单文件：socialmate-v1.2/index.html
- 可重复生成的基准源：socialmate-v1.2/source/V1.1-baseline.html
- 构建脚本：socialmate-v1.2/build-v12.py（仍负责从 23 地点基准生成 115 地点）
- 当前名称虽叫 V1.1-baseline.html，但源码已同步 V1.2.1 内容优先、显示设置、个人标签、私有 AI 联动；后续不得用旧下载包覆盖此文件。
- 回归测试：socialmate-v1.2/test-display-and-ai.mjs
- 私有 AI 服务路由：socialmate-prototype/ai-gateway/server.mjs GET /v12；POST /api/ai/analyze 已有 DeepSeek 官方、OpenCode Go 真实调用。

## 本轮已经直接写入

- 去掉四个一级资料页首屏绿色介绍 Hero；聊天页仍以会话内容为首屏。
- 右上齿轮：整体字体四档、英文三档、密度三档，localStorage 本机记忆。16px 中文 / 18px 英文 / 14px 辅助标签为默认。
- 关于我：分类与自定义标签统一筛选；编辑/新增卡片可输入分类和多个标签。
- 正式 V1.2 页面加入真实 AI 请求：默认离线演示，用户本轮主动授权并从 127.0.0.1:8791/v12 打开才发网络请求；无 Key/网络错误显示规则回退。绝不将服务密钥写进 HTML。
- 8/8 组 Node 测试逻辑在工具侧 V8+Node shims 环境下执行通过；没有在 Mac mini 终端直接执行 node --test。

## 证据与禁止越级

- 桌面开发者已有腾讯云 ASR、DeepSeek 官方和 OpenCode Go 真实调用 QA；这些是既有成果，不等于新版 Android UI 集成验收。
- BOYA 当前依旧是 MONO_MIX，真正双人 speaker mapping 未经真人验收。
- socialmate-v1.2 的既有 phone-test-result.json 和 ui-test-result.json 为 UI 改版前记录，V1.2.1 的字体/密度/真机仍待新一轮测试。
- 根目录 CHANGELOG.md、android-poc/asr-bridge/ 仍有先前未提交的修改；保留，不执行 git clean/reset/强制提交。
- 当前连接支持读写源文件与 Git 状态，但不提供 Mac 终端、adb、浏览器截图执行；无法独立宣称已完成真实 Mac 命令或手机 QA。

## 下一步可连续实施

1. 在 Mac mini 真正执行 node --test socialmate-v1.2/test-display-and-ai.mjs，构建后复测，留原始日志。
2. 用 Chrome 与红米/小米/OPPO 原生浏览器复查 320/360/390/430/768/1440px、超大字号/英文特大/紧凑宽松及设置持久化。
3. 将 Android ASR final 稳定字幕与新正式 UI 的私有 /api/ai/analyze 接口整合；不得每个 interim 都调用付费 API。
4. 为个人话题建立与 SocialMate-Data 官方 Markdown 的授权同步路径，保留人工确认；现阶段原型的 localStorage 不能冒充持久跨设备档案。
5. 发布前进行服务鉴权/TLS、真实弱网回退、隐私与计费限制验收；不要将私人 UI 或 Key 公开部署。


## 2026-10-31 第二轮直接接管：V0.4.0 前台单机 ASR → AI 页面桥接

- 正式页面 `index.html` 及唯一构建源 `source/V1.1-baseline.html` 同步新增「连接实时字幕」/「停止接收」；通过本地 SSE `/api/asr/live` 接收来自安卓正在运行的腾讯云 ASR 事件，`interim` 仅显示、`final` 追加。
- 保留 `mock:true` 标识；`spk_0` 仍标「说话人待确认」，没有擅自归属身份。真实 `final` 在用户云端同意且限流 2.5 秒时才调用真实 DeepSeek/OpenCode Go，MOCK/interim 不请求付费模型。
- `android-poc/asr-bridge/src/server.js` 新增可选 `onEvent` 同进程观察回调；原 WebSocket 协议和客户端行为保持兼容。
- `socialmate-prototype/ai-gateway/live-asr-hub.mjs` 建立只读 localhost SSE，最多两名观察者，不转发音频和秘密字段；`server.mjs` 新增 `/api/asr/live`。
- `live-server.mjs` 在同一 Node 进程内启动 8790 ASR 与 8791 AI/HTML，通过内存回调转发，不使用公网或额外 webhook Token。
- Android `AsrActivity.java` 已新增受限本地 WebView；启动前台录音时直接显示正式 V1.2 UI，顶部提供「返回录音控制」和「刷新界面」，不需要离开当前录音 Activity，回退可继续控制，退到后台仍自动停录。
- Android `app/build.gradle` 源码版本已更新 `0.4.0`（versionCode 9），这**不代表 0.4.0 APK 已经编译、安装或验收**。
- 新增 `test-live-asr.mjs`（6 组）、`live-asr-hub.test.mjs`（3 组）和 ASR live-hook 协议回归（2 组）；前两组已在 V8 兼容环境运行通过 6/6 与 3/3。ASR `ws` 真 Node、Android Gradle 构建尚未在 Mac 运行。
- 组合启动与全量构建脚本位于 `run-live-v040.sh` / `verify-v040.sh`；尚需本机终端实际执行并保存日志。
- **目前仍是开发环境试运行架构**：安卓通过 ADB reverse 两个端口访问 Mac mini，不能宣称在酒吧等无 ADB 条件下已经可用。正式外网/长久在线需要私有加密访问、服务守护、自启动和权限治理。

### 持续推进且无需用户立刻配合

1. 真 Mac：运行 `bash socialmate-v1.2/verify-v040.sh`，修复 Gradle/Node 错误直到 APK 构建成功。
2. 真机：ADB reverse 8790/8791；装新 APK，按开始识别，WebView 与录音同处 Activity，主动勾选云端同意、点击连接实时字幕，检查腾讯云 final → DeepSeek 建议。
3. 复测真实手机背景/前台、弱网、WebView 缩放/厂商浏览器和资源释放。涉及真人音频仍需用户知情参与；优先先做全部无硬件工作。


## 2026-10-31 23:25 · 用户已执行 Mac 原生构建

已由 ChatGPT 读取本机原始日志 `socialmate-v1.2/.local/qa/verify-20261031-232512.log`，证明真实 Node 测试 18+15+37+18 = **88/88 PASS**，另 12 个 Java 核心断言 PASS，115 地点重建成功、Android Gradle `BUILD SUCCESSFUL in 7s`。

APK 已真实输出到 `android-poc/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `02bbba7a444813767acdc21e2efc015e37889ca42fde38dbe7bb7f1123cef92f`。前文「Mac 上尚未实际执行」属于历史记录，本节覆盖。

已写入 `socialmate-v1.2/install-phone-v040.sh`：接一台已授权 USB 安卓手机后，可执行安装 APK（保留旧 App 数据）、检查/启动 8790/8791 本地服务、ADB 端口反向映射、打开 MainActivity；记录手机安装与服务模式至 `.local/qa/phone-install-*.log`。本聊天还未实际调用该脚本，故**尚无手机安装或真机 QA PASS**。
