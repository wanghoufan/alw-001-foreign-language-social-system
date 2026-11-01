# ALW-001 踩坑记录

更新：2026-10-31

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
- 采集削波说明接收器增益高；先降增益再评判。

## 密钥填写

- 向用户索取 API Key/密钥时：① 提供核实可用的官方直达链接；② 配置文档除密钥外全部预填，密钥字段放在最底部并加醒目分隔；③ 自动打开文档给用户填写。规则真源见 `~/.agents/AGENTS.md` 第三节。

## ASR / 运行时

- 终端默认 PATH 没有 node；先 `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`，否则 `npm` 直接 command not found。
- `asr-bridge` 无密钥自动 MOCK；`.env` 只填部分密钥会启动报错，不会静默降级。
- 腾讯云说话人分离必须传 `speaker_diarization=1`，否则引擎连接成功但不出文本。
- V2 说话人分离返回 `sentences.sentence_list`（不是扁平 `sentences.sentence`）；只认扁平结构会“连接成功、0 文本”。
- 用同一人的两段录音拼接测不出说话人分离，只会都判 `spk_0`；需要两个不同真人。
- 真实 ASR 复测必须走 `scripts/asr-test-run.mjs`（未设 `ASR_TEST_APPROVED=1` 拒绝，单次按时长硬截断并写台账）。

## 端口 / 清理

- 8787 被 Docker `keep-fitness` 占用；`lsof -ti tcp:8787` 会同时返回 `com.docker` 和 `node`，kill 前先看 `COMMAND`（曾误杀 Docker 代理）。
- ASR 桥接用 8790；收尾先停 node、移除 `adb reverse`、删手机上的临时 APK/XML。
- 误杀 Docker 后 `open -a Docker` 可恢复；容器会自动重启，数据未动。
