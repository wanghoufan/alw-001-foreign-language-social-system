#!/usr/bin/env node
/**
 * ALW-001 N05 V1.3 · T2/T3 数据迁移：红城湖记录 revision 2 → revision 3
 *
 * 做三件事（全部走仓库既有 placeNotesStore.createRecord，不手改 JSON）：
 *   1. 第 2 段：把整理时替用户补全的「就是想要那种……」回退成逐字说法「就是要……」，
 *      未完成想法不再假装写全；原话未完成的提示放在 block.reviewNote，不进朗读正文。
 *   2. 第 4 段：删掉 cnSentences[1] 开头残留的空行（只删空白，文字不动）。
 *   3. 给 19 段挂上 phrasePairs（来自 T2 的 phrase-pairs-v1.json），原 phrases 只读保留。
 *
 * 用法：
 *   node apply-revision3.mjs            # 干跑，只打印差异与 hash
 *   node apply-revision3.mjs --write    # 真正写入（生成 revision 3，旧版本进 changeHistory）
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统";
const REC_PATH = path.join(ROOT, "SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json");
const PAIRS_PATH = path.join(ROOT, "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t2-content/phrase-pairs-v1.json");
const QA_DIR = path.join(ROOT, "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t1-migration");
const PLACE_ID = "pv-hongcheng-lake-park";
const WRITE = process.argv.includes("--write");

const sha256 = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
const rec = JSON.parse(fs.readFileSync(REC_PATH, "utf8"));
const pairsDoc = JSON.parse(fs.readFileSync(PAIRS_PATH, "utf8"));
const blocks = rec.blocks.map((b) => JSON.parse(JSON.stringify(b)));

/* ---------- 1. 第 2 段：回退 AI 补全 ---------- */
const b2 = blocks.find((b) => b.blockId === "blk-hc-2");
const before2 = b2.cnSentences.join("");
const target2 = b2.cnSentences.map((s) => (s === "就是想要那种……" ? "就是要……" : s));
if (target2.join("") === before2) {
  console.log("[warn] 第 2 段未找到待回退的「就是想要那种……」，跳过该段清洗");
} else {
  b2.cnSentences = target2;
  b2.sourceText = target2.join("");
  b2.reviewNote = "末句原话未完：已回退为逐字说法「就是要……」，不替用户补全";
}

/* ---------- 2. 第 4 段：删残留空行 ---------- */
const b4 = blocks.find((b) => b.blockId === "blk-hc-4");
const before4 = b4.cnSentences.join("");
if (b4.cnSentences.some((s) => s.startsWith("\n"))) {
  b4.cnSentences = b4.cnSentences.map((s) => s.replace(/^[\s]+/, ""));
  b4.sourceText = b4.cnSentences.join("");
}

/* ---------- 3. 重算 rawInput 与 sourceSpan（保留段间原有分隔字符） ---------- */
const gaps = [];
for (let i = 0; i < rec.blocks.length - 1; i++) {
  gaps.push(rec.rawInput.slice(rec.blocks[i].sourceSpan.end, rec.blocks[i + 1].sourceSpan.start));
}
const tail = rec.rawInput.slice(rec.blocks[rec.blocks.length - 1].sourceSpan.end);
let raw = "";
blocks.forEach((b, i) => {
  if (i > 0) raw += gaps[i - 1];
  const start = raw.length;
  raw += b.sourceText;
  b.sourceSpan = { start, end: raw.length };
});
raw += tail;

/* ---------- 4. 挂 phrasePairs ---------- */
let pairCount = 0;
let playableCount = 0;
for (const b of blocks) {
  const list = pairsDoc.blocks[b.blockId];
  if (!Array.isArray(list) || !list.length) continue;
  b.phrasePairs = list.map((p) => ({
    id: p.id, zh: p.zh, en: p.en, source: p.source,
    evidence: p.evidence, reviewStatus: p.reviewStatus, playable: p.playable !== false,
  }));
  pairCount += b.phrasePairs.length;
  playableCount += b.phrasePairs.filter((p) => p.playable).length;
}

/* ---------- 5. 自检：句子守恒 / 逐字复原 / id 唯一 ---------- */
const problems = [];
for (const b of blocks) {
  if (raw.slice(b.sourceSpan.start, b.sourceSpan.end) !== b.sourceText)
    problems.push(`span 不一致: ${b.blockId}`);
  if (b.cnSentences.join("") !== b.sourceText)
    problems.push(`cnSentences 拼接不等于 sourceText: ${b.blockId}`);
  for (const p of b.phrasePairs || []) {
    if (/[\u3400-\u9fff]/.test(p.en)) problems.push(`英文里混进中文: ${p.id}`);
    if (!/[\u3400-\u9fff]/.test(p.zh)) problems.push(`中文里缺汉字: ${p.id}`);
  }
}
const ids = blocks.flatMap((b) => (b.phrasePairs || []).map((p) => p.id));
if (new Set(ids).size !== ids.length) problems.push("phrasePairs id 不唯一");

const report = {
  schema: "alw001.n05v13.migration.v1",
  at: new Date().toISOString(),
  mode: WRITE ? "write" : "dry-run",
  recordId: rec.recordId,
  fromRevision: rec.revision,
  rawInput: {
    beforeLen: rec.rawInput.length,
    afterLen: raw.length,
    beforeSha256: sha256(rec.rawInput),
    afterSha256: sha256(raw),
    producedBySourceSpanRecompute: true,
  },
  cleaned: {
    "blk-hc-2": {
      before: before2, after: b2.cnSentences.join(""),
      sha256Before: sha256(before2), sha256After: sha256(b2.cnSentences.join("")),
      note: b2.reviewNote || "未改动",
    },
    "blk-hc-4": {
      before: before4, after: b4.cnSentences.join(""),
      sha256Before: sha256(before4), sha256After: sha256(b4.cnSentences.join("")),
      note: "仅删除 cnSentences[1] 开头残留空行",
    },
  },
  phrasePairs: { blocks: blocks.filter((b) => (b.phrasePairs || []).length).length, total: pairCount, playable: playableCount },
  untouched: Object.keys(pairsDoc.blocks).length - blocks.filter((b) => (b.phrasePairs || []).length).length,
  problems,
};

fs.mkdirSync(QA_DIR, { recursive: true });
fs.writeFileSync(path.join(QA_DIR, WRITE ? "migration-revision3.json" : "migration-dryrun.json"),
  JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (problems.length) { console.error("自检未通过，未写入"); process.exit(1); }
if (!WRITE) { console.log("\n[dry-run] 加 --write 才会写入 revision 3"); process.exit(0); }

/* ---------- 6. 正式写入（带回滚快照） ---------- */
fs.writeFileSync(path.join(QA_DIR, `rec-before-rev3.${Date.now()}.json`), JSON.stringify(rec, null, 2) + "\n");
const { createPlaceNotesStore } = await import(path.join(ROOT, "socialmate-prototype/ai-gateway/place-notes.mjs"));
const store = createPlaceNotesStore({});
const result = await store.createRecord(PLACE_ID, {
  rawInput: raw,
  source: rec.source,
  confirm: true,
  revision: Number(rec.revision),
  recordId: rec.recordId,
  blocks,
});
console.log("[written]", JSON.stringify({
  ok: result?.ok, revision: result?.record?.revision, placeId: result?.record?.placeId,
  recordId: result?.record?.recordId, blocks: result?.record?.blocks?.length,
  pairs: result?.record?.blocks?.reduce((n, b) => n + ((b.phrasePairs || []).length), 0),
}, null, 2));
