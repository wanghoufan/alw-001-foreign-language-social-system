# QA · 真实 AI 网关（DeepSeek 官方 + OpenCode Go）

日期：2026-10-31｜执行：Mac mini 本机 Node 24 + Chrome 156 headless

## 结论

- `真实 AI 已验收`：DeepSeek 官方与 OpenCode Go 均实际收到云端模型响应（`mode:"real-ai"`）。
- `ASR final → AI 适配器已验收`：真实腾讯云 final 文本经适配器产生真实 AI 回应。
- `HTML 自动推荐未回退`：仍为自动接话/追问/卡片，手动搜索仅备用。
- 未做：手机/公网访问、长会话稳定性、多人说话人映射。

## 自动化

`node --test core.test.mjs asr-final-adapter.test.mjs` → **12 / 12 通过**。

## 真实响应记录

| 线路 | 模型 | 延迟 | tokens | 费用/额度 | 引用 |
|---|---|---|---|---|---|
| DeepSeek 官方 | deepseek-flash | 1.6–1.8s | 1804–2072 | 按账号计费（响应未回金额） | 39 万绿园 / 41 海口湾滨海步道 / 45 白沙门公园 |
| OpenCode Go | deepseek-v4.1-flash | 3.6s | 1842 | cost 0.00034605，allowance 0.00020763 | 39 / 41 / 45 |

双人样本（friend + me + friend）DeepSeek：1.62s，2072 tokens，回复/3 追问/分享均自然，引用 39/41/45。

## UI 实测

- 页面 `http://127.0.0.1:8791/` → 聊天 → 开始演示 → 勾选演示与云端同意 → 示例：户外跑步。
- 状态栏：**真实 AI · DeepSeek 官方**；卡片：万绿园、海口湾滨海步道、白沙门公园。
- 证据：`screenshots/ai-ui-deepseek-real.png`、`ai-ui-result.json`。

## ASR final 接入

- 适配器文件：`asr-final-adapter.mjs`；sidecar：`asr-ai-sidecar.mjs`（**未修改** `android-poc/asr-bridge` 现有文件）。
- 真实腾讯云 final：`Hello, this is microphone b, I'm testing the right channel.` → `mode:"real-ai"`，1.65s。
- 日常话题不再强推地点：`general` 引用为空（`asr-ai-final.json`）。
- MOCK/interim/无同意/重复 final 均不计费调用（单测覆盖）。

## 修复的真实问题

1. OpenCode Go 必须带 `x-opencode-session`，否则 400 MissingSessionID。
2. OpenCode 需 `thinking:{type:"disabled"}`，否则超时/空输出。
3. 模型偶发返回 ```json 围栏或空 JSON：增加宽松解析 + 仅对无效 JSON 重试一次。
4. running 卡片不足：用正式资料库检索补齐 39/41/45（不改模型英文文本）。
5. general 话题会被填充无关地点：改为引用为空。
6. sidecar 在 ASR 连接关闭时提前退出：等待 AI 请求完成。

## 边界

- Key 只在 `.env`，未打印、未入 Git/截图；`/api/ai/health` 只返回布尔值。
- 网关只绑 `127.0.0.1:8791`，手机需私有隧道/TLS 后才能访问。
- 失败时 UI 明确显示“本地规则回退”，不冒充真实 AI。
