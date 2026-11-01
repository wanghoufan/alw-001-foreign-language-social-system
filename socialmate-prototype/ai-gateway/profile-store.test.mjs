import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {normalizeProfile, readProfile, writeProfile} from "./profile-store.mjs";

async function tempRoot(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-profile-"));
  const previous = process.env.SM_PROFILE_DIR;
  process.env.SM_PROFILE_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.SM_PROFILE_DIR;
    else process.env.SM_PROFILE_DIR = previous;
    await fs.rm(dir, {recursive: true, force: true});
  });
  return dir;
}

test("readProfile 在无文件时返回 null", async (t) => {
  await tempRoot(t);
  assert.equal(await readProfile(), null);
});

test("写入后可按结构读回，且只保留已知字段", async (t) => {
  const dir = await tempRoot(t);
  const profile = await writeProfile({
    confirm: true,
    theme: "dark",
    display: {font: "large"},
    stories: [{
      id: "s1", title: "晨跑", cat: "兴趣", tags: ["跑步", "咖啡"],
      cn: "我每周跑三次。", en: "I run three times a week.", extra: "drop me",
    }],
    people: [{id: "p1", name: "Anna", about: "健身搭子", notes: ["喜欢咖啡"], private: "drop me"}],
  });

  assert.equal(profile.schema, 1);
  assert.equal(profile.confirmedByUser, true);
  assert.ok(profile.updatedAt);
  assert.equal("theme" in profile, false);
  assert.equal("display" in profile, false);
  assert.equal("extra" in profile.stories[0], false);
  assert.equal("private" in profile.people[0], false);

  const back = await readProfile();
  assert.deepEqual(back.stories, profile.stories);
  assert.deepEqual(back.people, profile.people);

  const markdown = await fs.readFile(path.join(dir, "current.md"), "utf8");
  assert.match(markdown, /# SocialMate 本机档案/);
  assert.match(markdown, /### 晨跑/);
  assert.match(markdown, /English: I run three times a week\./);
});

test("超长与超量输入被截断，不抛错", async (t) => {
  await tempRoot(t);
  const tags = Array.from({length: 20}, (_, i) => "t" + i);
  const stories = Array.from({length: 260}, (_, i) => ({id: "s" + i, title: "x".repeat(5000)}));
  const profile = await writeProfile({stories, people: [], tags});
  assert.equal(profile.stories.length, 200);
  assert.equal(profile.stories[0].title.length, 200);
});

test("normalizeProfile 拒绝非对象", () => {
  assert.throws(() => normalizeProfile(null), TypeError);
  assert.throws(() => normalizeProfile("x"), TypeError);
});

test("缺少显式确认时仍会归一化，但确认标记由服务层把关", async (t) => {
  await tempRoot(t);
  const profile = await writeProfile({stories: [], people: []});
  assert.equal(profile.confirmedByUser, true);
  assert.deepEqual(profile.stories, []);
});