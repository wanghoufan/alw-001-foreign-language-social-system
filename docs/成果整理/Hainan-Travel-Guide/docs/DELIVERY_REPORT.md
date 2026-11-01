# 交付说明 · 海南 115 处中英双语实景指南 V3.0

日期：2026-10-31（Asia/Shanghai）
项目目录：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/Hainan-Travel-Guide`

## 一、实际完成情况（数字均为实际文件统计）

| 项目 | 结果 |
|---|---|
| 地点数据 | 115 / 115（ID 1–115 唯一；海口 60、其他市县 55） |
| 中英双语介绍 | 115 / 115（中文 63–101 字，英文 33–53 词；英文开头已统一改写，去掉 “You can find it at …”） |
| 实际下载并解码成功的照片 | **153 / 345** |
| 配满 3 张的地点 | **45 / 115** |
| 只有 1–2 张的地点 | 11 处 |
| 暂无合规照片的地点 | 59 处 |
| 照片许可 | 全部为 CC0 / Public Domain / CC BY / CC BY-SA，允许再分发；逐张记录作者、许可、来源页 |
| 图片重复检查 | SHA-256 精确重复 0；dHash ≤4 近似重复 0 |
| 错地区照片 | 已扫描并剔除 4 张（青岛观海台、深圳石厦村/沙尾村），当前 0 |
| HTML 离线 | 数据内嵌，图片走相对路径，无任何在线图片或外部脚本 |
| 手机布局 | 500px 视口下 `scrollWidth 485 ≤ 500`，115 张卡片全部渲染，152 张图片全部加载，坏图 0 |
| 交互 | 搜索（“骑楼”命中 4 处）、城市筛选（三亚 13 处）、深色切换、只看中文均实测可用 |
| ZIP | 228 个条目，含 152 张图片；解压到随机临时路径后可打开，图片可解码 |
| ZIP SHA-256 | `5175f32406e3cd64887106c3ac61a8908916f3c1953fe65a1861f4834fe2cb16` |
| ZIP 大小 | 47,425,848 bytes（约 45.2 MB） |

## 二、交付文件

- `artifacts/Hainan_115_Real_Photo_Guide_V3.0.zip`
- `dist/Hainan_115_Real_Photo_Guide/`（解压后的同一份内容，可直接双击）
  - `Hainan_115_Offline_Guide.html`
  - `images/`（152 张 WebP）
  - `places.json`、`LOCATIONS.csv`、`PHOTO_MANIFEST.csv`、`DISCOVERY_LOG.csv`
  - `MISSING_OR_BLOCKED.csv`、`PHOTO_COVERAGE.md`、`ATTRIBUTIONS_AND_LICENSES.md`
  - `QA_REPORT.md`、`README.md`、`CHANGELOG.md`
- `PRECHECK.md`：环境实测
- `docs/plan/2026-10-31 - Mac Mini - Desktop Agent - Hainan Photo Guide Handoff-SOP - V1.0.md`：交接计划原件

## 三、为什么没到 345 张（如实说明）

入包必须同时满足两条：照片确实属于该地点；许可允许再分发。

- Wikimedia Commons 对成熟景区覆盖好：骑楼老街、云洞图书馆、火山口、北港岛、万绿园、白沙门、蜈支洲岛、亚龙湾、呀诺达、槟榔谷、尖峰岭、鱼鳞洲等能配满 3 张。
- 对近年的网红小街、独立咖啡馆、夜市、社区商场、渔村，Commons 几乎没有素材。中文新闻、携程、小红书、大众点评的图片受版权保护，不能因为公开可看就复制进 ZIP。
- 因此 59 处保留“待补图”，11 处只有 1–2 张；没有使用 AI 图、邻近街道或相似景点冒充。

## 四、端到端链路验证

- 按要求先尝试 **龙兴路**：Commons 无该街道的可再分发照片，中文新闻图不可打包，因此该点保留待补图（记录在 `MISSING_OR_BLOCKED.csv`）。
- 同链路改在 **骑楼老街（ID 3）** 跑通并留证：发现 → 许可/尺寸/主题过滤 → 下载 → Pillow 解码 → WebP 优化 → 去重 → JSON/HTML 引用 → 离线打开 → ZIP 解压复核。

## 五、已知限制

- 地点归属核验基于 Commons 文件标题/描述/分类与地区黑名单，未做人工逐张视觉比对；这是本轮最大的验证限制。
- 未做真实手机（Android/iOS）浏览器验收，只做了 500px 桌面视口模拟。
- 高德/Google 导航按钮需联网；离线只保证正文与照片。
- 店铺、游船、营地、火箭观礼可能临时调整，文案沿用 V2.0 已核信息，出发前仍需复核。

## 六、验收决定（2026-10-31）

- A1：按现状验收 152 张成品，59 处保留“待补图”。
- B3：不再扩大图源、不补图，维持现有 152 张。
- C：不做额外人工逐张核验。
- 追加 B2 尝试（2026-10-31）：接入 Openverse（Flickr CC/Wikimedia 镜像）与定向 Commons 检索，新增 1 张（海大南门），其余候选因无「地点精确匹配 + 可再分发许可」被拒；总数 153。
- 交付 ZIP 不再变更，SHA-256：`5175f32406e3cd64887106c3ac61a8908916f3c1953fe65a1861f4834fe2cb16`。

## 七、复现命令

```bash
cd /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/Hainan-Travel-Guide
python3 scripts/discover.py        # 图源发现
python3 scripts/download.py        # 下载/去重/优化
python3 scripts/build_html.py      # 生成离线 HTML
python3 scripts/package.py         # 生成台账与 ZIP
python3 scripts/qa.py              # 真实 QA
```