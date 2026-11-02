# ALW-001 踩坑记录

更新：2026-11-01（条目格式：日期 · 场景 · 现象 · 原因 · 解法；`建议进用户级` = 换项目也成立）

## 构建

- Gradle 8.9 从 `services.gradle.org` 会 307 到 GitHub，直连可能长时间 0 字节；用本机代理把 ZIP 下到 `~/.gradle/alw001-bootstrap` 再跑 `build-apk.sh`。
- 终端默认不继承 JDK/SDK；构建前 `export JAVA_HOME=~/android-toolchain/jdk-17.0.20.1+1/Contents/Home ANDROID_HOME=~/android-toolchain/sdk`。
- 版本号以 `aapt2 dump badging` 为准，不凭记忆或 README。
- 2026-11-01 · 改完看不到变化 / 改动丢失 · 只改 `index.html` 会被下次重建覆盖（曾丢 `/v12/history` 入口），只改 Web 也换不掉原生工具栏/图标/启动 · 前者写进 `build-v12.py` 后重建并 diff，后者必须重建 APK + `install -r`。

## 服务 / 同源 / 真机写入验收

- `originOK` 只认 `127.0.0.1:<port>` 时，真机经 Tailscale（`:8443`）的 POST 全 403（GET 不带 Origin 才"正常"）；同源判定用 Origin 的 host:port 比请求 Host（含 `x-forwarded-host`）。
- 复盘页有两个 `.status`（生成状态、保存状态）：`document.querySelector('.review .status')` 拿到前者，别据此判"保存没生效"。
- CDP 点击前先 `scrollIntoView` 再取 `getBoundingClientRect`；坐标过期会点到相邻按钮（曾误触发真实计费）。
- 真机验写入：用 `SM_CONVERSATION_DIR`/`SM_PROFILE_DIR`/`SM_PEOPLE_DIR` 起隔离实例 + `adb reverse`，比改 `ui_url` 安全；收尾删 reverse、清 WebView 虚构事实。
- 2026-11-01 · 归档补传验证 · 合成会话进了真实归档 · 改 `shared_prefs` 前没确认进程退出，内存旧 `archive_url` 仍生效 · 先 `force-stop` + `pidof` 确认为空再改，收尾还原令牌并核对真实目录。

## MIUI / 真机

- `INSTALL_FAILED_USER_RESTRICTED` ≠ APK 坏；Note 12T 需用户开「通过 USB 安装」，Note 11 可用 `pm install-create/write/commit`。
- MIUI 12.5 上 `pm grant RECORD_AUDIO` 后仍可能弹「仅在使用中允许」；用 `uiautomator` 找 bounds 再 tap。
- `am start` 非 exported 的 `AsrActivity` 会被 `SecurityException`；从 MainActivity 按钮进入。
- `uiautomator` bounds 是设备像素、截图是缩放图；点击坐标必须用 dump 的 bounds，不能按截图目测。
- Android 15/target 35 强制 edge-to-edge；ScrollView 加 WindowInsets listener，否则标题压状态栏。
- 不要用 `adb logcat -d`；流式写文件后 grep。
- Note 11 的 MIUI 会拦截 `adb shell input text`/字母 keyevent（`input tap` 正常）；真机验证用界面自带按钮，不依赖模拟键盘。
- 2026-11-01 · 设备锁定 · 预检报「非授权设备」 · `ADB_SERIAL` 填了型号 `21091116AC`，脚本按 serial 精确匹配 · 先 `adb devices -l` 取 mDNS 名（`adb-WGBMXWDIAIFMPFCQ-1AcFJM._adb-tls-connect._tcp`）再传。

## 音频 / 设备

- BOYA mini USB 声明 2 声道，但当前输出 dual-mono；L/R 只差 1–6 LSB。不要只看 `getChannelCount()==2` 就判分轨。
- 优先 `UNPROCESSED`；`MIC` 源的 AGC/NS 会掩盖左右差异。
- BOYA 在 `dumpsys audio` 枚举为 `USB_DEVICE`、路由可核对，但 A/B 仍可能 `-180 dBFS` 静音；先查发射器开机/配对/静音。
- 采集削波说明接收器增益高；先降增益再评判。

## 密钥填写

- 索取 API Key：给官方直达链接；文档除密钥外全预填、密钥放最底部并醒目分隔；自动打开给用户填。真源 `~/.agents/AGENTS.md` 第三节。

## ASR / 运行时

- 终端默认 PATH 没有 node；先 `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`；脚本已内置 nvm 回退。
- 8791 返回 `/api/ai/health` 不代表是组合服务（旧独立 `server.mjs` 也 200）；查 `/api/asr/status` 的 `combined:true` + `service-v040.sh ensure` 核验 cwd/命令。
- `asr-bridge` 无密钥自动 MOCK；`.env` 只填部分密钥会启动报错，不会静默降级。
- 腾讯云说话人分离必须传 `speaker_diarization=1`，否则引擎连接成功但不出文本。
- V2 说话人分离返回 `sentences.sentence_list`（非扁平 `sentences.sentence`）；只认扁平会"连接成功、0 文本"。
- 同一人两段录音拼接测不出分离，都判 `spk_0`；要两个真人或真人+明显不同的 TTS。
- TTS 网页可能自播介绍/示例，被麦克风录进去占用 `spk_N`；核对 ID 时排除这类音频。
- `spk_N` 是聚类编号，会随背景声源漂移；UI 固定「说话人待确认」，不映射成真实身份。
- 真实 ASR 复测走 `scripts/asr-test-run.mjs`（未设 `ASR_TEST_APPROVED=1` 拒绝，按时长截断并写台账）。
- 发音频前等 `session.status=ready`，按约 20ms/块发送；一次性 `send` 后立刻 `end` 只有 session 事件。
- 真机探针 real 模式必须送真实语音 PCM；440Hz 测试音只适合 mock 的能量分段。
- `service-v040.sh` 的 `lsof` cwd 会把中文路径转义成 `\xNN`，比较前解码；`cwd == 仓库根` 也算本项目。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 来自 CodeArts agent-kernel 注入的 shell，不在 zsh/launchd/`.env`；启动脚本 `unset`、`live-server.mjs` 拒绝 `=0`，不要用 `-k`。
- 腾讯云 ASR 预算闸在 `asr-budget.js`：默认 1 元、按 1 元/小时估算、剩余 ≤0.01 元拒绝新会话；账本 `android-poc/.local/asr-budget.json`。

## 代码 / 数据

- 2026-11-01 · 归档索引 · 新测试全红 · `getSession` 用文件名反推 ID，fixture 名不含 ID 就查不到 · 索引以 JSON 内 `sessionId` 为准，文件名只用于展示排序。
- 2026-11-01 · 同源接入 · 手机上取不到数据 · 历史页 8781、私有 UI 8791，跨端口即跨源 · 同源服务加只读反代（`/v12/api/archive/*`→8781，仅 GET、令牌透传、未起 503）。
- 2026-11-01 · 字幕测试假红 · 断言 `#content` 无字幕，页面其实正常 · 字幕改「只追加气泡」不整页重绘，harness 的 `#messages`/`#content` 是两个独立桩节点 · 可见性断言两处一起看。
- 2026-11-01 · 取内联主逻辑 · `hooks.click is not a function` 误报 · `matchAll(/<script…/).at(-1)` 被 `<script src=... defer>` 顶掉 · 取脚本要排除 `src=` 与 `application/json`。

## 验收 / 证据

- 2026-11-01 · 截图交付 · Preview 空白 · CDP 同时用 `clip`+`captureBeyondViewport`，元素滚出视口只截纯色、命令仍返回 0 · 交付前算非白像素占比（<0.05 判空）或先拉高视口。
- 2026-11-01 · 系统浏览器验收 · 点完拿不到证据 · 小米自带浏览器点 `☆ Want to go` 后跳走、dump 只剩首页 · 第三方浏览器无 CDP，点击后状态回读不了 · 交互类改用可控 Chrome+CDP。
- 2026-11-01 · 手机验收 · 前台是微信 · 需要点按的验证抢焦点 · 手机同时是日常设备 · 先看 `mCurrentFocus`，装包/改配置不打扰前台，必须点按的等空闲或交用户。
- 2026-11-01 · 真机链路 · curl 访问 tailnet 返回 `000` · 服务正常却连不上 · 工具 shell 的 `HTTPS_PROXY` 把 `*.ts.net` 送进 CONNECT 隧道 · curl 加 `--noproxy '*'`，脚本设 `NO_PROXY=*.ts.net,100.64.0.0/10`。
- 2026-11-01 · WebView CDP · 多个 `webview_devtools_remote_*` 并存，有的连上无响应 · `/proc/net/unix` 残留已退出进程的 socket · 每个 socket 建不同端口 forward，用 `/json/version` 的 `Android-Package` 认领，不取 `tail -1`。
- 2026-11-01 · 手机端布局 · 建议卡在首屏外（y≈917 / 视口 705）没人发现 · 只按桌面思路排 DOM，没量真机视口 · UI 验收加硬指标：关键元素 rect 在视口内 + `scrollWidth==innerWidth`，截图只作辅助。`建议进用户级`

## 交接 / 需求

- 2026-11-01 · 需求争议 · 答不出出处 · 接手只读摘要，没建"文件:行"索引 · 争议时先 grep 计划原文贴行号，实现前把出处记进交接文档。`建议进用户级`
- 2026-11-01 · 交接文档 · HANDOFF 涨到 10KB 且 §1 与 §5 重复 · 没区分"状态"与"流水" · §1 只写当前状态、§5 只写事件，事实进 `docs/architecture-facts.md`，保持 ≤100 行 / ≤8KB。`建议进用户级`

## 端口 / 清理

- 8787 被 Docker `keep-fitness` 占用；`lsof -ti tcp:8787` 同时返回 `com.docker` 与 `node`，kill 前看 `COMMAND`（曾误杀代理；误杀后 `open -a Docker` 恢复，容器自动重启）。
- ASR 桥接用 8790；收尾先停 node、移除 `adb reverse`、删手机上的临时 APK/XML。
- Note 11 单 USB-C：插 BOYA 就失去 USB 数据，需无线 ADB 或扩展坞；无线 `adb reverse` 挂在当前 transport，重连后要重建。
- WebView CDP socket 名带应用 PID；重启 App 后必须重新 `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`。
- DeepSeek 记账按 usage × 官方高峰价；ledger 在 `.local/ai-budget.json`，改预算/清账本属用户授权范围。
- 用 `ASR_FORCE_MOCK=1` 重启后，切回真实前确认该变量无残留，`/health.mode` 必须是 `tencent`。
- 2026-11-01 · 临时服务收尾 · 后台任务报 `killed: 143` · 143 即 SIGTERM，是 `lsof -ti tcp:<port> | xargs kill` 的正常退出码 · 别当失败重跑。

## 会后复盘 / 档案写入

- 复盘读原文，`/v12/api/review` 必须带 `x-archive-token`；令牌由归档服务校验，ai-gateway 不存不写日志。
- 测写入用 `SM_PROFILE_DIR=/tmp/xxx` 重启服务，别写正式 `SocialMate-Data/Profile`；测完回默认并 `/api/profile` 确认仍是 `null`。
- ASR 会重复定稿同一句；候选去重按归一化子串 + 词集 Jaccard ≥ 0.8，留更完整的一条。
- 说话人只有聚类编号：`attribution` 只能是 `unknown`，由用户选「关于我 / 人物 / 不保存」。

## 深色模式 / 配色

- 布局固定浅色（`0xFFF5F7F8`/`0xFFFFFFFF` 写死），**不能**让主题继承深色 `Theme.Material`：`values-night` 必须保持 Light，否则白字白底（0.5.3 及更早的现网问题）。
- 新控件不依赖主题默认字色，`text()` 已 `setTextColor(0xFF1C293A)`；CheckBox/Spinner/EditText 单独补色（Spinner 自定义 `getView` 与 `getDropDownView`）。
