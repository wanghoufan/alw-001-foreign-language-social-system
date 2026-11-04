<!-- ALW-001 N05 V1.2 / USER_APPROVED_2026-11-03 / ANDROID_ONLY / single developer -->
# ALW-001 N05 V1.2｜红城湖真实内容与学习交互收口

> **2026-11-03 用户最新确认：Mac mini 全自动学习资料接收、AI归类、定期整理，用户日常不手动搬文件和分类。** **先阅读本目录 `ADDENDUM-AUTO-LEARNING-ARCHIVE-V1.0.md`，其执行优先级高于原SDD中暗示用户须手动导入/整理的文字。** 懒得打字原来使用每日22:00 WorkManager+局域网 Mac接收器，已有四种范围真实投递证据，但旧版明文无鉴权、失败仍标导出完成以及跨天补传等问题要修正；不得扩大不安全接收面。其它四类课程/真实沟通/个人想法/GPT复盘也后台分类、保留原文/派生版/弱项索引。**不新增学习中心UI**、不重新开发已通过的N05功能，现有红城湖T5/T6先完成。新文档属于本次已经批准的同一V1.2转发任务，不创建额外READY。


status: USER_APPROVED_PLAN_READY_NOT_DISPATCHED
approved_date: 2026-11-03
approval: USER_REPLY_1
project: ALW-001
scope: ANDROID_APP_PLUS_MAC_PRIVATE_API_ONLY
model: ONE_MAIN_DEVELOPER_CONTINUOUS_UNTIL_FINAL_HUMAN_GATE
route_task_id: SM-ALW001-20261103-N05-V12-HONGCHENG

## 唯一开工顺序

1. 先阅读本目录 `CONSTITUTION.md`、`SPEC.md`、`PLAN.md`、`TASKS.md`、`PREFLIGHT.md`、`ACCEPTANCE.md` 与 `SDD-APPROVED-SOURCE.md`（用户批准的完整原文）。
2. 再读 `docs/handoff/HANDOFF.md`、`android-poc/IMPLEMENTATION_STATUS.md`、`android-poc/app/build.gradle`、Git dirty + 最新 N05 S0–S6 QA；只接续尚未完成部分，不得把已通过的阶段重做。
3. 真实红城湖素材原稿在 `docs/plan/ALW001-N05-Living-Memories-Practice-V1.1/content/20261103-红城湖公园-实测文稿.md`。**19段、中文原话绝不改字**；英文A/B与表达的缺口必须显式标注，用户原译与AI建议分离。
4. 旧 `docs/relay/CURRENT_TASK.md` 如仍是 Amazon Polly `READY`，**不得修改或抢队**。本目录的 `RELAY-STAGED.md` 只是排队登记，并不是桌面已经送达的凭证。
5. 完成全Task前置检查后即刻 Android 预构建和 `adb install -r` 真机预览；T0→T6 连续分析/开发/复测，只有最终一次 Human Gate。遇外部 AWS/付费/隐私同意等不得越权，普通Bug和小额已批准资源内的问题自主处理。

## 这次要完成的用户体验

Android「海南→红城湖私有地点→2026-11-03真实记录→19段中文/英文A/B/表达」；大稿粘贴与自动保存草稿→AI语义分段（标准/精细/宽松）→人工合并拆分→一键播放中文/英语A/B/表达、重复/暂停→GPT Voice练习→复盘入库。朗读点按**不能反复弹AWS同意窗**，未配置时只提示并引导先到设置，不能假装成功。

## 额外材料

本目录文档基于用户已批准的 2026-11-03 V1.2 Markdown 拆分，原文在 `SDD-APPROVED-SOURCE.md`。V1.1 的 Amazon Polly Adapter、TtsPlaybackController、S4 fake QA 等为可复用基础，不得覆盖并行开发者 dirty 文件。图片来源、拍摄年份、授权要逐一核验；任何截图/HTML预览不能冒充新版真实APK或实机测试。


**共同约束**：只改 Android 私有 SocialMate 与 Mac 私有后端；不改公开 PWA、公开 115 个地点或任何既有真人档案；保留旧 N04/N05 已通过证据，不 reset/clean 工作树，不擅自 AWS/DeepSeek 付费、对外传输或提交真实文稿到公开 Git。
