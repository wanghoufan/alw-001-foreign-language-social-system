> **N05 V1.1 正式修订：2026-11-02**
>
> 此V1.0入口已由桌面GPT于 20:16:42 GUI_SENT 给当前 ALW-001 WorkBuddy；不得重复转发，也不得停止正在运行的开发会话。
> **后续实施以** `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/README.md` **及同目录的 `SDD-REVIEW-V1.1.md` 和 `prototype/interactive-prototype.html` 为准**。新版保留相同已批准N05功能范围，修正了地点ID、复盘revision、Demo隔离、原生TTS/STT、当前单气泡icon和Android系统Splash、ADB开工预构建与完整前置条件。可在执行下个不冲突Task时优先读此新版；不需要重做已完成的工作或中途请求用户拍板。
> Mac现有N05 V1.1目录已含HTML交互原型和SVG图标/启动效果；对用户交付的ZIP另含PNG页面截图与细分规格。不把设计预览当当前APP功能。

# SocialMate N05｜人物活记忆 × 海南活地点 × 英语听说学习闭环

status: USER_SCOPE_APPROVED_RELAY_READY
requested_at: 2026-11-02
project: ALW-001
target: ANDROID_APP_ONLY
previous_task: SM-ALW001-20261102-N04-V13
technical_baseline: Android 0.8.1 / versionCode 36 as observed 2026-11-02 19:41
handoff_policy: CURRENT_TASK_READY; DESKTOP_GUI_SEND_PENDING
visual_prototype: socialmate_android_interactive_prototype.html (current chat sandbox deliverable, not installed in Mac repo)
owner: EXISTING_SINGLE_MAIN_DEVELOPER

## 一句话目标
让朋友的档案、海南地点、英语表达和练习薄弱点越用越丰富；不是每次聊天从零开始，也不是让 People 首页变成开发调试面板。

## 本次用户明确反馈
1. 已认识的朋友，可手工文字输入或语音输入一大段旧信息，AI拆成候选事实，选择正确人物→编辑/勾选→确认后写入长期人物主档，不必等待录音会话；必须防串档/防猜身份/防无确认就保存。
2. 海南115地点原档案只读，在 Android 私有区持续追加每次游玩感悟：整段中英双语、可一中文配两种地道英文、常用表达/搭配；AI建议关联地点，用户可手选地点；保留来源、日期和版本，点击龙兴路可看基础介绍+历次个人记录。
3. 长篇感悟（10段甚至更多）自动按语义分成小学习段，必要时3–5句为一组，保留中文/英A/英B/表达并允许用户核对，**绝对不能丢句或改写现有英文原文而不提示**。
4. 在安卓APP按段切换中文、英文A/B、常用表达并循环朗读，进入/退出、上一段/下一段与重复次数清晰；优先 Android 原生TTS，设备是否有合适中英声线需要真机核验，不因云服务或付费TTS阻断。
5. 每一段生成可复制的 GPT Voice 练习 Prompt：中文问固定表达→用户英语回答→中文整段→用户英语转述可用两种自然表达→生成结构化复盘→复制回APP关联对应段落，薄弱点长期保存；不宣称能自动从外部GPT会话抓取成绩。
6. People主界面去掉“演示人物/清空数据/恢复数据/调试/测试令牌”等所有开发式控制，挪到右上角设置→高级→演示与测试；普通使用者只看到真实人物列表、补充资料、新增联系人、正常详情/历史。
7. **公开PWA不动**；不能向线上Hainan发布用户私有感悟，也不修改115地点的原始源数据、已确认项目约束/架构与N04已通过功能。

## 首先做什么
- 读 `PLAN.md`→`PREFLIGHT.md`→`UX-SPEC.md`→`ACCEPTANCE.md`；
- 仅安卓工作范围：`socialmate-v1.2/source/V1.1-baseline.html`, `socialmate-v1.2/build-v12.py`, `socialmate-prototype/ai-gateway/server.mjs`, People/Archive真实存储模块, `android-poc/`。务必核对当前主开发者 N04 0.8.1是否仍有活动编辑，绝不并发覆盖。
- 现成入口：`GET /v12/api/people`、人物写确认/撤回；`SocialMate-Data/People/`为私人主档；龙兴路在`socialmate-v1.2/source/places-115.json`中稳定`id: 1`；公开PWA及地点母版仍只读。
- 先补People主页整改和私有人工录入完整闭环，再接活地点→分段学习→GPT复盘；无需新增一级Tab、数据库、第二套AI网关或独立公开网站。

## 重要范围边界
本文件是用户已明确要求整改的Android开发包；`docs/relay/CURRENT_TASK.md` 已更新为本N05任务的 `READY`，**尚未GUI发送**，旧N04 V1.3 `GUI_SENT`回执完整保留。旧N04 T1/T2 PASS、T3/T4/T5 PARTIAL；桌面必须检查现有开发者BUSY状态，未空闲不得抢队/打断，先安全收口N04再进入本阶段。交互原型用于布局和操作顺序，不能把HTML模拟AI/TTS当安卓APP已开发。
