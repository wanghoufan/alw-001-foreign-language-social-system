# P016「懒得打字」→ ALW-001 安全自动投递 · 跨项目转交材料

> 出具方：ALW-001「SocialMate」N05 V1.4 · T4（P1）
> 出具日期：2026-11-04
> 上游素材：`docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t3-t4/P016-HANDOFF.md`
> 被查项目：`/Users/zzymima0000/Developer/coding/1.Active/016-ing-懒得打字-安卓版本`（HEAD `8257a71`，工作树仅 docs 类未提交改动）
> 核查方式：**只读**读码 + 本机只读探测（未修改、未重启、未写入 P016 任何文件，未写 ALW 落点目录）
> 读者：P016 项目主管（本材料是待办与验收合同，不是实现指令）

---

## 0. 编号对照（先看这一节，避免与 V1.3 文档串号）

V1.3 的 `P016-HANDOFF.md` 用 D1–D4 指「投递状态机 / 跨天 / 接收器 / 定时」；本 V1.4 转交材料按 T4 任务书重排为「接收器 / 投递状态机 / 跨天 / 定时」。**同一批缺陷，编号不同**：

| 本文件 | V1.3 编号 | 缺陷一句话 |
|---|---|---|
| D1 | V1.3-D3 | 18791 明文 HTTP、无鉴权、监听全接口 |
| D2 | V1.3-D1 | `pushToMac` 返回值被丢弃，失败仍标「已导出」 |
| D3 | V1.3-D2 | 导出范围固定「今天」，跨天不补传 |
| D4 | V1.3-D4 | 22:00 自然调度无真机时序证据，且周期任务会漂移 |

**与 V1.3 记录的实际差异（本轮核实结论，以此为准）**

1. **落点计数变了，但不是好消息**：V1.3 记录 `self_test=0`；当前索引 `self_test=1`，但唯一条目是 QA fixture（`archive_inbox:self_test/20261103/c81046f4-qa-fixture.md`，`sourceId=aabbccddeeff`），**不是** P016 目录来的真实记录。P016 真实收件仍为 **0 个文件**（`学习资料/01-口语自测原始记录/` 为空）。
2. **V1.3 对"同名覆盖"的描述偏重**：攻击者要覆盖**某个已存在**记录，必须知道该文件名的 8 位摘要（随内容变化，不可预测）；真正零门槛的是**任意新建/污染**记录目录，以及伪造一条看似真实的记录。风险等级不降（仍是可写），但修复优先级判断应按「未授权写入 + 伪造」而非「随手覆盖」。
3. **新增证据**：`app/src/main/AndroidManifest.xml:17` 全局 `android:usesCleartextTraffic="true"`——明文放行不限于 18791 这一条链路，属 D1 的放大项。
4. **新增证据**：ALW 侧并没有可供 P016 投递 `self_test` 的 HTTP 入口（详见 §3.0）。C1–C4 因此**不能**设计成「P016 打到 ALW 的 8781」，只能设计成「P016 自己的接收器把文件写进 ALW 的落点目录」。
5. **源码未变**：`PracticeAutoExport.kt` / `PracticeAutoExportWorker.kt` / `PracticeExport.kt` / `scripts/mac/export-receiver.py` 最后修改均为 **2026-10-04**，故 V1.3 的代码级结论在 2026-11-04 仍然成立（无修复痕迹）。运行副本与仓库 sha256 一致：`1d067cd1…f483b93`。

---

## 1. 背景与边界

**背景**：P016 每天 22:00（WorkManager）把自测学习记录导成 `.md`，经局域网 PUT 到 Mac 上的 18791 接收器，接收器落到 ALW-001 项目目录 `学习资料/01-口语自测原始记录/`，ALW 的学习归档 worker 扫描该目录、分类为 `self_test`、建索引与派生文件。这条链路目前**代码已通、真实数据为零、安全未加固**。

**ALW 侧的责任范围（明确收窄）**

| ALW 做 | ALW 不做 |
|---|---|
| 提供落点目录，只读兼容接收（不校验 P016 的传输方式，文件出现即视为投递结果） | 不实现、不代理、不加固 P016 的 18791 接收器 |
| `self_test` 文件落地后的分类、哈希、去重、派生、索引（`learning-archive.mjs`） | 不向 P016 提供任何写入回执/ACK 通道 |
| 用 `runs/*.json`、`index.jsonl` 输出可核对的归档回执 | 不把 18791 或该目录扩成私人聊天/个人档案的统一入口 |
| 在真实证据到齐前，把 P01602 保持 **NOT_RUN** | 不替 P016 决定修复方案、不代改其源码 |

**P016 侧的责任范围**：D1–D4 的修复方案、工作量、排期、是否采纳，**由 P016 项目自行批准**；ALW 只给缺陷事实、期望语义与联合验收条件。本材料落地前，ALW 不会修改 P016 任何文件、不重启其 18791 服务。

---

## 2. 缺陷 D1–D4

### D1 — 18791 明文 HTTP、无鉴权、监听所有网卡

| 项 | 内容 |
|---|---|
| **现象** | Mac 端接收器以明文 HTTP 监听 `0.0.0.0:18791`，无令牌、无 TLS、无来源校验、无内容校验；同网段或已登录 Tailscale 的任何设备都能向用户原始记录目录写文件；进程还用 `dns-sd` 主动广播服务。 |
| **证据位置** | `scripts/mac/export-receiver.py:59` `ThreadingTCPServer(("0.0.0.0", PORT), Receiver)`；`:18` `PORT = 18791`；`:24-46` `do_PUT` 无任何鉴权分支；`:20` 唯一护栏是文件名正则；`:42-43` 直接 `open(...,"wb")` 写入；`:48` `log_message` 全静默；`:55` `dns-sd -R landedazi-mac _landedazi._tcp local 18791`；`:5-6` 自述「仅局域网明文 HTTP」。手机侧 `app/src/main/java/com/landedazi/app/core/practice/PracticeAutoExport.kt:99` 用 `http://$endpoint/practice` 明文投递；`app/src/main/AndroidManifest.xml:17` 全局 `usesCleartextTraffic="true"`。 |
| **本机实测（只读/负向，未写盘）** | `lsof -nP -iTCP:18791 -sTCP:LISTEN` → `Python 21963 … TCP *:18791 (LISTEN)`（全接口，pid 21963，起于 2026-11-02）；本机网卡 `192.168.31.61`（LAN）与 `100.125.100.15`（Tailscale）都在监听面内；`dns-sd -R landedazi-mac …` 进程 21964 在广播；`PUT /practice` 带 `X-Filename: probe.txt` → **400**（说明请求**在无任何凭证的情况下被业务逻辑处理**）；`GET /practice` → **501**（只实现 PUT）。落点目录在探测前后均为 **0 个文件**（未产生副作用）。 |
| **影响** | 用户自测原文（含中文意图、英文尝试、学习重点）可被未授权写入/替换/污染；伪造一条 `学习记录 …md` 会被 ALW 当真实学习数据入库并出现在学习档案里（ALW 侧无法分辨真伪，见 §4）。同机明文也意味着凭证/内容可被同网段嗅探。 |
| **建议修复方向（供 P016 决策，非指令）** | ① 绑定地址可配置，默认 `127.0.0.1` 或明确 LAN 地址，取消 `0.0.0.0`；② 配对期生成共享密钥，App 存 Keystore、Mac 存 `0600` 文件，请求头 `X-Ldz-Token` 校验不过 **401 且不落盘**；③ 至少对 body 做 HMAC（`X-Ldz-Signature`），理想是 HTTPS；④ 强制 `Content-Type: text/markdown` + 正文结构校验（必须含 `schema_version: 1` 与 `export_id:` 小写 hex）；⑤ `log_message` 改为只记状态码/文件名摘要（不记正文）；⑥ 若改 HTTPS/证书，需处理 `usesCleartextTraffic` 收窄，避免为一条链路全局放行。 |
| **验收方式** | 见 §3 C4 与 §5 的 E2：无令牌 401 且目录文件数不变；错令牌 401；合规令牌 200 且落 1 个文件；`lsof` 不再出现 `*:18791`（或仅在同时满足 401 的前提下保留）；`403/401` 路径均无写盘。 |

### D2 — `pushToMac` 失败仍标「已送达」，无失败补传

| 项 | 内容 |
|---|---|
| **现象** | `pushToMac` 返回 `Boolean`，但调用方完全忽略返回值，紧接着无条件把场次标记为已导出；下一轮 `pending` 为空直接 `return`，该场次**永不再推送**。注释声称「失败下轮重试」，与实现相反。 |
| **证据位置** | `PracticeAutoExport.kt:61` `withContext(Dispatchers.IO) { pushToMac(context, export.filename, export.markdown) } // best-effort…下轮重试`（未接收返回值）；`:62` `repo.markExported(pending.map { it.id }, System.currentTimeMillis())`（无条件）；`:57` `if (pending.isEmpty()) return`；`:91` `internal fun pushToMac(...): Boolean`；`:95` 未发现服务 `return false`；`:102` `it.isSuccessful`；`:105-108` 任何异常吞掉 `return false`。状态机无 `deliveredAt`/失败原因字段。 |
| **影响** | Mac 关机、接收器未启动、NSD 解析失败、HTTP 4xx/5xx、超时——全部表现为「用户以为已备份，实际 Mac 侧没有文件，且手机不会再试」。属**静默数据丢失**，用户无任何提示。也导致 `PracticeAutoExportWorker.doWork()` 抛错才 `Result.retry()` 的机制形同虚设（`PracticeAutoExportWorker.kt:19-24`）。 |
| **建议修复方向** | ① 投递结果进入状态机：仅成功才写 `exportedAt`（或新增 `deliveredAt`/`deliveryState`），失败保持待投递；② 待导出集合改为「未投递」而不是「有导出过」；③ 限制重试次数 + 退避，并在 App 内给出可读状态（如「Mac 未连接，3 条待同步」），不得无限静默；④ 区分「已写手机 SAF」与「已送 Mac」两个阶段，避免二者被一个 `exportedAt` 混同；⑤ 日志保留结果布尔与错误类别（不含正文）。 |
| **验收方式** | 见 §3 C3 与 §5 E3：Mac 不可达时 `exportedAt/deliveredAt` 不被写；恢复后仍会自动重推；成功后才落状态；UI/日志有可读失败原因。可单测（当前 `PracticeAutoExportDelayTest.kt` 只覆盖了 `nextNightlyDelay` 三个用例，未覆盖状态机）。 |

### D3 — 只导出「当天」，无法跨天补传

| 项 | 内容 |
|---|---|
| **现象** | 待导出范围固定为「今天 00:00 → 明天 00:00」，与「是否已投递」无关；23:5x 产生的场次次日不在范围内，永不导出。文件名把学习区间写死成单日，跨天批次无法表达真实区间。同一自然日内容变化会因 digest 变化生成**新文件名**，而非覆盖。 |
| **证据位置** | `PracticeAutoExport.kt:53` `val today = LocalDate.now(zone)`；`:54` `customPracticeDateRange(today, today, zone)`；`:56` `all.filter { range.contains(it.learnedAt) && it.exportedAt == null }`；`PracticeExport.kt:22` `selected = sessions.filter { range.contains(it.learnedAt) }`；`:45` digest 输入含 `range.start/range.endExclusive/body`；`:49` 文件名 `"学习记录 ${date(now)} - ${date(range.start)} 至 ${date(range.endExclusive-1)} - ${digest.take(8)}.md"`；`:46` front-matter `period_start/period_end` 取该单日区间。 |
| **影响** | ① 22:00 后才练习的场次永久丢失（最常见的使用时刻恰恰在晚间）；② 出差/关机数日后回来，历史未投递记录不会补；③ 即使补传，文件名与 `period_start/period_end` 表达不了真实学习区间，ALW 侧按 `exported_at` 建 `createdAt`，时间线会失真；④ 同日二次导出产生两份内容不同、名字不同的文件（`digest` 含 body），ALW 会按「不同 `export_id`」各建一条索引（见 §3 幂等规则），与「同一天只有一份」的用户预期不一致。 |
| **建议修复方向** | ① 待导出集合改为 `exportedAt == null`（或 `deliveredAt == null`），与 `learnedAt` 落在哪天无关；② 文件名/`period_start/end` 取该批次真实 `min(learnedAt) … max(learnedAt)`；③ 明确「同日多次导出」语义：要么合并为一份（同 `export_id`、内容更新→ALW 记 version+1），要么在文件名区分序号并由 ALW 侧按 `export_id` 去重（当前 ALW 已能做到「同内容不重复、异内容多版本」）；④ 跨天补传时的文件名正则同步放宽（当前 P016 正则已支持 `- A 至 B` 段，但代码从不生成该形态，属未启用分支）。 |
| **验收方式** | 见 §3 C1/C3 与 §5 E4：昨日 23:5x 未投递场次次日仍被导出；文件名区间 = 真实 `min…max`；ALW 索引 `createdAt` 取自 `exported_at`，不取「今天」；同一 `export_id` 重复投递不新增条目。 |

### D4 — 22:00 自然调度未验证（且周期任务会漂移）

| 项 | 内容 |
|---|---|
| **现象** | 22:00 任务只有纯函数单测，**无真机自然触发证据**；`KEEP` + 一次性 `initialDelay` 意味着首轮排在 22:00，之后由 Doze/重启/厂商后台策略漂移，不会重新对齐；`CATCHUP` 单次任务 `REPLACE` 只能补「今天」。工作树/落点目录均无任何真实产出。 |
| **证据位置** | `PracticeAutoExportWorker.kt:33-37` `nextNightlyDelay(...)` → `enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP, PeriodicWorkRequestBuilder(1, DAYS).setInitialDelay(delayMs))`；`:38-39` `enqueueUniqueWork(CATCHUP, ExistingWorkPolicy.REPLACE, OneTime…)`；触发点仅两处：`LandedaziApp.kt:28`（进 App）、`SessionController.kt:1149`（新自测落库）；测试仅 `app/src/test/.../PracticeAutoExportDelayTest.kt:13-29`（三个延时断言，无 WorkManager 集成）。运行证据：落点目录 `学习资料/01-口语自测原始记录/` 在 2026-11-04 07:5x 仍为 **0 个文件**，索引中无来自该目录的 `self_test` 条目。 |
| **影响** | 「每晚自动备份」这一产品承诺目前**没有任何证据**；用户若从不手动进 App，无法确认 22:00 是否真跑过。同时即使跑过，也可能落在 23:10 或次日 01:00（Doze/省电策略），与用户认知不符。 |
| **建议修复方向** | ① 每次 `schedule()` 重新计算到下一个 22:00 的延迟（或改为「每日固定窗口 + 强制 catch-up」，用 `APPEND_OR_REPLACE` 或到期重排），避免永久漂移；② 记录最近一次执行时间/结果（可读，不依赖 adb）；③ 投递失败与调度失败分开上报；④ 说明强停/省电白名单对 WorkManager 的影响，并在 UI 或日志给出「下次计划时间」。 |
| **验收方式** | 见 §5 E1（P01602 最小证据集）：真机静置一夜、不手动点，22:00–22:30 内落点新增当日文件，并附 `dumpsys jobscheduler` 中 `practice_auto_export_daily` 的 `lastRunTime`/`nextRunTime` 与系统时间证据。**无此证据一律 NOT_RUN。** |

---

## 3. C1–C4 联合接口合同（与 ALW 现有实现逐条对齐）

### 3.0 先说清一个事实：ALW 没有 `self_test` 的 HTTP 入口

核查 `socialmate-prototype/ai-gateway/archive-receiver.mjs` 全部 200 行后确认：ALW 的 HTTP 接收端（`127.0.0.1:8781`）**只服务对话 JSON 归档**（`POST /api/archive/session` → `saveSession`），**不接受**、也不会转存 `self_test` 的 `.md`。`self_test` 的唯一入口是**文件系统目录**。

因此本合同的形态是：**P016 自己的接收器（18791）负责"投递与鉴权"，ALW 只负责"落点 + 索引"**。不能把 C1–C4 写成「P016 调 ALW 接口」，也不要为了"看起来联动"去改 ALW 的 8781。

### 3.1 落点与文件级约束（ALW 侧真实实现）

| 项 | 事实 | 出处 |
|---|---|---|
| 落点目录 | `<ALW项目根>/学习资料/01-口语自测原始记录/`（已 gitignore，`drwxr-xr-x`，当前 0 文件） | `learning-archive.mjs:120`；`.gitignore:41` |
| 归类规则 | 该根下 `rel.endsWith(".md") → "self_test"`，其他扩展名忽略 | `learning-archive.mjs:122` |
| 来源标记 | `sourceApp = "p016_landedazi"`（索引里可据此区分 P016 真实来源与 QA fixture 的 `archive_inbox`） | `learning-archive.mjs:121` |
| 允许扩展名 | `.md / .txt / .json / .jsonl`（但 `self_test` 只认 `.md`） | `learning-archive.mjs:27` |
| 单文件大小 | `0 < size ≤ 5 * 1024 * 1024`，超限 **quarantine**（`FILE_TOO_LARGE`），空文件 `EMPTY_FILE` | `learning-archive.mjs:24,590-597` |
| 内容类型 | 必须 UTF-8 文本；二进制判定命中 → `BINARY_CONTENT` quarantine | `learning-archive.mjs:76,599-603` |
| 路径安全 | 符号链接跳过（`SYMLINK_SKIPPED`）；realpath 逃逸根目录 → `PATH_ESCAPE` | `learning-archive.mjs:689-714` |
| 命名 | ALW **不校验**文件名；仅当正文缺 `exported_at` 时，用文件名中第一个 `YYYY-MM-DD` 兜底 `createdAt` | `learning-archive.mjs:107-112,563` |

### 3.2 解析依赖的头部字段（P016 现有格式已兼容，不需改格式）

`learning-archive.mjs:559-570` 对 `self_test` 只读两项，加正文分节：

- `export_id:` 必须匹配 `^export_id:\s*([0-9a-f]{8,})$`（**小写 hex、行首、≥8 位**）→ 作为 `sourceId`（去重键）
- `exported_at:` → `createdAt`（`pickTime` 解析 ISO8601）
- 正文按 `^## Session ` 切段，段内取 `### 中文意图 / AI 参考表达 / 我的英文尝试 / AI 对比 / 学习重点`（`learning-archive.mjs:214-246`）

P016 `PracticeExport.kt:46` 生成的 front-matter（`schema_version/type/export_id/exported_at/period_start/period_end/session_count/target_language`）**完全满足**，`export_id` 是 64 位小写 sha256，正则可命中。**风险点只有一个**：若将来把 digest 改成大写或加前缀，`export_id` 正则失配 → `sourceId` 退化为文件名 → 去重键随文件名漂移。这条要写进 P016 的改动守则。

### 3.3 幂等与版本（ALW 已实现，不需要 P016 额外配合）

- `logicalId = sha16("self_test|" + sourceId)`；`materialId = sha16("self_test|" + sourceId + "|" + sha256(bytes))`（`learning-archive.mjs:615-617`）
- 同 `export_id` + 同字节 → `unchanged`，**不新增条目**（`:619-621`）
- 同 `export_id` + 异字节 → 新 `materialId`，`version = max+1`，**原件不被覆盖**（`:622-626,640`）
- 异 `export_id` → 独立条目
- **revision 冲突（409）只存在于对话 API**（`archive-receiver.mjs:186` → `ARCHIVE_REVISION_CONFLICT`，`conversation-archive.mjs:159-201`），`self_test` 文件路径 `sourceRevision = null`，**不涉及 409**

### 3.4 鉴权与返回码（分清两侧，别混用）

| 侧 | 端口/传输 | 鉴权 | 大小上限 | 返回码 |
|---|---|---|---|---|
| P016 接收器（现状） | `0.0.0.0:18791`，明文 HTTP `PUT /practice` | **无** | 5MB（`export-receiver.py:19`） | 200 / 400 文件名 / 404 路径 / 413 超限；GET → 501 |
| P016 接收器（目标） | 可配置绑定，明文+token 或 HTTPS | `X-Ldz-Token`（+ `X-Ldz-Signature` 可选），不匹配 401 不落盘 | 5MB | 200 `{ok,duplicate}` / 400 / 401 / 413 / 415 |
| ALW 对话接收端（**与 P016 无关**） | `127.0.0.1:8781` | `X-Archive-Token`，启动强制 ≥24 字符否则 `exit 78`（`archive-receiver.mjs:22-25,42-52`） | 512KB（`:20`） | 200 duplicate / 201 created / 400 / 401 / 404 / 409 / 413 |
| ALW 落点目录（`self_test` 的唯一通道） | 文件系统 | **无**（谁写进来就认谁） | 5MB/文件 | 无返回值；结果只体现在 `LearningArchive/runs/*.json` |

本机实测（2026-11-04，只读/负向）：`127.0.0.1:8781` 监听中（pid 92317）；`GET /health` → **200**（免鉴权）；`POST /api/archive/session` 无令牌 → **401**。

### 3.5 C1–C4 用例合同（P016 投递端 × ALW 收件端）

> 统一前提：P016 侧已按 D1 加鉴权、按 D2 让投递结果进入状态机。C1/C3/C4 的"通过"由 **两侧证据** 共同构成；ALW 只能被动观察落点与索引。

| 用例 | 执行方 | 输入 | 通过条件（两侧） | ALW 侧可核对物 |
|---|---|---|---|---|
| **C1 正常投递闭环** | P016 | Mac 起加固后的接收器；手机同 LAN 产生 1 场自测并触发投递 | P016：HTTP 200；ALW：落点出现 `学习记录 …md`（1 个），`self_test` 索引 +1，`originalSha256` 可由文件重算一致，`sourceApp=p016_landedazi` | `LearningArchive/runs/<runId>.json` 中 `indexedBySource.self_test` 增加；`index.json` 新条目 |
| **C2 幂等（不重复、不覆盖）** | P016 | 同一 `export_id` + 同字节重复 PUT 两次 | P016：两次 200 且第二次 `duplicate:true`（或同语义）；ALW：文件仍是 1 个、索引仍 1 条、`scanned` 增但 `indexed=0` | `runs` 中 `unchanged` +1、`indexed` 0 |
| **C3 失败补传** | P016 | 断开 Mac（关机或停接收器）→ 产生 1 场 → 恢复 → 不手动点，等待自动/进 App 补跑 | P016：恢复后自动重推成功，`deliveredAt` 才被写；ALW：最终 1 个文件、1 条索引，无重复 | 恢复前后 `ls` 计数 0→1；索引 `logicalId` 唯一 |
| **C4 鉴权与跨天语义** | P016 | ① 无/错 token；② 合规 token；③ 23:5x 场次次日补传 | ① 401 且落点文件数**不变**、无新写盘；② 200 且落盘 1 个；③ 次日补传成功，`period_start/period_end` 与文件名区间 = 真实 `min…max learned_at` | ① 索引无新增；③ 条目 `createdAt = exported_at`，非"补传当天" |

**失败重试约定（P016 侧必须自己保证，ALW 不提供 ACK）**：ALW 没有回执通道，`200` 只代表 P016 自己的接收器写盘成功。因此 P016 的"已送达"判定必须基于**自身接收器的 200 + 落盘确认**；任何 4xx/超时/NSD 失败一律视为未送达并保留待投递。ALW 的 `quarantine`（`FILE_TOO_LARGE / EMPTY_FILE / BINARY_CONTENT / PATH_ESCAPE / SYMLINK_SKIPPED / INDEX_FAILED`）不会通知 P016，是**静默丢件**，所以 P016 不能依赖"文件在目录里就等于入库"，需要在联合验收时用 §5 E5 的索引回执补齐。

---

## 4. ALW 侧已就绪 / 未就绪

| 能力 | 状态 | 证据 / 说明 |
|---|---|---|
| 安全收件目录存在且已隔离版本控制 | **就绪** | `学习资料/01-口语自测原始记录/` 存在、为空、被 `.gitignore:41` 忽略；ALW 不会把用户原文提交进仓库 |
| `self_test` 分类与解析 | **就绪（代码）** | `learning-archive.mjs:119-123`（根与 classify）、`:214-246`（解析）、`:559-570`（`export_id/exported_at`） |
| 落盘后去重/版本/哈希/派生 | **就绪（代码）** | `learning-archive.mjs:582-673`（`unchanged`/`version+1`/`derived.json`） |
| 大小/二进制/符号链接/路径逃逸防护 | **就绪（代码）** | `:24,590-603,689-714` |
| 手动触发扫描 | **就绪** | `node learning-archive-worker.mjs --once`；另有 `--ingest-file <path> --source-type self_test` 可用于 P016 之外的安全投递 |
| **self_test 落地后自动索引（运行层）** | **已就绪（2026-11-04 复证）** | 旧的「pid 2433 看门狗」写法已弃用：现由独立 LaunchAgent `com.alw.learning-archive-watch`（pid 45168，`--watch --interval 300`，RunAtLoad+KeepAlive）托管。生产实测：08:20:24 放文件 → 08:23:01 自动索引（165s，`lastIndexed=1`），全程无手工命令。详见 `qa/20261104-t2/REPORT.md`、`qa/20261104-t5/REPORT.md`。 |
| 真实 P016 收件 | **未就绪（源侧为空）** | 落点 0 文件；索引 `self_test=1` 系 QA fixture（`sourceId=aabbccddeeff`，`sourceApp=archive_inbox`，正文仅 `测试/Test`） |
| 索引内"测试 vs 真实"标记 | **已就绪（ARC03 已满足）** | 唯一 `self_test` 条目 `lm-fa760f1f00826c3d` 已标 `test:true`、`sourceTag:"qa_fixture"`；`--status` 报 `total=85 realTotal=84 testFixtures=1`。**P01602 仍不得引用 `self_test=1` 作为真实接入证据。** |
| 跨项目投递的 ALW 侧 ACK | **设计上不提供** | `archive-receiver.mjs` 不接 `self_test`；见 §3.0 |

---

## 5. 状态表

| ID | 结论 | 依据 | 说明 |
|---|---|---|---|
| **P01601** | **PASS（可转交）** | 本文件 D1–D4 + C1–C4 均为可执行条目，每条含现象/证据/影响/方向/验收；P016 主管可独立排期，不需要 ALW 介入其代码 | 仅代表"交接完成"，不代表缺陷已修 |
| **P01602** | **NOT_RUN（必须保持）** | 无真机自然触发证据；落点 0 文件；无鉴权落盘证据；`self_test` 唯一条目为 fixture | 任何一方都不得据代码阅读、单测、fixture 或本机 curl 推断为 PASS |

### P01602 触发 PASS 的最小证据集（缺一不可）

| 编号 | 证据 | 采集方式（具体到可核对） |
|---|---|---|
| E1 | **真机 22:00 自然触发** | Note 11（serial `adb-REDACTED-SERIAL._adb-tls-connect._tcp`）安装修复版后**不手动点**静置一夜；附 ① 设备本地时间与 Mac 时间同框 ② `adb shell dumpsys jobscheduler \| grep -A5 practice_auto_export_daily` 的 `lastRunTime/nextRunTime` ③ 落点文件 `stat` 的 `mtime`（落在 22:00–22:30） |
| E2 | **鉴权落盘** | 同一设备连续三次：无 token → 401 且 `ls 落点 \| wc -l` 不变；错 token → 401 且不变；正确 token → 200 且 +1。三次的前后目录清单与接收器日志（只记状态码）一并回传 |
| E3 | **失败补传** | 停 Mac 接收器 → 产 1 场 → 恢复（不手动点）→ 自动重推；附手机侧 `deliveredAt/exportedAt` 前后值、落点最终 1 文件、`originalSha256` 与文件重算一致 |
| E4 | **跨天补传** | 23:50 后产 1 场（前夜 22:00 已过），次日触发补跑；附文件名区间、`period_start/period_end`、`learned_at` 三者一致 |
| E5 | **ALW 索引回执** | `LearningArchive/runs/<runId>.json` 显示 `indexedBySource.self_test ≥ 1` 且对应条目 `sourceApp=p016_landedazi`、`originalSha256` 可重算；并证明该条目**不是** `aabbccddeeff` fixture |

> 门槛说明：E1 与 E2 是硬门槛；E3/E4 是 D2/D3 的修复验收；E5 是"跨项目闭环"的证据，缺 E5 只能算 P016 单侧通过。

---

## 6. 给 P016 主管的一句话派单文本

> 「请 P016 按本文 D1–D4 修复 18791 的鉴权/绑定、投递结果状态机、跨天补传与 22:00 重排；改完用 C1–C4 自测，并把 E1（真机 22:00 自然触发）、E2（401/200 落盘对照）、E3、E4、E5 的原始日志与目录清单回传 ALW；P01602 在证据齐备前保持 NOT_RUN。」

## 7. 不要做的事

1. **不要把 18791 继续绑 `0.0.0.0` 而只在前端做校验**——鉴权必须在写盘之前，401 时不得创建/截断任何文件。
2. **不要修改 ALW 的 `archive-receiver.mjs` / `learning-archive.mjs` / 落点目录结构**来"适配"P016；本合同已按现有实现写好，格式无需改动。
3. **不要手工 `cp` 文件进落点目录后宣称自动投递通过**；也不要用 `--ingest-file` 的结果冒充 P016 手机侧投递。
4. **不要把 `self_test=1`（`aabbccddeeff` QA fixture）当作真实接入证据**；ARC03 明确要求 fixture 标测试。
5. **不要重启/停止当前 18791 服务或改其运行副本**（`~/Library/Application Support/Landedazi/export-receiver.py`）以"先验证一下"——这是 ALW 侧只读边界，也避免打断用户数据链路。
6. **不要让接收器同名覆盖既有记录**（`open(...,"wb")` 直接覆写）；修复后应改为"存在即比较哈希，不同则拒绝或另存"。
7. **不要把明文 HTTP 扩到 Tailscale/公网或写入新域名**；也不要把 token 写进 APK 仓库、日志或提交。
8. **不要把这条通道扩成私人聊天/个人档案的统一入口**；ALW 只接 `self_test` 一类 `.md`。
9. **不要把"编译通过/单测通过/curl 200"写成 P01601 或 P01602 的 PASS**；两者含义不同（前者=交接完成，后者=真实端到端通过）。
10. **不要在 ALW 仓库执行 commit/push/release**；本材料只到"可转交"为止。
