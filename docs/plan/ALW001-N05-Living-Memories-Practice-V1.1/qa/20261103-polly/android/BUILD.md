# N05 · Amazon Polly 声线选择 · Android 构建证据（0.8.4 / 39）

- 日期：2026-11-03
- 范围：只改 Android（`android-poc/**`），公开 PWA / 后端 / 真实档案数据未触碰。
- 本轮性质：**只编译，不安装真机、不启动/重启 8791、不跑全量回归**。真机播放留给 P3。

## 1. 版本与产物

| 项 | 值 |
|----|----|
| versionName | `0.8.4` |
| versionCode | `39` |
| applicationId | `app.socialmate.dualmic` |
| APK 绝对路径 | `/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/android-poc/app/build/outputs/apk/debug/app-debug.apk` |
| APK 字节数 | `303352` |
| APK SHA-256 | `e34f5a16abd29eb2c2594171fc301feefa0e29089cd8adb7eb69ea153160bcb3` |

aapt2 dump badging（build-tools 37.0.0）实测：

```
package: name='app.socialmate.dualmic' versionCode='39' versionName='0.8.4' ...
```

APK 内 dex 字符串实测含 `aws-polly-fake` / `aws-polly` / `UNKNOWN_VOICE` /
`remote_voice_` / `Zhiyu` / `Joanna`（classes3.dex），确认新代码进了产物。

## 2. 构建命令（clean，避免 UP-TO-DATE 假构建）

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
cd android-poc
"$HOME/.gradle/alw001-bootstrap/gradle-8.9/bin/gradle" \
  --no-daemon --console plain :app:clean :app:assembleDebug
```

环境说明：本机原先没有 `~/.gradle/alw001-bootstrap/gradle-8.9`，`build-apk.sh` 从
services.gradle.org 拉取时被 307 到 GitHub Releases 后超时；改用腾讯云镜像
`https://mirrors.cloud.tencent.com/gradle/gradle-8.9-bin.zip` 落盘到同一缓存路径后，
后续命令与任务书完全一致（未改 `build-apk.sh`）。首次依赖解析时也发生过一次
AGP 插件未解析失败，重跑即成功（同一缓存，未改仓库配置）。

## 3. 编译日志摘要

```
> Task :app:clean
> Task :app:compileDebugJavaWithJavac
注: 某些输入文件使用或覆盖了已过时的 API。
注: 有关详细信息, 请使用 -Xlint:deprecation 重新编译。
> Task :app:packageDebug
> Task :app:assembleDebug

BUILD SUCCESSFUL in 7s
34 actionable tasks: 34 executed
```

无 error、无 warning 级构建问题（仅 JDK 的 deprecation 提示）。`clean` 后 34 个任务全部
`executed`，非 UP-TO-DATE。

## 4. 代码改动（只列本轮动过的文件）

1. `TtsPlaybackController.java`
   - 远端声线白名单：`zh-CN → Zhiyu`；`en-US → Ruth / Joanna`；`en-GB → Amy / Brian`。
   - prefs 键：`remote_voice_zh-CN` / `remote_voice_en-US` / `remote_voice_en-GB`，空串 = 服务端默认。
   - 新增 `remoteVoice(locale)`、`setRemoteVoice(locale, voiceId)`：locale 或 voiceId 不在白名单返回
     `ok=false` + `code=UNKNOWN_VOICE` + `httpStatus=400`；空 voiceId 允许清除。
   - `speak()` 仅当 `provider=remote` 时把偏好注入 `voiceProfileId`；fake / system 路径未改。
   - `providerInfo()` 新增 `remoteVoices`（locale / voiceId / label / selected，空 voiceId 行 = 服务端默认），
     保留原有 `remoteServerProvider` 与全部旧字段。
2. `TtsSelfTestActivity.java`
   - 新增 ADB：`cmd=serverProvider --es value fake|aws-polly-fake|aws-polly`；
     `cmd=voice --es locale en-US --es voice Joanna`（voice 空 = 清除该 locale）。
   - 新增两行按钮：「远端服务商」fake / aws-polly-fake / aws-polly；「远端声音」默认 / Zhiyu / Ruth /
     Joanna / Amy / Brian。默认按钮清空三个 locale。主 UI（AsrActivity）未动。
3. `SpeakRequest.java`
   - 只新增 `withVoice(String voiceProfileId)`，字段顺序与 `toJson()` 协议未改。
4. `app/build.gradle`：`versionCode 39` / `versionName '0.8.4'`。
5. 新增 `android-poc/tools/n05-tts-v084-evidence.sh`：`meta` / `commands` / `build` / `device` 四种模式，
   默认不碰手机；`commands` 直接打印 P3 可复制的 adb 命令。

## 5. P3 可直接调用的 ADB 命令

```bash
ADB="adb -s <序列号>"
ACT="app.socialmate.dualmic/.TtsSelfTestActivity"

# 远端服务商
$ADB shell am start -n $ACT --es cmd serverProvider --es value aws-polly-fake
$ADB shell am start -n $ACT --es cmd serverProvider --es value aws-polly

# 声线（白名单内）
$ADB shell am start -n $ACT --es cmd voice --es locale zh-CN --es voice Zhiyu
$ADB shell am start -n $ACT --es cmd voice --es locale en-US --es voice Joanna
$ADB shell am start -n $ACT --es cmd voice --es locale en-GB --es voice Brian
$ADB shell am start -n $ACT --es cmd voice --es locale en-US        # 清除 en-US

# 负例（应为 UNKNOWN_VOICE + httpStatus=400）
$ADB shell am start -n $ACT --es cmd voice --es locale en-US --es voice Zhiyu
$ADB shell am start -n $ACT --es cmd voice --es locale ja-JP --es voice Zhiyu

# 读回
$ADB shell am start -n $ACT --es cmd status
$ADB shell run-as app.socialmate.dualmic cat shared_prefs/socialmate-tts.xml
```

## 6. 未验证项（明确不在本轮）

- 真机安装与声音实际播放（含 Polly 各声线听感、`aws-polly` 云路径）——留给 P3。
- 与后端 `aws-polly-fake` / `aws-polly` 的端到端联调（本轮只按固定契约对齐字段，未起 8791）。
- 声线切换后的缓存隔离行为（`cacheKey` 含 voiceProfileId 属既有实现，未做设备侧实测）。
- 全量回归、主 UI 学习流程、PWA 侧展示。

## 7. 复现

```bash
bash android-poc/tools/n05-tts-v084-evidence.sh meta       # 版本 / 字节 / SHA
bash android-poc/tools/n05-tts-v084-evidence.sh commands  # 打印 P3 命令
SERIAL=<序列号> bash android-poc/tools/n05-tts-v084-evidence.sh device [--install]
```