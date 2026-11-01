# 我的软件作品集｜中英双语现场演示手册（完整维护主稿）

> 版本：V1.4｜2026-10-31｜GitHub：<https://github.com/wanghoufan>  
> 用途：在手机上向外国朋友展示自己开发的软件，同时作为后续智能体可以独立维护的完整主稿。  
> 状态说明：保留既有双语总介绍和可核实的演示操作，清理通用占位话术与断裂章节。证据不充分的条目提供明确的场景讲解而不是虚构的按钮操作。

## 第一部分｜后续智能体必须遵守的维护指令（最优先）

1. **演示现场优先**：把能在手机上直接打开的 Android/iOS APP 与 PWA 放在最前；其次是可以通过手机浏览器演示的作品；最后才是桌面网站、电脑工具、管理性质的产品。**排序不改变 P 编号**。
2. **双层介绍**：每项先保留一段中文、紧跟一段口语英文的总体介绍，回答“为什么做、解决什么问题、能做什么”；之后必须有按 1/2/3/4 编号的具体功能演示，每条都给出「中文功能及具体操作」和能边操作边说的「英文讲解」，英文不是逐字直译。
3. **表述对象是外国朋友**：中文要自然大白话，英文用第一人称和短句，如 “Let me show you...”, “I tap...”, “Here you can see...”；不要写营销宣传语或硬邦邦的技术说明，也不要暗示用户英文流利或能讲长篇技术内容。
4. **实际可操作**：优先真机 APP/PWA 的准确页面、按钮、操作顺序、能观察到的结果。步骤只在已查到真实功能时写得具体。若功能或页面未核实，必须写「待真机核实／示例演示话术」，不杜撰按钮名。软件目前仅规划的功能，不可当成已实现。
5. **公私有全量核实**：使用账号权限读取 GitHub `wanghoufan` 的公开**和私有**仓库、README、SPEC、HANDOFF、CHANGELOG、Release、实际代码或可运行产品；仓库 README 若是 ORCA 通用模板，继续查真实功能文档。还要考虑手机里已经装好的私有 APP，即使未公开、无官网也要保留；无法访问手机则保留「待真机核对」。
6. **产品去重**：多个仓库属于同一个产品时合并（如 P027/P062、P015/P029）；独立产品不得仅凭名字类似而合并。排除纯开发治理、ORCA、配置备份和管理仓库。私有仓库页面不可当作外国朋友能访问的演示链接。
7. **固定索引**：必须保留每条原 P 编号。用户说“改 P057 的第 3 个功能”，只能按该编号精确修改，同时同步更新中文、英文和演示步骤；不能重排功能编号导致失去定位。
8. **文稿全量交付**：每次新增或修订必须在此前最新版基础上合并全部已确认内容，输出可独立阅读的完整 `.md`；绝不交付增量补丁。文件名使用英文，版本号递增。若交给另一个智能体且内容超过 3000 字，用 MD 下载＋简短接手提示词。
9. **优先可演示性**：每项记录产品形态与适合手机现场演示的优先级；缺少安装包、需要专用网络、未部署、登录等阻塞必须标注，不能假设现场一定能打开。
10. **子代理**：如客户端确实拥有原生子代理通道，可并行分项目读取与核查，继承主模型，不用 ORCA 子代理；权限自动审批只在产品平台许可的安全范围内设置，不能跳过高风险授权。没有该通道不应声称已调用。

## 第二部分｜演示推荐顺序与证据边界

- **A｜手机 APP / PWA 优先**：建议把 APK 和 PWA 添加到手机桌面，提前验证网络与数据；朋友在场时只展示最直观的 2–4 个功能。
- **B｜手机浏览器 / 特殊条件**：部分软件可用手机打开，但可能需要拍摄设备、双机协作、个人局域网或项目还在开发中。不要把开发中的东西称为“已发布”。
- **C｜电脑网站和桌面工具**：保留完整介绍和功能路线，遇到有电脑的场合再展示。
- **证据口径**：已核实的功能说明参考 V1.2 中从 GitHub 项目 README 读取的细节，以及当前会话中的项目背景；尚未逐项真实点击验收。本版是**演示学习手册**，不是 51 款软件真机 QA 已通过的证明。

---

## A｜手机 APP / PWA（现场展示最优先）

> **现场演示口径：** 标有「逐项讲解」的步骤以已有资料为依据，但仍需与手机版本核对；标有「资料有限」的不是已验收点击教程，适合先介绍项目构想，不要拿来冒充实际软件功能。

### P002｜人生物种测试 · Personality Quiz

**中文**

这是我做的一个趣味性格测试软件。我觉得很多人其实不太清楚自己是什么性格、喜欢什么样的生活，所以想通过一些简单有趣的问题，帮大家更好地认识自己。做完测试后，还可以跟朋友分享结果，看看彼此有什么不同。

**English**

I made this fun personality quiz to help people understand themselves a little better. You answer some simple questions, and it gives you insights into your personality and preferences. It’s also a fun way to compare results with friends and learn more about each other.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍测评主题**
   - 中文：先告诉朋友这是一个了解性格的趣味测评。
   - English: This is a fun quiz about personality and preferences.
2. **展示问题**
   - 中文：打开可用题目，读一条你觉得有趣的问题。
   - English: Here’s the kind of question it asks.
3. **解释答题**
   - 中文：用一两个问题解释你会怎样选择答案。
   - English: I choose the answer that feels most like me.
4. **展示讨论**
   - 中文：如果实际版本提供结果页，展示结果并与朋友讨论。
   - English: We can talk about the results and see what we have in common.


### P005｜亲缘图谱 · Family Tree

**中文**

这是一个整理家庭成员关系的软件。比如家里亲戚太多，碰到远房亲戚不知道怎么称呼，就可以在里面查。它能把几代人的关系画成家族图谱，还可以保存家人的照片，特别适合大家族。

**English**

I built a family tree app that helps you keep track of your relatives. In Chinese families, there are so many different names for relatives, and it can get really confusing. My app figures out how people are related and what you should call them. You can also add family photos and explore your whole family tree.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜建立家族成员：在成员管理里新增姓名和亲属资料。**  
   **English｜** First, I add family members and their details.
2. **中文｜连接亲属关系：把父母、配偶和兄弟姐妹的关系录进去。**  
   **English｜** Then I connect people as parents, partners, or siblings.
3. **中文｜查询称呼：选择两位家人，查看彼此应该怎么称呼。**  
   **English｜** I can pick any two people and see how they are related and what they should call each other.
4. **中文｜展示家族图：缩放关系图，点开照片，或导出图谱分享。**  
   **English｜** And here’s the family tree. I can zoom in, look at photos, and export it to share.

### P011｜我的地点 · My Places

**中文**

这是我做的一个私人地点手账。比如我发现一家不错的咖啡馆，或者去了一个很漂亮的地方，就可以把照片、地点和自己的感受记录下来。以后想回忆或者推荐给朋友，直接打开就能找到。

**English**

I made this app to keep track of places I’ve visited. Whenever I find a nice café, a beautiful spot, or somewhere interesting, I can save photos and write a few notes about it. Later, I can easily find those places again or share my favorites with friends. It’s basically my personal travel and lifestyle journal.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜记录地点：进入记录页，选地点、上传照片、写下感受。**  
   **English｜** I tap the record section, choose a place, add some photos, and write a few notes.
2. **中文｜浏览回忆：切换画廊或地点视图，看看去过的地方。**  
   **English｜** Here I can browse my memories as a gallery or by location.
3. **中文｜寻找地点：在搜索页输入关键词，搭配地区或类型筛选。**  
   **English｜** If I want to find a place again, I just search for it and add filters.
4. **中文｜分享地点：选一条记录生成分享卡片或只读链接。**  
   **English｜** And I can share a place with a friend without sharing my private notes.

### P016｜懒得打字 · Speak Instead of Typing

**中文**

这是我做的一款语音翻译输入软件。比如我跟外国朋友聊天，想表达一段比较复杂的意思，但英语不够好，就直接用中文说出来。它会帮我整理成自然的英语，直接填到微信或者其他聊天软件里，不用反复复制粘贴。

**English**

I built this app because I wanted an easier way to chat with international friends. Instead of typing in English, I can just speak Chinese, and the app turns what I say into natural English and puts it directly into my chat. It also works for other languages, reviews, and journal entries. It makes communicating in another language a lot easier.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜选择模式：打开悬浮工具，选直翻外语或口语查询。**  
   **English｜** I open the floating tool and pick the translation mode.
2. **中文｜语音输入：在聊天输入框里说出中文。**  
   **English｜** Then I simply speak Chinese while I’m in a chat.
3. **中文｜查看结果：软件整理出自然的外语表达，可按需核对。**  
   **English｜** It turns what I said into more natural English, and I can check the result.
4. **中文｜写回聊天：把结果写进当前输入框，再自行检查发送。**  
   **English｜** The translation goes back into the chat box, and I can review it before sending.

### P019｜拍照点助手 · Photo Spot Finder

**中文**

这个软件主要是帮助喜欢拍照的人整理和寻找拍摄地点。比如刷到别人拍得很漂亮的照片，我希望能够方便地找到拍摄地点、保存参考照片，出门拍照时就不用临时到处找地方。

**English**

This is a project I’ve been working on for people who love photography. The idea is to help you discover interesting photo spots and organize your shooting locations and reference photos. That way, when you go out to take pictures, you already have some good places in mind.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **展示参考照片**
   - 中文：打开已有拍摄参考图，说明你想模仿的感觉。
   - English: I save photo references so I can plan a shoot.
2. **解释选地点**
   - 中文：结合参考图讲述自己为什么选择这个地点。
   - English: This helps me decide where I want to take photos.
3. **整理拍摄准备**
   - 中文：展示实际存在的地点或参考图记录；若尚无界面，用现有素材讲述思路。
   - English: I keep my location ideas and photo references together.
4. **对照拍摄成品**
   - 中文：拿出手机里已经拍摄的实拍照片与参考图比较。
   - English: Here’s how the actual photo turned out.


### P020｜拉伸换边计时器 · Stretch Timer

**中文**

我平时拉伸的时候，经常需要左右两边轮流做动作，但每次都要自己看时间，所以做了这个软件。只要设置好时间，它就会自动倒计时，到时间提醒换边，还可以播放提示音和背景音乐。

**English**

I built this because I do a lot of stretching, and I got tired of constantly checking the time. You just set how long you want to stretch each side, and the app automatically tells you when to switch. It also has different sounds and background music, so you can focus on stretching instead of watching the clock.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜设置计时：选择单侧时长和训练总时长。**  
   **English｜** First, I choose how long to stretch each side and the total session time.
2. **中文｜开始拉伸：点开始，跟着倒计时动作。**  
   **English｜** I tap Start and follow the countdown.
3. **中文｜自动换边：听到提醒后换到另一边，无需自己重设秒表。**  
   **English｜** When it makes a sound, I switch sides. I don’t need to restart the timer.
4. **中文｜查看记录：结束后打开历史页回顾训练。**  
   **English｜** Afterwards, I can check my workout history.

### P025｜拉伸训练 · Stretch Routine

**中文**

这是一个帮助自己规律做拉伸的软件。我希望把常见的拉伸动作和训练安排整理好，这样每天打开手机就可以照着练，不用每次都重新找教程。

**English**

I started this app to make daily stretching easier. The idea is to organize stretching exercises into simple routines, so you can just open the app and follow along instead of searching for different videos every time. It’s all about making stretching a regular habit.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍训练目标**
   - 中文：告诉朋友这一套拉伸为哪些身体部位服务。
   - English: I use this to organize my stretching routine.
2. **选择动作**
   - 中文：从实际可见的训练内容中选一个动作。
   - English: I choose a stretch I want to work on.
3. **示范动作**
   - 中文：跟随真实训练内容做一次动作，不编造计时按钮。
   - English: Then I follow the exercise step by step.
4. **说明长期使用**
   - 中文：展示已有记录；如没有统计页，仅介绍希望养成的习惯。
   - English: The goal is to make stretching part of my daily routine.


### P026｜夜间补光灯 · Screen Fill Light

**中文**

这是一个把手机屏幕变成临时补光灯的小工具。比如晚上自拍、拍视频或者视频聊天，光线不太好的时候，可以直接用手机补一点光，不用专门带一盏灯。

**English**

This is a little tool that turns your phone screen into a fill light. It’s useful when you’re taking selfies, recording videos, or making video calls in low light. The idea is to have a quick, simple lighting option without carrying extra equipment.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **说明弱光场景**
   - 中文：在室内暗一点的地方说明补光需求。
   - English: Sometimes I need a little extra light for a photo.
2. **使用屏幕补光**
   - 中文：在实际应用中打开可用的补光画面。
   - English: I use the phone screen as a simple fill light.
3. **比较效果**
   - 中文：切换应用前后对比脸部照明。
   - English: You can see how it changes the lighting on my face.
4. **实际自拍**
   - 中文：用另一台设备拍照对比效果。
   - English: Here’s the difference in a real photo.


### P027 / P062｜蛋白质计算器 · Protein Calculator

**中文**

这是我为健身做的蛋白质计算器。因为很多人不知道自己每天需要多少蛋白质，也不清楚一块鸡胸肉或者几个鸡蛋到底含多少蛋白质。这个软件可以根据体重和健身目标计算每天的需要量，还可以把吃过的食物加进去，看看今天吃够了没有。

**English**

I made this protein calculator because I work out and wanted an easy way to track my protein intake. You enter your weight and fitness goal, and it estimates how much protein you need each day. You can also add foods like eggs, chicken, or milk to see how much protein you’re getting and how much more you might need.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜计算目标：输入体重、选择维持或增肌等目标。**  
   **English｜** I enter my weight and pick a goal, like muscle gain.
2. **中文｜添加食物：从食物列表选鸡蛋、牛奶等并调整份量。**  
   **English｜** Then I add foods like eggs or milk and set the portion sizes.
3. **中文｜查看差额：对比已经吃到的蛋白质和每日目标。**  
   **English｜** It shows how much protein I’ve had and how much I still need.
4. **中文｜浏览榜单：打开高蛋白食物榜，快速对比常见食物。**  
   **English｜** I can also browse a list of high-protein foods to get ideas.

### P028｜聚会之夜 · Party Night

**中文**

这是一个为朋友聚会设计的娱乐软件。有时候大家聚在一起，不知道玩什么，气氛比较尴尬，所以我想做一个能随时打开、帮助大家活跃气氛的小工具。

**English**

I started this project to make hanging out with friends more fun. You know those moments when everyone gets together but nobody knows what to do? The idea is to have some easy party activities right on your phone, so it’s easier to break the ice and get everyone involved.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍聚会用途**
   - 中文：向朋友解释它旨在减少聚会冷场。
   - English: I wanted a simple way to make gatherings less awkward.
2. **展示现有内容**
   - 中文：打开已实现的活动或游戏内容。
   - English: Here’s the kind of activity I had in mind.
3. **邀请朋友参与**
   - 中文：选取实际存在的玩法，邀请朋友尝试。
   - English: We can try one together.
4. **聊体验**
   - 中文：解释为什么你觉得这种互动适合新认识的人。
   - English: It gives people something fun to talk about.


### P039｜酒吧游戏 · Bar Games

**中文**

这是一个为酒吧和朋友聚会准备的小游戏软件。特别是大家刚认识的时候，有时候不知道聊什么。可以通过一些简单的互动游戏来破冰，让气氛更轻松。

**English**

I made this for nights out with friends, especially when you’re meeting new people. Sometimes conversations can get a little awkward, so the idea is to use simple party games to break the ice and help everyone relax and have fun together.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **说明破冰场景**
   - 中文：解释朋友第一次见面时为什么需要小游戏。
   - English: It’s designed for breaking the ice when people first meet.
2. **展示游戏**
   - 中文：打开当前真实存在的一项游戏。
   - English: Let me show you one of the games.
3. **一起尝试**
   - 中文：按照实际规则玩一轮。
   - English: Let’s give it a try.
4. **解释结果**
   - 中文：说说游戏如何帮助大家交流。
   - English: It gives everyone an easy way to join the conversation.


### P040｜才艺展示厅 · Talent Showcase

**中文**

这是一个用来展示个人才艺和作品的软件。比如你会跳舞、唱歌，或者拍了一些不错的视频，就可以把这些内容集中整理起来，让朋友更方便地了解你的兴趣和作品。

**English**

I built this project as a place where people can showcase their talents and creative work. For example, if you’re into dancing, singing, or making videos, you can organize your work in one place instead of having it scattered across different apps. It’s a simple way to show people what you love doing.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **展示作品合集**
   - 中文：打开当前可用的作品展示页。
   - English: This is where I bring my creative work together.
2. **介绍一个视频**
   - 中文：选一段自己拍摄的作品播放。
   - English: Let me show you a video I made.
3. **讲作品背景**
   - 中文：解释当时为什么拍、怎样创作。
   - English: Here’s the story behind it.
4. **分享作品**
   - 中文：用已实现的分享方式打开给朋友看；如未实现，则现场播放。
   - English: It’s much easier than searching through old chat messages.


### P043｜成片集 · Photo Delivery App

**中文**

这是我专门给摄影师做的拍照和交付软件。比如在公园给游客拍照，拍完以后可以直接整理照片，让客户在手机上挑选喜欢的照片，然后按照套餐购买，最后交付原图。这样就不用手工一张张发照片，也方便管理拍摄订单。

**English**

I built this app for photographers, especially people doing portrait shoots or event photography. After a shoot, the photographer can organize the photos and let clients choose their favorites on their own phones. Clients can pick a photo package, and the photographer can deliver the original images afterward. It makes the whole process, from taking photos to delivering them, much easier.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜拍摄管理：打开拍摄页拍照，检查并删除废片。**  
   **English｜** I take photos in the app and remove the bad shots.
2. **中文｜邀请选片：创建分享链接或二维码，让客户在手机上看照片。**  
   **English｜** Then I share a link or QR code so the client can view their pictures.
3. **中文｜选择套餐：让客户挑喜欢的照片和购买数量。**  
   **English｜** The client selects their favorites and chooses a photo package.
4. **中文｜交付原图：人工核实付款后，完成原始照片交付。**  
   **English｜** After payment is confirmed, I deliver the original photos.

### P045｜盆底肌训练 · Pelvic Floor Trainer

**中文**

这是我做的一款男性盆底肌训练软件。很多人做凯格尔训练时，不知道收紧多久、放松多久，还得自己默数。我把它做成语音引导的形式，戴着耳机跟着练就可以了，还有不同训练等级和进度记录。

**English**

I developed a pelvic floor training app for men. A lot of people find Kegel exercises difficult to follow because they have to count and time everything themselves. My app guides you through the exercises with voice instructions, so you don’t have to keep looking at the screen. It also has different training levels and progress tracking.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜能力摸底：在能力页选择测试，跟随语音完成。**  
   **English｜** I can start with a short assessment, following the voice instructions.
2. **中文｜开始训练：选当前等级，点今日训练。**  
   **English｜** Then I choose my level and start today’s session.
3. **中文｜跟练节奏：听收紧、保持、放松提示，必要时暂停。**  
   **English｜** The app tells me when to contract, hold, and relax, and I can pause anytime.
4. **中文｜查看进步：打开历史页了解训练次数、时间与等级变化。**  
   **English｜** Here I can see my training history and how I’ve progressed.

### P046｜麻将小白助手 · Mahjong Beginner’s Guide

**中文**

这是我做的一个海南麻将入门软件。因为麻将对新手来说有很多规则和术语，第一次玩的时候经常听不懂。我把常见规则和牌型做成了带图片的简单说明，让完全不会打麻将的人也能快速上手。

**English**

I built this app to help complete beginners learn Mahjong, especially the version played in Hainan. Mahjong can be pretty confusing when you’re new to it, with all the rules and different tile combinations. My app explains the basics using real tile pictures and simple examples, so you can learn how to play without getting overwhelmed.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜查胡牌规则：点开能胡牌的条件，看真实牌例。**  
   **English｜** I start with the rules for winning a hand, using real tile examples.
2. **中文｜看失败案例：对照不能胡的例子找原因。**  
   **English｜** Then I can look at hands that don’t qualify and see why.
3. **中文｜学基本术语：打开术语表看吃、碰、杠等。**  
   **English｜** There’s also a glossary explaining the basic Mahjong terms.
4. **中文｜用座次工具：输入四人名字、选择庄家，查看风向。**  
   **English｜** And this little tool helps us keep track of seating and wind positions.

### P047｜慢食刻 · BiteTempo

**中文**

这是一个提醒自己放慢吃饭速度的软件。因为很多人吃饭特别快，我就做了一个安静的用餐计时器。吃饭时可以跟着倒计时慢慢吃，吃完还可以用语音记录自己的感受，回头看看自己的用餐习惯有没有变化。

**English**

I made this app to help people slow down when they eat. A lot of us eat too quickly without even noticing, so I created a simple, quiet meal timer. You can take your time, enjoy your food, and record how you felt afterward. The app also helps you track your eating habits over time.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜启动用餐：选择 10、12、15 或 20 分钟计时。**  
   **English｜** I pick a meal duration, such as fifteen minutes, and start the timer.
2. **中文｜慢慢吃饭：跟着安静倒计时和文字提示吃饭。**  
   **English｜** I eat at a slower pace while the app quietly keeps time.
3. **中文｜留下心得：餐后说一句感受，按需让 AI 整理并确认。**  
   **English｜** After eating, I can record a quick voice note and tidy it up with AI.
4. **中文｜查看统计：打开统计页，看用餐次数和近七天记录。**  
   **English｜** And this screen shows my meals and habits over the past week.

### P049｜海口去哪玩 · Haikou What’s On

**中文**

这是我专门为海口做的一个本地活动推荐软件。平时想出去玩或者认识新朋友，却不知道哪里有活动。它会整理当地的市集、演出、英语角、运动聚会等信息，让我能快速知道今天或者周末有什么值得参加的活动。

**English**

I built this app for Haikou, the city where I live in China. It’s basically a local event guide that helps you discover things to do, like live music, markets, language exchanges, sports meetups, and social events. Instead of checking a bunch of different apps, you can see what’s happening today or this weekend in one place. It’s especially useful for meeting new people and exploring the city.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜看今日推荐：打开首页查看今天最值得去的几项活动。**  
   **English｜** Here are a few events worth checking out today.
2. **中文｜找周末活动：进入周末分类，筛选感兴趣的项目。**  
   **English｜** I can switch to weekend events and find something I like.
3. **中文｜了解详情：点开活动，核对时间、地点和来源。**  
   **English｜** I open an event to check the time, location, and source.
4. **中文｜按提示参加：查看是否需要提前预约、报名或联系主办方。**  
   **English｜** And it tells me whether I need to book, register, or contact the organizer.

### P051｜妹妹的听书小屋 · My Sister’s Audiobook Library

**中文**

这是我给妹妹做的一个私人听书软件。因为家里以前买过很多有声课程，但都放在电脑硬盘里，想听很麻烦。我把它们整理成一个手机上的课程书库，可以按学科和难度找内容，还支持倍速播放、睡眠定时和离线下载。

**English**

I built this app for my younger sister. We already had a large collection of educational audio courses stored on a computer, but they weren’t very convenient to listen to. So I turned them into a private audiobook library she can access on her phone. She can browse by subject and difficulty level, adjust the playback speed, set a sleep timer, and download lessons to listen offline.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜挑课程：按学科和难度筛选课程。**  
   **English｜** I choose a subject and difficulty level to find a course.
2. **中文｜逐集播放：打开课程，选择一集，调整倍速。**  
   **English｜** Then I pick an episode and adjust the playback speed.
3. **中文｜睡前听：开启睡眠定时或单集循环。**  
   **English｜** I can set a sleep timer or repeat the same episode.
4. **中文｜离线下载：提前下载课程，没网时继续收听。**  
   **English｜** I can also download lessons and listen without internet access.

### P052｜真心话大冒险 · Truth or Dare

**中文**

这是我做的一个朋友聚会游戏。里面有真心话、大冒险、谁最可能、从来没有这四种玩法，一共 1500 多道题。可以根据大家的熟悉程度选择不同等级，朋友聚会时拿出手机就能玩。

**English**

I made a party game app with over 1,500 questions and challenges. It includes Truth or Dare, Never Have I Ever, and Most Likely To. You can choose different levels depending on how comfortable everyone is with each other. It’s great for house parties, game nights, or just getting to know new friends.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜选择玩法：在真心话、大冒险等四个分类间切换。**  
   **English｜** First, we choose a game, like Truth or Dare or Never Have I Ever.
2. **中文｜选择尺度：选 L1 到 L5 的等级。**  
   **English｜** Then we pick a level, depending on how adventurous everyone feels.
3. **中文｜抽取题目：打开题卡，轮流回答或完成挑战。**  
   **English｜** We draw a question and take turns answering or doing the challenge.
4. **中文｜离线使用：提前打开缓存后，即使没有网络也能继续玩。**  
   **English｜** And once it’s cached, we can even play without internet access.

### P053｜眨眼守护 · BlinkGuard

**中文**

这个软件是为了保护长期看电脑的人的眼睛。我发现自己盯着电脑时经常忘记眨眼，所以想利用一台闲置安卓手机，通过前置摄像头检测眨眼情况。如果太久没有眨眼，它就会提醒你。还能记录用眼时间和眨眼情况。

**English**

I built this app because I spend a lot of time in front of a computer and sometimes forget to blink enough. You just place an old Android phone next to your monitor, and it uses the front camera to detect your blinking. If you haven’t blinked for a while, it reminds you. It also tracks your screen time and blinking patterns, and everything runs locally on the phone.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜摆放设备：把安卓手机放到显示器旁，让前摄拍到脸。**  
   **English｜** I place an old Android phone beside my monitor, facing me.
2. **中文｜开始监测：点开始，让它在本机检测完整眨眼。**  
   **English｜** Then I tap Start, and it starts tracking my blinks locally.
3. **中文｜体验提醒：长时间没眨眼时，听语音或提示音。**  
   **English｜** If I forget to blink for too long, it gives me a reminder.
4. **中文｜看统计技巧：打开统计和技巧页，查看用眼情况与护眼提示。**  
   **English｜** I can also check the statistics and some eye-care tips.

### P055｜姿势守护 · PostureGuard

**中文**

这是一个帮助改善坐姿和久坐习惯的软件。因为长时间坐电脑前，很容易不知不觉驼背或者头往前伸。我把手机放在身体侧面，让它通过摄像头观察坐姿。如果姿势不对或者坐太久，就会语音提醒，还能统计每天坐了多久。

**English**

I built this app to help people improve their posture while working at a desk. You place an Android phone beside you, and its camera checks whether you’re leaning forward, slouching, or looking down too much. If your posture gets worse or you’ve been sitting for too long, it gives you a gentle reminder. It also tracks your sitting habits over time.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜摆放与校准：把手机放身体侧面，按照自己的自然坐姿校准。**  
   **English｜** I put the phone beside me and calibrate it to my normal sitting posture.
2. **中文｜开始监测：在监测页观察头部和上身姿态。**  
   **English｜** Then I start monitoring and see how my posture changes.
3. **中文｜听语音提醒：姿势偏离或久坐过久时收到提醒。**  
   **English｜** If I lean forward too much or sit too long, it reminds me.
4. **中文｜看久坐统计：打开统计页，查看坐姿时长和起身次数。**  
   **English｜** And I can check how long I’ve been sitting and how often I got up.

### P056｜筋形 LAB · Muscle Shape Lab

**中文**

这是我做的一个 AI 健身参考软件。比如你已经健身一段时间，但不知道身体哪个肌肉部位相对薄弱。你可以拍几张不同角度的身体照片，它会帮你分析肌肉外观，推荐一些针对性的训练动作。过段时间再拍，还可以对比变化。

**English**

I’m building this AI fitness app to help people see which muscle groups might need more attention. You take a few photos from different angles, and the app analyzes your overall muscle appearance and suggests exercises for areas you might want to improve. You can also compare photos over time to see how your physique is changing.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜拍摄三张照片：在扫描页照提示拍正面、背面和侧面。**  
   **English｜** I start by taking front, back, and side photos using the guides.
2. **中文｜查看分析：打开肌肉区域的外观观察报告。**  
   **English｜** Then I open the report to see which areas may need attention.
3. **中文｜参考动作：选择肌肉区域和现有器械，查看候选动作。**  
   **English｜** I can choose a muscle group and see exercise suggestions for the equipment I have.
4. **中文｜对比变化：过段时间重新拍照，在进步页对比照片。**  
   **English｜** Later, I can take new photos and compare the results side by side.

### P057｜舞蹈大师 · Dance Master

**中文**

这个软件是给喜欢学舞蹈的人做的，特别适合学抖音热门舞蹈或者 K-pop。因为跟着视频学舞特别麻烦，要反复暂停、倒退。我把视频按音乐的八拍切成一段一段，可以慢放、镜像、单段循环。先练熟每一段，再把整支舞连起来。

**English**

I built this app because I enjoy learning dance routines, especially K-pop and trending TikTok-style dances. Learning from regular videos can be frustrating because you’re constantly pausing and rewinding. My app lets you break a dance down into eight-count sections, slow it down, mirror the video, and loop specific parts. You can practice each section until you get it right, then put the whole routine together.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜收藏舞蹈：在我的舞蹈里添加喜欢的舞蹈链接或本地视频。**  
   **English｜** First, I save a dance link or import a video I’m allowed to use.
2. **中文｜分八拍练习：进入练舞页，设置节拍，选择想练的一小段。**  
   **English｜** Then I open the practice player and break the dance into eight-count sections.
3. **中文｜慢速镜像循环：把动作放慢、镜像，反复练同一个片段。**  
   **English｜** I can slow it down, mirror it, and loop one section until I get it right.
4. **中文｜整曲合练：切换整曲模式，练习完整编舞。**  
   **English｜** Once I’m ready, I switch to the full routine and dance all the way through.

### P059｜双屏协同提词器 · Dual-Screen Teleprompter

**中文**

这是我为拍短视频和采访做的提词器。比如拍摄时，一个人当导演，一个人面对镜头说台词。导演可以用一台手机控制台词和翻页，演员用另一台手机看稿，中间的 iPhone 专门负责拍摄。两边通过二维码连接，还能快速修改稿件，特别适合小团队拍视频。

**English**

I built this teleprompter app for filming videos and interviews with a small team. One person can control the script on their phone, while the person on camera reads it from another screen. A third phone is used just for filming. The two screens stay in sync, and you can even make quick script changes during a shoot. It makes filming much smoother.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜准备文稿：在编导端粘贴或编辑台词，保存并分页。**  
   **English｜** First, I paste the script into the director’s screen and split it into pages.
2. **中文｜扫码连接：另一台手机扫描二维码成为提词屏。**  
   **English｜** The performer scans a QR code to open the same script on another phone.
3. **中文｜协同翻页：编导控制翻页，演员看提词屏，中间手机拍摄。**  
   **English｜** I control the pages while the performer reads from the other screen, and a third phone records.
4. **中文｜临场改稿：需要时即时编辑文字，并检查两屏显示。**  
   **English｜** If we change a line during filming, I can edit it and check the updated script.

### P063｜静蹲计时器 · Wall Sit Timer

**中文**

这是一个专门用来做靠墙静蹲训练的计时器。因为这个动作主要是坚持一定时间，所以我想让训练时的计时更加简单，不用每次都打开手机自带的秒表。

**English**

I made this little timer specifically for wall sit exercises. It’s a simple leg-strengthening exercise where you hold a sitting position against a wall. The idea is to make timing your workouts easier without having to use a regular stopwatch every time.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **示范静蹲姿势**
   - 中文：面对墙演示靠墙坐姿。
   - English: A wall sit is where you hold this position against a wall.
2. **开始计时**
   - 中文：用实际可用的倒计时功能开始训练。
   - English: I start the timer when I get into position.
3. **坚持训练**
   - 中文：向朋友展示计时过程。
   - English: Then I try to hold the position until the timer finishes.
4. **结束训练**
   - 中文：真实软件支持时结束和查看记录。
   - English: When I’m done, I stop the timer.


### P064｜肌肉守护者 · Muscle Guardian

**中文**

这是我给家里长辈做的腿部训练软件。因为随着年龄增长，保持腿部力量很重要。我希望让他们不用研究复杂的健身软件，打开手机就能跟着语音提示做简单的深蹲训练，还可以记录每次的训练时间和成绩。

**English**

I built this app for older family members because maintaining leg strength becomes really important as we age. It’s designed to be super simple. You choose a training duration, follow the voice instructions, and do some basic squat exercises. It also records your progress, so you can see how you’re improving over time.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜开始训练：在训练页选择时长，一点就开始。**  
   **English｜** I just choose a duration and tap to start.
2. **中文｜跟随语音：听计时和完成提示，必要时暂停。**  
   **English｜** It guides me with voice prompts, and I can pause whenever needed.
3. **中文｜做能力测试：进入测试页记录一次训练成绩。**  
   **English｜** There’s also a simple test to record how I’m doing.
4. **中文｜查看统计：在统计页查看今天、近七天和近三十天的数据。**  
   **English｜** Here I can see my training history for today, the past week, or the past month.

## B｜手机浏览器可访问或需特定环境

### P041｜NightRec · Night Recording

**中文**

这是一个围绕夜间录制场景设计的软件项目。我想让晚上需要录制内容的时候，操作更方便一些，不必每次都使用功能复杂的普通拍摄软件。

**English**

This is a recording app project focused on nighttime use. The idea is to make recording in low-light or nighttime situations simpler and more convenient, without having to deal with a lot of unnecessary camera controls.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **讲夜间录制需求**
   - 中文：解释夜晚拍摄的困难。
   - English: Recording at night can be inconvenient.
2. **展示运行画面**
   - 中文：仅在有可运行版本时打开实际录制页面。
   - English: Here’s the recording interface I’m working on.
3. **尝试短录制**
   - 中文：如已实现录制，拍摄一个短样本。
   - English: I can make a quick test recording.
4. **查看结果**
   - 中文：如有成片，播放刚才的短样本。
   - English: And here’s how the recording turned out.


### P044｜AI 分镜工作室 · AI Storyboard Studio

**中文**

这个软件主要是帮助拍短视频的人设计分镜。比如你有一个视频创意，但不知道应该怎么安排镜头、拍摄顺序和画面。我希望利用 AI 帮忙把这些想法整理成更清楚的拍摄方案。

**English**

I’m working on an AI storyboard tool for video creators. Sometimes you have a great video idea, but it’s hard to figure out the shots and how everything should flow. The goal is to use AI to help turn those ideas into a clearer shooting plan, so filming becomes easier and more organized.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **提出创意**
   - 中文：先说一个想拍的短视频故事。
   - English: Suppose I have an idea for a short video.
2. **说明镜头拆分**
   - 中文：用纸上或现有页面示范镜头结构。
   - English: I break the idea into a series of shots.
3. **展示分镜**
   - 中文：若有可运行生成器则展示，否则明确是设计目标。
   - English: The goal is to make the shooting plan easier to visualize.
4. **联系实拍**
   - 中文：展示一张真实参考照片或拍摄片段。
   - English: This helps me plan what I need to film.


### P060｜VoiceCut · AI Video Rough-Cut Editor

**中文**

这是我做的一个自动视频粗剪软件。比如拍摄时有些镜头拍好了，有些说错了要重拍。传统剪辑要把所有视频看一遍，很费时间。现在只要拍摄时在片段结尾说“这段保留”或者“这段不要”，软件就能识别这些口令，把废弃片段剪掉，再把保留的片段拼接成视频，还会把用到的原始片段单独整理出来。

**English**

I built this video editing tool to save time after filming. Normally, when you shoot a video, you end up with lots of clips, including mistakes and retakes. Instead of going through everything manually, you can simply say “keep this take” or “delete this take” while filming. The software recognizes those voice commands, removes the unwanted parts, and automatically puts the good clips together into a rough cut. It also organizes the original clips you used, which makes further editing easier.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜选择素材：粘贴脚本，导入视频文件夹或上传原片。**  
   **English｜** I paste in the script and select the raw video files.
2. **中文｜识别口令：录制时口播保留或废弃的指令，交给软件识别。**  
   **English｜** During filming, we say which takes to keep or discard, and the software detects those commands.
3. **中文｜生成粗剪：开始处理，让它剔除废片并拼接保留镜头。**  
   **English｜** Then I start processing, and it puts the selected takes into a rough cut.
4. **中文｜下载结果：查看成片 MP4、已用片段 ZIP 和时间明细 CSV。**  
   **English｜** At the end, I get the video, a ZIP of used clips, and a detailed cut list.

## C｜电脑网站、桌面软件及其他工具（放最后）

### P001｜家庭保险看板 · Family Insurance Dashboard

**中文**

这是一个整理家庭保险信息的项目。因为一个家庭可能有很多不同的保单，时间久了很难记得每个人买了什么保险、什么时候到期。我希望把这些信息集中在一起，让家庭保障情况一目了然。

**English**

I started this project to make it easier to manage family insurance. When several family members have different policies, it gets difficult to remember what’s covered and when everything expires. The idea is to put all that information in one place, so it’s easier to understand the family’s overall insurance coverage.

**功能演示｜项目专属讲解（以仓库资料为依据，未经过现场点击验收）**

1. **展示家庭保障概念**
   - 中文：先说明家庭成员各自可能持有不同保险。
   - English: Different family members can have different insurance policies.
2. **举一个保单例子**
   - 中文：拿一份脱敏示例保单说明保障范围。
   - English: Here’s an example of the coverage I want to keep track of.
3. **解释到期管理**
   - 中文：讲述为什么需要记住续保日期。
   - English: I want to see when each policy needs renewing.
4. **说明项目目标**
   - 中文：这款目前没有核实可运行管理界面，不现场声称已经自动提醒。
   - English: The goal is to see our family’s coverage in one place.


### P003｜后翻学长个人网站 · My Personal Website

**中文**

这是我给自己做的个人网站，相当于我的线上名片。上面展示了我开发的软件、一些兴趣爱好和个人经历。朋友如果想了解我平时在做什么，可以直接打开网站，有些软件还可以直接在线体验或者下载安装。

**English**

I built my own personal website to showcase the things I’ve been working on. It includes my software projects, personal interests, and some of my experiences. It’s basically my online portfolio, but more personal than a typical résumé. If you’re curious about what I create, you can check it out and even try some of the apps yourself.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜浏览作品：在首页进入作品区。**  
   **English｜** Here’s the section where I showcase my apps.
2. **中文｜按类型筛选：切换网页、手机、桌面等类别。**  
   **English｜** I can filter the projects by type.
3. **中文｜打开详情：选择一个项目查看背景和成果。**  
   **English｜** I open a project to show what it does and why I made it.
4. **中文｜试用产品：从页面进入在线体验或下载链接。**  
   **English｜** And for some projects, I can open a live demo or download the app.

### P006｜提示词管理器 · Prompt Manager

**中文**

这是一个专门管理 AI 提示词的软件。因为平时用 AI 时，经常会写一些特别好用的指令，但时间久了就找不到。我做这个工具把它们整理成卡片，可以搜索、分类、保存版本，还可以直接让 AI 调用这些提示词。

**English**

I built this tool to organize the prompts I use with AI. When you work with ChatGPT or other AI tools a lot, you end up collecting useful prompts, but they’re easy to lose. My app keeps them organized, searchable, and reusable. You can also connect it to compatible AI tools, so you don’t have to copy and paste the same instructions over and over again.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜建立卡片：新建提示词，粘贴正文。**  
   **English｜** I create a new card and paste in a useful AI prompt.
2. **中文｜搜索筛选：输入关键词或选择标签。**  
   **English｜** I can search for it later or filter prompts by tags.
3. **中文｜快速复制：打开卡片复制提示词。**  
   **English｜** I just open a card and copy the prompt when I need it.
4. **中文｜版本回退：查看旧版本，必要时恢复。**  
   **English｜** And if I accidentally change something, I can restore an earlier version.

### P008｜告别打字 · Less Typing

**中文**

这是一个围绕减少手动打字设计的软件项目。因为日常工作和聊天经常要输入很多文字，我希望通过语音和更方便的输入方式，让这些操作变得轻松一点。

**English**

I started this project because I wanted to spend less time typing. The idea is to make everyday text input easier, especially through voice-based tools, so writing messages and handling routine tasks feels less repetitive.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍问题**
   - 中文：讲述输入长段文字有多费时。
   - English: Typing long messages can get tiring.
2. **描述设想**
   - 中文：说明希望通过语音减少键盘输入。
   - English: The idea is to speak instead of typing everything.
3. **展示已有成果**
   - 中文：仅展示已完成的可运行功能或界面。
   - English: Here’s what I’ve built so far.
4. **区别P016**
   - 中文：解释与“懒得打字”的功能联系，尚未核实不当作两款成熟成品。
   - English: I’ve also worked on a related Android app for multilingual messages.


### P009｜滴答清单时间管理 · Time Management System

**中文**

这是一个帮助自己安排任务和管理时间的项目。因为每天事情比较多，我希望把任务、计划和时间安排结合起来，让工作和生活更有条理。

**English**

I started this project to organize my daily tasks and manage my time more effectively. When you have lots of things going on, it’s easy to lose track of priorities. The idea is to bring tasks and schedules together so I can stay more organized and focused.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **看任务列表**
   - 中文：只在实际连接滴答清单时展示现有任务。
   - English: I keep track of the things I need to do.
2. **安排优先级**
   - 中文：用一个日常任务说明排序思路。
   - English: I decide what needs my attention first.
3. **安排时间**
   - 中文：如存在日程页面则展示，没有则用当前计划说明。
   - English: Then I plan when to work on each task.
4. **回顾完成**
   - 中文：展示已完成项目或已有记录。
   - English: It helps me see what I’ve actually finished.


### P010｜DeepSeek 余额监控 · AI Usage Monitor

**中文**

这是我做的一个 AI 使用额度监控工具。因为我经常使用不同的 AI 服务，需要知道还剩多少余额、用了多少额度，不想每次都登录网站后台查看。所以做了一个可以直接在电脑上快速查看的小工具。

**English**

I built this little desktop tool because I use AI services quite a lot and wanted an easier way to monitor my usage and remaining balance. Instead of logging into different dashboards every time, I can quickly check the information from my computer. It’s available for both Mac and Windows.

**功能演示｜项目专属讲解（以仓库资料为依据，未经过现场点击验收）**

1. **打开桌面工具**
   - 中文：在 Mac 或 Windows 打开 DeepSeekBalanceWidget。
   - English: This is a small desktop app for checking my AI usage.
2. **查看余额**
   - 中文：在实际显示的余额位置指出剩余额度。
   - English: Here I can see how much credit I have left.
3. **解释费用**
   - 中文：说明频繁调用 AI 接口为什么需要监控。
   - English: I use AI APIs a lot, so I like knowing how much I’m spending.
4. **展示设置**
   - 中文：如需展示，打开设置但不要暴露 API Key。
   - English: I can configure it for my own account without showing my API key.


### P012｜投资组合再平衡 · Portfolio Rebalancing Dashboard

**中文**

这是我给自己做的长期投资管理工具。比如原本计划股票占多少、债券占多少、黄金占多少，但市场涨跌以后，这些比例会发生变化。软件可以帮你算出现在偏离目标多少，以及需要买卖多少才能恢复到计划中的资产配置。

**English**

I built this dashboard to help manage my long-term investments. For example, I might want a certain percentage of my money in stocks, bonds, and gold, but those percentages change as markets go up and down. My app shows how far my portfolio has drifted from my target and calculates how much I would need to buy or sell to rebalance it.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜录入资产：输入持仓金额和理想目标比例。**  
   **English｜** I enter what I currently own and my target allocation.
2. **中文｜比较偏离：查看各类资产偏离目标多少。**  
   **English｜** It shows which parts of my portfolio are out of balance.
3. **中文｜切换方案：对比完整再平衡、超阈值调整与不调整。**  
   **English｜** I can compare different rebalancing strategies.
4. **中文｜看操作清单：阅读买卖金额与成本的测算。**  
   **English｜** And it calculates possible trades and estimated costs.

### P013｜滚仓计算器 · Trading Position Calculator

**中文**

这是一个用来模拟不同杠杆交易策略的计算器。你可以输入本金、价格和杠杆倍数，看看不同阶段理论上会产生什么样的资金变化，还能保存计算记录和实际交易记录。

**English**

I built this calculator to explore different leveraged trading scenarios. You enter your starting capital, price, and leverage, and it shows how your position and account value could change across different stages. You can also save calculations and track actual trades. It’s mainly a tool for analyzing strategies, not predicting profits.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜填参数：输入本金、价格和杠杆。**  
   **English｜** I enter the capital, price, and leverage.
2. **中文｜观察推演：查看各阶段的理论变化。**  
   **English｜** The calculator shows how the numbers change across stages.
3. **中文｜保存快照：把方案存到历史记录。**  
   **English｜** I can save a calculation and come back to it later.
4. **中文｜记录实盘：在盈亏台账里加入交易和截图。**  
   **English｜** I can also record real trades and attach screenshots.

### P014｜加密货币突破雷达 · Crypto Breakout Radar

**中文**

这是我做的一个加密货币行情研究工具。因为有些币突然上涨之前，会出现一些价格和成交量变化，但假突破也很多。我想把这些数据结合起来，帮助观察市场目前处于蓄势、突破还是突破失败的阶段，并跟历史行情做对比。

**English**

I built this tool to study cryptocurrency price movements, especially breakout patterns. It looks at things like price, trading volume, and market conditions to help identify whether a coin is building momentum, breaking out, or showing signs of a failed breakout. You can also compare current patterns with historical examples. It’s a research tool rather than something that predicts prices with certainty.

**功能演示｜项目专属讲解（以仓库资料为依据，未经过现场点击验收）**

1. **展示行情总览**
   - 中文：打开实时雷达，选择 PEPE 或 DOGE。
   - English: This is the market overview for a coin I’m tracking.
2. **解释状态**
   - 中文：指出蓄势、突破或失败等标签。
   - English: It shows whether the market is building momentum or a breakout is failing.
3. **查看证据**
   - 中文：打开指标信息，解释成交量和价格依据。
   - English: I can look at the numbers behind each signal.
4. **比较历史**
   - 中文：打开历史事件对照过往走势。
   - English: I can compare current conditions with past breakouts.


### P015 / P029｜私人照片图库 · Personal Photo Library

**中文**

这是我做的私人照片管理项目。因为这些年拍了很多照片和视频，分散在不同硬盘里，想找一张旧照片非常费时间。我把它们集中到自己的电脑里，利用照片搜索、人脸识别和重复检测等功能，让以前的照片更容易找出来，而且尽量不修改原始文件。

**English**

I set up this personal photo library because I’ve collected thousands of photos and videos over the years, and they were scattered across different hard drives. The system organizes them in one place and helps me search for pictures, recognize faces, and find duplicates. The best part is that everything stays on my own computer, and the original files are kept safe.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜浏览图库：在私人相簿里按时间翻看照片。**  
   **English｜** Here I can browse photos by date.
2. **中文｜搜索图片：用关键词寻找旧照片。**  
   **English｜** I can search for photos instead of digging through folders.
3. **中文｜找人脸和重复：查看相似面孔和重复照片。**  
   **English｜** It can also help group faces and identify duplicates.
4. **中文｜保护原片：只读查看，不直接改动来源硬盘。**  
   **English｜** Most importantly, it leaves the original photos untouched.

### P017｜个人 RSS 阅读器 · Personal RSS Reader

**中文**

这个软件是为了把我感兴趣的网络资讯集中到一起。因为每天要关注很多网站和文章，逐个打开很费时间。我希望通过它集中订阅和阅读，减少到处找信息的麻烦。

**English**

I started building my own RSS reader because I follow a lot of websites and online content. Instead of visiting each site separately, I wanted one place where I could keep up with everything I’m interested in. The idea is to make reading and finding useful information much more efficient.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **解释订阅**
   - 中文：以两个经常阅读的网站举例。
   - English: I follow several websites and want the updates in one place.
2. **展示来源**
   - 中文：展示真实订阅列表（若存在）。
   - English: Here are the sources I follow.
3. **打开文章**
   - 中文：从实际可打开的列表进入文章。
   - English: I open an article that looks interesting.
4. **说明节省时间**
   - 中文：对比逐个访问网页的方式。
   - English: This saves me from checking every website separately.


### P018｜视频转知识笔记 · Video to Notes

**中文**

这个软件是想把视频里的知识变成可以长期保存的笔记。比如看了一段很长的教学视频，里面有很多有用内容，但下次想找又要重新看。我希望它能把视频内容整理成文字，保存到自己的知识库里，方便搜索和复习。

**English**

I started this project because I learn a lot from videos, but it’s hard to remember or find specific information later. The idea is to turn useful video content into organized notes and save them in my personal knowledge base. That way, I can search for what I’ve learned instead of watching the same video again.

**功能演示｜项目专属讲解（以仓库资料为依据，未经过现场点击验收）**

1. **选一个学习视频**
   - 中文：说明为什么自己想保存视频知识。
   - English: I often learn useful things from videos.
2. **展示视频笔记**
   - 中文：如存在已生成的 Obsidian 笔记则打开。
   - English: Here are some notes I saved from a video.
3. **快速搜索**
   - 中文：在 Obsidian 中检索一个视频知识点。
   - English: I can search my notes instead of rewatching the whole video.
4. **说明核实边界**
   - 中文：视频到笔记的自动转换能力需按当前版本确认。
   - English: The idea is to make what I learn from videos easier to find later.


### P022｜红利低波计算器 · Dividend Index Calculator

**中文**

这是一个围绕红利低波指数投资设计的计算工具。我希望把相关的投资数据和计算集中在一个地方，减少每次查指标、手工计算的麻烦，帮助自己更方便地分析这类投资。

**English**

I started this calculator for analyzing dividend-focused, low-volatility stock indexes. The goal is to bring useful investment calculations and information into one place, so I don’t have to keep looking up data and calculating everything manually.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **说明红利低波**
   - 中文：用普通话解释关注稳定派息与波动的指数。
   - English: I use this for researching dividend-focused, lower-volatility indexes.
2. **展示输入数据**
   - 中文：展示真实存在的参数或表格。
   - English: These are the numbers I want to compare.
3. **解释结果**
   - 中文：指着已有计算结果说出它的含义。
   - English: Here’s what the calculation tells me.
4. **说清边界**
   - 中文：强调这只是分析工具，不代替投资判断。
   - English: It helps me think through the numbers, not predict the market.


### P023｜A 股指数估值看板 · Chinese Stock Market Valuation Dashboard

**中文**

这是一个用来观察中国股票市场估值的网页工具。比如想知道沪深300或者红利低波指数现在算贵还是便宜，就可以看它们跟过去十年的估值相比处在什么位置，帮助自己做长期投资研究。

**English**

I built this dashboard to help me understand whether major Chinese stock indexes look expensive or relatively cheap compared with their historical valuations. It compares different indexes using data from roughly the past ten years, so I can get a clearer picture of where the market stands instead of making investment decisions based purely on emotion.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜选择指数：打开指数估值汇总表。**  
   **English｜** I open the overview of major Chinese stock indexes.
2. **中文｜查看分位：比较当前估值与过去十年的位置。**  
   **English｜** I compare today’s valuations with their historical ranges.
3. **中文｜对比指标：查看估值、股息率等不同维度。**  
   **English｜** I can compare valuation metrics and dividend yields.
4. **中文｜理解结果：把颜色作为研究参考，而不是买卖指令。**  
   **English｜** The colors make comparison easier, but they’re not trading signals.

### P030｜Skill 日报 · AI Skills Daily

**中文**

这是我做的一套 AI 工具发现系统。现在每天都有很多新的 AI Skill 出现，但根本没时间一个个研究。它会自动收集、筛选和对比这些工具，告诉我哪些值得尝试、哪些可能有风险、哪些跟自己已经安装的工具重复。

**English**

I built this system to keep track of new AI tools and skills. There are so many coming out every day that it’s impossible to check them all manually. My system scans different sources, compares new tools with what I already use, and gives me a daily summary of what’s worth trying, what’s outdated, and what might be risky.

**功能演示｜项目专属讲解（以仓库资料为依据，未经过现场点击验收）**

1. **打开日报**
   - 中文：找到已经生成的 Skill 日报 Markdown。
   - English: Here’s a daily report about new AI skills.
2. **查看候选工具**
   - 中文：选一条推荐解释用途。
   - English: It highlights tools that might be worth trying.
3. **看风险或重复**
   - 中文：指出与已装 Skill 重叠、安全风险的分析。
   - English: It also checks for overlap and potential risks.
4. **说明不会自动安装**
   - 中文：强调安装升级由自己确认。
   - English: It never installs anything without me deciding to do it.


### P036｜人民币美元汇率看板 · Currency Exchange Rate Dashboard

**中文**

这是一个专门查看人民币和美元汇率的小工具。我希望平时需要换汇或者关注汇率变化的时候，可以直接打开一个简单的页面，不用反复找财经网站。

**English**

I made this little dashboard to keep an eye on the exchange rate between the Chinese yuan and the US dollar. It’s useful when I’m dealing with foreign currencies or paying for overseas services. I wanted a simple way to check exchange rates without having to browse through financial websites.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **查看汇率**
   - 中文：用实际数据页面查看美元兑人民币。
   - English: This shows the exchange rate between US dollars and Chinese yuan.
2. **举例使用**
   - 中文：以支付海外订阅为例。
   - English: I often need this when paying for services overseas.
3. **对比金额**
   - 中文：如有换算功能则现场换算，否则口述实例。
   - English: I can quickly see roughly how much something costs in yuan.
4. **提醒变化**
   - 中文：若真实页面提供走势可展示，否则只讲关注汇率的理由。
   - English: It’s useful to keep an eye on currency movements.


### P037｜AI 编程训练营 · AI Coding Bootcamp

**中文**

这是一个围绕 AI 编程学习的网站项目。主要是想帮助没有传统编程基础的人了解怎么使用 AI 开发软件，把自己的想法逐步做成真正能使用的产品。

**English**

This is a website project focused on learning to build software with AI. The idea is to help people who don’t have a traditional programming background understand how AI can help them turn ideas into real applications. It’s about making software development more approachable for beginners.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍受众**
   - 中文：说明面向 AI 编程初学者。
   - English: This is aimed at beginners who want to build apps with AI.
2. **展示学习内容**
   - 中文：打开网站里真实存在的一项内容。
   - English: Here’s a topic the site covers.
3. **讲具体例子**
   - 中文：用自己完成过的应用举例。
   - English: For example, this is an app I built with AI.
4. **解释学习价值**
   - 中文：强调从想法到产品的过程。
   - English: I want people to see how an idea can become a working app.


### P038｜健身训练资料库 · Fitness Workout Library

**中文**

这是一个整理健身训练资料的项目。因为我平时会研究不同的训练动作和方法，希望把这些资料放在一个地方，以后去健身房的时候能更方便地查找和参考。

**English**

I started this project to organize fitness and workout resources. I like learning about different exercises and training methods, so I wanted one place to keep useful information that I can easily look up whenever I need it.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **说明资料整理**
   - 中文：说说你收集的动作和训练资料。
   - English: I like keeping my workout resources organized.
2. **找一个动作**
   - 中文：打开确实存在的练习资料。
   - English: Let me find an exercise I’ve saved.
3. **看训练要点**
   - 中文：展示已经写下的动作注意事项。
   - English: These notes remind me what to focus on.
4. **健身房使用**
   - 中文：说明训练时如何临时查询。
   - English: It’s handy when I need a quick reminder at the gym.


### P042｜AIHOT · AI News and Updates

**中文**

这是一个 AI 行业信息收集项目。因为现在 AI 发展太快，新模型、新功能、新编程工具几乎每天都在出现。我希望通过它把这些更新集中整理起来，快速了解哪些变化真正值得关注。

**English**

I built this project to keep up with how quickly AI is changing. New models, coding tools, and AI features seem to come out almost every day. Instead of checking dozens of websites, I wanted one place to collect and organize the important updates, especially the ones that could actually improve how I work.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **解释新闻来源**
   - 中文：告诉朋友每天 AI 更新很多。
   - English: There are so many AI updates coming out every day.
2. **浏览更新**
   - 中文：从真实情报页面打开一条更新。
   - English: Here’s one of the latest updates I’m following.
3. **挑重点**
   - 中文：解释为何它值得关注。
   - English: I try to focus on updates that actually matter.
4. **应用到工作**
   - 中文：举例说明某模型更新如何影响自己的软件开发。
   - English: Then I decide whether it’s useful for the apps I’m building.


### P050｜社交平台活动发布 · Event Publishing Tool

**中文**

这是一个帮助整理和发布活动信息的项目。比如组织线下聚会、英语角或者其他社交活动时，可能需要在微信公众号和小红书分别发布内容。我希望把这件事变得更方便，减少重复编辑。

**English**

I’m working on a tool to make promoting local events easier. For example, when organizing a meetup or language exchange, you often need to post the same information on different social platforms. The idea is to simplify that process so you spend less time editing and publishing the same content repeatedly.

---

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **介绍活动发布**
   - 中文：例如组织一场英语角。
   - English: Say I’m organizing a language exchange meetup.
2. **整理活动信息**
   - 中文：列出标题时间地点报名方式。
   - English: I put together the time, place, and event details.
3. **对比平台**
   - 中文：展示已有公众号与小红书活动文案。
   - English: I usually need to share the same information on different platforms.
4. **介绍开发目标**
   - 中文：说明希望减少重复编辑，但不冒充已经自动发布。
   - English: The idea is to avoid writing everything from scratch each time.


### P054｜后翻科学研究雷达 · Science Research Radar

**中文**

这是我为自己做的科学研究知识库。因为网上有很多关于健康、健身和长寿的说法，但有些根本没有可靠证据。我希望系统能自动寻找新的高质量科学研究，把论文翻译成容易理解的中文，告诉我研究发现了什么、证据有多可靠，以及哪些说法还不能确定。

**English**

I built this personal research tool because I’m really interested in health, fitness, and longevity, but there’s so much conflicting information online. My system keeps track of new scientific studies, especially high-quality human research, and turns them into easy-to-understand summaries. It explains what the researchers found, how strong the evidence is, and what we still don’t know. It helps me make more informed decisions instead of just following random health advice online.

**功能演示｜逐项讲解（按顺序边操作边说）**

1. **中文｜浏览新研究：打开精选或全部，寻找近期研究。**  
   **English｜** I open the research feed to see the latest findings.
2. **中文｜读通俗解读：查看研究结论、证据强弱和局限性。**  
   **English｜** I can read a plain-language summary of the findings, evidence, and limitations.
3. **中文｜按专题查找：进入健身、长寿等专题继续阅读。**  
   **English｜** I can browse topics like fitness or longevity.
4. **中文｜收藏与导出：把有用内容收藏，按需导出 Markdown 或同步笔记。**  
   **English｜** And I can save useful articles or export them to my notes.

### P058｜AI 编程毕业展示 · AI Coding Showcase

**中文**

这是一个集中展示 AI 编程成果的项目。我希望把学习过程中做过的软件、解决过的问题和最终作品整理成一个容易观看的展示空间，让别人了解 AI 编程可以做出哪些实际产品。

**English**

I started this project to showcase what I’ve built while learning to develop software with AI. I wanted a place where people could see the actual applications and projects, rather than just looking at code. It’s a way to share my progress and show what’s possible with AI-assisted development.

**功能演示｜资料有限：场景讲解稿，未经过手机真机逐键验收**

1. **展示作品集**
   - 中文：打开当前可访问的毕业作品展示页。
   - English: This is a showcase of the apps I’ve worked on.
2. **选一个作品**
   - 中文：挑一款最容易上手的手机软件。
   - English: Let me pick one of the projects.
3. **解释过程**
   - 中文：说明从想法到做成软件。
   - English: I started with a simple idea and worked on it with AI.
4. **展示实际成果**
   - 中文：用已经安装或上线的真实软件演示。
   - English: And here’s the actual app running on my phone.


---

## 第三部分｜英文开场白（当面介绍用）

**English**

Actually, I've been building quite a few apps with the help of AI. I'm not a traditional software developer, but I really enjoy turning my ideas into things I can actually use.

Most of my apps started with little problems I noticed in everyday life. For example, I've made apps for learning dance routines, improving posture, tracking workouts, finding local events, and even editing videos automatically.

Some of them are just for myself, and others are designed for friends or family. I really enjoy the whole process of coming up with an idea, building something, and seeing it actually work.

If you're interested, I can show you a few of them on my phone.

**中文**

其实我已经借助 AI 开发了不少软件。我不是传统意义上的程序员，但特别喜欢把想法做成真正能用的东西。有些是给自己用的，有些是给朋友和家人用的。如果你感兴趣，我可以在手机上给你展示几个。

## 第四部分｜待核实与维护记录

- 需要优先读取真实产品文档或真机界面补齐精确操作的项目：本文件中标注「待产品或真机核实」的全部条目。
- P002、P008、P009、P017、P019、P022、P025、P026、P028、P036、P037、P038、P039、P040、P041、P042、P044、P050、P058、P063 等项目过往存在 README 通用模板或项目说明较少的情况；不得把本文件的总体简介当成交付证据。
- 其他待排查独立仓库：`nomad-seasons`、`50-haikou-cafes`、`ai-resume-job-matcher`、`haikou-go`。应先确定是否独立对外产品，再新增索引，不可默默忽略。
- 需要补充每个产品的手机演示链接/安装包入口、登录及权限要求、是否可离线、推荐演示时间，确保出门前逐个验证。

### 修订日志

- **V1.4（2026-10-31）**：修复前版复制粘贴式待核实占位、修复章节标题错位；对资料不足的项目改为项目专属中英双语场景讲解，区分真实操作与开发方向。未进行全体真机点击验收。

- **V1.3（2026-10-31）**：在 V1.2 全量 51 条双语总体介绍基础上，按手机优先重排；每项增加四步中英双语演示讲解；强化真实操作核实、编号稳定、版本全量交付和子代理交接要求。
- **V1.2（2026-10-31）**：确立公私有 GitHub 全量收录与首部智能体维护规则，整理 V1.1 中英双语朋友介绍稿。
