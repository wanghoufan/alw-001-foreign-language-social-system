# 多项目云转桌管家｜试点入口 V1.0

**生效范围：试点登记与文件预检；尚未安装到000治理仓库的固定转发触发器。**
主规范：`000-alw-个人偏好-电脑治理仓库-skill管理/转发管家/说明.md`。不得另建独立角色或替代此真源。
文件：`docs/relay-center/v1/PROJECTS.json` 是项目登记与定位表；只有项目各自的 `docs/relay/CURRENT_TASK.md` 才是任务真相。

## 当前每次“转发”的目标算法
1. 从中央登记核实项目ID→真实工作区路径映射；如000主规范已完成安装此流程，按该规范执行。**不得把“当前浏览的项目”“某程序最前面”当任务身份**。
2. 逐项目只读查询 `CURRENT_TASK.md` 和 `receipts/<task_id>.md`；status必须为READY、user_approved:true或等价已批准标记、task_id唯一、计划存在且路径受本项目根限制、send_text非空且单行且只能为“读取并执行：<当前项目相对文件路径>”；已发出(含GUI_SENT/ACKED)、已取消、EMPTY和未知状态全部排除。
3. 对所有真实READY任务按 priority（小值先）→approved_at UTC时间→task_id排序，每次只分发**最前面一项**；缺少批准时间的旧版任务在人工验证不改变原任务的前提下用文件本身的批准时间；无法唯一排序则安全报 BLOCKED_QUEUE_UNVERIFIED，绝不编造排序。
4. 通过Computer Use根据任务 project_root **自动匹配**当前开发者工作区，软件品牌不重要。不同项目的工具忙/审批完全不影响目标。
5. 目标BUSY或WAITING_APPROVAL：不发送、不预填，保留READY，回执PENDING_BUSY/BLOCKED_USER_INPUT。不会在后台自动继续，也不自动跳过队首任务。未知或多个同项目候选无法证明唯一：只读再核查，仍不确定则保留READY+BLOCKED_PROJECT_COLLISION，不能随机选或反问用户选哪个软件。
6. CONTINUATION优先同项目原会话；INDEPENDENT/TEST_ONLY在同工作区开新会话。原输入框不可用只尝试一次，换同工作区新会话，避免十分钟反复键入失败。
7. **目标文本严格逐字来自send_text，一行**；不读/复制整个SDD至开发者聊天框。Computer Use真正点击Send、目视见已发送消息气泡才写GUI_SENT/SENT。回执记录真实app、workspace、会话、时间、UI证据；实际开发完成另核验，不和发送混淆。
8. 每次写状态前重读对应项目当前 task_id，不能覆盖云端刚写的新任务。严禁在项目真实代码/人工审批/付费/发布上擅自操作。

## 三项目现状（首次静态检查）
- ALW-001 当前 N03 的 `CURRENT_TASK.md` 已是 SENT，GUI 回执也存在，**绝不能重复发送**。
- P054/P066 未收到用户批准的实际开发任务，本次只登记 `EMPTY`，**禁止制造模拟 READY 任务来测试真实发送**。
- 所有项目的本地开发流程、ORCA/主开发者治理保持原样。转发只负责送达；不修改任何项目的开发者组织、Gate或业务代码。
- 不要把本文件视为一项待发任务。需要启用统一口令前，应由000的转发管家按治理流程把共享入口接入固定桌面GPT会话，本文件处于PILOT_STAGING_ONLY。

## 安全与后续
中央仓库000当前对本云端连接为只读；未来正式安装必须先由获写入授权的桌面管家在000下按管家统一规范合并、记录差分并测试，不能假称“已安装到000”。
可移植Skill候选 `skill/SKILL.md`，**只是候选草案**；依照000 Skill 管家中央 Skill 仓库与Skill Manager管理流程审查、入库、分发，不直接写 ~/.agents，也不擅自做第二套独立Skill仓库。
只在完成可控三项目状态校验与至少一次新的跨项目真实 GUI_SEND 后考虑封装私人 ChatGPT 插件；任何插件不能凭纯文本自动操控用户Mac GUI，真正发送仍由固定桌面GPT Computer Use执行。
