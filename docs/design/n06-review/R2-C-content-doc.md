# N06 R2-C 内容与文档一致性核对（只读）

- 角色：N06 原型独立内容与文档核对员（第二轮 / R2-C）
- 日期：2026-11-09
- 工作目录：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
- 边界：只读以下对象；除本文件外未修改任何文件；未 commit；未动正式 APP；未跑全量回归；未下载图片。
  - `docs/design/prototype/n06/`
  - `docs/design/n06-audit/REPORT.md`
  - `docs/design/n06-review/REPORT.md`
  - `docs/plan/P001-N06-HainanGallery-FestivalTopics-V1.0-Approved-20261109.md`
  - `docs/成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv`
- 说明：本轮核对的是**当前工作区**文件；主验证批次已早于当前数据/代码，详见第 5 节第 1 条。

## 0. 结论速览

| 核对项 | 结论 |
|---|---|
| 47 节日种子字段 | 47/47 条、16 个字段全齐；`fixed 21 / pending 26`；海南专属 4 条；未发现同句复制或空日期造假，但 18 条无来源、6 条无日期、47 条全部写 `verified_at=2026-11-09`，核实标记偏乐观 |
| data.js 接入 | 47/47 全部来自种子、顺序一致、映射字段完整；页面已改为动态“候选 47 个（已核对 21 / 待确认 26）”，不存在字面“20 / 47”；**但 `verify.mjs` 仍断言 20，主验证结果停留在旧数据** |
| 13 个地点 | 中文汉字 96–117（计划 90–150），英文 61–76 词（计划 60–95），每点 2 条双语问句；13 个 `placeId`、中文名、城市目录与正式 `places.json` 全部一致 |
| 图片 | 26/26 张可用图在 `PHOTO_MANIFEST.csv` 中均有 `approved` 记录且 `place_name` 与原型地点名一致；11 张排除理由均有清单来源依据；`Haikou/001/01.webp` 已不再作为真图展示 |
| 文档一致性 | **17 条不一致**（第 5 节）；核心问题是主截图/主验证结果整体过期，以及多份文档仍写“20 个节日 / 95 项 / 59 项 / 旧 SHA” |
| 旧记录兼容样例 | **已有**：`rec-qilou-legacy` 含 `enVariants`、`sourceSpan`、`practiceLog`、`history`、`recordId`，在“更多 / 历史”折叠区渲染；缺口转为“未做真实旧数据迁移验证” |
| 全局规范冲突 | 计划要求浅色默认，全局规范要求 `SYSTEM` 默认；原型实现支持三档但默认浅色，阶段 2 前必须书面确认 |

## 1. 47 节日种子

### 1.1 条数与字段

文件：`docs/design/prototype/n06/assets/festivals-47-seed.json`（top-level 数组，47 项）。

| 字段 | 存在数 |
|---|---|
| `holiday_type` | 47/47 |
| `dates_2026_2027` | 47/47 |
| `source_urls` | 47/47（数组字段存在） |
| `verified_at` | 47/47 |
| `related_place_ids` | 47/47 |
| `status` / `date_rule` / `cn` / `en` / `country_region` / `theme` / `cn_brief` / `en_brief` / `questions` | 47/47 |

字段名与计划 §D 的 `id,中文名,英文名,country/region,date_rule,dates_2026_2027,status,中文简述,英文简述,双语问题2-3,related_place_ids,source_urls,verified_at` 对应；额外提供 `holiday_type`，用于区分节日本日/公共假期/纪念日。

### 1.2 状态、类型、地区

| 维度 | 结果 |
|---|---|
| `status` | `fixed` 21、`pending` 26 |
| `holiday_type` | `public_holiday` 24、`festival_day` 15、`observance` 8 |
| 地区覆盖 | 中国 9、中国·海南 4、美国 6、英国 4、英国·苏格兰 1、爱尔兰 1、日本 4、韩国 3、泰国 3、印度 4、新加坡 3、国际 5 |

### 1.3 海南专属节日（4 条）

| id | 中文名 | status | holiday_type | dates_2026_2027 | source_urls |
|---|---|---|---|---|---|
| `hainan-junpo` | 军坡节（公期） | pending | festival_day | `[null, null]` | 空 |
| `hainan-huanhua` | 海南换花节 | pending | festival_day | `2026-03-03 / 2027-02-20` | Nager CN 公共假期 |
| `hainan-sanyuesan` | 三月三（黎族苗族） | pending | festival_day | `[null, null]` | 空 |
| `hainan-carnival` | 海南国际旅游岛欢乐节 | pending | festival_day | `[null, null]` | 空 |

结论：海南专属 4 条已存在，名称准确；其中 3 条无来源、3 条无公历日期，均标 `pending`，符合“未核实不推送倒计时”。

### 1.4 编造痕迹检查

- `json.dumps(items)` 中 `"来源待补"` 出现 **0 次**、`"待补"` 0 次；没有把同一句占位文案复制到 47 条。
- `cn_brief`、`en_brief`、双语问句均无完全重复项。
- 空 `source_urls`：**18 条**（`qingming, hainan-junpo, hainan-sanyuesan, hainan-carnival, halloween, shichi-go-san, japan-obon, songkran, visakha-bucha, diwali, republic-day, gandhi-jayanti, new-year, womens-day, students-day, christmas, singles-day, earth-day`）。
- 空日期：**6 条**（`qixi`、`hainan-junpo`、`hainan-sanyuesan`、`hainan-carnival`、`visakha-bucha`、`holi`）。
- `related_place_ids` 共 27 个引用，全部落在 1–115，无越界。
- **一项口径问题**：47 条全部写 `verified_at: "2026-11-09"`，其中 26 条 `pending`、18 条无来源、6 条无日期。`verified_at` 字面表示“已核实日期”，与 pending/无来源并存会造成“已核实”的误读。建议对未核实项改为 `verified_at: null` 或另设 `checked_at`。

结论：**未发现编造具体日期或伪造来源的痕迹**；存在的是“未取得来源/日期”的诚实缺口，以及 `verified_at` 标记过宽。

## 2. `assets/data.js` 接入与页面文案

### 2.1 实际接入 47 条

- `data.js:271` 起内嵌 `const festivals = [...]`，`data.js:1748` 起 `.map(...)` 映射为 UI 字段。
- 与种子逐项比对：**47 条，顺序完全一致；缺失 0、额外 0**。
- 映射字段 16 项全部存在：`id,cn,en,region,theme,dateRule,y2026,y2027,status,briefCn,briefEn,questions,source,holidayType,sourceUrls,verifiedAt,relatedPlaceIds`。
- 状态分布与种子一致：`fixed 21 / pending 26`。
- 18 条空 `sourceUrls` 被映射为同一句 `source: "来源待补：未取得可靠出处，原型不当作已核实"`；但 UI 节日卡片不展示 `source` 字段，而是展示 `sourceUrls` 或“未取得可靠出处，日期按待确认处理”（`assets/app.js:377`）。

### 2.2 页面文案“20 / 47”

- 当前代码中**没有字面“20 / 47”**。
- `assets/app.js:361`：`${list.length} 个候选样本`。
- `assets/app.js:363`：`候选 ${N.festivals.length} 个：日期已核对 ${...fixed...} 个、待确认 ${...pending...} 个。`
- 因此当前渲染应为：**候选 47 个；已核对 21 个；待确认 26 个**；“全部”日期范围应有 **47 张**卡片。
- **不一致**：`verify.mjs:244` 仍断言 `festAll === 20`；`verify-result.json`（2026-11-09 20:14）记录的也是“卡片 20 个”。`verify.mjs` mtime 20:13，早于 `data.js` 20:55 / `app.js` 20:57；重跑 `node verify.mjs` 将因“47 ≠ 20”至少红 1 项，并覆盖现有结果文件（本轮未运行）。

## 3. 13 个地点：字数、问句、placeId

统计口径：中文只计 CJK 统一表意文字（`[\u3400-\u9fff]`），英文按空白分词；数据来自 `assets/data.js` 的 `window.N06.places`。

| id | 名称 | 中文汉字 | 英文词 | 问句 | photos | declared |
|---:|---|---:|---:|---:|---|---:|
| 3 | 骑楼老街 | 103 | 76 | 2 | [1,2,3] | 3 |
| 4 | 云洞图书馆 | 101 | 63 | 2 | [1,2,3] | 3 |
| 9 | 雷琼火山口地质公园 | 117 | 71 | 2 | [1,2,3] | 3 |
| 43 | 假日海滩 | 110 | 71 | 2 | [1,2,3] | 3 |
| 62 | 石头公园 | 96 | 61 | 2 | [] | 3 |
| 63 | 东郊椰林 | 104 | 68 | 2 | [1,2,3] | 3 |
| 71 | 潭门渔港 | 99 | 64 | 2 | [] | 3 |
| 78 | 日月湾 | 103 | 65 | 2 | [1,2,3] | 3 |
| 88 | 分界洲岛 | 107 | 73 | 2 | [1,2,3] | 3 |
| 97 | 西岛 | 101 | 65 | 2 | [2,3] | 3 |
| 99 | 亚龙湾 | 101 | 64 | 2 | [1,2,3] | 3 |
| 115 | 儋州峨蔓火山海岸 | 103 | 66 | 2 | [] | 3 |
| 1 | 龙兴路 | 98 | 64 | 2 | [] | 3 |

- 中文区间 **96–117**，全部落在计划 90–150；英文区间 **61–76**，全部落在 60–95。
- 每条均为 **2 条**双语问句，满足计划 2–3 条。
- 13 个 `placeId` 均存在于 `docs/成果整理/Hainan-Travel-Guide/data/places.json`；中文名与正式数据逐条一致，`cityFolder` 与正式 `city_folder` 逐条一致（13/13）。
- 口径提醒：`verify.mjs:288-289` 用 `.textContent.length` 计“字”（含标点），且阈值放宽为 90–160 / 55–105；本次用更严格的“仅汉字”口径复核，13 条仍全部达标。文档里的“115 字”是含标点的长度，不是汉字数。

## 4. 图片：26 张可用、11 张排除、`Haikou/001`

### 4.1 26 张可用图

- 13 个地点 `photos` 合计 **26 张**。
- 用 Python `csv.DictReader` 解析 `PHOTO_MANIFEST.csv`（153 行，`status` 全部 `approved`）逐槽比对：**26/26 均存在 `approved` 记录，缺失/非 approved 0 条**。
- 26 条的 `place_name` 与原型地点中文名逐条一致（26/26）。

### 4.2 11 张排除

- `data.js` 共 5 个地点、11 个槽位登记 `photoExclusions`：62（3）、71（3）、97（1）、115（3）、1（1）。
- 其中 10 张在 `PHOTO_MANIFEST.csv` 里也是 `approved`，但清单的 `source_page`/`creator` 明确显示同名异地/异义：
  - 62 石头公园：美国马萨诸塞 Stone Park、韩国济州 Stone Park、关岛 Latte Stone Park；
  - 71 潭门渔港：日本 “Tan-men” 面食 3 张；
  - 97 西岛：澳大利亚南澳 West Island；
  - 115 儋州峨蔓：足球运动员 Eman Košpo、人物 Eman Kellam、瑞典 Emån 河。
- 第 11 张 `Haikou/001/01.webp`：`PHOTO_MANIFEST.csv` **无记录**，来源/许可均未登记。
- 结论：11 条排除理由**成立**（以清单来源页标题与作者为依据；本轮未在线打开来源页复核）。同时说明一个重要口径：**manifest 的 `approved` 只代表许可台账存在，不代表与该地点对应**。

### 4.3 `Haikou/001/01.webp` 是否仍被当真图

**否。**

- 主原型：`data.js` 中龙兴路 `photos: []`，`photoExclusions` 记 slot 1；`verify-result.json` 第 36 项（旧批次）为“imgs 0、3 处提示”。当前 `app.js:646` 对排除槽位只输出提示、不生成 `<img>`。
- 单文件：`verify-standalone-result.json` 的 `photoMatrix` 中龙兴路 `realPhotos: 0`、`promptSlides: 3`；`standalone.html` 内 `data:image/webp` 共 **26 处**，与可用图 26 张一致；`Haikou/001/01.webp` 仅作为排除说明文字出现 1 次，不在 26 张内嵌图中。
- 结论：该图已从展示与单文件中移除，不再冒充龙兴路真图；原图仍在归档目录，未删除。

## 5. 文档 / 截图 / 数据不一致清单（17 条）

> 统一实测值来源：`verify-result.json`（79 checks / 22 shots / PASS）、`verify-standalone-result.json`（103 checks / 20 shots / PASS）、`standalone-build.json`（10,139,113 bytes、SHA `cab486e6…`）、`screenshots/` 22 张、`screenshots-standalone/` 20 张、`assets/data.js` 47 个节日。

| # | 文档位置 | 文档说法 | 实测 | 证据 |
|---:|---|---|---|---|
| 1 | `screenshots/` + `verify-result.json`（整批主证据） | 作为当前原型证据引用 | 截图 20:13、结果 20:14，**早于** `data.js` 20:55 / `app.js` 20:57；02 截图仍是旧的“展开式来源块”，当前 `app.js` 已改为折叠来源说明 | `stat -f "%Sm"` |
| 2 | `verify.mjs:244` | `festAll === 20` | 当前数据 47，“全部”应为 47 卡；重跑将 FAIL | `data.js` 47 条；`app.js:229-244` 无截断 |
| 3 | `验证说明.md:5`、`:28` | `PASS 44/44 checks · 13 screenshots`；断言分组 44 项 | 79/79 checks、22 张截图 | `verify-result.json` |
| 4 | `验证说明.md:70`、`:80`、`:100` | 反向自检 `32/37`、还原后 `37/37`、结论“37 项” | 当前套件 79 项；反向自检未按新套件重跑 | 同上 |
| 5 | `验证说明.md:33` | 「全部」20 张 | 47 张；「未来 14 天」也由 3 张变为 4 张（单文件当前结果） | `verify-standalone-result.json` |
| 6 | `差异说明.md:35`、`:78` | 节日 20 个示范样本 | 47 条全部接入 | `data.js:271`、`verify-standalone` 断言 |
| 7 | `差异说明.md:32` | “含 1 个只有 1 张图的地点” | 龙兴路 0 张可用（1 排除 + 2 缺失）；西岛为 2 张可用 | `data.js`、`photoMatrix` |
| 8 | `差异说明.md:66` | `verify.mjs` 44 项全通过 | 79 项 | `verify-result.json` |
| 9 | `差异说明.md:105` | standalone `PASS 59/59`、10 张截图 | 103/103、20 张 | `verify-standalone-result.json` |
| 10 | `差异说明.md:117`、`:127`；`单文件说明.md:4-5` | 9.60/9.63 MiB；SHA `c07becc5…` / `fa614277…` | 10,139,113 bytes（9.67 MiB）；SHA `cab486e6e90f…` | `standalone-build.json`、`verify-standalone-result.json` |
| 11 | `单文件说明.md:14`、`:41` | 95 项 / `PASS 95/95` | 103/103 | `verify-standalone-result.json` |
| 12 | `单文件说明.md:54` | 节日 `3/0/20` 卡 | `4/0/47` 卡 | 同上 |
| 13 | `截图索引.md:10` | `02` 能看到“地点名与中英介绍同屏” | `02` 首屏只到“中文介绍”标题，中文正文未完整、英文介绍在折叠线以下 | `screenshots/02_hainan_detail_393.png` |
| 14 | `截图索引.md:16` | `06b` 三个标签“位于最下方” | 标签下方还有原型说明、输入框、底部提示和底部导航 | `screenshots/06b_chat_tags_393.png` |
| 15 | `截图索引.md` 主表 | 列 13 条（01–10、02b、06b、08b） | 实际 22 张；缺 `06c`、`11`–`18` 共 9 张 | `ls screenshots/` |
| 16 | `截图索引.md:39` | standalone `PASS 95/95` · 20 张 | 103/103 · 20 张 | `verify-standalone-result.json` |
| 17 | `截图索引.md` standalone 表 | 列 11 条 | 实际 20 张；缺 `s06c`、`s11`–`s18` 共 9 张；`s10` 文件不存在（序列缺号） | `ls screenshots-standalone/` |

补充（不计入 17 条）：`差异说明.md:43`“默认浅色，可切深色/跟随系统”与全局规范冲突，见第 7 节；`截图索引.md` 对 standalone `s02` 的“中文介绍紧随图库与地点信息”与 `s02` 实测一致，这一条已修正。

## 6. 旧记录兼容样例

**已有样例，缺口已从“无样例”变为“未做真实迁移验证”。**

- 数据：`assets/data.js:50` `rec-qilou-legacy`（placeId 3 骑楼老街，日期 2026-10-20，`legacy: true`）。
- 字段：`enVariants`（1 条旧英文 B 版本，标注“默认隐藏，仅历史兼容”）、`sourceSpan`（start 0 / end 46）、`practiceLog`（2 条练习日志）、`history`（v1/v2）、`recordId`（记录 id）。
- 渲染：`assets/app.js:720-730`，收在“更多 / 历史”`<details>` 中；旧 B 版本另有嵌套折叠；`assets/app.js:715` 显示“旧格式历史兼容”胶囊。符合计划第 58 行“旧 B 版本隐藏于历史兼容而不删除，旧 sourceSpan、recordId、版本/复盘历史继续保存”。
- 限制：这是**静态示范样本**，不是把真实旧记录迁移进原型；没有运行时证明正式 APP 的旧记录读取链路仍兼容。

## 7. 全局规范冲突：浅色默认 vs `SYSTEM` 默认

- 计划：第 69 行“所有页面默认浅色，同时支持深色”；阶段 1 第 4 项“浅色默认、深色可切”。
- 全局规范：面向最终用户的 APP 主题支持 `LIGHT / DARK / SYSTEM`，**默认 `SYSTEM`**，跟随系统并保存偏好。
- 原型现状：
  - `index.html:2` `data-theme="light"`；启动脚本 `localStorage.getItem('n06.theme') || 'light'`；
  - `assets/app.js:30` `themeMode: 'light'`；`:1008` 提供“浅色（默认）/ 深色 / 跟随系统”三档；`:1010` 明示“原型默认浅色”。
- 结论：原型**能力上支持 `SYSTEM`**，但**默认值按计划采用浅色**，与全局规范冲突。项目级规则优先于全局规则，但前提是项目已明确写下该偏离；当前计划只写“浅色默认”，没有写“这是对全局 `SYSTEM` 默认的获批例外”。阶段 2 若要迁入正式 APP，必须二选一，否则验收口径会打架。

## 8. 阶段 2 前需要用户确认的点

【请你拍板｜回复 A1 或 A2】

A｜正式 APP 的默认主题
1. 【建议】按全局规范默认 `SYSTEM`（跟随系统），并在计划中补一句“覆盖全局默认”；浅色/深色仍可手动选择。
2. 按 N06 计划默认浅色，并在计划中明确写成“本项目对全局 `SYSTEM` 默认的获批例外”。

【说明】
两种方案都能保留“浅色/深色/跟随系统”三档；差别只在首次启动与清除数据后的默认值。若选 1，原型与正式 APP 的默认值需要同步改；若选 2，需要把“项目例外”写进计划或项目级规则，避免下一位验收者按全局规范判红。

## 9. 最终结论

- **内容侧基本达标**：47 种子字段完整、47/47 接入、13 地点字数与问句达标、placeId 与正式数据一致、26 张可用图全部有 `approved` 台账、11 张排除有据、无台账图不再冒充真图、旧记录样例已补。
- **文档侧不能判 PASS**：17 条不一致，其中第 1、2 条是硬问题——主截图与主验证结果早于当前数据/代码，`verify.mjs` 仍按 20 个节日断言；重跑主验证会红，且现有 `44/44`、`37/37`、`95/95`、`59/59` 等数字均不能代表当前版本。
- 建议复审口径：以**单文件当前结果 103/103 + 20 张截图**作为最新内容证据；主原型需重跑并重生成截图后再引用；文档统一改为“47 个候选（fixed 21 / pending 26）”与当前 SHA/字节数。

## 附录：复现命令（只读）

```bash
cd docs/design/prototype/n06

# 1. 47 种子条数/字段/状态/来源/日期
python3 - <<'PY'
import json,collections
items=json.load(open('assets/festivals-47-seed.json',encoding='utf-8'))
print(len(items))
for f in ['holiday_type','dates_2026_2027','source_urls','verified_at','related_place_ids','status']:
    print(f,sum(1 for x in items if f in x))
print(collections.Counter(x['status'] for x in items))
print('empty source',sum(1 for x in items if not x['source_urls']))
print('empty date',sum(1 for x in items if any(not s for s in x['dates_2026_2027'])))
PY

# 2. data.js 接入与 13 地点字数
node -e '
global.window={};const fs=require("fs");
eval(fs.readFileSync("assets/repo-data.js","utf8"));
eval(fs.readFileSync("assets/data.js","utf8"));
const N=global.window.N06;
const cjk=s=>(s.match(/[\u3400-\u9fff]/g)||[]).length;
const w=s=>s.trim().split(/\s+/).filter(Boolean).length;
console.log("festivals",N.festivals.length,"places",N.places.length);
for(const p of N.places) console.log(p.id,cjk(p.introCn),w(p.introEn),p.questions.length,JSON.stringify(p.photos));
'

# 3. 26 张可用图 manifest 核对
python3 - <<'PY'
import csv,json,subprocess
man=list(csv.DictReader(open('../../../成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv',encoding='utf-8-sig')))
k={(r['place_id'],r['slot']):r for r in man}
out=subprocess.run(['node','-e','global.window={};const fs=require("fs");eval(fs.readFileSync("assets/repo-data.js","utf8"));eval(fs.readFileSync("assets/data.js","utf8"));console.log(JSON.stringify(global.window.N06.places.map(p=>p.photos)))'],capture_output=True,text=True)
# 逐槽检查 k 存在且 status=approved
print('manifest rows',len(man))
PY

# 4. 证据时间戳与数量
stat -f "%Sm %N" -t "%Y-%m-%d %H:%M:%S" \
  verify.mjs verify-result.json assets/data.js assets/app.js \
  screenshots/01_topics_festival_393.png \
  verify-standalone-result.json standalone-build.json standalone-test/standalone.html
ls screenshots/ | wc -l
ls screenshots-standalone/ | wc -l

# 5. 单文件字节/SHA/内嵌图
python3 - <<'PY'
import json
r=json.load(open('verify-standalone-result.json',encoding='utf-8'))
print(r['targetBytes'],r['targetSha256'],len(r['checks']),len(r['shots']))
b=json.load(open('standalone-build.json',encoding='utf-8'))
print(b['outputBytes'],b['outputSha256'],b['imageCount'],b['excludedImageCount'])
PY
grep -o "data:image/webp" standalone-test/standalone.html | wc -l
```