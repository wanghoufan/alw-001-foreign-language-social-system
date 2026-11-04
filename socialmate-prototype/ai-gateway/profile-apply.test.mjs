import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {applyProfileCandidates, planProfileCandidates, readProfile, tightenPermissions, writeProfile} from "./profile-store.mjs";

const SESSION_ID = "sess_20261101T120000_abc123";
const SEGMENTS = [0, 1, 2, 3];
const KNOWN_PEOPLE = {anna: {name: "Anna"}};

const ITEMS = [
  {kind: "self", text: "I usually run in Evergreen Park on Sunday mornings.", segmentIndex: 0},
  {kind: "person", peopleSlug: "anna", section: "interest", text: "I like coffee near the sea.", segmentIndex: 1},
];

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

const OPTS = {validSegmentIndexes: SEGMENTS, knownPeople: KNOWN_PEOPLE};

test("没有 confirm:true 时拒绝写入", async (t) => {
  await tempRoot(t);
  await assert.rejects(() => applyProfileCandidates({sessionId: SESSION_ID, items: ITEMS}, OPTS), /显式确认/);
  assert.equal(await readProfile(), null);
});

test("非法 sessionId 与空候选被拒绝", async (t) => {
  await tempRoot(t);
  await assert.rejects(() => applyProfileCandidates({confirm: true, sessionId: "../x", items: ITEMS}, OPTS), /sessionId/);
  await assert.rejects(() => applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: []}, OPTS), /没有勾选/);
});

test("缺少段号校验上下文时 fail closed，不写任何文件", async (t) => {
  const dir = await tempRoot(t);
  await assert.rejects(
    () => applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}),
    /校验段号/,
  );
  await assert.rejects(() => fs.stat(path.join(dir, "current.json")), /ENOENT/);
});

test("段号不在归档原文里时拒收，客户端传参不能自证", async (t) => {
  const dir = await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "self", text: "I have a boat.", segmentIndex: 99}],
  }, OPTS);
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "SEGMENT_NOT_FOUND");
  await assert.rejects(() => fs.stat(path.join(dir, "current.json")), /ENOENT/);
});

test("只落盘勾选条目，并记录来源；重复确认不产生第二份", async (t) => {
  const dir = await tempRoot(t);
  const first = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}, OPTS);
  assert.equal(first.added.stories, 1);
  assert.equal(first.added.notes, 1);
  assert.equal(first.added.people, 1);
  assert.equal(first.sources, 2);

  const profile = await readProfile();
  assert.equal(profile.stories.length, 1);
  assert.equal(profile.stories[0].cat, "会话复盘");
  assert.equal(profile.stories[0].cn, ITEMS[0].text);
  assert.equal(profile.people.length, 1);
  assert.equal(profile.people[0].peopleSlug, "anna");
  assert.deepEqual(profile.people[0].notes, [ITEMS[1].text]);
  assert.equal(profile.sources.length, 2);
  assert.equal(profile.sources[0].segmentIndex, 0);

  const jsonBefore = await fs.readFile(path.join(dir, "current.json"), "utf8");
  const again = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}, OPTS);
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
    people: [{id: "p-human", name: "Anna", peopleSlug: "anna", about: "老朋友", notes: ["人工备注"]}],
  });
  const result = await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}, OPTS);
  assert.equal(result.added.stories, 1);
  assert.equal(result.added.people, 0, "同一 peopleSlug 不应重复创建");
  const profile = await readProfile();
  assert.equal(profile.stories.length, 2);
  assert.equal(profile.stories[0].title, "手写话题");
  assert.equal(profile.stories[0].cn, "人工录入");
  assert.deepEqual(profile.people[0].notes, ["人工备注", ITEMS[1].text]);
  assert.equal(profile.people[0].about, "老朋友");
});

test("人物候选未显式选人时留在待确认，不凭空建人", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "person", name: "Anna", text: "I live in Haikou.", segmentIndex: 2}, ITEMS[0]],
  }, OPTS);
  assert.equal(result.added.stories, 1);
  assert.equal(result.added.notes, 0);
  assert.equal(result.added.people, 0);
  assert.equal(result.skipped[0].reason, "PERSON_NOT_SELECTED");
});

test("人物 slug 不在真实主档里时拒收", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "person", peopleSlug: "nobody", text: "I like tea.", segmentIndex: 1}],
  }, OPTS);
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "UNKNOWN_PERSON");
});

test("用户改写候选时，来源记录保留原始候选文本", async (t) => {
  await tempRoot(t);
  const original = "I like coffee near the sea.";
  const edited = "She likes coffee near the sea.";
  await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "person", peopleSlug: "anna", section: "interest", text: edited,
      originalText: original, segmentIndex: 1}],
  }, OPTS);
  const profile = await readProfile();
  assert.equal(profile.people[0].notes[0], edited);
  assert.equal(profile.sources[0].text, edited);
  assert.equal(profile.sources[0].original, original);
  assert.equal(profile.sources[0].peopleSlug, "anna");
});

test("未知 kind 被跳过，不静默当成事实", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [{kind: "guess", text: "对方喜欢跑步", segmentIndex: 0}],
  }, OPTS);
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "UNKNOWN_KIND");
});

test("plan 阶段不落盘", async (t) => {
  const dir = await tempRoot(t);
  const plan = await planProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}, OPTS);
  assert.equal(plan.changed, true);
  assert.equal(plan.peopleFacts.length, 1);
  await assert.rejects(() => fs.stat(path.join(dir, "current.json")), /ENOENT/);
});

test("current.json 与 current.md 均为 0600，目录 0700", async (t) => {
  const dir = await tempRoot(t);
  await applyProfileCandidates({confirm: true, sessionId: SESSION_ID, items: ITEMS}, OPTS);
  for (const name of ["current.json", "current.md"]) {
    const mode = (await fs.stat(path.join(dir, name))).mode & 0o777;
    assert.equal(mode.toString(8), "600", name + " 应为 0600");
  }
  assert.equal(((await fs.stat(dir)).mode & 0o777).toString(8), "700", "档案目录应为 0700");
});

test("历史遗留 0644 的 current.md 会被收紧到 0600，且正文不变", async (t) => {
  const dir = await tempRoot(t);
  await writeProfile({stories: [{id: "s1", title: "跑步", cn: "我每周日跑步"}], people: []});
  const md = path.join(dir, "current.md");
  await fs.chmod(md, 0o644);
  const before = await fs.readFile(md, "utf8");

  const result = await tightenPermissions();
  assert.equal(((await fs.stat(md)).mode & 0o777).toString(8), "600");
  assert.ok(result.changed.some((c) => c.file === "current.md" && c.from === "644" && c.to === "600"));
  assert.equal(await fs.readFile(md, "utf8"), before, "收紧权限不得改动正文");
});

test("会话级 speakerMap 一次映射整段会话，不再逐句选人", async (t) => {
  await tempRoot(t);
  const items = [
    {speakerId: "spk_0", text: "I'm thinking about joining a weekend cooking class next month.", segmentIndex: 0},
    {speakerId: "spk_1", text: "I have a boat for diving.", segmentIndex: 1},
  ];
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID, items,
  }, {...OPTS, speakerMap: {spk_0: "anna", spk_1: "self"}});
  assert.equal(result.added.notes, 1);
  assert.equal(result.added.stories, 1);
  const profile = await readProfile();
  assert.equal(profile.people[0].peopleSlug, "anna");
  assert.equal(profile.stories[0].cn, items[1].text);
});

test("未指定分节时按内容自动归类，且兼容中文分节名", async (t) => {
  await tempRoot(t);
  const result = await applyProfileCandidates({
    confirm: true, sessionId: SESSION_ID,
    items: [
      {kind: "person", peopleSlug: "anna", text: "I'm studying cost management for cross-border e-commerce.", segmentIndex: 0},
      {kind: "person", peopleSlug: "anna", section: "海南生活", text: "I want to walk around Hongcheng Lake Park.", segmentIndex: 1},
    ],
  }, OPTS);
  const profile = await readProfile();
  const sources = profile.sources.filter((s) => s.peopleSlug === "anna");
  assert.equal(sources[0].section, "work");
  assert.equal(sources[1].section, "hainan");
});
