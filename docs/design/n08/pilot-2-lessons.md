# N08 复习卡试点（大模型策展 · 2 课）

> 由 `scripts/n08-curate-cards.mjs` 调用 DeepSeek 生成；原句逐字取自课程原文，泛化只换一个词。

## 1-02 《2.家庭成员（下）》（家庭与朋友）

| # | 模式 | 中文提示（原句） | 原句 | 泛化：中文提示 → 英文 |
|---|---|---|---|---|
| 1 | 2 | 情境：别人问你有几个兄弟姐妹，你回答家里有三个兄弟姐妹。 | I have three siblings in my family. | [form] 改成疑问句：问对方有几个兄弟姐妹。 → How many siblings do you have?<br>[object] 换成说家里有两个兄弟姐妹。 → I have two siblings in my family. |
| 2 | 3 | 我没有兄弟姐妹。 | I don't have any siblings. | [form] 改成疑问句：问对方有没有兄弟姐妹。 → Do you have any siblings?<br>[person] 改成说他/她没有兄弟姐妹。 → He doesn't have any siblings. |
| 3 | 3 | 我是独生子女。 | I am an only child. | [form] 改成疑问句：问对方是不是独生子女。 → Are you an only child?<br>[person] 改成说她/他是独生子女。 → She is an only child. |
| 4 | 1 | 喜欢读书 | enjoy reading books | [object] 喜欢跑步 → enjoy running<br>[person] 改成说他喜欢读书 → He enjoys reading books. |
| 5 | 3 | 我喜欢旅行。 | I love traveling. | [object] 我喜欢游泳。 → I love swimming.<br>[person] 改成说她喜欢旅行。 → She loves traveling. |
| 6 | 3 | 他来自美国。 | He's from the USA. | [object] 他来自英国。 → He's from the UK.<br>[form] 改成疑问句：问他来自美国吗。 → Is he from the USA? |

## 2-17 《17.Y机舱服务1》（旅行和旅游）

| # | 模式 | 中文提示（原句） | 原句 | 泛化：中文提示 → 英文 |
|---|---|---|---|---|
| 1 | 3 | 请问，你能帮我找个地方放我的包吗？ | Could you help me find a place for my bag? | [object] 请问，你能帮我找个地方放我的背包吗？ → Could you help me find a place for my backpack?<br>[object] 请问，你能帮我找个地方放我的自行车吗？ → Could you help me find a place for my bike?<br>[person] 请问，他能帮我找个地方放我的包吗？ → Could he help me find a place for my bag? |
| 2 | 3 | 不好意思，这里真的很冷。 | Excuse me, it's really chilly here. | [form] 这里真的很冷吗？ → Is it really chilly here?<br>[object] 不好意思，这里真的很热。 → Excuse me, it's really hot here.<br>[person] 不好意思，他真的很冷。 → Excuse me, he is really chilly. |
| 3 | 3 | 可以给我一条毯子吗？ | Can I have a blanket? | [object] 可以给我一杯水吗？ → Can I have a glass of water?<br>[object] 可以给我一杯咖啡吗？ → Can I have a coffee?<br>[form] 可以给我一份零食吗？ → Can I have a snack? |
| 4 | 3 | 我可以坐那边靠窗的座位吗？ | Can I take the window seat over there? | [object] 我可以坐那边靠过道的座位吗？ → Can I take the aisle seat over there?<br>[object] 我可以坐那边中间的座位吗？ → Can I take the middle seat over there?<br>[form] 我可以坐那边靠窗的座位吗？（改成用may提问） → May I take the window seat over there? |
| 5 | 3 | 到纽约要多久？ | How long will it take to reach New York? | [object] 到加拿大要多久？ → How long will it take to reach Canada?<br>[object] 到纽约要多久？（改成用arrive in表达） → How long will it take to arrive in New York?<br>[form] 这次飞行要多久？ → How long is the flight? |

## 示例周包（原句 + 泛化，两段式）

**1. 模式2｜先说课本原句**
中文：情境：别人问你有几个兄弟姐妹，你回答家里有三个兄弟姐妹。  
答案：I have three siblings in my family.

**1.1 换成我自己的情况**
中文：改成疑问句：问对方有几个兄弟姐妹。  
答案：How many siblings do you have?

**2. 模式3｜先说课本原句**
中文：我没有兄弟姐妹。  
答案：I don't have any siblings.

**2.1 换成我自己的情况**
中文：改成疑问句：问对方有没有兄弟姐妹。  
答案：Do you have any siblings?

**3. 模式3｜先说课本原句**
中文：请问，你能帮我找个地方放我的包吗？  
答案：Could you help me find a place for my bag?

**3.1 换成我自己的情况**
中文：请问，你能帮我找个地方放我的背包吗？  
答案：Could you help me find a place for my backpack?

**4. 模式3｜先说课本原句**
中文：不好意思，这里真的很冷。  
答案：Excuse me, it's really chilly here.

**4.1 换成我自己的情况**
中文：这里真的很冷吗？  
答案：Is it really chilly here?

