# N08「表达」祖成课程只读索引报告（COURSE-INDEX）

> 依据：`docs/plan/P001-N08-Expression-CourseWeeklyPractice-V1.2-Approved-20261115.md` 第 3 节
> 产出日期：2026-11-15
> 本轮只做**课程只读索引**，不含 N08 页面开发、不含 APK、不含线上发布。

## 1. 源目录与只读声明

| 项 | 值 |
|---|---|
| 源目录（只读） | `/Volumes/三星/H-DL-OB笔记/003祖成英语90天陪练168节课程/3-场景实战课【105节】` |
| 目录名声明节数 | 105（解析自目录名 `【105节】`） |
| 章节目录 | 7 个 |
| 读取方式 | 脚本 `readdirSync` / `readFileSync`，只读 |

**只读承诺（已遵守）**：本轮没有对源目录做任何写入、移动、改名、删除；没有把课程 Markdown 复制进项目；索引里只有短句（最长 113 字符），没有整段正文。

## 2. 三个交付物

| 文件 | 说明 |
|---|---|
| `scripts/n08-course-index.mjs` | 可重复执行的扫描脚本，`--src` / `--out` 可覆盖默认值 |
| `socialmate-v1.2/source/n08-course-index.json` | 索引本体（UTF-8，118,231 字节，远小于 3MB 上限） |
| `docs/design/n08/COURSE-INDEX.md` | 本报告 |

## 3. 数字总览

| 指标 | 数值 |
|---|---|
| 实际 `.md` 课程数 | **100** |
| 目录名标称 | 105 |
| 差额 | **5（未核实，不补齐）** |
| 章节数 | 7 |
| 抽出英文原句 | 274 条（每课 0–3，最长 113 字符） |
| 带原文中文对照（zhHint） | 13 条，覆盖 11 课 |
| 抽出词组（keywords） | 361 个，全部为原句子串 |
| 读不到 / 解析失败 | 0 |
| 有文件但无完整英文句 | 4 课（见 §6） |

差额成因在索引层面可解释但**仍标未核实**：各章课序号区间的空洞正好是 5 个（`2-15`、`2-21`、`2-30`、`5-03`、`7-06`）。区间求和 `13+24+13+15+16+12+12 = 105`，与实际 100 相差正是这 5 个编号。父目录 `003祖成英语90天陪练168节课程` 下只有 `1-发音课【22节+11节】` 与 `3-场景实战课【105节】` 两套课，没有第二份场景实战课副本；**没有按编号生成任何不存在的课程**。差额的成因（未同步 / 被裁剪 / 原本没有）仍未核实。

## 4. 按章分布

| 章 | 章名 | 实际 .md | 课序号区间 | 区间应有 | 缺号 | 原句数 | 带中文对照课数 | 无英文句课数 |
|---|---|---|---|---|---|---|---|---|
| 1 | 家庭与朋友 | 13 | 1–13 | 13 | — | 33 | 0 | 1 |
| 2 | 旅行和旅游 | 21 | 14–37 | 24 | 15、21、30 | 60 | 2 | 1 |
| 3 | 健康与健身 | 13 | 38–50 | 13 | — | 34 | 0 | 0 |
| 4 | 购物与消费 | 15 | 51–65 | 15 | — | 40 | 3 | 1 |
| 5 | 餐饮与饮食 | 15 | 1–16 | 16 | 3 | 45 | 4 | 0 |
| 6 | 娱乐与消费 | 12 | 1–12 | 12 | — | 33 | 1 | 1 |
| 7 | 职业与工作 | 11 | 1–12 | 12 | 6 | 29 | 1 | 0 |
| 合计 | — | **100** | — | **105** | **5** | **274** | **11** | **4** |

注：第 5、6、7 章的课序号在文件名里从 `01` 重新起算（如 `01餐馆点餐（上）.md`），因此 `courseId` 统一为「章号-两位课号」，例如 `5-01`、`7-12`，与第 1 章的 `1-01` 不会撞号。

## 5. 缺号清单（5 条，全部标未核实）

| courseId | 章 | 索引里的判定 | 核实状态 |
|---|---|---|---|
| `2-15` | 旅行和旅游 | 源目录中无对应 `.md` 文件（编号空洞） | 未核实（`verified: false`） |
| `2-21` | 旅行和旅游 | 同上 | 未核实 |
| `2-30` | 旅行和旅游 | 同上 | 未核实 |
| `5-03` | 餐饮与饮食 | 同上 | 未核实 |
| `7-06` | 职业与工作 | 同上 | 未核实 |

未核实的意思：只知道「这个编号在源目录里没有文件」，**不知道**是源目录未同步、被裁剪、还是原本就没有这一节。不猜测原因，不补课。

### 5.1 重名清单（2 组）

| 归一化标题 | courseId | 原文件 |
|---|---|---|
| `家庭时光（上）` | `1-01`、`1-03` | `1.家庭时光（上）.md`、`3.家庭时光（上）.md` |
| `Daniel趣味分享` | `4-56`、`4-65`、`5-15`、`5-16`、`6-11`、`6-12`、`7-11`、`7-12` | 第四章 `56.Daniel趣味分享.md`、`65.Daniel趣味分享.md`；第五章 `15 Daniel趣味分享.md`、`16 Daniel趣味分享.md`；第六章 `11 Daniel趣味分享.md`、`12 Daniel趣味分享.md`；第七章 `11 Daniel趣味分享.md`、`12 Daniel趣味分享.md` |

说明：JSON 里的 `title` 保留原文（含序号，例如 `3.家庭时光（上）`）；`duplicateTitles` 用「去掉序号前缀后的归一化标题」分组，所以同名不同号的课能被识别出来。`courseId` 唯一，重名不影响主键。

## 6. 有文件但抽不出完整英文句的 4 课（不是读不到）

| courseId | 文件 | 原因（已人工核对原文） |
|---|---|---|
| `1-02` | `1第一章：家庭与朋友/2.家庭成员（下）.md` | 全文以中文讲解为主，英文只以词/短语内嵌出现（如 `He's from the USA`），没有带句末标点的完整句 |
| `2-23` | `2第二章：旅行和旅游/23.Bonus Time - Throw in the Towel.md` | 唯一完整句 `his coach or assistant throws a towel into the ring and that means he's giving up.` 小写开头、嵌在中文冒号后，按「完整句需大写开头」的机械规则被排除 |
| `4-56` | `4第四章：购物与消费/56.Daniel趣味分享.md` | 整篇是中文谜语讲解 + `silence`、`high five` 等词，无完整英文句 |
| `6-12` | `6第六章：娱乐与消费/12 Daniel趣味分享.md` | 同上，只有 `paint the town red` 这类短语 |

这 4 课的 `items` 为空数组、`sentences` 为空、`sourceLine` 为 0。**没有为了凑数而编英文或搬摘要。**

## 7. 字段与抽取口径（全部机械规则）

每条课程记录：

| 字段 | 口径 |
|---|---|
| `courseId` | `章号-两位课号`，如 `2-24`；课号取文件名前缀数字 |
| `chapterNo` / `chapter` | 章号与章节中文名（取自目录名冒号后） |
| `file` | 相对源目录路径，统一 `/` 分隔 |
| `title` | 正文 H1 → front matter `title:` → 文件名去序号；都取不到写空串 |
| `sentences` | 1–3 条原文英文句（见下） |
| `zhHint` | 首句的原文中文对照；**原文没有就空串，不翻译** |
| `keywords` | 首句的词组（1–3 个，只做字符截取） |
| `sourceLine` | 首句在原文件中的 1-based 行号 |
| `items` | 逐句明细 `{text, zhHint, keywords, sourceLine}`，顶层三个字段即 `items[0]` 的同值副本 |

抽取规则（脚本内可查）：

1. 跳过 `._` 开头与其它非 `.md`；章节目录按目录名前缀数字排序，不按字符串。
2. 跳过 YAML front matter 与 `## 本课总结` 区块，只在正文取句。
3. 一行里按 ASCII 片段切句，要求：15–200 字符、大写开头、句末 `.!?`、≥4 个词、字母占比 ≥0.6、无 `...`、无 Markdown 符号。
4. 剔除教学套话（`welcome back`、`what's up guys`、`this is Mr. Yang`、`are you ready`…）与以讲解语开头的句子（`here are…`、`you can say…`、`to talk about…`、`in this lesson…`、`we looked at…` 等）。
5. 「错误示范」段落里的句子剔除：按「错误/不好/尴尬…(方式|示范)」与「正确方式」在同一行内的**字符位置**判断该句属于哪一段。
6. 同一句重复出现时只保留一条；优先保留带中文对照的那次出现。
7. `zhHint` 只取「同一行、紧跟在该英文句之后、纯中文、以 `。！？` 结尾、5–30 字、不含讲解或语气词」的片段；任何一条不满足就留空。
8. `keywords` 从原句按词位截取 2–4 词片段，首尾不得是停用词/限定词，不得含标点；优先选在整个课程库里出现 ≥2 次的表达；最多 3 个、互不重叠。
9. 输出不含时间戳/随机量，`JSON.stringify` 固定键序 + 2 空格缩进 + 结尾换行。

## 8. 抽样核对（索引 vs 原始文件，逐字）

抽样方式：不同章、不同体裁各取一条，模型一为纯英文对话段，一条带原文中文对照，一条中英混排讲解段。核对方法：用脚本读该文件该行，断言 `line.includes(索引句) === true`，并确认 `zhHint` 出现在该句之后。

### 样本 1 — `2-24`（纯英文对话段）

- 文件：`2第二章：旅行和旅游/24.旅游景点（上）.md`，第 22 行（共 43 行）
- 原始文件该行（整行照录）：
  ```
  Hey Daniel, 还在发呆是不是？来，Daniel，你分享一下你喜欢的景点，可不可以？Alright, there are so many amazing places to visit. Let me share some of my experiences. Last year, I visited the Eiffel Tower in Paris. It's a must-see landmark. During summer, I went to the British Museum in London. It has so many incredible exhibits. Last weekend, I explored a historic site called The Great Wall of China. It was breathtaking.
  ```
- 索引里这条记录（`items[0]`）：
  ```json
  { "text": "Alright, there are so many amazing places to visit.", "zhHint": "", "keywords": ["places to visit"], "sourceLine": 22 }
  ```
- 结论：句、词、行号与原文一致；原文该句后没有中文译文，所以 `zhHint` 为空（未翻译）。

### 样本 2 — `5-14`（原文自带中文对照）

- 文件：`5第五章：餐饮与饮食/14星巴克点餐.md`，第 34 行（共 64 行）
- 原始文件该行（整行照录）：
  ```
  I'd like a green tea latte, please. 一杯抹茶拿铁，谢谢。I'd like a... 什么什么，这很好用。那星巴克的咖啡有很多类型，我们先学星冰乐，你们不是很爱吗？Frappuccino。燕麦拿铁叫做 oatmeal latte，oatmeal latte。浓缩咖啡叫做 espresso，espresso。这个 Es，它不是读 Expresso，很多人读 Expresso，不对，espresso。
  ```
- 索引里这条记录（`items[1]`）：
  ```json
  { "text": "I'd like a green tea latte, please.", "zhHint": "一杯抹茶拿铁，谢谢。", "keywords": ["green tea latte"], "sourceLine": 34 }
  ```
- 结论：句与中文对照都逐字取自原文同一行，中文紧跟该句之后；后面的「这很好用」「叫做 oatmeal latte」属于讲解，未被当成译文。

### 样本 3 — `6-09`（中英混排讲解段）

- 文件：`6第六章：娱乐与消费/09运动和比赛（上）.md`，第 31 行（共 45 行）
- 原始文件该行（整行照录）：
  ```
  My favorite sport is basketball. My favorite sport is basketball. I like playing table tennis. I like playing table tennis. And if you want to ask someone about their favorite sport you can say What is your favorite sport? What is your favorite sport? My favorite sport is basketball. My favorite sport is basketball.
  ```
- 索引里这条记录（`items[1]`）：
  ```json
  { "text": "My favorite sport is basketball.", "zhHint": "", "keywords": ["favorite sport"], "sourceLine": 31 }
  ```
- 结论：含重复句时只留一条；该句原文没有中文对照，`zhHint` 为空。同一课第 33 行还有 `I like playing table tennis.`，其后紧跟「我喜欢打乒乓球。」，但这句没有被选进本课的 3 条（同一行最多取 2 条、优先纯英文行）；即使被选中，规则也要求中文必须与英文句**同一行紧邻**，不会跨行硬贴。

全量校验（不只是这 3 条）：274 条原句全部通过 `line.includes(text)`；361 个 keywords 全部是原句子串；13 条 `zhHint` 全部位于同句之后。

## 9. 验收记录（本轮实跑输出）

```
$ node scripts/n08-course-index.mjs            # 第 1 次
courses    100（声明 105，差额 5 未核实）
按章分布   1.家庭与朋友=13  2.旅行和旅游=21  3.健康与健身=13  4.购物与消费=15  5.餐饮与饮食=15  6.娱乐与消费=12  7.职业与工作=11
句子总数   274（每课 0–3，带中文对照 11 课）
sha256     5b423769aa7694bc19ad17a1cb48de000e0a183801323eef9d155046d58a741b

$ node scripts/n08-course-index.mjs            # 第 2 次
sha256     5b423769aa7694bc19ad17a1cb48de000e0a183801323eef9d155046d58a741b
→ 两次 sha256 完全一致（确定性成立）

$ python3 -c "import json;d=json.load(open('socialmate-v1.2/source/n08-course-index.json'));print(len(d['courses']))"
100

$ 脚本统计的实际 .md 数：100
→ 两者一致
```

文件体积：118,231 字节（≤3MB）；UTF-8；无 `generatedAt`/`timestamp`/`updatedAt` 一类字段。

## 10. 限制与未核实项（不得当成已完成）

1. **105 vs 100 的差额未经核实**：只确认编号空洞存在，不知道原因；不补齐。
2. **源文本身有语音转写缺陷**：少数原句明显是转写串词（如 `What do you have for the beer?`、`I had to give me some medication to eat.`）。索引坚持逐字照抄、不改写；下游出题前必须人工复核，计划第 3 节已要求「禁止未经复核凭标题生成题目」。
3. **`zhHint` 覆盖率低是刻意的**：原文是讲解稿而不是双语对照稿，逐句中文多为讲解与语气词。13 条都是「英文句 + 紧邻纯中文」的强形态；宁可空，不翻译、不错贴。
4. **`keywords` 是机械截取**，个别仍是短语边界处的片段（如 `have a movie`）。它们只作为复习提示，不能直接当考题答案；模式一出题时仍需人工/模型复核。
5. **4 课无完整英文句**（§6），本轮不产出句子，也不从 `summaries.json` 补 —— 摘要存在连写，计划已明令不可照搬。
6. 索引不含「人工学习状态」：本轮只做只读题源，已学/掌握状态属于 App 侧数据，不在 Markdown 索引里落库。

## 11. 复现命令

```bash
cd /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
node scripts/n08-course-index.mjs                 # 默认源目录 + 默认输出
node scripts/n08-course-index.mjs --src "<课程目录>" --out "<输出路径>"   # 覆盖参数
python3 -c "import json;d=json.load(open('socialmate-v1.2/source/n08-course-index.json'));print(len(d['courses']))"
```
