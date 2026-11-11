# N06 阶段 1 复审 · R2-A 代码核对

- 核对对象：`docs/design/n06-review/REPORT.md`（写于 2026-11-09 19:52，快照 19:47）提出的 P0 1–5、P1 6–12、P2 13–17
- 核对时间：2026-11-09 21:11 CST
- 核对方式：只读读取原型源码、独立种子、`verify-standalone.mjs`、`standalone-build.json`、`verify-standalone-result.json` 与 standalone 截图；另计算哈希与数据统计
- 边界声明：未修改任何原型源码/构建产物，未运行构建，未重跑验证脚本，未 commit，未触碰 `socialmate-v1.2`，未跑全量回归
- 编号口径：REPORT §11「建议（按优先级）」的编号（P0=1–5、P1=6–12、P2=13–17），与 §9 现象表编号不同

## 0. 本轮快照（哈希前 12 位）

| 文件 | mtime | SHA-256（前 12 位） | 与 REPORT 快照对比 |
|---|---|---|---|
| `index.html` | 2026-11-09 11:44:18 | `ec07b6146e76` | 未变 |
| `assets/app.js` | 2026-11-09 20:57:48 | `efa789bc6788` | 已变（原 `d97b77f0448c`） |
| `assets/app.css` | 2026-11-09 20:54:21 | `fce202011cfa` | 已变（原 `b7c88496207f`） |
| `assets/data.js` | 2026-11-09 20:55:16 | `2fcf68abed93` | 已变（原 `0c8483fe3ffa`） |
| `assets/repo-data.js` | 2026-11-09 11:42:00 | `0796aaf57612` | 未变 |
| `assets/festivals-47-seed.json` | 2026-11-09 20:52:09 | `6481f921127c` | 新增文件 |
| `verify-standalone.mjs` | 2026-11-09 20:55:49 | `b70a19cb514d` | 新增/更新 |
| `standalone-build.json` | 2026-11-09 20:57:56 | `8b4568e8a777` | 新增/更新 |
| `verify-standalone-result.json` | 2026-11-09 20:59:10 | `c0d1fa0e55f1` | 新增/更新 |
| `standalone-test/standalone.html`（产物） | 2026-11-09 20:57 | `cab486e6e90f` | 新增（10,139,113 字节） |

三态对齐核对（本轮证据可用性前提）：

- `standalone-build.json`：`generatedAt=2026-11-09T12:57:56.060Z`（=20:57:56 CST），`outputSha256` 前 12 位 `cab486e6e90f`，`outputBytes=10139113`。
- `verify-standalone-result.json`：`targetSha256` 前 12 位 `cab486e6e90f`，`targetBytes=10139113`，`result=PASS`，`checks` 103 项全 `ok`，`errors=0`，`failedRequests=0`，`shots=20`。
- 结论：结果文件与当前构建产物同一版；源码 `app.js` 20:57、`data.js` 20:55 均早于构建 20:57:56，未见构建后改源码。本轮引用成立。

## 1. P0 / P1 / P2 逐项核对

| 编号 | 原审查问题（REPORT §11 摘要） | 当前代码证据（文件:行号） | 判定 | 说明（修复方式 / 残留缺口） |
|---|---|---|---|---|
| P0-1 | 切换聊天人物只改称呼，对话/接话/追问/地点节日标签不变 | `assets/data.js:1811–1842`（Oliver chatDemo 两个话题）、`assets/data.js:1884–1915`（Maya）、`assets/data.js:1957–1988`（Ji-eun）；`assets/app.js:869–875`（按 `person.slug` 取 chatDemo）、`assets/app.js:879–885`（按话题取 messages/coach）、`assets/app.js:897–900`（接话/追问均带 `依据`） | 已修 | 每个人物有独立对话、接话与追问；`app.js:902` 与 `app.js:911` 明示「固定示例、不调用云端 AI」。地点标签仍固定 `placeId: 3`，但已改写为「我这边的地方，用于我主动分享，不代表对方行程」（`data.js:1841/1914/1987`），不再被误读为按人物推断。断言见 `verify-standalone.mjs:586`、`:600–601` |
| P0-2 | 「待确认」内容其实已在对话里由对方说出，削弱事实/建议分区 | `assets/data.js:1773`（Oliver 待确认＝目标完赛时间，未聊到）、`assets/data.js:1855`（Maya 待确认＝具体日期，未定）、`assets/data.js:1928`（Ji-eun 待确认＝是否发布照片系列，未聊到）；对话原文 `data.js:1778–1799`、`:1860–1873`、`:1932–1945` 均不再出现对应陈述 | 已修 | 三处待确认已改为「尚未讨论」的事项；`app.js:985`「不要当事实」保留。断言见 `verify-standalone.mjs:254–257`（dataAudit 判定）与 `:269`、`:674` |
| P0-3 | 页面声明「分享换题 / 均已保留」但无对应控件 | `assets/app.js:895`（`分享 / 换题` 按钮）、`assets/app.js:951–961`（换题弹层 + 系统分享/复制 + 话题切换）、`assets/app.js:509`（作品详情「分享作品」）、`assets/app.js:526–532`（作品分享弹层 + 文本）、`assets/app.js:99–107`（`navigator.share` 不可用回退复制）；文案 `app.js:446`、`:480` 已与实际能力对齐 | 已修 | 声明与实现一致；`verify-standalone.mjs:606`、`:611`、`:639`、`:653` 断言通过，截图 `s16_work_share_393.png`、`s17_chat_share_393.png` |
| P0-4 | `__n06ImgError` 5 秒后把仍在加载的图判成「加载失败」 | `assets/app.js:128–141`（三态 `ok/failed/pending`）、`assets/app.js:142–173`（3 秒只亮 `slowhint`，之后 300ms 轮询，最多 60 秒，只有 `complete && naturalWidth===0` 才隐藏图片）、`assets/app.js:174–180`（`load` 恢复显示） | 已修 | 已改为「加载慢≠失败」。断言用注入假图实测 3.6 秒：`verify-standalone.mjs:537–558`（只出「加载较慢」不隐藏；失败后才亮缺图） |
| P0-5 | 缺图地点仍统一写「来源：现有归档 01–03.webp」 | `assets/app.js:71–89`（`sourceLine()` 按 `slotState` 分「现有归档 / 按清单排除 / 无归档」三组，只列真实槽位）、`assets/app.js:684–692`（来源明细折叠）；数据 `assets/data.js:249–262`（龙兴路 `photos: []` + `photoExclusions` 槽位 1） | 已修 | 龙兴路现显示「第 1 张按清单记录排除；第 2–3 张无归档」，`verify-standalone.mjs:575–576` 断言通过，截图 `s05_missing_photo_393.png`（0/3 可用、已排除 1、缺图 2） |
| P1-6 | 补逐段导入实测/截图；补段落切换、展开、更多、画廊 prev/next 断言 | 断言 `verify-standalone.mjs:373–381`（画廊 prev/next 连续切换）、`:389`（更多）、`:399–403`（段落切换）、`:426–434`（单段粘贴识别→确认→展开）；交互实现 `app.js:769–866`、`:1206–1209`；截图 `s11`、`s12`、`s13`、`s14` | 已修 | 5 类交互全部有可执行断言与截图；单段合并还验证了「段数不变、表达 4→6、写入历史」 |
| P1-7 | 作品补 1 条 B、1 条 C 样本；补分享或明确不做 | `assets/data.js:1994–2004`（DEMO-B1，`cat:'B'`）、`assets/data.js:2005–2013`（DEMO-C1，`cat:'C'`）；接入 `assets/data.js:2028–2031`；界面 `app.js:468`（明示 9 条 A + B/C 为示范补充）、`app.js:472–480`、`app.js:509`、`app.js:1147–1149` | 已修 | `verify-standalone.mjs:619`（搜索 11→1）、`:625`、`:630`（B/C 不是死路且带「分类示范补充」标签）、`:639`、`:653`（分享带中英介绍）；截图 `s15`、`s16` |
| P1-8 | 补「关于我」整页截图；补「操作顺序」文档 | 截图 `verify-standalone.mjs:669` 生成 `screenshots-standalone/s18_self_393.png`（实测 5 条、中英同屏）；操作顺序文档不在本次只读授权范围（仅允许源码与 verify 三件），未核 | 部分修复 | 截图已补齐并有断言（`verify-standalone.mjs:664–668`）；`验证说明.md`/`截图索引.md` mtime 20:24（晚于 REPORT），但内容本轮不得读取，故不能判定「操作顺序」已写 |
| P1-9 | 节日补 `source_urls/verified_at/related_place_ids/holiday_type`、补海南节日、提供 47 条独立种子 | `assets/festivals-47-seed.json`（47 条，15 字段）；`assets/data.js:271–1748`（内嵌同一份 JSON，深比较与种子完全一致）、`assets/data.js:1748–1759`（转 camelCase 并保留 `sourceUrls/verifiedAt/relatedPlaceIds/holidayType`）；渲染 `app.js:375–378`、`:393` | 已修 | 47 条、4 个海南专属节日、字段齐全。残留：`source_urls` 仅 29/47 非空，其中 9 条 `status=fixed` 却无 URL；`holiday_type` 无 `makeup_workday` 样本（详见第 3 节） |
| P1-10 | 补旧记录兼容样例（`enVariants`/旧 B 版本/`sourceSpan`/练习日志） | `assets/data.js:50–68`（`rec-qilou-legacy`：`legacy:true`、`enVariants`、`sourceSpan`、`practiceLog`、双版本 history）；渲染 `app.js:715`、`:722–729`（旧 B 版本默认折叠、`sourceSpan`、练习日志） | 已修 | 断言 `verify-standalone.mjs:409–414`（recordId/sourceSpan/练习日志保留、B 版本默认折叠、展开后才可见） |
| P1-11 | verify 阈值放宽、字号只查一页、elementFromPoint 只查首图 | `verify-standalone.mjs:343–344`（90–150 字 / 60–95 词，已收紧到计划口径）、`:692–719`（6 路由 × 4 宽度、字号检查扩到 6 页）、`:325`（`gallery.every(imgShown) && gallery[0].hitIsImg`） | 部分修复 | 阈值与页面覆盖已修；`elementFromPoint` 仍只取 `gallery[0]`，断言名「详情图片可见且 elementFromPoint 命中 IMG」仍强于实测范围。另 `:718` 的「正文字号 ≥19px」实际只校验 `body` 与 `h1`，逐元素 ≥19 未断言（`:719` 只兜底 ≥14px） |
| P1-12 | `Haikou/001/01.webp` 无 manifest 却当真实首图展示，需标「许可待核」或换图 | `assets/data.js:249–262`（该图进入 `photoExclusions`，`photos: []`，reason 写明「PHOTO_MANIFEST.csv 无此文件记录，来源与许可均未登记」）；`app.js:40–46`、`:645–649` 渲染为「已排除（待核实）」 | 已修 | 不再展示该图；构建记录 `excludedImageCount=11` 且未内嵌（`verify-standalone-result.json` checks 第 7–8 项） |
| P2-13 | 「复制问句」按钮换行、chipbar 左 chip 被裁 | `assets/app.css:337–339`（footer meta 省略号 + `.btn{white-space:nowrap;flex:0 0 auto}`） | 部分修复 | 按钮已单行：截图为证 `screenshots-standalone/s01_topics_festival_393.png`；`screenshots-standalone/s07_works_393.png` 左侧 chip 仍只露出边缘（`app.js:306–310` 把激活 chip 居中，滚动后首 chip 必然被裁），该半项未修 |
| P2-14 | 「示范」胶囊、kicker「示范/虚构演示」、来源行、聊天两段说明应限定在审查模式 | `assets/app.js:282–287`（kicker 固定含「示范/固定示例/虚构演示」）、`app.js:303`（`demo-pill` 无条件输出）、`app.js:677`（「示范改写」）、`app.js:902`、`:909`、`:911` | 未修 | 无审查模式开关，标注仍会原样进入正式 UI 截图 |
| P2-15 | 修正 `截图索引.md` 的「中英同屏」「标签位于最下方」，补「关于我」条目 | 文档不在本次只读授权范围，未读取；仅确认 `s18_self_393.png` 已生成 | 不适用 | 本轮不能判定文档表述是否已改；文件 mtime 20:24 晚于 REPORT，建议由可读文档的复审员补核 |
| P2-16 | 「AI 话题建议」是静态数据却没标静态样本 | `assets/app.js:987`（「静态示范 / 非 AI 生成 · 非已确认」）、`app.js:999`（标题改「示范问句（静态样本）」）；数据 `assets/data.js:1807–1810`（caution 明示静态） | 已修 | 断言 `verify-standalone.mjs:676` 明确要求页面不再出现「AI 话题建议」 |
| P2-17 | 浅色默认与全局 `SYSTEM` 默认冲突，需书面确认 | `index.html:2`（`data-theme="light"`）、`index.html:10–13`（无存储时回退 light）、`app.js:200–204`（`applyStoredTheme` 默认 light）、`app.js:1008–1010`（提供浅色/深色/跟随系统三档，默认浅色） | 未修 | 代码仍按计划「浅色默认」实现；这是计划与全局规范的冲突，需用户拍板后才能判定，不能由代码自行改 |

判定统计：**已修 11 项（P0 1–5、P1 6/7/9/10/12、P2 16）｜部分修复 3 项（P1 8/11、P2 13）｜未修 2 项（P2 14/17）｜不适用 1 项（P2 15）**，合计 17 项。

## 2. 阶段 1 六项「证据覆盖不足」的交互：当前断言对照

以 `verify-standalone-result.json` 的 `checks`（103 项，全 `ok`）为准，逐项核对 REPORT §3/§4 标为「证据覆盖不足」的交互。

| 交互 | 旧缺口 | 当前实测证据（`verify-standalone.mjs` 行号 / 检查名） | 判定 |
|---|---|---|---|
| 逐段粘贴到当前段 | 只有代码，无断言/截图 | `:426`「单段粘贴识别为 1 段 / 2 条表达」、`:431`「单段确认后段数不变、当前段表达 4 → 6 且写入历史」；截图 `s14` | 已覆盖 |
| 段落切换 | 只有代码 | `:399`「段落切换：第 2 段选中且标题同步」、`:403`「可退回第 1 段」；截图 `s13` | 已覆盖 |
| 展开全部表达 | 只有代码 | `:434`「展开全部后当前段显示 6 条表达」 | 已覆盖 |
| 顶部「更多」按钮 | 无断言/截图 | `:389`「更多按钮打开原型设置与范围说明」；截图 `s12` | 已覆盖 |
| 画廊左右按钮 | 无断言 | `:373`「下一张切到 2/3 且确实滚动」、`:378`「连续下一张到 3/3」、`:381`「上一张退回 2/3」；截图 `s11` | 已覆盖 |
| 画廊触摸滑动（手势） | 未测真实手指 | checks 名单中无滑动/触摸项 | **仍无断言** |
| B / C 分类筛选 | 点击后为空（死路） | `:625`「B 类筛选不是死路且标为分类示范补充」、`:630`「C 类…」；截图 `s15` | 已覆盖 |
| 切换聊天人物 | 只改称呼 | `:600`「对话、话题与接话都换成该人物样本」、`:601`「不再残留 Oliver 训练建议」；截图 `s06c` | 已覆盖 |
| 聊天三个关联小标签 | 存在但未断言 | `:588`（三个标签）、`:593`（节日标签给出可选话题且声明不推断） | 已覆盖 |
| 分享 / 换题 | 控件缺失 | `:606`（控件 + ≥2 固定话题）、`:611`（换题后同步切换且弹层关闭）；截图 `s17` | 已覆盖 |
| 作品分享 | 缺失 | `:639`（入口）、`:653`（调用系统分享并带中英介绍）；截图 `s16` | 已覆盖 |
| 关于我整页（搜索/中英/清空） | 无截图 | `:664`、`:665`、`:668`；截图 `s18` | 已覆盖 |
| 海南列表搜索（`#hainanSearch`） | 仅代码检查 | checks 名单无海南搜索项；`grep hainanSearch` 在脚本 0 命中 | **仍无断言** |
| 海南城市 chip 筛选 | 未断言 | checks 名单无「城市/全部城市」项 | **仍无断言** |
| 话题包页（日常生活/文化习俗/健身运动） | 未断言 | checks 名单只覆盖节日页与「更多」；无话题包内容项 | **仍无断言** |
| 作品新建 / 编辑 / 移入回收站 / 恢复 | 未断言 | checks 只覆盖搜索、B/C 分类、详情分享 | **仍无断言** |
| 关于我「＋新增 / 编辑」 | 未断言 | checks 只覆盖搜索与中英显示 | **仍无断言** |
| 人物「编辑 / 保存」 | 未断言 | checks 只覆盖事实分区、问句与历史 | **仍无断言** |
| 聊天「开始」演示字幕条 | 未断言 | checks 无 `chat-start` 相关项 | **仍无断言** |
| 主题「跟随系统」 | 未断言 | 只有 `:684` 深色、`:690` 深色刷新保持；无 `system` 项 | **仍无断言** |
| OPPO PLG110 真机密度 | NOT_RUN | 仍为无头 Chrome 393×852 DPR2（`:692–704` Emulation） | **仍无证据** |

小结：REPORT 点名的 5 类「证据不足」交互（单段导入、段落切换、更多、画廊 prev/next、B/C 分类）**全部补齐**；聊天人物切换、分享换题、作品分享、关于我整页也一并补齐。仍无实测的是 8 项：海南搜索、城市筛选、话题包页、作品新建/编辑/回收站、关于我新增/编辑、人物编辑、聊天开始字幕、跟随系统；另有触摸手势与 OPPO 真机 2 项环境类缺口。

附带发现：`screenshots-standalone/` 共 20 张，`verify-standalone-result.json` 的 `shots` 也是 20，截图与结果同批生成，未见「只写说明不产图」。

## 3. 47 节日种子与接入核对

实测命令：直接 `JSON.parse` 种子文件，并从 `data.js` 抽出内嵌数组做深比较。

| 核对项 | 实测结果 | 证据 |
|---|---|---|
| 条数 | 47 条 | `assets/festivals-47-seed.json`；`assets/data.js:271–1748` |
| data.js 接入条数 | 47 条，与种子 `JSON.stringify` 完全一致（顺序、字段全同） | 脚本深比较输出 `deep equal true`；`data.js:1748–1759` 映射为 `N06.festivals` |
| 字段完整性 | 15 个顶层字段全部出现：`id, cn, en, country_region, theme, date_rule, dates_2026_2027, status, holiday_type, cn_brief, en_brief, questions, related_place_ids, source_urls, verified_at` | 种子逐条 `Object.keys` 并集 |
| `dates_2026_2027` | 47/47 都是 2 个日期 | 同上 |
| `verified_at` | 47/47 均为 `2026-11-09` | 同上 |
| `source_urls` | 29/47 非空；18 条为空，其中 **9 条 `status=fixed` 却无 URL**（万圣节、共和国日、甘地诞辰日、元旦、国际妇女节、国际大学生节、圣诞节、双十一、世界地球日） | 脚本过滤结果 |
| `related_place_ids` | 13 条非空，指向原型实际存在的 13 个地点 id（3/4/9/43/62/71/78/88/97/99/115/1） | 种子 + `data.js` places |
| `holiday_type` | `public_holiday` 24、`festival_day` 15、`observance` 8、`makeup_workday` **0** | 分布统计 |
| `status` | `fixed` 21、`pending` 26 | 分布统计 |
| 海南专属节日 | **4 个**：军坡节（公期）、海南换花节、三月三（黎族苗族）、海南国际旅游岛欢乐节 | `country_region="中国·海南"` |
| 地区覆盖 | 中国、中国·海南、爱尔兰、英国、英国·苏格兰、美国、日本、韩国、泰国、印度、新加坡、国际（12 类） | 种子去重 |

结论：REPORT P1-9 的三项硬缺口（字段、海南节日、独立种子文件）已闭合，页面「全部」也实测渲染 47 张卡片（`verify-standalone-result.json`「「全部」展示全部 47 个候选节日」）。

需注意的口径问题（不是「没做」，是「断言宽于事实」）：

1. `verify-standalone.mjs:264` 的 `missing` 判定只用 `Array.isArray(f.sourceUrls)`，空数组也算「齐全」；因此 `:272` 的检查名「…来源/核实日期/关联地点齐全」通过，但 9 条 `fixed` 实际没有来源 URL。
2. 这 9 条在 UI 上同时显示「日期已核对」+「未取得可靠出处，日期按待确认处理」（`app.js:382`、`app.js:377`），卡片内两种口径并存；建议要么补 URL，要么把 `status` 降为 `pending`。
3. `holiday_type` 无 `makeup_workday` 样本，`app.js:375` 的「调休上班日」标签有代码、无数据，无法证明「节日本日 / 公共假期 / 补休」三态都被演示。

## 4. 结论

### 4.1 阶段 1 能否由 PARTIAL 升级

**不能升为 PASS，但可以明确「P0 已清零」。** 建议判定表述改为：`PARTIAL（P0 已修，仅剩证据覆盖与验收口径缺口）`，性质从「存在误导性结论」变为「可进入复审」。

依据：

- 5 个 P0 全部在当前代码中修好，并有独立断言 + 截图，不是自述：`data.js:1773/1855/1928`、`app.js:71–89`、`app.js:128–173`、`app.js:869–961`、`app.js:509/526–532`。
- 阶段 1 第 3 项原先「证据覆盖不足」的 5 类交互全部补齐断言，证据从「代码里看得到」升级为「脚本跑得过」。
- 仍不能 PASS 的原因：OPPO/真机/触摸未测（第 4 项 NOT_RUN 未变）、V5 缺图原因不可证实（第 1 项 NOT_RUN 未变）、8 项交互仍无断言、「操作顺序」文档本轮无法核。

### 4.2 仍必须修的最小项

**P0：无。** 未发现仍会误导审批判断的 P0 级残留。

**P1（阶段 1 复审前建议修，按收益排序）：**

1. `elementFromPoint` 覆盖到 3 张详情图（现 `verify-standalone.mjs:325` 只验 `gallery[0]`），或把检查名改成「首图命中 IMG」，避免断言名继续强于实测。
2. 处理 9 条 `fixed` 但 `source_urls` 为空的节日：补官方 URL，或把 `status` 改为 `pending`；同时把 `verify-standalone.mjs:264` 的来源判定收紧为「非空且 status=fixed 才要求有 URL」。
3. 补 1 条 `makeup_workday` 样本，或从 UI/文档删掉「补休」表述，让「三态」与实际数据一致。
4. 「操作顺序」文档（打开哪个文件 → 点哪些按钮 → 预期看到什么）需由可读文档的复审员确认；本轮只能确认截图已补。
5. chipbar 左端裁切（`s07` 可见）：可改为「首 chip 起点对齐」或给 chipbar 加左右内边距，避免激活项居中时把首 chip 切成一条边。

**P2（收口项）：**

6. 节日卡日期 chip 年份重复显示为「2026 · 2026-11-11」（`app.js:387–388` 把年份与完整日期同时拼出，`s01` 可复现），建议只显一个年份。
7. 「示范」胶囊 / kicker / 「示范改写」/ 两段聊天说明仍未隔离到审查模式（P2-14），正式 UI 前需加开关。
8. 浅色默认与全局 `SYSTEM` 默认的冲突仍需用户书面拍板（P2-17），代码方向正确但口径未定。

### 4.3 一句话状态

本轮原型更新实质解决了 5 个 P0 与 7 个 P1/P2，且新增 103 项可执行断言；阶段 1 的主要问题已从「内容会误导」转为「少数交互与真机证据尚未覆盖」。

## 5. 本轮新发现（不在 REPORT 原编号内）

| # | 现象 | 证据 | 级别 |
|---|---|---|---|
| A | 节日日期 chip 年份重复（「2026 · 2026-11-11」） | `app.js:387–388`；截图 `s01_topics_festival_393.png` | P2 |
| B | `F()` 工厂函数已无调用点，状态字段 `source` 仅保留兼容 | `data.js:266–269`（全文件未被使用）；旧字段 `app.js` 已改用 `sourceUrls/verifiedAt` | P2（死代码） |
| C | 关于我截图 `s18` 带上一操作遗留的 toast「已调起系统分享」，遮挡第二条卡片的按钮 | `s18_self_393.png` | P2（截图取证瑕疵，非产品缺陷） |
| D | `assets/app.css:231` 地点英文名固定 14px 且 `nowrap`，长英文名会被省略号截断 | `app.css:231` | P2（观察项，未被 REPORT 列项） |