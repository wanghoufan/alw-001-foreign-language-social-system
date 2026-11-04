# SEGMENT-QC｜红城湖 19 段内容质检（ALW-001 N05 V1.3 · T2）

- recordId：`rec-20261103072022-16b79c` · revisionBasis：**2**（未改 revision / 未改任何数据文件）
- 质检对象：`SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json`
- 对照只读基线：`docs/archive/20261103-红城湖公园-实测文稿-逐字版-备份.md`、`records-archive/rec-…16b79c.逐字版.20261103164405.json`
- 方式：**全离线人工逐段比对 + 本地规则脚本**；`cloudCall: none`，未调用任何云 API，未外传原文
- 本报告只产出「问题 + 建议」，**不直接改数据**；落库由主开发者执行

## 0. 判定口径（与 `phrase-pairs-v1.json` 字段一一对应）

| 项 | 规则 |
|---|---|
| `parsed_from_original` | 原 phrases 串本身是「英文 中文」，机械拆分即可 |
| `derived_from_source_zh` | 英文来自 phrases，中文只取本段 `sourceText/cnSentences` 的原话片段（evidence 附出处） |
| `ai_suggested` | 中文无原话依据，由我补充；**一律 `playable:false`**，等用户确认 |
| `insufficient` | 无法确定（本次 0 条） |
| `playable:true` | zh 含汉字 + en 无汉字 + `reviewStatus ≠ needs_review` + `source ∉ {ai_suggested, insufficient}` |
| 第 2/3/18 段 | 逐字版归档明确写「用户本条未给表达梳理」，故这 3 段即使能机械拆分也标 `pending_user_confirm`（SPEC §4 要求） |

## 1. 逐段质量表

「中文字数」= `cnSentences` 拼接后去空白字符数；「英A/英B」= 是否完整（19 段全部非空、无中文混入、以终止标点收尾，脚本已核）。

| 段 | blockId | 中文字数 | 英A | 英B | 词组 | pair（可播/待确认/需复核） | 主要问题 |
|---|---|---|---|---|---|---|---|
| 1 | blk-hc-1 | 28 | 完整 | 完整 | 6 | 6 / 6 / 0 | — |
| 2 | blk-hc-2 | 58 | 完整 | 完整（`…` 收尾，与未完原话一致） | 3 | 3 / 3 / 0 | **P1** 末句扩写；P2 `strollers` 歧义；P1 表达为补写 |
| 3 | blk-hc-3 | 61 | 完整 | 完整 | 3 | 3 / 3 / 0 | P1 表达为补写（用户原缺）；P2 花露水↔repellent spray |
| 4 | blk-hc-4 | 102 | 完整 | 完整 | 8 | 8 / 8 / 0 | P2 cnSentence 残留 `\n\n`；P2 英B 缺「比较有意思的是」框架 |
| 5 | blk-hc-5 | 58 | 完整 | 完整 | 6 | 6 / 6 / 0 | P2 `zero-experience friendly` 非地道（用户原列，保留） |
| 6 | blk-hc-6 | 61 | 完整 | 完整 | 6 | 6 / 6 / 0 | P2 `call for some foundation` 略生硬（用户原列，保留） |
| 7 | blk-hc-7 | 55 | 完整 | 完整 | 7 | 7 / 7 / 0 | — |
| 8 | blk-hc-8 | 29 | 完整 | 完整 | 5 | 5 / 5 / 0 | — |
| 9 | blk-hc-9 | 50 | 完整 | 完整 | 6 | 6 / 6 / 0 | P2 英A `facilities are pretty well-equipped` 搭配 |
| 10 | blk-hc-10 | 14 | 完整 | 完整 | 3 | 3 / 3 / 0 | P2 `go there and...` 为句型片段（已在 evidence 说明） |
| 11 | blk-hc-11 | 49 | 完整 | 完整 | 6 | 5 / 5 / 1 | **P2** `after all`↔「嘛」语气词不成对 → needs_review |
| 12 | blk-hc-12 | 59 | 完整 | 完整 | 5 | 5 / 5 / 0 | P2 「一举多用」由逐字版「一时一时多用」重构，需用户确认 |
| 13 | blk-hc-13 | 66 | 完整 | 完整 | 7 | 7 / 7 / 0 | P2 逐字版「这些人爽」为 ASR 乱码，rev2 重构，需确认 |
| 14 | blk-hc-14 | 39 | 完整 | 完整 | 5 | 5 / 5 / 0 | P2 英A/B 把「可攀岩的小沙坡」拆成两物，轻增义 |
| 15 | blk-hc-15 | 35 | 完整 | 完整 | 6 | 6 / 6 / 0 | P2 涂鸦画↔coloring/paint sets 略偏 |
| 16 | blk-hc-16 | 25 | 完整 | 完整 | 4 | 4 / 4 / 0 | P2 `mini-economy` 为引申义 |
| 17 | blk-hc-17 | 77 | 完整 | 完整 | 7 | 7 / 7 / 0 | P2 英B `hope again` 多一个 again；中文「孤单」二现（强调，保留） |
| 18 | blk-hc-18 | 40 | 完整 | **完整且忠实** | 3 | 2 / 2 / 1 | **P1** 词组 3 错位（属 19 段）；P2 英A 以 But 开头；P1 表达为补写 |
| 19 | blk-hc-19 | 35 | 完整 | 完整 | 6 | 5 / 6 / 0 | P2 `chill / hang out` 无原话依据 → ai_suggested 不可播 |

合计：词组 102 条 → pair 102 条（**可播 99 / 待确认 100 / needs_review 2**，重叠计数），ai_suggested 1。

## 2. 中文口水词与残句（只列问题，不改数据）

19 段中 **17 段不需要改动**（rev2 已把「这个这个」「然后」「嗯」「就是就是」「你知道吗比有意」等清理干净，且未失原意）。仅 2 段建议动：

### 2.1 第 2 段（blk-hc-2）· P1 · 末句扩写 + 未完成想法

| | 文本 |
|---|---|
| 原文（rev2） | 除了跑步的、散步的人，还有坐在旁边喝椰子水、聊天的人。坐在小凳上喝个椰子水，聊聊天，也很棒，很舒适。**就是想要那种……** |
| 逐字版 | …聊聊天也很棒，很舒适，**就是要……** |
| 建议清理版 | …也很棒，很舒适。**就是要……[原话未完]** |
| 改动理由 | rev2 比逐字版多出「想/那种」，属整理时替用户把话补全（**扩写用户没说的内容**）；回退逐字说法并加 `[原话未完]`，前两句一字不动 |
| 注意 | 英A/英B 均以 `It's just that…` 收尾，与新中文结尾仍对应，无需改英文 |

### 2.2 第 4 段（blk-hc-4）· P2 · cnSentence 残留空行

| | 文本 |
|---|---|
| 原文（rev2） | …在不同的角落。**（`\n\n`）**她们有不同风格，有些特别嗨。… |
| 建议清理版 | …在不同的角落。她们有不同风格，有些特别嗨。…（删掉 `cnSentences[1]` 开头的两个换行） |
| 改动理由 | 逐字版两段合并时的遗留空白，会让卡片中文出现空行、TTS 多一段停顿；**只删空白，不动任何字** |

### 2.3 明确「建议保留、不清理」的三处（避免误删）

| 段 | 现象 | 结论 |
|---|---|---|
| 4 | 「**知道吗？**」 | 保留。英A/B 都有 `you know?`，删中文会造成中英不对应；且词组里已有 `you know?` 成对 |
| 17 | 「感觉很孤单…一个人觉得有点孤单」 | 保留。用户强调式重复，删任一处都会改语序/语气 |
| 1/3/7 | 「散散步」「喷一喷」「跳一跳」类叠词 | 保留。属口语自然叠词，非口水词 |

### 2.4 变更前后 hash（供主开发者做前后对比）

| 段 | sha256(before) | sha256(after) |
|---|---|---|
| blk-hc-2 | `737c67e20c4314b014ef771a29eed41825f9609b2794b485b9871b3e12124081` | `8974900bef5ad485b356dbe762b5d3fff47675766f4cf27bb484fe8d022d0b84` |
| blk-hc-4 | `5c4d60d43d30cf8cc56727ee561c33c7362977e944a5572f280ec38c355bd12f` | `488c8078e2737974fee5a149314a9e2ad7130e02085bac19fe8c6c6f9fa8156c` |

> 算法：`sha256(cnSentences.join(''))`，UTF-8 无 BOM。`verify-t2.mjs` 会重算并比对，防止 before 与现网数据脱节。

## 3. 英文 A/B 语义核对（P0 / P1 / P2）

**P0（必须修，否则错误播放/语义错）**：**0 项**。19 段英文均无中文占位文本、无截断、无「把句子写断」（脚本逐条检查 enVariants 无 CJK、以终止标点收尾）。

| # | 段 | 位置 | 问题 | 级别 | 建议 |
|---|---|---|---|---|---|
| 1 | 2 | 中文末句 | 「就是想要那种……」是整理方替用户补完，逐字版只到「就是要……」 | **P1** | 见 2.1，回退 + `[原话未完]` |
| 2 | 2/3/18 | 表达梳理整体 | 逐字版归档写明用户未给表达梳理，现 9 条英文为整理方补写 | **P1** | 已在 pair 中标 `pending_user_confirm`；UI 需显示「待确认」而非当作用户原话 |
| 3 | 18 | phrases[2] | `lay out a blanket 铺毯子` 与本段中文无关，实际属第 19 段「铺一个野餐毯」 | **P1** | 标 `needs_review` + 不可播；建议移入 blk-hc-19 或删除 |
| 4 | 2 | 英B | `joggers and strollers` 中 `strollers` 易读成「婴儿车」（英A 用 `walkers`） | P2 | 建议统一为 `joggers and walkers`（不改数据，待确认） |
| 5 | 4 | 英B | 以 `Along the track…` 起句，丢掉「比较有意思的是」这层框架（英A 有） | P2 | 可接受；若要严格对应可补 `What's interesting is…` |
| 6 | 9 | 英A | `The facilities are pretty well-equipped.` facilities 与 well-equipped 语义重叠 | P2 | 建议 `pretty well equipped` / `pretty complete` |
| 7 | 11 | phrases[5] | `after all` 对应句末语气词「嘛」，单独朗读无语义且与上一条重复 | P2 | 已标 needs_review、不可播 |
| 8 | 14 | 英A/B | 中文是一个「可以攀岩的小沙坡」，英文拆成「攀岩墙 + 沙坡」两件设施 | P2 | 轻增义，建议合并为 `a little sandy slope they can climb` |
| 9 | 17 | 英B | `You'll feel life's energy and hope again.` 比中文多 `again` | P2 | 可接受；严格对应可删 `again` |
| 10 | 18 | 英A | 以 `But you can also…` 开头，但 rev2 中文已无「但」（逐字版有「但」） | P2 | 二选一：中文恢复「但」，或英文去 `But` |
| 11 | 19 | phrases[2] | `chill / hang out` 在本段中文中无对应动词 | P2 | 已标 `ai_suggested` + 不可播 |
| 12 | 15 | 英A/B | 「涂鸦画」→ `coloring/paint sets`（套装）语义略偏 | P2 | 可接受；更准为 `doodle sheets` |
| 13 | 16 | 英A | `a little mini-economy has sprung up` 为引申，中文只说「商业服务和商业产品的售卖」 | P2 | 可接受，属意译 |
| 14 | 5/6 | 英B | `zero-experience friendly`、`call for some foundation` 搭配偏生硬 | P2 | 用户自己列的表达，保留原样，不代改 |

## 4. 第 2 / 3 / 18 段明确结论（SPEC 点名）

| 段 | 英文 B 结论 | 表达（phrases）结论 |
|---|---|---|
| 2 | **完整**。`Apart from the joggers and strollers… It's just that…` 三段中文全覆盖（跑步/散步的人、坐着喝椰子水聊天、坐小凳很舒适），结尾省略号忠实于未完原话 | 3 条均能机械拆分（`coconut water 椰子水` 等），但整段表达是用户缺失后补写 → 全部 `pending_user_confirm`；`strollers` 用词 P2 |
| 3 | **完整**。上一版在 `anti-itch cream —` 处断句，rev2 已补 `just in case.`，语义回到「以防万一」 | 3 条机械拆分，同样标 `pending_user_confirm`；`花露水`→`mosquito repellent` 语义可接受 |
| 18 | **完整且忠实，可用**。`though it doesn't really count as camping` 精确对应「其实也算不上露营」；英A `though "camping" might be a stretch` 同样成立；两句都无截断、无中文占位。唯一瑕疵是英A 的 `But`（P2） | 3 条中 `picnic`/`at dusk` 可播（待确认），`lay out a blanket` **必须移出**（P1，属 19 段） |

## 5. 未改动但需要用户点头的原文重构（不是错误，但不许我替用户定稿）

| 段 | 逐字版 | rev2 现文 | 性质 |
|---|---|---|---|
| 12 | 「一时一时多用」 | 「一举多用」 | ASR 乱码重构，语义方向可信（英A/B 都是 killing two birds / multitasking），仍建议用户确认用词 |
| 13 | 「也就是说你基本上都是这些人爽」 | 「也就是每个边基本上都有一个」 | 明显 ASR 乱码，rev2 按上下文（英A/B `one for each side`）重构；事实正确性建议用户确认 |

两处均**未**列入 CLEANUP 候选（无更好依据，删/改都会丢信息）。

## 6. 交付与验证

| 文件 | 说明 |
|---|---|
| `phrase-pairs-v1.json` | 102 条 pair，覆盖 19/19 段，`cloudCall:none`；`revisionBasis:2` |
| `CLEANUP-candidates.json` | 仅 2 段（blk-hc-2 / blk-hc-4），含 before/after/reason/hasUnfinished/双 sha256 |
| `verify-t2.mjs` | 定点校验，`node verify-t2.mjs` → **PASS / exit 0** |
| `verify-t2.log` | 本次运行输出 |

校验覆盖：19 段覆盖与 blockId 真实一致、pair id 唯一且与段号匹配、zh 必含汉字 / en 必无汉字、`playable` 与 `reviewStatus`+`source` 逻辑一致（ai_suggested/insufficient/needs_review 一律不可播）、**每条 en 必须能在本段原 `phrases` 中找到**（归一化空白；子串匹配时剩余部分必须是纯中文，故 `coconut water` 截成 `water` 会被拒）、CLEANUP 的 before 必须等于现网 `cnSentences` 拼接且双 hash 重算一致。

负向自检（防「凭空造英文」）：`water` ✗、`walk along the lake` ✗、`coconut water` ✓、`lay out a blanket` ✓、`different styles` ✓。

## 7. 遗留缺口（交给 T3/T5，不在 T2 范围）

1. 第 2/3/18 段 9 条表达 + 第 19 段 1 条 `chill` 需用户逐条点头，UI 目前（`V1.1-baseline.html:2814`）仍以 `phrases` 原串直接展示 chip，**未消费 `phrasePairs`**。
2. 「听词组」现为原串直读，会读出 `coconut water 椰子水` 这种中英混排（`V1.1-baseline.html:2819`），须在 T1 队列中改为 `zh → 1000ms → en`。
3. 第 18 段错位表达 `lay out a blanket` 需主开发者决定「移入 19 段」还是「删除」。
4. 照片、`placeId:null` 归属属 T3，本报告不涉及。
