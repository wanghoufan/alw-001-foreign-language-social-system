# P066 ASR 接入核验（ALW-001）

- 日期：2026-11-04
- 项目：ALW-001（P066 已登记）
- 引擎：`16k_zh_en_speaker_2.0`
- 预算：3 元/月（P066 侧）
- 入口：`POST http://127.0.0.1:8078/api/asr/transcribe`（一次性整段，非流式）
- 令牌：已存入 `.local/p066-asr.env`（权限 600），不写入本文件、日志或 Git

## 1. 结果

| 用例 | 结果 | 证据 |
| --- | --- | --- |
| 无令牌 | **PASS 401** | `{"error":"缺少或无效的 ASR 项目令牌"}` |
| 有效令牌 + 未授权引擎 `16k_multi_lang` | **PASS 403** | `{"error":"引擎 16k_multi_lang 未授权给 ALW-001"}` |
| 超预算 402 | **NOT_RUN** | 需耗尽 3 元或改 P066 预算；本轮不动 P066 |
| 最小真实调用 | **PASS 200** | 5.173 秒中文语音，识别为「你好，我想去红城湖公园，星期六下午3点见。」 |
| 真实扣费 | **已核对** | P066 账本 `ALW-001.cost_cny=0.001729`、`calls=1`、`reserved_cny=0` |
| 余额 | **已核对** | 3 − 0.001729 = **2.998271 元** |

## 2. 契约不一致（需 P066 确认或修）

契约写的是成功响应顶层返回 `cost_cny` / `remaining_cny`：

```json
{"project":"ALW-001","engine":"...","text":"...","seconds":5.173,"elapsed_s":6.226,"cost_cny":0.0017,"remaining_cny":2.9983}
```

实测顶层这两个字段是 **null**，真实值在 `status` 对象里：

```json
{"project":"ALW-001","seconds":5.173,"elapsed_s":6.226,"status":{...},"estimate":true,"reconciled":false}
```

ALW 侧不能按契约顶层字段做 UI；要么 P066 补顶层字段，要么 ALW 改读 `status`。请 P066 明确以哪个为准，并更新 `P066-ASR-Skill-Contract-2026-11-03.md`。

## 3. 流式（A1）状态

- 现有 `/transcribe` 只接受整段 PCM，单次 ≤120 秒，返回最终文本；无 interim / final 事件。
- ALW 当前实时字幕仍走本地 `asr-bridge` 直连腾讯；**没有切换到 P066**，避免破坏边说边出字。
- P066 尚未提供 `/api/asr/stream`；A1 未完成，需 P066 按转交稿实现后再切。

## 4. 边界与额度

- 本轮只调用一次真实转写，费用 **0.001729 元**。
- 本地 ALW 账本仍独立（剩余 1.429531 元），未与 P066 合并；切换流式后再删本地扣费。
- 未修改 P066 代码；未在日志/文档出现令牌或厂商密钥。
## 5. 流式接入（ALW 侧已改，P066 阻塞）

- 已新增 `android-poc/asr-bridge/src/p066-asr-client.js`，并让 `server.js` 支持 `ASR_UPSTREAM=p066`；不改音频分片、事件包装、手机 UI。
- `P066_ASR_URL=ws://127.0.0.1:8078/api/asr/stream`，令牌只放 `x-asr-token` 头。
- ALW 本地预算在 p066 模式停用，P066 为扣费真源；P066 返回的 budget 事件可透传。

### 实测结果（真实腾讯上游）

| 用例 | 结果 |
| --- | --- |
| 连接 / interim | PASS：9 条 interim，`spk_0` 正常 |
| final | **FAIL：0 条**（2 次测试：5.173s 连续语音、2s 语音+2s 静音） |
| 结算 | P066 审计 `ok:true`，5.173s 扣 0.001437 元 |
| 300s / 402 / 403 | 未在流式入口复测 |

### 疑似 P066 原因（请 P066 修）

1. `stream-relay.mjs` 的 `createSignedUrl` 没带 `voiceFormat:1`、`needVad:1`、`speaker_diarization:1`，可能导致上游不产 final。
2. 客户端 `end` 后仅 600ms 就 settle，尾部 final 来不及回传；建议放宽到 2s 或等上游 close。
3. 请用**真实腾讯上游**（不要 `AIHUB_ASR_UPSTREAM` mock）复验 final 数量，并把 final 数写进审计。

### 当前生产状态

- 为避免用户测试时没有定稿字幕，已临时回退 `ASR_UPSTREAM=tencent`；代码保留 p066 适配，P066 修好后改一个环境变量即可切回。
- Note 12 Pro 安装 APK 被 MIUI 拦截：`INSTALL_FAILED_USER_RESTRICTED`；需要设备上允许「USB 安装」后才能做真机验收。

## 6. 修复后复测（2026-11-04 17:10）

P066 两处修复（已备份 `stream-relay.mjs.bak-20261104-finalfix`）：

1. `translate()` 按 `sentence_type === 1` 判定 final，不再只看外层 `msg.final`；
2. 客户端 `end` 后等待从 600ms 放宽到 2500ms；
3. 上游签名补 `speaker_diarization`。

复测结果：

| 用例 | 结果 |
| --- | --- |
| 单段 5.173s | interim 8、**final 1**：「你好，我想去红城湖公园，星期六下午3点见。」 |
| 多段（含静音间隔） | interim 13、**final 2**，spk_0 |
| Note 12 Pro 真机（P066 模式） | 2 条 final、spk_0/spk_1、最新置顶、状态条「本轮已结束 · 可复盘」、连接胶囊「家庭 WiFi」 |
| P066 额度 | spent **0.020471 / 3 元**，remaining **2.979529** |

Note 12 Pro 未配对，归档 `pending=2`、`configMissing=true`；这是配对缺失，不是 P066 流式问题。Note 12T Pro 已配对，待用户回来后做归档/复盘复验。

当前生产：`ASR_UPSTREAM=p066`，`mode=p066`，无活动会话。
