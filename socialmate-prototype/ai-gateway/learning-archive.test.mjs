import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createLearningArchive, SOURCE_TYPES} from "./learning-archive.mjs";

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "sm-learning-archive-"));
  const root = path.join(base, "LearningArchive");
  const inputs = path.join(base, "inputs");
  const conversations = path.join(base, "Conversations");
  await fs.mkdir(inputs, {recursive: true});
  await fs.mkdir(conversations, {recursive: true});
  const roots = [
    {
      key: "self_test",
      dir: path.join(inputs, "self_test"),
      sourceApp: "test",
      classify: (rel) => rel.endsWith(".md") ? "self_test" : null,
    },
    {
      key: "thought",
      dir: path.join(inputs, "thought"),
      sourceApp: "test",
      classify: (rel) => rel.endsWith(".json") ? "thought" : null,
    },
    {
      key: "conversation",
      dir: conversations,
      sourceApp: "test",
      classify: (rel) => rel.endsWith(".json") ? "conversation" : null,
    },
    {
      key: "archive_inbox",
      dir: path.join(root, "inbox"),
      sourceApp: "archive_inbox",
      classify: (rel) => SOURCE_TYPES.includes(rel.split("/")[0]) ? rel.split("/")[0] : null,
    },
  ];
  await fs.mkdir(roots[0].dir, {recursive: true});
  await fs.mkdir(roots[1].dir, {recursive: true});
  const store = createLearningArchive({root, roots, home: base});
  return {base, root, inputs, conversations, roots, store};
}

const SELF_TEST = `---
schema_version: 1
type: language-learning-record
export_id: deadbeefcafe
exported_at: 2026-11-03T10:00:00Z
period_start: 2026-11-03T00:00:00Z
period_end: 2026-11-04T00:00:00Z
session_count: 1
target_language: en
---
## Session s1

- session_id: s1
- learned_at: 2026-11-03T09:00:00Z

### 中文意图
我想练习点椰子水。

### AI 参考表达
I'd like to order a coconut water.

### 我的英文尝试
I want coconut.

### AI 对比
A more natural way is: Could I get a coconut water?

### 学习重点
- coconut water
- Could I get...
`;

function thoughtRecord(recordId, revision, text) {
  return {
    schema: 1,
    placeId: "pv-hongcheng-lake-park",
    recordId,
    rawInput: text,
    rawSha256: "x",
    revision,
    blocks: [
      {
        blockId: "blk-1",
        order: 0,
        contentRevision: revision,
        sourceText: text,
        cnSentences: [text],
        enVariants: ["An English version.", "Another English version."],
        phrases: ["take a walk"],
      },
    ],
    createdAt: "2026-11-03T07:00:00Z",
  };
}

test("首次扫描建立索引与派生文件，权限收紧", async () => {
  const {root, roots, store} = await fixture();
  await fs.writeFile(path.join(roots[0].dir, "学习记录 2026-11-03 - deadbeef.md"), SELF_TEST, "utf8");
  await fs.writeFile(path.join(roots[1].dir, "rec-a.json"), JSON.stringify(thoughtRecord("rec-a", 1, "去湖边散步。")), "utf8");
  const run = await store.runScan();
  assert.equal(run.ok, true);
  assert.equal(run.indexed, 2);
  assert.equal(run.totalMaterials, 2);
  const index = JSON.parse(await fs.readFile(path.join(root, "index.json"), "utf8"));
  assert.equal(index.materials.length, 2);
  const thought = index.materials.find((item) => item.sourceType === "thought");
  assert.equal(thought.placeRefs[0], "pv-hongcheng-lake-park");
  assert.equal(thought.consentScope, "local_only");
  const derived = JSON.parse(await fs.readFile(path.join(root, thought.derivedPathRef), "utf8"));
  assert.equal(derived.blocks.length, 1);
  assert.equal(derived.blocks[0].enA, "An English version.");
  assert.equal(derived.cloudDerivation, "awaiting_consent");
  const stat = await fs.stat(path.join(root, "index.json"));
  assert.equal(stat.mode & 0o777, 0o600);
});

test("重复扫描幂等；同名不同正文生成新版本，不覆盖旧版本", async () => {
  const {root, roots, store} = await fixture();
  const file = path.join(roots[1].dir, "rec-a.json");
  await fs.writeFile(file, JSON.stringify(thoughtRecord("rec-a", 1, "第一版")), "utf8");
  await store.runScan();
  const second = await store.runScan();
  assert.equal(second.indexed, 0);
  assert.equal(second.unchanged, 1);
  await fs.writeFile(file, JSON.stringify(thoughtRecord("rec-a", 2, "第二版")), "utf8");
  const third = await store.runScan();
  assert.equal(third.indexed, 1);
  const index = JSON.parse(await fs.readFile(path.join(root, "index.json"), "utf8"));
  const sameLogical = index.materials.filter((item) => item.sourceId === "rec-a");
  assert.equal(sameLogical.length, 2);
  assert.deepEqual(sameLogical.map((item) => item.version).sort(), [1, 2]);
  assert.equal(new Set(sameLogical.map((item) => item.materialId)).size, 2);
});

test("恶意文件名被清洗且不会逃出 inbox；非法类型拒绝", async () => {
  const {root, store} = await fixture();
  const result = await store.ingest({
    sourceType: "self_test",
    filename: "../../../etc/passwd.md",
    content: SELF_TEST,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "indexed");
  const inbox = path.join(root, "inbox");
  const all = await fs.readdir(inbox, {recursive: true});
  assert.ok(all.every((item) => !String(item).includes("..")));
  await assert.rejects(
    () => store.ingest({sourceType: "evil", filename: "x.md", content: "x"}),
    /sourceType/,
  );
});

test("重复投递同内容幂等，不新增条目", async () => {
  const {store} = await fixture();
  const first = await store.ingest({sourceType: "self_test", filename: "a.md", content: SELF_TEST});
  const second = await store.ingest({sourceType: "self_test", filename: "a.md", content: SELF_TEST});
  assert.equal(first.status, "indexed");
  assert.equal(second.status, "unchanged");
  assert.equal(second.duplicate, true);
  const status = await store.status();
  assert.equal(status.total, 1);
});

test("无 retention 同意的会话不索引", async () => {
  const {conversations, store} = await fixture();
  const session = {
    sessionId: "sess_no_consent_01",
    startedAt: "2026-11-03T08:00:00Z",
    consent: {retention: false, recording: false, cloudAi: false},
    segments: [{speakerId: "A", textOriginal: "private"}],
    revision: 1,
  };
  await fs.writeFile(path.join(conversations, "s.json"), JSON.stringify({session}), "utf8");
  const run = await store.runScan();
  assert.equal(run.skippedConsent, 1);
  assert.equal(run.indexed, 0);
  const index = JSON.parse(await fs.readFile(path.join(store.root, "index.json"), "utf8"));
  assert.equal(index.materials.length, 0);
});

test("损坏 JSON 与超限文件进隔离区，不中断其他资料", async () => {
  const {root, roots, store} = await fixture();
  await fs.writeFile(path.join(roots[1].dir, "bad.json"), "{not json", "utf8");
  await fs.writeFile(path.join(roots[0].dir, "学习记录 2026-11-03 - deadbeef.md"), SELF_TEST, "utf8");
  const run = await store.runScan();
  assert.equal(run.quarantined, 1);
  assert.equal(run.indexed, 1);
  const quarantine = path.join(root, "quarantine", run.runId);
  const names = await fs.readdir(quarantine);
  assert.ok(names.some((name) => name.endsWith(".json")));
});

test("重启后索引仍在（新实例读取同一目录）", async () => {
  const {root, roots, store} = await fixture();
  await fs.writeFile(path.join(roots[0].dir, "学习记录 2026-11-03 - deadbeef.md"), SELF_TEST, "utf8");
  await store.runScan();
  const second = createLearningArchive({
    root,
    roots,
    home: path.dirname(root),
  });
  const status = await second.status();
  assert.equal(status.total, 1);
});

test("来源离线时保留已有索引，不误删、不新增", async () => {
  const {roots, store} = await fixture();
  const file = path.join(roots[0].dir, "学习记录 2026-11-03 - deadbeef.md");
  await fs.writeFile(file, SELF_TEST, "utf8");
  await store.runScan();
  await fs.rm(file, {force: true});
  const run = await store.runScan();
  assert.equal(run.ok, true);
  const status = await store.status();
  assert.equal(status.total, 1);
  assert.ok(run.roots.some((item) => item.key === "self_test" && ["EMPTY", "NO_SOURCE"].includes(item.status)));
});

test("扫描过程不发起任何网络请求（0 元预算边界）", async () => {
  const {roots, store} = await fixture();
  await fs.writeFile(path.join(roots[0].dir, "学习记录 2026-11-03 - deadbeef.md"), SELF_TEST, "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network forbidden in archive scan"); };
  try {
    const run = await store.runScan();
    assert.equal(run.ok, true);
    assert.equal(run.indexed, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});