/**
 * archive-history 定向测试：只读索引 / 过滤 / 导出 / 非法输入。
 * 用临时目录造两份合法归档 + 一份损坏记录，不触碰真实归档目录。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {exportSessions, getSession, listSessions} from "./archive-history.mjs";

function makeSession({sessionId, startedAt, endedAt, text, revision = 1}) {
  return {
    contentHash: `hash-${sessionId}`,
    session: {
      schemaVersion: 1,
      sessionId,
      startedAt,
      endedAt,
      appVersion: "test",
      consent: {recording: true, retention: true, cloudAi: false},
      revision,
      segments: [{
        eventId: "1", startMs: 0, endMs: 1000, receivedAt: startedAt,
        speakerId: "spk_0", track: "mix", provider: "test", mock: false, textOriginal: text,
      }],
    },
  };
}

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-hist-"));
  const d1 = path.join(root, "2026", "11");
  const d2 = path.join(root, "2026", "10");
  await fs.mkdir(d1, {recursive: true});
  await fs.mkdir(d2, {recursive: true});
  await fs.writeFile(path.join(d1, "a.json"), JSON.stringify(makeSession({
    sessionId: "sess_20261101_aaaa", startedAt: "2026-11-01T05:00:00.000Z",
    endedAt: "2026-11-01T05:01:00.000Z", text: "第一条原文",
  })));
  await fs.writeFile(path.join(d1, "b.json"), JSON.stringify(makeSession({
    sessionId: "sess_20261101_bbbb", startedAt: "2026-11-01T06:00:00.000Z",
    endedAt: "2026-11-01T06:00:30.000Z", text: "第二条原文",
  })));
  await fs.writeFile(path.join(d2, "c.json"), JSON.stringify(makeSession({
    sessionId: "sess_20261031_cccc", startedAt: "2026-10-31T23:00:00.000Z",
    endedAt: "2026-10-31T23:02:00.000Z", text: "上个月原文",
  })));
  await fs.writeFile(path.join(d1, "broken.json"), "{not json");
  return root;
}

test("list 返回全部区间并按开始时间倒序", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const data = await listSessions({root});
  assert.equal(data.total, 3);
  assert.equal(data.scanned, 4);
  assert.equal(data.skipped, 1, "损坏记录应被跳过并计数");
  assert.deepEqual(data.items.map((i) => i.sessionId), [
    "sess_20261101_bbbb", "sess_20261101_aaaa", "sess_20261031_cccc",
  ]);
  assert.equal(data.items[0].segmentCount, 1);
  assert.equal(data.items[0].durationMs, 30000);
  assert.equal(data.items[0].hasAi, false);
  // 列表不含原文
  assert.equal("segments" in data.items[0], false);
});

test("list 按 UTC 日期闭区间过滤", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  assert.equal((await listSessions({root, from: "2026-11-01", to: "2026-11-01"})).total, 2);
  assert.equal((await listSessions({root, from: "2026-10-31", to: "2026-10-31"})).total, 1);
  assert.equal((await listSessions({root, from: "2026-12-01"})).total, 0);
});

test("非法日期返回 400", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  await assert.rejects(() => listSessions({root, from: "2026/11/01"}), (e) => e.status === 400);
  await assert.rejects(() => listSessions({root, to: "bad"}), (e) => e.status === 400);
});

test("getSession 返回原文；非法与未知 ID 有明确结果", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const found = await getSession("sess_20261101_aaaa", {root});
  assert.equal(found.session.segments[0].textOriginal, "第一条原文");
  assert.equal(found.item.sessionId, "sess_20261101_aaaa");
  assert.equal(await getSession("sess_doesnotexist99", {root}), null);
  await assert.rejects(() => getSession("../../etc/passwd", {root}), (e) => e.status === 400);
});

test("export 按时间升序拼接并统计", async (t) => {
  const root = await fixture();
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const {markdown, count} = await exportSessions({root, from: "2026-11-01", to: "2026-11-01"});
  assert.equal(count, 2);
  assert.ok(markdown.indexOf("第一条原文") < markdown.indexOf("第二条原文"), "应按开始时间升序");
  assert.equal(markdown.includes("上个月原文"), false, "区间外不应出现");
  assert.match(markdown, /会话数：2/);
});