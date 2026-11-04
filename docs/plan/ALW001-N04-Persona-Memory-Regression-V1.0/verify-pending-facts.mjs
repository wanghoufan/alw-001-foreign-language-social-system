#!/usr/bin/env node
/**
 * N04 第二步（SDD §2.3 / T2）验收：final → 待确认 → 人工确认/忽略 → 当轮专属话题更新。
 *
 * 4 条硬断言：
 *   A. 注入一条演示 final：多 1 条待确认，演示档案事实数不变；
 *   B. 确认：档案事实 +1，专属问题文本 before/after 明显不同（同一轮返回，无需重载）；
 *   C. 忽略：待确认归零，档案事实数不变；
 *   D. 真实 SocialMate-Data/People/ 逐文件 sha256 前后完全一致（隔离证明）。
 *
 * 只操作演示命名空间；结束时从母版恢复基线，脚本可重复运行。
 * 用法：node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-pending-facts.mjs [base]
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const base = process.argv[2] || "http://127.0.0.1:8791";
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const peopleDir = path.join(repo, "SocialMate-Data", "People");
const demoDir = path.join(repo, "SocialMate-Data", "Demo");
const slug = "demo-oliver-uk";
const checks = [];
const failures = [];
const ok = (id, cond, detail) => {
  const row = detail === undefined ? {id, pass: Boolean(cond)} : {id, pass: Boolean(cond), detail};
  checks.push(row);
  if (!cond) failures.push(row);
};
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
  // 服务端写限流是全局安全栏（12 次/分钟、最小间隔 400ms）。脚本按服务端给的
  // retryAfterMs 等待后重试，不绕过、不放宽任何限流参数。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await fetch(base + p, {
      method: "POST",
      headers: {"Content-Type": "application/json", Origin: base, "x-sm-write": await writeTicket()},
      body: JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    if (res.status !== 429) return {status: res.status, body: parsed};
    const waitMs = Math.min(65_000, Number(parsed?.retryAfterMs) || 1_000) + 250;
    await new Promise((r) => setTimeout(r, waitMs));
  }
  return {status: 429, body: {ok: false, code: "RATE_LIMITED"}};
}
function hashTree(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hashTree(full, out);
    else if (entry.isFile()) out.push(path.relative(dir, full) + " " +
      crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
  }
  return out.sort();
}
const digest = (lines) => crypto.createHash("sha256").update(lines.join("\n")).digest("hex");

const realBefore = hashTree(peopleDir);
const realBeforeHash = digest(realBefore);

// 基线：从母版恢复，保证可重复跑（只动 Demo，不动 People）。
const restored = await post("/v12/api/demo/restore", {confirm: true});
ok("baseline-restore-200", restored.status === 200, restored.status);
ok("baseline-3-9-54", restored.body?.status?.personas === 3 &&
  restored.body?.status?.sessions === 9 && restored.body?.status?.segments === 54,
  restored.body?.status);

const before = await get("/v12/api/demo/people/" + slug);
const beforePerson = before.body?.person;
const beforeFacts = (beforePerson?.confirmed || []).length;
const beforePending = (beforePerson?.pending || []).length;
const beforePrep = (beforePerson?.prep?.personalized || []).map((q) => q.en);
// 种入基线 = 3 条人设字段（地区/职业/沟通风格）+ 2 条母版对话事实 = 5。
// 这条断言原来写 2，早于「人设字段也入档」的改动，属过时期望值，按当前种入契约校正。
ok("baseline-facts-5", beforeFacts === 5, beforeFacts);
ok("baseline-pending-1", beforePending === 1, beforePending);
ok("baseline-prep-2", beforePrep.length === 2, beforePrep);

// A. 注入一条演示 final：只进待确认。
const INJECT_SESSION = "sess_n04_demo_oliver_uk_3";
const INJECT_SEGMENT = 1;
// 注入文本必须是母版该段的逐字原文（T1-1）：不再允许用摘要/改写句冒充 final。
const fixturePath = path.join(repo, "docs", "plan",
  "ALW001-N04-Persona-Memory-Regression-V1.0", "fixtures", "demo-personas.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
function exactText(sessionId, segmentIndex) {
  for (const persona of fixture.personas) {
    for (const session of persona.sessions) {
      if (session.sessionId !== sessionId) continue;
      const segment = session.segments.find((s, i) =>
        (Number.isFinite(Number(s.index)) ? Number(s.index) : i) === segmentIndex);
      if (segment) return String(segment.textOriginal);
    }
  }
  return "";
}
const INJECT_TEXT = exactText(INJECT_SESSION, INJECT_SEGMENT);
if (!INJECT_TEXT) throw new Error("母版里找不到注入用原文段");
const injected = await post("/v12/api/demo/final", {
  confirm: true, slug, text: INJECT_TEXT,
  sessionId: INJECT_SESSION, segmentIndex: INJECT_SEGMENT, section: "plan",
});
ok("A-inject-200", injected.status === 200, injected.status);
ok("A-inject-added", injected.body?.added === true, injected.body?.reason || injected.body?.duplicate);
const afterInject = await get("/v12/api/demo/people/" + slug);
const injectedPending = (afterInject.body?.person?.pending || [])
  .find((item) => item.text === INJECT_TEXT);
ok("A-pending-plus-1", (afterInject.body?.person?.pending || []).length === beforePending + 1,
  (afterInject.body?.person?.pending || []).length);
ok("A-facts-unchanged", (afterInject.body?.person?.confirmed || []).length === beforeFacts,
  (afterInject.body?.person?.confirmed || []).length);
ok("A-pending-visible-with-source", Boolean(injectedPending?.id) &&
  injectedPending?.source?.sessionId === INJECT_SESSION, injectedPending?.source);
ok("A-profile-not-written", !String(fs.readFileSync(
  path.join(demoDir, "People", slug, "00-profile.md"), "utf8")).includes(INJECT_TEXT));

// 重复注入同一段：不应变成两条。
await wait(400);
const reinject = await post("/v12/api/demo/final", {
  confirm: true, slug, text: INJECT_TEXT,
  sessionId: INJECT_SESSION, segmentIndex: INJECT_SEGMENT, section: "plan",
});
ok("A-reinject-dedup", reinject.body?.added === false && reinject.body?.duplicate === true,
  {added: reinject.body?.added, reason: reinject.body?.reason});
const afterReinject = await get("/v12/api/demo/people/" + slug);
ok("A-reinject-count-stable", (afterReinject.body?.person?.pending || []).length === beforePending + 1,
  (afterReinject.body?.person?.pending || []).length);

// B. 确认母版里那条「10 公里赛事」候选：事实 +1、专属问题当轮更新。
const seeded = (afterReinject.body?.person?.pending || []).find((item) => item.id !== injectedPending?.id);
ok("B-seeded-pending-found", Boolean(seeded?.id), seeded?.text);
await wait(400);
const confirmed = await post(
  `/v12/api/demo/people/${slug}/pending/${encodeURIComponent(seeded?.id)}/confirm`, {confirm: true});
ok("B-confirm-200", confirmed.status === 200, confirmed.status);
ok("B-confirm-not-duplicate", confirmed.body?.duplicate === false, confirmed.body?.duplicate);
const afterConfirm = confirmed.body?.person;
const afterFacts = (afterConfirm?.confirmed || []).length;
const afterPending = (afterConfirm?.pending || []).length;
const afterPrep = (afterConfirm?.prep?.personalized || []).map((q) => q.en);
ok("B-facts-plus-1", afterFacts === beforeFacts + 1, {before: beforeFacts, after: afterFacts});
ok("B-pending-minus-1", afterPending === beforePending, {before: beforePending, after: afterPending});
ok("B-prep-changed", JSON.stringify(afterPrep) !== JSON.stringify(beforePrep),
  {before: beforePrep, after: afterPrep});
ok("B-prep-first-is-new-fact", /10K/.test(afterPrep[0] || ""), afterPrep);
// 写入落地的强证据：档案里出现这次确认返回的 factId 标记（比"包含某句文本"更不容易误判）。
const writtenFactId = confirmed.body?.confirmed?.factId || "";
ok("B-profile-written", Boolean(writtenFactId) && String(fs.readFileSync(
  path.join(demoDir, "People", slug, "00-profile.md"), "utf8")).includes("sm-src:" + writtenFactId),
  {factId: writtenFactId});
ok("B-confirm-returns-prep-inline", Array.isArray(confirmed.body?.prep?.personalized) &&
  confirmed.body.prep.personalized.length === 2);

// 重复确认同一条：已被消费，不应再写第二次。
await wait(400);
const reconfirm = await post(
  `/v12/api/demo/people/${slug}/pending/${encodeURIComponent(seeded?.id)}/confirm`, {confirm: true});
ok("B-reconfirm-no-double-write", reconfirm.status === 404 &&
  (await get("/v12/api/demo/people/" + slug)).body?.person?.confirmed?.length === afterFacts,
  {status: reconfirm.status, code: reconfirm.body?.code});

// C. 忽略注入的那条：待确认归零，档案不变。
const factsBeforeIgnore = (await get("/v12/api/demo/people/" + slug)).body?.person?.confirmed?.length;
await wait(400);
const ignored = await post(
  `/v12/api/demo/people/${slug}/pending/${encodeURIComponent(injectedPending?.id)}/ignore`, {confirm: true});
ok("C-ignore-200", ignored.status === 200, ignored.status);
const afterIgnore = ignored.body?.person;
ok("C-pending-zero", (afterIgnore?.pending || []).length === 0, (afterIgnore?.pending || []).length);
ok("C-facts-unchanged", (afterIgnore?.confirmed || []).length === factsBeforeIgnore,
  {before: factsBeforeIgnore, after: (afterIgnore?.confirmed || []).length});
ok("C-ignored-text-not-written", !String(fs.readFileSync(
  path.join(demoDir, "People", slug, "00-profile.md"), "utf8")).includes(INJECT_TEXT));

// 未归属 final：没有选择人物时拒绝写入（说话人身份不许猜）。
// 未归属：用母版里真实存在、但没指定人物的段（伪造 sessionId 现在会被 404 拒绝）。
const INBOX_SESSION = "sess_n04_demo_maya_us_1";
const INBOX_SEGMENT = 1;
const inbox = await post("/v12/api/demo/final", {
  confirm: true, text: exactText(INBOX_SESSION, INBOX_SEGMENT),
  sessionId: INBOX_SESSION, segmentIndex: INBOX_SEGMENT,
});
ok("C-inbox-unattributed", inbox.body?.added === true && !inbox.body?.attributedTo, inbox.body?.attributedTo);
const unattributedConfirm = await post(
  `/v12/api/demo/pending/${encodeURIComponent(inbox.body?.item?.id)}/confirm`, {confirm: true});
ok("C-inbox-confirm-requires-person", unattributedConfirm.status === 400 &&
  unattributedConfirm.body?.code === "ATTRIBUTION_REQUIRED",
  {status: unattributedConfirm.status, code: unattributedConfirm.body?.code});

// 收尾：忽略未归属项 + 从母版恢复，保持可重复与手机演示基线。
await wait(400);
await post(`/v12/api/demo/pending/${encodeURIComponent(inbox.body?.item?.id)}/ignore`, {confirm: true});
await wait(400);
const finalRestore = await post("/v12/api/demo/restore", {confirm: true});
ok("cleanup-restore-baseline", finalRestore.body?.status?.personas === 3 &&
  finalRestore.body?.status?.sessions === 9 &&
  (finalRestore.body?.status?.pending || 0) === 3, finalRestore.body?.status);

// D. 隔离：真实 People 目录逐文件哈希前后一致。
const realAfter = hashTree(peopleDir);
const realAfterHash = digest(realAfter);
ok("D-real-people-unchanged", realAfterHash === realBeforeHash,
  {before: {files: realBefore.length, sha256: realBeforeHash},
    after: {files: realAfter.length, sha256: realAfterHash}});
ok("D-demo-dir-is-target", fs.existsSync(path.join(demoDir, "People", slug, "00-profile.md")));

const report = {
  result: failures.length ? "FAIL" : "PASS",
  base,
  checks: checks.length,
  failures,
  demoPerson: slug,
  assertions: {
    A_inject: {pendingBefore: beforePending, pendingAfter: (afterInject.body?.person?.pending || []).length,
      factsBefore: beforeFacts, factsAfter: (afterInject.body?.person?.confirmed || []).length,
      injected: {text: INJECT_TEXT, sessionId: INJECT_SESSION, segmentIndex: INJECT_SEGMENT,
        pendingId: injectedPending?.id}},
    B_confirm: {factAdded: seeded?.text, facts: {before: beforeFacts, after: afterFacts},
      pendingBefore: beforePending + 1, pendingAfter: afterPending,
      prep: {before: beforePrep, after: afterPrep, generic: afterConfirm?.prep?.generic?.en}},
    C_ignore: {ignored: INJECT_TEXT, pendingAfter: (afterIgnore?.pending || []).length,
      factsUnchanged: factsBeforeIgnore},
  },
  realPeople: {files: realAfter.length, sha256Before: realBeforeHash, sha256After: realAfterHash},
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
