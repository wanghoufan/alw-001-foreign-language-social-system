#!/usr/bin/env node
/**
 * ALW-001 N05 V1.3 · 合并 / 拆分 的守恒校验（不写生产记录）
 *
 * 从 index.html 切出真实的 mergeBlocks / splitBlock 实现，用真实红城湖 rev3 数据跑：
 *   - 合并第 1+2 段：段数 19→18、句子总数不变、sourceSpan 连续、逐字可复原
 *   - 再把合并结果拆回去：句数守恒、拼回文本与合并前一致
 * 全程把 saveBlocks 替换成捕获器，不写盘、不改用户数据。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统";
const html = fs.readFileSync(path.join(ROOT, "socialmate-v1.2/index.html"), "utf8");
const REC = JSON.parse(fs.readFileSync(path.join(
  ROOT, "SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json"), "utf8"));

const start = html.indexOf("function mergeBlocks(");
const endMark = html.indexOf("/* ===================== GPT 练习 PRACT01");
const src = html.slice(start, endMark);

const captured = [];
const fn = new Function("rec", "note", "saveBlocks", "N", `
  ${src}
  return { mergeBlocks, splitBlock };
`);
const notes = [];
const api = fn(REC, (m) => notes.push(m), (record, blocks) => { captured.push(blocks); return Promise.resolve(true); },
  { view: { recordId: REC.recordId, placeId: "pv-hongcheng-lake-park" } });

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

const before = REC.blocks;
const sentenceCount = (blocks) => blocks.reduce((n, b) => n + (b.cnSentences || []).length, 0);
const contiguous = (blocks) => blocks.every((b, i) => i === 0
  ? b.sourceSpan.start >= 0
  : b.sourceSpan.start >= blocks[i - 1].sourceSpan.end);

check("M1 原始数据 19 段 / 句子守恒基线", before.length === 19, `blocks=${before.length} sentences=${sentenceCount(before)}`);

api.mergeBlocks(REC, 0);
const merged = captured.pop();
check("M2 合并第 1+2 段后段数 19→18", merged && merged.length === 18, `blocks=${merged && merged.length}`);
check("M3 合并后句子总数不变", merged && sentenceCount(merged) === sentenceCount(before),
  `before=${sentenceCount(before)} after=${merged && sentenceCount(merged)}`);
check("M4 合并后 sourceSpan 连续", merged && contiguous(merged), "逐段 start>=上一段 end");
check("M5 合并后逐字复原（每段 sourceText 与原文区间一致）",
  merged && merged.every((b) => REC.rawInput.slice(b.sourceSpan.start, b.sourceSpan.end) === b.sourceText),
  "全部一致");

const mergedRec = { ...REC, blocks: merged };
api.splitBlock(mergedRec, 0);
const split = captured.pop();
check("M6 合并结果可再拆回 2 段（19 段恢复）", split && split.length === 19, `blocks=${split && split.length}`);
check("M7 拆回后句子总数仍守恒", split && sentenceCount(split) === sentenceCount(before),
  `before=${sentenceCount(before)} after=${split && sentenceCount(split)}`);
check("M8 拆回后两段文本拼起来等于合并段的 sourceText（段间原有分隔字符保留在合并段内）",
  split && split[0].sourceText + split[1].sourceText === merged[0].sourceText
    && (split[0].sourceText + split[1].sourceText).startsWith(before[0].sourceText),
  `merged="${merged[0].sourceText.slice(0, 30)}…" split="${(split[0].sourceText + split[1].sourceText).slice(0, 30)}…"`);
check("M9 拆分产生新 blockId，不与旧段冲突",
  split && split[0].blockId !== before[0].blockId && !before.some((b) => b.blockId === split[0].blockId),
  `newId=${split && split[0].blockId}`);

const fail = results.filter((r) => !r.ok);
fs.mkdirSync(path.join(ROOT, "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5"), { recursive: true });
fs.writeFileSync(path.join(ROOT,
  "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5/merge-split-unit.json"),
  JSON.stringify({ schema: "alw001.n05v13.merge-split.v1", at: new Date().toISOString(), recordId: REC.recordId,
    revision: REC.revision, wroteNothing: true, total: results.length, passed: results.length - fail.length,
    failed: fail.length, results }, null, 2) + "\n");
console.log(`\n${results.length - fail.length}/${results.length} PASS（未写入任何记录）`);
process.exit(fail.length ? 1 : 0);
