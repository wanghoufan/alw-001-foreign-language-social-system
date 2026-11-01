/**
 * P1-01 人物详情聚合 + P1-04 事实精准撤回。
 * 全部在临时目录里跑，不触碰真实 SocialMate-Data。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {appendPeopleFacts, createPersonFile, sourceKey} from "./people-store.mjs";
import {getPersonDetail, parsePersonProfile, revokePersonFact} from "./person-detail.mjs";

const SESSION_A = "sess_20261101T120000_aaa111";
const SESSION_B = "sess_20261102T090000_bbb222";

const MANUAL = `---
name: Anna
city: Haikou
last_contact:
---

# 基本情况

俄罗斯人，在海口做咖啡师。这一行是人工写的段落。

# 兴趣

- 人工写过的兴趣：健身。
`;

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-detail-"));
  const previous = process.env.SM_PEOPLE_DIR;
  process.env.SM_PEOPLE_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.SM_PEOPLE_DIR;
    else process.env.SM_PEOPLE_DIR = previous;
    await fs.rm(dir, {recursive: true, force: true});
  });
  return dir;
}

async function withAnna(t) {
  const dir = await setup(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  await fs.writeFile(path.join(dir, "anna", "00-profile.md"), MANUAL, {encoding: "utf8", mode: 0o600});
  await appendPeopleFacts([
    {slug: "anna", section: "interest", text: "喜欢在海边喝咖啡。", sessionId: SESSION_A,
      segmentIndex: 1, confirmedAt: "2026-11-01T13:00:00.000Z"},
    {slug: "anna", section: "work", text: "在海口的咖啡店工作。", sessionId: SESSION_B,
      segmentIndex: 0, confirmedAt: "2026-11-02T10:00:00.000Z"},
  ]);
  return dir;
}

test("详情：confirmed 只含带来源的已确认事实，manual 保留人工原文", async (t) => {
  await withAnna(t);
  const {person} = await getPersonDetail("anna");
  assert.equal(person.slug, "anna");
  assert.equal(person.name, "Anna");
  assert.equal(person.confirmed.length, 2);
  const [first] = person.confirmed;
  assert.equal(first.text, "喜欢在海边喝咖啡。");
  assert.equal(first.source.sessionId, SESSION_A);
  assert.equal(first.source.segmentIndex, 1);
  assert.equal(first.source.date, "2026-11-01T13:00:00.000Z");
  assert.equal(first.id, sourceKey(SESSION_A, 1, "喜欢在海边喝咖啡。"));
  assert.equal(first.mappable, true);

  assert.ok(person.manual.some((line) => line.includes("俄罗斯人，在海口做咖啡师")),
    "人工段落必须出现在 manual 里");
  assert.ok(person.manual.some((line) => line.includes("人工写过的兴趣：健身。")));
  assert.ok(!person.manual.some((line) => line.includes("喜欢在海边喝咖啡")),
    "已确认事实不应混进 manual");
});

test("详情：没有来源标记的内容绝不当作 confirmed", async (t) => {
  const dir = await setup(t);
  await fs.mkdir(path.join(dir, "bob"), {recursive: true});
  await fs.writeFile(path.join(dir, "bob", "00-profile.md"),
    "---\nname: Bob\n---\n\n# 兴趣\n\n- 他自己说喜欢跑步（没记录来源）。\n", "utf8");
  const {person} = await getPersonDetail("bob");
  assert.equal(person.confirmed.length, 0);
  assert.deepEqual(person.manual, ["他自己说喜欢跑步（没记录来源）。"]);
  assert.equal(person.lastContact, null);
  assert.deepEqual(person.sessions, []);
});

test("详情：sessions 只由已确认事实的来源 sessionId 反查，并带本地话题", async (t) => {
  await withAnna(t);
  const calls = [];
  const {person} = await getPersonDetail("anna", {
    loadSession: async (id) => {
      calls.push(id);
      if (id === SESSION_A) {
        return {startedAt: "2026-11-01T12:00:00.000Z",
          segments: [{textOriginal: "I like coffee near the beach.", speakerId: "spk_1"}]};
      }
      return null; // 归档丢了也照常返回，只是 topics 为空
    },
  });
  assert.deepEqual(calls.sort(), [SESSION_A, SESSION_B].sort(), "只按主档里的来源去查");
  const a = person.sessions.find((s) => s.sessionId === SESSION_A);
  const b = person.sessions.find((s) => s.sessionId === SESSION_B);
  assert.equal(a.archived, true);
  assert.deepEqual(a.topics, ["咖啡", "海边"]);
  assert.equal(a.date, "2026-11-01T13:00:00.000Z");
  assert.equal(b.archived, false);
  assert.deepEqual(b.topics, []);
  assert.equal(person.lastContact, "2026-11-02T10:00:00.000Z", "lastContact 取最新已确认来源时间");
});

test("详情：人物不存在 404，非法路径 400", async (t) => {
  await setup(t);
  await assert.rejects(() => getPersonDetail("nobody"), (error) => error.status === 404);
  for (const slug of ["../etc", "a/../../b", "/etc/passwd", "", ".hidden"]) {
    await assert.rejects(() => getPersonDetail(slug), (error) => error.status === 400);
  }
});

test("解析器：来源行的段号按 1 起展示，解析回 0 起的索引", () => {
  const parsed = parsePersonProfile([
    "---", "name: X", "---", "",
    "# 兴趣", "",
    "- 喜欢爬山（来源：会话 sess_20261101T000000_xyz789 · 段 4 · 2026-11-01 13:00 用户确认）<!--sm-src:aaaaaa111111-->",
  ].join("\n"));
  assert.equal(parsed.confirmed.length, 1);
  assert.equal(parsed.confirmed[0].source.segmentIndex, 3);
  assert.equal(parsed.confirmed[0].section, "兴趣");
  assert.equal(parsed.confirmed[0].text, "喜欢爬山");
  assert.equal(parsed.confirmed[0].source.date, "2026-11-01T13:00:00.000Z");
});

test("撤回：只删这一条事实，人工段落与其它事实原样保留", async (t) => {
  const dir = await withAnna(t);
  const file = path.join(dir, "anna", "00-profile.md");
  const before = await fs.readFile(file, "utf8");
  const {person} = await getPersonDetail("anna");
  const target = person.confirmed.find((item) => item.text === "喜欢在海边喝咖啡。");

  const result = await revokePersonFact("anna", {factId: target.id, confirm: true});
  assert.equal(result.ok, true);
  assert.equal(result.keptManual, true);
  assert.equal(result.alreadyRemoved, false);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].text, "喜欢在海边喝咖啡。");

  const after = await fs.readFile(file, "utf8");
  assert.ok(!after.includes("喜欢在海边喝咖啡。"), "目标事实必须消失");
  assert.ok(after.includes("在海口的咖啡店工作。"), "其它事实必须保留");
  assert.ok(after.includes("俄罗斯人，在海口做咖啡师"), "人工段落必须保留");
  assert.ok(after.includes("人工写过的兴趣：健身。"), "人工列表项必须保留");
  assert.ok(after.startsWith("---\nname: Anna"), "front matter 必须保留");
  assert.equal(((await fs.stat(file)).mode & 0o777).toString(8), "600");
  assert.equal(((await fs.stat(path.join(dir, "anna"))).mode & 0o777).toString(8), "700");

  const backup = path.join(dir, result.backup);
  assert.equal(await fs.readFile(backup, "utf8"), before, "备份必须是撤回前的内容");
  assert.equal(((await fs.stat(backup)).mode & 0o777).toString(8), "600");
});

test("撤回幂等：同一 factId 再撤一次返回 alreadyRemoved 而不是报错", async (t) => {
  const dir = await withAnna(t);
  const {person} = await getPersonDetail("anna");
  const target = person.confirmed[0];
  await revokePersonFact("anna", {factId: target.id, confirm: true});
  const after = await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8");

  const again = await revokePersonFact("anna", {factId: target.id, confirm: true});
  assert.equal(again.ok, true);
  assert.equal(again.alreadyRemoved, true);
  assert.deepEqual(again.removed, []);
  assert.equal(await fs.readFile(path.join(dir, "anna", "00-profile.md"), "utf8"), after,
    "重复撤回不得改动文件");
});

test("撤回：找不到 factId 返回 404", async (t) => {
  await withAnna(t);
  await assert.rejects(() => revokePersonFact("anna", {factId: "deadbeef1234", confirm: true}),
    (error) => error.status === 404 && error.code === "FACT_NOT_FOUND");
});

test("撤回：来源无法定位时安全拒绝 409 且不改文件", async (t) => {
  const dir = await setup(t);
  await fs.mkdir(path.join(dir, "carl"), {recursive: true});
  const body = [
    "---", "name: Carl", "---", "",
    "# 兴趣", "",
    "- 喜欢骑行但没有来源行<!--sm-src:abcdef123456-->",
    "",
    "- 人工补充：他住在海口。",
    "",
  ].join("\n");
  const file = path.join(dir, "carl", "00-profile.md");
  await fs.writeFile(file, body, "utf8");

  await assert.rejects(() => revokePersonFact("carl", {factId: "abcdef123456", confirm: true}),
    (error) => error.status === 409 && error.code === "SOURCE_UNMAPPABLE"
      && error.message === "无法定位来源，请手工处理");
  assert.equal(await fs.readFile(file, "utf8"), body, "安全拒绝时一个字节都不能改");
});

test("撤回：缺少二次确认 400，非法 factId 400，人物不存在 404", async (t) => {
  await withAnna(t);
  const {person} = await getPersonDetail("anna");
  await assert.rejects(() => revokePersonFact("anna", {factId: person.confirmed[0].id}),
    (error) => error.status === 400 && error.code === "CONFIRM_REQUIRED");
  await assert.rejects(() => revokePersonFact("anna", {factId: "../../etc", confirm: true}),
    (error) => error.status === 400 && error.code === "INVALID_FACT_ID");
  await assert.rejects(() => revokePersonFact("nobody", {factId: "abcdef123456", confirm: true}),
    (error) => error.status === 404 && error.code === "PERSON_NOT_FOUND");
  await assert.rejects(() => revokePersonFact("../etc", {factId: "abcdef123456", confirm: true}),
    (error) => error.status === 400);
});
