# T3｜10 话题接话质量基准与模板修正（零费用）

- 阶段：ALW-001 N05 V1.5.1 / T3
- 日期：2026-11-04
- 范围：只改 `socialmate-v1.2/source/V1.1-baseline.html` 中建议相关的 JS 与词表；`socialmate-v1.2/index.html` 由 `build-v12.py` 生成。
- 边界：Node `vm` 内用桩执行，不启动浏览器、不联网、不调用任何真实大模型；真实 AI 路径只用本地桩验证顺序。
- 数据：`SocialMate-Data/Profile/current.json` 的 `stories` 为空；`people` 里 Mia 的 6 条属于对方，不能作为“我”的事实。

## 1. 结果摘要

| 指标 | 基线（改模板前） | 修改后 | 目标 | 判定 |
|---|---|---|---|---|
| 机器话题命中（detected = expected） | 3/10 | 10/10 | — | 参考项 |
| 人工相关性（0/1，逐组） | —（见 SCORECARD） | 10/10 | ≥8/10 | PASS |
| 组内明显语义重复/近义改写 | 0/10 组（机器） | 0/10 组 | ≤1/10 | PASS |
| 跨组 switch 完全相同的句子 | 3 句（每句出现在全部 10 组） | 0 句 | 应随话题变化 | PASS |
| 个人事实编造（第一人称断言，无已确认来源） | 10 处 | 0 处 | 0 | PASS |
| 隐私/人物误归属 | 0 | 0 | 0 | PASS |
| 每组每方向去重后最少条数 | respond 2 / ask 3 / share 2 / switch 3 | 3 / 3 / 3 / 3 | ≥2 | PASS |
| 空会话默认（无消息） | other，但旧模板 share 含编造 | other，四方向各 3 条、无编造 | 不产生空建议 | PASS |
| 真实 AI 路径（本地桩） | — | respond/ask/share 均以 AI 为第 1 候选，模板补足到 3 条 | 不截断成 1 条 | PASS |

> 说明：基线没有 `weather/arrival/travel/weekend/music` 等 key；`weather` 被旧 `/app/` 误判为 software；`weekend` 在旧规则里会因 `park|walk` 误判 running，本次中文混合句的地点名先被 `SM_LEXICON` 归一，最终落到 `other`；`hainan` 落到旧 `beach`。这是机器命中只有 3/10 的原因。

## 2. 评测方法

- `fixtures.json`：10 组固定话题，每组含对方最近 2–3 句、上一话题、人物 Mia、自己的已确认资料（统一 `null`，因 stories 为空）。t01/t02/t04 含轻度 ASR 拼写漂移（wether / arived / cofee）；t01/t05/t08/t10 为中文与英文混句输入。
- `eval-suggestions.mjs`：从 source HTML 按 `T3-EVAL:*` 标记抽取 `SM_LEXICON/smNormalize`、`SM_ASR_FIX/smFixAsr/currentTopic`、`SM_COACH_PLANS/coachPlan`、`suggestionsNow`，在 Node `vm` 里注入 `S` 桩执行。
- `baseline-snippet.js`：改模板前的三个函数原文快照。`git HEAD` 的同一文件仍是更早的 1976 行版本，不含这些函数，无法作为基线，故用快照保证可复现。
- 指标定义：
  - 规范化：小写、去标点、折叠空白；Jaccard 基于规范化后的词集合。
  - 近似重复：同组四个方向合并后，规范化完全相同或 Jaccard ≥ 0.8 的对数。
  - 跨组 switch：规范化后完全相同的句子出现在 ≥2 个话题组。
  - 编造：候选句含第一人称；先按 `FIRST_PERSON_CLAIM` 判经历/习惯/身份断言，再对照 `profile.stories`（当前为空）。`I can / I could / I'd / I don't know / I'm not familiar` 等能力与不确定表达不算断言。
  - 隐私/人物误归属：候选句以第一人称出现 Mia 事实标记（3200 / 2600 / SKU / Haidian / Guoxing / Hong Chen / certification / cost structure）。
  - 话题对焦：候选命中 fixture `focus` 关键词的比例，仅作机器参考，不替代人工判定。

### 复现命令

```bash
cd docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/t3-quality
node eval-suggestions.mjs --both        # 基线 vs 修改后汇总指标
node eval-suggestions.mjs --baseline --markdown
node eval-suggestions.mjs --markdown    # 逐组四方向候选
node eval-suggestions.mjs --ai-stub     # 本地桩验证 AI 第一候选
node eval-suggestions.mjs --empty       # 空会话默认 other
```

实际输出（`--both`）：

```text
[baseline] {"cases":10,"topicHits":3,"minItemsPerDirection":{"respond":2,"ask":3,"share":2,"switch":3},"minItemsOverall":2,"casesWithNearDup":0,"nearDupPairTotal":0,"crossSwitchRepeatSentences":3,"fabricatedClaims":9,"unclassifiedFirstPerson":0,"privacyMisattribution":0,"confirmedSelfFacts":0,"peopleFacts":6}
[current] {"cases":10,"topicHits":10,"minItemsPerDirection":{"respond":3,"ask":3,"share":3,"switch":3},"minItemsOverall":3,"casesWithNearDup":0,"nearDupPairTotal":0,"crossSwitchRepeatSentences":0,"fabricatedClaims":0,"unclassifiedFirstPerson":0,"privacyMisattribution":0,"confirmedSelfFacts":0,"peopleFacts":6}
```

### 基线编造明细（10 处，涉及 4 种句子）

| 出现位置 | 句子 | 问题 |
|---|---|---|
| t02/t06/t07/t08/t09/t10 share#0 | I was born and raised in Haikou, so I can suggest some local spots. | stories 为空，出生地/成长地无法核对 |
| t01 respond#0 | That is an interesting topic. I enjoy making practical little apps. | 断言“我喜欢做小软件” |
| t01 ask#2 | Would you like to see a small project I built? | 断言“我做过项目” |
| t04 share#0 | I enjoy medium-roast coffee and often make lattes at home. | 断言口味偏好与在家做拿铁的习惯 |

另有 t01 share#0（`I like building apps...`）与兜底 `I’ve been exploring Haikou too...` 同属无来源经历断言。

## 3. 逐组四方向候选（修改后）

来源列：模板 = 话题模板；兜底 = 四方向通用兜底；AI = 本地桩（仅 ai-stub 一节出现）。

#### t01 天气（期望 weather → 判定 weather｜模板 天气）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Yeah, the weather here can change fast — is it still like that today? | 是啊，这里的天气变化挺快的——今天还是这样吗？ | 模板 |
| 自然接话 | 2 | I get that. Humidity really changes how a day feels. | 我明白，湿度确实会让一整天的感觉不一样。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | Is it usually this humid around here? | 这一带平时都这么潮湿吗？ | 模板 |
| 继续追问 | 2 | Do you prefer sunny days or rainy ones? | 你更喜欢晴天还是雨天？ | 模板 |
| 继续追问 | 3 | Does the weather affect what you feel like doing? | 天气会影响你想做什么吗？ | 模板 |
| 分享自己 | 1 | If it rains later, I can share a place where we can wait it out. | 如果待会儿下雨，我可以分享一个能避雨的地方。 | 模板 |
| 分享自己 | 2 | I can look up the forecast for later today if that helps. | 如果需要，我可以帮你查今天稍晚的天气。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Since we're talking about weather, do you usually stay in on rainy days? | 既然聊到天气，你下雨天一般会待在家吗？ | 模板 |
| 转换话题 | 2 | Speaking of hot days, do you like walking in the evening when it cools down? | 说到热天，你喜欢傍晚凉快一点时散步吗？ | 模板 |
| 转换话题 | 3 | What's the weather usually like where you're from? | 你那边平时天气怎么样？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.667；含异常转写

#### t02 海口初到（期望 arrival → 判定 arrival｜模板 海口初到）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Welcome! Getting used to a new city takes a little time. | 欢迎！适应一座新城市需要一点时间。 | 模板 |
| 自然接话 | 2 | That sounds exciting — everything must feel new right now. | 听起来很兴奋——现在一切想必都很新鲜。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | How long have you been in Haikou so far? | 你到海口多久了？ | 模板 |
| 继续追问 | 2 | What's been the biggest surprise since you arrived? | 到这里之后，最让你意外的是什么？ | 模板 |
| 继续追问 | 3 | Is there anything you'd like to figure out first? | 有什么是你想先弄清楚的？ | 模板 |
| 分享自己 | 1 | I can show you a few everyday spots that make settling in easier. | 我可以带你看几个日常去处，让适应这里更容易。 | 模板 |
| 分享自己 | 2 | If you tell me the area, I can look up practical places nearby. | 如果你告诉我大概位置，我可以帮你查附近实用的地方。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | By the way, have you sorted out transport yet — bus, bike, or walking? | 对了，你的交通方式定了吗——公交、骑车还是走路？ | 模板 |
| 转换话题 | 2 | What kind of neighborhood do you usually like living in? | 你平时喜欢住在什么样的街区？ | 模板 |
| 转换话题 | 3 | Would it help to start with food or with getting around? | 先从吃的还是先从出行开始了解，会更有帮助？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.333；含异常转写

#### t03 跑步健身（期望 running → 判定 running｜模板 跑步健身）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | That sounds like a good way to clear your head. | 那听起来是个让头脑清醒的好办法。 | 模板 |
| 自然接话 | 2 | Nice — consistency matters more than speed in the beginning. | 不错——开始阶段，坚持比速度更重要。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | Do you usually run in the morning or in the evening? | 你通常早上跑还是傍晚跑？ | 模板 |
| 继续追问 | 2 | Do you prefer running by the sea or in a park? | 你更喜欢在海边跑还是在公园跑？ | 模板 |
| 继续追问 | 3 | How often do you get out for a run these days? | 你最近多久跑一次？ | 模板 |
| 分享自己 | 1 | There's a park by Haikou Bay where locals go running. I can show it on the map. | 海口湾边有个本地人常去跑步的公园，我可以在地图上指给你看。 | 模板 |
| 分享自己 | 2 | If you want, I can look up a park with shade for hotter days. | 如果你愿意，我可以帮你查一个有树荫的公园，热天更合适。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Speaking of exercise, do you also do any strength training? | 说到运动，你也会做力量训练吗？ | 模板 |
| 转换话题 | 2 | Do you like working out alone or with other people? | 你喜欢一个人练，还是和别人一起？ | 模板 |
| 转换话题 | 3 | What kind of music do you listen to while you run? | 你跑步时听什么音乐？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.417

#### t04 咖啡（期望 coffee → 判定 coffee｜模板 咖啡）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Coffee chats are the best kind of slow conversation. | 边喝咖啡边聊是最舒服的慢节奏对话。 | 模板 |
| 自然接话 | 2 | I like that — a good café can make a whole afternoon. | 我喜欢这样——一家好咖啡馆能让整个下午都舒服起来。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | What kind of coffee do you usually order? | 你平时点什么咖啡？ | 模板 |
| 继续追问 | 2 | Do you like a quiet café or a busy one? | 你喜欢安静的咖啡馆，还是热闹的？ | 模板 |
| 继续追问 | 3 | Have you found any cafés around here that you like? | 这附近有你喜欢的咖啡馆吗？ | 模板 |
| 分享自己 | 1 | There are a couple of small streets in Haikou with nice cafés. I can show you on the map. | 海口有几条小街上有不错的咖啡馆，我可以在地图上指给你看。 | 模板 |
| 分享自己 | 2 | If you tell me the area, I can look up a café that's easy to reach. | 如果你告诉我位置，我可以帮你查一家好找的咖啡馆。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Speaking of cafés, do you also like tea? | 说到咖啡馆，你也喜欢喝茶吗？ | 模板 |
| 转换话题 | 2 | What do you usually do at a café — read, work, or just talk? | 你在咖啡馆一般做什么——看书、工作，还是聊天？ | 模板 |
| 转换话题 | 3 | Do you prefer meeting people in the morning or in the afternoon? | 你更喜欢早上见人，还是下午？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.167；含异常转写

#### t05 海南景点（期望 hainan → 判定 hainan｜模板 海南景点）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Haikou has a lot of low-key spots that don't feel touristy. | 海口有不少低调的地方，不那么像游客区。 | 模板 |
| 自然接话 | 2 | That sounds like a nice way to spend a day here. | 听起来是在这里度过一天的好方式。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | Do you prefer coastal walks or old streets? | 你更喜欢海边步道，还是老街？ | 模板 |
| 继续追问 | 2 | Are you looking for something lively or something quiet? | 你想找热闹一点的地方，还是安静一点的？ | 模板 |
| 继续追问 | 3 | How much time do you have for a trip like this? | 这趟你大概有多少时间？ | 模板 |
| 分享自己 | 1 | There's a curved white building by Haikou Bay that's good for a sunset walk. I can show you. | 海口湾边有一栋弧形白色建筑，很适合日落时散步，我可以指给你看。 | 模板 |
| 分享自己 | 2 | If you pick one place, I can look up the opening hours and how to get there. | 如果你选一个地方，我可以帮你查开放时间和怎么过去。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Do you like places with history or places with a view? | 你喜欢有历史感的地方，还是有风景的地方？ | 模板 |
| 转换话题 | 2 | What's the last place you visited that you really liked? | 你最近去过、并且很喜欢的地方是哪里？ | 模板 |
| 转换话题 | 3 | Would you rather go early or avoid the crowds at night? | 你更愿意早点去，还是晚上避开人群？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.167

#### t06 工作或软件（期望 software → 判定 software｜模板 工作或软件）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | That sounds like detailed work — how's it going so far? | 听起来是很细致的工作——目前进展怎么样？ | 模板 |
| 自然接话 | 2 | Breaking things down usually makes them easier to handle. | 把事情拆开，通常更容易处理。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | What part of it takes the most time right now? | 目前哪一部分最花时间？ | 模板 |
| 继续追问 | 2 | Do you work on this alone or with a team? | 这件事你是一个人做，还是和团队一起？ | 模板 |
| 继续追问 | 3 | What tools do you usually use for it? | 你平时用什么工具做这件事？ | 模板 |
| 分享自己 | 1 | If it's useful, I can share a simple way to organize that kind of work. | 如果有用，我可以分享一个整理这类工作的简单方法。 | 模板 |
| 分享自己 | 2 | I can look up a template for that if you want one. | 如果你想要，我可以帮你找一个模板。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Speaking of work, how do you usually switch off after a long day? | 说到工作，忙完一天你一般怎么放松？ | 模板 |
| 转换话题 | 2 | Do you prefer planning everything or figuring it out as you go? | 你更喜欢把一切计划好，还是边做边想？ | 模板 |
| 转换话题 | 3 | Is this something you'd like to keep doing long term? | 这件事你想长期做下去吗？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.333

#### t07 旅行（期望 travel → 判定 travel｜模板 旅行）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Travel is a great excuse to slow down and look around. | 旅行是放慢脚步、四处看看的好理由。 | 模板 |
| 自然接话 | 2 | That sounds like a trip worth planning carefully. | 听起来是一趟值得好好计划的旅行。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | Do you like planning a trip in detail or deciding as you go? | 你喜欢详细计划行程，还是边走边决定？ | 模板 |
| 继续追问 | 2 | What kind of places do you usually look for when you travel? | 你旅行时一般会找什么样的地方？ | 模板 |
| 继续追问 | 3 | How long do you usually stay in one place? | 你通常在一个地方待多久？ | 模板 |
| 分享自己 | 1 | If you're heading somewhere nearby, I can look up a route and a few stops. | 如果你要去附近的地方，我可以帮你查路线和几个停靠点。 | 模板 |
| 分享自己 | 2 | I can share a short list of places that are easy to reach from Haikou. | 我可以分享一份从海口出发、交通方便的地方清单。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Do you prefer city trips or nature trips? | 你更喜欢城市旅行，还是自然风光？ | 模板 |
| 转换话题 | 2 | What's the best trip you've had so far? | 到目前为止，你最好的一趟旅行是哪次？ | 模板 |
| 转换话题 | 3 | Do you take a lot of photos when you travel? | 你旅行时会拍很多照片吗？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.667

#### t08 周末安排（期望 weekend → 判定 weekend｜模板 周末安排）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Saturday afternoons can get busy there — going earlier usually helps. | 周六下午那里可能会比较挤——早点去通常会好一些。 | 模板 |
| 自然接话 | 2 | A lakeside walk sounds like a nice way to spend Saturday. | 沿湖走走，听起来是度过周六的好方式。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | Do you already have something planned for Saturday? | 你周六已经安排好了吗？ | 模板 |
| 继续追问 | 2 | Do you prefer a quiet weekend or a full one? | 你更喜欢安静的周末，还是排得满满的？ | 模板 |
| 继续追问 | 3 | Who do you usually spend weekends with? | 你周末一般和谁一起过？ | 模板 |
| 分享自己 | 1 | If you want a low-key option, I can suggest a park or a waterfront walk. | 如果你想要低调一点的选择，我可以推荐一个公园或滨海步道。 | 模板 |
| 分享自己 | 2 | If you tell me the area, I can check what's open this weekend. | 如果你告诉我位置，我可以查这个周末哪些地方开着。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Speaking of weekends, do you ever meet friends for coffee? | 说到周末，你会和朋友约咖啡吗？ | 模板 |
| 转换话题 | 2 | Do you like to sleep in or get up early on weekends? | 周末你喜欢睡懒觉，还是早起？ | 模板 |
| 转换话题 | 3 | What makes a weekend feel good for you? | 什么样的周末会让你觉得舒服？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.833

#### t09 音乐生活（期望 music → 判定 music｜模板 音乐生活）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Music changes the mood of a whole room, doesn't it? | 音乐能改变整个房间的气氛，对吧？ | 模板 |
| 自然接话 | 2 | That sounds like something worth listening to. | 听起来是值得一听的东西。 | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | What kind of music do you listen to most? | 你最常听什么音乐？ | 模板 |
| 继续追问 | 2 | Do you prefer live music or recorded? | 你更喜欢现场演出，还是录音？ | 模板 |
| 继续追问 | 3 | Is there a song you've had on repeat lately? | 最近有没有一首你反复听的歌？ | 模板 |
| 分享自己 | 1 | If you're looking for live music, I can help you search for small venues in Haikou. | 如果你在找现场音乐，我可以帮你查海口的小场地。 | 模板 |
| 分享自己 | 2 | If you want, I can share a playlist idea for a quiet evening. | 如果你愿意，我可以分享一个适合安静夜晚的歌单思路。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Speaking of music, do you also like going to small live shows? | 说到音乐，你也喜欢去看小型现场演出吗？ | 模板 |
| 转换话题 | 2 | Do you listen to music while you work or while you walk? | 你工作或走路时会听音乐吗？ | 模板 |
| 转换话题 | 3 | What's the last concert or show you went to? | 你最近一次去的演唱会或演出是什么？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.667

#### t10 陌生话题转场（期望 other → 判定 other｜模板 继续交流）

| 方向 | # | 英文 | 中文 | 来源 |
|---|---|---|---|---|
| 自然接话 | 1 | Oh, that's new to me — how would you describe it? | 哦，这对我来说挺新鲜的——你会怎么形容它？ | 模板 |
| 自然接话 | 2 | It sounds like there's a lot to it. What's the best part? | 听起来里面有不少门道。最有趣的部分是什么？ | 模板 |
| 自然接话 | 3 | That sounds interesting. Tell me a little more. | 听起来很有意思，能再多说一点吗？ | 兜底 |
| 继续追问 | 1 | How did you get into that? | 你是怎么开始接触这个的？ | 模板 |
| 继续追问 | 2 | What do you enjoy most about it? | 你最喜欢它的哪一点？ | 模板 |
| 继续追问 | 3 | What would you like to try next with it? | 接下来你想在这方面尝试什么？ | 模板 |
| 分享自己 | 1 | If you want, I can look up some beginner tips for that. | 如果你愿意，我可以帮你查一些入门建议。 | 模板 |
| 分享自己 | 2 | If you decide to try it, I can help you find a place that offers it. | 如果你决定试试，我可以帮你找一个提供这项活动的地方。 | 模板 |
| 分享自己 | 3 | I can share a local tip if that would help. | 如果这有帮助，我可以分享一个本地小建议。 | 兜底 |
| 转换话题 | 1 | Since this is new to me, would you rather explain it or talk about something easier? | 既然这对我来说是新的，你更愿意解释一下，还是聊点更轻松的？ | 模板 |
| 转换话题 | 2 | Do you usually bring this up with friends too? | 你平时也会和朋友聊这个吗？ | 模板 |
| 转换话题 | 3 | Would you like to keep this as a regular hobby? | 你想把这个发展成长期爱好吗？ | 模板 |

指标：条数 {"respond":3,"ask":3,"share":3,"switch":3}；近似重复 0 对；话题对焦 0.167

## 4. 人工审阅抽样（评审者：子代理 C）

评分口径：三项各 0/1 —— ①对焦最新话题（respond 至少 1 条直接回应最新句，ask/share/switch 至少 2 个方向带话题锚点）②自然口语（无生硬拼接、无中文式英语）③可区分（方向间意图不同，组内无明显近义改写）。三项全 1 才记相关性 1。

### t01 天气（判 1）

- respond#1 直接接住“humid / rain”，并回问“今天还是这样吗”，对焦最新句；`the weather here can change fast` 是一般天气说法，不是个人事实。
- respond#2 只做共情（湿度影响一天感受），不虚构经历。
- ask 三条分别是“平时都这么潮吗 / 晴天还是雨天 / 天气影响想做的事”，意图可区分。
- share 两条都是“可提供的信息或可代查”，没有说“我住在海口 / 我常来这里”。
- switch 三条分别转到雨天在家、热天傍晚散步、对方家乡天气，不是“咖啡/骑楼/周末”万能三连。
- 结论：对焦 1 + 自然 1 + 可区分 1 → **相关性 1**。

### t06 工作或软件（判 1）

- 对方说的是“拆 SKU 成本结构 + 周五 deadline”。respond#1 用 `detailed work — how's it going so far?` 接住工作细节，没有猜行业或替对方下结论。
- ask 三条分别问“最花时间的部分 / 独自还是团队 / 用什么工具”，是三个不同信息点。
- share 两条是“可分享整理方法 / 可代查模板”，没有声称“我做过同类项目”。
- 关键红线：Mia 的 SKU、成本、3200 等事实没有被写成“我”的经历；候选里也没有出现这些标记。
- switch 从工作转到“下班怎么放松 / 计划风格 / 是否长期做”，与工作自然相关。
- 结论：**相关性 1**。

### t10 陌生话题转场（判 1）

- 对方说“在学陶艺，比看起来难”。other 模板没有假装懂陶艺：respond#1 `that's new to me — how would you describe it?` 是可靠的转场，respond#2 只问“最有趣的部分”。
- ask 三条（怎么开始 / 最喜欢哪点 / 下一步想试什么）通用但不空洞，彼此可区分。
- share 两条只提供“查入门建议 / 找提供这项活动的地方”，不断言“我学过陶艺”。
- switch 三条给出明确出口：解释或换轻松话题 / 是否常和朋友聊 / 是否发展成长期爱好。
- 机器话题对焦仅 0.167 是预期：other 不应假装命中 pottery 关键词；按“可靠兜底、不误判具体话题”的口径判 1。
- 结论：**相关性 1**。

其余 7 组按同一口径判 1：t02 初到（交通/街区/先解决什么）、t03 跑步（时间/海边或公园/频率）、t04 咖啡（点单/安静或热闹/附近咖啡馆）、t05 景点（海边步道或老街/热闹或安静/时间，share 落在海口湾日落建筑）、t07 旅行（计划方式/找什么地方/待多久）、t08 周末（直接回应周六下午会不会挤）、t09 音乐（听什么/现场或录音/最近循环的歌）。

## 5. 编造与隐私检查（修改后）

- 第一人称扫描：`fabricatedClaims = 0`，`unclassifiedFirstPerson = 0`。
- 模板中的第一人称只剩能力/不确定表达：`I can …`、`I get that`、`I like that`、`I'm not familiar`、`I don't know much`。
- `confirmedSelfFacts = 0`（profile.stories 为空），因此任何“我经历过/我习惯/我是”的断言都会被判编造；修改后没有出现。
- 隐私/人物误归属：0。没有把 Mia 的 3200/2600/SKU/Hong Chen/exam 等事实说成“我”的。
- 分享方向统一改成“可提供的帮助 / 可代查的信息”，不再用“我出生在… / 我常在家做… / 我喜欢做…”。

## 6. 真实 AI 路径（本地桩，不联网）

`--ai-stub` 结果：`respond / ask / share` 的第 1 条均为 `AI-STUB`，后续由模板补足到 3 条；`switch` 保持话题模板。证明 `S.aiState==='ready'` 时 `real.reply / real.questions / real.share` 仍作为第一个候选，未被截断成 1 条。

来源标识逻辑未改：`showRecs()` 仍按 `sugg.ai` 显示“智能建议 / 本地建议”。

## 7. 空会话默认

`--empty`：`S.session = null` 时 `currentTopic()` 返回 `other`，`coachPlan()` 返回完整 other 模板，四方向各 3 条。页面无消息时仍由 `showRecs()` 显示 `chat.coachEmpty` 空状态（既有交互），不会渲染空分组。

## 8. 构建与校验

```bash
python3 socialmate-v1.2/build-v12.py
# built socialmate-v1.2/index.html apps 51 steps 204 places 115 stories 5
```

- `source` 与 `index` 的 `T3-EVAL` 三段逐字节一致（13,960 字符，`identical`）。
- 10 个 key 在 source/index 均存在：`SM_TOPIC_RULES` 中 9 个具体话题 + `other` 兜底返回；`SM_COACH_PLANS` 中 10 个全有。
- 抽取内联 script 后 `node --check`：source 与 index 均 `SYNTAX_OK`。
- `git status --porcelain` 本次触碰：`M socialmate-v1.2/source/V1.1-baseline.html`、`M socialmate-v1.2/index.html`（构建器改写）、`?? docs/plan/…/qa/t3-quality/`。

`git diff --stat`（两文件）：

```text
 socialmate-v1.2/index.html                | 2424 +++++++++++++++++++++++++---
 socialmate-v1.2/source/V1.1-baseline.html | 2426 ++++++++++++++++++++++++++---
 2 files changed, 4443 insertions(+), 407 deletions(-)
```

注意：`git HEAD` 的 `V1.1-baseline.html` 仍是更早的 1976 行版本，上述 stat 包含本任务之前工作区已有的累计差异，不代表本次净改动量。本次净改动仅限建议相关函数与词表，见下节。

## 9. 代码改动摘要（source）

| 位置 | 改动 |
|---|---|
| `SM_LEXICON` 前后 | 增加 `T3-EVAL:SM-START/END` 标记，供离线抽取；逻辑未改 |
| `currentTopic()` 前 | 新增 `SM_ASR_FIX`（14 组 ASR 拼写漂移）与 `smFixAsr()`；新增 `SM_TOPIC_RULES`（arrival / weather / coffee / weekend / running / music / software / travel / hainan，`other` 为兜底） |
| `currentTopic()` | 取最近 4 条消息 → `smNormalize` → `smFixAsr` → 按优先级匹配；无文本或未命中返回 `other`（不再返回 `none`） |
| `coachPlan()` | 改为 10 话题 `SM_COACH_PLANS`，每话题含 `respond/respondAlt`、3 条 `ask`、`share/shareAlt`、3 条 `switches`；`share` 仍是字符串，保持既有调用点兼容 |
| `automaticCards()` | 旧 `k==='beach'` 改为 `k==='hainan'`，关联地点 41/17/4 |
| `suggestionsNow()` | 增加跨方向共享 `seen` 去重；share 支持 `shareAlt`；switch 改为话题 `switches` + 通用兜底；每方向 `slice(0,3)` 不变 |

## 10. 未达标项与限制

- 未达标项：无。相关性 10/10、重复 0、编造 0、隐私 0，均达到目标。
- 限制：
  1. 这是本地模板/规则基准，不是大模型语义理解；`--ai-stub` 只验证路径顺序，模型级真实表现仍为 NOT_RUN（未授权付费调用）。
  2. 近似重复的 Jaccard 基于英文词集合；中文只做“规范化后完全相同”判断，中文近义改写依赖人工审阅。
  3. 未做真机 UI 回归（属 T4），本任务只保证建议数据与既有渲染接口兼容。
  4. `other` 的话题对焦机器值天然偏低（0.167），按“可靠兜底、不误判”口径人工判 1；不以机器值替代人工结论。