# S0 环境矩阵（2026-11-02 21:51–21:58）

状态定义：OK=实测通过；FAIL=实测不满足；UNKNOWN=无法在不扰动用户/不产生副作用的前提下判定。

| # | 依赖项 | 实测证据 | 状态 |
|---|---|---|---|
| 1 | Node | `node -v` → v22.22.2，exit 0 | OK |
| 2 | JDK 17 | `JAVA_HOME=…/jdk-17.0.20.1+1/Contents/Home`，`java -version` → 17.0.20.1 Temurin，exit 0 | OK |
| 3 | SDK 35 | `$ANDROID_HOME/platforms/android-35` 存在；compileSdk 35 | OK |
| 4 | Gradle 8.9 | 腾讯镜像包 SHA-256 `d725d707…` = 官方 `.sha256`；`gradle --version` → 8.9 / JVM 17.0.20.1，exit 0 | OK |
| 5 | adb 设备 | `adb devices -l` → `REDACTED-SERIAL device usb:… model:21091116AC`，exit 0 | OK |
| 6 | 8790 | `service-all.sh health` → OK tencent-asr pid=13242；`/` HTTP 200 | OK |
| 7 | 8791 | health → OK private-ui+ai pid=13242；`/` HTTP 200（`/health` 404 为该服务预期路由） | OK |
| 8 | 8781 | health → OK archive pid=13282；`/health` HTTP 200 | OK |
| 9 | 8782 | health → OK demo-archive pid=13297；`/health` HTTP 200 | OK |
| 10 | SocialMate-Data 读写 | `test -w` → writable，exit 0 | OK |
| 11 | People 读写 | `test -w SocialMate-Data/People` → writable，exit 0；41 文件哈希 `78482d07…` | OK |
| 12 | PlaceNotes 目录 | `ls SocialMate-Data/PlaceNotes` → No such file or directory | UNKNOWN（S3 新建；S0 不预建） |
| 13 | places-115.json | `shasum -a 256` → `0412673d14737e85c9554c1cb9b4990bafb4d6b71082f330ced518c128a836e9` | OK |
| 14 | 公开 PWA 源 | gh-pages `index.html` = 线上 `index.html` = `d5c3bc5c…`（HTTP 200，7028 B） | OK |
| 15 | DeepSeek 账本 | `.local/ai-budget.json` 只读：spentCny 0.21363352，calls 51；上限 1 元未变 | OK |
| 16 | 腾讯 ASR 账本 | `.local/asr-budget.json` 只读：spentCny 0.210249，remainingCny 0.789751，limitCny 1，calls 23 | OK |
| 17 | TTS 引擎 | `settings get secure tts_default_synth` → com.xiaomi.mibrain.speech；`query-services TTS_SERVICE` → `.tts.TtsService` | OK |
| 18 | TTS 中英语音包 | 引擎无公开语言清单可查；未实际朗读（避免抢前台/扰动） | UNKNOWN → S4 实听 |
| 19 | STT 服务 | 默认 `voice_recognition_service` = com.miui.voiceassist/…mibrain.speech.asr.AsrService；mibrain `AsrService` 存在 | OK |
| 20 | STT 实际识别 | 未发起真实录音（S0 不做业务验证） | UNKNOWN → S2/S4 |
| 21 | 手机 Tailscale | `com.tailscale.ipn` 已装；手机无 `tun*`、无 100.x 地址、`dumpsys connectivity` NOT_VPN；tailnet ONLINE 设备为另一台 Redmi Note 12 Pro | FAIL（需本人登录） |
| 22 | Mac 磁盘 | `df -h /` → 36 GiB available（25% used） | OK |
| 23 | 服务自恢复 | `launchctl list` → `com.alw.socialmate-stack` pid 2433 | OK |
| 24 | APK 签名 | apksigner：CN=Android Debug；证书 SHA-256 `8e82a797…`；SHA-1 `9bc6a06a…` | OK |
| 25 | 已装应用 | dumpsys：0.8.1/36，targetSdk 35，firstInstallTime 2026-10-31 18:25:27，lastUpdateTime 2026-11-02 21:57:27 | OK |

注：所有 Key 均未读取明文；仅读取预算账本数值字段。