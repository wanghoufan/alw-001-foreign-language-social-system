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
- 当前版本：0.5.2（versionCode 12），Debug 签名；双麦页削波 >1% 时显示警告。
- 网络策略（0.5.2）：`usesCleartextTraffic=false` + `res/xml/network_security_config.xml`，明文只放行 `127.0.0.1`/`localhost`/`::1`；非回环明文在 WebView 报 `ERR_CLEARTEXT_NOT_PERMITTED`。未覆写 `onReceivedSslError`，坏证书走系统默认拒绝。
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

## 本机档案（2026-11-01 新增）

- 存储：`SocialMate-Data/Profile/current.json`（权威，0600）+ `current.md`（人读，0600）。
- 目录 0700；临时文件 0600；服务启动时 `tightenPermissions()` 把历史遗留的 0644（如 `current.md`）收紧到 0600，只改权限不改正文。
- 写入：`PUT /api/profile`，必须带 `confirm:true`（服务层校验，缺失返回 400 `CONFIRM_REQUIRED`）；单次 ≤64KB，只保留 stories/people 已知字段。
- 读取：`GET /api/profile`；V1.2 页面加载时若服务端 `updatedAt` 更新才恢复，否则保留本地。
- 界面：`/v12` 的「关于我」页有「同步到本机档案」按钮，`profile-sync.js` 由服务端同源提供；`file://` 或离线时脚本静默失效，仍纯 localStorage。
- 隐私：该目录已被 `.gitignore` 排除，不进公开仓库、不上传云端。

## 会话归档与接收端（2026-11-01）

- Android `SessionArchive`：仅 `final`、逐字不 trim；勾选留存才写 `filesDir/archive/current.json`（原子写），停止后移入 `outbox/`，上传 2xx 才移入 `exported/`。
- 归档地址与令牌存在本机 SharedPreferences（`socialmate-archive`），默认 `https://mac-mini.tail4e4317.ts.net/alw/api/archive/session`；未配置时显示「待配置」。
- Mac `archive-receiver.mjs`：`127.0.0.1:8781`，`SM_ARCHIVE_TOKEN` 必填；`POST /api/archive/session`，≤512KB，令牌比对用 timingSafeEqual；`GET /health`。
- Tailscale Serve：`443 /alw` → 8781、`8443` → 8791、`10000` → 8790（原有 `/` → 8779 不变）；真证书，只有 tailnet 可达。
- App 地址可配置：`socialmate-config`（`asr_url`、`ui_url`）、`socialmate-archive`（`archive_url`、`archive_token`）；默认本机，可切 Tailscale。
- 落盘：`~/Documents/SocialMate/Conversations/YYYY/MM/SocialMate-YYYY-MM-DD-HHMMSS-<sessionId>.md|.json`，0600；JSON 最后提交，重放幂等。
- 历史 UI（2026-11-01）：`archive-history.mjs` 只读扫描上述目录；`GET /api/archive/{list,session,export}` 需 `x-archive-token`，日期区间按 **UTC** 比较；`GET /history` 只返回静态壳（无数据）。私有 UI 经 `server.mjs` 的 `/v12/history` 与 `/v12/api/archive/*` 同源反代（仅 GET，令牌透传，归档端未启动返回 503 `ARCHIVE_UNAVAILABLE`）。

## 会后复盘确认写入（2026-11-01 N02）

- 模块：`session-review.mjs`（复盘引擎）→ `review-confirm.mjs`（事务编排）→ `profile-store.mjs`（本机档案）+ `people-store.mjs`（正式人物主档）。
- `POST /v12/api/review`：`x-archive-token` 必填；`mode=local` 0 次外部请求，`mode=ai` 需当轮 `consent:true` + 1 元预算闸。
- `POST /v12/api/review/apply`：令牌必填 → 先经归档服务取会话（令牌无效 401 / 会话不存在 404）→ 段号必须命中该会话真实段号（否则 `SEGMENT_NOT_FOUND`）→ 再写盘。限流：同一进程 60s 内最多 12 次、最小间隔 400ms，超出 429。
- 人物归属：只接受用户显式选择的**真实人物主档 slug**（`GET /v12/api/people` 列出现有 `People/<slug>/00-profile.md`）；未选择 → `PERSON_NOT_SELECTED`，不新建人物、不按显示名猜人。
- 写入顺序：先 People（逐文件原子替换 + 写前备份 `.sm-backup/` + 写后自检 `sm-src:<key>`），再 Profile；Profile 失败时用备份回滚 People，杜绝“界面说已保存、实际只写了一半”。
- 幂等：`sessionId + 段号 + 文本指纹`；People 行内嵌入不可见 `<!--sm-src:key-->` 标记用于跨重启去重。用户改写候选时，`sources[].original` 保留原始候选文本。
- People 分节映射：`interest/work/hainan/common/plan/preference/topics/basic/avoid` → 模板同名 `# 章节`；只追加到章节末尾，不动 front matter 与人工段落；文件 0600、目录 0700。
- 同源校验：`Origin` 与本次请求 `Host`（或 `x-forwarded-host`）一致即视为同源，覆盖 Tailscale Serve 的 `https://<host>:8443`；只认 `127.0.0.1:<port>` 会把真机 POST 全部 403。



- 源文件：`socialmate-prototype/public-share.html/js` + `public-places.js` + `styles.css` + `manifest.webmanifest` + `sw.js` + `icon.svg`。
- 打包：`node socialmate-prototype/package-public-share.cjs`；只允许 7 文件，拒绝 `/api`、profile/asr/ai、DeepSeek、麦克风与私有页面引用。
- 功能：115 地点、中英切换、城市/分类/关键字、Google/高德、单选详请、想去清单（localStorage）、`?selected=ID,ID` 分享回显、`Share place` 分享单点、`My list` 的 `Send list to SocialMate` / `Copy list`。
- 清单回发：**用户 2026-11-01 决定不需要**（不想知道朋友选了什么），不纳入验收；代码与 `?selected=` 能力保留未删。
- 运行时零私有 API；SW 只缓存上述静态资源，不缓存任何接口。

## 内容检索层

- 语料：V1.4 正式主稿（51 个软件条目）、海南 115 地点 `places.json`、`asr-bridge/content/personal-stories.json`（仅 `confirmed:true`，当前为空）。
- 实现：`asr-bridge/src/content/`；中英文混合分词 + BM25；精确标题优先；按主导领域收敛建议。
- 接口：`GET/POST /suggest`；WS `{"type":"suggest"}` → `type:"suggestions"`；CLI `npm run suggest -- "<topic>"`。
- 建议：question 为英文模板，share 逐字引用来源；返回 `source/ref/title/basis`；不调用大模型，不读取 `temp/intros-*`。
- 真机：Note 11 0.3.1 已验证从 V1.4 返回 P002 建议（截图 `android-poc/artifacts/dualmic-20261031/suggest-0.3.1-note11.png`）。
