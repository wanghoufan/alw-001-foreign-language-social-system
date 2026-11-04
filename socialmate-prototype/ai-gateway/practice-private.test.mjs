import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createPracticeReportsStore} from "./practice-reports.mjs";

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-practice-private-"));
  const notesRoot = path.join(root, "PlaceNotes");
  const privatePlacesRoot = path.join(root, "PrivatePlaces");
  const placeId = "pv-hongcheng-lake-park";
  const recordId = "rec-private-01";
  const blockId = "blk-hc-1";
  const record = {
    schema: 1,
    placeId: null,
    recordId,
    rawInput: "晚上在红城湖湖边散步。",
    rawSha256: "abc",
    revision: 2,
    blocks: [{
      blockId,
      order: 0,
      contentRevision: 2,
      sourceText: "晚上在红城湖湖边散步。",
      cnSentences: ["晚上在红城湖湖边散步。"],
      enVariants: ["Take a walk by Hongcheng Lake in the evening.", "Walk along Hongcheng Lake at night."],
      phrases: ["take a walk"],
    }],
    createdAt: "2026-11-03T07:00:00Z",
  };
  const recordDir = path.join(privatePlacesRoot, placeId, "records");
  await fs.mkdir(recordDir, {recursive: true, mode: 0o700});
  await fs.writeFile(path.join(recordDir, `${recordId}.json`), JSON.stringify(record), "utf8");
  const store = createPracticeReportsStore({notesRoot, privatePlacesRoot});
  return {root, notesRoot, privatePlacesRoot, placeId, recordId, blockId, store};
}

test("私有地点 pv-* 的练习复盘可保存、聚合，且两份报告不覆盖", async () => {
  const {privatePlacesRoot, placeId, recordId, blockId, store} = await fixture();
  const first = await store.save(placeId, recordId, blockId, {
    confirm: true,
    contentRevision: 2,
    rawReport: "第一份：需要复习 coconut water。",
    weakPhrases: ["coconut water"],
    status: "confirmed",
  });
  assert.equal(first.ok, true);
  assert.equal(first.report.placeId, placeId);
  const reportDir = path.join(privatePlacesRoot, placeId, "practice", blockId);
  const firstBytes = await fs.readFile(path.join(reportDir, `${first.report.reportId}.json`));
  const second = await store.save(placeId, recordId, blockId, {
    confirm: true,
    contentRevision: 2,
    rawReport: "第二份：Could I get a coconut water?",
    weakPhrases: ["Could I get"],
    status: "confirmed",
  });
  assert.equal(second.ok, true);
  assert.notEqual(second.report.reportId, first.report.reportId);
  const names = (await fs.readdir(reportDir)).filter((name) => name.endsWith(".json")).sort();
  assert.equal(names.length, 2);
  assert.deepEqual(await fs.readFile(path.join(reportDir, `${first.report.reportId}.json`)), firstBytes);
  const agg = await store.aggregate(placeId);
  assert.equal(agg.ok, true);
  assert.equal(agg.placeId, placeId);
  assert.equal(agg.reportCount, 2);
  assert.equal(agg.blocks[0].practiceCount, 2);
});

test("旧版本复目标记 stale-version，不冒充当前版本", async () => {
  const {placeId, recordId, blockId, store} = await fixture();
  const result = await store.save(placeId, recordId, blockId, {
    confirm: true,
    contentRevision: 1,
    rawReport: "基于旧版本的复盘内容。",
    status: "confirmed",
  });
  assert.equal(result.ok, true);
  assert.equal(result.report.status, "stale-version");
  assert.equal(result.staleVersion, true);
});

test("非法地点/块标识被拒绝", async () => {
  const {store} = await fixture();
  await assert.rejects(
    () => store.save("../escape", "rec", "blk", {confirm: true, rawReport: "x"}),
    /placeId/,
  );
});