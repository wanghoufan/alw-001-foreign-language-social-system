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
