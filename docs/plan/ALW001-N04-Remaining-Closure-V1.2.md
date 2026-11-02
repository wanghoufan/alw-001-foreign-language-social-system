# ALW-001｜N04 V1.2 下一阶段：真实录音记忆与可交付收口

status: PROPOSED_NOT_QUEUED
date: 2026-11-02
project: ALW-001 / SocialMate
governance: 单独主开发者模式；沿用原有最终一次Human Gate，不创建新的中间审批门
prior_task: SM-ALW001-20261102-N04-PERSONAS (SENT / GUI_SENT)
do_not_forward_without_approval: true

## 1. 仓库与原始证据（不是旧版摘要）
- 当前 `android-poc/app/build.gradle` 的 versionName=0.7.3，versionCode=28。
- `docs/relay/CURRENT_TASK.md` = SENT，GUI回执 `docs/relay/receipts/SM-ALW001-20261102-N04-PERSONAS.md` 已记录 09:36 转发 WorkBuddy；本次不重发。
- 本任务 N04 README 有三个阶段：第一步三人物持久演示，第二步 final→pending→确认→专属追问更新，第三步 Mac 演示归档与永久QA均记录通过。
- 原始 QA 在 `docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/`：`persona-comparison.json`、`memory-timeline.jsonl`、`archive-inventory.json`、`clear-restore.json`、`verify-demo-archive.json`、`device.json` 和 `shots/01…09*.png`。`verify-demo-archive.json` 记载39条PASS；Mac `~/Documents/SocialMate/Demo/Conversations` 有9份md+9份json，54个合成final；跨人物个性化6问各有事实来源。ADB记录0.7.3安装成功，APK SHA cd4cddcc123e9e39d20f6ca348ca3c014df7b8411ab7321e58dcab5c02e6147f。
- `SocialMate-Data/Demo/{People,Conversations}` 为当前演示活动副本；正式档案 `SocialMate-Data/People` 与正式 `~/Documents/SocialMate/Conversations` 没被本轮演示改动。清空演示活动副本仍保留Mac Demo 9对归档，界面必须清晰解释。
- Git工作树有大量未提交改动，包括独立模块 `demo-store.mjs` / `demo-archive.mjs` 与UI等；未经确认文件归属不得覆盖。QA-STATUS.md仍为旧PREPARED/NOT_RUN，HANDOFF/CHANGELOG仍以0.6.6为主，必须统一到0.7.3证据。
- 不要将演示注入final/合成事件、网页CDP点击视作真实人声ASR的完整链路。不得将旧N03历史归档PASS冒充本轮Android0.7.3的手机outbox到Mac测试。

## 2. 优先解决的五件事：补证据链，而非扩大产品

### P0-0（新增最高优先级）：修复演示 final 的“源段号与原句不一致”
**2026-11-02 云端直接交叉核对真实源码 + 原始fixture发现 3/3 错配**，不是猜测：
- Oliver `sess_n04_demo_oliver_uk_3` 第2句（segmentIndex=1）原文是 `I keep the runs easy after heavy lifting days.`；`REPLAY_FINALS` 给出 `Oliver keeps his runs easy on the days after heavy lifting.`。
- Maya `sess_n04_demo_maya_us_3` 第6句（index=5）原文是 `Maybe food first, then some live music.`；回放给出 `Maya wants to try casual local food in Haikou before any live music.`。
- Ji-eun `sess_n04_demo_jieun_kr_3` 第4句（index=3）原文是 `The shadows on the walls.`；回放给出 `Ji-eun noticed the shadows on the walls in her morning-light photo.`。
以上并非逐字ASR final；是**改写/概括**，即使语义接近也不应标原文final且声称直接来自某一段。优先复用会话权威JSON，按sessionId+segmentIndex直接读取`textOriginal`；候选事实（可编辑摘要）必须与独立`sourceExactText`区分，界面显示两者及人工确认。服务端拒绝“不存在的段号”或“声称是逐字final但内容不一致”的注入；不放松反作弊来把测试跑绿。
验收：三个角色各回放一次，逐字final等于fixture对应字段，来源身份unknown必须可选人；有差异返回可理解错误且0写入，真正摘要另有明确来源/人工确认；新增自动断言3匹配+篡改文本/错误段号反例，真实人物主档hash保持不变。



### P0-1：真实单机录音final → 本轮候选记忆 → 人工确认 → 下次使用
使用现有 AudioRecord→ASR WebSocket→SSE final→会话UI链，不允许通过“演示回放”代替。
- 对已获录音同意的真实final，生成**临时候选**，源记录包含sessionId/segmentIndex/原文文本，speaker=unknown时不得猜身份；用户指定目标人物后，必须显式点「确认保存」才写目标People主档。由真实final而非演示固定文本驱动；不因打开人物页面自行生成虚构事实。
- 刚确认完在本轮重算个性化问题且跨APP重启稳定；撤销后旧问题不可继续引用。事实缓存以人物+fact版本/更新时间为依据刷新；A人的事实不能串B/C。
- 留存默认OFF；没授权留存不得把完整原文写盘，临时内存信息在离开后清除。保存选中事实属于用户独立明确确认的动作，界面要解释；腾讯ASR和DeepSeek各1元预算不能抬高/清零。测试先用合成音频经**真实录音/ASR输入通道**，真人有同意才能做最终实测。
- 证据：原生点击/权限→final→candidate→人选与确认→People文件差分→推荐前后→重启→撤销、错归属/双点击/断线，脚本和Android截图；无授权0文件/0计费的反例。

### P0-2：完整验证手机SessionArchive outbox→Mac正式归档
目前证明的是Mac仓库内Demo队列→8782固定Mac演示接收端，不是Android Java SessionArchive outbox→8781正式归档。
- 使用一次明确同意、虚构/合成音频并绑定临时隔离接收端：手机联网时final只留存授权的逐字原文，停止后outbox；模拟失联、网络恢复后HTTP2xx；Mac生成 .md + .json，逐字/段数/来源一致；重复不新增。
- 测试结束不删样本及QA证据；测试隔离数据不写真实人物档案、不改生产原文。用户在App能找到对应原文并通过SAF选择保存为.md，系统文件管理器可打开。
- 补测服务重启、手机重启/断网恢复（当前Java最多6次退避，不能把达到次数上限后仍会自动成功当作既成事实）。
- 证据：Android设备已安装版本、固定serial、outbox→exported转移日志、服务HTTP回执、Mac文件SHA、导出后手机文件可读、失败前后重试。

### P1-3：默认可用与恢复
- 真机关闭Wi-Fi/Tailscale后，在APP人物页查看3人、9次会话、已确认与待确认状态的只读降级；不得空白或将演示信息当真实。手机离线缓存若有，显示标识与原文来源；恢复网络后数据同步；断网期间不允许把清空/恢复请求伪称成功。
- 演示归档8782服务接入既有启动/自愈体系（优先复用service-v040.sh与用户现有Mac常驻服务，不再创建第二套守护），实际模拟Mac重启或受控服务恢复；机未启动时UI明确待传状态，网络恢复后能自动补传或提供一键补传，不要求用户运行终端。
- `SocialMate-Data/Demo/People`是当前唯一演示人物源。与文档提出的 `~/Documents/SocialMate/Demo/People` 做一致性决策：优先保留单一权威写入根和Finder可访问路径，不要复制成两个会分叉的可写档案；若用户明确需要在Documents浏览，采用只读导出/安全文件访问，而非第二真源。
- “清空演示副本”与“保留Mac演示历史归档”的语义清楚标注，恢复仍只恢复三个标准人设和基线，不污染真实资料。

### P1-4：发布级证据与安全核对
- 已通过旧N04功能不重做。只补真实链路、离线、未归属final选人下拉点击、重复确认、防误删、原生桥跨frame/跨域的最小负面测试，修实际失败。
- 对演示POST的confirm:true、Origin/Host、写限流和CSRF风险做受控审查：尽管演示数据虚构，清空/恢复仍是有状态更改，确认字段不等于用户身份验证；不得让非授权外部页面远程清空。保留私有网络与现有用户体验、优先最小变更。
- 运行最新完整`verify-v040.sh`、已有N04验收脚本、`qa-people-e2e.mjs`、Gradle及ADB实测；新日志必须针对0.7.3当前代码或实际提升后的新版本，记录exitCode+APK hash+手机installed version；不重复使用上一版本签名作证据。
- 回填更新`docs/handoff/HANDOFF.md`、`CHANGELOG.md`、`android-poc/IMPLEMENTATION_STATUS.md`、`N04/QA-STATUS.md`，一致说明历史 0.6.6→当前0.7.3及其后续版本。
- 在`docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/`追加新日期/时间戳目录，不覆盖已有20261102证据；Mac `~/Documents/SocialMate/Demo/QA/`可供用户Finder逐文件核查。截图均应是实际手机UI，不把Playwright模拟当ADB。真人/双人及Android12+缺设备保留NOT_RUN。

## 3. 最终验收：只看五个能由外人复核的结果
1. 打开APP，不空白；3人物9次虚构会话、2专属+1通用问题、Mac9对历史归档持续存在。用户实际点「清空」→关闭→「恢复」均正确，母版没丢。
2. 真实录音链拿到final并显示临时候选；用户选人物并人工确认，新事实本轮改变推荐，重启仍在，撤销可回滚，另外两人物hash不变。
3. 手机上的outbox经历网络故障后把授权final交付Mac；Mac原文md/json和原始事件可逐字复核，重放幂等，手机导出.md实际打开。
4. 真机断网、服务重启、未归属人选场景有受控操作证据；出错不白屏，不假报成功；Mac常驻无需日常终端维护。
5. APK版本、SHA、ADB安装、运行日志、QA时间线、每项PASS/PARTIAL/NOT_RUN/BLOCKED能被另一个Reviewer按文件独立重放。真人双人需要用户知情同意后另测，不阻塞自动化可做任务。

## 4. 开发者执行口径
单主开发者先核实当前N04其他开发进程和文件所有权，已通过功能只做最小回归。依序做P0-0→P0-1→P0-2→P1-3→P1-4，内部测试失败自行修复并继续，所有可自办部分完工后仅一次最终Human Gate。不增加ORCA角色、不重构系统、不新建云服务、不改ASR/DeepSeek预算、不清真实资料、不Git reset/clean/force push、不以MOCK冒充真人录音。用户尚未对**本版**批准入队，所以这个文件仍是草案，**不得自动覆盖现有SENT指针或发送给WorkBuddy**。
