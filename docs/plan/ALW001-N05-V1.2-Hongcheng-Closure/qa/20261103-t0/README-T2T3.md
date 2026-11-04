# N05 V1.2 · T2/T3 证据（2026-11-03）

## T2 私有地点命名空间（不改 1–115）
- 新增 `socialmate-prototype/ai-gateway/private-places.mjs`：`pv-*` id、`SocialMate-Data/PrivatePlaces/<id>/place.json`、`confirm` 必填、同 id 幂等。
- `place-notes.mjs`：`assertPlaceId` 接受 `pv-*`；记录目录落到 `PrivatePlaces/<id>/records`；`getPlaceDetail` 对私有地点换文案。
- `server.mjs`：新增 `GET/POST /v12/api/private-places`；`places/:id` 与 `places/:id/records` 正则放开 `pv-*`。
- 前端：`index.html` 启动时合并私有地点到海南列表（**仅在原生桥存在时执行**，公开 PWA 行为不变）。
- 结果：海南列表 **116 项**（115 + 红城湖），点击卡片可进详情；`places-115.json` SHA 前后一致 `0412673d…`。

## T3 真实素材入库
- 地点：`pv-hongcheng-lake-park`（红城湖公园 / Hongcheng Lake Park，海口，公园）。
- 记录：`rec-20261103072022-16b79c`，**19 段**、英 A/B **38 条**、原文 **1148 字**（中文原话逐字，未改写）。
- 缺口处理：第 18 段英文 B 由 AI 补写，第 2/3/18 段表达由 AI 补写（**标注为 AI 建议，待用户确认**，用户原译未改）。
- 真机：记录页 76 个朗读钮（19 段 × 4），点「中文」系统语音完整读出，`queue finished`。
- 截图：`04-hongcheng-19blocks.png`。

## 仍未做
- T4 AI 语义分段（当前为规则分段，三档粒度已可选）
- T5 学习闭环缓存 20 次/单次合成、GPT Prompt 校验、复盘版本
- T6 全量 QA 与唯一 Human Gate
