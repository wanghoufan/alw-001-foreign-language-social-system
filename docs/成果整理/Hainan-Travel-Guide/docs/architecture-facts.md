# 架构与构建事实

## 目录

- `baseline/`：V2.0 原始解压内容（只读参考）
- `original/`：V2.0 原始 ZIP
- `data/`：`places.json`、`PHOTO_MANIFEST.csv`、`discovery.json`、`aliases.json`、`curated.json`
- `images/<CityFolder>/<ID>/NN.webp`：入包图片
- `dist/Hainan_115_Real_Photo_Guide/`：交付目录
- `artifacts/`：ZIP、QA 截图
- `scripts/`：流水线脚本
- `docs/`：计划、交付说明、handoff

## 流水线

1. `python3 scripts/discover.py`：Wikimedia Commons 搜索 + 分类 + 别名；写 `data/discovery.json`
2. `python3 scripts/download.py`：下载、Pillow 解码、WebP(≤1600px, q82)、dHash 去重、写 `PHOTO_MANIFEST.csv`
3. `python3 scripts/curated.py`：把人工确认的 Commons 文件强制加入候选
4. `python3 scripts/build_html.py`：内嵌 JSON 生成单文件 HTML，复制图片到 `dist/images`
5. `python3 scripts/package.py`：生成 LOCATIONS/MISSING/ATTRIBUTIONS/DISCOVERY_LOG/PHOTO_COVERAGE/README/CHANGELOG，打 ZIP
6. `python3 scripts/qa.py`：数据/图片/HTML/布局/ZIP 共 18 项检查，写 `QA_REPORT.md`

## 网络

- Wikimedia 直连超时，脚本统一走 `HG_PROXY`（默认 `http://127.0.0.1:7897`）。
- 下载需设置 UA 与 `Referer: https://commons.wikimedia.org/`，否则 403。
- Openverse 可访问但响应慢、匿名限流，命中率低。

## 关键实现

- 图片 URL 用 `thumburl`（1920px），保存前 `exif_transpose`。
- 去重：全局 dHash 汉明距离 ≤6 视为重复。
- 地点匹配：中文全名 / 英文整词短语 / 别名；并排除其他省市关键词。
- HTML 数据在 `<script type="application/json" id="data">`，图片走相对路径，无外部依赖。