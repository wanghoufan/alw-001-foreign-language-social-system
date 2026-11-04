# N05 S6 · TTS 提供商适配层：后端验收证据（2026-11-03）

## 结论

- `node verify-n05-tts-provider.mjs` → **14/14 PASS，退出码 0**（见 `verify-n05-tts-provider.json`）。
- curl 取证 14 条命令全部 exit 0（见 `14-exit-codes.txt`），状态码与预期一致。
- 本轮 **0 次外部请求、0 个厂商 Key、0 元费用**；`fake` 适配器只读本地预置 WAV。

## 取证环境（不碰真实 8791 / 真实档案）

- 临时实例：`127.0.0.1:8799`（`SM_AI_NO_LISTEN=1` + 自建 http server，不启动真实 8791、不触发启动期权限巡检）。
- 临时数据目录：`/tmp/alw001-n05-tts-evidence/{TtsCache,People,pairings.json}`；真实 `SocialMate-Data/People` sha 前后一致。
- 令牌：现场走配对流程换 24h 设备短期令牌，仅存于临时 shell 变量与临时文件，取证文件内不含令牌值。

## 回执清单（路由 → 期望 → 文件）

| # | 路由 | 期望 | 文件 |
|---|---|---|---|
| ① | `GET /v12/api/tts/providers` 无令牌 / 跨源 | 401 `TOKEN_REQUIRED` / 403 `ORIGIN_REJECTED` | `01-no-token.txt` `02-cross-origin.txt` |
| ② | `GET /v12/api/tts/providers` | 仅 `fake`/`system-fallback` enabled；azure/elevenlabs/google `enabled:false,requiresConsent:true,billingEnabled:true` | `03-providers.json` |
| ② | `GET /v12/api/tts/voices?locale=en-GB` | 只出 en-GB 声线（含本地预置） | `04-voices-en-gb.json` |
| ④ | `POST /v12/api/tts/synthesize` `estimate:true` | 只报价，`wouldSynthesize:true`，无 audioId | `05-estimate.json` |
| ③ | 同上，首次真实合成 | `cacheHit:false`，`audioSha256` = 本地预置文件 sha | `06-synthesize-first.json` |
| ③ | 同上，同段重复请求 | `cacheHit:true`，`totalSyntheses` 不增 | `07-synthesize-again-cachehit.json` |
| ⑤ | 同上，`providerId:azure` + `explicitConsent:true` | 402 `TTS_BUDGET_ZERO` | `08-skeleton-billing-402.json` |
| ⑤ | 账本前后 sha | 完全一致，`spentCny:0` | `13-ledger.json` |
| ⑥ | 同上，`providerId:elevenlabs` 未 `explicitConsent` | 403 `CONSENT_REQUIRED`（回显摘录/提供商/费用） | `09-consent-required-403.json` |
| ⑦ | `GET /v12/api/tts/audio/:id` | 200，`Content-Length:19244`，`X-Tts-Audio-Sha256` 一致 | `10a-audio-full-headers.txt` |
| ⑦ | 同上 + `Range: bytes=0-99` | 206，`Content-Range: bytes 0-99/19244`，长度 100 | `10b-audio-range-headers.txt` |
| ⑦ | 同上 + `Range: bytes=999999-` | 416 | `10c-audio-range-invalid.txt` |
| ⑦ | 同长度篡改缓存音频后读取 | 400 `AUDIO_SHA_MISMATCH` | `11-tampered-audio-400.json` |
| ⑧ | 文本含已建档他人姓名 | 403 `PRIVACY_PERSON_NAME` | `12-privacy-person-name-403.json` |
| ⑨ | 全部回执扫描 | 无 `/Users/`、无 Key 名、无缓存绝对路径 | `14-exit-codes.txt` + 全目录 grep |

## 复现

```bash
cd socialmate-prototype/ai-gateway && node verify-n05-tts-provider.mjs; echo $?
```

curl 回执由 `curl-evidence.sh` 生成（需先起临时实例并把设备令牌写入 `token.txt`）。
