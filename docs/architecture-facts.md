# ALW-001 架构与构建事实

更新：2026-11-01

## 并行工作区

- `socialmate-prototype/`：另一智能体维护的 HTML 原型；V0.4.0 只在其 `ai-gateway/` 内做本地组合服务集成，其他文件不改、不覆盖。
- V1.4 主稿与海南资料是只读正式资料，任何原型/集成工作都不得覆盖。

## Web（SocialMate 主站）

- 纯静态前端 `public/` + Node 内置 `server.mjs`，无框架无依赖；Markdown 是唯一数据源（`SocialMate-Data/`）。
- `server.mjs` 静态白名单：只服务 `/` 与 `/styles.css`；新增静态文件需加路由；API 在 `/api/*`。
- 主题：CSS 变量 + `[data-theme]`；`localStorage['sm-theme']`；默认跟随系统；`<head>` 内联脚本防闪烁。
- 路由：hash 路由（如 `#/Topics`），前进后退可用；话题阅读位置用 `sessionStorage['sm-topic']`。
- 本地调试：正式 Docker 占 4173 时用 `PORT=4174 node server.mjs`。
- 正式部署副本：`~/Developer/coding/docker/alw-001-foreign-language-social-system/`；数据挂载 `~/DockerData/alw-001-.../`；Docker 容器 `socialmate` 对外 `127.0.0.1:4173`。
- 演示人物 `Test-Anna` 为虚构数据，可删 `SocialMate-Data/People/Test-Anna`。

## Android PoC（独立工程）

- 路径 `android-poc/`；包名 `app.socialmate.dualmic`；minSdk 26，target/compileSdk 35。
- 工具链：JDK 17（`$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home`）、SDK（`$HOME/android-toolchain/sdk`）、Gradle 8.9（`~/.gradle/alw001-bootstrap`）、AGP 8.7.3。
- 构建：`sh test-core.sh`（12 断言）、`sh build-apk.sh`；产物 `app/build/outputs/apk/debug/app-debug.apk`。
- 依赖：`org.java-websocket:Java-WebSocket:1.5.7`；无 AndroidX/Compose。
- 页面：`MainActivity` 首页 SocialMate 入口，BOYA 检测折叠在高级工具；`AsrActivity` 先录音同意、再启动 ASR，并在同 Activity 内嵌私有 WebView。
- 采集：AudioRecord 48000/44100/16000，优先 stereo，音源优先 `UNPROCESSED` → `VOICE_RECOGNITION` → `MIC`；`setPreferredDevice` 指向 USB。
- 录音文件：`getExternalFilesDir(Music)/dualmic/<timestamp>_<A|B>/`，含 `original/left/right.wav` + `diagnostics.json`。
- 当前版本：0.4.0（versionCode 9），Debug 签名；双麦页削波 >1% 时显示警告。
- `AsrActivity` 录音后同 Activity 显示私有 WebView `/v12?live=1`；debug 构建启用 `WebContentsDebuggingEnabled`，用于 Mac CDP 验收。

## ASR 桥接

- 路径 `android-poc/asr-bridge/`，Node ≥22.9，依赖 `ws`；默认 `127.0.0.1:8790`（避开 Docker 的 8787）。
- 启动：`npm start`（无密钥=mock，事件 `mock:true`）；`npm test` 40 项；`HOST=0.0.0.0` 可局域网。
- 预算：`src/asr-budget.js` 默认 1 元、按 1 元/小时估算，账本 `android-poc/.local/asr-budget.json`（0600）；剩余 ≤0.01 元拒绝新会话 `ASR_BUDGET_EXHAUSTED`，状态见 `/health.budget`。
- 返回 `activeSessions()` 供组合服务健康检查；异常关闭由 `live-server.mjs` 自动重启（最多 5 次、指数退避）。
- 协议：`ws://host:8790/asr?track=A|B|mix&rate=48000&channels=2`；二进制 PCM16 LE；结束发 `{"type":"end"}`。
- 引擎：双轨 `16k_en`；混音 `16k_zh_en_speaker_2.0`（说话人分离）；腾讯云 v2 HMAC-SHA1；v3 未实现。
- 密钥：只放服务端 `.env`（`TENCENT_APP_ID` / `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`）；手机只存服务端地址。
- 手机联调：`adb reverse tcp:8790 tcp:8790`，App 默认 `ws://127.0.0.1:8790/asr`。
- 无线 ADB 也可用：手机与 Mac 同 Wi-Fi，`adb reverse` 建在当前无线 transport 上；插 BOYA 占用 USB-C 时仍可保持映射。

## 组合服务（V0.4.0）

- 入口：`socialmate-v1.2/service-v040.sh {status|ensure|start|stop|restart}`；`live-server.mjs` 单进程先起 ASR 8790，再起 AI/UI 8791。
- 能力校验：`GET http://127.0.0.1:8791/api/asr/status` 返回 `combined:true`；`/api/ai/health` 含 `features.asrLive`、ASR 模式与预算。
- 旧独立 `server.mjs` 只提供 AI，不可当正式 UI 服务；`ensure` 会核验 cwd/命令后替换本仓库进程，外部进程占用端口时拒绝 kill。
- SSE：`/api/asr/live` 由同进程 hub 推送 ASR 事件；AI：`POST /api/ai/analyze`。
- DeepSeek 预算：`deepseek-flash` 上限 1 元，按官方高峰价保守估算，ledger `ai-gateway/.local/ai-budget.json` 跨重启保留；不足 0.01 元返回 `402 BUDGET_EXHAUSTED`。
- ASR 预算随 `/api/asr/status` 的 `asr.budget` 暴露；服务启动前 `service-v040.sh` 会剥离 CodeArts 注入的 `NODE_TLS_REJECT_UNAUTHORIZED=0`，env 文件中的 `=0` 仍由 `live-server.mjs` 拒绝（退出 78）。

## 内容检索层

- 语料：V1.4 正式主稿（51 个软件条目）、海南 115 地点 `places.json`、`asr-bridge/content/personal-stories.json`（仅 `confirmed:true`，当前为空）。
- 实现：`asr-bridge/src/content/`；中英文混合分词 + BM25；精确标题优先；按主导领域收敛建议。
- 接口：`GET/POST /suggest`；WS `{"type":"suggest"}` → `type:"suggestions"`；CLI `npm run suggest -- "<topic>"`。
- 建议：question 为英文模板，share 逐字引用来源；返回 `source/ref/title/basis`；不调用大模型，不读取 `temp/intros-*`。
- 真机：Note 11 0.3.1 已验证从 V1.4 返回 P002 建议（截图 `android-poc/artifacts/dualmic-20261031/suggest-0.3.1-note11.png`）。
