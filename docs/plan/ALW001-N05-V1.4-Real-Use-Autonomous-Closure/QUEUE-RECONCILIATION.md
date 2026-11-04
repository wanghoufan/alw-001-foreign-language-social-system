# QUEUE-RECONCILIATION｜旧队列与本次用户批准

approval: USER_REPLY_1_20261104_APPROVED_V14_AND_RECONCILE_QUEUE
new_task_id: SM-ALW001-20261104-N05-V14-REALUSE
gui_sent: false

截至核查，ALW-001唯一正式收件箱docs/relay/CURRENT_TASK.md指向SM-ALW001-20261103-POLLY-ADOPT，status READY；该任务真实回执NOT_SENT/BLOCKED_PROJECT_UNVERIFIED，从未证明GUI发送。本次不得把它伪记成GUI_SENT。V1.2/V1.3两个RELAY-STAGED也没有GUI发送证据。
但真实HANDOFF及V1.3 QA证实：原Amazon Polly选型、provider adapter、fake/缓存/权限闸和0预算代码已在其它主开发者工作中落地；V1.2/V1.3原主要开发内容也有真机报告通过。继续转发老计划会重做完成工作。真实AWS账号授权、收费和音质试听仍待用户单独批准；**清理旧派单不等于取消用户选择Amazon Polly**。
安全整理步骤：
1. 写入本V1.4开发包并回读，核对新的用户批准、完整README路径和单行send_text。
2. 重读旧CURRENT_TASK及旧receipt末尾，若状态发生变化或已有GUI_SENT，立即停止替换。
3. 对旧READY产生保留原始指针的审计快照与单独的CANCELLED_SUPERSEDED_WORK_ALREADY_IMPLEMENTED调度结论（只取消未发出的重复派工，不能声称已发送），保留老receipt和V1.2/V1.3历史文件。
4. 在独占确认旧任务未变后，允许本次用户批准的新V1.4覆盖官方CURRENT_TASK，状态READY，发送文本只为读取README的单行，不夹杂其它指示。新指针仍不是GUI发送。
5. 只有已运行且可唯一确认ALW-001开发者工作区IDLE，无审批阻塞，并经Computer Use真实点Send看到消息气泡后，才写GUI_SENT及把同taskId状态变SENT。否则维持READY/阻塞原因。不得启动关闭的软件。
6. 本地写计划/登记与GUI派发分开；没有Computer Use的会话应直接告知用户“READY未发送”。 用户后续发“转发”可由唯一桌面转发管家重新检查工作区并执行。

## 不可突破的边界
- 单一主开发者连续实施；只在用户专属登录、明确隐私/付费授权、最终真实Human Gate请用户介入。禁止重做N05 V1.3已经真机通过的19段混合语言播放器、20轮300项循环和GPT复盘。
- 不增加学习中心Tab、课程管理、公开PWA功能；不得改公开海南115地点/V1.4作品资料/他人已确认档案。原始逐字文本不可覆盖，派生版分层留版本。
- 禁止Git reset/clean、覆盖其他开发者dirty工作、盲杀服务、清除手机数据、自动commit/push/release。设备必须校验serial和安装签名，增量adb install -r。
- 真实AWS Polly预算仍为0，未经用户额外明确授权不调用真实Polly、不外传个人想法/聊天原文；DeepSeek和腾讯云现有1元闸不增加。不得把fake音频当Polly真人音质。
- P016独立项目只读交接、不擅自改源码/重启未鉴权18791；真实聊天留存需双方同意。服务仅走现有安全内网/Tailscale HTTPS与配对鉴权。
