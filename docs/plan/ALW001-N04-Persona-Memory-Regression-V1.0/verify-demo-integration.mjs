#!/usr/bin/env node
// N04 演示命名空间接入验收（只读 + 清空/恢复一轮，最后一定恢复到基线）。
// 用法：node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-demo-integration.mjs [base]
// 默认 base=http://127.0.0.1:8791（本项目 8791 私有服务）。
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const base = process.argv[2] || "http://127.0.0.1:8791";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const peopleDir = path.join(repo, "SocialMate-Data", "People");
const checks = [];
const fail = [];
const ok = (id, cond, detail) => (cond ? checks : fail).push(detail === undefined ? id : {id, detail});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(p) {
  const res = await fetch(base + p);
  return {status: res.status, body: await res.json().catch(() => null)};
}
// 写操作 = 同源 + 一次性写授权票（N04 V1.3 T1-4）。票每次现取，不缓存、不复用。
async function writeTicket() {
  const res = await fetch(base + "/v12/api/demo/write-ticket", {cache: "no-store"});
  const parsed = await res.json().catch(() => null);
  if (!parsed?.ticket) throw new Error("写授权票获取失败");
  return parsed.ticket;
}
async function post(p, body) {
  // 服务端写限流是全局的（12 次/分钟、最小间隔 400ms）。这里按服务端返回的
  // retryAfterMs 等待后重试，不绕过、不放宽限流参数。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(base + p, {
      method: "POST",
      headers: {"Content-Type": "application/json", Origin: base, "x-sm-write": await writeTicket()},
      body: JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    if (res.status !== 429) return {status: res.status, body: parsed};
    await wait(Math.min(65_000, Number(parsed?.retryAfterMs) || 1_000) + 250);
  }
  return {status: 429, body: {ok: false, code: "RATE_LIMITED"}};
}
function hashTree(dir, out = []) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hashTree(full, out);
    else if (entry.isFile()) out.push(path.relative(dir, full) + " " +
      crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
  }
  return out.sort();
}

const before = hashTree(peopleDir);
const digest = crypto.createHash("sha256").update(before.join("\n")).digest("hex");

// 可重复跑：先回到母版基线（用户可能已经在手机上确认/忽略过候选，pending 不再是 1）。
// 只重建 SocialMate-Data/Demo，真实 People 不参与。
const baseline = await post("/v12/api/demo/restore", {confirm: true});
ok("baseline-restore-3-9-54", baseline.body?.status?.personas === 3 &&
  baseline.body?.status?.sessions === 9 && baseline.body?.status?.segments === 54, baseline.body?.status);
await wait(500);

const list = await get("/v12/api/demo/people");
ok("demo-people-200", list.status === 200, list.status);
ok("demo-people-3", list.body?.people?.length === 3, list.body?.people?.length);
ok("demo-sessions-9", list.body?.status?.sessions === 9, list.body?.status?.sessions);
ok("demo-segments-54", list.body?.status?.segments === 54, list.body?.status?.segments);
ok("demo-isolated-root", String(list.body?.status?.isolatedRoot || "").includes("SocialMate-Data/Demo"),
  list.body?.status?.isolatedRoot);

let detailSegments = 0;
const detailReport = [];
for (const p of list.body?.people || []) {
  const d = await get("/v12/api/demo/people/" + encodeURIComponent(p.slug));
  const person = d.body?.person;
  const segs = (person?.sessions || []).reduce((n, s) => n + (s.segments || []).length, 0);
  detailSegments += segs;
  detailReport.push({
    slug: p.slug, name: person?.name, facts: (person?.confirmed || []).length,
    pending: (person?.pending || []).length, sessions: (person?.sessions || []).length, segments: segs,
    firstLine: person?.sessions?.[0]?.segments?.[0]?.textOriginal || "",
  });
  ok("detail-3-sessions-" + p.slug, (person?.sessions || []).length === 3);
  ok("detail-2-facts-" + p.slug, (person?.confirmed || []).length >= 2);
  ok("detail-pending-" + p.slug, (person?.pending || []).length === 1);
}
ok("detail-segments-54", detailSegments === 54, detailSegments);

const oneSession = list.body?.people?.[0]?.sessions?.[0]?.sessionId;
const single = await get("/v12/api/demo/sessions/" + encodeURIComponent(oneSession));
ok("single-session-6", single.body?.session?.segments?.length === 6, single.body?.session?.segments?.length);
ok("single-session-text", Boolean(single.body?.session?.segments?.[0]?.textOriginal));

await wait(700);
const cleared = await post("/v12/api/demo/clear", {confirm: true});
ok("clear-200", cleared.status === 200, cleared.status);
ok("clear-0-people", cleared.body?.status?.personas === 0, cleared.body?.status?.personas);
ok("clear-0-sessions", cleared.body?.status?.sessions === 0, cleared.body?.status?.sessions);

const afterClearList = await get("/v12/api/demo/people");
ok("after-clear-list-empty", (afterClearList.body?.people || []).length === 0);
ok("after-clear-status-cleared", afterClearList.body?.status?.cleared === true);

const afterClear = hashTree(peopleDir);
const digestAfterClear = crypto.createHash("sha256").update(afterClear.join("\n")).digest("hex");
ok("real-people-unchanged-after-clear", digestAfterClear === digest,
  {before: before.length, after: afterClear.length});
ok("real-people-count-unchanged", afterClear.length === before.length, afterClear.length);

await wait(700);
const restored = await post("/v12/api/demo/restore", {confirm: true});
ok("restore-200", restored.status === 200, restored.status);
ok("restore-3-9-54", restored.body?.status?.personas === 3 &&
  restored.body?.status?.sessions === 9 && restored.body?.status?.segments === 54,
  restored.body?.status);

await wait(700);
const restoredAgain = await post("/v12/api/demo/restore", {confirm: true});
ok("restore-idempotent", restoredAgain.body?.status?.personas === 3 &&
  restoredAgain.body?.status?.sessions === 9 && restoredAgain.body?.status?.segments === 54,
  restoredAgain.body?.status);

const afterRestore = hashTree(peopleDir);
const digestAfterRestore = crypto.createHash("sha256").update(afterRestore.join("\n")).digest("hex");
ok("real-people-unchanged-after-restore", digestAfterRestore === digest);

await wait(700);
const guarded = await post("/v12/api/demo/clear", {});
ok("clear-requires-confirm", guarded.status === 400 && guarded.body?.code === "CONFIRM_REQUIRED",
  {status: guarded.status, code: guarded.body?.code});

const report = {
  result: fail.length ? "FAIL" : "PASS",
  base,
  checks: checks.length,
  failures: fail,
  realPeople: {files: afterRestore.length, sha256: digestAfterRestore},
  demo: {
    root: list.body?.status?.isolatedRoot,
    people: detailReport,
    sessions: list.body?.status?.sessions,
    segments: list.body?.status?.segments,
  },
  lifecycle: {
    clear: cleared.body?.status,
    restore: restored.body?.status,
  },
};
console.log(JSON.stringify(report, null, 2));
if (fail.length) process.exitCode = 1;
