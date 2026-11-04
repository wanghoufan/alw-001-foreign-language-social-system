#!/usr/bin/env node
/**
 * T3-1 定点校验：placeId 读时归属兼容（place-notes.mjs）
 *
 * 只读真实数据 + 临时目录 fixture；不启动服务、不写 SocialMate-Data。
 * 用法：node verify-t3-1-placeid-compat.mjs
 * 退出码：0 = 全部断言通过；1 = 有失败。
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../../../../..");
const GW = path.join(ROOT, "socialmate-prototype", "ai-gateway");
const DATA = path.join(ROOT, "SocialMate-Data");
const PRIVATE_ROOT = path.join(DATA, "PrivatePlaces");
const PLACES_FILE = path.join(ROOT, "socialmate-v1.2", "source", "places-115.json");
const NOTES_ROOT = path.join(DATA, "PlaceNotes");
const PID = "pv-hongcheng-lake-park";
const RID = "rec-20261103072022-16b79c";
const RECORD_FILE = path.join(PRIVATE_ROOT, PID, "records", `${RID}.json`);
const INDEX_FILE = path.join(DATA, "LearningArchive", "index.json");
const BEFORE_SRC = path.join(HERE, "place-notes.mjs.before-t3-1.bak");

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ok: true, name, detail: detail || ""});
    console.log(`PASS  ${name}${detail ? `  ${detail}` : ""}`);
  } catch (error) {
    results.push({ok: false, name, detail: error.message});
    console.log(`FAIL  ${name}  → ${error.message}`);
  }
}

async function sha256File(file) {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function snapshot() {
  const files = [
    RECORD_FILE,
    path.join(PRIVATE_ROOT, PID, "place.json"),
    INDEX_FILE,
    ...(await fs.readdir(path.join(PRIVATE_ROOT, PID, "practice/blk-hc-1"))).map(
      (n) => path.join(PRIVATE_ROOT, PID, "practice/blk-hc-1", n)),
    ...(await fs.readdir(path.join(PRIVATE_ROOT, PID, "practice/blk-hc-2"))).map(
      (n) => path.join(PRIVATE_ROOT, PID, "practice/blk-hc-2", n)),
  ];
  const out = {};
  for (const file of files) {
    const st = await fs.stat(file);
    out[file] = {sha256: await sha256File(file), mtimeMs: st.mtimeMs, size: st.size};
  }
  return out;
}

function diffSnapshot(a, b) {
  const changed = [];
  for (const key of Object.keys(a)) {
    if (!b[key]) { changed.push(`${key}: MISSING_AFTER`); continue; }
    if (a[key].sha256 !== b[key].sha256) changed.push(`${key}: sha256 ${a[key].sha256} → ${b[key].sha256}`);
    if (a[key].mtimeMs !== b[key].mtimeMs) changed.push(`${key}: mtime changed`);
  }
  return changed;
}

async function loadBoth() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "t31-before-"));
  const tmpGw = path.join(tmp, "ai-gateway");
  await fs.cp(GW, tmpGw, {recursive: true});
  await fs.writeFile(path.join(tmpGw, "place-notes.mjs"), await fs.readFile(BEFORE_SRC, "utf8"), "utf8");
  const before = await import(pathToFileURL(path.join(tmpGw, "place-notes.mjs")).href);
  const after = await import(pathToFileURL(path.join(GW, "place-notes.mjs")).href);
  return {before, after, tmp};
}

const opts = {
  notesRoot: NOTES_ROOT,
  placesFile: PLACES_FILE,
  privatePlaces: {root: PRIVATE_ROOT},
};

async function main() {
  console.log(`== T3-1 placeId 读时兼容定点校验 @ ${new Date().toISOString()}`);
  console.log(`ROOT = ${ROOT}`);

  const snapBefore = await snapshot();
  console.log(`\n-- 读取前快照（${Object.keys(snapBefore).length} 个真实数据文件）`);
  for (const [file, v] of Object.entries(snapBefore)) {
    console.log(`   ${v.sha256}  ${v.size}B  ${path.relative(ROOT, file)}`);
  }

  const {before, after} = await loadBoth();
  const beforeStore = before.createPlaceNotesStore(opts);
  const afterStore = after.createPlaceNotesStore(opts);
  const rawRecord = JSON.parse(await fs.readFile(RECORD_FILE, "utf8"));

  console.log("\n-- A. 真实记录：改前 vs 改后 读时视图");

  const beforeDetail = await beforeStore.getPlaceDetail(PID);
  const afterDetail = await afterStore.getPlaceDetail(PID);

  await check("A1 改前 records[0] 没有 placeId 字段（旧行为）", () => {
    const rec = beforeDetail.records[0];
    assert.equal(Object.prototype.hasOwnProperty.call(rec, "placeId"), false);
    return "placeId 缺失 → 前端只能靠 recPid() 兜底";
  });

  await check("A2 改后 records[0].placeId = pv-hongcheng-lake-park 且来源 directory", () => {
    const rec = afterDetail.records[0];
    assert.equal(rec.placeId, PID);
    assert.equal(rec.placeIdSource, "directory");
    return `placeId=${rec.placeId} placeIdSource=${rec.placeIdSource}`;
  });

  await check("A3 磁盘原始文件仍是 placeId:null（未被读路径写回）", async () => {
    assert.equal(rawRecord.placeId, null);
    return "磁盘 placeId=null";
  });

  const afterRecord = await afterStore.readRecord(PID, RID);
  await check("A4 readRecord 也补 placeId，且 recordId/revision 不变", () => {
    assert.equal(afterRecord.placeId, PID);
    assert.equal(afterRecord.placeIdSource, "directory");
    assert.equal(afterRecord.recordId, RID);
    assert.equal(afterRecord.revision, 2);
    assert.equal(afterRecord.rawSha256, rawRecord.rawSha256);
    return `revision=${afterRecord.revision} rawSha256=${afterRecord.rawSha256.slice(0, 16)}…`;
  });

  await check("A5 19 段 blockId 全部保留", () => {
    const ids = afterRecord.blocks.map((b) => b.blockId);
    assert.equal(ids.length, 19);
    assert.deepEqual(ids, Array.from({length: 19}, (_, i) => `blk-hc-${i + 1}`));
    return "blk-hc-1 … blk-hc-19";
  });

  await check("A6 读两次结果稳定（幂等，不产生新增/重复）", async () => {
    const a = await afterStore.getPlaceDetail(PID);
    const b = await afterStore.getPlaceDetail(PID);
    assert.equal(a.recordCount, 1);
    assert.equal(b.recordCount, 1);
    assert.equal(JSON.stringify(a.records.map((r) => r.recordId)), JSON.stringify(b.records.map((r) => r.recordId)));
    return `recordCount=${a.recordCount}`;
  });

  console.log("\n-- B. 复盘（4 个 pr-*.json）按 placeId 仍可命中");

  const {createPracticeReportsStore} = await import(
    pathToFileURL(path.join(GW, "practice-reports.mjs")).href);
  const practice = createPracticeReportsStore({privatePlacesRoot: PRIVATE_ROOT, notesRoot: NOTES_ROOT});
  const agg = await practice.aggregate(PID);
  const reportFiles = [
    ...(await fs.readdir(path.join(PRIVATE_ROOT, PID, "practice/blk-hc-1"))).map((n) => path.join(PRIVATE_ROOT, PID, "practice/blk-hc-1", n)),
    ...(await fs.readdir(path.join(PRIVATE_ROOT, PID, "practice/blk-hc-2"))).map((n) => path.join(PRIVATE_ROOT, PID, "practice/blk-hc-2", n)),
  ];
  const reports = [];
  for (const file of reportFiles) reports.push(JSON.parse(await fs.readFile(file, "utf8")));

  await check("B1 4 个复盘文件 placeId/recordId 均指向红城湖记录", () => {
    assert.equal(reports.length, 4);
    for (const report of reports) {
      assert.equal(report.placeId, PID);
      assert.equal(report.recordId, RID);
      assert.ok(afterRecord.blocks.some((b) => b.blockId === report.blockId));
    }
    return reports.map((r) => `${r.reportId}@${r.blockId}`).join(", ");
  });

  await check("B2 practiceStore.aggregate(placeId) 聚合到 4 条", () => {
    const total = (agg.blocks || []).reduce((sum, b) => sum + Number(b.practiceCount || 0), 0);
    assert.equal(total, 4);
    return `blocks=${agg.blocks.length} total=${total}`;
  });

  console.log("\n-- C. 学习索引：同一记录仍是 1 条（不重复插入），hash 可重算");

  const index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
  const thoughtHits = index.materials.filter((m) => m.sourceType === "thought" && m.sourceId === RID);
  const practiceHits = index.materials.filter((m) => m.sourceType === "practice_review"
    && (m.practiceSessionRefs || []).some((ref) => ref.recordId === RID));

  await check("C1 该记录在索引中恰好 1 条 thought", () => {
    assert.equal(thoughtHits.length, 1);
    return `${thoughtHits[0].materialId} v${thoughtHits[0].version}`;
  });

  await check("C2 索引 placeRefs 指向红城湖（与目录推导一致，无新增别名）", () => {
    assert.deepEqual(thoughtHits[0].placeRefs, [PID]);
    return JSON.stringify(thoughtHits[0].placeRefs);
  });

  await check("C3 索引 originalSha256 与原件重算一致", async () => {
    const actual = await sha256File(RECORD_FILE);
    assert.equal(thoughtHits[0].originalSha256, actual);
    return actual;
  });

  await check("C4 索引中绑定该 recordId 的 practice_review 条目不重复（读路径不插入）", () => {
    const ids = practiceHits.map((m) => m.materialId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(practiceHits.length <= reports.length);
    return `index=${practiceHits.length} 条 / 磁盘=${reports.length} 份（差值为「建好复盘后尚未扫描」，见 T4-1）`;
  });

  console.log("\n-- D. fixture 三分支（临时目录，不碰真实数据）");

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "t31-fixture-"));
  const fxNotes = path.join(tmpRoot, "PlaceNotes");
  const fxPrivate = path.join(tmpRoot, "PrivatePlaces");
  const writeJson = async (file, value) => {
    await fs.mkdir(path.dirname(file), {recursive: true});
    await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
  };
  const baseRecord = (over) => ({
    schema: 1, placeId: null, recordId: "rec-fx-1", rawInput: "测试原文", rawSha256: "x",
    revision: 1, source: "manual_text",
    blocks: [{blockId: "blk-fx-1", order: 0, sourceText: "测试原文", cnSentences: ["测试原文"], enVariants: [], phrases: []}],
    createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z",
    changeHistory: [], unassigned: false, segmentation: {by: "server", stats: {}, warnings: []}, ...over,
  });

  await writeJson(path.join(fxNotes, "5/records/rec-fx-null.json"), baseRecord({recordId: "rec-fx-null"}));
  await writeJson(path.join(fxNotes, "5/records/rec-fx-native.json"), baseRecord({recordId: "rec-fx-native", placeId: 12}));
  await writeJson(path.join(fxNotes, "_unassigned/records/rec-fx-una.json"),
    baseRecord({recordId: "rec-fx-una", unassigned: true}));
  await writeJson(path.join(fxPrivate, "pv-test-lake/place.json"), {
    id: "pv-test-lake", private: true, cnName: "测试湖", enName: "Test Lake", city: "海口",
    category: "公园", cn: "测试", en: "test", photos: [], source: "fixture",
    createdAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z",
  });
  await writeJson(path.join(fxPrivate, "pv-test-lake/records/rec-fx-pv.json"),
    baseRecord({recordId: "rec-fx-pv"}));

  const fxStore = after.createPlaceNotesStore({
    notesRoot: fxNotes, placesFile: PLACES_FILE, privatePlaces: {root: fxPrivate},
  });
  const fxBefore = await snapshot2([fxNotes, fxPrivate]);

  await check("D1 数字地点 5 + 文件 placeId:null → 推导为 5（number, directory）", async () => {
    const rec = await fxStore.readRecord("5", "rec-fx-null");
    assert.equal(rec.placeId, 5);
    assert.equal(rec.placeIdSource, "directory");
    return "placeId=5 placeIdSource=directory";
  });

  await check("D2 原生 placeId 非空时原样返回（record），不被目录覆盖", async () => {
    const rec = await fxStore.readRecord("5", "rec-fx-native");
    assert.equal(rec.placeId, 12);
    assert.equal(rec.placeIdSource, "record");
    return "placeId=12 placeIdSource=record";
  });

  await check("D3 未归属草稿保持 null（unassigned）", async () => {
    const rec = await fxStore.readRecord("_unassigned", "rec-fx-una");
    assert.equal(rec.placeId, null);
    assert.equal(rec.placeIdSource, "unassigned");
    return "placeId=null placeIdSource=unassigned";
  });

  await check("D4 私有地点 fixture 同样推导 pv-test-lake", async () => {
    const rec = await fxStore.readRecord("pv-test-lake", "rec-fx-pv");
    assert.equal(rec.placeId, "pv-test-lake");
    assert.equal(rec.placeIdSource, "directory");
    return "placeId=pv-test-lake";
  });

  const fxAfterRead = await snapshot2([fxNotes, fxPrivate]);
  await check("D5 读取不产生任何字节改写（fixture sha256 全等）", () => {
    assert.deepEqual(fxAfterRead, fxBefore);
    return `${Object.keys(fxBefore).length} 个文件 sha256/mtime 未变`;
  });

  console.log("\n-- E. 写入路径行为（记录事实，不改动）");
  const created = await fxStore.createRecord("pv-test-lake", {
    confirm: true, source: "manual_text", rawInput: "晚上在红城湖边走了一圈，风很凉快，人也很多。",
  });
  const writtenFile = path.join(fxPrivate, "pv-test-lake/records", `${created.record.recordId}.json`);
  const written = JSON.parse(await fs.readFile(writtenFile, "utf8"));
  await check("E1 新写入仍走原逻辑（未跟踪未改动）——私有地点 placeId 落成 null", () => {
    assert.equal(written.placeId, null);
    return `WRITER-NAN 既有缺陷：Number("pv-…")=NaN → null；本次按要求不改写入路径`;
  });
  await check("E2 该新记录读回来仍能拿到 placeId（directory 兜底）", async () => {
    const rec = await fxStore.readRecord("pv-test-lake", written.recordId);
    assert.equal(rec.placeId, "pv-test-lake");
    assert.equal(rec.placeIdSource, "directory");
    return "兜底生效";
  });

  console.log("\n-- F. 真实数据零改写（读取后快照 vs 读取前快照）");
  const snapAfter = await snapshot();
  await check("F1 真实数据文件 sha256 + mtime 全部未变", () => {
    const changed = diffSnapshot(snapBefore, snapAfter);
    assert.deepEqual(changed, []);
    return `${Object.keys(snapAfter).length} 个文件一致`;
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n== 汇总：${results.length - failed.length}/${results.length} PASS，${failed.length} FAIL`);
  if (failed.length) {
    for (const f of failed) console.log(`   FAIL ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  }
  await fs.rm(tmpRoot, {recursive: true, force: true});
}

async function snapshot2(dirs) {
  const out = {};
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, {withFileTypes: true});
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        const st = await fs.stat(full);
        out[path.relative(dir, full)] = `${await sha256File(full)}:${st.mtimeMs}`;
      }
    }
  };
  for (const dir of dirs) await walk(dir);
  return out;
}

main().catch((error) => {
  console.error(`脚本异常: ${error?.stack || error}`);
  process.exitCode = 1;
});
