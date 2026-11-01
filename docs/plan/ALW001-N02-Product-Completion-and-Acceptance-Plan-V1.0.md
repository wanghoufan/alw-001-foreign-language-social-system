# ALW-001 · N02 私人 Android 最后闭环与验收开发计划 V1.0

task_id: SM-ALW001-20261101-N02
approval: USER_APPROVED_ALL_P0_P1_P2_P3
approval_date: 2026-11-01
status: APPROVED_READY_TO_DISPATCH
project_root: /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
target_project: ALW-001
task_relation: CONTINUATION
conversation_route: SAME_CONVERSATION_PREFERRED
target_app_mode: AUTO_BY_WORKSPACE
human_gate: ONE_FINAL_GATE_AFTER_ALL_AUTONOMOUS_TASKS
scope: PRIVATE_ANDROID_APP_AND_LOCAL_ARCHIVE
created_at: 2026-11-01
owner_policy: same developer/workspace currently responsible for ALW-001, not a fixed application brand

## 0. 目标（必须作为一个连续任务完成）

在 **已存在的 SocialMate Android 0.5.4** 基础上，把“手机结束录音→查看本轮原文→复盘→人工确认→私人档案持久化→下次可查看”做成有真实设备证据的可用闭环；把“人物已确认事实→正式 People Markdown”接通；收紧隐私/权限并补齐弱网、深色模式和移动端验收。开发者连续做完 P0→P1→P2→P3 所有无需用户参与的事项，内部测试/Review/QA 不能变成人工停工点，**只在真正需要设备真人操作/授权时集中列一次清单，最后一次 Human Gate**。

优先原 N01 工作的 **同一开发工具 + ALW-001 同一工作区 + 同一开发会话** 继续；上下文过大或已关闭时才依据当前 handoff 在该工作区新建会话。桌面 GPT 转发员不负责写业务代码，只负责 Computer Use 实际投递。不得硬编码 CodeArts 或 WorkBuddy。

## 1. 最新真实起点；开工前必须增量核验

2026-11-01 云端只读已见：
- `CHANGELOG.md` 和 `socialmate-v1.2/QA.md` 有 **Android 0.5.4/versionCode 14** 深色系统下原生文字白字白底修复，真机 Note 11 页面文字已可读；这是较新进展，**不要再按0.5.3安排相同修复**。
- N01 的会后复盘 P0 功能已实现：`session-review.mjs`、`POST /v12/api/review`、`POST /v12/api/review/apply`、`archive-history.html`、`?session=` 深链、Android 0.5.3 “本轮原文与复盘”入口；复盘引擎 7/7、档案写入 6/6、profile+archive 10/10 定向测试；Web 浏览器与临时档案目录已测试。**不可再从零重造复盘模块**。
- 真人 ASR final → Android outbox → Tailscale HTTPS/WSS → Mac MD/JSON 已有验收；归档列表/原文已在 Note12T Pro WebView 验过。与本 N02 修改相关的回归需重新执行；历史验收不必机械重跑。
- 缺口：Android 真机“停止→本轮原文→复盘→勾选→确认保存→二次读取”完整操作仍 **NOT_RUN**；正式 `SocialMate-Data/People/<slug>/00-profile.md` 尚未与确认内容同步；会话历史手机内日期导出、断网/重启恢复及细节 UX 有剩余矩阵。
- 真实 BOYA 当前为 **MONO_MIX**，A/B均有正常信号；严格真人双人分离 QA 仍需两位真人。不能将 spk_0/spk_1 自动对应真实人物身份。
- 海南公开 PWA 已在 GitHub Pages 发布且仅限115地点，非本任务开发主线。用户明确取消“朋友清单回发”作为本轮必要验收，禁止重新引入或修改公开站。
- 腾讯 ASR 和 DeepSeek **各 1 元累计预算闸**保持；近期 DeepSeek 复盘真实调用累计约0.213634/1元，但所有金额须以**最新本机账本**为准，绝不重置。
- 仅 Git 差异状态是只读快照：2026-11-01 最新 `main...origin/main [ahead 5]`，存在 `.workbuddy/` 和 docs/relay/等未跟踪文件。不要以 Git clean/reset/checkout/rebase 破坏已有开发成果或转发文档。

**开工先检查** `~/.agents/AGENTS.md`、`git status`/`git diff`、`CHANGELOG.md`、`docs/handoff/HANDOFF.md`、`socialmate-v1.2/QA.md` 末尾、`docs/risks.md`、`docs/architecture-facts.md`、`android-poc/app/build.gradle`、`.workbuddy/memory/2026-11-01.md` 与 N01 开发者会话最新输出。比对文件更新时间与实测证据，**已完成的直接验收跳过，真实未完成的才开发**。如已有同工作区 Agent 正写同一文件，不并发覆盖；先做不冲突的测试或新模块。

## P0｜0.5.4 真机“录音→复盘→确认保存”完整闭环

### P0.1 真机/页面联通
- 使用已有授权且项目绑定的设备配置，显式指定设备序列号，不盲选/同时操作多部手机；保持其他手机用户数据。
- 按真实流程：打开 App → 知情录音同意 + 单独留存同意 → 产生真实 final → 停止录音 → 点击“本轮原文与复盘”→ WebView 跳到 `/v12/history?session=<真实ID>` → 原文逐字可见 → 生成本地复盘/经单独授权的AI复盘 → 逐条编辑/勾选/归属 → 确认保存 → 重新打开“关于我”和对应档案，验证持久化。
- 设备没有真人/麦克风授权时，使用**经许可的隔离测试会话与虚构样本**做 Browser+Android WebView 自动化，写出真实操作证据，不冒称“真人全链PASS”；最后列出唯一不可代办真机步骤。
- 原文不得自动trim、合成、替换纠错文本；候选事实应带来源会话/段号，未知说话人保持未知；模型无同意 0 外部请求。
- 0 final、无token、页面打不开、网络断开、AI额度不足、无权限、取消/重复确认均有友好错误/重试，不得隐式写资料。手工编辑的候选必须保留与真实原文的可追溯来源，不能把编辑文本当原始逐字记录。

### P0.2 数据写入正确性
- 核实 `profile-store.mjs` 的 `applyProfileCandidates`：无confirm→拒绝；仅明确勾选项入库；候选作者/人物归属需要用户主动选择；`sessionId + segmentIndex + fingerprint` 幂等，重复点按或刷新不重复。
- 要做服务端边界检查：客户端的 `confirm:true` 不能代表会话内容可靠，必须检验所引用 sessionId 与源段号确实存在、该操作者已授权访问；不以可伪造的传参自动关联实际人物；现有确认流不得绕过。允许编辑候选但单独存修订文本及 source ref。
- 保留 `SocialMate-Data/Profile/current.json/.md` 与归档原文的隔离；临时/自动化测试优先用独立测试目录与虚构人物；**不向真实用户档案写测试事实**。

**P0验收：** APP UI 完整可点；操作证据包含设备、APK版本、真实/合成类型、原文session ID脱敏引用、记录前后快照/哈希、用户确认条件；不能只靠单元测试判PASS。

## P1｜正式 People Markdown 人物资料的安全同步

### P1.1 先对齐既有真实数据契约
- 阅读 `SocialMate-Data/People/_template/00-profile.md`、既有正式 `People/<slug>/00-profile.md` 档案、`SocialMate-Data/00-README.md`、现有 review/confirmation API，不另外搞第二个人物身份体系。
- 已有 Profile 是私有结构化快照；正式 People 为用户编辑的 Markdown 主档。确定**确认事实的单向安全写入与冲突规则**：未确认不写；仅处理用户明确勾选并把事实归属于指定人物的条目；用户未选择人物或身份不明时留在待确认而不是随便创建人。
- 目标人物应由已有稳定personId/slug或用户显式选中身份绑定；显示名同名不意味着同一人，不能用speaker ID识别人物，防止slug碰撞及目录穿越。

### P1.2 实现兼容且防丢失的写入
- 在用户确认后，把新增事实合并到既有 People Markdown 合适的语义章节（兴趣、工作/学习、共同点、后续话题等）；尽量保留原 front matter、人工手改段落、排序与原有历史。
- 每条新增事实记录来源的 sessionId、段号、修改时间和确认者，且不会把原始私人录音正文整篇复制进人物档案。去重、追加、幂等、并发写冲突保护、失败回滚/备份/原子替换、权限(0600)均要测试。
- 不得根据 AI 判断擅自改写正式人物资料，不替用户批准创建新人档案、人物合并或覆盖。所有私有数据不可部署公网/进Git/公开PWA。
- 若与 Profile 已确认状态同步，避免写入一端成功另一端失败导致虚假“已保存”；明确事务/补偿及失败重试、结果反馈，不要重复造记录。

**P1验收：** 虚构人物 A 已确认 → 仅A的正式Markdown得到一条正确归类的新事实、B不变；重复保存不新增；未知身份无写入；包含人工编辑的既有文件不被覆盖；断电/权限错误有一致可恢复状态；测试后清理**仅本轮创建的临时测试目录**，不得动真实档案。

## P2｜稳定性、安全、私人数据权限

- Android前后台、锁屏、退出重开、Wi-Fi/移动数据切换、Mac私有服务重启/断线恢复，验证 ASR连接状态、停止录音、断网 outbox 自动补传、历史列表与复盘失败重试。没有实际可控设备时先覆盖代码/模拟网络并标 NOT_RUN。
- 重查 Mac 归档/人物/Profile 文件权限：`current.json`为0600已有记录，但曾出现 `current.md` 为0644，应该改为 **0600** 并验证已有已授权文件的权限收紧（不改正文、不触碰与本项目无关目录）。临时文件也是0600；私有路径父目录尽可能0700。
- 保留录音、原文留存、云端文字传输三重独立同意；必须阻止无token访问、越权会话获取、目录穿越、WebView非HTTPS错误绕过、将原文写进公开PWA/API日志/提交内容。
- 保护 `/v12/api/review`、`/apply` 端点的鉴权、Origin/CSRF、重放及限流；真实AI计费只在单独同意、预算内进行；不能关闭TLS验签、不能改大1元预算/清账本。
- 验证服务重启和手机重试时数据不会丢、不会创建多份档案；错误界面清楚、可恢复。

**P2验收：** 无授权0私人写入/0模型请求；未授权token返回401/403；坏证书拒绝；离线队列恢复后最终一次投递；权限实测正确，无敏感信息提交/公开。

## P3｜真机可用性与最终QA，发布前收口

- 以最新构建基线 **0.5.4** 开始，检查 Android 录音页/复盘页/人物页按钮可点、状态清楚、文字大小、软键盘、横屏、无横向滚动、正常返回、中文/英文排版及浅色默认/深色可读。系统暗色时原生已“强制浅色”作为当前修复策略；不要无需求重做全局深色设计，但核验 WebView 自身深/浅切换与一致性。
- 真机优先 Redmi Note11/Note12T Pro 已有条件下能自动完成的检查；用户朋友的 OPPO 原生浏览器/iPhone Safari 缺设备就标 NOT_RUN，本轮公开PWA无需再开发，清单回发无需再验收。
- 两位真人同时说话的BOYA聚类有效性作为“需用户在场真人验收”，不阻塞 P0-P3 其它工作；真实身份仍手工确认。
- 对修改影响范围重新运行 `node --test`、`bash socialmate-v1.2/verify-v040.sh`（核查 stage1b 输出）、Gradle构建、真机保留数据安装和截图。保留真实构建日志、APK `versionName/versionCode/SHA-256`；若版本号已有新变化，**以现有最新代码和实测为准，不能降版或覆盖**。
- 结果按 PASS / PARTIAL / NOT_RUN / BLOCKED 汇总，不把模拟/截图/Android构建当作真人会话、双真人或所有手机厂商通过。更新 `socialmate-v1.2/QA.md`、`docs/handoff/HANDOFF.md`、`CHANGELOG.md`，最后给用户能够照手机实测的**简短点击步骤**。

**P3验收：** 改动范围测试真实全绿或有清楚阻塞；最新APK可启动、无数据丢失、测试证据留存；所有不可代办项目只在最终 Human Gate 一次性列出。

## 2. 严格禁止与环境限制

1. 不重做已经通过的 Android录音/Tencent ASR/原文归档/Tailscale HTTPS/AI接话/公开PWA。禁止把“朋友清单回发”重新纳入必须完成事项。
2. 不做无关 UI/UX 全面重构，不加新的底部一级Tab、不加多余审批Gate、身份认证/人物社交网络或公开数据库。
3. 不执行 git clean/reset/强制推送/擅自push/deploy；不动 DockerData/DockerBackups、不杀不属于本项目的进程、不泄露 keys；不重复覆盖并行开发者文件。
4. 录音及私有身份相关真实动作需既有同意；无用户允许不创建正式好友档案、不替用户点击确认写入测试人物、不提交私人数据。
5. Android使用已存在的设备目标锁/正确ADB serial；不能跨设备误装、清除App数据或切手机权限。仍需真人动作时先做无需真人的所有子任务。
6. 当前计划未要求公开发布、收费、外部账号、域名DNS或新API Key。需用户介入的只有无法代办的设备授权、真实对话、人工确认和最终验收，集中呈报，不中途反复请示。

## 3. 主开发者执行提示词（收到后连续实施）

你已经收到经用户批准的 ALW-001 N02 正式任务；只在正确工作区开发。先对照最新源码/WorkBuddy历史/N01产出进行差分排雷，**0.5.4 深色字不可见已修复、P0复盘引擎已实现，不能重做**。按 P0→P1→P2→P3 持续推进直到所有无需用户参与的开发、QA和修复都完成，内部 Task/Review/QA节点完成后自动继续。每步保留简洁可核验的代码、测试和UI证据；遇到常规错误自行修复；硬件/真人不可用不阻塞其它步骤。最终仅给一份包含APK版本/哈希、真机结果、Profile与People权限/幂等、最终待用户事项的总结。

开发者如果发现本计划任一项在收到前已被执行，检查真实运行证据，跳过已通过内容，并继续剩余任务。**不要把旧 N01 或其他项目的指令再次执行。**

## 4. 转发规则与回执

唯一任务入口：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/CURRENT_TASK.md`
桌面 GPT 规则：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/relay/DESKTOP_GPT_START_HERE.md`（V1.5）
本任务文件：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N02-Product-Completion-and-Acceptance-Plan-V1.0.md`

**路由：** AUTO_BY_WORKSPACE：识别唯一真正负责 ALW-001 的当前开发者工具及项目路径（无固定 CodeArts/WorkBuddy）；旧 N01 由用户在 WorkBuddy 手动启动过，**本 N02 是该工作的 CONTINUATION，优先该项目原会话**。若目标仍 RUNNING/WAITING_APPROVAL，则保持READY并在本地回执标记PENDING_BUSY，不终止旧任务；若空闲则用Computer Use实际点击发送、目视确认后才记GUI_SENT。若 WorkBuddy等其它工具在其它项目忙碌，不能阻塞本项目。项目多窗口时以项目路径与真实运行活动排除，不询问用户“你选谁”；若同项目真实冲突且无法证明目标，安全暂停并记录证据。
