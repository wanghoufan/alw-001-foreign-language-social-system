# N06 原型 R2-B 独立交互实测

- 日期：2026-11-09
- 实测员：ALW-001 N06 独立交互实测员（R2-B）
- 目标文件：`docs/design/prototype/n06/standalone-test/standalone.html`（10,139,113 bytes）
- 运行环境：Chrome/156.0.8078.81，`--headless=new`，`mkdtemp` 临时 `user-data-dir`，`file://` 直开，393×852 / DPR 2 移动模拟
- 实测脚本：`r2-evidence/r2-measure.mjs`
- 机器可读结果：`r2-evidence/R2-B-result.json`
- 原始日志：`r2-evidence/r2-measure-run.log`
- 边界：未修改原型源码（`index.html`、`assets/*`）；未占用用户 Chrome/profile；未 commit；未动 `socialmate-v1.2`

## 一、既有验证脚本复核

在 `docs/design/prototype/n06` 运行 `node verify-standalone.mjs`：

| 项目 | 结果 |
|---|---|
| 通过 / 失败 | **103 PASS / 0 FAIL** |
| 退出码 | 0 |
| 截图 | 20 张（`screenshots-standalone/`） |
| 脚本安全性 | `--headless=new` + `mkdtemp` 临时 profile，未打开可见窗口、未占用用户 profile |
| 日志 | `r2-evidence/verify-standalone-run.log` |
| 结果文件 | 脚本正常更新 `verify-standalone-result.json`（本轮 21:06） |

结论：既有脚本 103 项全部通过；审查报告指出的缺口是「交互覆盖不足」，不是现有断言失败。

## 二、独立实测总览

**45 PASS / 0 FAIL / 2 BLOCKED / 26 张截图 / 3 条观察**。JS 异常 0、资源加载失败 0。

### 2.1 海南详情

| 交互 | 操作步骤 | 预期 | 实测结果 | 截图 | 判定 |
|---|---|---|---|---|---|
| A1 详情打开 | 打开 `#hainan/3` | 骑楼老街、3 图、有上一张/下一张 | h2=骑楼老街，slides=3，3 张图 naturalWidth>0，计数 1 / 3，prev/next 按钮存在 | r2-01-hainan-detail-393.png | PASS |
| A2 画廊下一张 | 点 `[data-act=gallery-next]` | 计数 2 / 3、圆点第 2 个 | 计数 2 / 3，dotsOn=1，scrollLeft=298 | r2-02-gallery-next-393.png | PASS |
| A3 画廊上一张 | 点 `[data-act=gallery-prev]` | 回到 1 / 3、圆点第 1 个 | 计数 1 / 3，dotsOn=0 | r2-03-gallery-prev-393.png | PASS |
| A4 全屏打开 | 点详情“全屏看图” | lightbox 打开、1 / 3、图片解码、hash 带 full | on=true，1 / 3，imgLoaded=true，hash=#hainan/3/full/1，提示“可用 3 张 · 其余待核实” | r2-04-lightbox-first-393.png | PASS |
| A5 全屏下一张 | 点 `[data-act=lb-next]` | 2 / 3、hash full/2 | 2 / 3，imgLoaded=true，hash=#hainan/3/full/2 | r2-05-lightbox-next-393.png | PASS |
| A6 全屏退出 | 点 `[data-act=lb-close]` | 关闭、恢复滚动、hash 回详情 | on=false，body.overflow=''，hash=#hainan/3 | — | PASS |
| A7 默认段 | 读分段条 | 3 段、第 1 段、标题与英文对应 | 3 个段按钮，on=0，“第一次带朋友走骑楼”，英文含 “We walked in from the clock tower side”，默认 2 条表达 | — | PASS |
| A8 段落切换 | 点“第 2 段” | 标题/英文/表达同步换 | on=1，“傍晚再走一次”，英文含 “I went back in the evening”，2 条表达 | r2-06-seg-switch-393.png | PASS |
| A9 展开全部表达 | 点“展开全部 3 条表达” | 2 → 3 条，按钮变“收起表达” | exp 2→3，按钮“收起表达”，3 条中文表达全部渲染 | r2-07-expand-all-393.png | PASS |
| A10 粘贴到本段弹层 | 第 2 段点“粘贴到本段” | 弹层、单段模式、确认初始禁用 | on=true，标题“粘贴到本段”，single 段选中，`#importConfirm`.disabled=true | — | PASS |
| A11 单段识别预览 | 输入单段文本（3 表达 + 中文段 + 英文段） | 1 段 / 3 条表达、确认启用 | “识别到 1 段 / 3 条表达，可确认导入。”，preview-block=1，disabled=false | r2-08-import-single-preview-393.png | PASS |
| A12 确认合并 | 点“确认导入” | 合并到当前第 2 段、表达 3→6、中文段替换 | 弹层关闭，toast“已合并到当前段（原型临时）”，仍第 2 段，DOM 中 6 条表达，中文段替换为新文本 | r2-09-import-single-merged-393.png | PASS |

### 2.2 更多面板 / 我的作品

| 交互 | 操作步骤 | 预期 | 实测结果 | 截图 | 判定 |
|---|---|---|---|---|---|
| B1 更多面板 | 点顶栏 `[data-act=more]` | 主题 3 项、范围与边界、版本、可关闭 | 标题“更多 · 原型设置”，主题浅色/深色/跟随系统，当前浅色，含“范围与边界”，有关闭按钮 | r2-10-more-panel-393.png | PASS |
| B2 关闭 | 点面板关闭 | 弹层关闭 | modal.on=false | — | PASS |
| C1 作品列表 | `#topics/works` | 11 条、全部/A/B/C chip | “11 个作品”，11 张卡，chips=全部/A 类/B 类/C 类 | — | PASS |
| C2 B 类筛选 | 点“B 类” | 有数据、DEMO-B1、标分类示范补充 | “1 个作品”，DEMO-B1“单词卡片 · Word Cards”，meta“B 类 · 分类示范补充” | r2-11-works-b-393.png | PASS |
| C3 C 类筛选 | 点“C 类” | 有数据、DEMO-C1 | “1 个作品”，DEMO-C1“社区活动板 · Community Board” | r2-12-works-c-393.png | PASS |
| C4 作品分享入口 | 打开 DEMO-B1 详情，点“分享作品” | 入口可点、弹层含系统分享/复制/中英预览 | 按钮存在且文本“分享作品”；弹层标题“分享作品 · 单词卡片 · Word Cards”，含“调起系统分享”“复制中英介绍”，预览中文 75 字、英文 263 字 | r2-13-work-share-panel-393.png | PASS |

### 2.3 聊天

| 交互 | 操作步骤 | 预期 | 实测结果 | 截图 | 判定 |
|---|---|---|---|---|---|
| D1 默认聊天 | 打开 `#chat` | 分享/换题控件、3 人物、接话/追问、3 标签 | 按钮“分享 / 换题”；3 个 option；3 个气泡；接话 “That sounds like the right call…”，追问非空；标签：地点·骑楼老街 / 节日·选一个最近话题 / 人物·Oliver Reed | r2-14-chat-default-393.png | PASS |
| D2 分享/换题面板 | 点“分享 / 换题” | 2 个固定话题、预览、系统分享入口 | 标题“分享 / 换题”，话题“训练与轻松跑·当前”“周末骑行”，预览 18 字，存在“调起系统分享” | r2-15-chat-share-panel-393.png | PASS |
| D3 换题 | 点“周末骑行” | 关闭弹层、话题/接话/追问同步换 | 弹层关闭，pill“固定示例 · 话题：周末骑行”，接话 “Keeping it flat…”，追问 “How long do you usually ride…” | r2-16-chat-topic-switched-393.png | PASS |
| D4 切换人物 | select 切到 maya | 接话/追问换样本、人物标签变 Maya | selected=maya，接话 “Hand-drawn posters…”，追问 “Do you start with the bands…”，人物标签 Maya Torres，地点标签仍骑楼老街 | r2-17-chat-person-maya-393.png | PASS |
| D5 标签变化范围 | 对比切换前后 3 个标签 | 人物变；地点/节日是否变需记录 | 人物变 Maya Torres；地点仍“骑楼老街”；节日仍“节日 · 选一个最近话题”（数据 placeId 三位共用、节日为固定入口） | — | PASS（附观察） |
| D6 地点标签 | 点地点标签 | 弹层“关联地点 · 骑楼老街” | 标题正确，问句“你所在的城市也有这种带走廊的老街吗？”，有复制按钮 | r2-18-chat-tag-place-393.png | PASS |
| D7 节日标签（Maya） | 点节日标签 | 候选列表 + 不按国籍推断说明 | 标题“节日 · 选一个最近话题”，4 张候选卡，含“不推断对方是否庆祝，也不按国籍推断” | r2-19-chat-tag-festival-393.png | PASS |
| D8 人物标签 | 点人物标签 | 标题 Maya Torres、已确认问句 | 标题“人物 · Maya Torres”，问句“最近有为本地乐队做新海报吗？” | r2-20-chat-tag-person-393.png | PASS |
| D9 切回 Oliver 节日标签 | select 切回 oliver，点节日标签 | 控件仍可用并给出候选 | 标题同前，4 张候选卡（阵亡将士纪念日/双十一/七五三/国际大学生节），与 Maya 下完全一致 | r2-20b-chat-tag-festival-oliver-393.png | PASS（附观察） |

### 2.4 关于我

| 交互 | 操作步骤 | 预期 | 实测结果 | 截图 | 判定 |
|---|---|---|---|---|---|
| E1 整页 | 打开 `#self` | 5 条、搜索、分类、中英可见 | 5 条、5 卡；分类 chip 全部/生活/经历/兴趣；英文元素全部有高度 | r2-21-self-fullpage-393.png（整页 786×3258） | PASS |
| E2 搜索 | 输入“城市” | 5 → 1 条 | “1 条”，1 卡，标题“我待过的城市” | r2-22-self-search-393.png | PASS |
| E3 分类 | 清空搜索后点“兴趣” | 3 条、chip 选中 | “3 条”，3 卡：喜欢自己做软件 / 健身和锻炼 / 咖啡；chip 兴趣选中；搜索值已清空 | r2-23-self-cat-interest-393.png | PASS |

### 2.5 四宽度横向溢出

375 / 393 / 430 / 520 四档，每档同时检查 `documentElement.scrollWidth`、`body.scrollWidth` 与「非横向滚动容器内、right 超出视口」的元素。

| 页面 | 375 | 393 | 430 | 520 | 判定 |
|---|---|---|---|---|---|
| 海南列表 | doc/body=375，越界元素 0 | 393，0 | 430，0 | 520，0 | PASS |
| 海南详情 | 375，0 | 393，0 | 430，0 | 520，0 | PASS |
| 全屏 | 375，0 | 393，0 | 430，0 | 520，0 | PASS |
| 导入弹层 | 375，0 | 393，0 | 430，0 | 520，0 | PASS |
| 关于我 | 375，0 | 393，0 | 430，0 | 520，0 | PASS |

补充截图：`r2-24-width-375-detail.png`（750×1704）、`r2-25-width-520-self.png`。

### 2.6 字号抽查（5 个页面，393 宽）

统计口径：所有 CSS 可见、且直接含非空文本节点的元素；`button` 记为按钮，`.card` 后代记为卡片，其余块/行内文本记为正文。

| 页面 | 可见文本元素 | <14px | 14–18px | ≥19px | 正文 min | 卡片 min | 按钮 min | 最小字号样本 |
|---|---|---|---|---|---|---|---|---|
| 话题/节日 | 84 | 0 | 74 | 10 | 14 | 14 | 15 | kicker“话题 · 示范”、demo-pill“示范” 14px |
| 海南列表 | 108 | 0 | 89 | 19 | 14 | 14 | 15 | kicker、demo-pill、notice“示范原型…” 14px |
| 海南详情 | 86 | 0 | 73 | 13 | 14 | —（本页无 .card） | 15 | kicker、demo-pill、zoomhint“点击全屏” 14px |
| 聊天 | 61 | 0 | 56 | 5 | 14 | —（本页无 .card） | 15 | kicker、demo-pill、chip pill 14px，“开始”按钮 16px |
| 关于我 | 56 | 0 | 44 | 12 | 14 | 14 | 15 | kicker、demo-pill、notice 14px |

判定：5 个页面均无 **<14px** 文本，最小 14px；正文主段与卡片标题 ≥19px。

## 三、观察与风险（不计入 FAIL）

1. **节日候选与人物无关联（D9）**：Maya 与 Oliver 下候选完全相同——阵亡将士纪念日（英国）、双十一（中国）、七五三（日本）、国际大学生节（国际）。候选来自全局 `festivalList`，未按人物地区/上下文过滤；文案虽写明“不推断对方是否庆祝，也不按国籍推断”，但英国联系人仍会看到中日节日候选。审查报告曾称“Oliver 固定推荐美国感恩节”，在本次「未来 14 天（2026-11-09 起）」窗口内**未复现感恩节**（2026-11-26 不在窗口），实际固定的是上述 4 个候选。控件可用，但“不按人物过滤”的设计风险仍存在。
2. **三位人物共用地点标签**：`chatDemo.tags.placeId` 均为 3，切换人物不更换地点标签；节日标签是固定入口文案，不是按人物动态生成。
3. **导入后展开状态保留**：A9 展开第 2 段后，单段合并导入仍保持展开，导入后直接显示 6 条（按钮为“收起表达”）。属交互状态保留，不是缺陷。
4. **字号口径**：本轮任务只要求分布与 <14px 检出，未按“正文基准 19px / 其他正文类 ≥15px”逐项判 FAIL。14px 主要集中在 kicker、demo-pill、zoomhint、notice 等原型标注与辅助说明；其中“示范原型 · …”notice 正文为 14px，若按项目全局字号规则（辅助说明 ≥15px）属可优化项，建议后续核对。

## 四、BLOCKED（无法在本环境可信判定）

| 项 | 原因 |
|---|---|
| H1 轮播触摸滑动手势 | 本轮按任务要求只测上一张/下一张按钮；CDP 合成触摸滑动与 scroll-snap 吸附判定在无头环境无法给出可信结论，未测。 |
| H2 真机 / OPPO 密度 / 系统分享实际调起 | 本轮限定无头 Chromium + file://；系统分享面板、真机密度与厂商浏览器不在本任务范围。系统分享入口（`navigator.share`）在无头环境不可用，原型会回退复制，本轮未触发该分支。 |

## 五、脚本断言修正记录（非原型缺陷）

首次运行时 `A12` 判 FAIL：脚本预期“导入后默认折叠、按钮为展开全部 6 条表达”，但 A9 的展开状态被原型保留，实际直接显示 6 条、按钮为“收起表达”。核实为**脚本断言未考虑既有展开状态**，不是原型缺陷；修正断言（接受展开态 6 条）后重跑，45/45 PASS。原型源码未改动。

## 六、结论

- 任务列出的必做交互均已通过无头浏览器实测并留痕：海南详情逐段/段落切换/展开、画廊上一张下一张、全屏下一张与退出、更多面板、B/C 分类与作品分享、聊天分享换题与人物切换/三段标签、关于我整页与搜索分类、四宽度无溢出、5 页字号分布。
- 0 FAIL；2 项 BLOCKED 已在第四节写明原因。
- 仍需人工/真机补验：触摸滑动、OPPO 密度、系统分享真实调起；以及“节日候选不按人物地区过滤”的产品口径。

## 七、产物清单

```text
docs/design/n06-review/
├── R2-B-interaction.md
└── r2-evidence/
    ├── r2-measure.mjs
    ├── r2-measure-run.log
    ├── verify-standalone-run.log
    ├── R2-B-result.json
    └── r2-01 … r2-25、r2-20b（共 26 张 PNG）
```