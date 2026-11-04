# N05 V1.5.1｜真实交流体验、接话质量、安全与外出可靠性收口

> 项目：ALW-001 SocialMate｜阶段：N05 V1.5.1｜用户批准：2026-11-04 回复「1」｜唯一根目录：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`。
> 只向该目录及其子目录写入项目文件，不允许编码相似目录、另建工作树或在其他项目落地。单一主开发者在同一工作区连续实施，不增加中途Human Gate。


status: APPROVED_IMPLEMENTATION_READY
task_id: SM-ALW001-20261104-N05-V151-CHAT-REALUSE
mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS
release: NOT_AUTHORIZED

## 唯一目标
把已完成 V1.5 的聊天页，从“120句DOM压测+10秒真实ASR成功”，推进到**用户实地与外国朋友交流时可连续使用、建议有帮助、安全与重连可信**。不是重新设计界面，不是开发大型新功能。真实ASR录音时，用户眼前保持：最近字幕、可选的多方向接话、关联资料精简条，且能快速结束复盘。

## 已核实基线
- 2026-11-04，Android `0.8.29` / `versionCode 64`；V1.5 14项真机DOM检查PASS，120句注入压测PASS，N05-V1.5的 `prototype.html` 和 `qa-v15-120.png` 位于同仓 `docs/plan/ALW001-N05-V1.5-Chat-UX/`。
- P066 短时真机回归后来补测 PASS：2条final（spk_0/1）→归档2条HTTP201→本地复盘1候选→去重/新增人物档案写入PASS；证据 `docs/plan/ALW001-N05-V1.5-Chat-UX/QA-REPORT.md`。不许再以之前的USB静音障碍当“仍未回归”。
- 已知尚未收口：真实长对话UX的人工体验证据不足；接话质量仅查卡片数量/DOM，未检验10话题的相关性/重复/忠实原文；ASR WS入口握手鉴权、TTS debug Activity任意remote_base等安全问题；网络切换ASR重连与归档401过期令牌重试；蜂窝下完整原生录音 NOT_RUN。
- V1.4锁屏TTS 45/45、Mac学习归档1800秒watch属于既有完成能力，不作为本阶段重新开发范围。P016独立合同已经有交接文件，本轮不越界处理其源码。

## 开发入口
按顺序读取本文件→ `PREFLIGHT.md` → `SPEC.md` → `PLAN.md` → `TASKS.md` → `ACCEPTANCE.md` → `RELAY-STAGED.md`。再读当前 `docs/handoff/HANDOFF.md`、`docs/risks.md`、`docs/architecture-facts.md`、上版V1.5的SPEC/QA、V1.4外出`qa/20261104-t3/code-audit.md`，用真实源代码与设备事实校准任务（以上旧行号仅供定位，勿机械修改）。

交付时在本目录 `qa/` 记录一份综合真实报告和最小截图/脱敏日志、APK版本/签名与Hash；将真正新增成果追加至本仓 `HANDOFF.md`/CHANGELOG，严禁凭脚本模拟把真人验收判PASS。所有项目文件只保存在上述ALW根目录。

## 全程边界（强制）
- **唯一写入范围：/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统 及其真实子目录**。开工确认 `pwd -P` 与 `git rev-parse --show-toplevel` 指向此根，拒绝路径重定向/URL编码的相似目录/symlink越界。所有新原型、代码、计划、截图、QA、构建和项目日志均在本仓，系统SDK/Gradle/ADB/LaunchAgent等运行必需的宿主机缓存/系统位置不作为本项目交付文件；不能无故在别处创建项目副本。
- 主开发者单任务连续：分析→实施→自测→修复→定点真机QA→交付；不要重做 N05 V1.5 已完成的界面（4方向、2–3候选、3句字幕、资料卡、阅读冻结、浅深主题、120句DOM压测、短时P066 2 final→HTTP201→复盘）。不新增Tab、聊天页技术看板或第二套服务。
- 不得覆盖当前未提交改动；严禁git reset/clean、盲杀端口、无授权卸装/清数据、自动commit/push/deploy。已经过用户批准的基础技术架构、P066提供商、真实数据/录音同意和预算均不擅变更。
- 私有文本、人物档案/用户真实对话不上传第三方，除非具体类型与范围已获授权；真实ASR必须在P066当前已批准预算内，优先零费用fixture与短真实录音。不能改大/重置任何既有账本上限（当前P066以服务器实测3元月上限为准，其他模型以现有账本闸为准）；Polly真实账号/真实合成默认预算0，未批准继续NOT_RUN。
- 外部 P066 / P016 是独立项目，不跨项目写入或修改源码；仅在ALW验证对接接口并记录联合待办。录音和留存需要双方合法知情同意，原文与AI派生内容分层保存，未经确认不得入正式人物档案。
