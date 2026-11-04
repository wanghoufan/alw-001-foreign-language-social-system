# T3 / T4 主报告（ALW-001 N05 V1.3）

> 执行：T3/T4 子代理｜2026-11-03 22:20–22:35 (+0800)｜ROOT：`/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统`
> 红线遵守：未重启/未 kill 任何服务；未改 `socialmate-v1.2/index.html`、`source/V1.1-baseline.html`、任何 Android Java；未改 P016 代码；未写任何 `records/*.json`、`records-archive/`、逐字版原稿；未删/清空索引条目；未伪造 self_test/course；未跑全量回归；未 commit/push。

## 0. 结论总表

| 编号 | 项 | 结论 | 一句话依据 |
|---|---|---|---|
| T3-1 | `placeId: null` 读时归属兼容 | **PASS**（附 1 项 PARTIAL） | 4 个读取点补 `placeId/placeIdSource`，20/20 断言过，7 个真实数据文件 sha256+mtime 全等 |
| — | 写入路径 `placeId` 仍落 null | **PARTIAL** | `Number("pv-…")=NaN` 是既有缺陷，按「写入行为不变」未改，已给一行补丁待批准 |
| T3-2 | 私有地点照片（DATA-04） | **PARTIAL（NO_SOURCE）** | 仓库 633 张图无一张红城湖现场图；用户目录 0 命中；未联网抓图 |
| T4-1 | 33 条基线完好 + 五类分布 | **PASS** | `--status`：33 条，conversation 3 / thought 18 / practice_review 12 / self_test 0 / course 0 |
| T4-1 | 二次扫描幂等 | **PASS** | 隔离副本：`first indexed=50 unchanged=33` → `second indexed=0 unchanged=83` |
| T4-1 | 原件 hash 可重算 | **PASS** | 33/33 索引 `originalSha256` 与磁盘重算一致，缺失原件 0 |
| T4-1 | 无令牌 401 / 伪造令牌 401 | **PASS** | 6 个负向请求全部 401（含 8781 归档端口），无一落盘 |
| T4-1 | 非法类型 / 超限大小被拒 | **PASS** | INVALID_SOURCE_TYPE 400 / EXT_NOT_ALLOWED 400 / EMPTY_CONTENT 400 / CONTENT_TOO_LARGE 413 |
| T4-1 | 索引报错不删用户资料 | **PASS** | 损坏索引→隔离留档 + 从空索引重建；`retract` 后原件字节不变；并发 `RUN_LOCKED` |
| T4-1 | 300 秒受控轮询 | **PARTIAL** | 配置在 `service-all.sh:264` 确为 300s，但**运行中的 supervisor（起于 11-02 18:12）自 17:21 起未再触发扫描** |
| T4-1 | ARCH-01「新记录进入索引」 | **BLOCKED** | 真实索引 33，磁盘可索引文件 83 → **50 条待补录**；需主开发者重启 watch 或手工 `--once` |
| T4-2 | P016 代码缺陷核查 | **PARTIAL** | D1 返回值忽略 / D2 跨天失真 / D3 未鉴权 0.0.0.0:18791，均已在源码定位 |
| T4-2 | P016 22:00 自然触发 | **NOT_RUN** | 无真机自然时序证据；Mac 落点目录为空 |
| T4-3 | 课程源 / ChatGPT 外部来源 | **NO_SOURCE** | `course=0`、`self_test=0` 是无来源；只有「GPT 回贴后归档」一条真实路径 |

交付文件全部在本目录：`T3-T4-REPORT.md`、`place-id-compat.md`、`PHOTO-GAP.md`、`P016-HANDOFF.md`、
`verify-t3-1-placeid-compat.mjs`(+`.log`)、`verify-t4-1-archive.mjs`(+`.log`)、`t4-1-stale-diff.mjs`(+`.log`)、
`place-notes-t3-1.diff`、`place-notes.mjs.before-t3-1.bak`、`sha256-before.txt`、`sha256-after.txt`、
`t4-1-status-before.log`、`t4-1-auth-negative.log`、`t4-1-polling-facts.log`。

---

## T3-1 记录归属（placeId: null）读时兼容

**改动**：`socialmate-prototype/ai-gateway/place-notes.mjs` 单文件（`+34/-3`，4 个 hunk）。
详见 `place-id-compat.md` + `place-notes-t3-1.diff`。要点：

- 新增纯函数 `placeIdForRecordsDir()` / `withPlaceIdCompat()`（`place-notes.mjs:69-96`）；
- 三个读取点接入：`readAllRecords()`（`:174`）、`readRecord()`（`:184`）、`listRecordsWithProgress()`（`:350`，新增输出字段 `placeId` + `placeIdSource`）；
- 来源标记：`record`（原生非空）/ `directory`（按目录推导）/ `unassigned`（草稿保持 null）；
- 不写盘、不升 revision、不动 `recordId / blockId / rawSha256 / changeHistory`。

**证据**

```
$ node --check socialmate-prototype/ai-gateway/place-notes.mjs
→ PLACE_NOTES_SYNTAX_OK

$ node verify-t3-1-placeid-compat.mjs   # exit=0
PASS  A2 改后 records[0].placeId = pv-hongcheng-lake-park 且来源 directory
PASS  A4 readRecord 也补 placeId，且 recordId/revision 不变  revision=2 rawSha256=6851d3c619d3ce3b…
PASS  A5 19 段 blockId 全部保留  blk-hc-1 … blk-hc-19
PASS  B2 practiceStore.aggregate(placeId) 聚合到 4 条  blocks=2 total=4
PASS  C1 该记录在索引中恰好 1 条 thought  lm-f412f4ea81b5359e v1
PASS  C3 索引 originalSha256 与原件重算一致
PASS  F1 真实数据文件 sha256 + mtime 全部未变  7 个文件一致
== 汇总：20/20 PASS，0 FAIL
```

磁盘未被改写（改前/改后，`sha256-before.txt` / `sha256-after.txt`）：

| 文件 | 改前 | 改后 |
|---|---|---|
| `rec-20261103072022-16b79c.json` | `a26ca09ec8658db7ab5f6cc0c94ad7cb1057418b9b337afd72aa739e157d537b` | 同 |
| `pv-hongcheng-lake-park/place.json` | `ad717e71485aa113cefcdd6b66a9636ffef2e007102b9ff13215644bae0f1ef5` | 同 |
| `LearningArchive/index.json` | `2d0078ce9756d8c0166e44a9cce894994c6292a00add079b8c5ed6fa42266520` | 同 |
| `place-notes.mjs` | `51495a9ace50a86217900c7c48836a63cbb8fb29619eab6bb0dff42d2226768a` | `acbeef5c051b0079208e8cdbdee9bec30a443174f56bf6635fa445456003a8d4` |

记录文件 mtime 前后均为 `1793695461`（`2026-11-03T16:44:21`）→ 读路径没有触发任何写盘。

**回滚**：该文件在 git 中未跟踪（`??`），`git checkout` 无效；
使用同目录 `place-notes.mjs.before-t3-1.bak` 覆盖即可（命令见 `place-id-compat.md` §4）。

**遗留（PARTIAL，需要你决定）**：写入路径 `createRecord()` 仍是 `placeId: Number(target)`，
私有地点落 null。按「写入路径行为不变」本次未改；一行补丁已写在 `place-id-compat.md` §3，等你批准。

**生效**：需重启 8791（本次未重启）。

---

## T3-2 照片缺口（DATA-04）

**结论：PARTIAL / NO_SOURCE。`place.json` 未写入任何 photos 条目（sha256 未变）。**

只读搜索全部落空：

```
仓库图片总数（排除 .git/node_modules）                       → 633
文件名含 hongcheng/红城/lake/park/photo                      → 20 条，全是 App 截图 + 115 公开点 webp
非 qa 截图目录下的 jpg/jpeg/heic                             → 0
socialmate-v1.2/source/places-115.json 里 红城                    → 0 命中（红城湖是纯私有地点）
Hainan-Travel-Guide/baseline/{PHOTO_SOURCES.csv,places.json} → 无 红城湖
~/Desktop ~/Downloads ~/Documents ~/Developer/coding ~/Movies  文件名含 红城/hongcheng → 0
```

**不使用**：115 指南 webp、新闻图（`baseline/README.md:18` 已写明「再使用请自行确认原作者授权」，
`DELIVERY_REPORT.md:43` 写明新闻/携程/小红书图受版权保护）。**不用历史图冒充 2026 现场。**

Schema 草案（`slot/local/sha256/width/height/bytes/caption/sourceUrl/author/shotDate/shotDateConfidence/license/usage/consent/status`）
与落地校验规则见 `PHOTO-GAP.md` §3。需要用户补：原图、拍摄日期、作者、授权范围。

---

## T4-1 归档现状定点核查

### 1) 基线（`--status`，只读）

```
$ node socialmate-prototype/ai-gateway/learning-archive-worker.mjs --status       # 2026-11-03T22:25:02+0800
LearningArchive: …/SocialMate-Data/LearningArchive
条目总数: 33｜最近更新: 2026-11-03T09:21:10.293Z
分类: self_test=0  course=0  conversation=3  thought=18  practice_review=12
处理状态: normalized=25  ai_suggested=8
待云端同意: 33
最近扫描: run-20261103T091344-21a8｜scanned=33 indexed=0 unchanged=33 quarantined=0 failed=0
来源: self_test:EMPTY  course:NO_SOURCE  conversation:SCANNED(3)  private_places:SCANNED(1)  place_notes:SCANNED(28)  inbox:SCANNED(1)  practice:EMPTY  archive_inbox:EMPTY
```

→ 33 条完好，五类分布与 HANDOFF §1 一致（`conversation 3 / thought 18 / practice_review 12`，`self_test 0 / course 0`）。
日志：`t4-1-status-before.log`。

### 2) 幂等 / 增量（隔离副本，真实索引零写入）

```
$ node verify-t4-1-archive.mjs        # exit=0，18/18 PASS
first : scanned=83 indexed=50 unchanged=33 quarantined=0 skipped=0 failed=0 total=83
second: scanned=83 indexed=0  unchanged=83 quarantined=0 skipped=0 failed=0 total=83
first.indexedBySource={"practice_review":26,"thought":24}
PASS C1 第二次扫描 indexed=0（幂等，不重复插入）
PASS C2 二次扫描 changed 数与文件数一致  scanned=83
```

`indexed + unchanged + skipped + quarantined + failed == scanned` → 无遗漏、无重复计数。

**但这里暴露一个真实缺口**（见 §4）：真实索引停在 33，磁盘上可索引文件已是 83。

### 3) 原件 hash 可重算

```
PASS  B1 每条索引的 originalSha256 与原件重算一致  33/33 一致，缺失原件=0
PASS  B2 索引条目只引用路径，不保存全文
PASS  A3 materialId / logicalId 无重复  materialId 唯一=33；logicalId 唯一=33
PASS  A2 全部条目仍是 local_only  33/33
```

### 4) 鉴权（负向，未投递真实内容）

```
$ curl … http://127.0.0.1:8791/v12/api/learning-archive/status
{"ok":false,"code":"TOKEN_REQUIRED",…}   HTTP=401
$ curl -X POST … /v12/api/learning-archive/ingest  (body 只有 {"content":"x"} 探针)
{"ok":false,"code":"TOKEN_REQUIRED",…}   HTTP=401
$ curl -X POST … /v12/api/learning-archive/scan
{"ok":false,"code":"TOKEN_REQUIRED",…}   HTTP=401
$ curl -H 'x-archive-token: bogus-t41-probe' … /status
{"ok":false,"code":"UNAUTHORIZED",…}     HTTP=401
$ curl … http://127.0.0.1:8781/api/archive/session/__t41_probe__          → HTTP=401 {"code":"UNAUTHORIZED"}
$ curl -H 'x-archive-token: bogus-t41-probe' … 同上                        → HTTP=401
```

`server.mjs:489-505` 的 `peopleToken()` 在 `readPayload` 之前返回 401 → 未认证请求不会进入任何写入路径。
日志：`t4-1-auth-negative.log`；事后 `index.json` sha256 未变（`2d0078ce…6520`）。

### 5) 非法类型 / 超限 / 畸形（临时 archive 根，不碰真实索引）

```
PASS D 非法 sourceType → INVALID_SOURCE_TYPE/400
PASS D 扩展名不在白名单 → EXT_NOT_ALLOWED/400
PASS D 空内容 → EMPTY_CONTENT/400
PASS D 超过 5MB → CONTENT_TOO_LARGE/413
PASS D5 同内容重复投递 → duplicate:true，不新增条目
```

服务端侧对应 `learning-archive.mjs:57-66 / 835-843`，上限 `MAX_FILE_BYTES = 5*1024*1024`。

### 6) 索引报错不删用户资料

```
PASS E1 索引损坏 → 不抛异常、不静默覆盖，先隔离副本再从空索引继续
        quarantine=index-corrupt-20261103-1793715973385.json
PASS E2 损坏后重扫只读源目录，用户原件仍在  重扫 indexed=83；源目录仍有 6 个会话来件
PASS E3 retract 只撤索引与派生，原件保留  原件字节不变 a09391a9f9f7…
PASS E4 并发锁：已有扫描在跑时返回 RUN_LOCKED
```

代码事实：`learning-archive.mjs:409-423`（坏索引 → `quarantine/index-corrupt-*.json` 副本 + 空索引继续）、
`906-920`（`retract` 只删 `processed/<id>`，`originalKept: true`）、`459-473`（`run.lock`，10 分钟视为陈旧）。
**本次没有故意破坏真实索引**，只在 `os.tmpdir()` 副本里做过。

### 7) 300 秒受控轮询

配置事实（`t4-1-polling-facts.log`）：

| 位置 | 内容 |
|---|---|
| `socialmate-v1.2/service-all.sh:264` | `local la_interval="${LEARNING_ARCHIVE_INTERVAL:-300}"` |
| `socialmate-v1.2/service-all.sh:271-278` | 到期即 `node learning-archive-worker.mjs --once --quiet >> $QA_DIR/learning-archive.log` |
| `learning-archive-worker.mjs:143` | `--watch` 自身间隔 `Math.max(30, …SM_LEARNING_ARCHIVE_INTERVAL ?? 300)` |
| LaunchAgent `com.alw.socialmate-stack` | environment 里**没有** `LEARNING_ARCHIVE_INTERVAL` → 走默认 300 |
| `docs/architecture-facts.md:152` | 与代码一致（300s 受控轮询） |

→ **配置与 HANDOFF 一致（300 秒）**。但运行实例对不上：

```
supervisor: /bin/bash … service-all.sh watch   pid=2433  started Mon Nov 2 18:12:12 2026（早于该段代码入库）
$ ls socialmate-v1.2/.local/qa/learning-archive.log  → No such file or directory
$ ls -1t SocialMate-Data/LearningArchive/runs | head -2
run-20261103T091344-21a8.json
run-20261103T091312-7006.json
```

即：**当前常驻的 watch 进程是 11-02 启动的老实例，没有执行到后来加入的学习资料扫描块**（日志文件从未被创建，
最后一次 run 是 17:21 的两次手工扫描，间隔 32 秒，不是 300 秒节奏）。→ 300s 轮询「配置有、运行没生效」，
**需要重启 watch / `launchctl kickstart -k gui/$(id -u)/com.alw.socialmate-stack` 才恢复**（本次按红线未动）。

---

## T4-1 追加发现：ARCH-01「新记录进入索引」缺口（BLOCKED）

`t4-1-stale-diff.mjs`（只读：复制索引到 tmp 再扫，不写真实索引）：

```
真实索引: 33 条（updatedAt=2026-11-03T09:21:10.293Z）
模拟扫描: scanned=83 indexed=50 unchanged=33 total=83
真实索引里没有的条目: 50
按来源根目录: {"private_places":4,"place_notes":46}
按 sourceType: {"practice_review":26,"thought":24}
真实索引有、本次扫描未再产出: 0 条
```

50 条待补录明细（节选，完整见 `t4-1-stale-diff.log`）：

```
practice_review v1 private_places:pv-hongcheng-lake-park/practice/blk-hc-1/pr-mw0j5ccz-1e8842.json
practice_review v1 private_places:pv-hongcheng-lake-park/practice/blk-hc-1/pr-mw0j5ueg-96a490.json
practice_review v1 private_places:pv-hongcheng-lake-park/practice/blk-hc-1/pr-mw0j78jc-fb85e7.json
practice_review v1 private_places:pv-hongcheng-lake-park/practice/blk-hc-2/pr-mw0j5kpb-940bc1.json
practice_review v1 place_notes:1/practice/blk-1-649442b8/pr-mw0hi9hv-9413be.json  …（共 22 条）
thought         v1 place_notes:1/records/rec-20261103103314-e7a0c5.json           …（共 24 条）
```

- 4 条是红城湖（18:13 新建的复盘），46 条是今日真机测试在 `PlaceNotes/1` 下的记录与复盘；
- 真实性无问题：`真实索引有、本次扫描未再产出 0 条`（没有文件丢失/改名）；
- **根因就是上一节的老 watch 实例**：这些文件都在 17:21 之后产生，本该在 300s 内被收录；
- 处理选项（需你选）：
  1. 重启 watch（推荐，最贴近生产语义）→ 下一个周期自动补录；
  2. 手工 `node socialmate-prototype/ai-gateway/learning-archive-worker.mjs --once` → 立即 `indexed=50`；
  3. 什么都不做 → 索引继续落后（不影响读取，只影响归档可见性）。
- 本次**没有**替你执行 1/2，避免在你真机测试期间改动共享索引状态；隔离副本已证明结果确定（`unchanged=83`、重复扫描零增长）。

---

## T4-2 P016 跨项目只读核查与交接

项目已定位：`/Users/zzymima0000/Developer/coding/1.Active/016-ing-懒得打字-安卓版本`（HEAD `8257a71`，**未修改**）。
完整交接文档：`P016-HANDOFF.md`（含缺陷行号、复现步骤、期望行为、HTTP 契约 A1–A9、状态机契约 B1–B6、跨项目 C1–C4）。

核查结论：

| 缺陷 | 位置 | 判定 |
|---|---|---|
| `pushToMac` 返回值被忽略，失败仍 `markExported` | `PracticeAutoExport.kt:61-62` | **CONFIRMED**（`pushToMac` 返回 Boolean，调用点不接收） |
| 跨天补传失真（范围固定今天） | `PracticeAutoExport.kt:53-57` + `PracticeExport.kt:49` | **CONFIRMED**（昨日未导出场次永不补传；文件名区间被压成单日） |
| 18791 未鉴权明文 HTTP + `0.0.0.0` | `export-receiver.py:17-20,24-46,59` | **CONFIRMED**（`lsof`：`TCP *:18791`；无 token/TLS/内容校验，同名覆盖） |
| 22:00 WorkManager 漂移 + 补跑不补天 | `PracticeAutoExportWorker.kt:31-40` | **CONFIRMED（代码）/ 自然触发 NOT_RUN** |
| 真实投递证据 | — | **NOT_RUN**：`学习资料/01-口语自测原始记录/` 为空目录（`total 0`） |

安全相关实测（只做拒绝类）：

```
PUT /practice  X-Filename: probe.txt          → HTTP 400（文件名白名单生效）
GET /practice                                 → HTTP 501
lsof -nP -iTCP:18791 -sTCP:LISTEN             → Python pid 21963  TCP *:18791 (LISTEN)
运行副本 sha256 == 仓库脚本 sha256           → 1d067cd1a8028531fc…483b93
```

**没有**真实设备自然时序证据 → 22:00 触发一律 `NOT_RUN`，不外推 PASS。

---

## T4-3 课程源 0 条 / ChatGPT 无外部来源

| 断言 | 事实 |
|---|---|
| `course = 0` | `SocialMate-Data/Courses` **目录不存在**（扫描结果 `course:NO_SOURCE`）。课程源是占位入口，不是「采集成功」 |
| `self_test = 0` | `学习资料/01-口语自测原始记录/` 为空目录；P016 从未成功落盘。属**真实无来源** |
| 唯一真实路径 | 「用户在 ChatGPT 侧做完自测 → 复制/回贴到 SocialMate → `practice_reports` 落盘 `pr-*.json` → learning-archive 扫描收录 `practice_review`」 |
| 无权读取 ChatGPT 历史 | ChatGPT Voice/对话没有开放「读取用户历史会话」的默认权限；本仓库也没有任何 API Key/抓取器指向 OpenAI 账号 |
| 结论 | 归档的 12 条 `practice_review` 全部来自用户手工回贴（`source: "external_chatgpt_paste"`、`autoCaptured: false`）；不得表述为「自动抓取 ChatGPT」 |

建议在对外文档统一措辞：**「GPT 回放贴后自动归档」= 用户回贴一次 + 后台自动分类**，不是全自动采集。

---

## 附：本次执行环境事实

```
ports  : 8790/8791 node pid 92280, 8781 node 92317, 8782 node 92336, 18791 python 21963（均未被我触碰）
watch  : service-all.sh watch pid 2433, started 2026-11-02 18:12:12（老实例，未重启）
git    : HEAD fc2379c，工作树 dirty（其他会话改动），本子代理未 commit / 未 push
node   : 22.x（`node --check` 与脚本均用系统 node）
```
