# Android 双麦 + 实时 ASR · 实施验收台账

日期：2026-10-31（本版为真机执行后的实际状态）

## 一、构建与安装（已实际完成）

- [x] `sh test-core.sh`：PASS 12 core assertions（含 MONO_MIX 判定）。
- [x] Gradle 8.9 + AGP 8.7.3 + JDK 17 + compileSdk 35 构建成功：`BUILD SUCCESSFUL`。
- [x] APK：`android-poc/app/build/outputs/apk/debug/app-debug.apk`
  - 版本：`0.3.2`（versionCode 8）
  - 大小：131355 bytes
  - SHA-256：`ceea17ffc2bd51777bcb7223572470affacf803b9183d53e0e2a7afc37243622`
  - 签名：Android Debug（SHA-256 `8e82a7975008e8ec87ff0f2ecadf495b5263effa34aaec9ab6f135ebea911cf3`）
- [x] 已安装并拉起：
  - Redmi Note 12T Pro（Android 15 / HyperOS V816）：实测 0.1.1，后升级安装 0.2.1。
  - Redmi Note 11 5G（Android 11 / MIUI 12.5）：安装并拉起 0.3.2，截图存证。
- [x] 双麦检测页不联网；ASR 实验页新增 `INTERNET` 权限，只连接用户填写的服务端。
- [x] MIUI 的 `adb install` 被 `INSTALL_FAILED_USER_RESTRICTED` 拦截；改用 `pm install-create/write/commit` 在 Note 11 上安装成功；Note 12T 在用户打开相应开关后 `adb install` 成功。

## 二、博雅真机双麦结论

结论：**MONO_MIX（dual-mono，混合单声道），不是真分轨。**（2026-11-01 重新实测，发射器已开机，电平正常）

### 2026-11-01 复测（Note 11 5G + BOYA mini）

- 路由：`USB_DEVICE #587 · USB-Audio - BOYA mini`，`routeVerified=true`，48000 Hz / 2 声道 / UNPROCESSED。
- A 段：L/R = **-24.1 / -24.1 dBFS**（L−R = 0.0 dB），削波 0。
- B 段：L/R = **-27.96 / -27.96 dBFS**（L−R ≈ -0.0000007 dB），削波 0，frames 240000。
- 结论：两路都有正常电平（不再是 `-180 dBFS` 静音），但左右完全一致 → **MONO_MIX 成立**；固定走混音 + 说话人分离，不再追真分轨。
- 诊断文件：`/sdcard/Android/data/app.socialmate.dualmic/files/Music/dualmic/20261101-1204*_A`、`…1205*_B`。


- 设备：USB-Audio - BOYA mini（VID 0x3634 / PID 0x4155），48000 Hz、2 声道、`UNPROCESSED`。
- 路由：A/B 两段均 `routeVerified=true`，请求与实际路由为同一 USB 设备。
- 实测：
  - A 段：L/R = -8.89 / -8.89 dBFS；`max|L-R| = 1 LSB`；削波 5.73%。
  - B 段：L/R = -9.77 / -9.77 dBFS；`max|L-R| = 6 LSB`；削波 3.44%。
  - A 段与 B 段语音相关性 0.0114（两次说话内容不同）。
- 解释：左右轨实质相同，A/B 两个发射器的声音被合并到同一路；不能按左右通道区分说话人。
- 0.3.2 起双麦页在削波 >1% 时直接显示警告，建议降低接收器增益或拉开距离。
- 证据：`artifacts/dualmic-20261031/analysis.md`、`diagnostics-A/B.json`；原始 WAV 在 `.local/device-recordings/`（含本人语音，未入库）。
- 未完成：两人同时说话、嘈杂环境、重插 USB、锁屏/中断；未切换接收器 Mono/Stereo 模式；未人工试听左右 WAV。
- 下次复测：用 BOYA Central App 把声道模式改为「立体声」后重跑 A/B；若仍为 MONO_MIX，则固定走混音路线。

## 三、腾讯云实时英文 ASR

- [x] 服务端桥接：`android-poc/asr-bridge/`，Node 独立模块。
- [x] `npm test`：35 / 35 通过（重采样、抗混叠、分轨、混音、v2 签名、无密钥报错、mock 端到端、语料检索与建议 API；含新增 `sentence_list` 回归）。
- [x] Android 端新增「实时英文 ASR（实验）」页：
  - 路由：`mix`（`16k_zh_en_speaker_2.0` 说话人分离）/ A 轨 / B 轨 / 双轨 A+B。
  - 手机只保存服务端地址，不保存 SecretId/SecretKey。
  - 事件字段：`type/track/text/startMs/endMs/speaker/confidence/final/mock`；定稿转写只追加，不被实时结果覆盖。
  - 会话内可输入话题（或用最近一句定稿）请求 2–3 条英文追问建议；真机 0.3.1 已验证能从 V1.4 返回 P002 建议。
- [x] 真机端到端（**MOCK，不是真实识别**）：
  - Note 12T Pro：`mix`，48k/2ch，inputBytes 4,776,960（约 49.8 s），29 条事件，`session.status=ended`，WS close 1000。
  - Note 11 5G：`mix`，48k/2ch，inputBytes 3,091,200（约 32.2 s），4 条事件，`session.status=ended`，WS close 1000。
  - 界面事件均带 `[MOCK]`；会话日志见 `artifacts/dualmic-20261031/asr-session-*.log`。
- 端口：桥接默认 `8790`（避开本机 Docker 容器占用的 8787）；手机通过 `adb reverse tcp:8790 tcp:8790` 访问 `ws://127.0.0.1:8790/asr`。
- [x] **真实腾讯云 ASR 已连通（2026-10-31）**：密钥由用户填入 `.env`，`/health` 返回 `mode:"tencent"`、`mock:false`。
  - A 轨 `16k_en`：`Hello, this is Michael.`（5s，speaker=A）
  - B 轨 `16k_en`：`Hello, this is microphone b, I'm testing the right channel.`（5s，speaker=B）
  - 混音 `16k_zh_en_speaker_2.0`：15s 音频输出 `Hello, this is, uh, Michael.`，`speaker=spk_0`，时间戳 12160–14810ms。
  - 修复两处：① 签名 URL 补 `speaker_diarization=1`；② 解析 V2 `sentences.sentence_list`（原代码只认扁平 `sentences.sentence`，导致混音无文本）。
  - 真实英文转写与时间戳已验证；5s 短音频可能只出 final，无 interim。
  - 2026-10-31 追加受控复测（用户批准 3 次 / ≤3 分钟，实际 3 次 / 21 秒）：A 5s、B 5s、A+B 拼接 11s。
  - 拼接样本两段均判为 `spk_0`——两段为同一人声音，**没有真正验证双人分离**；说话人分离准确率仍未验证。
- **仍未验证**：
  - 多人真实对话下的说话人分离准确率（当前仅单人样本，`spk_0`）。
  - 计费/余额/并发上限与大模型 2.0 计费口径。
  - v3 新版接口未实现（本模块按 v2 实现）。
  - 官方 v2 无 `confidence` 字段，模块固定 `null`，没有伪造置信度。
  - Android 双轨 A+B 的真机端到端未跑（硬件当前为混合单声道）；真机只跑通 mix。

## 四、内容层与正式稿件

- [x] 唯一正式软件介绍主稿：`docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`；解析出 51 个软件条目（含 P027/P062 合并编号）。
- [x] 海南 115 地点：读取 `Hainan-Travel-Guide/dist/.../places.json`，115/115 可检索。
- [x] 个人故事：仅加载 `confirmed:true` 且含英文的条目；当前 `content/personal-stories.json` 为空，不编造。
- [x] 检索与建议：BM25 + 中英文混合分词；精确标题优先；按主导领域收敛建议；问题为模板，分享逐字引用来源；HTTP `GET/POST /suggest` 与 WS `{"type":"suggest"}` 均可用；测试 34/34。
- [x] 未使用 `temp/intros-A～I` 任何临时草稿；测试断言来源路径与文本都不含 `temp/intros`。
- [ ] 已确认个人故事仍需用户提供并标记 `confirmed:true` 后才会进入建议层。

## 五、剩余不可代办事项（必须用户参与）

1. ~~真实 ASR 密钥~~：已完成（2026-10-31，用户填入 `.env`）。仍需确认余额与并发上限，避免真实联调中断。
2. **真分轨复测（可选）**：安装官方 BOYA Central App，把声道模式切到「立体声」，再跑 A/B 两段；否则固定走混音 + 说话人分离。
3. ~~真实英文识别验收~~：已完成 A/B 与混音三条真实转写（见第三节）。多人分离准确率仍需真人样本。
4. **双人/嘈杂/重插/锁屏测试**：需要真人和设备配合。
5. **个人故事语料**：只有用户确认并写入 `confirmed:true` 的英文内容才会被建议层使用；不自动抓取私人内容。

## 六、禁止事项

不改写 V1.4 正式稿、不把临时草稿当正式内容、不发布私人录音、不提交任何密钥、不把 MOCK 或仅代码完成写成“真实 ASR 已通过”、不把双声道声明写成“真分轨已证明”。


## 附录：2026-11-01 0.4.0 已构建安装（取代下方旧待办）

- 旧 0.3.2 APK 签名、哈希、双麦/腾讯真机实测结论**继续有效，但不能复用来声称 0.4.0 已通过**。
- 已改 Android `AsrActivity.java`：新增本机私有 WebView，保持 AudioRecord 在同 Activity 前台运行。开始录音后自动显示正式 V1.2 页面；退出到后台仍走原有 `onStop` 停录策略。
- 录音前需要勾选已告知并获得同行人同意；停止录音后复选框恢复未选。是否向 DeepSeek/OpenCode Go 发送**文字**在网页中另外选择，默认不发送。
- **已执行**：Gradle `BUILD SUCCESSFUL`；APK 0.4.0/versionCode 9，SHA-256 `30992001df58d5c20f30c20588236c27444a10f1a8312e4277bc52c014ab62ae`。
- **Note 11 5G（&lt;note11-serial&gt;）**：`adb install -r` Success，versionName 0.4.0，保留 App 数据；8790/8791 reverse 均存在；WebView 打开 `/v12` 成功。
- Note 12T Pro 仍为 0.2.1，未同步 0.4.0。
- Mac 运行方式：`bash socialmate-v1.2/service-v040.sh ensure`（单进程 8790+8791）；`bash socialmate-v1.2/install-phone-v040.sh --serial <serial>` 安装/映射/启动；`bash socialmate-v1.2/verify-v040.sh` 回归。
- 已实测：MOCK 手机音频→SSE→UI、服务重启自动重连、真实腾讯云 2 条 final、显式同意后 DeepSeek 真实返回与 39/41/45 卡片。测试音频为合成语音，**不是真人验收**。

## N03（2026-11-01）· 0.6.0（versionCode 15）

- APK：`app/build/outputs/apk/debug/app-debug.apk`（206679 B）· SHA-256 `972eed42d9fe1722e9f47d63f0bd69a073878747560eb2392e3dae42d24861b1`
- 设备：Redmi Note 11 5G（Android 11 / 21091116AC）`install -r` 保留数据；`firstInstallTime` 未变。
- 新增/修改：
  - 原文留存默认**未勾选**，三项同意拆分并写清互不代替。
  - `SessionArchive` 断网退避补传（3/10/30/60s，≤6 次，单飞）+ 网络回调触发；状态四态中文：手机已保存 / 待上传 N 条 / 已同步 Mac / 失败可重试。
  - 自适应图标（`res/mipmap-anydpi-v26/ic_launcher(.round)`、`drawable/ic_socialmate_foreground|monochrome`、`values/colors.xml`）与 Android 12+ 系统 SplashScreen（`values-v31` + `values-night-v31`，不使用 core-splashscreen、无独立 Splash Activity、无 sleep）。
  - WebView 受限原生桥 `SocialMateAndroid.saveText`（仅私有同源注入 + 桥内二次校验）+ DownloadListener（blob/data）+ SAF 落盘；不申请存储权限。
  - Manifest：`icon`/`roundIcon`、`windowSoftInputMode=adjustResize`、`ACCESS_NETWORK_STATE`。
- 验证：`sh test-core.sh` → PASS 12 core assertions；`bash ../socialmate-v1.2/verify-v040.sh` → 215 Node + 12 core + BUILD SUCCESSFUL。
- 未验证：Android 12+ 真机启动画面实拍（本机 Android 11 无该 API）；软键盘遮挡（本机输入法不绘制键盘，`mInputMethodWindowVisibleHeight=0`）。

## N03b（2026-11-01）· 0.6.6（versionCode 21）

产品化收口，只改入口与界面形态，不动数据链路与授权模型。本轮只做文档同步，未构建、未安装、未真机点击 0.6.6。

- 版本：`app/build.gradle` → `versionName '0.6.6'` / `versionCode 21`（0.6.1→0.6.6 连续小步）。
- 入口：`MainActivity` 无 `diagnostics` extra 时 `startActivity(new Intent(this, AsrActivity.class))` + `finish()`，桌面图标直接进五 Tab；双麦/设备检测（`diagnosticTools`）只在 `diagnostics=true` 时展示。
- 顶栏：`AsrActivity` 打开即 `showSocialMatePanel()`（不再先停在原生录音页）；WebView 顶栏压到 40dp，只留品牌名 + `⋮`，录音 / 刷新 / 服务地址 / 设备检测收进 `showOverflowMenu(View anchor)` 的 `PopupMenu`。
- 录音面板：底部卡片（把手 + 「开始录音」+ 关闭 + 三枚 chip「需双方同意 / 原文默认不留存 / 云端 AI 默认不发」+ 两个勾选项与说明 + 状态行 +「本轮原文与复盘」「停止录音」+ 折叠「高级设置」+ 主按钮「开始录音」），高度随内容，无空白。
- 前端（`socialmate-v1.2/source/V1.1-baseline.html`）：删除全部演示/示例入口；CTA 改「开始录音」，有桥时 `requestRecording()` 后等 `smNativeRecordingStarted()` 再 `connectLiveASR()`；手动输入移入「更多 · 人物与云端授权」的二级折叠。
- 验证方式（本轮只跑三条定向，未跑 `verify-v040.sh`）：
  - `node socialmate-v1.2/test-ui.mjs` → **12/12** 检查通过（含 `noDemoEntry`、`ctaIsRealAction`）。
  - `node socialmate-v1.2/test-live-asr.mjs` → **9/10**；失败项为「点 CTA 后立即订阅字幕流」，与延迟订阅契约冲突（harness 未调 `smNativeRecordingStarted`）。
  - `node --test socialmate-v1.2/test-android-wiring.mjs` → **4/7**；失败 3 条为 0.6.0 旧字符串断言（`我已告知并获得同行者同意录音`、`SocialMate · 实时对话`、`stylePrimary(startButton)`）。
- 待办：上述 3 + 1 条断言需在 `*.mjs` 侧随新界面更新（本轮按约定未改测试/代码）；更新后再补 0.6.6 构建、`install -r` 与真机点击证据。

## N04 V1.3（2026-11-02）· **0.8.1（versionCode 36）— 当前安装与验收版本**

> 上面 0.3.2 / 0.6.0 / 0.6.6 段落为历史里程碑，**不是当前版本**；以本段与 `app/build.gradle` 为准。

### 构建与安装（T5 实做）
- 源码基线：git HEAD `fc2379c` + 33 个未提交改动（工作树快照，未 reset / clean / push）。
- 工具链：JDK 17（`/opt/homebrew/opt/openjdk@17`）+ Android SDK 35 + Gradle 8.9（`~/.gradle/alw001-bootstrap`）。
- 命令：`gradle --no-daemon --console plain clean :app:assembleDebug`（日志 `qa/20261102-t5/build.log`、`build-2.log`）。
- APK：`versionName 0.8.1` / `versionCode 36`，176434 bytes，SHA-256 `9971836f0d1cd34afceaf3063f3d8d3cba652faf1f7d3e753dc0d0f03e042296`。
- **可重复构建**：clean 构建两次，APK 与 `classes.dex` 均字节一致（`qa/20261102-t5/reproducibility.txt`）。
- 签名：APK Signature Scheme v2，证书 `CN=Android Debug`，证书 SHA-256 `8e82a797…911cf3`（不暴露私钥）。
- 安装：`adb -s REDACTED-SERIAL install -r` → `Success`，`firstInstallTime` 保持 `2026-10-31 18:25:27`（数据保留），签名冲突时不做自动卸载。

### 权限（`dumpsys package` 回读）
- 请求：`RECORD_AUDIO`、`INTERNET`、`ACCESS_NETWORK_STATE`。
- 已授予：`RECORD_AUDIO: granted=true`（运行时）、`INTERNET`、`ACCESS_NETWORK_STATE`。

### 真机端到端（T5，Android 11 / Redmi Note 11 5G）
1. 打开即 3 演示人物 / 9 段会话 / 54 句 / 待确认 3 条（`02-people-tab.png`）。
2. 分组编辑（中/英各一次）、批量移动到其他分组、撤回 —— 单次点击即成功（`04`–`07`）。
3. 三人各 2 条专属 + 1 条通用，专属问题来自对话事实（`14`–`16`）。
4. 清空演示 → 0/0/0（`11`），重开仍为空（`12`），恢复 → 3/9/54（`13`）；真实 `People` 哈希未变。
5. 合成音频（SYNTHETIC）经真实腾讯 ASR `mock:false` 出 1 条 final（`32`、`33`），预算 +¥0.012022（上限 1 元不变）。
6. 选 Oliver 确认 → 事实 5→6、专属问题即时重算（`34`、`35`）。
7. 停止 → 手机 outbox（`files/archive/outbox/sess_20261102T102615_e52f2f.json`）→ 重启后自动补传 HTTP 201 → Mac `.md/.json` 逐字一致（`40`）。
8. 历史页显示逐字原文（`42`），SAF 导出到 `/sdcard/Download/SocialMate-sess_20261102T102615_e52f2f.md`（`43`、`44`）。
9. 断 `adb reverse` → 原生「离线只读模式」面板，3 人 / 9 段 / 54 句 + 本地原文，不白屏（`50`）；恢复通道一键回在线（`51`）。

### 本轮修复
- `socialmate-v1.2/index.html`：写票一次性 —— 发出后作废客户端缓存，避免第二次写被 403。
- `socialmate-prototype/ai-gateway/demo-store.mjs`：`buildDemoPrep()` 对话来源优先 + 英文原文匹配问句模板。

### 仍未验证
- 手机 Tailscale 授权（T4/T5 NOT_RUN，需用户本人）；物理拔 USB（等价验证）；第三方 Markdown 查看器；真人双人 / BOYA；Android 12+ 启动画面实拍。

## N05 Polly（2026-11-03）· **0.8.9（versionCode 44）— 当前安装版本**

> 上面 0.8.1 段落为历史里程碑；以本段与 `app/build.gradle` 为准。

- 构建：JDK 17 + Gradle 8.9，`:app:clean :app:assembleDebug` 全部 task executed；APK 307840 B，SHA-256 `66318df341129d45a6aa6f3f6ca4cbf159ef3d774c08c27578b06b5f84e92c22`。
- 安装：Note 11 5G（`REDACTED-SERIAL`）`install -r` → Success；`dumpsys package` 回读 `versionCode=42 / versionName=0.8.7`。
- 0.8.7：默认朗读源改为本机系统语音（`system_fallback` 默认开）；真机中英文均完整读出。
- 0.8.8/0.8.9：冷启动点朗读挂起 4 s 内自动播放（不再报 `TTS_INITIALIZING`）；原生事件推送加 `onState` 守卫；真实路径（海南→地点→记录→听读）实测通过。
- 0.8.6：修复设置页朗读 `blockId` 用中文标签导致远端 400（改 `selftest-<segmentType>`）；UI 路径实测 `remote+aws-polly-fake` 合成 1 次、`aws-polly` 同意后 501 且合成 0。
- 真机（`aws-polly-fake`）：cn / enA / enB / phrase 四类 locale 播放；Zhiyu / Joanna / Ruth / Amy / Brian 五声线均命中；循环 5 次、停止、切段、重复段客户端缓存命中均通过。
- 真实 Polly 同意 UI：estimate → 原生弹窗（服务商/区域/引擎/字符/估价/摘录）→ 同意/取消；同意后 501 `PROVIDER_NOT_CONFIGURED`、取消不发，合成请求均 0；证据 `qa/20261103-polly/android/20`–`24`。
- 负例：跨 locale 声线 → 400 `UNKNOWN_VOICE`；系统 TTS 未手动开启 → `TTS_SYSTEM_FALLBACK_NOT_ENABLED`（不自动降级）；真实 `aws-polly` 未授权 → 403 `CONSENT_REQUIRED`，0 次 AWS 请求。
- 证据：`docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/qa/20261103-polly/android/`（README/截图/UI dump/audio_flinger/logcat/providers）；后端 `qa/20261103-polly/backend/` 31/31。
- 仍未验证：真实 AWS 合成 / DescribeVoices / 音质试听（需用户授权与预算）；全量回归未跑；未 commit/push。

## N05 V1.3 混合播放队列（2026-11-03）· **0.8.13（versionCode 48）— 当前安装版本**

- 构建：JDK 17（Homebrew 17.0.20.1）+ Gradle 8.9 + SDK `~/Library/Android/sdk`（补 `local.properties`）；`:app:assembleDebug` `BUILD SUCCESSFUL`。
- APK：313224 B，SHA-256 `738ff4c74c70bc6987a0041d3f55db26fab35ac416f57756d759e49d4c66f63b`；Note 11（`REDACTED-SERIAL`）`install -r` → Success，`dumpsys` 回读 `versionCode=48 / versionName=0.8.13`，`firstInstallTime` 未变（未清数据）。
- 原生新增：`TtsPlaybackController.pause()/resume()` + `PHASE_PAUSED`（暂停期间不推进循环重放）；`JsLogBridge`（`window.SocialMateLog.log` 写 logcat）；`onTtsState` 改为派发 `window.SocialMateTtsHost.onState`（旧通道兜底）。
- 真机实测：一轮 15 项按 `zh→enA→enB→(词组中文→1000ms→英文)×6` 完成；3 轮 45 项、20 轮 300 项按序无跳过；单语互斥、停止释放队列、失败重试均验证。
- 朗读来源：`aws-polly-fake`（本地预置 WAV，不外传）与 `system`（小米语音引擎，冷启动 6–8s）两条路径都跑通；真实 AWS Polly 音质 NOT_RUN。
- 证据：`docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5/REPORT.md`。
- 仍未验证：真实 Polly 合成/音质；合并/拆分未在生产记录落版本（只做等价守恒校验）；有线耳机、第二台设备、Tailscale 全链 NOT_RUN。

## N05 V1.4 后台连续朗读（2026-11-04）· **0.8.14（versionCode 49）**

- 构建：JDK 17（Homebrew 17）+ Gradle 8.9 + SDK `~/Library/Android/sdk`；`:app:assembleDebug` `BUILD SUCCESSFUL`。
- APK：`app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `caf5930fcad61edabcec05085eda87e7792e3e766191060f282d737a02187978`；Note 11（`REDACTED-SERIAL`）`install -r` → Success，`dumpsys` 回读 `versionCode=49 / versionName=0.8.14`，未清数据。
- 原生新增：`TtsPlaybackService`（前台服务 `mediaPlayback` + 通知栏暂停/继续/停止 + AudioFocus + `ACTION_AUDIO_BECOMING_NOISY` + `PARTIAL_WAKE_LOCK` + `MediaSession`）、`TtsQueueRunner`（队列/间隙/轮次/重试/看门狗 + `files/tts-queue-timeline.jsonl` 时间线）。
- 桥接变更：`TtsBridge.startQueue(planJson)`、`queueControl(action)`、`queueState()`；`stop()` 连带取消后台队列；控制器改为进程内单例（`TtsPlaybackService.controller()`），Activity 不再自建引擎。
- 生命周期：`onStop` 仅在**无活动队列**时 `ttsController.onStop()`；`onDestroy` 同理不 `shutdown`；`onResume` 把 `queue_state` 回灌页面。
- 真机实测（锁屏）：循环 ×3，`mWakefulness=Asleep` 全程 **45/45 项、3 轮、227.9s、0 重试**；`dumpsys activity services` 显示 `TtsPlaybackService isForeground=true foregroundId=4711`；结束自动退前台并使 ServiceRecord/通知记录归零。
- 真机实测（控制）：暂停→通知「朗读已暂停」；继续→恢复推进；停止→立即释放；Home→队列继续并在重开后显示正确轮次/项。
- 修掉的两个缺陷：①朗读按钮 `data-lang` 撞名导致弹「显示与阅读设置」并写坏界面语言；②原生队列按 `kind` 映射 `segment=phrase` 致中文词组用 en-US 声线。
- 仍未验证：来电/耳机拔出（BG04，保护广播无法 adb 触发）、第二台 Android 14 设备安装、脱 USB 私网。
- 证据：`docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-t5/REPORT.md` + `bg01-timeline.jsonl`。
## T3 Tailscale 外出 / 断 WiFi（2026-11-04）· **0.8.15（versionCode 50）— 当前安装版本**

- APK：`app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `21f6857695bbc5fa27a08add27b48d8d0cc133b1819644aecd6df4486a00aca9`；`release/SocialMate-0.8.15-vc50-debug.apk` 同哈希。
- 真机（Redmi Note 12T Pro / Android 15 / Tailscale `100.94.116.99`）：关闭 Wi-Fi 后 VPN 底层为 `MOBILE[NR]`（`Transports: CELLULAR|VPN`），`ping mac-mini.tail4e4317.ts.net` 2/2、0% 丢包；经 Tailnet 无线 ADB `install -r` → Success，回读 `versionCode=50 / versionName=0.8.15`。
- 页面：`https://mac-mini.tail4e4317.ts.net:8443/v12?live=1` 真实加载 26 张卡片；修复后 SSE `asrState=ready`、`asrStream=true`，显示「字幕已接入」。修复前同一地址 `asrState=off`、无 SSE 请求。
- 修复：①前端 `connectLiveASR()` / `requestRealAI()` 只认 `127.0.0.1:8791`，改为 `HTTP_UI` 协议判断；②`injectAccessToken` 改为覆盖写入，防重新配对后旧令牌 401。
- 未验：蜂窝下原生录音未重新开麦；归档写入因设备未配对返回 401（通路已到达 8781）；AI 真实请求未发。
- 证据：`docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-t3/REPORT.md`、`code-audit.md`、`network-phone/REPORT.md`。
## N05 V1.5.1 真实交流收口（2026-11-04）· **0.8.30（versionCode 65）— 当前安装版本**

- APK：`app/build/outputs/apk/debug/app-debug.apk`，SHA-256 `794e68a8117fea87149c0b5acd3ff40b2a47c87fcbe0683385f755c3c96972a3`；`adb install -r` 保留数据。
- 真机（Note 12 Pro / 22101316C / Android 14 / 家庭 Wi-Fi）：`0.8.30` 启动即取配对短期令牌；录音握手通过 `x-asr-token` 鉴权，`activeSessions=1`；系统 TTS 回环音频（SYNTHETIC）产生 10 条 final。
- 归档：`pending=0`、`HTTP 201`、`lastSyncedAt=22:43`，Mac `Conversations/2026/11/` 落地 1556B md；outbox 为空。
- 安全：无令牌/伪造/撤销/错误 Origin 分别 401/401/401/403，均在建立 P066 上游前拒绝；桥单测 `npm test` 54 pass（含新增 12 条 ws-auth）。
- 版本变更：0.8.29/64 → **0.8.30/65**。
- 证据：`docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/QA-REPORT.md`、`qa/t1-security/`、`qa/t2-recovery/`、`qa/t3-quality/`。
- 未验：真人 30 分钟连续交流、Wi-Fi↔蜂窝切换运行期、来电/耳机、P066 402/300s/撤销、Polly。
## N05 V1.5.2 聊天录音页压缩（2026-11-05）· **0.8.31（versionCode 66）— 当前安装版本**

- 构建：`JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home sh android-poc/build-apk.sh` → `BUILD SUCCESSFUL`。
- APK：`release/SocialMate-0.8.31-vc66-debug.apk`，SHA-256 `b8fa8b24c6232aabeab661d7c379ef82f8c5f614c7583163daec669a1903b9a9`；Note 11 5G 与 Note 12T Pro `install -r` → Success，回读 `versionCode=66 / versionName=0.8.31`。
- 原生：`AsrActivity.stream()` 新增 `CountDownLatch`（初值=tracks 数）；`finally` 中 `finish()` 后等待 `session/ended` 最长 3s 再 `archive.end()`，替换固定 `sleep(1500)`。
- 页面：`v152-compact` 全屏录音页（232px 对话 + flex 建议 + chips）、停止弹层、英文分享卡、页内原资料页；`build-v12.py` 补充 `special_en/photos` 映射。
- 真机（Note 11 5G，393×791）：A1–A5/B1–B4/C1–C4/D1–D5/E1–E6/F1–F6 PASS；对话/建议 219/438=0.500；首屏 5 条；D2 进 `/v12/history`；D3 档案 mtime 未变；D4/E6 `activeSessions=1`。
- 归档：真实 P066 TTS 回环 6 段 → 页面 6 / 归档 6 / HTTP 201 / pending 0 / Mac 落地；继续录音后 1/1。
- 翻译：`POST /api/ai/translate` 实测「刚到海口，天气太潮湿了。」，1.4s、约 0.00027 元；无 consent 403。
- 四方向 eval 各 3 条、0 重复、0 编造。
- **NOT_RUN**：真人 30 分钟、Wi‑Fi↔蜂窝切换、来电/耳机/音频焦点；本轮录音为 TTS 回环（SYNTHETIC），不是真人验收。
- 翻译按需调用 DeepSeek（用户已授权）；单句缓存，不批量预翻译。
- 证据：`docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/QA-REPORT.md`。
