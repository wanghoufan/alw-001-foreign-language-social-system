# Hainan-Travel-Guide（实验工作区）

《海南 115 处值得玩的地方》中英双语离线实景指南 V3.0。

- 交付 ZIP：`artifacts/Hainan_115_Real_Photo_Guide_V3.0.zip`
- 可直接打开：`dist/Hainan_115_Real_Photo_Guide/Hainan_115_Offline_Guide.html`
- 交付说明：`docs/DELIVERY_REPORT.md`
- 交接计划：`docs/plan/2026-10-31 - Mac Mini - Desktop Agent - Hainan Photo Guide Handoff-SOP - V1.0.md`
- 环境预检：`PRECHECK.md`

## 当前实际完成度

- 地点 115/115，双语介绍 115/115
- 实景照片 152/345，配满 3 张的地点 45/115
- 缺口原因与逐条清单：`dist/Hainan_115_Real_Photo_Guide/PHOTO_COVERAGE.md`、`MISSING_OR_BLOCKED.csv`

## 验收状态

2026-10-31 用户决定：按现状验收 152 张（A1）、不再补图（B3）、不做额外人工核验（C）。ZIP 定版不再变更。

## 流水线

```bash
python3 scripts/discover.py
python3 scripts/download.py
python3 scripts/build_html.py
python3 scripts/package.py
python3 scripts/qa.py
```

所有图片来自 Wikimedia Commons，逐张记录作者/许可/来源；没有使用 AI 图或相似景点冒充。