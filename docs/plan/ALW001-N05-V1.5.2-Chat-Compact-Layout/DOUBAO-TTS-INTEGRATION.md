# 豆包语音合成 2.0（Seed-TTS 2.0）接入说明

调研日期 2026-11-05，来源为官方公开文档：[双向流式 WS](https://www.volcengine.com/docs/6561/1329505)、[单向流式 HTTP](https://www.volcengine.com/docs/6561/1598757)、[单向流式 WS](https://www.volcengine.com/docs/6561/1719100)、[音色列表](https://www.volcengine.com/docs/6561/1257544)、[计费说明](https://www.volcengine.com/docs/6561/1359370)、[旧版鉴权示例](https://www.volcengine.com/docs/6561/2534847)。

账号状态：控制台已登录，AppID=9886928140，projectName=default；**Access Token 仍需从控制台复制，本轮未读取**。

## 1. 接口

| 协议 | Endpoint | 适用 |
|---|---|---|
| HTTP Chunked（推荐朗读） | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` | 一次发全文、流式返回 base64 音频 |
| HTTP SSE | `https://openspeech.bytedance.com/api/v3/tts/unidirectional/sse` | 同上，SSE 传输 |
| WebSocket 单向 | `wss://openspeech.bytedance.com/api/v3/tts/unidirectional/stream` | 一次发全文、流式返回 |
| WebSocket 双向 | `wss://openspeech.bytedance.com/api/v3/tts/bidirection` | 文本边发边收，交互场景 |
| HTTP 同步（非流式） | 文档树有此条目（DocumentID 2550870） | 正文未渲染，**未核实**，本轮不接 |

请求头（旧版控制台，本账号属此形态）：

| Header | 必填 | 值 |
|---|---|---|
| `X-Api-App-Id` | 是 | AppID `9886928140` |
| `X-Api-Access-Key` | 是 | 控制台「Access Token」 |
| `X-Api-Resource-Id` | 是 | **`seed-tts-2.0`**（对应“语音合成 2.0 字符版”） |
| `X-Api-Request-Id` | 建议 | 每次随机 UUID |
| `X-Control-Require-Usage-Tokens-Return` | 否 | 传 `*` 时结束帧返回 `usage.text_words` |

新版控制台改用单值 `X-Api-Key`（API Key）+ `X-Api-Resource-Id`，不再用 AppID/Access Token；`volc.service_type.10035` 未出现在 2.0 文档，**不要使用**。

请求体（`speaker` 是音色编码，不是字段名 `voice_type`）：

```json
{"user":{"uid":"alw001"},"req_params":{"text":"红城湖的早晨，风从水面吹过来。",
 "speaker":"zh_female_xiaohe_uranus_bigtts","model":"seed-tts-2.0-standard",
 "audio_params":{"format":"mp3","sample_rate":24000,"speech_rate":0}}}
```

要点：`text` 原样发送、`audio_params` 必填；`format` 取 `mp3|ogg_opus|pcm`（默认 mp3，传 `wav` 不报错但流式会重复 wav header）；采样率默认 24000；`speech_rate` 范围 [-50,100]；2.0 支持 `additions.context_texts`（口语指令、不计费）、`section_id`、`enable_subtitle`，`enable_timestamp` 仅 1.0。

返回：HTTP 为 chunked 逐行 JSON，音频在 `data`（base64），结束帧 `code=20000000`：

```json
{"code":0,"message":"","data":"<base64 音频>"}
{"code":20000000,"message":"ok","data":null,"usage":{"text_words":18}}
```

WebSocket 是自定义二进制协议：4 字节 header + 可选 event + payload；事件 1/2/50/51/52 管连接，100/101/102/150/152/153 管会话，200 发文本，350/351/352 返回句子与音频。首版接入建议只用 HTTP Chunked，省去帧解析。

## 2. 鉴权

| 字段 | 是否必填 | 说明 |
|---|---|---|
| AppID | 必填（旧版） | 请求头 `X-Api-App-Id` |
| Access Token | 必填（旧版） | 请求头 `X-Api-Access-Key`，控制台应用页复制 |
| Resource ID | 必填 | 固定 `seed-tts-2.0` |
| Secret Key / AK / SK | **不需要** | 属 IAM 签名体系，TTS 文档未要求，勿混用 |
| projectName | 不需要进请求 | 仅控制台资源归属 |

密钥纪律：只放 `socialmate-prototype/ai-gateway/.env`（已 gitignore），变量 `SM_DOUBAO_APP_ID`、`SM_DOUBAO_ACCESS_TOKEN`；不写进仓库、文档、日志、错误信息或测试夹具；`.env.example` 只留空值。

## 3. 音色（2.0，均支持“指令遵循”）

| 用途 | 音色名 | speaker 编码 | 语言/风格 |
|---|---|---|---|
| 中文稿件 | 小何 2.0 | `zh_female_xiaohe_uranus_bigtts` | 中文（含 30+ 语种识别），通用清晰 |
| 中文稿件 | 云舟 2.0 | `zh_male_m191_uranus_bigtts` | 中文，通用男声 |
| 中文/教学 | Tina老师 2.0 | `zh_female_yingyujiaoxue_uranus_bigtts` | 教育场景，中英混 |
| 英文句子 | Tim | `en_male_tim_uranus_bigtts` | 美式英语，男声 |
| 英文句子 | Dacey | `en_female_dacey_uranus_bigtts` | 美式英语，女声 |
| 英文备选 | Stokie | `en_female_stokie_uranus_bigtts` | 美式英语，女声 |

官方说明：中文音色也具备英文能力，但英文场景更推荐英文音色；2.0 编码统一以 `_uranus_bigtts` 结尾。

## 4. 计费

- 后付费：**3 元/万字符**；按 UTF-8 字符数计（汉字 1 字符，标点、空格、字母各 1）。
- 资源包（1 年有效）：10 万字 28 元（2.8 元/万字符）、2000 万字 5400 元（2.7）、2 亿字 48000 元（2.4）、20 亿字 420000 元（2.1）。
- 免费额度：官方仅写“创建应用后可享有一定量免费试用额度，需手动到控制台开启”，**具体字符数未核实**，不得按估算值写死。
- 默认并发 5，超出需买并发叠加包（价格未逐项核实）。

## 5. 与现有 TTS 适配层的接入点

`tts-providers.mjs` 是内部协议与注册表；`tts-adapter-polly.mjs` 定义适配器形状（`probe()`、`speak({speak,voiceId,engine,locale})` → `{bytes,mimeType,durationMs,modelVersion,warnings}`）；`tts-cache.mjs` 负责 `audio/wav|audio/mpeg` 缓存与按 provider 独立账本。

1. **新增** `socialmate-prototype/ai-gateway/tts-adapter-doubao.mjs`：`createDoubaoAdapter({fetchImpl,endpoint})`；`probe()` 只查两个环境变量是否存在（不读值、不打印）；`speak()` POST HTTP Chunked，逐行解析并拼接 base64，返回 `mimeType:"audio/mpeg"`、`durationMs:null`、`modelVersion:"doubao-seed-tts-2.0-v1"`、`warnings:["DOUBAO_REAL"]`；异常统一 `502 PROVIDER_ERROR`，不带文本、凭据、logid。
2. **`tts-providers.mjs`**：`VOICES` 加 `doubao` 上述音色；`REGISTRY` 加 `doubao`，字段 `kind:"cloud"`、`requiresConsent:true`、`billingEnabled:true`、`synthesizesOnServer:true`、`ratePer1kCharsCny:0.3`、`keyEnv:"SM_DOUBAO_ACCESS_TOKEN"`；`adapters` 注册 `doubao`。缓存键默认保留 `rate`（`rateAffectsAudio` 不设 false），因为 `speech_rate` 改变音频。
3. **映射**：内部 `rate` 0.5–2.0 → `speech_rate=clamp(round((rate-1)*100),-50,100)`；`locale` 只用于筛音色；`style` 暂留空（后续可映射 `context_texts`）。
4. **`tts-cache.mjs`**：`PROVIDER_LEDGER_LIMITS` 加 `doubao: SM_DOUBAO_BUDGET_CNY`（默认 0，保留 402 闸）；`.mp3` 与 `audio/mpeg` 已支持，扩展名表不用改。
5. **`server.mjs`**：路由可复用，无需新增；但 501 与预算分支写死 `speak.providerId==="aws-polly"`（约 891–980 行），需泛化为按 `policy.kind==="cloud"` / `policy.configured!==true` 判断，`listProviders` 的 `budget` 也要覆盖 `doubao`；**`.env.example`（gateway）** 只加空值 `SM_DOUBAO_APP_ID=`、`SM_DOUBAO_ACCESS_TOKEN=`、`SM_DOUBAO_BUDGET_CNY=0`、`SM_DOUBAO_ENDPOINT=https://openspeech.bytedance.com/api/v3/tts/unidirectional`。

不改：`normalizeSpeakRequest` 校验、`assertPrivacy` 隐私闸、`/v12/api/tts/audio/:audioId` 读取与 sha 校验、前端播放链路。

## 6. 最小验证（中文 + 英文各一条，不打印密钥）

前置：`export SM_DOUBAO_APP_ID=...`、`export SM_DOUBAO_ACCESS_TOKEN=...`（避免值留在 shell 历史）。

```bash
curl -sS -o /tmp/doubao-zh.jsonl -w 'status=%{http_code} bytes=%{size_download} t=%{time_total}\n' \
  -X POST 'https://openspeech.bytedance.com/api/v3/tts/unidirectional' \
  -H "X-Api-App-Id: $SM_DOUBAO_APP_ID" -H "X-Api-Access-Key: $SM_DOUBAO_ACCESS_TOKEN" \
  -H 'X-Api-Resource-Id: seed-tts-2.0' -H "X-Api-Request-Id: $(uuidgen)" \
  -H 'Content-Type: application/json' \
  -d '{"user":{"uid":"alw001"},"req_params":{"text":"红城湖的早晨，风从水面吹过来。","speaker":"zh_female_xiaohe_uranus_bigtts","audio_params":{"format":"mp3","sample_rate":24000}}}'
python3 -c "
import base64,json
b=b''
for l in open('/tmp/doubao-zh.jsonl'):
    o=json.loads(l)
    if o.get('data'): b+=base64.b64decode(o['data'])
open('/tmp/doubao-zh.mp3','wb').write(b); print('audio_bytes',len(b),b[:3].hex())"
```

英文只换 `text` 为 `"Good morning, the lake is quiet today."`、`speaker` 为 `en_male_tim_uranus_bigtts`。

判据：HTTP 200；`audio_bytes` 明显大于 1000；首字节为 `494433`（ID3）或 `fffb/fff3`（MP3 帧）；同输入重复请求字节数相近。失败时只看状态码与官方 `code`，**不打印请求头**。等价 node 逻辑即：`fetch` 同上 headers → 按行 `JSON.parse` → 累加 `Buffer.from(data,"base64")` → 写 `/tmp/` 并打印 `{status, audioBytes, sha256 前 8 位, usage}`。

## 7. 未核实项（不得当作已确认）

- HTTP 同步（非流式）endpoint 与请求结构：文档条目存在，正文未渲染。
- 免费试用额度具体字符数：需登录控制台「开通/试用」确认。
- `projectName=default` 是否影响资源归属与计费口径：官方文档未提及，判断为不进请求；并发叠加包单价与 QPS 具体值：仅见“默认 5 并发”。