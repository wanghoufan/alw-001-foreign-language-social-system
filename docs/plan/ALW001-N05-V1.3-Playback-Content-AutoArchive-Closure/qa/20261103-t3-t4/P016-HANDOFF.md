# P016「懒得打字」→ Mac 交接文档（T4-2 / ARCH-03）

> 来源：ALW-001 N05 V1.3 T4 只读核查｜2026-11-03
> 被查项目：`/Users/zzymima0000/Developer/coding/1.Active/016-ing-懒得打字-安卓版本`（HEAD `8257a71`，工作树有未提交改动，**未触碰**）
> 本文件**不修改 P016 任何代码**，只给需求与验收接口。修复须走 P016 独立项目批准。

## 0. 一句话结论

| 项 | 结论 |
|---|---|
| 22:00 WorkManager 自动导出 | **已实现（代码事实）**，自然时序 **NOT_RUN**（无真机证据，Mac 落点目录为空） |
| `18791` 局域网接收器 | **已实现但为安全缺陷**：`0.0.0.0` 明文 HTTP、**无鉴权**、无内容校验 |
| `pushToMac` 返回值 | **被忽略**：失败也标记 `exportedAt`，永久不再重推（数据静默丢失风险） |
| 跨天补传 | **失真**：导出范围固定「今天」，昨天未导出的场次永不补传 |
| 实际投递成功证据 | **NOT_RUN**（`学习资料/01-口语自测原始记录/` 现为空目录，`self_test=0` 是真实无来源） |

## 1. 缺陷明细（文件:行）

### D1 — `pushToMac` 返回值被忽略，失败也标记已导出 〔严重：数据静默丢失〕

`app/src/main/java/com/landedazi/app/core/practice/PracticeAutoExport.kt:61-62`

```kotlin
withContext(Dispatchers.IO) { pushToMac(context, export.filename, export.markdown) } // 注释写「下轮重试」
repo.markExported(pending.map { it.id }, System.currentTimeMillis())
```

`pushToMac` 返回 `Boolean`（`PracticeAutoExport.kt:91`，失败返回 `false`，异常也吞掉返回 `false`），
但调用方**完全不接收**。→ Mac 不在/接收器没起/NSD 找不到/HTTP 500，都会把场次标记为已导出，
下一轮 `pending` 为空直接 `return`（`:57`），**该场次再也不会被推送**。
注释「失败静默，下轮重试」与实现相反。

### D2 — 跨天补传失真 〔严重：昨日数据永久不导出〕

`PracticeAutoExport.kt:53-57`

```kotlin
val today = LocalDate.now(zone)
val range = customPracticeDateRange(today, today, zone)   // 只覆盖今天 00:00 → 明天 00:00
val pending = all.filter { range.contains(it.learnedAt) && it.exportedAt == null }
```

- 23:5x 练完、22:00 任务已过 → 该场次属于「昨天」，第二天无论开几次 App 都**不在 range 内**，永不导出；
- 文件名把范围写死成单日（`PracticeExport.kt:49`：`学习记录 ${date(now)} - ${date(range.start)} 至 ${date(range.endExclusive-1)} …`），
  跨天补传即便发生也无法表达真实学习区间；
- 同一自然日内容变化会产生新 digest → 新文件名 → Mac 侧同日两份（`:47` digest 含 body），而不是覆盖。

### D3 — 接收器未鉴权明文 HTTP，且监听所有网卡 〔高：越权写入〕

`scripts/mac/export-receiver.py:17-20,24-46,59`（运行中的副本：
`~/Library/Application Support/Landedazi/export-receiver.py`，sha256 与仓库一致 `1d067cd1…b93`）

```python
PORT = 18791
NAME_RE = re.compile(r"^学习记录 \d{4}-\d{2}-\d{2}( - …)? - [0-9a-f]{8}\.md$")
def do_PUT(self):
    if self.path != "/practice": 404
    name = os.path.basename(unquote_plus(self.headers.get("X-Filename","")))
    if not NAME_RE.fullmatch(name): 400
    if not 0 < length <= 5MB: 413
    open(os.path.join(DEST, name),"wb").write(data)   # 直接覆盖同名文件
...
socketserver.ThreadingTCPServer(("0.0.0.0", PORT), Receiver)   # ← 所有网卡
```

- 无 token、无 TLS、无来源 IP 校验、无内容类型/结构校验、无内容哈希去重、同名直接覆盖；
- 绑定 `0.0.0.0`（`lsof` 实测 `TCP *:18791`），同网段/已登录 Tailscale 的任何设备都能写；
- 唯一护栏是文件名正则 + 5MB 上限，攻击者只要构造合规文件名即可**覆盖用户已有学习记录**；
- `dns-sd -R landedazi-mac _landedazi._tcp` 主动广播，等于把入口告诉全网段。

实测（只做拒绝类负向请求，未上传任何内容）：
```
PUT /practice  X-Filename: probe.txt   → HTTP 400（文件名白名单生效）
GET /practice                          → HTTP 501（只实现 PUT，未越权）
```

### D4 — 22:00 周期任务的漂移与「补跑不补天」 〔中〕

`PracticeAutoExportWorker.kt:31-40`

```kotlin
val delayMs = PracticeAutoExporter.nextNightlyDelay(LocalDateTime.now()).toMillis()
manager.enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.KEEP,
    PeriodicWorkRequestBuilder<PracticeAutoExportWorker>(1, TimeUnit.DAYS)
        .setInitialDelay(delayMs, TimeUnit.MILLISECONDS).build())
```

- `KEEP` + 一次性 `initialDelay`：首次排在 22:00，之后由 Doze/重启漂移，**不会重新对齐到 22:00**；
- `CATCHUP` 单次任务是 `REPLACE`，能补「今天」，补不了 D2 的跨天；
- `doWork()` 抛错 → `Result.retry()`（`:22-24`），但 `pushToMac` 已吞异常，worker 永远看到 `success` → 重试机制形同虚设。

## 2. 复现步骤（P016 主管可直接照做）

| # | 步骤 | 预期暴露的缺陷 |
|---|---|---|
| R1 | Mac 关掉接收器；手机产 1 场自测；进 App 触发补跑 | D1：SAF 里有文件、Mac 目录无新文件，但 DB 里 `exportedAt` 已被写 → 再开 App 不再推送 |
| R2 | 22:05 后台停掉接收器，23:50 产 1 场；次日 09:00 开 App | D2：该场次永不导出（range 只看今天），且日志无任何提示 |
| R3 | 手机时区跨天（23:59 → 00:01 各 1 场） | D2：两场分属两天，文件名区间都变成单日，跨天补传无法表达 |
| R4 | 局域网内任一设备 `curl -X PUT -H 'X-Filename: 学习记录 2026-11-03 - 2026-11-03 至 2026-11-03 - deadbeef.md' --data 'x' http://<mac>:18791/practice` | D3：返回 200，DEST 出现该文件；若同名则**覆盖**已有记录 |
| R5 | `lsof -nP -iTCP:18791 -sTCP:LISTEN` | D3：`TCP *:18791`（全接口），不是 `127.0.0.1` / 具体 LAN IP |
| R6 | 真机放一夜不动，22:00 后查 Mac 目录 + `dumpsys jobscheduler | grep practice` | D4 / ARCH-03：自然触发 **NOT_RUN**，需真实时序证据 |

## 3. 期望行为（需求，不是实现指令）

1. **投递语义可判定**：`pushToMac` 的返回值必须参与状态机。成功才 `markExported(exportedAt, deliveredToMac=true)`；
   失败保持 `exportedAt == null`（或新增 `deliveredAt` 字段），下一轮继续重试，并**限制重试次数 + 上报可读状态**（不能无限静默）。
2. **补传按「未投递」而不是「今天」**：待导出集合应为 `exportedAt == null`（或 `deliveredAt == null`），
   与 `learnedAt` 落在哪天无关；文件名区间取该批次的真实 `min(learnedAt) … max(learnedAt)`。
3. **接收器必须鉴权**：
   - 绑定地址改为可配置，默认只绑本机/指定 LAN 地址，不再 `0.0.0.0`；
   - 共享密钥（配对时生成，App 存 Keystore，Mac 存 0600 文件），请求头带 `X-Ldz-Token`，**不匹配直接 401 且不落盘**；
   - 建议改 HTTPS 或至少对 body 做 HMAC（`X-Ldz-Signature`），密钥不进日志；
   - 强制 `Content-Type: text/markdown`，并对 body 做结构校验（必须含 `export_id:` 与 `schema_version: 1`）。
4. **幂等/去重**：以 `export_id`（正文 `export_id:` 字段）为准做去重；
   同 `export_id` 重复投递返回 `200 {"duplicate":true}` 且不重写；不同 `export_id` 但同日期不得互相覆盖（文件名避免仅靠日期+8位摘要冲突）。
5. **可观测**：接收器与 App 都能回答「这份文件什么时候、从哪台设备、是否验签通过」；
   日志不得包含正文。（当前 `log_message` 全静默，出问题无从排查。）
6. **不改既有安全边界**：**绝不**把这个无鉴权接收器扩展到真实聊天/其它私有资料；ALW-001 只接 `self_test` 一类 `.md`。

## 4. 验收接口（给 P016 主管的测试契约）

### 4.1 接收器 HTTP 契约（P016 内部，Mac 侧）

| 用例 | 请求 | 期望 |
|---|---|---|
| A1 正常 | `PUT /practice`，`X-Ldz-Token: <正确>`，body 含 `export_id:`，`X-Filename` 合规 | `200 {"ok":true,"duplicate":false}`，落盘 1 个文件 |
| A2 重复 | 同 A1 再来一次 | `200 {"ok":true,"duplicate":true}`，文件未被重写（mtime/内容不变） |
| A3 无令牌 | 去掉 `X-Ldz-Token` | `401`，**DEST 无新文件** |
| A4 错令牌 | `X-Ldz-Token: wrong` | `401`，DEST 无新文件 |
| A5 非法文件名 | `X-Filename: ../../etc/passwd` | `400`，无任何写盘 |
| A6 超限 | 6MB body | `413`，无写盘 |
| A7 非 markdown | `Content-Type: application/json` | `415`，无写盘 |
| A8 坏结构 | body 不含 `export_id:` | `400`，无写盘 |
| A9 监听面 | `lsof -nP -iTCP:<port> -sTCP:LISTEN` | 不是 `*:<port>`（除非同时满足 A3/A4） |

### 4.2 手机侧状态机契约（P016 内部，可单测）

| 用例 | 输入 | 期望 |
|---|---|---|
| B1 | Mac 不可达 | `exportedAt` **不**被写；下一轮仍在 pending 集合 |
| B2 | Mac 返回 401 | 同上；UI/日志给出「接收器拒绝（令牌）」可读原因；不静默 |
| B3 | Mac 返回 200 | `exportedAt` 写入，且记录 `deliveredToMac: true` |
| B4 | 昨日 23:50 的未投递场次 | 次日补跑仍会被导出（范围不看「今天」） |
| B5 | 同一天两次导出、内容不同 | 生成两个不同 `export_id`，且不互相覆盖；Mac 侧两份可区分 |
| B6 | 22:00 周期任务 | 允许漂移，但每次执行前重新对齐到下一个 22:00（或改为「每日固定窗口 + 强制 catch-up」） |

### 4.3 跨项目（ALW-001 ← P016）交接契约

ALW-001 已就绪的一侧（**不需要 P016 适配新接口**，只需文件真的落进目录）：

- 落点：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/学习资料/01-口语自测原始记录/`
- 识别：`learning-archive.mjs` 的 `self_test` 根目录，`classify: rel.endsWith(".md") → "self_test"`
- 解析依赖文件头部（`parseSelfTest` / `sourceMetaFor`）：
  ```
  ---
  schema_version: 1
  type: language-learning-record
  export_id: <sha256 hex>
  exported_at: <ISO8601>
  period_start: <ISO8601>
  period_end: <ISO8601>
  session_count: <int>
  ---
  ## Session <id>
  - learned_at: <ISO8601>
  ### 中文意图 / ### AI 参考表达 / ### 我的英文尝试 / ### AI 对比 / ### 学习重点
  ```
  以上格式与 P016 当前 `PracticeExport.kt` 完全兼容，**无需改动**。
- 索引侧行为：文件落地后下一次扫描即 `sourceType=self_test` 入库；当前 `self_test=0` 是因为目录为空，
  不是索引坏了。

**联合验收（需要真实设备自然时序，ALW-001 侧只能被动观察）**：

| 用例 | 谁执行 | 通过条件 |
|---|---|---|
| C1 | P016：Mac 起接收器（带令牌）+ 手机同 LAN | 手机一次正常 PUT → 落点出现 1 个 `学习记录 …md` |
| C2 | ALW-001：文件落地后跑 `node learning-archive-worker.mjs --once` | `indexed=1`，`bySource.self_test=1`，原件 hash 可重算 |
| C3 | P016：22:00 自然触发（真机、不手动点） | 22:00–22:30 内落点新增当日文件；**无证据则 NOT_RUN** |
| C4 | P016：拔网/关 Mac 后再恢复 | 恢复后自动补传成功，且不重复生成多份 |

## 5. ALW-001 侧本轮已做的只读核查（不是 P016 的验收）

```
进程:  /Applications/Xcode.../Python .../Library/Application Support/Landedazi/export-receiver.py (pid 21963, 起于 2026-11-02 15:56)
监听:  Python 21963 ... TCP *:18791 (LISTEN)          ← 全接口
落点:  .../alw-001-外语社交系统/学习资料/01-口语自测原始记录/  → 空目录（total 0）
负向:  PUT 非白名单文件名 → 400；GET /practice → 501
索引:  self_test = 0（真实无来源，非采集失败）
```

## 6. 优先级建议（P016 侧）

| 序 | 项 | 理由 |
|---|---|---|
| P0 | D3 接收器鉴权 + 绑定地址 | 越权写入用户记录，属安全缺陷 |
| P0 | D1 投递结果参与状态机 | 静默丢数据，用户不会知道 |
| P1 | D2 跨天补传 + 幂等去重 | 数据完整性 |
| P2 | D4 22:00 漂移重对齐 + 可观测日志 | 可维护性 |

> ALW-001 不会代改 P016 代码；以上任一项落地后，请 P016 主管按 §4 自测并回传 C1/C3 的真实时序证据，
> ALW-001 再按 T5 的 ARCH-03 更新结论（当前仍是 **NOT_RUN**）。
