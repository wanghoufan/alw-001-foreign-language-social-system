# HANDOFF · Hainan-Travel-Guide

## §0 常驻指针

- 架构与构建：`docs/architecture-facts.md`
- 风险：`docs/risks.md`
- 踩坑：`agent.md`
- 交付说明与统计：`docs/DELIVERY_REPORT.md`
- 交接计划原件：`docs/plan/2026-10-31 - Mac Mini - Desktop Agent - Hainan Photo Guide Handoff-SOP - V1.0.md`
- 交付物：`artifacts/Hainan_115_Real_Photo_Guide_V3.0.zip`、`dist/Hainan_115_Real_Photo_Guide/Hainan_115_Offline_Guide.html`

## §1 当前进展

- 项目已从 `Developer/experiments/` 移到当前项目根下 `Hainan-Travel-Guide/`。
- 115 处地点与中英双语介绍完整；HTML 离线可用，搜索/城市/分类/主题/语言均实测通过。
- 实景照片 153/345；配满 3 张 45/115；只有 1–2 张 11 处；无合规照片 59 处。
- 已修复城市下拉框漏掉“海口”的 Bug。
- B2 已试：Openverse + 定向 Commons，仅新增 1 张（海大南门）；其余因许可或地点无法精确匹配被拒。
- QA 18 项硬检查 PASS；ZIP 45.2MB，SHA-256 `5175f32406e3cd64887106c3ac61a8908916f3c1953fe65a1861f4834fe2cb16`。

## §2 下一步

1. 等用户决定：接受 153 张定版，还是提供自有照片/书面授权继续补图。
2. 若补图：放入 `images/<城市>/<编号>/`，补 `PHOTO_MANIFEST.csv`，跑 `build_html.py → package.py → qa.py`。
3. 若定版：可补一次真实手机浏览器验收（当前仅 500px 桌面视口模拟）。

## §3 未完成

- 192 张照片缺口，逐条见 `dist/Hainan_115_Real_Photo_Guide/MISSING_OR_BLOCKED.csv` 与 `PHOTO_COVERAGE.md`。
- 未做逐张人工视觉核验（用户已明确不做）。
- 未做 Android/iOS 真机验收。
- 地点文案沿用 V2.0 已核信息，未逐条重新实地核址。

## §4 红线

- 不得用 AI 图、相似景点、邻近街道照片冒充目标地点。
- 入包图片必须许可允许再分发，并保留作者/许可/来源。
- 不部署、不上 Vercel、不申请付费服务。
- 45MB ZIP 未经用户同意不提交 Git。
- 不删除 `baseline/`、`original/`、`data/discovery.json` 与台账。

## §5 三日流水

### 2026-10-31
- 接手 V2.0，校验 ZIP hash 与 115 条数据；建 experiments 工作区（后按用户要求迁回项目根）。
- 完成 Commons 发现/下载/去重/WebP 优化/离线 HTML/QA/ZIP 全链路；153 张合规照片。
- 修复海口筛选缺失；尝试 B2 扩展图源，仅 +1。

## §6 接续提示词

先读 `docs/handoff/HANDOFF.md` §0–§6、`docs/risks.md` 与 `agent.md`；按 §2 等用户定版或按补图流程继续，改动后必须重跑 `package.py` 与 `qa.py`。