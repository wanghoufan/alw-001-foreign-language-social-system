/**
 * P2-01 见面前准备：只从已确认事实确定性生成，最多 3 条，纯本地 0 次外部请求。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {appendPeopleFacts, createPersonFile} from "./people-store.mjs";
import {buildPrep, getPersonPrep} from "./person-detail.mjs";

const SESSION = "sess_20261101T120000_prep01";

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-prep-"));
  const previous = process.env.SM_PEOPLE_DIR;
  process.env.SM_PEOPLE_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.SM_PEOPLE_DIR;
    else process.env.SM_PEOPLE_DIR = previous;
    await fs.rm(dir, {recursive: true, force: true});
  });
  return dir;
}

async function personWithFacts(t, facts) {
  const dir = await setup(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  if (facts.length) {
    await appendPeopleFacts(facts.map((text, index) => ({
      slug: "anna", section: "interest", text, sessionId: SESSION,
      segmentIndex: index, confirmedAt: "2026-11-01T13:00:00.000Z",
    })));
  }
  return dir;
}

test("由已确认事实生成中英对照追问，最多 3 条且带 factId", async (t) => {
  await personWithFacts(t, ["喜欢在海边喝咖啡。", "每周末去万宁跑步。", "在软件公司做开发。", "还喜欢做饭。"]);
  const prep = await getPersonPrep("anna");
  assert.equal(prep.empty, false);
  assert.equal(prep.items.length, 3);
  for (const item of prep.items) {
    assert.equal(item.source, "confirmed-fact");
    assert.ok(item.en.length > 0 && /[A-Za-z]/.test(item.en), "英文优先");
    assert.ok(item.zh.length > 0, "必须有中文释义");
    assert.match(item.factId, /^[A-Za-z0-9]{6,32}$/);
  }
  assert.equal(new Set(prep.items.map((i) => i.en)).size, 3, "3 条不得重复");
});

test("事实不足时用通用模板补齐并标 source:template", async (t) => {
  await personWithFacts(t, ["喜欢在海边喝咖啡。"]);
  const prep = await getPersonPrep("anna");
  assert.equal(prep.empty, false);
  assert.equal(prep.items.length, 3);
  assert.equal(prep.items[0].source, "confirmed-fact");
  assert.equal(prep.items.filter((i) => i.source === "template").length, 2);
  assert.equal(prep.items.filter((i) => i.source === "template").every((i) => !("factId" in i)), true);
});

test("完全没有已确认事实时 empty:true 且不编造条目", async (t) => {
  await personWithFacts(t, []);
  const prep = await getPersonPrep("anna");
  assert.equal(prep.empty, true);
  assert.equal(prep.emptyReason, "NO_CONFIRMED_FACTS");
  assert.deepEqual(prep.items, []);
});

test("人工手写段落不算已确认事实，不会被拿来生成追问", async (t) => {
  const dir = await setup(t);
  await fs.mkdir(path.join(dir, "anna"), {recursive: true});
  await fs.writeFile(path.join(dir, "anna", "00-profile.md"),
    "---\nname: Anna\n---\n\n# 兴趣\n\n- 人工写着：她喜欢爬山。\n", "utf8");
  const prep = await getPersonPrep("anna");
  assert.equal(prep.empty, true);
  assert.deepEqual(prep.items, []);
});

test("生成过程 0 次外部请求：断网/禁用 fetch 也能得到结果", async (t) => {
  await personWithFacts(t, ["每周末去万宁跑步。"]);
  const originalFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = () => {
    called += 1;
    throw new Error("不应发起任何网络请求");
  };
  try {
    const prep = await getPersonPrep("anna");
    assert.equal(prep.empty, false);
    assert.ok(prep.items.length >= 1);
    assert.equal(called, 0, "prep 不允许调用 fetch");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("buildPrep 是纯函数：同样输入给同样输出，且不修改入参", () => {
  const confirmed = [{id: "abcdef123456", text: "喜欢在海边喝咖啡。", source: {sessionId: SESSION}}];
  const snapshot = JSON.stringify(confirmed);
  const a = buildPrep(confirmed);
  const b = buildPrep(confirmed);
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(confirmed), snapshot, "不得修改调用方数据");
  assert.equal(buildPrep([]).empty, true);
  assert.equal(buildPrep(null).empty, true);
});
