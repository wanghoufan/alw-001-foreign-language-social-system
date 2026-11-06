# ALW-001 云端薄网关（V1.7 R2 C4）

一个可本地运行、可水平扩容的 Node 薄网关：手机在 4G/5G 下通过它调用 DeepSeek 翻译/草稿、
豆包 TTS 与腾讯云实时 ASR。它不持有学习数据、不落盘原文、不管理 Mac 进程，也不复制
P066 管理后台。

## 一、边界

只做四件事：

1. 设备授权：服务端持厂商 Key，设备只拿短期可撤销令牌；
2. 跨实例状态：预算、令牌撤销、幂等键、限流、ASR 会话占用全部持久化；
3. 厂商协议适配：DeepSeek / 豆包 TTS / 腾讯 ASR（或 P066 中继）；
4. 明确拒绝：未授权 401、无权限/未同意 403、预算不足 402、超速率 429。

明确不做：

- 不照搬 Mac 进程管理、LAN 探测、长时间文件锁、P066 管理后台；
- 不用内存 Map 做金额硬闸；
- 不把 `.env`、密钥、设备指纹原文、学习文本原文写进数据库或日志；
- 不做音频缓存落盘、不做 ASR 重采样、不做学习资料库检索（资料库仍在 Mac/手机侧）。

## 二、架构

```
手机 App
  │  设备令牌 + 设备指纹
  ▼
┌──────────────────────────────────────────────────────┐
│ cloud-gateway（无状态 HTTP + WS）                     │
│  auth.mjs        令牌签发 / 校验 / 撤销              │
│  budget.mjs      预留 → 提交 / 回滚（微元整数）       │
│  state-store      SQLite（默认）/ Redis（可选）       │
│  ai-deepseek     translate / draft-en / analyze      │
│  tts-doubao      逐行 JSON 拼 base64 音频            │
│  asr-relay       逐帧中继 + 300s 上限 + 断线回收      │
└──────────────────────────────────────────────────────┘
  │            │                  │
  ▼            ▼                  ▼
DeepSeek     豆包 TTS        腾讯 ASR / P066
```

状态存储接口是异步的，SQLite 与 Redis 共用同一套方法；金额扣减由 SQLite
`BEGIN IMMEDIATE` 或 Redis Lua 脚本保证原子，测试会用 4 个真实子进程并发扣减验证不超限。

## 三、目录

```
cloud-gateway/
├── package.json
├── .env.example
├── .gitignore
├── README.md
├── src/
│   ├── server.mjs             HTTP 入口与路由
│   ├── state-store.mjs        SQLite 原子状态存储
│   ├── state-store-redis.mjs  Redis 可选适配器（本机未实测）
│   ├── auth.mjs               令牌签发 / 校验 / 撤销
│   ├── budget.mjs             预算预留 / 提交 / 回滚
│   ├── ai-deepseek.mjs        DeepSeek 三件套
│   ├── tts-doubao.mjs         豆包语音合成 2.0
│   ├── asr-relay.mjs          ASR WebSocket 中继
│   ├── tencent-sign.mjs       腾讯 ASR 签名 URL
│   └── errors.mjs             统一错误
└── test/
    ├── auth.test.mjs
    ├── budget.test.mjs
    ├── ai.test.mjs
    ├── tts.test.mjs
    ├── asr.test.mjs
    ├── server.test.mjs
    ├── helpers.mjs
    └── fixtures/reserve-worker.mjs
```

## 四、端点表

除 `/health`、`/auth/*` 外，所有请求都需要：

- `Authorization: Bearer <设备令牌>`；
- `x-device-fingerprint: <设备指纹>`（签发令牌时绑定的同一指纹）。

| 方法 | 路径 | 说明 | 需要的 scope |
| --- | --- | --- | --- |
| GET | `/health` | 健康与配置探测（不返回密钥） | 无 |
| POST | `/auth/token` | 管理令牌签发设备短期令牌 | `x-admin-token` |
| POST | `/auth/revoke` | 撤销令牌（管理令牌或设备本人） | 管理令牌 / 设备令牌 |
| GET | `/v1/status` | 预算、限流、ASR 状态 | `status` |
| POST | `/v1/ai/translate` | 单句翻译（≤700 字） | `ai` |
| POST | `/v1/ai/draft-en` | 中文 → 英文草稿（≤1200 字） | `ai` |
| POST | `/v1/ai/analyze` | 对话接话分析（1–12 句，每句 ≤700 字） | `ai` |
| GET | `/v1/tts/voices` | 豆包 2.0 音色清单 | `tts` |
| POST | `/v1/tts/synthesize` | 豆包 TTS（≤2000 字符） | `tts` |
| GET | `/v1/asr/status` | ASR 中继状态 | `asr` |
| WS | `/v1/asr/stream` | 腾讯 / P066 实时 ASR 中继 | `asr` |

### 错误码

| HTTP | 典型 code | 含义 |
| --- | --- | --- |
| 400 | `INVALID_INPUT` / `TEXT_TOO_LARGE` / `INVALID_RATE` | 参数或长度不合法 |
| 401 | `TOKEN_REQUIRED` / `TOKEN_BAD_SIGNATURE` / `TOKEN_REVOKED` / `TOKEN_EXPIRED` | 令牌缺失、伪造、撤销或过期 |
| 402 | `BUDGET_ZERO` / `BUDGET_EXHAUSTED` | 预算为 0 或余额不足，账本不会变动 |
| 403 | `CONSENT_REQUIRED` / `SCOPE_FORBIDDEN` / `DEVICE_MISMATCH` / `PRIVACY_PROFILE_FIELD` | 未同意、无 scope、设备不匹配、携带人物档案字段 |
| 409 | `IDEMPOTENCY_CONFLICT` / `IDEMPOTENCY_IN_PROGRESS` | 同一幂等键请求体不同或仍在处理 |
| 429 | `RATE_LIMITED` / `SESSION_LIMIT` | 超速率或单设备并发会话上限 |
| 501 | `PROVIDER_NOT_CONFIGURED` | 服务端缺少厂商密钥 |
| 502/503/504 | `PROVIDER_AUTH` / `PROVIDER_LIMIT` / `PROVIDER_TIMEOUT` | 上游鉴权、限流、超时 |

## 五、本地启动

要求 Node.js ≥ 24（使用内置 `node:sqlite`）。唯一必需第三方依赖是 `ws`
（Node 内置只有 WebSocket 客户端，没有 WebSocket 服务端；`ws` 用于 ASR 中继）。

```bash
cd cloud-gateway
npm install
cp .env.example .env          # 填写变量，不要提交
node --env-file=.env src/server.mjs
```

看到以下输出即启动成功：

```text
[cloud-gateway] listening on http://127.0.0.1:8783
[cloud-gateway] state driver=sqlite version=1.7.0-r2-c4.0
[cloud-gateway] deepseek=true doubao=true asr=true(tencent)
```

健康检查：

```bash
curl http://127.0.0.1:8783/health
```

## 六、设备授权流程

1. 手机生成设备指纹（例如随机安装 ID 的哈希），随请求头发送；
2. 管理员用 `CLOUD_GATEWAY_ADMIN_TOKEN` 签发短期令牌；
3. 令牌只返回一次，服务端只存它的 sha256；
4. 设备用令牌 + 指纹调用能力端点；
5. 遗失或换机时调用 `/auth/revoke`，令牌立即失效。

```bash
curl -X POST http://127.0.0.1:8783/auth/token \
  -H "x-admin-token: $CLOUD_GATEWAY_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"phone-001","fingerprint":"<设备指纹>","scopes":["ai","tts","asr","status"],"ttlSeconds":3600}'
```

默认 TTL 1 小时，最长 7 天；`scopes` 只能是 `ai` / `tts` / `asr` / `status`。

## 七、请求协议

### AI 翻译 / 草稿

```json
POST /v1/ai/translate
{"text": "Hello, nice to meet you.", "consent": true}
```

```json
POST /v1/ai/draft-en
{"text": "今天天气不错，我们去海边走走吧。", "consent": true}
```

### 对话分析

```json
POST /v1/ai/analyze
{"messages": [{"speaker": "friend", "text": "Hello!"}], "consent": true}
```

`consent` 必须是布尔 `true`；缺失或为 `false` 一律 403，不发起任何外部请求。

### TTS

```json
POST /v1/tts/synthesize
Idempotency-Key: 8–128 位字母数字或 . _ : -
{"text": "Hello.", "voiceId": "en_male_tim_uranus_bigtts", "rate": 1, "consent": true}
```

响应包含音频字节（base64）、`mimeType`、`audioSha256`、`textSha256`、`usage` 与账单；
不包含原文，也不落盘。相同 `Idempotency-Key` 的重复请求返回 `replayed: true`，
不会重复合成或重复扣费。

### ASR WebSocket

```text
wss://<网关>/v1/asr/stream?track=mix&token=<设备令牌>&fp=<设备指纹>
```

浏览器 WebSocket 不能自定义请求头，因此允许用 query 传 `token` 与 `fp`；原生客户端
优先用 `Authorization` 与 `x-device-fingerprint`。query 中的令牌不会写入日志。

- 客户端 → 网关：二进制帧必须是 **16kHz / PCM16LE / 单声道**；文本帧 `{"type":"end"}` 结束。
- 网关 → 客户端：
  - `{"type":"session","status":"connecting|ready|ended","sessionId":"…"}`
  - `{"type":"interim","text":"…","final":false}`
  - `{"type":"final","text":"…","final":true}`
  - `{"type":"error","code":"ASR_SESSION_LIMIT","message":"…"}`
- 逐帧转发：网关不拆分、不拼包、不重采样；
- partial 不入库；同一会话内重复 final 按 index（或时间区间）去重；
- 默认 300 秒上限（`CLOUD_ASR_MAX_SESSION_SECONDS`），到点自动结束并回收；
- 任一端断开都会关闭另一端、释放会话占用、结算预算。

## 八、状态与预算

- 金额单位是「微元」（1 元 = 1,000,000 微元），不使用浮点数扣减；
- 每次付费请求先按最坏成本预留，成功后按真实用量提交，失败回滚；
- 预算默认 0：`CLOUD_DEEPSEEK_BUDGET_CNY`、`CLOUD_TTS_BUDGET_CNY`、`CLOUD_ASR_BUDGET_CNY`
  不填时，对应付费请求直接 402；
- SQLite 用 `BEGIN IMMEDIATE` 保证跨连接/跨进程原子；测试用 4 个真实子进程并发扣减；
- 生产可切换 Redis：`CLOUD_STATE_DRIVER=redis` + `CLOUD_REDIS_URL` + `npm install redis`；
  金额操作由 Lua 脚本原子执行。本机没有 Redis 服务，因此该路径 **NOT_RUN**。

幂等记录存 `idempotency` 表（SQLite）或带 `PEXPIRE` 的 Redis key，默认保留 24 小时。

## 九、环境变量表

只列变量名与含义，不含任何值；模板见 `.env.example`。

| 变量 | 含义 |
| --- | --- |
| `PORT` / `HOST` | HTTP 监听端口与地址，默认 `8783` / `127.0.0.1` |
| `CLOUD_STATE_DRIVER` | `sqlite`（默认）或 `redis` |
| `CLOUD_STATE_DB` | SQLite 文件路径 |
| `CLOUD_REDIS_URL` | Redis 连接串 |
| `CLOUD_GATEWAY_TOKEN_SECRET` | 令牌签名主密钥，≥32 字符；未配置拒绝启动 |
| `CLOUD_GATEWAY_ADMIN_TOKEN` | 管理令牌，仅用于签发/撤销设备令牌 |
| `CLOUD_RATE_LIMIT_PER_WINDOW` | 每设备每窗口允许的请求数 |
| `CLOUD_RATE_WINDOW_MS` | 限流窗口毫秒数 |
| `CLOUD_IDEMPOTENCY_TTL_MS` | 幂等记录保留时长 |
| `CLOUD_TTS_REQUIRE_CONSENT` | TTS 是否强制显式同意，默认 `true` |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥（只在服务端） |
| `DEEPSEEK_MODEL` / `DEEPSEEK_ENDPOINT` | 模型名与接口地址 |
| `CLOUD_DEEPSEEK_BUDGET_CNY` | DeepSeek 总预算（元），默认 0 |
| `DEEPSEEK_INPUT_PRICE_CNY_PER_MILLION` | 输入 token 单价（元/百万），保守占位 |
| `DEEPSEEK_OUTPUT_PRICE_CNY_PER_MILLION` | 输出 token 单价（元/百万），保守占位 |
| `SM_DOUBAO_API_KEY` | 豆包语音密钥（兼容 `DOUBAO_API_KEY`） |
| `SM_DOUBAO_ENDPOINT` / `SM_DOUBAO_RESOURCE_ID` | 豆包接口与资源 ID |
| `CLOUD_TTS_BUDGET_CNY` | 豆包 TTS 预算（元），默认 0 |
| `DOUBAO_PRICE_CNY_PER_1000_CHARS` | 豆包单价（元/千字符），保守占位 |
| `CLOUD_ASR_UPSTREAM` | `tencent` 直连或 `p066` 中继 |
| `TENCENT_APP_ID` / `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` | 腾讯云 ASR 凭证 |
| `TENCENT_ENGINE_EN` / `TENCENT_ENGINE_SPEAKER` | 英语 / 中英混引擎 |
| `CLOUD_ASR_P066_URL` / `CLOUD_ASR_P066_TOKEN` / `CLOUD_ASR_P066_ENGINE` | P066 中继配置 |
| `CLOUD_ASR_BUDGET_CNY` | ASR 预算（元），默认 0；P066 未单独配置时回退到它 |
| `CLOUD_ASR_P066_BUDGET_CNY` | P066 独立预算（元），默认回退到 `CLOUD_ASR_BUDGET_CNY` |
| `TENCENT_ASR_PRICE_CNY_PER_HOUR` | ASR 单价（元/小时），保守占位 |
| `CLOUD_ASR_MAX_SESSION_SECONDS` | 单次 ASR 会话上限，默认 300 |
| `CLOUD_ASR_MAX_CONCURRENT_PER_DEVICE` | 单设备并发 ASR 会话上限，默认 2 |

所有 `*_PRICE_*` 都是保守占位，**部署前必须由用户对照厂商官方价格核对**。

## 十、与 Mac 网关的差异

| 维度 | Mac 网关 | 本薄网关 |
| --- | --- | --- |
| 状态 | 单机文件账本 + 进程锁 | SQLite / Redis，跨实例原子 |
| 授权 | 局域网内网信任 + 归档令牌 | 设备短期令牌 + 设备指纹绑定 |
| 进程管理 | 有（PID、LAN 探测、管理后台） | 无 |
| ASR | 内置重采样、Mock 回退 | 逐帧转发，要求客户端 16k PCM16 mono，不静默降级 |
| TTS | 音频缓存落盘、按 provider 账本 | 不落盘，直接返回字节；幂等键去重 |
| AI analyze | 带本地资料库检索与引用 | 只做模型接话，不含资料库 |
| 预算 | 单机文件账本 | 预留/提交/回滚 + 跨实例硬闸 |

## 十一、部署前必须由用户授权的事项

1. 批准使用 DeepSeek、豆包、腾讯云 ASR（或 P066）账号，并确认各自的服务条款与数据处理区域；
2. 批准并填写三项预算 `CLOUD_DEEPSEEK_BUDGET_CNY` / `CLOUD_TTS_BUDGET_CNY` / `CLOUD_ASR_BUDGET_CNY`
   （当前默认 0，不填写则全部付费请求 402）；
3. 批准生成并自行保管 `CLOUD_GATEWAY_TOKEN_SECRET` 与 `CLOUD_GATEWAY_ADMIN_TOKEN`；
4. 确认文本外发给 DeepSeek / 豆包、音频外发给腾讯 / P066 的合规边界；
5. 确认部署平台、域名、TLS 证书、反向代理与访问来源限制；
6. 确认是否启用 Redis，以及 Redis 的访问控制与备份策略；
7. 确认设备令牌 TTL、撤销流程与设备指纹的生成方式；
8. 确认日志保留、监控告警与费用告警策略（本实现不记录原文与密钥）；
9. 确认 ASR 单次上限、并发上限与腾讯云计费方式；
10. 确认手机端在 4G/5G 下的真实网络验收计划。

未完成上述授权前，不应部署到公网，也不应把预算改成大于 0。

## 十二、测试

```bash
cd cloud-gateway
node --test test/*.test.mjs
```

测试不发起任何真实付费请求，全部使用可注入 fake：

- 401 / 403 / 402 / 429 全覆盖；
- 预算：SQLite 事务语义 + 4 个真实子进程并发扣减不超限；
- 令牌：签发、撤销、过期、设备指纹不匹配、scope 不足；
- AI：700 字上限、consent、上游错误映射、超时 504；
- TTS：2000 字符上限、逐行 JSON 拼接、幂等只合成/扣费一次、不落盘原文；
- ASR：握手 401/403/402、逐帧转发、partial/final 标记、重复 final 去重、
  短上限自动结束、断线回收。

当前实测：**33 个用例全部通过**。

## 十三、未验证项（NOT_RUN）

以下路径需要真实密钥、真实服务或真实网络，本机未执行：

1. DeepSeek 真实 API 调用（测试使用 fake fetch）；
2. 豆包 TTS 真实合成与音色可用性（测试使用 fake 逐行 JSON）；
3. 腾讯云 ASR 真实签名握手与识别结果（未使用真实凭证）；
4. P066 真实中继（测试使用本地 fake WebSocket 上游）；
5. Redis 适配器：代码已实现并通过语法检查，但本机无 Redis 服务，未实测；
6. TLS / 反向代理 / 云负载均衡下的限流与真实 4G/5G 网络；
7. 厂商官方价格与预算单价的一致性（当前为保守占位）。

## 十四、安全说明

- 密钥只从环境变量读取，不写入响应、日志、数据库或 Git；
- 数据库只存令牌哈希、设备指纹哈希、预算计数、幂等响应（音频与 sha），不存原文；
- 日志只记录方法、路径、状态码与错误码，不记录请求体、令牌或上游原始响应；
- 所有付费能力默认预算 0，必须由用户显式填写预算后才可能产生费用；
- 不提供 `.env`、`*.db`、`.local/` 的版本控制入口（见 `.gitignore`）。