# ALW-001 · 腾讯云实时英文 ASR 服务端桥接

位置：`android-poc/asr-bridge/`。独立 Node 项目，不修改 Android PoC 源码、项目根 `server.mjs` / `public/`、`docs/` 或任何正式稿件。

**当前状态（2026-10-31）**

- 已实测：48k/44.1k → 16k 带限重采样、抗混叠、立体声分轨、等权混音、v2 签名算法自洽、无密钥报错、mock WebSocket 端到端。
- 已实测 Android 真机联调（MOCK）：Redmi Note 12T Pro 与 Note 11 5G 通过 `adb reverse tcp:8790` 连接本桥接，`mix` 路由 48k/2ch 正常出事件并干净结束（约 49.8 s / 29 事件；约 32.2 s / 4 事件）。
- 已实测 V1.4 + 海南 115 内容检索与英文建议；Note 11 上 0.3.1 真机从 V1.4 返回 P002 的 question/share 两条建议。
- **未验证：真实腾讯云连通、真实英文转写、真实说话人分离、计费/并发、v3 接口、真分轨 A/B（当前博雅接收器实测为 MONO_MIX）。** 本机没有 SecretId/SecretKey，不能声称云端已跑通。
- 无密钥时服务端自动进入 **MOCK 模式**；每条事件都带 `mock: true`，文本以 `[mock]` 开头，日志也会打印 `MOCK MODE`。mock 不是 ASR，只按音频能量分段。

---

## 1. 快速开始

要求：Node.js ≥ 22.9（`--env-file-if-exists`；本机实测 v24.19.0）。

```sh
cd android-poc/asr-bridge
npm install
cp .env.example .env     # 所有值先留空 -> mock
npm test                 # 34 个测试
npm start                # 默认 ws://127.0.0.1:8790/asr
```

> 端口用 8790 是为了避开本机 Docker 容器 `keep-fitness` 占用的 8787。手机联调：`adb reverse tcp:8790 tcp:8790`，App 默认地址即 `ws://127.0.0.1:8790/asr`。

另开终端检查：

```sh
curl -s http://127.0.0.1:8790/health
# {"ok":true,"mode":"mock","mock":true,...}
```

强制 mock（即使填了密钥）：

```sh
npm run start:mock
# 或 ASR_FORCE_MOCK=1 npm start
```

---

## 2. WebSocket 协议

### 2.1 连接

```
ws://<host>:<port>/asr?track=A|B|mix&rate=48000&channels=2
```

| 参数 | 必填 | 取值 | 说明 |
| --- | --- | --- | --- |
| `track` | 否 | `A` / `B` / `mix` | 默认 `mix`。A=左声道，B=右声道（与 Android PoC 的 A_LEFT/B_RIGHT 假设一致） |
| `rate` | 否 | `16000` / `44100` / `48000` | 输入原始采样率，默认 `48000` |
| `channels` | 否 | `1` / `2` | 默认 `1`；手机发立体声时必须显式传 `2` |

### 2.2 手机 → 服务端

- 二进制帧：PCM16 little-endian，单声道或 L/R 交织立体声。
- 文本帧：`{"type":"end"}` 表示本次音频结束；`{"type":"ping"}` 可探活。
- 服务端会缓存跨帧的不完整采样帧，按 `2*channels` 字节对齐后再处理。
- 服务端负责拆分/混音、重采样到 16k、按 200ms 分片送腾讯云。
- 手机绝不发送 SecretId/SecretKey。

### 2.3 服务端 → 手机

每条消息是一个 JSON 文本事件，至少包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `interim` / `final` / `error` / `session` | 事件类型 |
| `track` | `A` / `B` / `mix` | 本次连接的路由 |
| `text` | string | 英文原文；mock 为 `[mock] speech detected N ms`；error 为错误说明 |
| `startMs` | number | 相对本次会话的起始毫秒 |
| `endMs` | number | 相对本次会话的结束毫秒 |
| `speaker` | `A` / `B` / `spk_0`… / `unknown` | 双轨由通道决定；混音由说话人分离给出 |
| `confidence` | 0..1 或 `null` | 腾讯云 v2 文档没有返回置信度，真实模式固定 `null`，不伪造 |
| `final` | boolean | 是否为稳态/结束 |
| `mock` | boolean | **true 表示本地模拟，不是真实 ASR** |

附加字段：`sessionId`、`engine`、`provider`、`status`、`inputRate`、`channels`、`outputRate`、`index`。

mock 事件示例（实测形状）：

```json
{
  "type": "final",
  "track": "A",
  "text": "[mock] speech detected 800 ms",
  "startMs": 200,
  "endMs": 1000,
  "speaker": "A",
  "confidence": null,
  "final": true,
  "mock": true,
  "engine": "mock",
  "provider": "mock",
  "sessionId": "...",
  "inputRate": 48000,
  "channels": 2,
  "outputRate": 16000
}
```

真实模式事件形状（**结构示意，非实测输出**；`text` 为腾讯云返回的英文原文，不做润色）：

```json
{
  "type": "final",
  "track": "mix",
  "text": "<Tencent ASR original English text>",
  "startMs": 1200,
  "endMs": 2850,
  "speaker": "spk_0",
  "confidence": null,
  "final": true,
  "mock": false,
  "engine": "16k_zh_en_speaker_2.0",
  "provider": "tencent",
  "sessionId": "..."
}
```

### 2.4 会话生命周期

1. 连接建立后服务端发 `session`（mock: `status=ready`；真实: 先 `connecting`，上游握手成功后再发 `ready`）。
2. 音频过程中发 `interim` / `final`。
3. 手机发 `{"type":"end"}`，服务端 flush 重采样器、结束上游，发 `session`（`status=ended`，`final=true`），随后关闭连接。
4. 上游或参数错误发 `error`，再发 `session`（`status=error`），关闭连接。

---

## 3. 双轨 vs 混音：怎么选

| | 双轨 A/B | 混音 mix |
| --- | --- | --- |
| 连接数 | 2 条（`track=A`、`track=B`） | 1 条 |
| 腾讯云引擎 | `16k_en`（英语通用） | `16k_zh_en_speaker_2.0`（中英粤+方言，默认开启说话人分离） |
| speaker 来源 | 物理通道：A=左、B=右 | 声纹聚类：`spk_0`…`spk_9`，起始可能是 `unknown` |
| 优点 | 两人同时说话也不会混淆身份；英文引擎更专一 | 只占 1 路并发；不依赖硬件真分轨 |
| 缺点 | 占 2 路并发/费用；必须先证明接收器是真分轨；串音会直接污染身份 | 重叠说话、音色相近时分离不稳；`spk_N` 需要人工映射到 A/B |
| 适用 | Android PoC 已确认 A 只在左、B 只在右，且交叉串音低 | 当前默认；Android PoC 尚未真机验证分轨 |

**当前结论：固定先用 `mix`。** 2026-10-31 在红米 Note 12T Pro + BOYA mini 上实测为 `MONO_MIX`：48k/2ch、`UNPROCESSED`、USB 路由已核对，但左右轨最大只差 1–6 个 LSB，A/B 两个发射器被合并。只有用 BOYA Central App 把接收器切到「立体声」并重新验证出相反声道优势后，才切双轨；如果手机端已经自己拆成两路单声道，则用两条 `channels=1` 的连接直接透传。

> 手机发立体声时，`track=A` 和 `track=B` 两条连接可以发送同一份交织 PCM，服务端各自只取自己的声道；也可以手机先拆分，发 `channels=1` 的单声道。两种都支持。

---

## 4. 腾讯云官方事实与出处

以下以 2026-10-31 查阅到的官方文档为准：

1. **实时语音识别（WebSocket）v2**
   <https://cloud.tencent.com/document/product/1093/48982>
   页面最后更新 2026-10-29。确认：
   - 地址：`wss://asr.cloud.tencent.com/asr/v2/<appid>?{请求参数}`
   - 鉴权：**HMAC-SHA1**。除 `signature` 外的参数按字典序排序，拼成 `host + path + ? + key=value&...`，用 SecretKey 做 HMAC-SHA1 后 Base64；最终 URL 的 key/value/signature 都要 URL 编码。**不是 TC3-HMAC-SHA256。**
   - 音频：16k/8k、16bit、mono；`voice_format=1` 为 PCM。
   - 标准结果字段：`result.slice_type`（0 开始/1 非稳态/2 稳态）、`result.start_time`、`result.end_time`、`result.voice_text_str`；结束消息 `final=1`。
   - 标准引擎列表包含 **`16k_en`（英语通用）**。
   - **文档没有 `confidence` 字段。**

2. **实时语音识别 V2（WebSocket，说话人分离）**
   <https://cloud.tencent.com/document/api/1093/131127>
   页面最后更新 2026-09-04。确认：
   - 同一 v2 地址与 HMAC-SHA1 签名。
   - 说话人分离引擎：**`16k_zh_en_speaker_2.0`**（中英粤 + 30 种方言大模型，支持英语）；文档明确“仅 16k zh en speaker 2.0 支持话者分离，默认开启话者分离”。
   - 结果字段：`sentences.sentence`、`sentences.sentence_type`（0 不确定 / 1 确定）、`sentences.sentence_id`、`sentences.speaker_id`（-1 未确定，0–9 有效）、`start_time`、`end_time`。
   - **没有英语专用说话人分离引擎**；纯英文混音也只能用这个中英引擎。
   - 该引擎属于“大模型 2.0 版”，计费方案与 1.0 不同，开通前以控制台/计费文档为准。

3. **版本提示**
   <https://cloud.tencent.com/document/product/647/131297> 页面提示 “v3”，但经页面核对，它实际描述的是 **TRTC 的另一条接入**（`wss://asr.cloud-rtc.com/asr/v2/<appid>`，鉴权走 TRTC SdkAppId/UserSig），不是 ASR 产品的 v3。官方 ASR 文档目前仍为 `wss://asr.cloud.tencent.com/asr/v2/<appid>`。本模块按 **ASR v2** 实现；新账号以控制台实际给出的接口为准，不要把 TRTC 接入与本模块混用。

4. **密钥/开通入口**
   - 语音识别控制台：<https://console.cloud.tencent.com/asr>
   - API 密钥管理：<https://console.cloud.tencent.com/cam/capi>
   - 需要：开通语音识别服务，创建 `AppID`、`SecretId`、`SecretKey`，确认余额/免费额度与并发。

### 4.1 签名实现位置

- `src/tencent-sign.js`：`buildSignatureString()`、`signAsrParams()`、`createSignedUrl()`。
- 固定测试向量（测试中硬编码）：
  - `appId=1250000000`、`secretId=FAKE_SECRET_ID_FOR_TESTS_ONLY_0001`、`secretKey=FAKE_SECRET_KEY_FOR_TESTS_ONLY_0001`
  - `engine_model_type=16k_en`、`timestamp=1760000000`、`expired=1760003600`、`nonce=123456789`
  - `voice_id=0123456789abcdef0123456789abcdef`
  - 签名原文：`asr.cloud.tencent.com/asr/v2/1250000000?engine_model_type=16k_en&expired=1760003600&needvad=1&nonce=123456789&secretid=FAKE_SECRET_ID_FOR_TESTS_ONLY_0001&timestamp=1760000000&voice_format=1&voice_id=0123456789abcdef0123456789abcdef`
  - 签名：`HZrxoXRgluRnlcKfsWDUDvEw5xk=`

---

## 5. 配置

复制 `.env.example` 为 `.env`。`.env.example` 所有值留空。

| 变量 | 留空时 | 说明 |
| --- | --- | --- |
| `TENCENT_APP_ID` | mock | 腾讯云 AppID（数字） |
| `TENCENT_SECRET_ID` | mock | SecretId |
| `TENCENT_SECRET_KEY` | mock | SecretKey |
| `TENCENT_ENGINE_EN` | `16k_en` | 双轨英文引擎 |
| `TENCENT_ENGINE_SPEAKER` | `16k_zh_en_speaker_2.0` | 混音说话人分离引擎 |
| `HOST` | `127.0.0.1` | 监听地址；手机走局域网时设 `0.0.0.0` |
| `PORT` | `8790` | 端口 |
| `ASR_FORCE_MOCK` | 不强制 | 设 `1` 时强制 mock |

**部分填写会启动失败**，不会静默降级；三项全空才进入 mock。真实密钥只存在于服务端进程环境，不写入事件、日志或手机。

---

## 6. 已验证 / 未验证边界

### 已实际运行（`npm test`，34/34 通过）

- `48k → 16k`：1kHz 正弦输出 16000 采样/秒，过零率约 1kHz，Goertzel 幅度误差 < 0.01，RMS 比例约 1。
- `44.1k → 16k`：输出长度/频率/幅度正确。
- 抗混叠：48k 的 10kHz 正弦经重采样后 RMS < 0.02；对照“每 3 点丢 2 点”仍 > 0.3，证明不是简单丢点。
- 流式重采样：137 样本任意分块与一次性输出 RMS 差 < 1e-4（实测约 1.1e-5）。
- 分轨：L=440Hz、R=880Hz 拆分后本轨幅度 > 0.48，交叉频率 < 0.01。
- 混音：L/R 等权平均后 440/880Hz 都保留；满幅同相不削波。
- 签名：固定向量 `HZrxoXRgluRnlcKfsWDUDvEw5xk=`，独立 `crypto` 复算一致；URL 编码正确。
- 无密钥：`TencentRealtimeSession` 与部分凭证启动都抛明确 `AsrConfigError`。
- mock 端到端：随机端口启动服务，Node WebSocket 客户端发 48k 立体声，收到 `mock:true` 的 `session/interim/final`；A 轨只认左声道，mix 轨 speaker=`spk_0`；测试后服务关闭。
- 客户端事件映射（**本地假上游，不连腾讯云**）：A 轨标准结果映射为 interim/final、speaker=A、mock=false；mix 轨 `speaker_id=-1` 映射 `unknown`、`speaker_id=0` 映射 `spk_0`；验证签名 URL 中的引擎与 `secretid` 参数、`{"type":"end"}` 后 `final=1` 收尾。
- Android 真机 → 本桥接（MOCK，`adb reverse tcp:8790`）：
  - Note 12T Pro（Android 15）：`mix`、48k/2ch、inputBytes 4,776,960、29 事件、`ended`、close 1000。
  - Note 11 5G（Android 11）：`mix`、48k/2ch、inputBytes 3,091,200、4 事件、`ended`、close 1000。

### 未验证（不要越级声称）

- 真实腾讯云 WebSocket 握手、鉴权、转写、时间戳、说话人分离准确率。
- 真实密钥、服务开通、余额/免费额度、并发限制、大模型 2.0 计费。
- `confidence`：官方 v2 不返回，本模块固定 `null`；没有“真实置信度”可展示。
- v3 新版接口未实现。
- 真分轨 A/B 的端到端：当前 BOYA mini 实测为 `MONO_MIX`，双轨只在单测与协议层验证；真机只跑通 `mix`。
- 真实英文识别效果、噪声/口音/重叠说话表现。

---

## 6.1 内容检索与英文建议（不依赖大模型）

- 语料：
  - V1.4 正式主稿：`docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`，解析 51 个软件条目。
  - 海南 115 地点：`docs/成果整理/Hainan-Travel-Guide/dist/Hainan_115_Real_Photo_Guide/places.json`，115/115。
  - 个人故事：`content/personal-stories.json`，只加载 `confirmed:true` 且含英文的条目；当前为空，不编造。
  - 绝不读取 `temp/intros-A～I`；测试断言来源路径与文本都不含该字符串。
- 检索：中英文混合分词 + BM25；精确标题/名称优先；建议按主导领域收敛（例如 software 查询不会漂移到海南酒吧）。
- 建议：`question` 为固定英文模板，`share` 逐字引用来源英文；返回 `source/ref/title/basis` 便于追溯。
- API：
  - `GET /suggest?q=personality%20quiz&limit=2`
  - `POST /suggest`，body `{"q":"...","limit":2}`
  - WebSocket：`{"type":"suggest","text":"...","limit":3}` → `{"type":"suggestions", ...}`
  - CLI：`npm run suggest -- "龙兴路" 2`
- 路径可用 `CONTENT_V14_PATH` / `CONTENT_HAINAN_PATH` / `CONTENT_STORIES_PATH` 覆盖。
- 开源仓库不包含 V1.4/海南/个人故事原文；自动测试使用 `test/fixtures/`，生产需在本地提供这些语料。
- 当前限制：没有 LLM 改写，问题模板固定；个人故事为空；真实英文 ASR 未接入密钥。

## 7. 接入 Android（已实现，含真机联调命令）

Android 端已实现（Java-WebSocket，100ms 一帧，48k/2ch 优先，`UNPROCESSED` 优先）：

- 推荐用 `adb reverse`，不依赖局域网/防火墙：
  ```sh
  npm start                                   # 本机 127.0.0.1:8790
  adb -s <serial> reverse tcp:8790 tcp:8790
  # App 默认 ws://127.0.0.1:8790/asr
  ```
- 或同一局域网：`HOST=0.0.0.0 npm start`，App 内把地址改成 `ws://<mac-ip>:8790/asr`。

1. 录音保持 48k 或 44.1k、PCM16、mono 或 stereo。推荐每 20–200ms 发一帧。
3. 双轨：
   - `ws://<mac-ip>:8790/asr?track=A&rate=48000&channels=2`
   - `ws://<mac-ip>:8790/asr?track=B&rate=48000&channels=2`
   - 两条连接可发送同一份立体声交织帧；服务端分别取左/右。
4. 混音：
   - `ws://<mac-ip>:8790/asr?track=mix&rate=48000&channels=2`
   - 服务端做 `0.5*(L+R)`，再走 `16k_zh_en_speaker_2.0` 说话人分离。
5. 结束时发送文本帧 `{"type":"end"}`，等待 `session.status=ended` 后关闭。
6. Android 本地 `ws://` 明文需要 `android:usesCleartextTraffic="true"` 或 network security config；正式环境应改为 `wss://`（TLS 反向代理），并加鉴权。
7. App 中**不要**出现 SecretId/SecretKey；只保存服务端地址。

---

## 8. 安全与边界

- `.env`、`node_modules/`、日志已在 `.gitignore` 中；不要提交密钥。
- 默认只监听 `127.0.0.1`；设 `HOST=0.0.0.0` 后局域网可访问，当前 WebSocket 没有鉴权，只适合本机/可信局域网调试。
- 日志只记录 sessionId、track、采样率、事件数，不记录密钥、URL 签名或音频内容。
- 录音需双方知情同意；不要把私人原文写进公开仓库或公开 PWA。
- 本模块未引入任何软件介绍语料。若后续需要示例语料，唯一正式来源是
  `docs/成果整理/2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md`；
  不使用 `temp/intros-A～I` 临时草稿。

---

## 9. 文件清单

```
asr-bridge/
├── .env.example           # 所有值留空
├── .gitignore
├── package.json           # ws 依赖；npm start / npm test
├── package-lock.json
├── README.md
├── bin/asr-bridge.js      # CLI 入口
├── src/
│   ├── resample.js        # 流式窗函数 sinc 重采样、PCM16 转换
│   ├── split.js           # 立体声拆分、等权混音、track 提取
│   ├── tencent-sign.js    # v2 HMAC-SHA1 签名 / URL
│   ├── tencent-asr-client.js # 腾讯云 WebSocket 客户端与事件映射
│   ├── mock-asr.js        # 本地能量分段模拟器（mock:true）
│   ├── protocol.js        # 统一事件字段
│   └── server.js          # 8790 WebSocket 服务、/health
├── test/
│   ├── resample.test.js
│   ├── split.test.js
│   ├── sign.test.js
│   ├── client.test.js     # 本地假上游，不连腾讯云
│   └── server.test.js
└── test-support/helpers.js
```

## 10. 唯一需要用户做的事

1. 在腾讯云开通“语音识别”服务，创建 API 密钥（AppID / SecretId / SecretKey）。
2. 把三项填入 `asr-bridge/.env`，重启 `npm start`。
3. 用一段已获同意的英文录音做一次真实连通与转写复验；确认计费/并发/引擎可用性。
4. 若控制台只给 v3 新版接口，需要另开适配任务；本模块的 v2 路径不会自动升级。
