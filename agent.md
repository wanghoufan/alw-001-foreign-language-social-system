# ALW-001 踩坑记录

更新：2026-11-01

## 构建

- Gradle 8.9 从 `services.gradle.org` 会 307 到 GitHub，直连可能长时间 0 字节；用本机代理把 ZIP 下到 `~/.gradle/alw001-bootstrap` 再跑 `build-apk.sh`。
- 终端默认不继承 JDK/SDK；构建前显式 `export JAVA_HOME=.../Contents/Home` 与 `ANDROID_HOME=...`。
- 本机可用 JDK：`/opt/homebrew/opt/openjdk@17`；SDK：`~/Library/Android/sdk`。
- 版本号以 `aapt2 dump badging` 为准，不要凭记忆或 README。
- `socialmate-v1.2/index.html` 是 `build-v12.py` 的产物：**不要只改 index.html**，否则下次重建就丢（曾把 `/v12/history` 入口手改丢掉）。新增服务态入口要写进 `build-v12.py` 的替换规则，改完跑一次重建并 diff 确认只有预期差异。

## MIUI / 真机

- `adb install` 报 `INSTALL_FAILED_USER_RESTRICTED` 不等于 APK 坏；Note 12T 需用户开「通过 USB 安装」，Note 11 可用 `pm install-create/write/commit` 安装。
- MIUI 12.5 上 `pm grant RECORD_AUDIO` 后仍可能弹自己的「仅在使用中允许」；用 `uiautomator` 找 bounds 再 tap。
- `am start` 非 exported 的 `AsrActivity` 会被 `SecurityException`；从 MainActivity 按钮进入。
- `uiautomator` bounds 是设备像素，截图是缩放图；点击坐标必须用 dump 的 bounds，不能按截图目测。
- Android 15 / target 35 强制 edge-to-edge；ScrollView 要加 WindowInsets listener，否则标题压状态栏。
- 不要用 `adb logcat -d`；流式写文件后 grep。
- Note 11 的 MIUI 会拦截 `adb shell input text`/字母 keyevent（按钮点击、`input tap` 正常）；真机验证建议用界面自带按钮（如「填入示例话题」），不要依赖模拟键盘输入。

## 音频 / 设备

- BOYA mini USB 声明 2 声道，但当前输出 dual-mono；L/R 只差 1–6 LSB。不要只看 `getChannelCount()==2` 就判分轨。
- 优先 `UNPROCESSED`；`MIC` 源的 AGC/NS 会掩盖左右差异。
- BOYA 在 `dumpsys audio` 里枚举为 `USB_DEVICE`、路由也能核对，但 A/B 采集可能仍是 `-180 dBFS` 数字静音；先查发射器是否开机/配对/未静音，不要先改音频代码。
- 采集削波说明接收器增益高；先降增益再评判。

## 密钥填写

- 向用户索取 API Key/密钥时：① 提供核实可用的官方直达链接；② 配置文档除密钥外全部预填，密钥字段放在最底部并加醒目分隔；③ 自动打开文档给用户填写。规则真源见 `~/.agents/AGENTS.md` 第三节。

## ASR / 运行时

- 终端默认 PATH 没有 node；先 `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`，否则 `node`/`npm` 都是 command not found；脚本已内置 nvm 回退。
- 8791 能返回 `/api/ai/health` 不代表是 V0.4.0 组合服务：旧独立 `server.mjs` 也会 200。必须查 `/api/asr/status` 的 `combined:true`，并用 `service-v040.sh ensure` 核验进程 cwd/命令后再替换。
- `asr-bridge` 无密钥自动 MOCK；`.env` 只填部分密钥会启动报错，不会静默降级。
- 腾讯云说话人分离必须传 `speaker_diarization=1`，否则引擎连接成功但不出文本。
- V2 说话人分离返回 `sentences.sentence_list`（不是扁平 `sentences.sentence`）；只认扁平结构会“连接成功、0 文本”。
- 用同一人的两段录音拼接测不出说话人分离，只会都判 `spk_0`；需要两个不同真人或真人 + 明显不同的 TTS 声。
- TTS 网页自身可能自播介绍/示例，会被麦克风录进去并占用 `spk_N`；真实环境可用，但核对 ID 时要识别这类无关音频。
- `spk_N` 是聚类编号，会随背景声源漂移；UI 固定显示“说话人待确认”，不要把 ID 映射成真实身份。
- 真实 ASR 复测必须走 `scripts/asr-test-run.mjs`（未设 `ASR_TEST_APPROVED=1` 拒绝，单次按时长硬截断并写台账）。
- 真实 ASR 发音频前必须等 `session.status=ready`，再按约 20ms/块发送；一次性 `send` 后立刻 `end` 只会收到 session 事件，没有 final。
- 真机探针的 real 模式必须送真实语音 PCM；440Hz 测试音只适合 mock 的能量分段，真实云端不会出 final。
- `service-v040.sh` 的 `lsof` cwd 会把中文路径转义成 `\xNN`，比较前要解码；`cwd == 仓库根` 也必须算本项目。
- `NODE_TLS_REJECT_UNAUTHORIZED=0` 来自 CodeArts agent-kernel 注入的工具 shell，不在 zsh 配置、launchd 或项目 `.env`；`service-v040.sh` 启动前会 `unset`，`live-server.mjs` 仍拒绝 env 文件里的 `=0`。不要改用 `-k` 或重新导出该变量绕过。
- 腾讯云 ASR 预算闸在 `asr-budget.js`：默认 1 元、按 1 元/小时估算、剩余 ≤0.01 元拒绝新会话；账本 `android-poc/.local/asr-budget.json`，`/api/asr/status` 和 `/health` 的 `budget` 可查。

## 验收 / 证据

- 2026-11-01 · 截图交付 · Preview 打开是空白：CDP `captureScreenshot` 同时用 `clip` 与 `captureBeyondViewport`，元素被滚出视口时会截到纯色区域，而命令仍返回 0 · 原因是只校验"命令成功"，没校验"图里有内容"，把成功当结果 · 交付前跑非白像素占比（<0.05 判空图），或先 `Emulation.setDeviceMetricsOverride` 拉高视口再整屏截；发出去之前自己 `open -a Preview` 看一眼。
- 2026-11-01 · 系统浏览器验收 · 点完拿不到证据：小米自带浏览器点 `☆ Want to go` 后页面跳走，`uiautomator dump` 只剩首页元素 · 原因是第三方浏览器没有 CDP，点击后的状态无法回读 · 行为类交互改用可控 Chrome + CDP 验，真机自带浏览器只验"能打开、能显示、计数对不对"，取不到证据就如实标未验证，别硬猜。
- 2026-11-01 · 手机验收 · 前台是微信：需要点按的验证会抢用户焦点 · 原因是手机同时是用户日常设备 · 先看 `mCurrentFocus`，装包/改配置不打扰前台，必须点按的验收等设备空闲或交用户；不要为赶进度接管屏幕。
- 2026-11-01 · 真机链路 · curl 访问 tailnet 返回 `000`：服务在跑、`serve status` 正常，却连不上自建 HTTPS 域名 · 原因工具 shell 带 `ALL_PROXY`/`HTTPS_PROXY=http://127.0.0.1:7897`，curl 把 `*.ts.net` 也送进 CONNECT 隧道，代理解析不了尾网域名 · curl 加 `--noproxy '*'`，脚本里设 `NO_PROXY=*.ts.net,100.64.0.0/10`；先验本机通路再怀疑手机或服务。
- 2026-11-01 · WebView CDP · 多个 `webview_devtools_remote_*` 并存、逐个连有的一直无响应：`/proc/net/unix` 会残留已退出进程的 socket 文件 · 原因是 socket 文件存在不等于进程存活 · 对每个 socket 建不同端口 forward，用 `/json/version` 的 `Android-Package` 认领属于目标 App 的那个；不要取 `tail -1` 或“第一个”。

## 代码 / 数据

- 2026-11-01 · 归档索引 · 新测试全红：`getSession` 用 `file.includes(sessionId)` 从文件名反推 ID，fixture 文件名不含 ID 就永远查不到 · 原因把真实目录的命名巧合当成了契约 · 索引一律以数据字段（JSON 内 `sessionId`）为准，文件名只用于展示和排序。
- 2026-11-01 · 同源接入 · 手机上页面取不到数据：历史页在 8781、私有 UI 在 8791，跨端口 fetch 会被 CSP/CORS 拦 · 原因端口不同就是不同源 · 在同源服务里加只读反向代理（`/v12/api/archive/*` → 8781，仅 GET、令牌透传、下游未起返回 503），前端只认相对路径。

## 交接 / 需求

- 2026-11-01 · 需求争议 · 用户问"我说了要这个功能么"：当场答不出出处 · 原因接手时只读了摘要，没给每条需求建"文件:行"索引 · 争议时先 grep 计划原文并贴出行号，不靠记忆作答；实现前把需求出处记进交接文档或计划旁注。`建议进用户级`
- 2026-11-01 · 交接文档 · HANDOFF 涨到 10KB 且 §1 与 §5 重复：同一批事件在"当前进展"和"三日流水"各写一遍 · 原因没区分"状态"与"流水"，构建/端口/版本等事实堆在正文 · §1 只写当前状态、§5 只写事件，事实进 `docs/architecture-facts.md`，保持 ≤100 行 / ≤8KB。`建议进用户级`

## 端口 / 清理

- 8787 被 Docker `keep-fitness` 占用；`lsof -ti tcp:8787` 会同时返回 `com.docker` 和 `node`，kill 前先看 `COMMAND`（曾误杀 Docker 代理）。
- ASR 桥接用 8790；收尾先停 node、移除 `adb reverse`、删手机上的临时 APK/XML。
- Note 11 单 USB-C：插 BOYA 就失去 USB 数据；需无线 ADB 或扩展坞。无线 `adb reverse` 建在当前 transport 上，重连后可能需重建。
- WebView CDP 的 socket 名带应用 PID；重启 App 后必须重新 `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`。
- DeepSeek 记账按 usage × 官方高峰价；ledger 在 `.local/ai-budget.json`，改预算/清账本属于用户授权范围，不能自行放宽。
- 用 `ASR_FORCE_MOCK=1` 重启后，下一次切回真实前要确认该环境变量没有残留，`/health.mode` 必须是 `tencent`。
- 误杀 Docker 后 `open -a Docker` 可恢复；容器会自动重启，数据未动。

## 会后复盘 / 档案写入

- 复盘要读归档原文，所以 `/v12/api/review` 必须带 `x-archive-token`；令牌由归档服务校验，ai-gateway 不存令牌、不写日志。
- 测写入路径时用 `SM_PROFILE_DIR=/tmp/xxx` 重启服务，别把测试候选写进正式 `SocialMate-Data/Profile`；测完重启回默认目录并用 `/api/profile` 确认仍是 `null`。
- ASR 会重复定稿同一句，复盘候选容易出现近似重复（只差一个词）；去重按归一化子串 + 词集 Jaccard ≥ 0.8，保留更完整的一条。
- 说话人只有聚类编号：任何候选 `attribution` 都只能是 `unknown`，让用户在界面上选「关于我 / 人物 / 不保存」。

## 深色模式 / 配色

- 这个 App 的布局是固定浅色（`0xFFF5F7F8` / `0xFFFFFFFF` 写死），所以**不能**让主题继承深色 `Theme.Material`：`values-night` 里必须保持 Light，否则 TextView 默认文字变白，白字白底等于看不见（0.5.3 及更早版本在深色模式下就是这种情况）。
- 新增控件不要依赖主题默认文字色，`text()` 已统一 `setTextColor(0xFF1C293A)`；CheckBox / Spinner / EditText 需要单独补色（Spinner 要自定义 `getView` 与 `getDropDownView`）。
