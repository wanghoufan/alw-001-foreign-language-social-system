# placeId 读时兼容补丁（T3-1）

> 产出：ALW-001 N05 V1.3 · T3 · 2026-11-03
> 改动文件：`socialmate-prototype/ai-gateway/place-notes.mjs`（**仅此一个**）
> 数据文件：**零改动**（记录、place.json、索引均按字节未变，见 §4）

## 1. 问题

`SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json` 里
`placeId: null`，但文件确实在 `PrivatePlaces/pv-hongcheng-lake-park/records/` 下。

根因在**写入路径**（本次未改，见 §3）：

```js
// place-notes.mjs createRecord()（改前改后一致）
const target = isUnassigned ? UNASSIGNED : String(assertPlaceId(placeId)); // 私有地点 → "pv-hongcheng-lake-park"
...
placeId: isUnassigned ? null : Number(target),   // Number("pv-…") === NaN → JSON.stringify 后落成 null
```

前端目前靠 `socialmate-v1.2/index.html:2452` 的 `recPid()` 兜底
（`rec.placeId ?? N.view.placeId ?? N.place.id`），后端返回的 records 数组里**根本没有 placeId 字段**，
所以任何非「当前视图」的调用方（GPT Prompt、导出、索引、复盘）都拿不到稳定归属。

## 2. 改了什么（3 处读取点 + 2 个纯函数）

| # | 位置（改后行号） | 变化 |
|---|---|---|
| 1 | `place-notes.mjs:69-96` | 新增 `placeIdForRecordsDir()` / `withPlaceIdCompat()`（纯函数，无 IO） |
| 2 | `place-notes.mjs:174` `readAllRecords()` | 每条记录过一遍兼容函数（不改对象以外的任何东西） |
| 3 | `place-notes.mjs:184` `readRecord()` | 同上（`createRecord()` 内部读旧稿也走这条路，但它只取 revision/rawSha256/recordId，不吃 placeId） |
| 4 | `place-notes.mjs:350` `listRecordsWithProgress()` | 输出里新增 `placeId` / `placeIdSource` 两个字段 |

```js
function placeIdForRecordsDir(placeId) {
  if (isUnassignedId(placeId)) return null;
  const id = assertPlaceId(placeId);
  return typeof id === "string" ? id : Number(id);   // 私有地点保持字符串，1–115 保持数字
}

function withPlaceIdCompat(record, placeId) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const native = record.placeId;
  if (native !== null && native !== undefined && native !== "") {
    return {...record, placeId: native, placeIdSource: "record"};
  }
  const derived = placeIdForRecordsDir(placeId);
  return {...record, placeId: derived, placeIdSource: derived === null ? "unassigned" : "directory"};
}
```

`placeIdSource` 语义：

| 值 | 含义 |
|---|---|
| `record` | 文件里本来就写了非空 placeId（原生，原样返回，即使与目录不一致也不改写） |
| `directory` | 文件里是 null/空 → 按调用方请求的目录归属推导 |
| `unassigned` | `_unassigned` 草稿目录，保持 `null` |

**不写回磁盘、不升 revision、不动 recordId/blockId/rawSha256/changeHistory。**
返回的是浅拷贝对象，磁盘 JSON 一个字节都不变（`F1` 断言：7 个真实数据文件 sha256 + mtime 全等）。

完整补丁见 `place-notes-t3-1.diff`（4 个 hunk、+34/-3 行）。

## 3. 明确未改的部分（写入路径）

按任务口径「写入路径行为不变」，本次**没有**动 `createRecord()`。
后果：私有地点下次保存仍会写 `placeId: null`，读时继续靠 `directory` 兜底。

已验证并记录（脚本 `E1`）：
```
PASS  E1 新写入仍走原逻辑（未跟踪未改动）——私有地点 placeId 落成 null
      WRITER-NAN 既有缺陷：Number("pv-…")=NaN → null；本次按要求不改写入路径
```

**给主开发者的一行可选修复**（需你批准后再动，会改变写入语义）：

```diff
-      placeId: isUnassigned ? null : Number(target),
+      placeId: isUnassigned ? null : (isPrivatePlaceId(target) ? target : Number(target)),
```

改后：新写入记录自带 `placeIdSource: "record"`，读时兼容层退化为纯兜底；旧记录不受影响。
风险面已核对：`learning-archive.mjs:534` 用 `String(record.placeId)`；`practice-reports.mjs` 本身就是
字符串化 placeId；前端 `recPid()` 只做「非空判断 + 当路径用」——都吃字符串。

## 4. 回滚

**本文件在 git 里是未跟踪文件**（`git status` 显示 `??`，不是 ` M`），所以 `git checkout` 回不去。
真实可用的回滚路径是仓库内的备份：

```bash
cd /Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统
cp "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t3-t4/place-notes.mjs.before-t3-1.bak" \
   socialmate-prototype/ai-gateway/place-notes.mjs
node --check socialmate-prototype/ai-gateway/place-notes.mjs
```

备份文件 `place-notes.mjs.before-t3-1.bak` 为改前原文（605 行 + 无尾换行，与原文件字节一致）。
若主开发者之后把该文件纳入 git，则回滚方式为 `git checkout -- socialmate-prototype/ai-gateway/place-notes.mjs`。

改动是纯代码层：**回滚后旧行为立刻恢复（records 里没有 placeId 字段），不需要迁移数据、不需要改索引、不需要重扫。**

## 5. 如何验证（自己跑）

```bash
cd "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t3-t4"
node verify-t3-1-placeid-compat.mjs          # 退出码 0
```

脚本做两件事：
1. 把 `ai-gateway/` 复制到 `os.tmpdir()`，把备份写成 `place-notes.mjs` → 得到「改前」模块；
   与真实模块对同一份真实数据各读一次，做行为对比。
2. 用临时目录 fixture 覆盖三分支（数字地点 null、原生非空、未归属草稿、私有地点）+ 写入路径记录。

实际输出（节选，完整见 `verify-t3-1-placeid-compat.log`）：

```
-- A. 真实记录：改前 vs 改后 读时视图
PASS  A1 改前 records[0] 没有 placeId 字段（旧行为）  placeId 缺失 → 前端只能靠 recPid() 兜底
PASS  A2 改后 records[0].placeId = pv-hongcheng-lake-park 且来源 directory
PASS  A3 磁盘原始文件仍是 placeId:null（未被读路径写回）
PASS  A4 readRecord 也补 placeId，且 recordId/revision 不变  revision=2 rawSha256=6851d3c619d3ce3b…
PASS  A5 19 段 blockId 全部保留  blk-hc-1 … blk-hc-19
PASS  A6 读两次结果稳定（幂等，不产生新增/重复）  recordCount=1

-- B. 复盘（4 个 pr-*.json）按 placeId 仍可命中
PASS  B1 4 个复盘文件 placeId/recordId 均指向红城湖记录
PASS  B2 practiceStore.aggregate(placeId) 聚合到 4 条  blocks=2 total=4

-- C. 学习索引：同一记录仍是 1 条（不重复插入），hash 可重算
PASS  C1 该记录在索引中恰好 1 条 thought  lm-f412f4ea81b5359e v1
PASS  C2 索引 placeRefs 指向红城湖（与目录推导一致，无新增别名）
PASS  C3 索引 originalSha256 与原件重算一致
PASS  C4 索引中绑定该 recordId 的 practice_review 条目不重复（读路径不插入）

-- D. fixture 三分支（临时目录，不碰真实数据）
PASS  D1 数字地点 5 + 文件 placeId:null → 推导为 5（number, directory）
PASS  D2 原生 placeId 非空时原样返回（record），不被目录覆盖
PASS  D3 未归属草稿保持 null（unassigned）
PASS  D4 私有地点 fixture 同样推导 pv-test-lake
PASS  D5 读取不产生任何字节改写（fixture sha256 全等）

-- E. 写入路径行为（记录事实，不改动）
PASS  E1 …（见 §3）
PASS  E2 该新记录读回来仍能拿到 placeId（directory 兜底）

-- F. 真实数据零改写（读取后快照 vs 读取前快照）
PASS  F1 真实数据文件 sha256 + mtime 全部未变  7 个文件一致

== 汇总：20/20 PASS，0 FAIL
```

磁盘证据（改前 / 改后完全一致，见 `sha256-before.txt` / `sha256-after.txt`）：

| 文件 | 改前 sha256 | 改后 sha256 |
|---|---|---|
| `.../records/rec-20261103072022-16b79c.json` | `a26ca09e…537b` | `a26ca09e…537b` |
| `.../place.json` | `ad717e71…1ef5` | `ad717e71…1ef5` |
| `LearningArchive/index.json` | `2d0078ce…6520` | `2d0078ce…6520` |
| `place-notes.mjs` | `51495a9a…768a` | `acbeef5c…a8d4`（预期变化） |

记录文件 mtime 前后均为 `1793695461`（2026-11-03T16:44:21），即**读路径没有触发任何写盘**。

## 6. 生效条件

改的是 8791 常驻进程加载的模块 → **需要主开发者重启 8791 才生效**（本次按红线未重启、未 kill）。
重启前走的是旧模块，前端仍靠 `recPid()` 兜底，功能可用但不带 `placeIdSource`。
