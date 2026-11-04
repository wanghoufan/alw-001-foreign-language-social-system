#!/usr/bin/env node
/**
 * T2 验收脚本：真实 ASR final → 待确认候选 → 选人确认 → 人物档案/prep → 重启 → 撤回。
 *
 * 三组断言，互不冒充：
 *   contract —— 在临时目录（SM_DEMO_ROOT）里直接驱动 live-facts 模块，验证字段分离、
 *               mock 拒绝、spk_0 不自动归人、必须选人、幂等、A/B/C 隔离、撤回、不落逐字；
 *   http     —— 打正在运行的 8791，验证写鉴权/同源/confirm/状态接口真实生效；
 *   e2e      —— 读取真机跑出来的 session-timeline.jsonl，校验事件顺序与关键字段。
 *               没有真机证据时 e2e 记 NOT_RUN，整体结果降为 PARTIAL（绝不假 PASS）。
 *
 * 用法：
 *   node verify-t2.mjs --base http://127.0.0.1:8791 \
 *     --timeline qa/<stamp>/session-timeline.jsonl --json qa/<stamp>/t2-report.json
 * 退出码：0 = PASS；1 = FAIL；2 = PARTIAL（有 NOT_RUN / 非关键项缺失）。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY = path.resolve(HERE, "..", "..", "..", "socialmate-prototype", "ai-gateway");
const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = argOf("--base", "http://127.0.0.1:8791").replace(/\/+$/, "");
const JSON_OUT = argOf("--json", "");
const TIMELINE = argOf("--timeline", "");
const DEVICE = argOf("--device", "REDACTED-SERIAL");
const STAMP = argOf("--stamp", new Date().toISOString());

const checks = [];
function check(group, id, ok, detail) {
  checks.push({group, id, ok: ok === true, detail: detail === undefined ? null : detail});
  const mark = ok === true ? "PASS" : "FAIL";
  console.log(`[${mark}] ${group}/${id}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`);
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const readText = (file) => fs.readFile(file, "utf8");
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "alw001-t2-"));
process.env.SM_DEMO_ROOT = tmpRoot;

const demo = await import(path.join(GATEWAY, "demo-store.mjs"));
const live = await import(path.join(GATEWAY, "live-facts.mjs"));

/* ================================ contract ================================ */
async function contractGroup() {
  await demo.ensureDemoSeeded();
  const slugs = (await demo.listPersonas()).map((person) => person.slug);
  check("contract", "seed-three-personas", slugs.length === 3, {slugs});
  const [a, b, c] = slugs;

  // 把种子时间改成过去，模拟「母版已存在一段时间后再确认新事实」的真实场景，
  // 否则同一分钟内确认时 prep 排序会与基线事实并列（测试环境特有的伪差异）。
  const profileA = path.join(demo.demoPeopleRoot(), a, "00-profile.md");
  const seededProfile = await readText(profileA);
  const backdated = seededProfile.replace(/· \d{4}-\d{2}-\d{2} \d{2}:\d{2} 用户确认/g,
    "· 2026-10-01 08:00 用户确认");
  await fs.writeFile(profileA, backdated, {encoding: "utf8", mode: 0o600});

  const beforeA = await demo.readPersona(a);
  const beforeB = await demo.readPersona(b);
  const beforeC = await demo.readPersona(c);
  const hashB = sha256(await readText(path.join(demo.demoPeopleRoot(), b, "00-profile.md")));
  const hashC = sha256(await readText(path.join(demo.demoPeopleRoot(), c, "00-profile.md")));
  check("contract", "prep-baseline", beforeA.prep.personalized.length === 2 && Boolean(beforeA.prep.generic),
    {personalized: beforeA.prep.personalized.length, generic: Boolean(beforeA.prep.generic)});

  const SID = "8f14e45f-ceea-4b7a-9a59-2d0e6f1c3b77";
  const VERBATIM = "I'm preparing for my first ten kilometre race in December.";
  const first = live.ingest({
    type: "final", final: true, mock: false, sessionId: SID, track: "mix",
    speaker: "spk_0", index: 0, startMs: 1200, endMs: 4200, text: VERBATIM,
  });
  check("contract", "real-final-ingested", first.accepted === true && Boolean(first.item), {reason: first.reason});
  const item = first.item || {};
  check("contract", "fields-separated",
    item.sessionId === SID && item.segmentIndex === 0
    && item.textOriginal === VERBATIM
    && typeof item.candidateFact === "string" && item.candidateFact !== item.textOriginal,
    {sessionId: item.sessionId, segmentIndex: item.segmentIndex, candidateFact: item.candidateFact});
  check("contract", "speaker-forced-unknown",
    item.speaker === "unknown" && item.speakerRaw === "spk_0", {speaker: item.speaker, speakerRaw: item.speakerRaw});

  const mockTry = live.ingest({type: "final", final: true, mock: true, sessionId: SID, text: "mock sentence from local generator"});
  check("contract", "mock-final-rejected", mockTry.accepted === false && mockTry.reason === "MOCK_FINAL_REJECTED",
    {reason: mockTry.reason, pending: mockTry.pendingCount});

  const dupTry = live.ingest({
    type: "final", final: true, mock: false, sessionId: SID, track: "mix",
    speaker: "spk_0", text: VERBATIM,
  });
  check("contract", "duplicate-final-not-new-card", dupTry.accepted === false && dupTry.reason === "DUPLICATE_FINAL",
    {reason: dupTry.reason});

  const interrupt = live.ingest({type: "interim", final: false, mock: false, sessionId: SID, text: "interim only"});
  check("contract", "interim-no-candidate", interrupt.accepted === false, {reason: interrupt.reason});

  const noSlug = await live.confirmLivePending({pendingId: item.id, confirm: true}).then(
    () => ({ok: true}), (error) => ({ok: false, status: error.status, code: error.code}));
  const afterNoSlug = await demo.readPersona(a);
  check("contract", "spk-not-auto-attributed",
    noSlug.ok === false && noSlug.code === "ATTRIBUTION_REQUIRED" && afterNoSlug.factCount === beforeA.factCount,
    {error: noSlug, factCount: afterNoSlug.factCount});

  const noConfirm = await live.confirmLivePending({pendingId: item.id, slug: a}).then(
    () => ({ok: true}), (error) => ({ok: false, status: error.status, code: error.code}));
  check("contract", "confirm-flag-required", noConfirm.ok === false && noConfirm.code === "CONFIRM_REQUIRED", noConfirm);

  const twoSlugs = await Promise.allSettled([
    live.confirmLivePending({pendingId: item.id, slug: a, candidateFact: item.candidateFact, confirm: true}),
    live.confirmLivePending({pendingId: item.id, slug: a, candidateFact: item.candidateFact, confirm: true}),
  ]);
  const fulfilled = twoSlugs.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const afterConfirm = await demo.readPersona(a);
  check("contract", "rapid-double-submit-single-write",
    afterConfirm.factCount === beforeA.factCount + 1 && fulfilled.length >= 1,
    {factCount: afterConfirm.factCount, before: beforeA.factCount, results: twoSlugs.map((r) => r.status)});

  const confirmed = fulfilled[0] || null;
  const factId = confirmed?.factId || null;
  const newQuestion = (afterConfirm.prep.personalized || []).find((question) => question.factId === factId);
  check("contract", "prep-recomputed-with-new-fact",
    Boolean(factId) && Boolean(newQuestion) && afterConfirm.prep.personalized[0]?.factId === factId,
    {
      factId,
      first: afterConfirm.prep.personalized[0] || null,
      personalized: afterConfirm.prep.personalized.length,
      generic: afterConfirm.prep.generic?.en,
    });

  const repeat = await live.confirmLivePending({pendingId: item.id, slug: a, confirm: true});
  const afterRepeat = await demo.readPersona(a);
  check("contract", "duplicate-confirm-idempotent",
    repeat.duplicate === true && afterRepeat.factCount === afterConfirm.factCount,
    {duplicate: repeat.duplicate, factCount: afterRepeat.factCount});

  const afterB = await demo.readPersona(b);
  const afterC = await demo.readPersona(c);
  const hashB2 = sha256(await readText(path.join(demo.demoPeopleRoot(), b, "00-profile.md")));
  const hashC2 = sha256(await readText(path.join(demo.demoPeopleRoot(), c, "00-profile.md")));
  check("contract", "other-people-untouched",
    hashB === hashB2 && hashC === hashC2
    && !afterB.confirmed.some((fact) => fact.id === factId)
    && !afterC.confirmed.some((fact) => fact.id === factId),
    {hashB, hashB2, hashC, hashC2, bCount: afterB.factCount, cCount: afterC.factCount});

  const wrongSlug = await live.withdrawLiveFact({factId, slug: b, confirm: true}).then(
    () => ({ok: true}), (error) => ({ok: false, status: error.status, code: error.code}));
  check("contract", "withdraw-wrong-slug-rejected",
    wrongSlug.ok === false && wrongSlug.code === "FACT_OWNERSHIP_MISMATCH", wrongSlug);

  // 落盘检查：逐字原文不得出现在演示目录任何文件里；索引只能是元数据。
  const files = [];
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, {withFileTypes: true})) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else files.push(full);
    }
  }
  await walk(tmpRoot);
  const contents = await Promise.all(files.map(async (file) => ({file, text: await readText(file)})));
  const verbatimHits = contents.filter((entry) => entry.text.includes(VERBATIM)).map((entry) => path.relative(tmpRoot, entry.file));
  const indexFile = path.join(tmpRoot, "live-facts.json");
  const indexText = await readText(indexFile).catch(() => "");
  const index = indexText ? JSON.parse(indexText) : {items: []};
  check("contract", "no-verbatim-on-disk", verbatimHits.length === 0, {hits: verbatimHits});
  check("contract", "index-metadata-only",
    index.items.length === 1 && !indexText.includes(VERBATIM)
    && !Object.prototype.hasOwnProperty.call(index.items[0], "textOriginal")
    && index.items[0].sessionId === SID,
    {items: index.items});
  check("contract", "status-declares-memory-only",
    live.status().persistedTranscripts === false && live.status().confirmed === 1, live.status());

  const withdrawn = await live.withdrawLiveFact({factId, slug: a, confirm: true});
  const afterWithdraw = await demo.readPersona(a);
  check("contract", "withdraw-removes-fact-and-question",
    withdrawn.withdrawn === true
    && afterWithdraw.factCount === beforeA.factCount
    && !(afterWithdraw.prep.personalized || []).some((question) => question.factId === factId),
    {
      factCount: afterWithdraw.factCount,
      before: beforeA.factCount,
      personalized: afterWithdraw.prep.personalized.map((question) => ({factId: question.factId, en: question.en})),
    });

  const repeatWithdraw = await live.withdrawLiveFact({factId, slug: a, confirm: true}).then(
    (value) => ({ok: true, alreadyAbsent: value.alreadyAbsent}),
    (error) => ({ok: false, code: error.code}));
  check("contract", "withdraw-repeat-idempotent",
    repeatWithdraw.ok === true && repeatWithdraw.alreadyAbsent === true, repeatWithdraw);

  const cleared = live.clear({sessionId: SID});
  check("contract", "clear-memory-on-leave",
    cleared.ok === true && live.pending().length === 0 && live.status().pending === 0, cleared);
  check("contract", "real-people-untouched-by-contract",
    path.resolve(tmpRoot) !== path.resolve(path.join(GATEWAY, "..", "..", "SocialMate-Data", "People")),
    {isolatedRoot: tmpRoot});
}

/* ================================== http ================================== */
async function httpJson(pathname, {method = "GET", body, headers = {}} = {}) {
  const response = await fetch(BASE + pathname, {
    method,
    headers: {"Accept": "application/json", ...(body ? {"Content-Type": "application/json"} : {}), ...headers},
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let payload = null;
  try { payload = await response.json(); } catch {}
  return {status: response.status, body: payload};
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function httpGroup() {
  const origin = BASE;
  // 服务端写限流：同源写操作最小间隔 400ms，验收按真实节奏发请求（不绕过限流）。
  const writeGap = () => sleep(480);
  const status = await httpJson("/v12/api/live/status");
  check("http", "live-status",
    status.status === 200 && status.body?.ok === true && status.body?.persistedTranscripts === false,
    {status: status.status, body: status.body && {
      pending: status.body.pending, persistedTranscripts: status.body.persistedTranscripts,
      counters: status.body.counters,
    }});

  const pending = await httpJson("/v12/api/live/pending");
  check("http", "pending-targets-and-privacy",
    pending.status === 200 && Array.isArray(pending.body?.targets) && pending.body.targets.length === 3
    && pending.body?.privacy?.requiresAttribution === true
    && pending.body?.privacy?.speakerUnknown === true,
    {status: pending.status, targets: (pending.body?.targets || []).map((t) => t.slug),
      privacy: pending.body?.privacy});

  const noTicket = await httpJson("/v12/api/live/pending/liv_missing/confirm", {
    method: "POST", headers: {Origin: origin}, body: {confirm: true, slug: "demo-oliver-uk"},
  });
  check("http", "confirm-requires-write-ticket",
    noTicket.status === 403 && noTicket.body?.code === "WRITE_TICKET_REQUIRED",
    {status: noTicket.status, code: noTicket.body?.code});

  const ticket = await httpJson("/v12/api/demo/write-ticket");
  check("http", "write-ticket-issued", ticket.status === 200 && Boolean(ticket.body?.ticket), {status: ticket.status});

  const crossOrigin = await httpJson("/v12/api/live/pending/liv_missing/confirm", {
    method: "POST",
    headers: {Origin: "http://attacker.example", "x-sm-write": ticket.body?.ticket || ""},
    body: {confirm: true, slug: "demo-oliver-uk"},
  });
  check("http", "cross-origin-write-rejected",
    crossOrigin.status === 403 && crossOrigin.body?.code === "ORIGIN_REJECTED",
    {status: crossOrigin.status, code: crossOrigin.body?.code});

  await writeGap();
  const ticket2 = await httpJson("/v12/api/demo/write-ticket");
  const noConfirm = await httpJson("/v12/api/live/pending/liv_missing/confirm", {
    method: "POST",
    headers: {Origin: origin, "x-sm-write": ticket2.body?.ticket || ""},
    body: {slug: "demo-oliver-uk"},
  });
  check("http", "http-confirm-flag-required",
    noConfirm.status === 400 && noConfirm.body?.code === "CONFIRM_REQUIRED",
    {status: noConfirm.status, code: noConfirm.body?.code});

  await writeGap();
  const ticket3 = await httpJson("/v12/api/demo/write-ticket");
  const unknownPending = await httpJson("/v12/api/live/pending/liv_does_not_exist/confirm", {
    method: "POST",
    headers: {Origin: origin, "x-sm-write": ticket3.body?.ticket || ""},
    body: {confirm: true, slug: "demo-oliver-uk"},
  });
  check("http", "unknown-pending-404",
    unknownPending.status === 404 && unknownPending.body?.code === "LIVE_PENDING_NOT_FOUND",
    {status: unknownPending.status, code: unknownPending.body?.code});

  await writeGap();
  const clear = await httpJson("/v12/api/live/clear", {method: "POST", headers: {Origin: origin}, body: {}});
  check("http", "clear-endpoint-no-state-write",
    clear.status === 200 && clear.body?.ok === true, {status: clear.status, body: clear.body});
}

/* =================================== e2e ================================== */
async function e2eGroup() {
  if (!TIMELINE) {
    check("e2e", "timeline-provided", false, {reason: "NOT_RUN: 未提供 --timeline（真机证据缺失）"});
    return {ran: false};
  }
  let raw;
  try { raw = await readText(TIMELINE); } catch (error) {
    check("e2e", "timeline-readable", false, {reason: `NOT_RUN: ${error.code || error.message}`});
    return {ran: false};
  }
  const events = raw.split("\n").filter((line) => line.trim()).map((line, index) => {
    try { return JSON.parse(line); } catch { return {invalid: true, index}; }
  });
  check("e2e", "timeline-parsed", events.every((event) => !event.invalid), {lines: events.length});
  const kinds = events.map((event) => event.kind);

  const open = events.find((event) => event.kind === "asr_open");
  check("e2e", "asr-open-with-real-mode",
    Boolean(open) && open.mock === false && open.provider === "tencent" && open.healthyMode === "tencent",
    open || null);

  const finals = events.filter((event) => event.kind === "asr_final");
  check("e2e", "real-final-not-mock",
    finals.length >= 1 && finals.every((event) => event.mock === false && event.provider === "tencent"),
    finals.map((event) => ({mock: event.mock, provider: event.provider, chars: String(event.text || "").length,
      sessionId: event.sessionId, segmentIndex: event.segmentIndex})));

  const pending = events.filter((event) => event.kind === "pending_created");
  check("e2e", "pending-created-from-final",
    pending.length >= 1 && pending.some((event) => finals.some((fin) => fin.pendingId === event.pendingId)),
    pending.map((event) => ({pendingId: event.pendingId, speaker: event.speaker, source: event.source})));

  const before = events.find((event) => event.kind === "prep_before");
  const confirmReq = events.find((event) => event.kind === "confirm_request");
  const confirmRes = events.find((event) => event.kind === "confirm_result");
  const after = events.find((event) => event.kind === "prep_after");
  check("e2e", "confirm-requires-explicit-person",
    Boolean(confirmReq) && Boolean(confirmReq.slug) && confirmReq.confirm === true
    && Boolean(confirmRes) && confirmRes.ok === true,
    {request: confirmReq, result: confirmRes && {ok: confirmRes.ok, slug: confirmRes.slug, factCount: confirmRes.factCount,
      factId: confirmRes.factId, duplicate: confirmRes.duplicate}});
  check("e2e", "prep-changed-after-confirm",
    Boolean(before) && Boolean(after)
    && (after.questions || []).some((question) => question.factId === confirmRes?.factId)
    && JSON.stringify(before.questions) !== JSON.stringify(after.questions),
    {before: before && before.questions, after: after && after.questions});

  const restart = events.find((event) => event.kind === "restart_reopen");
  check("e2e", "persisted-after-restart",
    Boolean(restart) && (restart.questions || []).some((question) => question.factId === confirmRes?.factId)
    && restart.factCount === confirmRes?.factCount,
    restart && {factCount: restart.factCount, questions: restart.questions});

  const withdraw = events.find((event) => event.kind === "withdraw_result");
  const afterWithdraw = events.find((event) => event.kind === "prep_after_withdraw");
  check("e2e", "withdraw-drops-question",
    Boolean(withdraw) && withdraw.ok === true
    && Boolean(afterWithdraw) && !(afterWithdraw.questions || []).some((question) => question.factId === confirmRes?.factId)
    && afterWithdraw.factCount === confirmRes?.factCount - 1,
    {withdraw, afterWithdraw});

  const others = events.find((event) => event.kind === "other_people_untouched");
  check("e2e", "other-two-people-hash-unchanged",
    Boolean(others) && Array.isArray(others.people) && others.people.length === 2
    && others.people.every((person) => person.before === person.after && person.hasFact === false),
    others);

  const budget = events.find((event) => event.kind === "asr_budget");
  check("e2e", "budget-delta-within-cap",
    Boolean(budget) && Number(budget.deltaCny) >= 0 && Number(budget.deltaCny) <= 0.05
    && budget.capCny === 0.05,
    budget);
  check("e2e", "no-double-billing-on-retry",
    Boolean(budget) && Number(budget.retryAsrCalls) === 0,
    budget && {retryAsrCalls: budget.retryAsrCalls, calls: budget.calls});

  const leave = events.find((event) => event.kind === "leave_cleanup");
  check("e2e", "leave-clears-memory-keeps-facts",
    Boolean(leave) && Number(leave.pendingBeforeLeave) > 0
    && Number(leave.pendingAfterLeave) === 0 && leave.confirmedFactsPreserved === true,
    leave);

  check("e2e", "device-version",
    Boolean(events.find((event) => event.kind === "device_version"
      && event.serial === DEVICE && event.versionName === "0.7.9" && event.versionCode === 34)),
    events.find((event) => event.kind === "device_version") || null);
  return {ran: true, kinds};
}

/* ================================== main ================================== */
const started = Date.now();
try {
  await contractGroup();
} catch (error) {
  check("contract", "group-crashed", false, {error: error.message});
}
try {
  await httpGroup();
} catch (error) {
  check("http", "group-crashed", false, {error: error.message, base: BASE});
}
let e2e = {ran: false};
try {
  e2e = await e2eGroup();
} catch (error) {
  check("e2e", "group-crashed", false, {error: error.message});
}

const failed = checks.filter((checkItem) => !checkItem.ok);
const notRun = failed.filter((checkItem) => /NOT_RUN|未提供|缺失/.test(String(checkItem.detail?.reason || "")));
const hardFailed = failed.filter((checkItem) => !notRun.includes(checkItem));
let result = "PASS";
if (hardFailed.length) result = "FAIL";
else if (notRun.length || !e2e.ran) result = "PARTIAL";

const report = {
  task: "ALW-001 N04 V1.3 T2",
  result,
  startedAt: STAMP,
  finishedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  base: BASE,
  device: DEVICE,
  isolatedDemoRoot: tmpRoot,
  e2e: {ran: e2e.ran, timeline: TIMELINE || null},
  totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length,
    notRun: notRun.length},
  groups: {
    contract: checks.filter((checkItem) => checkItem.group === "contract"),
    http: checks.filter((checkItem) => checkItem.group === "http"),
    e2e: checks.filter((checkItem) => checkItem.group === "e2e"),
  },
};
if (JSON_OUT) {
  await fs.mkdir(path.dirname(path.resolve(JSON_OUT)), {recursive: true});
  await fs.writeFile(JSON_OUT, `${JSON.stringify(report, null, 2)}\n`, {encoding: "utf8", mode: 0o644});
}
console.log(JSON.stringify({result, checks: report.totals, json: JSON_OUT || null}));
process.exit(result === "PASS" ? 0 : result === "PARTIAL" ? 2 : 1);
