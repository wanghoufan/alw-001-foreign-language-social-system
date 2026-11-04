# ALW-001 N05 · Amazon Polly 接入后端证据（2026-11-03）

本轮**只接入适配器与安全闸，绝不调用真实 AWS**（0 次真实云请求、0 元预算、未读取任何凭据内容）。
Android 端按本文件末尾的接口契约实现。

## 结论

| 项目 | 结果 |
|---|---|
| 定向验收 `node socialmate-prototype/ai-gateway/verify-n05-tts-provider.mjs` | **退出码 0** |
| 断言总数 | **30**（基线 14 项语义保留 + Polly 16 项） |
| PASS / FAIL | **30 / 0** |
| 真实云调用 `realCloudCalls` | **0**（https 探针 0、fetch 探针 0、`POLLY_RUNTIME_STATS` 0/0） |
| AWS 凭据 | 无（env 未设、`~/.aws/credentials` 不存在）；仅做存在性探测 |
| `aws-polly` configured | **false**，reason `CREDENTIALS_NOT_FOUND`，region `ap-northeast-1` |
| `aws-polly` 预算 | 独立账本 `TtsCache/ledger/aws-polly.json`，`limitCny=0`、`spentCny=0`、文件未创建 |
| DescribeVoices | 未调用（`SM_POLLY_DESCRIBE` 未设置） |

## 改动文件

| 文件 | 类型 | 内容 |
|---|---|---|
| `socialmate-prototype/ai-gateway/tts-adapter-polly.mjs` | 新建 | `createPollyAdapter({region})`（懒加载 SDK、纯本地 `probe()`、`refreshVoices()` 默认关闭、`speak()` 发 `SynthesizeSpeechCommand`）＋ `createFakePollyAdapter({cache})`（复用本地预置 WAV，providerId=`aws-polly-fake`） |
| `socialmate-prototype/ai-gateway/tts-providers.mjs` | 修改 | 注册 `aws-polly` / `aws-polly-fake`；`publicProvider` 增加 `configured`/`configuredReason`/`engine`/`engines`/`region`/`rateAffectsAudio`；`policyOf` 增加 `configured`/`configuredReason`/`engine`/`region`；缓存键加入 `engine`/`region`，Polly 排除 `rate`；style 非空 → 400 `SSML_NOT_ENABLED`；`/providers` 增加 `providerBudgets` |
| `socialmate-prototype/ai-gateway/tts-cache.mjs` | 修改 | 音频扩展名按 mimeType（`audio/wav`→`.wav`、`audio/mpeg`→`.mp3`），`readEntry`/`readAudio`/`stats` 兼容双扩展名，旧 `.wav` 缓存照常命中；新增 `AWS_POLLY_BUDGET_LIMIT_CNY=0` 与 `providerLedger`/`ensureProviderLedger`/`recordProviderBilling`（0 元时记账直接 402 且不写文件） |
| `socialmate-prototype/ai-gateway/server.mjs` | 修改（仅 TTS 路由段） | `/synthesize` 顺序：参数校验 → 同意闸 403 → `aws-polly` 未配置 501（附 region/reason）→ 计费 402（aws-polly 用独立账本）→ 合成；`/providers` 透出 configured/engine/region/voices |
| `socialmate-prototype/ai-gateway/verify-n05-tts-provider.mjs` | 修改 | 保留 14 项基线语义（provider 集合按新增 provider 调整），新增 16 项 Polly 断言与 https/fetch 出网探针 |
| `socialmate-prototype/ai-gateway/package.json` | 新建 | `private:true`、`type:module`、`@aws-sdk/client-polly@^3.1161.0` |
| `socialmate-prototype/ai-gateway/package-lock.json` | 新建（npm install 生成） | 锁定依赖；`node_modules/` 已在 `.gitignore`，未纳入版本库 |

未触碰：`docs/handoff/HANDOFF.md`、`CHANGELOG.md`、`android-poc/**`、`public/**`、`socialmate-v1.2/**`、`places-115.json`。

## 接口契约（Android 端按此实现）

```
providerId:
  aws-polly       真实云；未配置时 configured=false；requiresConsent=true；billingEnabled=true
  aws-polly-fake  本地预置音频；enabled=true；不联网、不收费、不需要同意

声音（两个 provider 共用）:
  zh-CN  Zhiyu   engine=neural      （默认）
  en-US  Ruth    engine=generative  （默认）
  en-US  Joanna  engine=generative
  en-GB  Amy     engine=generative  （默认）
  en-GB  Brian   engine=generative

语言路由: cn→zh-CN, enA→en-US, enB→en-GB, phrase→en-US
覆盖:     voiceProfileId 必须属于该 provider + locale，否则 400 UNKNOWN_VOICE
Region:   SM_POLLY_REGION → AWS_REGION → ap-northeast-1
SSML:     本轮只发纯文本，style 非空 → 400 SSML_NOT_ENABLED
预算:     aws-polly 独立账本，硬上限 0 元，任何计费请求 402 TTS_BUDGET_ZERO 且账本零变动
```

响应关键字段（`/v12/api/tts/providers`）：

```json
{
  "providerId": "aws-polly",
  "configured": false,
  "configuredReason": "CREDENTIALS_NOT_FOUND",
  "engine": "neural",
  "engines": ["neural", "generative"],
  "region": "ap-northeast-1",
  "rateAffectsAudio": false,
  "voices": [{"voiceId": "Zhiyu", "locale": "zh-CN", "engine": "neural"}],
  "budget": {"limitCny": 0, "spentCny": 0, "entries": 0, "exists": false, "file": "TtsCache/ledger/aws-polly.json"}
}
```

`aws-polly` 未配置时合成返回：

```json
{"ok": false, "code": "PROVIDER_NOT_CONFIGURED", "providerId": "aws-polly",
 "region": "ap-northeast-1", "reason": "CREDENTIALS_NOT_FOUND", "realCloudCallsThisBuild": 0}
```

## 断言清单（31 项全 PASS）

基线（14，语义未回退）：① 无令牌/跨源；② provider 集合与云 provider 未配置；②-b locale 过滤；
④ estimate 不落盘；③-a/③-b fake 合成与缓存命中；⑤ 计费 402 账本零变动；⑥ 未同意 403；
⑦ 篡改音频 400 / Range 206 / 越界 416；⑧ 姓名与档案字段双闸；附 skeleton 501；附 system-fallback pending；
⑨ 响应无 Key/无绝对路径；真实 People 目录 sha 前后一致。

新增 Polly（17）：P1 providers 契约；P2 5 声线/engine；P3 默认语言路由；P4 voiceProfileId 覆盖校验；
P5 4 类 locale 用 fake 合成；P6 重复请求 cacheHit 且计数不增；P7 rate 不影响音频（1.5× 复用同一缓存）；
P8 换 Joanna/Brian 产生新 audioId；P9 同意闸先于配置闸；P9-b estimate 返回 region/engine/configured/估价/摘录且不落盘；P10 未配置合成 501 且 0 调用；
P11 style→400；P12 独立账本 0/0 且 501/403 后文件仍未创建；P13 记账 API 0 元硬闸 402 不落文件；
P14 `.mp3` 写入/读取/stats 与 `.wav` 共存；P15 缓存音频仍校验 sha；P16 0 次真实 AWS 调用。

## 预算放行路径（凭据文档用）

- 默认不填 `SM_POLLY_BUDGET_CNY` → `AWS_POLLY_BUDGET_LIMIT_CNY=0`，任何 aws-polly 计费请求 402，账本零变动。
- 本地凭据文档填 `SM_POLLY_BUDGET_CNY=1` 并重启 8791 → limit=1；`recordProviderBilling(0.01)` 可写入 `TtsCache/ledger/aws-polly.json`。
- 非法值（如 `abc`）→ 0；上限夹到 1000 元，防误填。
- 真实调用仍要求 credentials + 显式同意；本测试不触发 AWS。证据 `budget-env-check.txt`。

## 证据文件

| 文件 | 说明 |
|---|---|
| `budget-env-check.txt` | 预算 env 放行/非法值/记账独立进程输出 |
| `verify-n05-tts-provider.log` | 完整 console 输出（31 PASS / 0 FAIL） |
| `verify-n05-tts-provider.json` | 机器可读摘要（含每条断言的 detail 与临时工作区路径） |
| `exit-code.txt` | `0` |
| `pass-count.txt` / `fail-count.txt` / `failures.txt` | `30` / `0` / 空 |
| `environment.txt` | node/npm/SDK 版本、Region、凭据存在性（仅布尔）、真实调用计数 |
| `commands.log` | 复现命令 |
| `legacy-cache-compat.txt` | 旧版 `.wav` 元数据（含缺失 mimeType）仍可 `readEntry`/`readAudio` 的直测输出 |

## 未验证项（诚实声明）

1. **真实 Amazon Polly 合成**：未调用（无凭据、预算 0、本轮红线）。`SynthesizeSpeechCommand` 的参数形状只做静态实现，未经 AWS 端到端验证。
2. **DescribeVoices 现场声线核查**：未调用（`SM_POLLY_DESCRIBE` 未设置）；`voicesVerified` 恒为 `false`。
3. **`.mp3` 解码播放**：只验证了缓存落盘/读取/统计与 mime 元数据，未在 Android 端实际播放 Polly 返回的 MP3。
4. **真机验收**：`aws-polly-fake` 的 HTTP 契约已验，但未做 ADB 真机播放/循环/停止（留给 Android 侧）。
5. **8791 服务重启与全量回归**：按任务要求只跑本定向测试，未重启 8791、未跑全量回归（留给主开发者）。
6. **预算上限**：仍为 0；未做任何放开，也未创建 AWS 账号/Key/账单。