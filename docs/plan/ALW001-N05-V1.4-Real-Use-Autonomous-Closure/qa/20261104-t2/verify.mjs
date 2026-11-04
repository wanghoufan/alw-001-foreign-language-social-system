#!/usr/bin/env node
/**
 * T2 验证脚本（隔离临时目录，不触碰生产索引）。
 * 覆盖：幂等、改文件记新版本且不改原件、QA fixture 自动打标、
 *       --health 的 DEGRADED / NOT_RUNNING 判定、断网（fetch 被禁用）仍可扫描、重启补扫。
 *
 * 运行：node docs/plan/ALW001-N05-V1.4-Real-Use-Autonomous-Closure/qa/20261104-t2/verify.mjs
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createLearningArchive} from "../../../../../socialmate-prototype/ai-gateway/learning-archive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const results = [];

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function makeStore() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "t2-verify-"));
  const root = path.join(base, "LearningArchive");
  const inputs = path.join(base, "inputs");
  await fs.mkdir(inputs, {recursive: true});
  const roots = [
    {key: "inbox", dir: inputs, sourceApp: "test", classify: (rel) => /\.(md|txt|json)$/i.test(rel) ? "thought" : null},
    {
      key: "archive_inbox",
      dir: path.join(root, "inbox"),
      sourceApp: "archive_inbox",
      classify: (rel) => (rel.split("/")[0] === "self_test" ? "self_test" : null),
    },
  ];
  const store = createLearningArchive({root, roots, home: base});
  return {base, root, inputs, roots, store};
}

async function check(name, fn) {
  const at = new Date().toISOString();
  try {
    const detail = await fn();
    results.push({name, status: "PASS", at, detail: detail || ""});
    console.log(`PASS  ${name}  ${detail || ""}`);
  } catch (error) {
    results.push({name, status: "FAIL", at, detail: error.message});
    console.log(`FAIL  ${name}  ${error.message}`);
  }
}

const NOTE = (v) => `# T2 临时笔记 v${v}\n\n- 版本: ${v}\n`;

await check("一次扫描后再次扫描新增 0（幂等）", async () => {
  const {inputs, store} = await makeStore();
  await fs.writeFile(path.join(inputs, "note-a.md"), NOTE(1), "utf8");
  const first = await store.runScan();
  const second = await store.runScan();
  assert.equal(first.indexed, 1, "首轮应索引 1");
  assert.equal(second.indexed, 0, "次轮新增应为 0");
  assert.equal(second.unchanged, 1, "次轮 unchanged 应为 1");
  assert.equal(second.totalMaterials, 1);
  return `run1 indexed=${first.indexed}｜run2 indexed=${second.indexed} unchanged=${second.unchanged}`;
});

await check("源文件修改记新版本，旧版本条目与原件都不覆盖", async () => {
  const {inputs, store} = await makeStore();
  const file = path.join(inputs, "note-b.md");
  await fs.writeFile(file, NOTE(1), "utf8");
  const hash1 = sha256(await fs.readFile(file));
  await store.runScan();
  await fs.writeFile(file, NOTE(2), "utf8");
  const hash2 = sha256(await fs.readFile(file));
  const third = await store.runScan();
  const index = JSON.parse(await fs.readFile(path.join(store.root, "index.json"), "utf8"));
  const versions = index.materials.filter((item) => item.sourceId === "note-b").map((item) => item.version).sort();
  assert.equal(third.indexed, 1);
  assert.deepEqual(versions, [1, 2], "应有 v1/v2 两条");
  const v1 = index.materials.find((item) => item.sourceId === "note-b" && item.version === 1);
  assert.equal(v1.originalSha256, hash1, "v1 条目 hash 必须保持旧内容");
  assert.equal((await fs.stat(file)).isFile(), true, "原件仍在原位置");
  assert.equal(v1.originalPathRef, "inbox:note-b.md");
  return `v1=${hash1.slice(0, 12)} v2=${hash2.slice(0, 12)} 条目数=${index.materials.length}`;
});

await check("QA fixture 文件名自动打标 test/sourceTag", async () => {
  const {inputs, store} = await makeStore();
  await fs.writeFile(path.join(inputs, "real-note.md"), NOTE(1), "utf8");
  await fs.writeFile(path.join(inputs, "abc-qa-fixture.md"), NOTE(1), "utf8");
  await store.runScan();
  const index = JSON.parse(await fs.readFile(path.join(store.root, "index.json"), "utf8"));
  const fixture = index.materials.find((item) => item.relativePath.includes("qa-fixture"));
  const real = index.materials.find((item) => item.relativePath === "real-note.md");
  assert.equal(fixture.test, true);
  assert.equal(fixture.sourceTag, "qa_fixture");
  assert.equal(real.test, false, "真实笔记不得被标成 fixture");
  const status = await store.status();
  assert.equal(status.total, 2);
  assert.equal(status.realTotal, 1);
  assert.equal(status.testFixtures, 1);
  return `total=${status.total} realTotal=${status.realTotal} fixtures=${status.testFixtures}`;
});

await check("health：连续漏扫 2 个周期标 DEGRADED", async () => {
  const {root, store} = await makeStore();
  await store.runScan();
  await fs.writeFile(path.join(root, "watch-state.json"), JSON.stringify({
    schema: 1,
    pid: process.pid,
    intervalSeconds: 300,
    lastCycleEndedAt: new Date(Date.now() - 3 * 300 * 1000).toISOString(),
    consecutiveMissedCycles: 2,
  }), "utf8");
  const report = await store.health({intervalSeconds: 300});
  assert.equal(report.state, "DEGRADED");
  assert.equal(report.running, true);
  assert.ok(report.missedCycles >= 2);
  assert.equal(report.ok, false);
  const persisted = JSON.parse(await fs.readFile(path.join(root, "health.json"), "utf8"));
  assert.equal(persisted.state, "DEGRADED");
  return `state=${report.state} missed=${report.missedCycles} consecutive=${report.consecutiveMissedCycles}`;
});

await check("health：心跳 PID 不存在标 NOT_RUNNING", async () => {
  const {root, store} = await makeStore();
  await store.runScan();
  await fs.writeFile(path.join(root, "watch-state.json"), JSON.stringify({
    schema: 1,
    pid: 999999,
    intervalSeconds: 300,
    lastCycleEndedAt: new Date().toISOString(),
    consecutiveMissedCycles: 0,
  }), "utf8");
  const report = await store.health({intervalSeconds: 300});
  assert.equal(report.running, false);
  assert.equal(report.state, "NOT_RUNNING");
  return `running=${report.running} state=${report.state} recovery=${report.recovery.command}`;
});

await check("断网（fetch 抛错）仍可完成本地扫描", async () => {
  const {inputs, store} = await makeStore();
  await fs.writeFile(path.join(inputs, "offline.md"), NOTE(1), "utf8");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network forbidden"); };
  try {
    const run = await store.runScan();
    assert.equal(run.ok, true);
    assert.equal(run.indexed, 1);
    const report = await store.health({intervalSeconds: 300});
    assert.equal(report.cloudCalls, 0);
    return `indexed=${run.indexed} cloudCalls=0`;
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await check("worker 被杀后新实例自动补扫新增文件", async () => {
  const {inputs, root, roots, store} = await makeStore();
  await fs.writeFile(path.join(inputs, "before-crash.md"), NOTE(1), "utf8");
  await store.runScan();
  // 模拟进程被杀：内存实例丢弃，进程停机期间用户新增了文件。
  await fs.writeFile(path.join(inputs, "during-downtime.md"), NOTE(1), "utf8");
  const revived = createLearningArchive({root, roots, home: path.dirname(root)});
  const report = await revived.health({intervalSeconds: 300});
  const catchUp = await revived.runScan();
  assert.equal(catchUp.indexed, 1, "重启后应补扫停机期间的新文件");
  assert.equal(catchUp.totalMaterials, 2, "旧索引不得丢失");
  return `停机期间新增补扫 indexed=${catchUp.indexed} total=${catchUp.totalMaterials} healthBefore=${report.state}`;
});

const failed = results.filter((item) => item.status !== "PASS");
console.log(`\n合计 ${results.length} 项，PASS ${results.length - failed.length}，FAIL ${failed.length}`);
await fs.writeFile(path.join(HERE, "verify-result.json"), JSON.stringify({at: new Date().toISOString(), results}, null, 2));
process.exit(failed.length ? 1 : 0);
