# ALW-001 N04 V1.1 — 三人物持久演示与记忆闭环 SDD

task_id: SM-ALW001-20261102-N04-PERSONAS
project: ALW-001
status: USER_EXPLICIT_FEATURE_REQUIREMENTS
related_plan: docs/plan/ALW001-N04-Deep-Stabilization-and-Evidence-V1.0.md
approved_scope: 建立3位不同地区与沟通风格的虚构人物；持久9次会话；实时候选记忆与人工确认；个性化+通用推荐；自动归档、导出；手机可见，用户一键清空与恢复；每次QA留原始证据
execution_mode: SINGLE_MAIN_DEVELOPER_CONTINUOUS_UNTIL_FINAL_HUMAN_GATE

## 0. 现状核查（2026-11-02，必须尊重）

- Android源码当前版本0.7.0 / versionCode25；交接文档仍写0.6.6，最后全量日志verify-20261101-224845.log已全绿，但不是当前0.7.0真机完整验收。Git有大量他人/并行的未提交修改，尤其Java、UI、网关、测试与海南places.json。先核对真实改动与所有权，不许reset/clean/覆盖。
- 已有People主档、已确认事实写入、来源标记、幂等、档案回滚、人物详情、通用/话题模板、SessionArchive final-only录音原文、手机outbox与Mac接收。不要重新实现这些基础功能。
- 现有qa-people-e2e.mjs用三个虚构人物+两个合成会话在临时目录跑完就删除；证明不串档，不证明打开APP能看到三个持续存在且内容丰富的示例。
- person-detail.mjs 的 buildPrep()主要按单条已确认事实匹配running/coffee/coast/work/food/travel/language/general，最多3个问题。尚未证明不同人物风格及新增记忆后定制追问更新。
- 正式本地数据People中现有Daniel-Weiss/Mia-Chen/Ravi-Kumar/Sofia-Martins/Test-Anna等目录，不应读取隐私内容或覆盖这些真实/既有条目。新演示完全另设命名空间。
- 录音归档原位置：手机应用私有files/archive/current.json→outbox/*.json→exported/*.json；Mac默认~/Documents/SocialMate/Conversations/YYYY/MM/SocialMate-*.md及同名.json（来源conversation-archive.mjs）。只有明确勾选“原文留存并导出”才存final；没同意就0持久化。历史N03已实测模拟会话断网补传→Mac隔离目录.md/.json和Android SAF导出，旧版本有真实单人腾讯ASR，但不能声称0.7.0全程真人PASS。

## 1. 母版：不是临时QA，是长期可恢复内容

云端已经写入文件：
  docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/fixtures/demo-personas.json

固定3位全虚构人物，3地区、3独立沟通风格、9个合成对话、54条原文final、6条已确认基线事实、3条尚待用户确认的新事实；每个事实包含source sessionId及segmentIndex。附带各自确认前/确认后的预期个性化问题、通用问题及禁止虚构的说法。

A Oliver Reed 英国伦敦男生：力量训练、引体向上，简明务实；第二轮新记忆为准备12月首次10公里赛事，确认后追问要转向10K训练进度与力量安排。
B Maya Torres 美国奥斯汀女生：做乐队海报、热情喜欢小型现场音乐；第二轮计划考虑来海口尝本地小吃，确认后建议转向海口小吃与音乐探索，不可说她已经订机票。
C Ji-eun Park 韩国首尔女生：喜欢安静老街摄影、咖啡店，内敛慢节奏；第二轮练习用英语介绍摄影作品，确认后建议练描述照片的问题，不可从韩国籍推断性格。

性格由虚构剧本显式设定，绝不能由国籍推断所有人的性格。所有演示记录要显著标“虚构/合成”，不假装真语音、不输出到正式好友资料。

## 2. UI与数据持久化要求（用户回家打开不能空白）

1. APP“人物”Tab中默认提供“演示人物”分区，初次打开无需操作即显示3张充实的人物卡：姓名、地区、风格、主要兴趣、最后交流日期、三次历史对话。若另有“我的人物”，分区展示，演示与真实人物不能混入正式搜索/联想。无须新增第六个Tab。
2. 点击人物详情能看到原始两条已确认事实、来源及三段完整对话，且有“给这位朋友的2个专属问题”和“通用破冰1题”。每句英文+中文解释+来源说明。三个人人物专属问题必须不同，实质基于各自已确认事实，而非换个名字的模板。无已确认事实时只能显示通用与明确空态，不能编造个性化。
3. 录音中新的final（演示用合成事件回放）进入“本轮新听到・待确认”列表，可按来源定位到原文某段。speaker编号绝不直接等于身份。用户选目标人物且点确认后才能保存为持久人物事实；**同一轮确认后马上刷新人物资料和建议，无需重启**。未确认不能写正式People，不能当成可信定制事实。可清楚区分本轮临时讨论建议与已确认长期记忆。
4. 演示数据首次运行只种一次到Mac固定私有目录。正式生产目录与演示目录彻底隔离：正式People不变，正式归档~/Documents/SocialMate/Conversations不变；演示建议路径~/Documents/SocialMate/Demo/{People,Conversations,Profile,Backups,QA}。母版在Git内的fixtures，演示活动副本常驻Mac，不放临时/tmp，也不能随自动QA结束清理。
5. “人物→演示管理”提供两个用户按钮：**清空演示记录**、**恢复三人物标准演示**。清空只清当前演示副本，先弹确认与影响范围；清空后演示分区显示有内容的空态和“恢复”按钮，退出重进仍保持清空，不自动重种；恢复从不可误删的母版原子恢复3人9会话6确认+3待确认，重复恢复绝不重复；恢复前可导出/自动备份演示修改，备份位置可查看。任何操作都不能触碰正式People/真实录音/AI账本、不能允许客户端传任意服务器目录。
6. 离线与重启必须可用已保留的演示副本或显式受限缓存并标离线。不能网页打开要等用户拿令牌却只剩空白；如真实私有服务暂不可用，应显示可读演示内容与可恢复网络说明。不要把永久演示人物当用户真的认识的好友。
7. 不引入新云服务器/数据库/付费模型/庞大学习系统。复用现有Java+WebView、Node服务和People/Archive模块，服务端演示目录应固定白名单，禁止用process.env全局值按并发请求切换根目录。演示只在私有入口可访问且受现有授权控制。默认无需真实API或计费。

## 3. 3大链路必须通过真实可复核测试

T1 三人物分别测试：
- 第一次打开APP，3张演示卡真实显示，分别有个人信息和3段逐字对话。相同的通用问题允许出现，但2条人物定制问题要明显不同、有来源ID。
- 同一段通用句不应把英国健身目标说给美国或韩国虚构人物。三个人物表述风格可不同，但不得把地理位置当性格预测。
- 每个场景都留实际手机截图与预期/实际对比，不仅写代码。
T2 实时记忆更新：
- 逐人回放第二次会话中的新事实，初始pending，只有用户点击确认才新增已确认事实/更新问题；确认前后推荐文字有明显差异，当前页面无需重载；关闭重启后仍存在。
- 重复确认不新增，撤销后不能继续拿被撤销事实推荐；A新增时B/C真实文件hash完全不变；ASR说话人身份无法证实时必须让用户选择归属。测试需给每次状态变化时间戳、具体来源session/segment和before/after快照。
T3 归档与清空恢复：
- 9个合成session按协议标mock/synthetic，经真实接收管道落Mac Demo的9对.md/.json（至少54段逐字原文），同内容重复上传不复制，导出.md后与原文逐字对比。
- 1条合成会话走“断网→手机outbox→网络恢复→Mac收到2xx→手机显示已同步→历史/导出可见”的实际闭环；采用受控隔离端点，0真实AI费用，不写入正式真实会话目录。
- 在手机真正点“清空”，卡片归0、空态可恢复，退出重进仍0；再点“恢复”回到3/9/6/3基线，2次恢复不增；正式人物/正式归档前后hash相同。
- 用户可在Mac固定目录打开以上原始证据、具体测试报告、版本与每次APK SHA。**禁止测试脚本成功时自动清理演示内容**。

## 4. 交付证据（必须物理落盘，用户可以逐文件检查）

永久母版：docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/fixtures/demo-personas.json
静态母版验证：docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-fixtures.mjs
Mac长期可见的演示：~/Documents/SocialMate/Demo/People/<slug>/00-profile.md 和 Demo/Conversations/YYYY/MM/*.md+*.json；Demo/QA/保存对比证明和GUI截图。
QA字段至少：时间、设备序列号/机型、APKversionCode与SHA256、真人/合成标签、sessionId、personSlug、确认前/后factId与生成问题、原文保存路径、单次操作结果、截图与日志引用、PASS/PARTIAL/NOT_RUN/BLOCKED。证据最少包括：
- N04-persona-comparison.json，三个人人物专属问题与通用问题对照
- N04-memory-timeline.jsonl，每个final→pending→人工确认→更新建议时间线
- N04-archive-inventory.json，9份MD+9份JSON的路径/sha
- N04-clear-restore.json，clear→关闭APP→恢复与幂等/真实档案未变hash
- N04-android-ui-screenshots/，真实安装APP截图
- N04-test-report.md，所有可独立复查的测试日志、FAIL和后置事项
所有文件都标清真实执行/模拟，不能将 fixture 存在宣称成已完成GUI集成。

## 5. 独立开发者连续开发指令

目标是完成N04 V1.0关键可靠性与本次N04 V1.1三人物闭环，不是扩大产品。先读本文件、关联N04 V1.0、当前Git状态、CHANGELOG/HANDOFF/QA、代码与真实测试。S0只读核对未提交修改与他人编辑文件，先Gradle预构建并ADB固定唯一授权手机，安全install -r保留用户数据、记录版本与APK SHA；无法装时先完成能在电脑执行的内容。S1落地有可视化的三人物持久演示；S2完成新事实的本轮人工确认更新和个性化前后变化；S3完成9份合成原文自动Mac演示归档与用户一键清空/恢复；S4全量测试/修复/再跑、截图/文件/hash对照、更新HANDOFF/CHANGELOG/QA和最终APK。
所有Task/阶段检查是内部节点，不等待用户“继续”；普通Bug自行修复，中途不追加人为Gate。已实现的历史功能验证复用，勿从零重造。真人双方知情录音、缺失安卓12+、缺失iPhone/OPPO后置不影响软件工作。付费、正式部署、删除正式用户档案、修改预算闸、git reset/clean/push未经授权不执行。只有全部可自主事项完成后，集中一次Human Gate，提交最终“手机怎样点、三个演示人物、9套原文、清空/恢复、QA路径、版本/hash与真实失败/后置项”。
