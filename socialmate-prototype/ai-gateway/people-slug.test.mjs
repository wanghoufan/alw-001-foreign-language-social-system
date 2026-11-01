/**
 * P1-02 人物 slug 自动建议：规则、可用性、重名替代，以及「输入名字不创建任何东西」。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {suggestSlug} from "./people-store.mjs";

async function tempRoot(t, slugs = []) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-slug-"));
  for (const slug of slugs) await fs.mkdir(path.join(root, slug), {recursive: true});
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  return root;
}

test("拉丁名转小写 ASCII + 连字符", async (t) => {
  const root = await tempRoot(t);
  const result = await suggestSlug("Anna Maria", {root});
  assert.equal(result.slug, "anna-maria");
  assert.equal(result.available, true);
  assert.equal(result.alternative, "anna-maria-2", "首选可用时给出下一个候选");
});

test("去重音、折叠分隔符、去掉首尾连字符", async (t) => {
  const root = await tempRoot(t);
  assert.equal((await suggestSlug("François", {root})).slug, "francois");
  assert.equal((await suggestSlug("  --Bob__Lee--  ", {root})).slug, "bob-lee");
  assert.equal((await suggestSlug("Anna   王", {root})).slug, "anna", "混合名只保留拉丁部分");
});

test("中文/不支持字符用无含义短 ID", async (t) => {
  const root = await tempRoot(t);
  const result = await suggestSlug("王小明", {root, now: "2026-11-01T03:00:00.000Z", randomHex: "A1B2"});
  assert.equal(result.slug, "person-20261101-a1b2");
  assert.equal(result.available, true);
  assert.match(result.slug, /^person-\d{8}-[0-9a-f]{4}$/);
  assert.match((await suggestSlug("!!!", {root, now: "2026-11-01T03:00:00.000Z", randomHex: "00ff"})).slug,
    /^person-20261101-00ff$/);
});

test("重名时给可用替代，且同样可用时优先 -2", async (t) => {
  const root = await tempRoot(t, ["anna"]);
  const taken = await suggestSlug("Anna", {root});
  assert.equal(taken.slug, "anna");
  assert.equal(taken.available, false);
  assert.equal(taken.alternative, "anna-2");

  await fs.mkdir(path.join(root, "anna-2"));
  const twice = await suggestSlug("Anna", {root});
  assert.equal(twice.available, false);
  assert.equal(twice.alternative, "anna-3");
});

test("名字里的路径片段不会被带进 slug", async (t) => {
  const root = await tempRoot(t);
  for (const name of ["../../etc/passwd", "/etc/passwd", "..\\..\\windows", "a/../b"]) {
    const result = await suggestSlug(name, {root});
    assert.ok(!result.slug.includes(".."), `${name} 不应产生目录穿越片段`);
    assert.ok(!result.slug.includes("/"), `${name} 不应产生路径分隔符`);
    assert.match(result.slug, /^[a-z0-9][a-z0-9-]*$/);
  }
});

test("超长名字截断后仍是合法 slug", async (t) => {
  const root = await tempRoot(t);
  const result = await suggestSlug("A".repeat(120), {root});
  assert.ok(result.slug.length <= 48);
  assert.match(result.slug, /^[a-z0-9][a-z0-9-]*$/);
});

test("空名字明确拒绝，而不是给出随机标识", async (t) => {
  const root = await tempRoot(t);
  for (const name of ["", "   ", null, undefined]) {
    await assert.rejects(() => suggestSlug(name, {root}), (error) => error.status === 400);
  }
});

test("只建议不落盘：输入名字不创建人物目录", async (t) => {
  const root = await tempRoot(t);
  const before = await fs.readdir(root);
  await suggestSlug("Nobody Here", {root});
  await suggestSlug("王小明", {root});
  assert.deepEqual(await fs.readdir(root), before, "建议阶段绝不能创建目录");
  assert.deepEqual(before, []);
});

test("不做身份推断：相同显示名只做字符转换，结果稳定可复现", async (t) => {
  const root = await tempRoot(t);
  const a = await suggestSlug("Anna", {root});
  const b = await suggestSlug("Anna", {root});
  assert.equal(a.slug, b.slug);
  assert.equal(a.slug.includes("person-"), false, "有拉丁字符时不应退化成无含义 ID");
});
