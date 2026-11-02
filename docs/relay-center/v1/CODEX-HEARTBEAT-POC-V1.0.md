# Codex 转发管家｜每5分钟 Heartbeat 试运行 V1.0
status: APPROVED_FOR_PILOT
scope: existing Codex relay-manager thread, NOT a new agent
owner: Codex 桌面端已配置好的「转发管家」
registry_source: 000-alw-个人偏好-电脑治理仓库-skill管理/转发管家/项目登记.json
governance_source: 000-alw-个人偏好-电脑治理仓库-skill管理/转发管家/说明.md
schedule: 5-minute thread automation

## 任务与执行顺序
用户已经明确授权试验 Codex 每5分钟自动唤醒检查云转桌收件箱，并仅在符合安全条件时自动GUI发送。这是现有转发管家的定时触发方式，不新建第二套管家、队列、MCP、后台常驻轮询进程。

(1) 先读000的官方转发管家说明、项目登记.json、AGENTS.md相关段落，核查当前项目收件箱与回执；不要将ALW-001中的旧PROJECTS.json（已标MIGRATED）当成真源。
(2) 在当前已配置的Codex转发管家会话，使用Codex原生「Thread Automation / heartbeat」建立每5分钟唤醒任务。确认Codex自动化界面中存在真实任务、下次运行时间和唯一任务ID；不要改为ChatGPT的每小时Automations，也不要每轮创建新worktree。若本机Codex不支持5分钟，先标BLOCKED_SCHEDULER并保留现有人工转发，不用假任务替代。
(3) 000现行v1.1规则的「不后台轮询，只在用户说转发才重试」与本次用户的定时试点授权冲突。由你作为已有转发管家，按000自身管家修改规范在原说明中做最小的v1.2例外修订，并在现有台账登记；人工“转发”入口保留不动。未实际创建Codex定时任务之前不要报告自动化已启用。
(4) 实际确认自动化唤醒时，既有Computer Use/GUI操作工具是否仍可调用。不得因定时唤醒就推断拥有跨APP GUI权限；不可使用CLI、API、AppleScript、JXA或模拟键鼠绕过000转发规则；不要将全局沙盒放开到Full Access。若GUI工具不可用，只开启READ_ONLY_MONITOR_ONLY，不假报已发送。

## 每轮 heartbeat 的准确操作
A. 从000唯一官方登记表读取登记项目，逐一重读各项目 docs/relay/DESKTOP_GPT_START_HERE.md、docs/relay/CURRENT_TASK.md、receipts/<task_id>.md；项目列表与路径以当轮真实登记为准。
B. 仅过滤status:READY、用户明确批准、instruction_file在当前项目内且存在、send_text严格为同一文件的单行「读取并执行：docs/plan/...」、task_id唯一且无GUI_SENT/SENT/ACKED回执的真实任务。排除EMPTY/CANCELLED/UNKNOWN与已发送任务。
C. 按 priority→approved_at→task_id选最前面一项，一次最多1条；缺字段或无法排序时BLOCKED_QUEUE_UNVERIFIED，不猜。P054仅投ORCA唯一Task Manager；P066遵守它原先的主开发者或ORCA治理模式。
D. 无READY：静默结束，不能写收件箱，运行记录记EMPTY_NO_TASK。目标BUSY/RUNNING/WAITING_APPROVAL：不抢占、不预填、不打断、不改投其他项目，保留READY；必要时记录PENDING_BUSY。
E. 目标确实空闲且工作区唯一、GUI能力真实可用：先查同任务有没有被手动“转发”抢先发送；只经原有Computer Use GUI在目标窗口真实发送一行send_text。为避免多个5分钟心跳并发，先以任务ID创建排它IN_FLIGHT记录且不得覆盖已有回执；如果发现未确认IN_FLIGHT，检查开发窗口证据，无法确定是否发出则BLOCKED_UNKNOWN_DELIVERY，不自动第二次发送。
F. GUI出现已发送消息气泡并进入执行态后，才记录GUI_SENT回执。修改CURRENT_TASK前再读一次核对同一个task_id，才标SENT。发现权限不足不能靠shell模拟鼠标或通过开发工具API偷偷发送，直接保留READY。
G. 同一故障连续3轮、定时触发异常或潜在重复：停止自动发送分支并报告一次，人工入口继续有效。其他无变化的空轮不在聊天中刷屏。不执行开发、QA、付费、发布、删除和修改其他项目代码。

## 三阶段的安全试运行
Phase A｜先完成2次真正的只读检查：第1次由当前会话立即运行，第2次由5分钟定时唤醒运行。预期（需当轮重新核实）ALW-001 N03 SENT、P054 EMPTY、P066 EMPTY，eligible_count=0；绝不能重复转发N03或人工制造READY假任务。
Phase B｜确认定时唤醒后可用的Computer Use及真实开发者窗口。仅在下一条真实已获批READY任务出现时进行1次自动GUI发送并核对回执；没有真实任务则标NOT_RUN而不是PASS。
Phase C｜B通过后才宣称无人值守自动投递PASS；连续观察至少6轮（30分钟）记录5分钟延迟、重叠、额度消耗和异常。定时误差不能当成精确到秒的SLA。

## 放到Codex定时任务中的提示词
你是已配置的Codex转发管家。每轮按000唯一官方登记表和现行转发管家规则现读全部登记项目收件箱/回执。无READY静默结束；目标BUSY不抢占；旧GUI_SENT绝不重发。唯一已批准READY且目标工作区空闲、Computer Use在本次定时唤醒确实可用时，用IN_FLIGHT排它避免并发后，经Computer Use发送一行send_text，目视成功后写GUI_SENT与SENT。禁止CLI/API/AppleScript模拟GUI，禁止越级ORCA和代用户审批。不能真实GUI投递就只读监控并报告READ_ONLY_MONITOR_ONLY。不要在空轮重复长篇反馈。

## 验收证据
需由Codex在000治理仓库现有落盘约定中记录：自动化ID、5分钟计划、至少2次实际心跳日志、真实GUI工具可用性、收件箱防重与项目工作区核验、若有真实任务则GUI发送气泡和同task_id回执。严格区分SCHEDULED、WAKEUP_VERIFIED、SCAN_PASS、GUI_AVAILABLE、GUI_SENT及DEVELOPER_STARTED。未经真实验证不得写PASS。
