# ALW-001 架构与构建事实

更新：2026-11-06

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
- 当前版本：**0.9.2（versionCode 70）**，Debug 签名（`DEBUGGABLE`，不可对外分发）；回滚包 `release/SocialMate-0.9.1-vc69-debug.apk`。0.9.2 APK `release/SocialMate-0.9.2-vc70-debug.apk`（约 55MB，含 211 张离线 webp），SHA-256 `5cfb736c6ca4d9ea6cff5df421a1e328bc341ae60c7d1e51f62fa19d2811c997`；签名证书 SHA-256 `8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`（覆盖安装必须一致）。
- 朗读（N05）：`TtsPlaybackController` 统一调度；provider 默认 `system`（本机 TTS，`system_fallback` 默认开），可选 `fake`（预置占位音）/`remote`（Mac 服务）；`remote` 下服务商 `fake`/`aws-polly-fake`/`aws-polly`。`aws-polly` 未配置直接 `TTS_PROVIDER_NOT_CONFIGURED`，同意为**本次运行一次**。
- 新建想法：服务端 `MAX_RAW_INPUT=20000` 字符；`segmentRawInput` 每段句数可由客户端 `maxSentencesPerBlock` 指定（服务端允许 1–8，默认 4），单段 ≤600 字；前端选择存 `localStorage.sm_seg_gran`。
- 网络策略（0.5.2）：`usesCleartextTraffic=false` + `res/xml/network_security_config.xml`，明文只放行 `127.0.0.1`/`localhost`/`::1`；非回环明文在 WebView 报 `ERR_CLEARTEXT_NOT_PERMITTED`。未覆写 `onReceivedSslError`，坏证书走系统默认拒绝。
- `AsrActivity` 录音后同 Activity 显示私有 WebView `/v12?live=1`；debug 构建启用 `WebContentsDebuggingEnabled`，用于 Mac CDP 验收。
- **V1.7 本机 origin（0.9.2）**：`AsrActivity.onCreate` 先启动 `LocalServer`（绑定 `127.0.0.1` 随机端口），页面 URL 为 `http://127.0.0.1:<port>/v12`；首次加载不等 LAN 探测，探测只在后台更新 ASR/归档地址。`ui_mode=mac` 可回旧 Mac 页面。
- **V1.7 本地真源**：`LocalStore`（SQLite `socialmate_local.db`，schema 1）存人物/事实/收藏/卡片与媒体/私有地点/地点记录/练习/偏好/档案；媒体文件在 `files/local-media/<cardId>/`。
- **V1.7 构建**：`app/build.gradle` 的 `copyWebAssets` 把 `socialmate-v1.2/index.html`、`ai-gateway/profile-sync.js`、`source/places-115.json` 复制到 APK assets，不维护第二份 HTML。
- **V1.7 迁移**：`node scripts/v17-export-migration-backup.mjs` → 手机 `files/migration/backup.json` 一次性导入；详见 `docs/plan/ALW001-N05-V1.7-R2/IMPLEMENTATION-NOTES.md`。

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
- 新建人物（用户 2026-11-01 选择 A2 开放）：页面上选「＋ 新建人物主档…」并填姓名 + 英文目录标识，请求带 `createPerson:true`；服务端先按 `_template/00-profile.md` 建目录（0700）与主档（0600，只写 `name`），**且只在该人物确实分到事实时才建**，否则不留空档案；回滚时删除本轮新建且仍为空的主档。标识必须 `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`，姓名做 front matter 注入清洗。
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

## N03（SDD V1.1，2026-11-01）

- Android：**0.6.0（versionCode 15）**，APK `android-poc/app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `972eed42d9fe1722e9f47d63f0bd69a073878747560eb2392e3dae42d24861b1`；交付副本 `release/SocialMate-0.6.0-vc15-debug.apk`（`/release/` 与 `*.apk` 已 gitignore）。
- 图标/启动：`res/mipmap-anydpi-v26/ic_launcher(.round)` + `drawable/ic_socialmate_foreground|monochrome` + `values/colors.xml`；Android 12+ 启动用 `values-v31`、`values-night-v31` 的 `windowSplashScreenBackground/AnimatedIcon`，**无** `core-splashscreen` 依赖、无独立 Splash Activity、无 sleep。
- 私有 API 新增（均需 `x-archive-token`）：`GET /v12/api/people/<slug>`（详情/来源/人工段落）、`GET /v12/api/people/slug-suggest`、`POST /v12/api/people`（`confirm:true`）、`GET /v12/api/people/<slug>/prep`、`POST …/facts/revoke`、`GET/POST/DELETE /v12/api/favorites`、`GET /api/archive/sessions?q=&person=&from=&to=&limit=&cursor=`（`/v12` 同源反代）。
- 归档状态机：`SessionArchive` 退避 3/10/30/60s（≤6 次、单飞、`NetworkCallback` 触发），四态文案「手机已保存 / 待上传 N 条 / 已同步 Mac / 失败可重试」，仅 2xx 算已同步。
- WebView 导出：`SocialMateAndroid.saveText(name,text)` 仅在 `isPrivatePanelUrl` 同源页面注入，桥内再校验 `trustedPageUrl`；落盘走 `ACTION_CREATE_DOCUMENT`，清单无 `WRITE_EXTERNAL_STORAGE`。
- 手机端布局：≤930px 时 `#coachresults` 由 `layoutCoach()` 搬进 `#coachinline`（字幕与输入框之间），`chatsetup` 折叠为一行；紧凑覆盖样式在 `<style id="n03-mobile-compact">`。
- 服务：组合 8790+8791、归档 8781 未变；预算账本未重置（ASR 0.129189、DeepSeek 0.213634 / 各 1 元）。

## N03b / N04（2026-11-02）

- **单 Activity + WebView**：`AsrActivity` 承载网页；原生返回键顺序为「录音面板 → 网页弹层/抽屉 → 退回首页 Tab → finish」，只在私有页内 `goBack`（防止回退到 `about:blank` 白屏）。
- **多语言**：网页 `I18N` 词表（zh/en 各 306 key）+ `t(k)` + `applyLang(pref)`，偏好存 `localStorage['alw-preview-v1'].lang ∈ {zh,en,system}`；原生面板用 `reg(tv,zh,en)` 注册后由 `setLanguage()` 即时切换。历史页独立一套 149 key，读同一字段。
- **海南配图**：`GET /v12/img/<city_folder>/<id3>/01.webp`，白名单正则 + 根目录前缀校验；缺图走渐变占位。地点卡语言状态 `SAV.placeLang`（默认）+ `SAV.placeLangMap[id]`（单卡覆盖）。
- **演示命名空间**：`SocialMate-Data/Demo/{People,Conversations,Backups,state.json}`，`demo-store.mjs` 每次读写前 `assertIsolated()`；演示会话落 `~/Documents/SocialMate/Demo/Conversations/`，真实归档目录不受影响。
- **构建**：`python3 socialmate-v1.2/build-v12.py` 生成 `index.html`（读 `source/places-115.json`，产出 apps 51 / steps 204 / places 115 / stories 5）。

## V1.3（2026-11-02）

- **原文溯源**：`demo-store.mjs` 只存 `REPLAY_REFS`（sessionId/segmentIndex），`textOriginal` 从 fixture 唯一源读取；候选事实三字段 `candidateFact`/`sourceExactText`/`evidenceId`。
- **设备配对与令牌**：`pairing.mjs` 一次性码 → 设备密钥 → ≤24h HMAC 短期令牌（`v1.*`）；Android 侧 `DevicePairing`/`SecureStore`（Keystore AES-GCM）；无配对 fail closed；`BuildConfig.ARCHIVE_TOKEN` 已删。
- **写闸**：`demo-write-guard.mjs` 一次性写票（TTL 120s）+ 同源校验，仅写演示命名空间。
- **实时链路**：`live-facts.mjs` 内存候选（只落无原文元数据索引），final 先入候选再经 SSE 推 `pendingId`；确认/撤回串行化。

## V1.3 T5（2026-11-02 18:15–18:35）

- **当前版本**：Android `0.8.1` / `versionCode 36`；APK SHA-256 `9971836f0d1cd34afceaf3063f3d8d3cba652faf1f7d3e753dc0d0f03e042296`（176434 B）。
- **可重复构建**：`JAVA_HOME=/opt/homebrew/opt/openjdk@17`、`ANDROID_SDK_ROOT=~/Library/Android/sdk`、`~/.gradle/alw001-bootstrap/gradle-8.9`，`clean :app:assembleDebug` 两次 → APK 与 `classes.dex` 字节一致（AGP 产物已去时间戳）。
- **签名**：v2 scheme，`CN=Android Debug`，证书 SHA-256 `8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`；`install -r` 保留数据（`firstInstallTime` 不变）。
- **写授权票语义**：服务端 `demo-write-guard.mjs` 的票**单次有效**（120s TTL + nonce 去重）。客户端必须每次写重新取票；切不可缓存复用（会把第二次写打成 403）。
- **演示专属问题**：`buildDemoPrep()` 先按 `origin==="conversation"` 优先、再按 `source.date` 倒序，问句模板用 `textEn || text` 匹配；否则种入的「来自XX / 职业」会占满两条专属问题。
- **真机归档地址**：本机模式 `http://127.0.0.1:8781/api/archive/session`（仅回环，经 adb reverse）；外出模式 `https://mac-mini.tail4e4317.ts.net/alw/api/archive/session`（经 Tailscale Serve）。
- **App 内证据位置**：`files/archive/state.json`（状态机快照）、`files/archive/outbox|exported`（含 `.ack.json`）、`files/offline/snapshot.json`（离线只读缓存）。
- **T5 证据目录**：`docs/plan/ALW001-N04-V1.3-Real-Use-Closure/qa/20261102-t5/`（INDEX.md 有逐文件说明）。

## N05 V1.1（2026-11-02）

- **版本**：Android `0.8.2` / `versionCode 37`，S4 安装包 SHA-256 前缀 `a3d0085e…`；`install -r` 保留数据。git HEAD 仍 `fc2379c`，工作树未提交。
- **构建环境**：Node 22.22.2 / JDK 17 / Android SDK 35 / Gradle 8.9，四端口（8790/8791/8781/8782）4/4 可用；APK 预构建 `clean` exit 0。
- **后端新增模块**（`socialmate-prototype/ai-gateway/`）：`manual-facts.mjs`（补记）、`place-notes.mjs`（地点活档案）、`study-blocks.mjs`（分段听读）、`practice-reports.mjs`（GPT Prompt + 复盘回贴）；`server.mjs` +319 行挂载，`verify-n05-backend.mjs` 22/22 exit 0（AI 用假 fetch 探针，真实 DeepSeek 调用 0 次）。
- **原生 TTS**：`TtsController.java` + `TtsSelfTestActivity.java`；`AndroidManifest.xml` 增加 `<queries>` 声明 `TTS_SERVICE` 与 `RecognitionService`（否则 Android 11+ `getVoices()` 为空）；中文 zh-Hans 与英文 en 分属不同 voice。
- **前端**：`socialmate-v1.2/source/V1.1-baseline.html` 接入补记 / 地点活档案 / 分段听读 / GPT Prompt 与复盘回贴，`index.html` 由 `build-v12.py` 生成；`verify-n05-ui.mjs` 仅 ① 补记 PASS。
- **不变量**：`source/places-115.json`（`0412673d…`）、`public-share.*`、`sw.js` 全程未变；真实 `SocialMate-Data/People` 41 文件（`78482d07…`）未动。
- **证据**：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261102-s0|s1s3|s4|s5ui`。

## N05 V1.2（2026-11-03）

- **版本**：Android `0.8.12` / `versionCode 47`；APK SHA-256 `edbec3b9190357c9ac05aad0c6fd14d0318b53883188313e0c960fceba7749f7`（447455 B）。git HEAD 仍 `fc2379c`，工作树未提交。
- **学习资料归档**：`SocialMate-Data/LearningArchive/`（index.json/index.jsonl、processed、quarantine、runs、inbox）；服务端 `/v12/api/learning-archive/{status,scan,ingest,materials}`；worker `learning-archive-worker.mjs`，`service-all.sh` 以 `LEARNING_ARCHIVE_INTERVAL=300` 受控轮询；默认全部 `local_only/awaiting_consent`。
- **私有地点**（`socialmate-prototype/ai-gateway/private-places.mjs`）：命名空间 `pv-<slug>`，落盘 `SocialMate-Data/PrivatePlaces/<id>/place.json`；新建需 `confirm:true`，同 id 幂等；**不写入** `places-115.json`（该文件 SHA 全程 `0412673d…`），前端仅在原生桥存在时按 id 合并进列表。
- **私有路由**：`place-notes.mjs` / `server.mjs` 对 `pv-*` 放行并复用同一套鉴权与 400/404 语义；`assertPlaceId()` 仍限 1–115（公开地点），私有走独立模块，不放松公开校验。
- **AI 分段**（`ai-segment.mjs`）：模型**只返回句子分组**，服务端 `raw.slice(span)` 确定性切块；兼容 `[start,end]` / `{start,end}` / 0 或 1 基；降级原因 `AI_NOT_CONSENTED` / `AI_HTTP_ERROR` / `AI_BAD_GROUPS`。AI 必须由用户显式勾选，费用走 DeepSeek 账本（1 元闸）。
- **分段契约**：`MAX_RAW_INPUT=20000`（超限 413 `RAW_INPUT_TOO_LARGE`）、`MAX_BLOCK_CHARS=600`、每块句数 1–8（UI 档位 2/3/4/6）；`validateProvidedBlocks` 要求 `raw.slice(span)===sourceText`、`cnSentences.join('')===sourceText`。
- **红城湖实测记录**：`placeId=pv-hongcheng-lake-park`、`recordId=rec-20261103072022-16b79c`、**19 段 / 英 A/B 38 条 / rawChars 1148**；原文 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/content/20261103-红城湖公园-实测文稿.md`（517 行）。
- **TTS 桌面态**：provider 顺序 `fake → system-fallback → remote → aws-polly`；`aws-polly` 未配置 `configured=false`（501），`aws-polly-fake` 供验收；同意为会话级 `consentSessionGranted`。
- **证据**：`docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/qa/20261103-t0/`（`00-build.txt`、`01-places-sha.txt`、`02-device-0810.png`、`04-hongcheng-19blocks.png`、`README-T2T3.md`、`README-T4T5.md`）。

## N05 V1.3（2026-11-03）

- **学习页播放布局**：第一行「听本段 / 循环 ×N」、第二行「听词组」、第三行「听中文 / 听英文 A/B」；整段与词组共走一条混合队列。
- **轮次与时长**（真机 `0.8.13`/48）：15 项/轮；3 轮 45 项 164 秒、20 轮 300 项 1115.6 秒，0 失败 0 跳过。
- **词组结构**：19 段 102 条 `phrasePairs`（可播 99 / 待确认 100 / 不可播 3）；rev3 只清两处，原文 hash 不变。

## N05 V1.4（2026-11-04）

- **版本**：Android `0.8.14` / `versionCode 49`；APK SHA-256 前缀 `caf5930f…`；git HEAD `fc2379c`，工作树未提交。
- **前台朗读服务**（`TtsPlaybackService.java`）：`foregroundServiceType=mediaPlayback` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`、`PARTIAL_WAKE_LOCK`、AudioFocus、`ACTION_AUDIO_BECOMING_NOISY`；通知只写「正在朗读 / 第 x/y 轮 · 第 i/N 项」，队列完成即 `stopForeground` + `stopSelf`。
- **队列执行器**（`TtsQueueRunner.java`）：间隙/轮次/重试/看门狗原生化；每项事件写入 `files/tts-queue-timeline.jsonl`（logcat 在 Doze 下会丢事件，取证以该文件为准）；`lastOutcome=finished|stopped|failed` 供 `queue_state` 回灌。
- **桥接契约**：`startQueue` / `queueControl` / `queueState`；网页只下发播放计划、不再自推队列。朗读按钮属性是 `data-tts-lang`（`data-lang` 已属界面语言开关，勿复用）。
- **Mac 归档守护**（项目外文件）：`~/Library/LaunchAgents/com.alw.learning-archive-watch.plist`，`RunAtLoad`+`KeepAlive`+`ThrottleInterval 30`，常驻 `learning-archive-worker.mjs --watch --interval 1800`（2026-11-04 由 300 调松），日志 `.local/learning-archive/watch.{out,err}.log`；健康 `--health --json` 的 `state/lastScan/intervalSeconds/runningPid`。
- **索引语义**：总数 85 ＝ 真实 84 ＋ QA fixture 1（`test:true` / `sourceTag:"qa_fixture"`），`--status` 报 `realTotal=84 / testFixtures=1`；构成 conversation 3 / thought 43 / practice_review 38 / self_test 1（fixture） / course 0，全部 `awaiting_consent`。
## N05 V1.4 T3 · Tailscale 外出（2026-11-04）

- **版本**：Android `0.8.15` / `versionCode 50`；APK SHA-256 `21f6857695bbc5fa27a08add27b48d8d0cc133b1819644aecd6df4486a00aca9`；HEAD `fc2379c`，工作树未提交。
- **手机 Tailscale 已登录**：Note 12T Pro `100.94.116.99`、Note 12 Pro `100.91.121.33`；Serve 三端口仍为 443 `/alw`→8781、8443→8791、10000→8790。
- **断 WiFi 实测**：Note 12T Pro Wi-Fi 关、`Transports: CELLULAR|VPN`、VPN 底层 `MOBILE[NR]`、`ping mac-mini` 0% 丢包；`https://…:8443/v12?live=1` 真实加载，`/api/asr/live` SSE `ready`，页面显示「字幕已接入」；经 Tailnet 无线 ADB 安装 APK 成功。
- **修复（BLOCKER）**：页面 `connectLiveASR()` / `requestRealAI()` 原先只认 `http://127.0.0.1:8791`，外出 https 下字幕与 AI 永不连接；改为复用 `HTTP_UI` 协议判断（不绑 host）。`AsrActivity.injectAccessToken` 由「仅首次写入」改为无条件覆盖，重配对后不会再拿旧令牌 401。
- **未验**：蜂窝下原生录音未重新开麦（已有 Wi-Fi Tailscale `activeSessions=1` 与蜂窝页面/SSE 双证）；归档写入因设备未配对返回 401，需先配对；ASR 端点无握手鉴权、`AsrClient` 无重连（见 `qa/20261104-t3/code-audit.md`）。

## N05 V1.5 · 聊天页 UX（2026-11-04）

- **版本**：Android `0.8.29` / vc64；APK SHA-256 `cb07a89e…`。
- **布局**：单栏；顶部对象/录音/连接/停止；字幕最近 3 句、固定 156px，历史 `details` 44vh；建议四方向；资料横条四类。
- **建议数据**：`suggestionsNow()` 返回 `respond/ask/share/switch` 四组，每组 2–3 条；AI 结果只做第一条，模板补足候选，不再 `slice(0,1)`。
- **阅读冻结**：`S.suggFreeze` 由建议区 pointerdown/wheel 置位；新 final 只更新字幕并显示 `#suggNewBadge`，点击才重建。
- **诊断**：聊天首页不显示端口/模型/配对；设置内「高级诊断」显示连接方式、P066 流式、端口与账本归属。
- **证据**：`docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`、`qa-v15-120.png`。

## P066 流式 ASR / V1.5 聊天页（2026-11-04）

- **ALW 上游**：`ASR_UPSTREAM=p066`，`P066_ASR_URL=ws://127.0.0.1:8078/api/asr/stream`；令牌只放 `x-asr-token`，不入 URL/日志。
- **P066 修复**：`translate()` 以 `sentence_type=1` 判 final；`end` 等待 2500ms；签名补 `speaker_diarization`。单段 final 1、多段 final 2；流式 401/403 PASS。
- **计费**：P066 3 元/月；ALW 本地腾讯账本在 p066 模式停扣。已用 0.057567，剩余 2.942433。
- **V1.5**：`suggestionsNow()` 四组（respond/ask/share/switch），每组 2–3 条；`S.suggFreeze` 冻结建议；字幕最近 3 句 + 44vh 历史；设置内高级诊断。
- **证据**：`docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`、`qa/20261104-p066/REPORT.md`。
## N05 V1.5.1 真实交流收口（2026-11-04）

- **版本**：Android `0.8.30` / `versionCode 65`；APK SHA-256 `794e68a8…`；HEAD `fc2379c`，工作树未提交。
- **ASR 握手鉴权**：`server.js` 在 upgrade 阶段校验 `x-asr-token`（兼容 Bearer）、Origin（loopback/RFC1918/`*.ts.net`，且 host 与请求 Host 一致）、每 IP 20 次/60s 与并发 8；拒绝发生在 `handleUpgrade` 之前，P066 上游不建立。`/health` 暴露 `authRequired/authMode`。组合服务由 `live-server.mjs` 注入 `pairing.verifyToken`；standalone 真实模式默认 fail-closed，开发可显式 `ASR_WS_AUTH=off`。
- **归档 401**：`SessionArchive` 新增 `TokenRefresher`；仅 401 刷新一次+重试一次，403 fail-closed；`state.json` 记录 201/待传数。
- **原生重连**：`AsrClient` 20s ping/pong；`AsrActivity` 每 track 单飞重连（1s/2s/4s×3），失败停录；页面 `smNativeLinkState` 只显示“连接中断 · 重连中 / 已恢复”。真机实测：服务进程被杀→看门狗拉起→客户端自动重连、字幕继续；阻断 8790/8791 时 3s 显示重连中、13s 停录为“已结束 · 可复盘”。原生面板直接开录会在页面补建本轮会话。
- **页面密度**：新增 `v151-realuse` 样式（`<style id="v151-realuse">`）：候选事实一行计数、建议区 `23vh` 独立滚动、结束/放弃 sticky；392×791 下建议 `top 433`、资料面板 `top 685`、整页高 1277。
- **接话质量**：`SM_COACH_PLANS` 10 话题（weather/arrival/running/coffee/hainan/software/travel/weekend/music/other），`suggestionsNow()` 跨方向去重、switch 随话题；素材 `docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/t3-quality/`。
- **TTS 调试入口**：release 清单 `exported=false`，debug 单独放开；`remote_base` 白名单校验在 Activity 与 Controller 双处。
- **证据**：`docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md`。
## N05 V1.5.2 聊天页压缩（2026-11-05）

- **版本**：Android `0.8.31` / `versionCode 66`；APK SHA-256 `b8fa8b24…`。
- **样式块**：`<style id="v152-compact">`（独立 `<style>`，需保留前一块的 `</style>`，否则整段 CSS 会被吞进上一块）；状态对象 `S.v152`（`immersive/view/translated/zhOpen/favs/share/origin/menu/stopSheet/shareZh/translateConsent`）。
- **全屏**：`body.sm-immersive` 隐藏 `.top/.mobilebar`；沉浸时 `.chatv15.v152` 高 `100vh`（`@supports` 才用 `100dvh`，真机 WebView 不支持 dvh）；对话区 `flex:0 0 calc((100vh - 134px)/3)`、建议区 `flex:1` 独立滚动、chips 一行。
- **建议配额**：`vsGroups()` 固定 respond 2 / ask 2 / switch 3 / share 3；`showRecs()` 仍用 `S.suggFreeze` 冻结与 `#suggNewBadge`；AI 首候选仍排 respond 第一。
- **翻译**：对话每条 `S.v152.translated`、建议每条 `S.v152.zhOpen`；点对话「翻译」调用 `POST /api/ai/translate`（DeepSeek 单句、`consent:true`、同一预算账本），首次前端确认后本会话复用；结果缓存在 `m.zh`，失败显示可重试文案。
- **分享卡**：`vsShareData()` 地点取 `special_en` 与 `en`（去重后拼接），故事取 `en`，人物无英文显式提示；`originKind` 控制「原资料」入口。
- **原资料页**：`S.v152.view='origin'`，图片路径 `/v12/img/<cityFolder>/<id3>/0<slot>.webp`；`photos` 由 `build-v12.py` 从 `places-115.json` 映射。
- **原生**：`AsrActivity.stream()` 用 `CountDownLatch` 等待 `session/ended` 最长 3s 再 `archive.end()`。
- **豆包 TTS**：provider `doubao`，适配器 `tts-adapter-doubao.mjs`；`X-Api-Key` + `X-Api-Resource-Id: seed-tts-2.0`；`/api/v3/tts/unidirectional`；账本 `TtsCache/ledger/doubao.json`（`SM_DOUBAO_BUDGET_CNY`，当前 1 元）；缓存键不含 `requestId`，命中不重复计费；前端 `speak()` 与 N05 `ttsSpeakItem` 都优先豆包、失败回退系统 TTS；音色在设置页切换，`S.v152.voiceZh/voiceEn` 持久化到 `localStorage`。
- **人物详情**：`getPersonDetail()` 返回 `profileSections`（按 `00-profile.md` 的 `# 章节` 合并 confirmed 与 manualEntries）；前端顶部「基本档案」→「见面前准备」→「会话记录」，旧 facts/manual 仅在无新字段时回退。
- **真机**：Note 11 5G 393×791；A/B/C/D/E/F 通过（TTS 回环录音）；归档 6/6、201、pending 0；继续录音 1/1；D3 档案未写；人物详情区块顺序正确。
- **证据**：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`、`qa/t10-device/`。
## N05 V1.5.2 增补 · 偏好持久化与预算（2026-11-05 下午）

- **界面偏好跨网络**：新增 `GET/POST /v12/api/prefs`（`x-archive-token` 必填，写需写票），落盘 `SocialMate-Data/Prefs/ui.json`（0600），只收 `ttsVoice`（三个可读中英音色白名单）与 `ttsEngine`（`doubao|system`）；页面加载后 200ms 拉取并回写 localStorage，设置变更即 POST。用途：局域网 `http://…:8791` 与 Tailscale `https://…:8443` 各自一套 localStorage，换网后音色重置会改变缓存键、整页重复合成。
- **豆包预算**：`SM_DOUBAO_BUDGET_CNY` 由 1 调到 10（用户 2026-11-05 同意），账本 `TtsCache/ledger/doubao.json` 未重置；剩余额度读 `GET /v12/api/tts/providers` 的 `providerBudgets.doubao`。
- **不静默回退**：`speak()` 与 N05 `ttsSpeakItem()` 在 `ttsEngine!=system` 时，遇 `TTS_BUDGET_*` / `RATE_LIMITED` / 其它豆包失败即停止并给提示，不再自动切原生 TTS；原生只用于设置里显式选「系统语音」。

## 独立应用 · apps/dialog-kit（2026-11-05）

- 纯本地中文对话教学最小项目：Node 20+、零依赖，`make test` / `make run`，默认 `127.0.0.1:4190`；运行时数据 `apps/dialog-kit/data/runtime/`（已 gitignore）。
- 四类角色（mia/maria/daniel/tutor）+ 七阶段（问候→定题→澄清→角色扮演→反馈→巩固→收束）；`POST /api/dialog/rewind` 只回退阶段、不删历史事件；不调用外部模型或网络服务。
## 缓存与弱网（2026-11-05，0.8.32/67）

- **页面/静态资源**：`server.mjs` 的 `sendTextCached` 统一处理 `/v12`、`/v12/history` 与 STATIC 白名单；响应 `Cache-Control: no-cache` + `ETag`（内容 sha256 前 16 位）+ `Vary: Accept-Encoding`，命中 `If-None-Match` 回 304；`Accept-Encoding` 含 gzip 时压缩。内存缓存按 mtime+size 失效，改文件即换 ETag。实测 596,198 → 168,999 字节。
- **接口**：`json()` 仍 `no-store`，API 不做 HTTP 缓存；离线能力由前端 localStorage 承担。
- **前端离线缓存**：地点详情 `sm.place.cache.v1.<placeId>`（`{savedAt,detail}`），`loadPlace` 先渲染缓存再后台刷新；私有地点 `sm.privatePlaces.v1`；缓存时间用 `smLocalStamp` 按本地时区显示。
- **原生地址自适应**：`AsrActivity.effectiveUiBase()` 在非 WiFi 且配置为 RFC1918 局域网地址时改用 `TRAVEL_UI_URL`；回环地址不替换（USB + adb reverse 保留）。
- **注意**：`/v12` 无版本号参数，靠 ETag 校验保证不拿旧页面；若以后改成强缓存（max-age），必须同步加 `?v=<build>` 版本穿透。
## V1.6 三大活资料库（2026-11-05，0.9.0/68）

- 模块 `ai-gateway/private-cards.mjs`；存储 `SocialMate-Data/PrivateCards/{places,stories,apps,overrides,trash,media}`，目录 0700、文件 0600、写前 `.sm-backup`、tmp+rename 原子写。
- API：`GET/POST /v12/api/cards`、`GET/PATCH/DELETE /v12/api/cards/<kind>/<id>`、`/restore`、`/media`、`/cover`、`/override`、`GET /v12/api/cards/stats`、`GET /v12/media/<cardId>/<file>`；全部需 `x-archive-token`，写操作另需 `x-sm-write` 写票。
- 并发：卡片带 `revision`，PATCH 带旧值返回 409 `REVISION_CONFLICT` 与 `currentRevision`；删除为软删（`trash/`），可恢复。
- 媒体：前端 Canvas 重绘压缩（长边 1600、JPEG 0.82，重绘即剥离 EXIF/方向），服务端校验 base64/magic/边长 ≤4096/≤6MB；`<img>` 不能带头取图，前端用带令牌 `fetch` + blob URL。
- AI：`POST /api/ai/draft-en`，`consent:true` 必填，复用 DeepSeek 账本与 `AI_BUSY` 闸，只返回草稿。
- 前端桥：卡片模块位于 N05 的 IIFE 内，页面其它脚本通过 `window.__smCards` 调用；令牌注入后由 `__smAfterToken` 补拉三类卡片。
- 原生：`AsrActivity` 注册 `WebChromeClient` 仅覆盖 `onShowFileChooser`，`onActivityResult` 用 `FileChooserParams.parseResult` 回传；不接管 alert/confirm。
