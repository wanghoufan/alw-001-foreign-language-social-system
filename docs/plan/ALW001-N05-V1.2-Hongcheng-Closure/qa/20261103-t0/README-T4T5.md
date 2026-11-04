# N05 V1.2 · T4/T5 证据（2026-11-03）

## T4 AI 语义分段（PASS）
- 新增 `ai-segment.mjs`：AI 只返回**句子分组**，服务端据此切块 → 天然零丢失、零重复、span 与原文一致。
- 容错：兼容 0/1 基下标、`[起,止]` 区间、`{start,end}`；不合规即抛错。
- 降级：未授权 / 无 Key / 超预算 / 超时 / 返回不合规 → 规则分段并带 `reason`。
- 路由：`POST /v12/api/places/:id/records/segment`（64KB、限流、1 元预算内，单次预估成本上限 0.05 元）。
- 实测（真机 WebView → 服务端 → 真实 DeepSeek）：5 句样例 → `segmentedBy=ai`、2 块；未授权 → `rules`；故意抛错 → `rules` + `AI_HTTP_ERROR`。
- 前端：「记录新想法」新增 `AI 语义分段（发给 DeepSeek 分组，默认关闭）`，勾选后保存先预览再落库，失败自动按规则保存并在提示里标 `分段=...`。

## T5 学习闭环（PASS / PARTIAL）
- **缓存与合成次数**：`verify-n05-tts-provider` **31/31、0 真实云调用**（含重复请求命中缓存、不新增合成）。
- **20 次循环实播**：NOT_RUN —— 当前 UI 循环档位最大 5 次，无法在界面上构造 20 次；不伪造。
- **GPT Voice Prompt 字段**：静态核对 `buildPrompt()` 输出含 `placeId / recordId / blockId / contentRevision`（见 `index.html`）；动态复制到剪贴板未取回校验，标 PARTIAL。
- **复盘版本不覆盖**：本轮未构造两次复盘，NOT_RUN。

## 结论
| Task | 状态 |
|---|---|
| T2 私有地点 | PASS |
| T3 19 段入库 | PASS（AI 补写处已标注待确认） |
| T4 AI 分段 | PASS |
| T5 学习闭环 | PARTIAL（缓存 PASS、20 次循环与复盘 NOT_RUN） |
| T6 全量 QA + Human Gate | 未开始 |
