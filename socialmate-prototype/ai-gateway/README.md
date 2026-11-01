# ALW-001 · 真实 AI 聊天与推荐 API（双线路）

当前可调用接口已编码，实际云端验收取决于两套 API Key 是否已在 Mac mini 配置，**不能把代码存在当作真实调用成功**。

## 官方验证结果

- 默认 **DeepSeek 官方通用 API**：`https://api.deepseek.com/chat/completions`，型号 `deepseek-flash`（当前 DeepSeek V4.1 Flash），另有可选 `deepseek-v4-pro`。默认明确关闭思考模式，优先降低实时聊天延迟。
- 可选 **OpenCode Go**：`https://opencode.ai/inference/go/openai/v1/chat/completions`，模型 `deepseek-v4.1-flash`。与 DeepSeek 官方互不共用密钥、余额与套餐限额。OpenCode Go 在部分账号可能需要到 Settings → Privacy 把 DeepSeek 允许区域设为 Global。
- 官方 DeepSeek 文档 <https://api-docs.deepseek.com/zh-cn/> / <https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/>
- OpenCode Go 官方文档 <https://opencode.ai/v2/docs/console/go/>；官方不同代文档存在 `/zen/go/v1/`、`/inference/go/v1/` 和 `/inference/go/openai/v1/` 差异，默认最新接口；如你的实际账号路由不同，修改 `OPENCODE_GO_API_URL` 为代码允许的官方地址。

## Mac mini 本地启动（开发者执行，非用户手动编码）

V0.4.0 起必须使用 **组合服务**：一个进程同时监听 8790（腾讯云 ASR WebSocket）和 8791（V1.2 UI + AI + SSE）。旧的独立 `server.mjs` 没有 ASR，不能单独作为正式 UI 服务。

```sh
cd "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统"
cp socialmate-prototype/ai-gateway/ENV_TEMPLATE.txt socialmate-prototype/ai-gateway/.env
# 在本机 .env 中填写自己的 DEEPSEEK_API_KEY（官方默认）
# 如想对比 OpenCode Go，再添加 OPENCODE_GO_API_KEY
bash socialmate-v1.2/service-v040.sh ensure
```

`service-v040.sh` 会先核验 8791 是否真的是组合服务；若发现旧独立网关，只在确认 cwd/命令属于本仓库后才会停止并替换。端口被其他项目占用时拒绝 kill 并打印 pid/cmd/cwd。

检查状态（不返回 Key）：

```sh
curl -s http://127.0.0.1:8791/api/asr/status
curl -s http://127.0.0.1:8790/health
```

`/api/asr/status` 返回 `combined:true` 才代表 ASR 与 AI 在同一进程；`features.asrLive:true` 是安装脚本的硬校验。

用 Mac mini 浏览器访问 <http://127.0.0.1:8791/v12>。聊天页选择模型→开始演示→勾选“同意云端发送”→添加一句英文；只有勾选后才调用真实服务，状态显示“真实 AI + 服务商名”。Key 缺失/额度不足时显示错误并回退本地规则，不能伪称上线。

HTTP POST `/api/ai/analyze` JSON：
```json
{"consent":true,"provider":"deepseek","model":"deepseek-flash","includePersonal":false,
 "messages":[{"speaker":"friend","text":"I like running outside. Any nice places in Haikou?"}]}
```
实际响应有 `mode:"real-ai"`、`provider`、`model`、`topic`、`reply`、`questions`、`share`、`references`。后者只允许使用正式 115 海南地点 / 51 软件 ID，后端对 AI 输出做引用白名单过滤，拒绝幻觉 ID。

## DeepSeek 预算闸（用户已授权自动启用，上限 1 元）

`DEEPSEEK_BUDGET_CNY` 默认 **1 元**。服务按官方高峰价保守估算每次 `deepseek-flash` 调用的成本：

- 输入缓存命中 0.04 元 / 百万 token
- 输入缓存未命中 2 元 / 百万 token
- 输出 8 元 / 百万 token

累计花费写入 `socialmate-prototype/ai-gateway/.local/ai-budget.json`（已 gitignore），跨重启保留。剩余不足 0.01 元时直接返回 `402 BUDGET_EXHAUSTED`，不再调用上游。查询：

```sh
curl -s http://127.0.0.1:8791/api/ai/health | python3 -m json.tool
```

响应中的 `budget` 显示 `limitCny / spentCny / remainingCny / calls`。历史未记录 usage 的调用无法精确回算，本闸从启用后开始累计；当前已用约 **0.202 元 / 1 元**。

## 隐私与工程边界

- 用户当前登录 ChatGPT 不等于拥有 DeepSeek 官方 API。**API Key 与费用必须分别确认；不要在聊天、HTML、APK、Git 或截图里展示 Key。**
- 正式使用涉及他人言谈，须告知并取得必要同意；模型调用只传最近几轮文本、少量候选资料，不上传原始音频；默认不发送私人个人故事。
- 服务始终只绑定 `127.0.0.1`，不会未经鉴权公开到公网。真机通过 USB `adb reverse` 访问；无 USB / 公网方案仍需另接身份验证与 TLS / Tailscale 私有入口。
- ASR 与 AI 已通过同进程事件 hub 集成：只有腾讯云 `final` 且用户在页面显式勾选“允许发送云端 AI”时，才把最近几轮文字送入模型；interim、mock、未勾选一律不调用，2.5 秒防重复计费。
- 组合服务复用 `android-poc/asr-bridge` 代码，但不改变手机 WebSocket 协议；音频只在内存中流转，不落盘。
- DeepSeek/API 失败的本地规则仅为明确标记的降级。**真实模型未通过服务端返回 `mode:real-ai` 前，不能把其视为已完成验收。**

## 开发前置条件核对（本项目以前漏掉了）

| 事项 | 谁处理 | 阻塞性 |
| --- | --- | --- |
| DeepSeek 官方 API Key、API 额度与账号地域 | 用户确认/本地输入 | 真实 AI 主线路硬条件 |
| OpenCode Go API Key、Go 套餐额度、Global 区域设置 | 用户确认/本地输入 | 仅备选线路硬条件 |
| Node.js 22+ / npm / 本地测试 | 开发者自办 | 不需用户 |
| 51/115 正式资料 | 项目已有 | 不需重造 |
| 真人 BOYA 麦克风录音和他人同意 | 最终真人验收 | 不应阻塞纯文本 AI 开发 |
| 私有手机远程接入、TLS/鉴权 | 发布/跨设备集成前 | 本机开发不需 |

## 本机验收记录（2026-10-31）

- DeepSeek 官方与 OpenCode Go 均返回 `mode:"real-ai"`；延迟 1.6s / 3.6s。
- UI 状态显示“真实 AI · DeepSeek 官方”，户外跑步自动卡片为 39/41/45。
- 详见 `QA.md`、`ai-ui-result.json`、`asr-ai-final.json`。
