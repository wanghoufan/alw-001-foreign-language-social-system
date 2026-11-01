import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {confirmReview} from "./review-confirm.mjs";

const TEMPLATE = `---
name: Anna
city: Haikou
---

# 兴趣

- 人工写入：健身。
`;

const BOB = TEMPLATE.replace("name: Anna", "name: Bob");

async function setup(t, dirs = {anna: TEMPLATE, bob: BOB}) {
  const people = await fs.mkdtemp(path.join(os.tmpdir(), "sm-confirm-people-"));
  for (const [slug, body] of Object.entries(dirs)) {
    await fs.mkdir(path.join(people, slug), {recursive: true});
    await fs.writeFile(path.join(people, slug, "00-profile.md"), body, "utf8");
  }
  const profile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "sm-confirm-profile-")), "Profile");
  const previousPeople = process.env.SM_PEOPLE_DIR;
  const previousProfile = process.env.SM_PROFILE_DIR;
  process.env.SM_PEOPLE_DIR = people;
  process.env.SM_PROFILE_DIR = profile;
  t.after(async () => {
    if (previousPeople === undefined) delete process.env.SM_PEOPLE_DIR;
    else process.env.SM_PEOPLE_DIR = previousPeople;
    if (previousProfile === undefined) delete process.env.SM_PROFILE_DIR;
    else process.env.SM_PROFILE_DIR = previousProfile;
    await fs.rm(people, {recursive: true, force: true});
    await fs.rm(path.dirname(profile), {recursive: true, force: true});
  });
  return {people, profile};
}

const SESSION = {
  sessionId: "sess_20261101T120000_abc123",
  segments: [
    {speakerId: "spk_0", startMs: 0, endMs: 1000, textOriginal: "I like hiking on Sunday."},
    {speakerId: "spk_1", startMs: 1000, endMs: 2000, textOriginal: "I work at a cafe near the sea."},
  ],
};

test("确认后只给被选中的人物写事实，其它人物档案字节不变", async (t) => {
  const {people, profile} = await setup(t);
  const bobBefore = await fs.readFile(path.join(people, "bob", "00-profile.md"), "utf8");

  const result = await confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [
      {kind: "self", text: "I like hiking on Sunday.", segmentIndex: 0},
      {kind: "person", peopleSlug: "anna", section: "work", text: "She works at a cafe near the sea.", segmentIndex: 1},
    ],
  }, SESSION);

  assert.equal(result.added.stories, 1);
  assert.equal(result.added.notes, 1);
  assert.equal(result.people.added.length, 1);
  assert.equal(result.people.added[0].slug, "anna");

  const anna = await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8");
  assert.ok(anna.includes("She works at a cafe near the sea."));
  assert.ok(anna.includes("# 工作 / 学习"));
  assert.ok(anna.includes("- 人工写入：健身。"), "人工内容必须保留");
  assert.equal(await fs.readFile(path.join(people, "bob", "00-profile.md"), "utf8"), bobBefore);

  const stored = JSON.parse(await fs.readFile(path.join(profile, "current.json"), "utf8"));
  assert.equal(stored.stories.length, 1);
  assert.equal(stored.people.length, 1);
  assert.equal(stored.people[0].peopleSlug, "anna");
  assert.equal(stored.sources[1].peopleSlug, "anna");
});

test("重复确认不会在人物主档或本机档案里新增第二条", async (t) => {
  const {people, profile} = await setup(t);
  const items = [{kind: "person", peopleSlug: "anna", section: "interest", text: "She likes coffee.", segmentIndex: 1}];
  await confirmReview({confirm: true, sessionId: SESSION.sessionId, items}, SESSION);
  const md = await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8");
  const json = await fs.readFile(path.join(profile, "current.json"), "utf8");

  const again = await confirmReview({confirm: true, sessionId: SESSION.sessionId, items}, SESSION);
  assert.equal(again.unchanged, true);
  assert.equal(await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8"), md);
  // Profile 的 updatedAt 只在真正写入时变化，重复确认不写盘。
  assert.equal(await fs.readFile(path.join(profile, "current.json"), "utf8"), json);
});

test("本机档案写入失败时，人物主档回滚到写入前的内容", async (t) => {
  const {people} = await setup(t);
  const annaFile = path.join(people, "anna", "00-profile.md");
  const before = await fs.readFile(annaFile, "utf8");

  // 把档案目录占成一个普通文件，writeProfile 的 mkdir 必然失败。
  await fs.writeFile(process.env.SM_PROFILE_DIR, "not a directory", "utf8");

  await assert.rejects(() => confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "person", peopleSlug: "anna", section: "interest", text: "She likes coffee.", segmentIndex: 1}],
  }, SESSION), (error) => {
    assert.ok(Array.isArray(error.peopleRolledBack), "错误里要带已回滚的文件清单");
    return true;
  });

  assert.equal(await fs.readFile(annaFile, "utf8"), before, "人物主档必须回滚，不能只写一半");
});

test("未显式选人的人物候选留在待确认，两处都不写", async (t) => {
  const {people, profile} = await setup(t);
  const before = await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8");
  const result = await confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "person", name: "Anna", text: "She likes coffee.", segmentIndex: 1}],
  }, SESSION);
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "PERSON_NOT_SELECTED");
  assert.equal(await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8"), before);
  await assert.rejects(() => fs.stat(path.join(profile, "current.json")), /ENOENT/);
});

test("段号指不到原文时两处都不写", async (t) => {
  const {people, profile} = await setup(t);
  const before = await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8");
  const result = await confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "person", peopleSlug: "anna", text: "She likes coffee.", segmentIndex: 7}],
  }, SESSION);
  assert.equal(result.unchanged, true);
  assert.equal(result.skipped[0].reason, "SEGMENT_NOT_FOUND");
  assert.equal(await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8"), before);
  await assert.rejects(() => fs.stat(path.join(profile, "current.json")), /ENOENT/);
});

test("显式新建人物：先建模板再写事实，其余人物档案不变", async (t) => {
  const {people, profile} = await setup(t);
  const annaBefore = await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8");
  const result = await confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "person", createPerson: true, peopleSlug: "bruno", personName: "Bruno",
      section: "interest", text: "He likes hiking.", segmentIndex: 0}],
  }, SESSION);

  assert.deepEqual(result.people.created, ["bruno"]);
  assert.equal(result.people.added[0].slug, "bruno");
  const md = await fs.readFile(path.join(people, "bruno", "00-profile.md"), "utf8");
  assert.match(md, /^name: Bruno$/m);
  assert.ok(md.includes("He likes hiking."));
  assert.ok(md.includes("# 兴趣"));
  assert.equal(await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8"), annaBefore);
  const stored = JSON.parse(await fs.readFile(path.join(profile, "current.json"), "utf8"));
  assert.equal(stored.people[0].peopleSlug, "bruno");
});

test("只勾了「关于我」时，不会留下空的新建人物档案", async (t) => {
  const {people} = await setup(t);
  const result = await confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "self", text: "I like hiking on Sunday.", segmentIndex: 0}],
  }, SESSION);
  assert.equal(result.added.stories, 1);
  assert.deepEqual(result.people.created, []);
  await assert.rejects(() => fs.stat(path.join(people, "bruno")), /ENOENT/);
});

test("新建人物但本机档案写入失败：事实回滚，新建的空主档被删掉", async (t) => {
  const {people} = await setup(t);
  await fs.writeFile(process.env.SM_PROFILE_DIR, "not a directory", "utf8");
  await assert.rejects(() => confirmReview({
    confirm: true, sessionId: SESSION.sessionId,
    items: [{kind: "person", createPerson: true, peopleSlug: "bruno", personName: "Bruno",
      section: "interest", text: "He likes hiking.", segmentIndex: 0}],
  }, SESSION), (error) => {
    assert.deepEqual(error.peopleCreatedRemoved, ["bruno"]);
    return true;
  });
  await assert.rejects(() => fs.stat(path.join(people, "bruno")), /ENOENT/,
    "回滚后不应留下只写了模板的空档案");
});

test("多人档案：三条事实分别落在各自人物，互不污染", async (t) => {
  const {people} = await setup(t, {anna: TEMPLATE, bob: BOB, chen: TEMPLATE.replace("name: Anna", "name: Chen")});
  const session = {
    sessionId: "sess_20261101T130000_multi01",
    segments: [
      {speakerId: "spk_0", startMs: 0, endMs: 1000, textOriginal: "I like hiking."},
      {speakerId: "spk_1", startMs: 1000, endMs: 2000, textOriginal: "I work at a cafe."},
      {speakerId: "spk_2", startMs: 2000, endMs: 3000, textOriginal: "I love Hainan food."},
      {speakerId: "spk_0", startMs: 3000, endMs: 4000, textOriginal: "I usually run on Sunday."},
    ],
  };
  const snapshot = async () => ({
    anna: await fs.readFile(path.join(people, "anna", "00-profile.md"), "utf8"),
    bob: await fs.readFile(path.join(people, "bob", "00-profile.md"), "utf8"),
    chen: await fs.readFile(path.join(people, "chen", "00-profile.md"), "utf8"),
  });
  const before = await snapshot();

  const result = await confirmReview({
    confirm: true, sessionId: session.sessionId,
    items: [
      {kind: "person", peopleSlug: "anna", section: "interest", text: "She likes hiking.", segmentIndex: 0},
      {kind: "person", peopleSlug: "bob", section: "work", text: "He works at a cafe.", segmentIndex: 1},
      {kind: "person", peopleSlug: "chen", section: "preference", text: "She loves Hainan food.", segmentIndex: 2},
      {kind: "self", text: "I usually run on Sunday.", segmentIndex: 3},
    ],
  }, session);

  assert.equal(result.people.added.length, 3);
  const after = await snapshot();
  assert.ok(after.anna.includes("She likes hiking."));
  assert.ok(after.bob.includes("He works at a cafe."));
  assert.ok(after.chen.includes("She loves Hainan food."));
  assert.ok(!after.anna.includes("He works at a cafe."), "A 的档案不能出现 B 的事实");
  assert.ok(!after.bob.includes("She loves Hainan food."), "B 的档案不能出现 C 的事实");
  assert.ok(after.bob.startsWith(before.bob.slice(0, 40)), "front matter 必须保留");
  assert.equal(result.added.stories, 1);
});
