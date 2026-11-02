#!/usr/bin/env node
/**
 * N04 第三步验收（SDD §2.4 / T3）：演示会话 → Mac 固定演示目录的
 * 真实投递、断网待传、恢复补传、去重幂等、清空/恢复与真实档案不变。
 *
 * 用法：node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-archive.mjs
 * 前提：8791 本项目服务在跑；8782 演示归档接收端由本脚本自行 stop/start（只动本项目自有进程）。
 *
 * 会重建 `~/Documents/SocialMate/Demo/Conversations`（演示专用树，非正式归档），
 * 并在结尾恢复到「3 人物 / 9 会话 / 54 句 / Mac 9 对 md+json」的基线。
 */
import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DENO = path.resolve(HERE);
const REPO = path.resolve(HERE, "..", "..", "..");
const BASE = process.env.N04_BASE || "http://127.0.0.1:8791";
const QA = path.join(HERE, "qa", "20261102");
const DEMO_ROOT = path.join(REPO, "SocialMate-Data", "Demo");
const DEMO_CONV = path.join(DEMO_ROOT, "Conversations");
const LEDGER = path.join(DEMO_ROOT, "archive-state.json");
const MAC_DEMO = path.join(process.env.HOME, "Documents", "SocialMate", "Demo", "Conversations");
const REAL_ARCHIVE = path.join(process.env.HOME, "Documents", "SocialMate", "Conversations");
const REAL_PEOPLE = path.join(REPO, "SocialMate-Data", "People");
const SERVICE = path.join(REPO, "socialmate-v1.2", "demo-archive-service.sh");
const FIXTURE = path.join(DENO, "fixtures", "demo-personas.json");

const checks = [];
const failures = [];
const check = (id, cond, detail) => {
  (cond ? checks : failures).push(detail === undefined ? id : {id, detail});
  return cond;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function hashTree(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hashTree(full, out);
    else if (entry.isFile()) out.push({
      path: path.relative(dir, full),
      bytes: fs.statSync(full).size,
      sha256: sha256(fs.readFileSync(full)),
    });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function digestOf(list) {
  // 与第二步脚本保持同一摘要口径（按完整 "路径 sha" 行排序），
  // 这样跨步骤可以逐字比较真实档案是否被改动。
  return sha256(list.map((i) => `${i.path} ${i.sha256}`).sort().join("\n"));
}

function listFiles(dir, suffix, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, suffix, out);
    else if (entry.isFile() && entry.name.endsWith(suffix)) out.push(full);
  }
  return out.sort();
}

function service(action) {
  try {
    return execFileSync("bash", [SERVICE, action], {cwd: REPO, encoding: "utf8"}).trim();
  } catch (error) {
    return String(error.stdout || error.message || "").trim();
  }
}

async function get(p) {
  const res = await fetch(BASE + p);
  return {status: res.status, body: await res.json().catch(() => null)};
}

async function post(p, body) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(BASE + p, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    if (res.status !== 429) return {status: res.status, body: parsed};
    await wait(Math.min(65_000, Number(parsed?.retryAfterMs) || 1_000) + 250);
  }
  return {status: 429, body: {ok: false, code: "RATE_LIMITED"}};
}

async function waitHealthy(url, timeoutMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(1000)});
      if (res.ok) return true;
    } catch { /* 未就绪继续等 */ }
    await wait(250);
  }
  return false;
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const fixtureSessions = new Map();
for (const persona of fixture.personas) {
  for (const session of persona.sessions) {
    fixtureSessions.set(session.sessionId, {
      persona: persona.slug,
      texts: session.segments.map((segment) => segment.textOriginal),
    });
  }
}

const realArchiveBefore = hashTree(REAL_ARCHIVE);
const realPeopleBefore = hashTree(REAL_PEOPLE);

// ── 0. 干净起点：停归档端，清掉演示投递台账与 Mac 演示树（只动 Demo 这棵树）
console.log("== 0) 准备隔离起点 ==");
service("stop");
fs.rmSync(LEDGER, {force: true});
if (MAC_DEMO.includes(`${path.sep}Demo${path.sep}`)) {
  fs.rmSync(MAC_DEMO, {recursive: true, force: true});
}
const targetAfterWipe = listFiles(MAC_DEMO, ".md").length + listFiles(MAC_DEMO, ".json").length;
check("clean-start-mac-demo-empty", targetAfterWipe === 0, targetAfterWipe);

// ── 1. 断网：归档端不可达 → 会话留在本地待传队列
console.log("== 1) 归档端不可达 ==");
const offline = await post("/v12/api/demo/archive/push", {confirm: true});
check("offline-push-200", offline.status === 200, offline.status);
check("offline-pending-9", offline.body?.pending === 9, offline.body?.pending);
check("offline-delivered-0", offline.body?.delivered === 0, offline.body?.delivered);
check("offline-errors-9", (offline.body?.errors || []).length === 9,
  (offline.body?.errors || []).length);
check("offline-no-remote-write",
  listFiles(MAC_DEMO, ".md").length === 0 && listFiles(MAC_DEMO, ".json").length === 0,
  {md: listFiles(MAC_DEMO, ".md").length, json: listFiles(MAC_DEMO, ".json").length});
const queuedAfterOffline = listFiles(DEMO_CONV, ".json").length;
check("offline-queue-kept-9", queuedAfterOffline === 9, queuedAfterOffline);

// ── 2. 恢复：归档端可达 → 自动补传全部 9 套
console.log("== 2) 归档端恢复，补传 ==");
console.log(service("start").split("\n")[0]);
await waitHealthy("http://127.0.0.1:8782/health");
const recovered = await post("/v12/api/demo/archive/push", {confirm: true});
check("recover-push-200", recovered.status === 200, recovered.status);
check("recover-delivered-9", recovered.body?.delivered === 9, recovered.body?.delivered);
check("recover-pending-0", recovered.body?.pending === 0, recovered.body?.pending);
check("recover-created-9", recovered.body?.created === 9, recovered.body?.created);
const remoteMd = listFiles(MAC_DEMO, ".md");
const remoteJson = listFiles(MAC_DEMO, ".json");
check("recover-9-md", remoteMd.length === 9, remoteMd.length);
check("recover-9-json", remoteJson.length === 9, remoteJson.length);
check("recover-http-2xx",
  (recovered.body?.status?.items || []).every((i) => i.httpStatus === 201),
  (recovered.body?.status?.items || []).map((i) => i.httpStatus));

// ── 3. 逐字核对：Mac md/json 与仓库副本、母版完全一致；54 段全覆盖
console.log("== 3) 逐字一致性 ==");
const inventory = [];
let mdSame = 0;
let textMatches = 0;
let mockTagged = 0;
for (const mdFile of remoteMd) {
  const base = path.basename(mdFile);
  const repoMd = listFiles(DEMO_CONV, ".md").find((f) => path.basename(f) === base);
  const remoteText = fs.readFileSync(mdFile, "utf8");
  if (repoMd && fs.readFileSync(repoMd, "utf8") === remoteText) mdSame += 1;
  const jsonFile = mdFile.replace(/\.md$/, ".json");
  const payload = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  const sessionId = payload.session.sessionId;
  const expected = fixtureSessions.get(sessionId);
  const actual = payload.session.segments.map((segment) => segment.textOriginal);
  if (expected && JSON.stringify(expected.texts) === JSON.stringify(actual)) textMatches += 1;
  const lines = remoteText.split("\n");
  mockTagged += lines.filter((line) => line.startsWith("- [") && line.includes("MOCK")).length;
  inventory.push({
    sessionId,
    personSlug: expected?.persona || null,
    markdown: {path: mdFile, bytes: fs.statSync(mdFile).size, sha256: sha256(fs.readFileSync(mdFile))},
    json: {path: jsonFile, bytes: fs.statSync(jsonFile).size, sha256: sha256(fs.readFileSync(jsonFile))},
    segments: actual.length,
    verbatim: Boolean(expected) && JSON.stringify(expected.texts) === JSON.stringify(actual),
  });
}
inventory.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
check("verbatim-md-9", mdSame === 9, mdSame);
check("verbatim-segments-sessions-9", textMatches === 9, textMatches);
check("synthetic-mock-54", mockTagged === 54, mockTagged);
check("inventory-9-pairs", inventory.length === 9, inventory.length);
fs.mkdirSync(QA, {recursive: true});
fs.writeFileSync(path.join(QA, "archive-inventory.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  mode: "real-run",
  synthetic: true,
  macRoot: MAC_DEMO,
  queueRoot: DEMO_CONV,
  totals: {sessions: inventory.length, segments: 54, markdown: 9, json: 9,
    bytes: inventory.reduce((n, i) => n + i.markdown.bytes + i.json.bytes, 0)},
  files: inventory,
}, null, 2));

// ── 4. 重复投递：清掉投递台账但仍保留 Mac 文件 → 全部 duplicate，不新增文件
console.log("== 4) 幂等：重复投递 ==");
const beforeRepeat = new Map(listFiles(MAC_DEMO, ".md").map((f) => [f, sha256(fs.readFileSync(f))]));
fs.rmSync(LEDGER, {force: true});
const repeated = await post("/v12/api/demo/archive/push", {confirm: true});
check("repeat-200", repeated.status === 200, repeated.status);
check("repeat-duplicates-9", repeated.body?.duplicates === 9, repeated.body?.duplicates);
check("repeat-created-0", repeated.body?.created === 0, repeated.body?.created);
check("repeat-md-still-9", listFiles(MAC_DEMO, ".md").length === 9, listFiles(MAC_DEMO, ".md").length);
check("repeat-json-still-9", listFiles(MAC_DEMO, ".json").length === 9, listFiles(MAC_DEMO, ".json").length);
const repeatHashesStable = listFiles(MAC_DEMO, ".md")
  .every((f) => beforeRepeat.get(f) === sha256(fs.readFileSync(f)));
check("repeat-hashes-unchanged", repeatHashesStable);

// ── 5. 清空 / 恢复：演示归零可恢复，Mac 演示归档与真实档案都不受影响
console.log("== 5) 清空 / 恢复 ==");
const demoBeforeClear = await get("/v12/api/demo/status");
const macDemoBeforeClear = hashTree(MAC_DEMO);
const cleared = await post("/v12/api/demo/clear", {confirm: true});
check("clear-200", cleared.status === 200, cleared.status);
check("clear-0-0-0", cleared.body?.status?.personas === 0 &&
  cleared.body?.status?.sessions === 0 && cleared.body?.status?.segments === 0, cleared.body?.status);
const afterClearStatus = await get("/v12/api/demo/status");
check("clear-persisted", afterClearStatus.body?.cleared === true, afterClearStatus.body?.cleared);
check("clear-keeps-mac-demo-archive", hashTree(MAC_DEMO).length === macDemoBeforeClear.length,
  {before: macDemoBeforeClear.length, after: hashTree(MAC_DEMO).length});
check("clear-real-archive-unchanged", digestOf(hashTree(REAL_ARCHIVE)) === digestOf(realArchiveBefore));
const archiveAfterClear = await get("/v12/api/demo/archive/status");
check("clear-archive-total-0", archiveAfterClear.body?.total === 0, archiveAfterClear.body?.total);
check("clear-archive-remote-9-9",
  archiveAfterClear.body?.remoteFiles?.md === 9 && archiveAfterClear.body?.remoteFiles?.json === 9,
  archiveAfterClear.body?.remoteFiles);

await wait(700);
const restored = await post("/v12/api/demo/restore", {confirm: true});
check("restore-3-9-54", restored.body?.status?.personas === 3 &&
  restored.body?.status?.sessions === 9 && restored.body?.status?.segments === 54,
  restored.body?.status);
await wait(1200); // 恢复后自动补传（异步）留时间完成
const archiveAfterRestore = await get("/v12/api/demo/archive/status");
check("restore-archive-delivered-9", archiveAfterRestore.body?.delivered === 9,
  archiveAfterRestore.body?.delivered);
check("restore-mac-still-9-9",
  archiveAfterRestore.body?.remoteFiles?.md === 9 && archiveAfterRestore.body?.remoteFiles?.json === 9,
  archiveAfterRestore.body?.remoteFiles);
check("restore-does-not-duplicate-files", hashTree(MAC_DEMO).length === macDemoBeforeClear.length,
  {before: macDemoBeforeClear.length, after: hashTree(MAC_DEMO).length});

const restoredAgain = await post("/v12/api/demo/restore", {confirm: true});
check("restore-twice-3-9-54", restoredAgain.body?.status?.personas === 3 &&
  restoredAgain.body?.status?.sessions === 9 && restoredAgain.body?.status?.segments === 54);

const realArchiveAfter = hashTree(REAL_ARCHIVE);
const realPeopleAfter = hashTree(REAL_PEOPLE);
check("real-archive-files-unchanged", realArchiveAfter.length === realArchiveBefore.length,
  {before: realArchiveBefore.length, after: realArchiveAfter.length});
check("real-archive-sha-unchanged", digestOf(realArchiveAfter) === digestOf(realArchiveBefore),
  {before: digestOf(realArchiveBefore), after: digestOf(realArchiveAfter)});
check("real-people-sha-unchanged", digestOf(realPeopleAfter) === digestOf(realPeopleBefore),
  {files: realPeopleAfter.length});

// ── 6. 收尾状态
const finalDemo = await get("/v12/api/demo/status");
const finalArchive = await get("/v12/api/demo/archive/status");
const report = {
  result: failures.length ? "FAIL" : "PASS",
  mode: "real-run",
  generatedAt: new Date().toISOString(),
  base: BASE,
  checks: checks.length,
  failures,
  macDemoArchive: {
    root: MAC_DEMO,
    files: hashTree(MAC_DEMO).length,
    pairs: {md: listFiles(MAC_DEMO, ".md").length, json: listFiles(MAC_DEMO, ".json").length},
    digest: digestOf(hashTree(MAC_DEMO)),
  },
  queue: {
    root: DEMO_CONV,
    sessions: listFiles(DEMO_CONV, ".json").length,
  },
  realArchive: {
    root: REAL_ARCHIVE,
    filesBefore: realArchiveBefore.length,
    filesAfter: realArchiveAfter.length,
    sha256Before: digestOf(realArchiveBefore),
    sha256After: digestOf(realArchiveAfter),
  },
  realPeople: {
    files: realPeopleAfter.length,
    sha256: digestOf(realPeopleAfter),
  },
  lifecycle: {
    offline: {pending: offline.body?.pending, delivered: offline.body?.delivered,
      errors: offline.body?.errors?.length, remoteFiles: 0},
    recovered: {created: recovered.body?.created, delivered: recovered.body?.delivered,
      pending: recovered.body?.pending},
    repeated: {created: repeated.body?.created, duplicates: repeated.body?.duplicates},
    cleared: cleared.body?.status,
    restored: restored.body?.status,
    final: {demo: finalDemo.body, archive: {
      total: finalArchive.body?.total, delivered: finalArchive.body?.delivered,
      pending: finalArchive.body?.pending, remoteFiles: finalArchive.body?.remoteFiles,
    }},
  },
};
fs.writeFileSync(path.join(QA, "verify-demo-archive.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
