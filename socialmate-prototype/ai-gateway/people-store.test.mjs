import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {appendPeopleFacts, createPersonFile, listPeople, removeEmptyPersonFile, sourceKey} from "./people-store.mjs";

const TEMPLATE = `---
name: Anna
country: Russia
city: Haikou
tags: [coffee]
---

# 基本情况

俄罗斯人，在海口工作。

# 兴趣

- 已经人工写过的兴趣：健身。

# 工作 / 学习

未提供其他信息。

# 后续可以继续的话题

- 周末是否去了万宁
`;

async function tempPeople(t, people = {anna: TEMPLATE}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-people-"));
  const previous = process.env.SM_PEOPLE_DIR;
  process.env.SM_PEOPLE_DIR = dir;
  for (const [slug, body] of Object.entries(people)) {
    await fs.mkdir(path.join(dir, slug), {recursive: true});
    await fs.writeFile(path.join(dir, slug, "00-profile.md"), body, "utf8");
  }
  t.after(async () => {
    if (previous === undefined) delete process.env.SM_PEOPLE_DIR;
    else process.env.SM_PEOPLE_DIR = previous;
    await fs.rm(dir, {recursive: true, force: true});
  });
  return dir;
}

const FACT = {
  slug: "anna", section: "interest", text: "喜欢在海边喝咖啡。",
  sessionId: "sess_20261101T120000_abc123", segmentIndex: 2, confirmedAt: "2026-11-01T13:00:00.000Z",
};

test("追加到指定章节：front matter 与人工段落不变，来源可见", async (t) => {
  const dir = await tempPeople(t);
  const result = await appendPeopleFacts([FACT]);
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].section, "interest");

  const md = await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8");
  assert.ok(md.startsWith("---\nname: Anna"), "front matter 必须原样保留");
  assert.ok(md.includes("- 已经人工写过的兴趣：健身。"), "人工写的条目必须保留");
  assert.ok(md.includes("喜欢在海边喝咖啡。"));
  assert.ok(md.includes("段 3"), "段号按 1 开始展示");
  assert.ok(md.includes(FACT.sessionId));
  assert.ok(md.includes(`<!--sm-src:${sourceKey(FACT.sessionId, 2, FACT.text)}-->`));

  // 事实应落在「兴趣」章节内，而不是文件末尾。
  const interest = md.indexOf("# 兴趣");
  const work = md.indexOf("# 工作 / 学习");
  const at = md.indexOf("喜欢在海边喝咖啡。");
  assert.ok(interest < at && at < work, "事实应写进「兴趣」章节区间内");
});

test("重复保存同一条事实不产生第二份", async (t) => {
  const dir = await tempPeople(t);
  await appendPeopleFacts([FACT]);
  const before = await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8");
  const again = await appendPeopleFacts([FACT]);
  assert.equal(again.added.length, 0);
  assert.equal(again.skipped[0].reason, "DUPLICATE");
  const after = await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8");
  assert.equal(after, before, "重复保存不应改动文件字节");
});

test("章节不存在时在文末新建标题，不破坏既有结构", async (t) => {
  const dir = await tempPeople(t);
  await appendPeopleFacts([{...FACT, section: "common", text: "都住在海口。"}]);
  const md = await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8");
  assert.ok(md.includes("# 共同点"));
  assert.ok(md.indexOf("# 共同点") > md.indexOf("# 后续可以继续的话题"));
});

test("人物主档不存在时不创建、不报错", async (t) => {
  const dir = await tempPeople(t);
  const result = await appendPeopleFacts([{...FACT, slug: "bob"}]);
  assert.equal(result.added.length, 0);
  assert.equal(result.skipped[0].reason, "PEOPLE_FILE_MISSING");
  await assert.rejects(() => fs.stat(path.join(dir, "bob")), /ENOENT/);
});

test("目录穿越与非法 slug 被拒绝", async (t) => {
  await tempPeople(t);
  for (const slug of ["../etc", "anna/../../x", ".hidden", "", "a b"]) {
    const result = await appendPeopleFacts([{...FACT, slug}]);
    assert.equal(result.added.length, 0, slug + " 不应被写入");
    assert.equal(result.skipped[0].reason, "INVALID_PERSON_SLUG");
  }
});

test("写入后文件 0600、目录 0700，并留下备份", async (t) => {
  const dir = await tempPeople(t);
  const result = await appendPeopleFacts([FACT]);
  const file = path.join(dir, "anna", "00-profile.md");
  assert.equal(((await fs.stat(file)).mode & 0o777).toString(8), "600");
  assert.equal(((await fs.stat(path.join(dir, "anna"))).mode & 0o777).toString(8), "700");
  const backup = path.join(dir, result.added[0].backup);
  const backupText = await fs.readFile(backup, "utf8");
  assert.equal(backupText, TEMPLATE, "备份必须是写入前的内容");
  assert.equal(((await fs.stat(backup)).mode & 0o777).toString(8), "600");
});

test("listPeople 只列真实主档，排除模板", async (t) => {
  await tempPeople(t, {anna: TEMPLATE, bob: TEMPLATE.replace("name: Anna", "name: Bob")});
  await fs.mkdir(path.join(process.env.SM_PEOPLE_DIR, "_template"), {recursive: true});
  await fs.writeFile(path.join(process.env.SM_PEOPLE_DIR, "_template", "00-profile.md"), TEMPLATE, "utf8");
  await fs.mkdir(path.join(process.env.SM_PEOPLE_DIR, "empty-dir"), {recursive: true});
  const people = await listPeople();
  assert.deepEqual(people.map((p) => p.slug), ["anna", "bob"]);
  assert.deepEqual(people.map((p) => p.name), ["Anna", "Bob"]);
});

test("按模板新建人物主档：姓名入 front matter，权限 0700/0600", async (t) => {
  const dir = await tempPeople(t);
  await fs.mkdir(path.join(dir, "_template"), {recursive: true});
  await fs.writeFile(path.join(dir, "_template", "00-profile.md"), TEMPLATE.replace("name: Anna", "name:"), "utf8");

  const result = await createPersonFile({slug: "bruno", name: "Bruno"});
  assert.equal(result.created, true);
  const file = path.join(dir, "bruno", "00-profile.md");
  const md = await fs.readFile(file, "utf8");
  assert.match(md, /^name: Bruno$/m);
  assert.ok(md.includes("# 兴趣"), "模板章节必须保留");
  assert.equal(((await fs.stat(file)).mode & 0o777).toString(8), "600");
  assert.equal(((await fs.stat(path.join(dir, "bruno"))).mode & 0o777).toString(8), "700");

  const again = await createPersonFile({slug: "bruno", name: "另一位"});
  assert.equal(again.created, false);
  assert.equal(await fs.readFile(file, "utf8"), md, "已存在的档案不能被覆盖");
});

test("新建人物拒绝非法标识与空姓名", async (t) => {
  await tempPeople(t);
  for (const slug of ["../x", "a b", "", "-lead"]) {
    await assert.rejects(() => createPersonFile({slug, name: "X"}), /人物标识/);
  }
  await assert.rejects(() => createPersonFile({slug: "okname", name: "  "}), /姓名/);
});

test("姓名里的特殊字符不会破坏 front matter", async (t) => {
  const dir = await tempPeople(t);
  await createPersonFile({slug: "weird", name: "Aa: #1 \"x\"\n---\n# 基本情况\n注入"});
  const md = await fs.readFile(path.join(dir, "weird", "00-profile.md"), "utf8");
  const front = md.slice(0, md.indexOf("\n---", 4));
  assert.ok(!front.includes("\n# 基本情况"), "换行注入必须被消除");
  assert.match(front, /^name: /m);
});

test("removeEmptyPersonFile 只删仍为空的主档", async (t) => {
  const dir = await tempPeople(t);
  await createPersonFile({slug: "empty-one", name: "Empty"});
  assert.equal((await removeEmptyPersonFile("empty-one")).removed, true);
  await assert.rejects(() => fs.stat(path.join(dir, "empty-one")), /ENOENT/);

  await createPersonFile({slug: "kept", name: "Kept"});
  await appendPeopleFacts([{...FACT, slug: "kept"}]);
  assert.equal((await removeEmptyPersonFile("kept")).removed, false);
  assert.ok((await fs.readFile(path.join(dir, "kept", "00-profile.md"), "utf8")).includes("sm-src:"));
});
