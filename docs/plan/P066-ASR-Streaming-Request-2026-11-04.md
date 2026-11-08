# 给 P066 网关维护者｜ALW-001 流式 ASR 接入要求（可直接执行）

> 执行说明（给 P066 智能体）：
> 你是 P066 AI 管理网关的维护者。请先读 `docs/qa/P066-ASR-Skill-Contract-2026-11-03.md`（唯一真源），再按本文件在 P066 侧新增一个**流式 ASR 入口**，让 ALW-001 保持“边说边出字”的现有体验，同时把用量与扣费统一进 P066 账本。
> 不要修改 ALW-001 的任何代码；不要改 ALW 的 Android、Tailscale、TTS；不要读取或打印任何厂商密钥。完成后按第 5 节验收，并把结果、接口地址、项目号、令牌交付方式写回 P066 的 QA 文档。

- 日期：2026-11-04
- 请求方：ALW-001（外语社交系统）
- 目标：P066 新增流式 ASR 代理；ALW 从“直连腾讯”切到“P066 流式入口”；P066 概览/账单能看到 ALW 的 ASR 用量。
- 现状：ALW 未接入 P066；P066 当前只有批处理 `/api/asr/transcribe`（≤120 秒），无法支撑 ALW 的实时字幕与 3–5 分钟会话。

## 1. 为什么不能直接用现有 `/api/asr/transcribe`

ALW 现在的真实链路：

```text
手机双麦 → ws://<Mac>:8790/asr → ALW 本地桥
  → 重采样 16k → 腾讯云实时 ASR WebSocket
  → interim（边说边出）→ final（逐句定稿）→ 手机字幕
```

现有 `/transcribe` 是“整段音频上传，识别完返回一次文本”。如果 ALW 硬接：

- 字幕要等整段或分块结束才出，不再是实时；
- 单次 ≤120 秒，3–5 分钟会话必须切块；
- 切块后说话人编号 `spk_N` 会重置，ALW 的“一次选人、整段归属”会错乱；
- 现有 300 秒会话上限、实时建议、复盘时间线都会变形。

因此请**新增**流式入口，保留批处理入口给其它项目；不要删除 `/transcribe`。

> **不可降级条款（ALW 明确不接受）**：
> 1. 不得用 `/api/asr/transcribe` 分块轮询来替代实时字幕；
> 2. 不得把 3–5 分钟会话切成 120 秒批次后延迟回传；
> 3. 不得让 `spk_N` 跨块重置。
> 如果 P066 只能提供整段转写，则视为**未接入**，ALW 继续使用现有本地流式桥。

## 2. 请求的流式接口契约（建议）

### 2.1 连接

```text
GET ws://127.0.0.1:8078/api/asr/stream
  ?engine=16k_zh_en_speaker_2.0
  &rate=16000
  &channels=1
  &track=mix
  &sessionId=<ALW 本轮会话 id>
请求头：x-asr-token: <P066 项目令牌>
```

- 令牌只放请求头，**不得**放 URL、日志、错误消息；WS 升级若不支持自定义头，请改用 `Sec-WebSocket-Protocol` 或首条 JSON 鉴权消息，并在文档中写清。
- `engine` 必须在项目授权白名单内；`rate=16000`、`channels=1` 固定；`track=mix|A|B` 用于 ALW 混音/双轨。
- 连接建立前完成鉴权与预算检查；401/403/402 时**不得连接腾讯上游**。

### 2.2 客户端 → P066

- 二进制帧：16 kHz / 16-bit / 单声道 PCM，按 100ms 左右分片。
- 文本帧：`{"type":"end"}` 表示本轮结束；`{"type":"ping"}` 保活。
- 单连接音频时长上限建议 300 秒；超过时服务端发错误并关闭。

### 2.3 P066 → 客户端（事件字段）

请尽量与 ALW 现有事件结构兼容，字段名不要另起一套：

```json
{"type":"session","status":"ready","sessionId":"...","track":"mix","engine":"16k_zh_en_speaker_2.0","mock":false,"provider":"tencent","startMs":0,"endMs":0}
{"type":"interim","text":"我正在说","startMs":1200,"endMs":2400,"speaker":"spk_0","final":false}
{"type":"final","text":"我正在说话。","startMs":1200,"endMs":3000,"speaker":"spk_0","final":true}
{"type":"budget","remainingCny":1.42,"spentCny":0.58,"costCny":0.0012,"seconds":4.3}
{"type":"error","code":"ASR_BUDGET_EXHAUSTED","message":"预算不足，未连接上游"}
```

- `interim` 必须是“覆盖当前句”，`final` 才是“追加定稿”；不要把 interim 累积后当 final 重复发。
- 这两类事件必须在**同一连接内持续输出**，不能等整段音频结束后一次性返回。
- `speaker` 用 `spk_N` 聚类编号，不要伪造“我/对方”；ALW 侧做一次映射。
- `budget` 事件至少在本轮结束前发一次；ALW 用它显示剩余额度与账单。
- `mock:true` 仅用于零费用联调；生产不得静默降级 mock。

### 2.4 计费与预算

- 按实际送入上游的音频秒数计费，价格沿用 `config/asr-providers.json` 的 1 元/小时（本地估算）。
- 连接建立时预留，运行中每 5 秒按已发送字节提交一次，结束按实测秒数结算，预留下限 0.01 元。
- 剩余额度 ≤ 0.01 元时立即发 `ASR_BUDGET_EXHAUSTED` 并关闭，不得继续连接上游。
- 同一 `sessionId` 重连/重复提交必须幂等，不重复扣费；请明确幂等窗口。
- ASR 账本与聊天模型现金账严格分离，不相加。

## 3. 项目登记、授权与令牌（B1）

请在 P066 侧完成：

1. 在 `registry/projects.json` 登记 **ALW-001**，分配项目号（如 `P0xx`），路径指向 ALW 项目；`consumer=ALW-001/android-poc/asr-bridge`。
2. 执行 `POST /api/asr/projects/P0xx/authorize`：
   - `provider_alias=tencent-asr`
   - `engines=["16k_zh_en_speaker_2.0","16k_en","16k_zh"]`
   - `budget_cny=3`（用户指定 2–5 元/月区间，先取 3）
   - `budget_currency=CNY`
3. 执行 `POST /api/asr/identities` 发项目令牌；明文只显示一次，交付给 ALW 本机安全存储（`.local/p066-asr.env`，权限 600），**不要写进 Git、文档、日志或聊天记录**。
4. 在 P066 概览/账单确认能看到 ALW 的 ASR 项目、引擎、秒数、扣费；ASR 卡与聊天模型卡分开。

## 4. ALW 侧承诺（C1）

P066 流式入口可用后，ALW 会：

- 把 `android-poc/asr-bridge` 的上游从腾讯直连切到 P066 流式入口；
- 生产路径不再自算腾讯签名、不再持有 ASR SecretKey；
- 删除本地 `asr-budget.json` 扣费逻辑（保留只读历史或直接删除）；
- 手机聊天页显示 P066 返回的 `remainingCny` / `costCny`，账单明细统一看 P066；
- 不改 Android、Tailscale、TTS、聊天模型路由。

ALW 不会改 P066 代码；需要 P066 提供的只有：**流式入口 + 项目号 + 令牌 + 账单可见**。

## 5. 验收标准（P066 侧交付前自证）

1. 无令牌 → 401；撤销令牌 → 401；跨项目令牌 → 403。
2. 项目未开通 / 引擎不在白名单 → 403，且不连上游。
3. 预算不足 → 402，且不连上游；并发只放行到上限。
4. 4 分钟流式会话：到 300 秒自动结束，返回明确错误码，结算封顶在预留内。
5. interim 覆盖、final 追加，不重复堆叠；固定短语音文本正确。
6. `spk_N` 在同一连接内稳定；不把聚类编号伪装成真实身份。
7. 同一 `sessionId` 重连不重复扣费；账本归因到 ALW 项目。
8. 审计日志无签名串、无 SecretId/SecretKey、无原始音频、无转写正文。
9. 先用零费用 Mock/固定 PCM 跑通 401/402/403/409/503，再做**一次**最小真实调用；真实调用能说出扣了多少钱。

## 6. 交付物

请回给 ALW：

- 流式入口地址与最终事件字段表；
- ALW 项目号、授权结果、令牌交付方式（不要贴明文）；
- 验收结果与一次真实调用的 `seconds/cost_cny/remaining_cny`；
- 计费口径、幂等窗口、单连接上限、错误码表；
- P066 概览/账单中 ALW ASR 的截图或可核对路径。

## 7. 边界

- 只新增流式 ASR 入口与 ALW 登记；不改 ALW 代码、不改其它项目、不改聊天模型路由。
- 不把腾讯长期密钥交给 ALW；不在 URL/日志/文档出现令牌或签名。
- 批处理 `/transcribe` 保持现状，供其它项目使用。