# ALW-001 · Android 博雅双麦检测 + 实时英文 ASR 实验

**当前状态（2026-10-31）：APK 0.3.2 已构建、已在红米 Note 12T Pro 与 Note 11 5G 上安装并拉起；博雅真机结论为 `MONO_MIX`（混合单声道，不是真分轨）；ASR 桥接 34/34 测试通过，手机→桥接的 `mix` 路由已用 MOCK 端到端跑通，V1.4 + 海南 115 的内容检索与英文建议已在真机验证；真实腾讯云尚未接入密钥。**

独立工程，不替换旧 SocialMate、不改 Docker、不使用 `temp/intros-*`。双麦检测页不联网；ASR 实验页只连接用户填写的服务端，手机不保存 SecretId/SecretKey。

## 构建

需要 JDK 17、Android SDK Platform 35、Build Tools 35、联网下载首次 Gradle 依赖。

```sh
cd android-poc
export JAVA_HOME="$HOME/android-toolchain/jdk-17.0.20.1+1/Contents/Home"
export ANDROID_HOME="$HOME/android-toolchain/sdk"
sh test-core.sh          # 12 项核心断言
sh build-apk.sh          # Gradle 8.9；产物 app/build/outputs/apk/debug/app-debug.apk
```

`build-apk.sh` 首次会把官方 Gradle 8.9 下载到 `~/.gradle/alw001-bootstrap/`。本机直连 Gradle/GitHub 慢时，可先用本机代理把 ZIP 下到该目录再运行脚本。

安装（MIUI 若报 `INSTALL_FAILED_USER_RESTRICTED`，先在开发者选项打开「通过 USB 安装 / USB 调试（安全设置）」，或改用 `pm install-create/write/commit`）：

```sh
adb -s <serial> install -r -g app/build/outputs/apk/debug/app-debug.apk
adb -s <serial> shell am start -n app.socialmate.dualmic/.MainActivity
```

## 双麦检测页

1. 插入博雅接收器，点「刷新音频设备」，确认选中的是 `USB_DEVICE ... BOYA mini`（避免内置麦）。
2. 点「① 只对麦克风 A 说话 5 秒」，A 讲话、B 安静；再点「② 只对麦克风 B 说话 5 秒」，B 讲话、A 安静。
3. 结论取值：
   - `CANDIDATE_A_LEFT_B_RIGHT` / `CANDIDATE_A_RIGHT_B_LEFT`：疑似真分轨，仍须导出 WAV 试听串音。
   - `MONO_MIX`：左右声道电平几乎相同，接收器是混合单声道，应走混音 + 说话人分离。
   - `MONO_OR_INCONSISTENT`：安卓拿到单声道或通道不一致。
   - `NOT_PROVEN`：没有稳定相反优势，不能宣称分轨。
4. 「导出 WAV / 检测报告」可导出 `original/left/right.wav` 与 `diagnostics.json`。

**2026-10-31 实测结论：`MONO_MIX`。** 两段均 48 kHz / 2 声道 / `UNPROCESSED`，USB 路由已核对，但 L/R 最大只差 1–6 个 LSB，等同同一声源。详细数据保存在本地测试记录（未入库）。博雅 mini 的立体声模式需在官方 BOYA Central App 中切换，接收器没有 M/S 实体键；未切换前只能走混音。

## 实时 ASR 实验页

服务端：`asr-bridge/`（Node，默认 `ws://127.0.0.1:8790/asr`）。无密钥自动 MOCK，事件以 `[MOCK]` 开头；这不是真实识别。

```sh
cd asr-bridge
npm install
npm test
npm start        # 默认 127.0.0.1:8790，无密钥 = MOCK
```

手机与电脑连通（USB/WiFi adb 均可）：

```sh
adb -s <serial> reverse tcp:8790 tcp:8790
```

打开 App 底部「打开实时英文 ASR 实验页」，保留默认 `ws://127.0.0.1:8790/asr`，选择「混音 → 说话人分离 (mix)」，点「连接并开始识别」。真实云端需要在 `asr-bridge/.env` 填入腾讯云 AppID / SecretId / SecretKey；密钥只存在电脑端。

会话中可在「英文追问建议」区输入话题（或留空使用最近一句定稿），点「获取 2–3 条英文建议」；也可点「填入示例话题（personality quiz）」做无语音演示。建议来自 V1.4 / 海南 115 / 已确认故事，问答是模板，分享逐字引用来源，不由大模型编造。

- `mix` → `16k_zh_en_speaker_2.0`（说话人分离）。
- 双轨 A/B → `16k_en`，仅在接收器真正输出独立左右声道时有意义。
- 官方 v2 不返回置信度，界面不伪造；v3 尚未实现。

## 内容检索建议层

- 语料：`docs/成果整理/...V1.4.md`（51 个软件条目）、`Hainan-Travel-Guide/dist/.../places.json`（115 地点）、`asr-bridge/content/personal-stories.json`（仅 `confirmed:true`，当前为空）。正式语料不随开源仓库分发，需本地提供；自动测试使用 `asr-bridge/test/fixtures/`。
- CLI：`npm run suggest -- "personality quiz"`；HTTP：`GET /suggest?q=...&limit=2` 或 `POST /suggest`；WebSocket：`{"type":"suggest","text":"...","limit":3}`。
- 排序：BM25 + 中英文混合分词，精确标题优先，按主导领域收敛；问题为模板，分享逐字引用来源。
- 禁止：读取 `temp/intros-A～I`、编造个人故事、把建议说成大模型生成。

## 验收边界

- 不得把 MOCK 事件、仅编译通过、或“代码已写”当作真实 ASR / 真分轨验收。
- 真实腾讯云连通、英文识别质量、说话人分离准确率尚未验证（无密钥）。
- 双麦测试只覆盖一对 A/B 录音；未做同时说话、嘈杂、重插、锁屏与人工左右试听。
- 当前输入削波约 3.4%–5.7%，正式使用前应降低增益或拉开距离。
- 正式软件介绍唯一来源是 `docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`；不得用临时草稿替换。

版本：0.3.2（versionCode 8）｜APK SHA-256：`ceea17ffc2bd51777bcb7223572470affacf803b9183d53e0e2a7afc37243622`。
