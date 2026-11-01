import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {applyProfileCandidates, readProfile, writeProfile} from "./profile-store.mjs";

const SESSION_ID = "sess_20261101T120000_abc123";

async function tempRoot(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-apply-"));
  const previous = process.env.SM_PROFILE_DIR;
  process.env.SM_PROFILE_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.SM_PROFILE_DIR;
    else process.env.SM_PROFILE_DIR = previous;
    await fs.rm(dir, {recursive: true, force: true});
  });
  return dir;
}

const ITEMS = [
  {kind: "self", text: "I usually run in Evergreen Park on Sunday mornings.", segmentIndex: 0},
  {kind: "person", name: "Anna", text: "I like coffee near the sea.", segmentIndex: 1},
];

test("没有 confirm:true 时拒绝写入", async (t) => {
  await tempRoot(t);
  await assert.rejects(() => applyProfileCandidates({sessionId: SESSION_ID, items: ITEMS}), /显式确认/);
  assert.equal(await readProfile(), null);
});

test("非法 sessionId 与空候选被拒绝", async (t) => {
  await tempRoot(t);
  await assert.rejects(() => applyProfileCandidates({confirm: true, sessionId: "../x", items: ITEMS}), /sessionId/);
  await assert.rejects(() => applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: []}), /没有勾选/);
});

test("只落盘勾选条目，并记录来源；重复确认不产生第二份", async (t) => {
  const dir = await tempRoot(t);
  const first = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS});
  assert.equal(first.added.stories, 1);
  assert.equal(first.added.notes, 1);
  assert.equal(first.added.people, 1);
  assert.equal(first.sources, 2);

  const profile = await readProfile();
  assert.equal(profile.stories.length, 1);
  assert.equal(profile.stories[0].cat, "会话复盘");
  assert.equal(profile.stories[0].cn, ITEMS[0].text);
  assert.equal(profile.people.length, 1);
  assert.deepEqual(profile.people[0].notes, [ITEMS[1].text]);
  assert.equal(profile.sources.length, 2);
  assert.equal(profile.sources[0].segmentIndex, 0);

  const jsonBefore = await fs.readFile(path.join(dir, "current.json"), "utf8");
  const again = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS});
  assert.equal(again.unchanged, true);
  assert.equal(again.added.stories, 0);
  assert.ok(again.skipped.every((s) => s.reason === "DUPLICATE"));
  const jsonAfter = await fs.readFile(path.join(dir, "current.json"), "utf8");
  assert.equal(jsonAfter, jsonBefore, "重复确认不应改动档案字节");
});

test("不覆盖既有人工内容，只追加", async (t) => {
  await tempRoot(t);
  await writeProfile({
    stories: [{id: "human-1", title: "手写话题", cat: "兴趣", tags: ["跑步"], cn: "人工录入", en: "Human"}],
    people: [{id: "p-human", name: "Anna", about: "老朋友", notes: ["人工备注"]}],
  });
  const result = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS});
  assert.equal(result.added.stories, 1);
  assert.equal(result.added.people, 0, "同名人物不应重复创建");
  const profile = await readProfile();
  assert.equal(profile.stories.length, 2);
  assert.equal(profile.stories[0].title, "手写话题");
  assert.equal(profile.stories[0].cn, "人工录入");
  assert.deepEqual(profile.people[0].notes, ["人工备注", ITEMS[1].text]);
  assert.equal(profile.people[0].about, "老朋友");
});

test("人物候选缺少姓名时跳过，其余条目照常写入", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "person", text: "I live in Haikou.", segmentIndex: 2}, ITEMS[0]],
  });
  assert.equal(result.added.stories, 1);
  assert.equal(result.added.notes, 0);
  assert.equal(result.skipped[0].reason, "NAME_REQUIRED");
});

test("未知 kind 被跳过，不静默当成事实", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "guess", text: "对方喜欢跑步", segmentIndex: 0}],
  });
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "UNKNOWN_KIND");
});
