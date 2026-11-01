# ALW-001 踩坑记录

更新：2026-11-01

## 构建

- Gradle 8.9 从 `services.gradle.org` 会 307 到 GitHub，直连可能长时间 0 字节；用本机代理把 ZIP 下到 `~/.gradle/alw001-bootstrap` 再跑 `build-apk.sh`。
- 终端默认不继承 JDK/SDK；构建前显式 `export JAVA_HOME=.../Contents/Home` 与 `ANDROID_HOME=...`。
- 版本号以 `aapt2 dump badging` 为准，不要凭记忆或 README。

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

## 端口 / 清理

- 8787 被 Docker `keep-fitness` 占用；`lsof -ti tcp:8787` 会同时返回 `com.docker` 和 `node`，kill 前先看 `COMMAND`（曾误杀 Docker 代理）。
- ASR 桥接用 8790；收尾先停 node、移除 `adb reverse`、删手机上的临时 APK/XML。
- Note 11 单 USB-C：插 BOYA 就失去 USB 数据；需无线 ADB 或扩展坞。无线 `adb reverse` 建在当前 transport 上，重连后可能需重建。
- WebView CDP 的 socket 名带应用 PID；重启 App 后必须重新 `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`。
- DeepSeek 记账按 usage × 官方高峰价；ledger 在 `.local/ai-budget.json`，改预算/清账本属于用户授权范围，不能自行放宽。
- 用 `ASR_FORCE_MOCK=1` 重启后，下一次切回真实前要确认该环境变量没有残留，`/health.mode` 必须是 `tencent`。
- 误杀 Docker 后 `open -a Docker` 可恢复；容器会自动重启，数据未动。
