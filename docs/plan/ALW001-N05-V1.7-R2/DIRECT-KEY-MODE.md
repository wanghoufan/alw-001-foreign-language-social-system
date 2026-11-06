# V1.7 方案 2：手机端 Key + 直连厂商

> 用户选择：自用、不分发；Key 不编译进 APK，改为首次手动录入 + Android Keystore 加密。
> 这是对项目「密钥只在服务端」红线的一次**用户明确授权的例外**，仅限本机自用。

## 1. 架构

```
页面
  └─ 本机 LocalServer（127.0.0.1 随机端口）
       ├─ 有手机 Key → DirectCloud → DeepSeek / 豆包（直连，不经过云函数或 Mac）
       ├─ 有腾讯 Key 且 ASR 模式=direct → TencentAsrClient → 腾讯云 ASR（直连）
       ├─ 无手机 Key、有云端网关 → cloud-gateway（C4）
       └─ 都没有 → 503 / 回退 Mac 中继，页面按功能级失败提示
```

Key 不进入页面、不进入 WebView 存储、不进入 APK 常量、不进日志、不进备份包。

## 2. Key 存储

- `CloudKeys` → `SecureStore`：Android Keystore 内不可导出的 AES-256-GCM 主密钥加密后，密文落 `SharedPreferences("socialmate-secure")`。
- 支持字段：
  - `deepseek`：DeepSeek API Key（`sk-…`）
  - `doubao`：豆包语音 API Key（`X-Api-Key`）
  - `tencent_app_id` / `tencent_secret_id` / `tencent_secret_key`：腾讯云 ASR 直连（v2 WebSocket；HMAC-SHA1 本地签名）
- 读取失败（换机、清 Keystore、篡改）一律按未配置处理。

## 3. 录入位置

设置 → 「云端 Key（仅本机）」：

- DeepSeek API Key：输入 → 保存 → 输入框立即清空；状态显示「已配置（仅本机）」。
- 豆包 API Key：同上。
- 「清除」按钮只删本机 Key，不影响厂商侧。

## 3.1 输入法兼容与「测试通联」

- Key 输入框用 `type="text"` + CSS `-webkit-text-security:disc`，**不再用 `type="password"`**；MIUI 对 password 字段会强制小米安全键盘，导致微信输入法不可用。
- 权衡：第三方输入法（微信输入法）可能记录输入内容。建议输入后清空剪贴板/输入法历史，Key 一旦怀疑泄露立即在厂商控制台换。
- 每个 Key 项有「测试通联」：
  - DeepSeek：真实翻译 1 句 `hello`，回显中文；
  - 豆包：真实合成 `你好`（2 字），生成音频即成功；
  - 腾讯：只做 WS 握手与就绪检测，**不发送音频**。
- 无 Key 或 Key 不完整时，测试直接返回明确错误，不发起厂商请求。
- 测试会产生少量费用（豆包/DeepSeek）；腾讯握手通常不计费，但不做费用承诺。

## 4. 直连端点

| 能力 | 端点 | 鉴权 |
|---|---|---|
| DeepSeek 翻译 / 草稿 / 对话建议 | `https://api.deepseek.com/chat/completions` | `Authorization: Bearer <Key>` |
| 豆包 TTS | `https://openspeech.bytedance.com/api/v3/tts/unidirectional` | `X-Api-Key`、`X-Api-Resource-Id: seed-tts-2.0`、`X-Api-Request-Id` |
| 腾讯 ASR | `wss://asr.cloud.tencent.com/asr/v2/<appId>?…&signature=…` | AppId + SecretId + SecretKey 本地 HMAC-SHA1 签名 |

腾讯 ASR：mix 用 `16k_zh_en_speaker_2.0`（说话人分离），A/B 用 `16k_en`；手机端把 48k/44.1k 立体声转 16k mono 后发送。

模型：DeepSeek 默认 `deepseek-chat`；豆包 `seed-tts-2.0-standard`，mp3 / 24kHz。

## 5. 本机每日额度

在 `SharedPreferences("socialmate-cloud-usage")` 按 UTC 日期记账：

| 能力 | 每日上限 | 粗估 |
|---|---|---|
| DeepSeek | 1 元 | 输入 2 micros/字 + 输出 20 micros/token |
| 豆包 TTS | 2 元 | 300 micros/字（约 3 元/万字符） |

超额返回 `402 BUDGET_EXHAUSTED`。这是本机闸，不是厂商账单；真实费用以厂商控制台为准。

## 6. 已验证（2026-11-06 真机）

- DeepSeek 假 Key `sk-test-fake-123`：请求确实到达 DeepSeek，返回 HTTP 401；本机映射 `403 PROVIDER_REJECTED`，页面能拿到 JSON 错误（不再 `Failed to fetch`）。
- 清除 DeepSeek Key 后：无 Key、无云网关 → `503 CLOUD_NOT_CONFIGURED`。
- 豆包假 Key：请求确实到达豆包，返回 HTTP 401 / code `45000010`；本机映射 `403 PROVIDER_REJECTED`。
- 腾讯假 Key（AppId `1234567890` + 假 Secret）：ASR 模式切 `direct` 后点「开始录音」，WS 连接建立后被腾讯拒绝并触发重连（`连接中断 · 正在重连`），证明请求确实到达腾讯云端；不是本地模拟。
- Key 状态：保存后 `deepseek:true` / `tencent:true`，清除后全部 `false`；ASR 模式可切回 `mac`。
- 截图：`evidence/06-cloud-keys.png`。

## 7. 未验证 / 风险

- **真实 Key 端到端未跑**：需要用户自己录入真实 Key 后测试翻译、草稿、对话建议、豆包朗读、腾讯实时字幕。
- 真实费用、并发、429 退避未验证；腾讯 ASR 没有本地额度闸，费用只能靠腾讯控制台预算/告警。
- 手机被 Root、物理接触或 Keystore 被攻破时，Key 仍可能被取出；泄露后必须在厂商控制台换 Key。
- 换机/清数据/清 Keystore 后 Key 丢失，需要重新录入（这是预期行为）。
- 每日额度是本地粗估，不能替代厂商侧预算/告警；腾讯 ASR 按小时计费，未纳入本地额度。

## 8. 回退

- 清除 Key：立即回到「云端网关 → 503」路径，不影响本地资料。
- 配置云端网关：`socialmate-config` 的 `cloud_gateway_url` / `cloud_gateway_token`，优先级低于手机 Key。
- 卸载/换机前先导出 `.smbak.zip`；备份包不含 Key。