/**
 * P1-03 会话历史服务端检索 + 分页。全部在临时归档目录里跑。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {SEARCH_LIMIT_DEFAULT, SEARCH_LIMIT_MAX, searchSessions} from "./archive-history.mjs";
import {writeProfile} from "./profile-store.mjs";

function session({sessionId, startedAt, texts}) {
  return {
    sessionId,
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + 60_000).toISOString(),
    segments: texts.map((text, index) => ({
      speakerId: `spk_${index % 2}`, startMs: index * 1000, endMs: index * 1000 + 900,
      textOriginal: text,
    })),
  };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-search-"));
  const profileDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "sm-search-profile-")), "Profile");
  const previousProfile = process.env.SM_PROFILE_DIR;
  process.env.SM_PROFILE_DIR = profileDir;
  t.after(async () => {
    if (previousProfile === undefined) delete process.env.SM_PROFILE_DIR;
    else process.env.SM_PROFILE_DIR = previousProfile;
    await fs.rm(root, {recursive: true, force: true});
    await fs.rm(path.dirname(profileDir), {recursive: true, force: true});
  });

  const dir = path.join(root, "2026", "11");
  await fs.mkdir(dir, {recursive: true});
  const records = [
    {id: "sess_20261101T050000_aaaa11", at: "2026-11-01T05:00:00.000Z", texts: ["I like coffee a lot.", "See you."]},
    {id: "sess_20261102T050000_bbbb22", at: "2026-11-02T05:00:00.000Z", texts: ["Let's go running on Sunday.", "It rains."]},
    {id: "sess_20261103T050000_cccc33", at: "2026-11-03T05:00:00.000Z", texts: ["Coffee near the beach is great.", "Yes."]},
    {id: "sess_20261104T050000_dddd44", at: "2026-11-04T05:00:00.000Z", texts: ["My name is Anna.", "Nice to meet you."]},
    {id: "sess_20261105T050000_eeee55", at: "2026-11-05T05:00:00.000Z", texts: ["No keywords here.", "Nothing."]},
  ];
  for (const record of records) {
    const payload = {contentHash: `hash-${record.id}`, session: session({
      sessionId: record.id, startedAt: record.at, texts: record.texts,
    })};
    await fs.writeFile(path.join(dir, `${record.id}.json`), JSON.stringify(payload), "utf8");
  }
  // 只有被用户确认归属过的会话才算「和 anna 有关」，文本里出现名字不算。
  await writeProfile({
    stories: [],
    people: [{id: "pp-1", name: "Anna", peopleSlug: "anna", about: "", notes: []}],
    sources: [
      {key: "k1", sessionId: records[0].id, kind: "person", peopleSlug: "anna", target: "person:pp-1",
        text: "I like coffee a lot.", addedAt: "2026-11-01T06:00:00.000Z"},
      {key: "k2", sessionId: records[2].id, kind: "person", peopleSlug: "anna", target: "person:pp-1",
        text: "Coffee near the beach is great.", addedAt: "2026-11-03T06:00:00.000Z"},
    ],
  });
  return {root, ids: records.map((record) => record.id)};
}

test("关键词检索：只返回命中的会话，带摘要与命中段数", async (t) => {
  const {root, ids} = await fixture(t);
  const data = await searchSessions({root, q: "coffee"});
  assert.deepEqual(data.items.map((item) => item.sessionId), [ids[2], ids[0]], "按时间倒序");
  assert.equal(data.matched, 2);
  assert.equal(data.items[0].segments.total, 2);
  assert.equal(data.items[0].segments.matched, 1);
  assert.equal(data.items[0].segments.excerpts[0].index, 0);
  assert.ok(data.items[0].segments.excerpts[0].text.includes("Coffee"), "摘要里要能看到命中上下文");
});

test("关键词大小写不敏感，且不提供 q 时返回全部（无摘要）", async (t) => {
  const {root} = await fixture(t);
  assert.equal((await searchSessions({root, q: "COFFEE"})).matched, 2);
  const all = await searchSessions({root});
  assert.equal(all.items.length, 5);
  assert.equal(all.items[0].segments.matched, 0);
  assert.deepEqual(all.items[0].segments.excerpts, []);
});

test("person 过滤只按用户确认过的人物归属，不按文本里的名字", async (t) => {
  const {root, ids} = await fixture(t);
  const data = await searchSessions({root, person: "anna"});
  assert.deepEqual(data.items.map((item) => item.sessionId).sort(), [ids[0], ids[2]].sort());
  for (const item of data.items) {
    assert.deepEqual(item.people, [{slug: "anna", name: "Anna"}]);
  }
  // 文本里写着 "My name is Anna" 的会话不在结果里，因为没有确认归属记录。
  assert.equal(data.items.some((item) => item.sessionId === ids[3]), false);
  assert.equal((await searchSessions({root, person: "nobody"})).items.length, 0);
  assert.equal((await searchSessions({root, person: "anna", q: "running"})).items.length, 0);
});

test("分页：limit 生效，cursor 可翻完全部且不重不漏", async (t) => {
  const {root} = await fixture(t);
  const seen = [];
  let cursor = "";
  let pages = 0;
  for (;;) {
    const page = await searchSessions({root, limit: 2, cursor});
    pages += 1;
    assert.ok(page.items.length <= 2);
    seen.push(...page.items.map((item) => item.sessionId));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    assert.ok(pages < 10, "分页不应死循环");
  }
  assert.equal(pages, 3);
  assert.equal(seen.length, 5);
  assert.equal(new Set(seen).size, 5, "翻页不能重复");
});

test("limit 边界：超上限压到 50，0/负数压到 1，非法值回落默认", async (t) => {
  const {root} = await fixture(t);
  assert.equal((await searchSessions({root, limit: 999})).limit, SEARCH_LIMIT_MAX);
  assert.equal((await searchSessions({root, limit: 0})).limit, 1);
  assert.equal((await searchSessions({root, limit: -5})).limit, 1);
  assert.equal((await searchSessions({root, limit: "abc"})).limit, SEARCH_LIMIT_DEFAULT);
  assert.equal((await searchSessions({root, limit: ""})).limit, SEARCH_LIMIT_DEFAULT);
  assert.equal((await searchSessions({root, limit: 2})).items.length, 2);
});

test("区间过滤按 UTC 日期闭区间", async (t) => {
  const {root} = await fixture(t);
  assert.equal((await searchSessions({root, from: "2026-11-02", to: "2026-11-03"})).items.length, 2);
  assert.equal((await searchSessions({root, to: "2026-10-31"})).items.length, 0);
});

test("非法参数明确 400：日期、cursor、person 片段", async (t) => {
  const {root} = await fixture(t);
  await assert.rejects(() => searchSessions({root, from: "2026/11/01"}), (error) => error.status === 400);
  await assert.rejects(() => searchSessions({root, cursor: "!!!bad!!!"}), (error) => error.status === 400);
  await assert.rejects(() => searchSessions({root, person: "../../etc"}), (error) => error.status === 400);
  // 合法但指向已消失会话的 cursor：返回空页而不是报错或重来。
  const page = await searchSessions({root, limit: 2});
  const stale = Buffer.from("2020-01-01T00:00:00.000Z|sess_gone_zzzz").toString("base64url");
  assert.deepEqual((await searchSessions({root, limit: 2, cursor: stale, q: ""})).items, []);
  assert.ok(page.nextCursor);
});
