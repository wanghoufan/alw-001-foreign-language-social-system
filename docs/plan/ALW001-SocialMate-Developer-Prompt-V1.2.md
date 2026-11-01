# ALW-001 SocialMate 连续产品化执行提示词 V1.2

先完整读取 `docs/plan/ALW001-SocialMate-Productization-Plan-V1.2.md`，并实际核查当前 Git、日志、QA、Android APK、公开海南页与已运行的服务。旧 V1.1 计划与任何混合私人/公开页面的规划，如与 V1.2 冲突，以 V1.2 为准。遵守 `~/.agents/AGENTS.md`。

**两个交付物，必须独立**：
1. 私人 Android APP 是主产品，已有 V0.4.0 真机安装历史。继续完整保留录音/BOYA/腾讯ASR/DeepSeek/聊天/五Tab/历史记录/自动导出Mac；改成无USB、私有加密鉴权、可日常使用。
2. 分享给外国朋友的公开PWA **只显示海南115地点**：中英详情、搜索/筛选/地图、勾选想去地点、自动汇总清单并通过链接/系统分享或复制发回。绝无录音/AI/聊天/关于我/人物/软件作品集/个人信息/私有API。普通手机自带浏览器打开HTTPS，不强迫安装APP、登录或Chrome；独立静态托管，不开放Mac私有8790/8791。

不要推倒重做。现有 `socialmate-prototype/public-share.*` 公开HTML已具备115地点、双语搜索地图分享，直接补选中清单与真正PWA能力；现有 `conversation-archive.mjs` 已有8项历史测试，但要修trim原文、短ID冲突、JSON/MD非事务写等风险，再接Android持久outbox、TLS鉴权入口和Mac自动导出。先读取016「懒得打字」本地导出实现并择优复用，不重复造轮子。最新 `verify-v040.sh` stage1b要真跑并留新日志，历史102/102不能冒充最新结果。

工作单位是**整个产品化目标**，不是一个小阶段：自主拆分并可并行推进公开PWA、Android归档、私网连接和UI，持续“分析→实现→测试→修复→复测→下一任务”。不要在每个Task、Gate、报告或小里程碑暂停。普通问题自行解决；仅用户实际必须参与的录音知情同意、BOYA硬件、电信服务登录/授权、最终真机人工确认和正式部署集中提出。BOYA -180dBFS如持续无法消除，记录BLOCKED但不阻塞其余开发。

不得覆盖并行开发者文件、reset/clean、清空个人资料、提高腾讯/DeepSeek各1元限额、泄露密钥、push或擅自部署。测试必须区分代码/模拟/真实Redmi和公网实际访问。最终产出新APK、新公开静态PWA包（未授权不得公开部署）、真实QA日志/截图/hash、自动导出实物证据、更新handoff/CHANGELOG/剩余问题。不能仅提交计划就结束。
