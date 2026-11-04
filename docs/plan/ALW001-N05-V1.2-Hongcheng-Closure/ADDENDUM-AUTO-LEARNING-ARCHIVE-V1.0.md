# ALW-001 N05 V1.2｜自动学习资料归档与 AI 分类增量规范 V1.0

status: USER_APPROVED_AUTO_ARCHIVE_DIRECTION
approved_in_chat: 2026-11-03
relation: ADDENDUM_TO_APPROVED_N05_V1_2
delivery: SAME_EXISTING_STAGED_TASK_NOT_A_SEPARATE_RELAY_JOB
project: ALW-001 SocialMate
boundary: BACKEND_AND_STORAGE_ONLY_NO_NEW_LEARNING_TAB_OR_LEARNING_CENTER
source_of_truth: ORIGINAL_FILES_IMMUTABLE
user_operation: ZERO_DAILY_MANUAL_TRANSFER_OR_CLASSIFICATION
aws_new_budget: ZERO_UNTIL_EXPLICIT_APPROVAL

## 0｜用户已确认的业务定义

用户明确重申：不应要求他手动把手机记录下载到电脑、挪到指定文件夹、选择分类或粘贴到新管理系统；应该由手机已有自动导出机制和 Mac mini 自动化后台实现 **自动接收 → 保留原始数据 → AI/规则整理 → 分类索引 → 定期复盘**。初次设备配对、系统授权和隐私/付费选择可以是用户必须一次性完成的前置操作；日常不应依赖用户手工搬文件。

用户现阶段**不批准扩建完整学习中心**：不新增底部Tab、课程管理器、学习成绩看板、错题软件或新的公网页面。只是为未来功能做好可审计数据底座，继续优先完成正在进行的 N05 T5/T6（红城湖听本段/循环本段/听词组、中文朗读清理、真实资料、Android QA）。

此增量是本来已批准的 N05 V1.2 续篇，**不要新建第二主开发者、不重新执行已通过的 T0–T4、不修改公共 PWA 或 115 个基础地点**。

## 1｜跨项目实际核查：P016「懒得打字」自动导出

已通过 Mac Project Reader **直接读取 P016 真实源码**：
- 项目：`016-ing-懒得打字-安卓版本`；`app/src/main/java/com/landedazi/app/core/practice/PracticeAutoExport.kt` 与 `PracticeAutoExportWorker.kt`。
- 设计：Android WorkManager **每天当地时间22:00自动导出当天自测记录**（执行时刻允许系统漂移）＋每次进 App / 存入新自测时补跑；利用 SAF 系统目录权限存本机 Markdown。
- 同一 Wi‑Fi 时使用 NSD/Bonjour `_landedazi._tcp` 自动发现 Mac，经 `PUT /practice` 推送，Mac 接收器 `scripts/mac/export-receiver.py` 端口18791。
- 用户2026-10-04确认实际落点：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/学习资料/01-口语自测原始记录/`；不要改回较早的 `Documents/LanguageLearning/Inbox`。
- P016 `docs/QA_REPORT.md` AUTONIGHT：四种时间范围的真实LAN测试发送有记录、Mac落地成功；**22:00自然周期是否持续准确触发未证明**，本阶段不得宣称长期无人值守已PASS。
- **已发现可靠性和安全缺口**：
  1. `runOnce()` 中 `pushToMac()` 的 `Boolean` 返回值被忽略，随后直接 `markExported(...)`；Mac失败可能被错记为已导出，下一轮不会补传该场。用户不得承担手工修复。
  2. Mac Python 接收器在 `0.0.0.0:18791` 接受未鉴权的 **明文HTTP**，可写目标目录且同名覆盖；局域网不等于可信网络。不可把这个无鉴权接收器直接扩成包含真实聊天/个人档案的统一私有资料入口。
  3. 用户没有首次在App选定SAF导出目录时，`runOnce` 会直接返回；这个**一次性系统授权**可存在，但用户日常不应再次操作。
  4. 22:00漏跑后 next-day `today` 单日筛选可能漏补前一天，不等于可靠跨天续传。
- **P016项目本身只读**：ALW-001开发者不得擅自改写 P016 软件或更换当前装机版本。先设计兼容现有导出格式的安全接收/校验与监视；如P016需要修复上述逻辑，输出精确独立交接单给P016项目主管，须遵守其现有治理/授权，不跨项目直接动它。
- SocialMate N04已有的 `SessionArchive`/Android outbox/8781归档服务/Tailscale TLS 是另外一套可复用的安全投递实现，**比复用旧P016明文不鉴权接收器更适合真实私人聊天**。不得为了统一而让所有来源使用不安全HTTP。

## 2｜五类自动归档来源（不搬原文件，不重复造数据）

| 类别 | 数据来源 | 原始资料权威落点 | 加工产物 |
|---|---|---|---|
| `self_test` 懒得打字 | P016 手机上的自测结果 Markdown | `学习资料/01-口语自测原始记录/`（已存在） | 错误/目标表达/日期与阶段分析，标注无录音时不评价发音 |
| `course` 英语课程 | 已有或后续自动导入的课程文本/讲义/笔记 | `SocialMate-Data/Courses/` 为**拟增加分类**，不是谎称已有；未配置导入来源时空待用 | 课程章节、词汇和可复习表达，仅链接原课时 |
| `conversation` 真实沟通实战 | SocialMate 双麦ASR，用户明确同意保存的最终字幕及互动记录 | `~/Documents/SocialMate/Conversations/YYYY/MM/` 现有私有会话归档 | AI会后总结、待确认事实、表达改进；人物事实必须**经用户确认**才写People |
| `thought` 个人想法/翻译 | 海南私有地点、红城湖原文和其他个人想法 | `SocialMate-Data/PrivatePlaces/`、`SocialMate-Data/PlaceNotes/` 等实际目录；非地点想法沿用受限私有 `Inbox/` 并根据未来需求建分类 | 保留逐字原话，另有顺畅中文、英语A/B、词组、语义分段与版本 |
| `practice_review` GPT等口语练习 | ChatGPT练习复盘回贴、SocialMate练习、其他用户明确授权导出的复盘 | `SocialMate-Data/Practice/`（Sessions/Reviews）；已保存资料自动索引 | 通过/待复习、薄弱词组、下次目标、对应内容版本 |

**来源专用采集**：
- P016保持既有自动导出/局域网发送产品体验，但修复可靠性/安全后才可称端到端正式自动化。已经落到Mac的文件，ALW-001 后台自动纳入索引，不让用户再复制一次。
- SocialMate真实会话走已有安全归档（明确留存、手机outbox、断网后补传、MAC收件），不得自动录音或上传未经同意的朋友数据。
- 红城湖/私人地点写入Mac时直接触发索引，不再让用户手动另导一份。
- 英语课程现阶段**只提供轻量自动扫描/接收钩子**，没有实际课程来源或账号时不虚构已自动导入成功。
- GPT Voice与ChatGPT并无默认授权的自动对话历史读取能力；用户目前需在练习页面**一次粘贴回贴结果**，之后由Mac自动分析、归档与索引；不能把“自动整理”虚报为可静默读取ChatGPT语音记录。以后接可合法授权的导出/API时再升级来源适配。

## 3｜统一的非侵入式索引：原始资料 + 派生资料 + 练习弱项

在既有 `SocialMate-Data/` 下按规范新增小型 **`LearningArchive/`**（如 `index.jsonl`、`processed/`、`runs/`、`quarantine/`），应保持 .gitignore 不上传、目录0700/文件0600，**严格按现有数据库/后台服务中央规范在开发时确认最终目录名**。

**不把别处全部复制搬迁到LearningArchive。** 仅存可查询索引/处理状态；原始素材留在各原业务目录。最小记录字段：
- `materialId`（稳定且不依赖文件名）、`sourceType`（5类）、`sourceApp`、`sourceId`、`originalPathRef`（校验路径属于允许读根，不接受客户端任意绝对路径）、`originalSha256`、`createdAt`、`receivedAt`。
- `processingStatus` (received, indexed, normalized, ai_suggested, reviewed, failed)、`version`、`derivedPathRef`、`sourceRevision`、`practiceSessionRefs`、`personRefs`/ `placeRefs`（只有确实可证时关联）、`consentScope`、`lastErrorCode`、`retryAfter`。
- 重复导入同一个来源hash幂等；同名不同正文写新版本/冲突而非覆盖；原始文字、时间、原音/附件保留实际可用的原格式。音频/照片也只存合法来源引用与授权状态，不自动外传第三方。
- AI/规则加工的顺畅中文和英语A/B是**派生版本**，原文逐字保留；薄弱点只根据练习实证产生。不能仅因自测导出没有完整音频就臆测发音。

## 4｜真正无人手工搬运的运行方式

1. **自动接收**：现有应用自身事件（保存新记录、会话结束、P016导出抵达）先将原件可靠落盘；Mac后台有允许清单中的文件变更/增量扫描，不需要用户每天点击导入/分类。
2. **自动索引**：按5种源类型识别与入库，保留哈希、幂等、文件路径与接收回执。对于P016的旧文件，先用只读扫描兼容导入现有Mac文件；不能反向标记手机已成功上传。
3. **自动整理**：先本地规则归类/脱敏、去重、中文轻度去口水词，按来源和版本生成派生材料。只在用户已许可的数据类别、现有DeepSeek额度内允许云端AI翻译/归纳；若需要把真实会话/个人笔记发送第三方而未获得对应明确授权，应标记 `awaiting_consent` 而不是悄悄外发。AI不可改原文；人物事实仍需确认后再写。
4. **定期整理**：Mac mini 采用**现有项目受控后台服务/调度管理规范**新增一个轻量定时触发（建议每天低峰1轮，具体时刻由开发者根据现有任务错峰安排）+ 新数据事件处理，避免新建第二套常驻AI代理或无限循环消耗额度。失败有状态与有限重试，手机离线能存队列，恢复连接后继续；不静默丢数据。
5. **可观察性**：只记录条数、状态、哈希、耗时、source类型、错误代码/预算（不记录全量原文或令牌），在本地生成紧凑日报 `received / indexed / ai_suggested / awaiting_consent / failed / retry_pending`。通常不打扰用户，连续异常或有用户专属授权才一次性报告；不要每次都弹确认窗。
6. **导出与迁移**：原始MD+派生MD/JSON+index可按用户明确需求导出/备份，常规使用无需人工搬迁。备份要加密/权限收紧，不上传公开Git或公开海南PWA。

## 5｜增量开发任务与真实验收

**优先级**：先做 N05 V1.2 已确认的红城湖 T5/T6 真实播放与复盘闭环；此归档基础为**增量小任务，单开发者随后接续**，不得喧宾夺主或强行做新学习中心。

- A0 源核对：实读P016 `PracticeAutoExport.kt`/WorkManager/Receiver和现有SocialMate安全归档/Records/Practice；检查Git dirty/手机已装版本/用户真实数据、隐私规范和服务归属。
- A1 轻量目录/索引 schema：逐类扫描5种来源（课程无数据可报告NO_SOURCE），对至少一份既有P016原始MD、一份红城湖私有record、一份授权保存的会话/练习复盘进行只读索引；无需用户手动放进新目录。
- A2 安全接收兼容：Mac ingest应验证来源、鉴权/加密（或仅可信本机回环的安全代理）、大小上限、白名单、接收哈希、回执和重复幂等。P016旧HTTP不允许扩大用途；修复P016需通过独立项目批准派单，ALW001本轮先给可执行兼容方案/接口测试。
- A3 后台自动归类：新增可复用一次性批处理/受控定时；处理新数据与跨天补传，服务重启后恢复，重复扫描不重复索引/不覆盖原档；来源不适配时显式 NOT_RUN。
- A4 AI派生：已授权文本范围内，至少跑红城湖一个块与已匿名化的自测示例；生成顺畅中文、自然英A/B/表达与薄弱点标签的派生文件。云API超额/无同意时规则整理与 `awaiting_consent` 并存；不能说已由AI做完。
- A5 QA：同WiFi手机->Mac真实原始MD投递、服务重启/离线补传/重复上传/文件冲突/恶意文件名/未授权远端请求/账本0元边界；以真实代码日志和落盘SHA PASS/FAIL/NOT_RUN，**22:00定时自然触发如未观测到必须NOT_RUN**，不冒充。
- A6 交接：更新 HANDOFF/风险/QA，列出当前可自动、待用户一次性授权、需另项目修P016的部分，最后一次Human Gate。保持N05既有计划和公开PWA原样。

## 6｜交付边界与转发队列

本增量规范**归属于已经批准并排队的** `docs/plan/ALW001-N05-V1.2-Hongcheng-Closure/README.md`，开发者由这个同一入口顺序阅读本文件；不额外制造一个竞争中的READY任务。当前正式 `docs/relay/CURRENT_TASK.md` 指向 Amazon Polly `SM-ALW001-20261103-POLLY-ADOPT` 且READY，`RELAY-STAGED.md` 中的红城湖续任务仍为 `WAITING_PREVIOUS_READY_TASK`。两者都应保护，**禁止把未送达的文件写入说成GUI已投递**。只在旧任务确实发送或经用户明确变更队列后由独立转发员进行原计划的单条GUI接力。

## 验收最终判断

成功定义是：用户在手机自然产生日常学习记录后，Mac mini不需用户手工搬运/分类，后台能接收真实资料、保全逐字原件、单次和跨天恢复、按五类生成索引与派生材料、保留练习弱项和来源可追溯；原有生活/聊天功能正常。任何手机第三方初次授权、真实私人聊天AI外传、付费预算，仍遵守对应明确同意；不得为“完全自动”绕过权限和隐私。
