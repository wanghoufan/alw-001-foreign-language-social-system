# N05 S4 · Android 原生中英 TTS 听读 · 真机结果

日期：2026-11-02
设备：Redmi Note 11 5G / Android 11 / serial `REDACTED-SERIAL`
引擎：`com.xiaomi.mibrain.speech`（系统语音引擎），voice 数 4
版本：**0.8.2 / versionCode 37**

## 一、结论摘要

原生 `TextToSpeech` 桥已接入 WebView（`window.SocialMateTts`），中英分别绑定
`zh [zh-Hans]` 与 `en [en]` 两个不同 voice；句级队列、循环、停止、切段、倍速、
缺失语言错误码、本地进度持久化均已在真机运行。小米引擎对 `setSpeechRate` 响应很弱
（0.75× 与 1.0× 实测时长仅差 4–7%，非理论 33%），倍速项记 **PARTIAL**。
耳机插拔与会话人耳复听需用户物理操作，记 **NOT_RUN**，不得据此改判 PASS。

## 二、构建与安装

| 命令 | 退出码 |
|---|---|
| `sh android-poc/build-apk.sh`（Gradle 8.9 / JDK 17 / SDK 35） | 0 |
| `adb -s REDACTED-SERIAL install -r ...app-debug.apk` | 0 |
| `node android-poc/tools/verify-n05-tts.mjs`（CDP 12 项） | 0 |
| `bash android-poc/tools/n05-tts-evidence.sh` | 0 |

- APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`，207151 bytes
- SHA-256：`a3d0085e32686f19d04a4fd434c5f905d3f514e8fdf6c77c3c6018ebea4d562b`
- 签名：CN=Android Debug；证书 SHA-256 `8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`
- `dumpsys package`：versionCode=37 / versionName=0.8.2 / firstInstallTime 2026-10-31 18:25:27（覆盖安装保留数据）

## 三、逐项验收

| # | 项目 | 结果 | 证据 |
|---|---|---|---|
| 1 | 中文用 zh voice，日志显示 voice 名 | PASS | `logcat-tts.txt`：`voice=zh [zh-Hans]`，26 字播放约 5.9 s |
| 2 | 英文 A / B 用 en voice | PASS | `voice=en [en]`；A 92 chars、B 78 chars，均正常 onDone |
| 3 | 切段停读 | PASS | loop=3 只出现 `0/3`，3 s 后 `next` 切中文，旧队列无后续 |
| 4 | 循环 2 次后自停 | PASS | `0/2` → `1/2` → `queue finished total=2` |
| 5 | 停止生效 | PASS | loop=3 播放中 `stop` 返回 `state=stopped`，之后无新 utterance |
| 6 | 0.75 / 1.0 倍速差异 | PARTIAL | 同一句 0.75×=5.88 s，1.0×=5.51 s（≈6.7%）；长中文 14.3 s vs 13.5 s（≈5.6%）。设置生效但小米引擎响应弱，人耳差异可能不明显 |
| 7 | 插/拔耳机后正确输出 | NOT_RUN | 当前无有线耳机，`dumpsys audio` 输出为 speaker（音量 15/15）；需用户插拔复测 |
| 8 | ja-JP 返回 TTS_LANG_UNAVAILABLE + UI 提示 | PASS | `missingLanguage=ja-JP`；`ui-ja-jp.xml` 显示“错误 TTS_LANG_UNAVAILABLE…安装语音包”；网页侧提示条同样出现 |
| 9 | 队列状态回调 | PASS | CDP 收 `queue→started→sentence_done→finished` |
| 10 | 语速/循环/已听熟本地持久化 | PASS | `tts-prefs-before/after-restart.xml` 完全一致（rate=1.0、loop=2、listened 条目） |
| 11 | onStop 停读 / onDestroy shutdown / 再次 init | PASS | 切后台后无新 utterance；`shutdown` 后重新进入 `init READY` |
| 12 | 真实音频输出 | PASS（间接） | 播放中 `dumpsys audio`：`AudioTrack state:started usage=USAGE_MEDIA content=CONTENT_TYPE_SPEECH`，设备 speaker |

## 四、WebView 桥 API（`window.SocialMateTts`）

`speakText(text, lang)` / `speakTextWithLoop(text, lang, loop)` / `stop()` /
`setRate(0.75|0.9|1.0)` / `setLoop(n)` / `status()` / `voices()` /
`diagnose(lang)` / `setVoice(lang, voiceName)` / `setPlaylist(json)` /
`nextSegment()` / `previousSegment()` / `setListened(key, bool)` /
`isListened(key)` / `prefs()` / `onState(jsonString)` 回调。

错误统一 `{ok:false, code, message, missingLanguage}`；仅私有 origin 可调用。

## 五、证据文件

- `logcat-tts.txt`（完整流式日志，无 token）
- `verify-cdp-output.txt`（CDP 12/12 PASS）
- `apk-metadata.txt`、`dumpsys-package.txt`
- `dumpsys-audio.txt`、`dumpsys-audio-playing.txt`
- `tts-prefs-before-restart.xml`、`tts-prefs-after-restart.xml`
- `ui-ja-jp.xml`、`screenshot-ja-jp.png`、`screenshot-selftest.png`
- `commands.log`

## 六、未完成项

1. **耳机插拔**：需用户插入/拔出有线耳机，各听一段中英文；软件只验证了当前 speaker 路由。
2. **人耳复听**：中文、英 A、英 B 的“是否听得到/是否自然”需用户现场确认；本记录以引擎 onDone、播放时长与 AudioTrack started 作为客观证据，不冒充人耳结论。
3. **倍速感知**：小米 mibrain 对 rate 响应弱，若用户听不出 0.75 与 1.0 差异，需更换支持语速的引擎或接受 PARTIAL。