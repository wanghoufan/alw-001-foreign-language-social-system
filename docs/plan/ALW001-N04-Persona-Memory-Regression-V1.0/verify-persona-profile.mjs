#!/usr/bin/env node
/**
 * ALW001 N04 · 人物档案详情页回归（分组 + 逐条编辑 + 删除 + 批量 + 变更记录 + 撤回）。
 *
 * 特点：
 * - 完全不碰真实 SocialMate-Data：SM_DEMO_DIR 指向临时目录，结束时删除；
 * - 不依赖 8781 归档服务：注入只读假 archive，只校验令牌请求头是否存在；
 * - 不缩小生产限流：生产仍用 server.mjs 的 createRateLimiter，这里注入宽松实现只为
 *   让同一条脚本连续覆盖 10+ 次写操作；
 * - 真实 People 与真实 Demo 前后 sha256 必须一致。
 *
 * 用法：node docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/verify-persona-profile.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..", "..");
const realPeople = path.join(repo, "SocialMate-Data", "People");
const realDemo = path.join(repo, "SocialMate-Data", "Demo");
const builtHtml = path.join(repo, "socialmate-v1.2", "index.html");
const tmpDemo = fs.mkdtempSync(path.join(os.tmpdir(), "sm-persona-verify-"));

process.env.SM_DEMO_DIR = tmpDemo;
process.env.SM_AI_NO_LISTEN = "1";

const checks = [];
const failures = [];
function ok(id, cond, detail) {
  const row = {id, pass: Boolean(cond), detail: detail === undefined ? null : detail};
  (cond ? checks : failures).push(row);
  return cond;
}

function hashTree(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(path.relative(dir, full) + " " +
        crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return {files: out.sort(), digest: crypto.createHash("sha256").update(out.sort().join("\n")).digest("hex")};
}

const realPeopleBefore = hashTree(realPeople);
const realDemoBefore = hashTree(realDemo);

const {createHandler} = await import("../../../socialmate-prototype/ai-gateway/server.mjs");
const fakeArchive = {
  get: async () => ({status: 200, body: "{}"}),
  proxy: () => {},
};
const handler = createHandler({archive: fakeArchive, rateLimit: () => ({ok: true})});
const server = http.createServer(handler);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const TOKEN = "verify-token-0000000000000000";

// 写操作 = 同源 + 一次性写授权票（N04 V1.3 T1-4）。跨源负例也带有效票，证明被拒是 Origin 而非票。
async function writeTicket() {
  const res = await fetch(base + "/v12/api/demo/write-ticket", {cache: "no-store"});
  const parsed = await res.json().catch(() => null);
  if (!parsed?.ticket) throw new Error("写授权票获取失败");
  return parsed.ticket;
}
async function request(method, pathname, body, options = {}) {
  const headers = {Accept: "application/json"};
  if (options.token !== null) headers["x-archive-token"] = options.token || TOKEN;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method === "POST" && options.origin !== "none") {
    headers.Origin = options.origin || base;
    if (options.noTicket !== true) headers["x-sm-write"] = await writeTicket();
  }
  const res = await fetch(base + pathname, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  return {status: res.status, body: parsed};
}
const get = (pathname, options) => request("GET", pathname, undefined, options);
const post = (pathname, body, options) => request("POST", pathname,
  body === undefined ? undefined : {confirm: true, ...body}, options);

const slug = "demo-oliver-uk";
const personPath = `/v12/api/demo/people/${slug}`;

try {
  // 0. 种入隔离演示数据
  const seeded = await get("/v12/api/demo/people");
  ok("demo-seeded-3-personas", seeded.body?.status?.personas === 3, seeded.body?.status);

  // 1. 分组渲染条数正确：固定顺序、组内条数、总数、与事实 group 一致
  const first = await get(personPath);
  const p0 = first.body?.person;
  ok("person-200", first.status === 200 && Boolean(p0), first.status);
  ok("group-order-fixed",
    (p0.groups || []).map((g) => g.id).join(",") === "basic,communication,hobby,life,other",
    (p0.groups || []).map((g) => g.id));
  ok("group-count-sum-equals-facts",
    (p0.groups || []).reduce((n, g) => n + Number(g.count || 0), 0) === p0.factCount,
    {sum: (p0.groups || []).reduce((n, g) => n + Number(g.count || 0), 0), facts: p0.factCount});
  ok("group-counts-match-facts",
    (p0.groups || []).every((g) =>
      g.count === (p0.facts || []).filter((f) => f.group === g.id).length
      && (g.factIds || []).length === g.count),
    (p0.groups || []).map((g) => `${g.id}:${g.count}`));
  const html = fs.readFileSync(builtHtml, "utf8");
  const groupSignature = "zh:{basic:'基本情况',communication:'沟通习惯',hobby:'爱好',life:'生活习惯',other:'其他'";
  ok("built-html-has-five-groups-in-order", html.includes(groupSignature), groupSignature);

  // 2. 单条编辑生效
  const editTarget = p0.facts.find((f) => f.group === "hobby") || p0.facts[0];
  const editedText = "奥利弗每周固定三次力量训练（回归验证改写）。";
  const edited = await post(`${personPath}/facts/${editTarget.id}/edit`, {text: editedText, lang: "zh"});
  const p1 = edited.body?.person;
  ok("edit-200", edited.status === 200 && Boolean(p1), edited.status);
  ok("edit-persisted", p1?.facts?.find((f) => f.id === editTarget.id)?.textZh === editedText,
    p1?.facts?.find((f) => f.id === editTarget.id));
  ok("edit-changelog-action", edited.body?.entry?.action === "edit", edited.body?.entry?.action);

  // 3. 删除生效
  const deleteTarget = p1.facts.find((f) => f.id !== editTarget.id);
  const deleted = await post(`${personPath}/facts/${deleteTarget.id}/delete`, {});
  const p2 = deleted.body?.person;
  ok("delete-200", deleted.status === 200 && Boolean(p2), deleted.status);
  ok("delete-gone", !p2?.facts?.some((f) => f.id === deleteTarget.id), p2?.factCount);
  ok("delete-changelog-action", deleted.body?.entry?.action === "delete", deleted.body?.entry?.action);

  // 4. 批量删除 2 条
  const bulkIds = p2.facts.slice(0, 2).map((f) => f.id);
  const bulk = await post(`${personPath}/facts/bulk-delete`, {factIds: bulkIds});
  const p3 = bulk.body?.person;
  ok("bulk-delete-200", bulk.status === 200, bulk.status);
  ok("bulk-delete-count", bulk.body?.removedCount === 2, bulk.body?.removedCount);
  ok("bulk-delete-facts-gone", bulkIds.every((id) => !p3?.facts?.some((f) => f.id === id)),
    {before: p2.factCount, after: p3?.factCount});
  ok("bulk-delete-entries-batched",
    Array.isArray(bulk.body?.entries) && bulk.body.entries.length === 2
      && bulk.body.entries.every((e) => e.batchId === bulk.body.batchId),
    bulk.body?.entries?.map((e) => e.batchId));

  // 5. 改分组生效
  const mover = p3.facts[0];
  const targetGroup = mover.group === "life" ? "other" : "life";
  const moved = await post(`${personPath}/facts/bulk-group`, {factIds: [mover.id], group: targetGroup});
  const p4 = moved.body?.person;
  ok("move-group-200", moved.status === 200 && moved.body?.movedCount === 1, moved.body?.movedCount);
  ok("move-group-persisted", p4?.facts?.find((f) => f.id === mover.id)?.group === targetGroup,
    p4?.facts?.find((f) => f.id === mover.id)?.group);
  ok("move-group-changelog-action", moved.body?.entries?.[0]?.action === "edit", moved.body?.entries?.[0]);

  // 6. 新增一条 + 变更记录条数与动作类型
  const added = await post(`${personPath}/facts`, {text: "验证新增：奥利弗习惯把训练安排在早晨。", group: "life"});
  const p5 = added.body?.person;
  ok("add-200", added.status === 200 && added.body?.entry?.action === "add", added.status);
  const addedId = added.body?.entry?.factId;
  ok("add-persisted", Boolean(p5?.facts?.some((f) => f.id === addedId)), addedId);

  const changelog = await get(`${personPath}/changelog`);
  const entries = changelog.body?.entries || [];
  const lines = fs.readFileSync(path.join(tmpDemo, "changelog.jsonl"), "utf8")
    .split("\n").filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.slug === slug).length;
  ok("changelog-200", changelog.status === 200, changelog.status);
  ok("changelog-count-matches-file", changelog.body?.count === lines, {count: changelog.body?.count, lines});
  ok("changelog-actions-present",
    ["add", "edit", "delete"].every((action) => entries.some((e) => e.action === action)),
    changelog.body?.counts);
  const times = entries.map((e) => String(e.at));
  ok("changelog-desc", times.every((t, i) => i === 0 || t <= times[i - 1]), times.slice(0, 3));

  // 7. 撤回后回滚（新增→删除；修改→旧值；删除→恢复；改分组→移回）
  const undoAdd = await post(`${personPath}/changelog/${added.body.entry.id}/undo`, {});
  ok("undo-add-removed",
    undoAdd.status === 200 && !undoAdd.body?.person?.facts?.some((f) => f.id === addedId),
    undoAdd.status);
  ok("undo-add-action", undoAdd.body?.entry?.action === "undo", undoAdd.body?.entry?.action);

  const undoEdit = await post(`${personPath}/changelog/${edited.body.entry.id}/undo`, {});
  ok("undo-edit-rollback",
    undoEdit.body?.person?.facts?.find((f) => f.id === editTarget.id)?.textZh === editTarget.textZh,
    undoEdit.body?.person?.facts?.find((f) => f.id === editTarget.id)?.textZh);

  const undoDelete = await post(`${personPath}/changelog/${deleted.body.entry.id}/undo`, {});
  const restored = undoDelete.body?.person?.facts?.find((f) => f.id === deleteTarget.id);
  ok("undo-delete-restored",
    Boolean(restored) && restored.textZh === deleteTarget.textZh && restored.group === deleteTarget.group,
    restored);

  const undoMove = await post(`${personPath}/changelog/${moved.body.entries[0].id}/undo`, {});
  ok("undo-move-rollback",
    undoMove.body?.person?.facts?.find((f) => f.id === mover.id)?.group === mover.group,
    undoMove.body?.person?.facts?.find((f) => f.id === mover.id)?.group);

  const finalLog = await get(`${personPath}/changelog`);
  ok("undo-leaves-trace", (finalLog.body?.counts?.undo || 0) === 4, finalLog.body?.counts);
  ok("undo-entry-not-undoable",
    (finalLog.body?.entries || []).filter((e) => e.action === "undo").every((e) => e.undoable === false),
    (finalLog.body?.entries || []).filter((e) => e.action === "undo").length);

  // 8. 未标注 group 的老事实：仍要读得到，并归入「其他」，不丢历史
  const legacyFile = path.join(tmpDemo, "People", slug, "00-profile.md");
  const beforeLegacy = await get(personPath);
  const beforeLegacyCount = beforeLegacy.body?.person?.factCount;
  fs.appendFileSync(legacyFile, "\n- 旧数据未标注分组的一条事实。<!--sm-src:legacy12345678-->\n", "utf8");
  const legacy = await get(personPath);
  const legacyFact = legacy.body?.person?.facts?.find((f) => f.id === "legacy12345678");
  ok("legacy-unmarked-fact-kept", Boolean(legacyFact) && legacyFact.text.includes("旧数据未标注分组"),
    legacyFact);
  ok("legacy-unmarked-group-other", legacyFact?.group === "other", legacyFact?.group);
  ok("legacy-count-includes-old", legacy.body?.person?.factCount === beforeLegacyCount + 1,
    {before: beforeLegacyCount, after: legacy.body?.person?.factCount});

  // 9. 写接口令牌 + 同源
  const noToken = await post(`${personPath}/facts/${editTarget.id}/edit`,
    {text: "无令牌不应写入", lang: "zh"}, {token: null});
  ok("write-requires-token", noToken.status === 401, noToken.status);
  const badOrigin = await post(`${personPath}/facts/${editTarget.id}/edit`,
    {text: "跨源不应写入", lang: "zh"}, {origin: "http://evil.example"});
  ok("write-same-origin", badOrigin.status === 403, badOrigin.status);

  // 10. 真实 People / 真实 Demo 零写入
  const realPeopleAfter = hashTree(realPeople);
  const realDemoAfter = hashTree(realDemo);
  ok("real-people-sha256-unchanged",
    realPeopleAfter.digest === realPeopleBefore.digest && realPeopleAfter.files.length === realPeopleBefore.files.length,
    {files: realPeopleAfter.files.length, digest: realPeopleAfter.digest});
  ok("real-demo-sha256-unchanged",
    realDemoAfter.digest === realDemoBefore.digest && realDemoAfter.files.length === realDemoBefore.files.length,
    {files: realDemoAfter.files.length, digest: realDemoAfter.digest});
} catch (error) {
  failures.push({id: "unexpected-error", pass: false, detail: String(error?.stack || error)});
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmpDemo, {recursive: true, force: true});
}

const result = {
  result: failures.length ? "FAIL" : "PASS",
  checks: checks.length,
  failures,
  isolatedDemo: tmpDemo,
  realPeople: {files: realPeopleBefore.files.length, sha256: realPeopleBefore.digest},
};
console.log(JSON.stringify(result, null, 2));
process.exit(failures.length ? 1 : 0);
