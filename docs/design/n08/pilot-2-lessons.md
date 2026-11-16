# N08 复习卡试点（大模型策展 · 2 课）

> 由 `scripts/n08-curate-cards.mjs` 调用 DeepSeek 生成；原句逐字取自课程原文，泛化只换一个词。

## 1-02 《2.家庭成员（下）》（家庭与朋友）

| # | 模式 | 中文提示（原句） | 原句 | 泛化：中文提示 → 英文 |
|---|---|---|---|---|
| 1 | 2 | 你问对方有几个兄弟姐妹 | How many siblings do you have? | [person] 问别人（他）有几个兄弟姐妹 → How many siblings does he have?<br>[object] 问对方有几个孩子 → How many children do you have? |
| 2 | 3 | 我是独生子女 | I am an only child. | [form] 问对方是不是独生子女 → Are you an only child?<br>[person] 说她是独生子女 → She is an only child. |
| 3 | 3 | 我喜欢旅行 | I love traveling. | [object] 我喜欢游泳 → I love swimming.<br>[person] 说他喜欢旅行 → He loves traveling. |
| 4 | 3 | 他来自美国 | He's from the USA. | [object] 他来自英国 → He's from the UK.<br>[person] 我来自美国 → I'm from the USA. |
| 5 | 3 | 但他现在住在中国 | But at the moment he lives in China. | [object] 但他现在住在加拿大 → But at the moment he lives in Canada.<br>[person] 但我现在住在中国 → But at the moment I live in China. |

## 2-17 《17.Y机舱服务1》（旅行和旅游）

| # | 模式 | 中文提示（原句） | 原句 | 泛化：中文提示 → 英文 |
|---|---|---|---|---|
| 1 | 3 | 不好意思，你能帮我找个放包的地方吗？ | Could you help me find a place for my bag? | [object] 不好意思，你能帮我找个放背包的地方吗？ → Could you help me find a place for my backpack?<br>[object] 不好意思，你能帮我找个放自行车的地方吗？ → Could you help me find a place for my bike? |
| 2 | 3 | 可以给我一条毯子吗？ | Can I have a blanket? | [object] 可以给我一杯水吗？ → Can I have a glass of water?<br>[object] 可以给我一杯咖啡吗？ → Can I have a coffee? |
| 3 | 3 | 我可以坐那边靠窗的座位吗？ | Can I take the window seat over there? | [object] 我可以坐那边靠过道的座位吗？ → Can I take the aisle seat over there?<br>[object] 我可以坐那边中间的座位吗？ → Can I take the middle seat over there? |
| 4 | 3 | 到纽约要多久？ | How long will it take to reach New York? | [object] 到加拿大要多久？ → How long will it take to reach Canada?<br>[form] 到纽约要多久？（改成一般疑问句） → Will it take long to reach New York? |

## 示例周包（原句 + 泛化，两段式）

**1. 模式2｜先说课本原句**
中文：你问对方有几个兄弟姐妹  
答案：How many siblings do you have?

**1.1 换成我自己的情况**
中文：问别人（他）有几个兄弟姐妹  
答案：How many siblings does he have?

**2. 模式3｜先说课本原句**
中文：我是独生子女  
答案：I am an only child.

**2.1 换成我自己的情况**
中文：问对方是不是独生子女  
答案：Are you an only child?

**3. 模式3｜先说课本原句**
中文：不好意思，你能帮我找个放包的地方吗？  
答案：Could you help me find a place for my bag?

**3.1 换成我自己的情况**
中文：不好意思，你能帮我找个放背包的地方吗？  
答案：Could you help me find a place for my backpack?

**4. 模式3｜先说课本原句**
中文：可以给我一条毯子吗？  
答案：Can I have a blanket?

**4.1 换成我自己的情况**
中文：可以给我一杯水吗？  
答案：Can I have a glass of water?

