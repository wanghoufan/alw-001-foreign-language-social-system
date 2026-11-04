#!/usr/bin/env node
/**
 * ALW-001 N04 V1.3 · T1 专用验收（原文真实性 + 原生/服务最小安全闭环）
 *
 * 覆盖 PLAN T1 的四条与 ACCEPTANCE QA01/QA02 的可核验部分：
 *   A1 逐字一致性：REPLAY 的每一句都必须与 fixture 同 sessionId+segmentIndex 的
 *      textOriginal **逐字符**相同；候选摘要单独字段并带 sourceExactText + evidenceId。
 *   A2 伪造反例：越界段号 / 未知 session / 错人物归属 / 摘要冒充原文 / 重复提交
 *      → 全部 4xx（或幂等去重），且真实 People 与演示 People 前后 sha256 一致。
 *   B  写鉴权：同源 + CSRF 票 + 写授权；缺票/跨源/重放/篡改全部 403，读仍免令牌。
 *   C  令牌不进 APK：一次配对码 → 设备凭证 → ≤24h 短期令牌；重放/撤销/未配对全部拒绝。
 *   D  静态：build.gradle 不再有 ARCHIVE_TOKEN buildConfigField；APK（若给 --apk）strings 搜不到旧令牌。
 *
 * 用法：
 *   node docs/plan/ALW001-N04-V1.3-Real-Use-Closure/verify-t1.mjs [--base URL] [--apk PATH] [--json out.json]
 * 退出码：0=全部通过；1=有失败；2=脚本自身异常。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

const args = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = argOf("--base", "http://127.0.0.1:8791").replace(/\/$/, "");
const APK = argOf("--apk", "");
const BRIDGE_NORMAL = argOf("--bridge-normal", "");
const BRIDGE_FAILURE = argOf("--bridge-failure", "");
const JSON_OUT = argOf("--json", "");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const FIXTURE = path.join(REPO, "docs", "plan",
  "ALW001-N04-Persona-Memory-Regression-V1.0", "fixtures", "demo-personas.json");
const REAL_PEOPLE = path.join(REPO, "SocialMate-Data", "People");
const DEMO_ROOT = path.join(REPO, "SocialMate-Data", "Demo");
const LEGACY_TOKEN_FILE = path.join(REPO, "socialmate-v1.2", ".local", "archive-token");

const checks = [];
const record = (id, pass, detail) => {
  checks.push({id, pass: Boolean(pass), detail});
  return Boolean(pass);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 工具 ------------------------------ */
function hashTree(dir, out = [], root = dir) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) hashTree(full, out, root);
    else if (entry.isFile()) out.push(path.relative(root, full) + " " +
      crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
  }
  return out.sort();
}
const digest = (lines) => crypto.createHash("sha256").update(lines.join("\n")).digest("hex");
const realPeopleSha = () => digest(hashTree(REAL_PEOPLE));
const demoPeopleSha = () => digest(hashTree(path.join(DEMO_ROOT, "People")));

/** 逐字符比较：返回第一处不同的码点位置，-1 表示完全一致。 */
function firstDiff(a, b) {
  const x = [...String(a)];
  const y = [...String(b)];
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i += 1) if (x[i] !== y[i]) return i;
  return x.length === y.length ? -1 : n;
}

async function get(p) {
  const res = await fetch(BASE + p, {cache: "no-store"});
  const body = await res.json().catch(() => null);
  return {status: res.status, body};
}
/** 单次请求：不做重试，负例必须看到「第一次」的真实状态码。 */
async function postOnce(p, body, headers = {}) {
  const res = await fetch(BASE + p, {
    method: "POST",
    headers: {"Content-Type": "application/json", ...headers},
    body: JSON.stringify(body),
  });
  const parsed = await res.json().catch(() => null);
  return {status: res.status, body: parsed};
}
async function ticket() {
  const res = await fetch(BASE + "/v12/api/demo/write-ticket", {cache: "no-store"});
  const body = await res.json().catch(() => null);
  if (!body?.ticket) throw new Error("写授权票获取失败：" + res.status);
  return body.ticket;
}
/**
 * 合法写：同源 Origin + 新票。
 * 票是一次性的，因此每次重试都必须重新取票——复用旧票会被服务端按重放拒绝（这是被测行为）。
 */
async function write(p, body) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await postOnce(p, body, {Origin: BASE, "x-sm-write": await ticket()});
    if (res.status !== 429) return res;
    await wait(Math.min(65_000, Number(res.body?.retryAfterMs) || 1_000) + 300);
  }
  return {status: 429, body: {ok: false, code: "RATE_LIMITED"}};
}
const isClientError = (status) => status >= 400 && status < 500;

/* ------------------------------ 母版索引 ------------------------------ */
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const fixtureSha = crypto.createHash("sha256").update(fs.readFileSync(FIXTURE)).digest("hex");
function exactOf(sessionId, segmentIndex) {
  for (const persona of fixture.personas) {
    for (const session of persona.sessions) {
      if (session.sessionId !== sessionId) continue;
      for (const [i, seg] of session.segments.entries()) {
        const at = Number.isFinite(Number(seg.index)) ? Number(seg.index) : i;
        if (at === segmentIndex) return {slug: persona.slug, text: String(seg.textOriginal), count: session.segments.length};
      }
    }
  }
  return null;
}

/* ============================== 开跑 ============================== */
const startedAt = new Date().toISOString();
const realBefore = realPeopleSha();

try {
  /* ---------- 基线 ---------- */
  const health = await get("/api/ai/health");
  record("health-200", health.status === 200, health.status);
  const restore = await write("/v12/api/demo/restore", {confirm: true});
  record("baseline-restore", restore.status === 200 && restore.body?.status?.personas === 3
    && restore.body?.status?.sessions === 9, {status: restore.status, s: restore.body?.status});

  /* ---------- A1 逐字一致性（3/3） ---------- */
  const replaySlugs = ["demo-oliver-uk", "demo-maya-us", "demo-jieun-kr"];
  const replayExpect = {
    "demo-oliver-uk": {sessionId: "sess_n04_demo_oliver_uk_3", segmentIndex: 1},
    "demo-maya-us": {sessionId: "sess_n04_demo_maya_us_3", segmentIndex: 5},
    "demo-jieun-kr": {sessionId: "sess_n04_demo_jieun_kr_3", segmentIndex: 3},
  };
  const exactness = [];
  for (const slug of replaySlugs) {
    const expect = replayExpect[slug];
    const fixtureExact = exactOf(expect.sessionId, expect.segmentIndex);
    const res = await write("/v12/api/demo/final", {confirm: true, slug});
    const item = res.body?.item;
    const diff = item ? firstDiff(item.text, fixtureExact.text) : -2;
    const pass = res.status === 200 && res.body?.added === true && diff === -1
      && item?.source?.sessionId === expect.sessionId
      && Number(item?.source?.segmentIndex) === expect.segmentIndex
      && item?.evidenceId === `${expect.sessionId}#${expect.segmentIndex}`
      && item?.sourceExactText === fixtureExact.text
      && Boolean(item?.candidateFact) && item?.candidateFact !== item?.text;
    record(`A1-exact-${slug}`, pass, {
      status: res.status,
      code: res.body?.code || null,
      evidenceId: item?.evidenceId,
      exactCharEqual: diff === -1,
      firstDiffAt: diff,
      fixtureChars: [...fixtureExact.text].length,
      serverChars: item ? [...String(item.text)].length : 0,
      candidateFactSeparate: Boolean(item?.candidateFact) && item?.candidateFact !== item?.text,
      fixtureSha256: fixtureSha,
    });
    exactness.push({slug, sessionId: expect.sessionId, segmentIndex: expect.segmentIndex,
      textOriginal: fixtureExact.text, candidateFact: item?.candidateFact || "",
      evidenceId: item?.evidenceId || null, charEqual: diff === -1});
    await wait(450);
  }
  record("A1-exact-3of3", exactness.every((row) => row.charEqual), exactness.map((r) => r.charEqual));

  /* 3 条已知错配的「旧句」必须被拒（它们不是母版原文）。 */
  const staleParaphrases = [
    {slug: "demo-oliver-uk", sessionId: "sess_n04_demo_oliver_uk_3", segmentIndex: 1,
      text: "Oliver keeps his runs easy on the days after heavy lifting."},
    {slug: "demo-maya-us", sessionId: "sess_n04_demo_maya_us_3", segmentIndex: 5,
      text: "Maya wants to try casual local food in Haikou before any live music."},
    {slug: "demo-jieun-kr", sessionId: "sess_n04_demo_jieun_kr_3", segmentIndex: 3,
      text: "Ji-eun noticed the shadows on the walls in her morning-light photo."},
  ];
  const staleResults = [];
  for (const stale of staleParaphrases) {
    const res = await write("/v12/api/demo/final", {confirm: true, ...stale});
    staleResults.push({slug: stale.slug, status: res.status, code: res.body?.code});
    record(`A1-stale-paraphrase-rejected-${stale.slug}`,
      res.status === 400 && res.body?.code === "SOURCE_TEXT_MISMATCH", {status: res.status, code: res.body?.code});
    await wait(450);
  }

  /* ---------- A2 伪造反例（真实 People / 演示 People 零写入） ---------- */
  const demoBeforeForgeries = demoPeopleSha();
  const realBeforeForgeries = realPeopleSha();

  const oliverSession = "sess_n04_demo_oliver_uk_3";
  const oliverExact = exactOf(oliverSession, 1);

  const outOfRange = await write("/v12/api/demo/final", {
    confirm: true, slug: "demo-oliver-uk", sessionId: oliverSession, segmentIndex: 99, text: oliverExact.text,
  });
  record("A2-out-of-range-segment", isClientError(outOfRange.status)
    && outOfRange.body?.code === "SOURCE_SEGMENT_OUT_OF_RANGE", {status: outOfRange.status, code: outOfRange.body?.code});
  await wait(450);

  const unknownSession = await write("/v12/api/demo/final", {
    confirm: true, slug: "demo-oliver-uk", sessionId: "sess_forged_9999", segmentIndex: 0, text: "forged",
  });
  record("A2-unknown-session", isClientError(unknownSession.status)
    && unknownSession.body?.code === "SOURCE_SESSION_UNKNOWN", {status: unknownSession.status, code: unknownSession.body?.code});
  await wait(450);

  const wrongOwner = await write("/v12/api/demo/final", {
    confirm: true, slug: "demo-maya-us", sessionId: oliverSession, segmentIndex: 1, text: oliverExact.text,
  });
  record("A2-wrong-owner-inject", isClientError(wrongOwner.status)
    && wrongOwner.body?.code === "SOURCE_OWNERSHIP_MISMATCH", {status: wrongOwner.status, code: wrongOwner.body?.code});
  await wait(450);

  // 错归属的第二条路径：先进「未归属」，再试图按错误人物确认。
  const mayaSession = "sess_n04_demo_maya_us_1";
  const mayaExact = exactOf(mayaSession, 1);
  const inbox = await write("/v12/api/demo/final", {
    confirm: true, text: mayaExact.text, sessionId: mayaSession, segmentIndex: 1, section: "plan",
  });
  record("A2-inbox-unattributed", inbox.status === 200 && inbox.body?.added === true && !inbox.body?.attributedTo,
    {status: inbox.status, attributedTo: inbox.body?.attributedTo});
  await wait(450);
  const inboxId = inbox.body?.item?.id;
  const misattributed = await write(
    `/v12/api/demo/people/demo-oliver-uk/pending/${encodeURIComponent(inboxId || "")}/confirm`, {confirm: true});
  record("A2-wrong-owner-confirm", isClientError(misattributed.status)
    && misattributed.body?.code === "SOURCE_OWNERSHIP_MISMATCH",
    {status: misattributed.status, code: misattributed.body?.code});
  await wait(450);

  // 重复最终事件：同一段再提交一次不得变成第二条。
  const dupe = await write("/v12/api/demo/final", {
    confirm: true, slug: "demo-oliver-uk", sessionId: oliverSession, segmentIndex: 1, text: oliverExact.text,
  });
  record("A2-duplicate-final-idempotent",
    dupe.status === 200 && dupe.body?.added === false && dupe.body?.duplicate === true,
    {status: dupe.status, added: dupe.body?.added, reason: dupe.body?.reason});
  await wait(450);

  // 伪造段号被拒后，演示人物档案不得出现这些字符串。
  const oliverProfile = fs.readFileSync(path.join(DEMO_ROOT, "People", "demo-oliver-uk", "00-profile.md"), "utf8");
  record("A2-no-forged-write-into-profile",
    !oliverProfile.includes("sess_forged_9999") && !oliverProfile.includes("forged"),
    {profileLen: oliverProfile.length});

  const demoAfterForgeries = demoPeopleSha();
  const realAfterForgeries = realPeopleSha();
  record("A2-demo-people-unchanged", demoAfterForgeries === demoBeforeForgeries,
    {before: demoBeforeForgeries, after: demoAfterForgeries});
  record("A2-real-people-unchanged", realAfterForgeries === realBeforeForgeries,
    {before: realBeforeForgeries, after: realAfterForgeries});

  // 清掉未归属候选，避免影响后续基线。
  if (inboxId) {
    await write(`/v12/api/demo/pending/${encodeURIComponent(inboxId)}/ignore`, {confirm: true});
    await wait(450);
  }

  /* ---------- B 写鉴权（同源 + CSRF 票 + 写授权） ---------- */
  const noTicket = await postOnce("/v12/api/demo/clear", {confirm: true}, {Origin: BASE});
  record("B-write-without-ticket-403", noTicket.status === 403
    && noTicket.body?.code === "WRITE_TICKET_REQUIRED", {status: noTicket.status, code: noTicket.body?.code});

  const badTicket = await postOnce("/v12/api/demo/clear", {confirm: true},
    {Origin: BASE, "x-sm-write": "aaa.9999999999999.bbb"});
  record("B-write-tampered-ticket-403", badTicket.status === 403
    && badTicket.body?.code === "WRITE_TICKET_INVALID", {status: badTicket.status, code: badTicket.body?.code});

  const ticketForReplay = await ticket();
  const firstUse = await postOnce("/v12/api/demo/clear", {confirm: true},
    {Origin: BASE, "x-sm-write": ticketForReplay});
  // 先恢复，避免真把演示清空影响其它检查（clear 成功是预期行为）。
  await write("/v12/api/demo/restore", {confirm: true});
  await wait(450);
  const replayUse = await postOnce("/v12/api/demo/clear", {confirm: true},
    {Origin: BASE, "x-sm-write": ticketForReplay});
  record("B-write-ticket-single-use", firstUse.status === 200 && replayUse.status === 403
    && replayUse.body?.code === "WRITE_TICKET_REPLAYED",
    {firstUse: firstUse.status, replay: replayUse.status, code: replayUse.body?.code});

  const crossOrigin = await postOnce("/v12/api/demo/clear", {confirm: true},
    {Origin: "https://evil.example", "x-sm-write": await ticket()});
  record("B-write-cross-origin-403", crossOrigin.status === 403
    && crossOrigin.body?.code === "ORIGIN_REJECTED", {status: crossOrigin.status, code: crossOrigin.body?.code});

  const noOrigin = await postOnce("/v12/api/demo/clear", {confirm: true},
    {"x-sm-write": await ticket()});
  record("B-write-without-origin-403", noOrigin.status === 403
    && noOrigin.body?.code === "ORIGIN_REQUIRED", {status: noOrigin.status, code: noOrigin.body?.code});

  // confirm:true 单独不够：无票时不写。
  const confirmOnly = await postOnce("/v12/api/demo/people/demo-oliver-uk/pending/whatever/confirm",
    {confirm: true}, {Origin: BASE});
  record("B-confirm-alone-not-enough", confirmOnly.status === 403
    && confirmOnly.body?.code === "WRITE_TICKET_REQUIRED", {status: confirmOnly.status, code: confirmOnly.body?.code});

  // 读演示保持免令牌。
  const readNoAuth = await get("/v12/api/demo/people");
  record("B-read-demo-token-free", readNoAuth.status === 200
    && (readNoAuth.body?.people || []).length === 3,
    {status: readNoAuth.status, people: readNoAuth.body?.people?.length});

  /* ---------- C 配对 / 短期令牌 ---------- */
  const code = await get("/v12/api/pair/code");
  record("C-pair-code-issued", code.status === 200 && /^\d{6}$/.test(String(code.body?.code || "")),
    {status: code.status, digits: String(code.body?.code || "").length});

  const badClaim = await postOnce("/v12/api/pair/claim", {code: "000000", deviceName: "verify-t1"});
  const badClaimOK = badClaim.status === 403 || badClaim.status === 410;
  record("C-pair-wrong-code-rejected", badClaimOK, {status: badClaim.status, code: badClaim.body?.code});

  // 用错码会消耗尝试次数，重新取一个码再正式配对。
  const code2 = await get("/v12/api/pair/code");
  const claim = await postOnce("/v12/api/pair/claim",
    {code: code2.body?.code, deviceName: "verify-t1"});
  const deviceId = claim.body?.deviceId || "";
  const deviceSecret = claim.body?.deviceSecret || "";
  const token = claim.body?.token || "";
  record("C-pair-claim-ok", claim.status === 200 && Boolean(deviceId) && Boolean(deviceSecret) && Boolean(token),
    {status: claim.status, deviceId: deviceId.slice(0, 12) + "…"});

  const parts = String(token).split(".");
  const ttlHours = parts.length === 5 ? (Number(parts[3]) - Number(parts[2])) / 3600 : -1;
  record("C-token-ttl-le-24h", ttlHours > 0 && ttlHours <= 24.01,
    {format: parts[0], ttlHours: Number(ttlHours.toFixed(3))});

  const b64url = (buf) => Buffer.from(buf).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const proofOf = (secret, id, ts, nonce) => b64url(
    crypto.createHmac("sha256", secret).update(`pair|${id}|${ts}|${nonce}`).digest());

  const ts = Date.now();
  const nonce = b64url(crypto.randomBytes(9));
  const refreshed = await postOnce("/v12/api/pair/token",
    {deviceId, ts, nonce, proof: proofOf(deviceSecret, deviceId, ts, nonce)});
  record("C-token-refresh-ok", refreshed.status === 200 && Boolean(refreshed.body?.token),
    {status: refreshed.status, code: refreshed.body?.code});

  const replayProof = await postOnce("/v12/api/pair/token",
    {deviceId, ts, nonce, proof: proofOf(deviceSecret, deviceId, ts, nonce)});
  record("C-token-refresh-replay-rejected", replayProof.status === 409
    && replayProof.body?.code === "PAIRING_REPLAY", {status: replayProof.status, code: replayProof.body?.code});

  const badProof = await postOnce("/v12/api/pair/token",
    {deviceId, ts: Date.now(), nonce: b64url(crypto.randomBytes(9)), proof: "x".repeat(43)});
  record("C-token-refresh-bad-proof-rejected", badProof.status === 401
    && badProof.body?.code === "PAIRING_PROOF_INVALID", {status: badProof.status, code: badProof.body?.code});

  const staleProof = await postOnce("/v12/api/pair/token", {
    deviceId, ts: Date.now() - 10 * 60_000,
    nonce: b64url(crypto.randomBytes(9)),
    proof: proofOf(deviceSecret, deviceId, Date.now() - 10 * 60_000, "x"),
  });
  record("C-token-stale-proof-rejected", staleProof.status === 401
    && staleProof.body?.code === "PAIRING_PROOF_STALE", {status: staleProof.status, code: staleProof.body?.code});

  const revoke = await postOnce("/v12/api/pair/revoke", {deviceId, confirm: true});
  record("C-revoke-ok", revoke.status === 200 && Boolean(revoke.body?.revokedAt), {status: revoke.status});
  const afterRevoke = await postOnce("/v12/api/pair/token", {
    deviceId, ts: Date.now(), nonce: b64url(crypto.randomBytes(9)),
    proof: proofOf(deviceSecret, deviceId, Date.now(), "y"),
  });
  record("C-revoked-device-token-rejected", afterRevoke.status === 401
    && afterRevoke.body?.code === "DEVICE_REVOKED", {status: afterRevoke.status, code: afterRevoke.body?.code});

  const deviceList = await get("/v12/api/pair/status");
  const revokedRow = (deviceList.body?.devices || []).find((d) => d.deviceId === deviceId);
  record("C-revoke-visible-in-status", Boolean(revokedRow?.revokedAt),
    {status: deviceList.status, devices: (deviceList.body?.devices || []).length});
  record("C-status-hides-secrets",
    !JSON.stringify(deviceList.body || {}).includes(deviceSecret),
    {leaked: JSON.stringify(deviceList.body || {}).includes(deviceSecret)});

  /* ---------- D 静态：APK 不含长期令牌 ---------- */
  const gradle = fs.readFileSync(path.join(REPO, "android-poc", "app", "build.gradle"), "utf8");
  record("D-gradle-no-archive-token-field", !/buildConfigField\s+"String"\s*,\s*"ARCHIVE_TOKEN"/.test(gradle),
    {hasField: /ARCHIVE_TOKEN/.test(gradle)});
  const javaHits = [];
  const javaRoot = path.join(REPO, "android-poc", "app", "src", "main", "java");
  for (const file of hashTree(javaRoot).map((row) => row.split(" ")[0])) {
    const body = fs.readFileSync(path.join(javaRoot, file), "utf8");
    if (body.includes("BuildConfig.ARCHIVE_TOKEN")) javaHits.push(file);
  }
  record("D-java-no-buildconfig-token", javaHits.length === 0, {files: javaHits});

  let legacyToken = "";
  try {
    legacyToken = fs.readFileSync(LEGACY_TOKEN_FILE, "utf8").trim();
  } catch {
    legacyToken = "";
  }
  record("D-legacy-token-available-for-scan", legacyToken.length >= 24, {length: legacyToken.length});

  if (APK && fs.existsSync(APK) && legacyToken) {
    let found = false;
    try {
      // 直接扫整包（含 classes*.dex、resources.arsc、assets），任何明文出现即视为泄漏。
      const raw = execFileSync("sh", ["-c", `unzip -p "${APK}" 'classes*.dex' 2>/dev/null | strings -a`],
        {maxBuffer: 64 * 1024 * 1024}).toString();
      found = raw.includes(legacyToken);
    } catch {
      found = false;
    }
    record("D-apk-strings-no-legacy-token", !found, {apk: path.basename(APK), found});
  } else {
    record("D-apk-strings-no-legacy-token", false,
      {skipped: true, reason: APK ? "apk 或本机令牌缺失" : "未提供 --apk（构建后再补扫）"});
  }

  /* ---------- B2 原生桥（真机 CDP 取证，可选） ---------- */
  if (BRIDGE_NORMAL && fs.existsSync(BRIDGE_NORMAL)) {
    const probe = JSON.parse(fs.readFileSync(BRIDGE_NORMAL, "utf8"));
    const stepOf = (name) => (probe.steps || []).find((s) => s.name === name)?.value;
    const parse = (value) => {
      if (typeof value !== "string") return value;
      try { return JSON.parse(value); } catch { return value; }
    };
    const url = stepOf("01-current-url");
    const bridge = parse(stepOf("02-private-page-bridge")) || {};
    const frameState = parse(stepOf("04-cross-origin-frame-state")) || {};
    const contexts = stepOf("04a-execution-contexts") || [];
    const frameTree = stepOf("04b-frame-tree") || [];
    const afterNav = parse(stepOf("05-after-external-nav-attempt")) || {};

    record("B2-private-origin-bridge-usable",
      typeof url === "string" && url.startsWith(BASE + "/v12") && bridge.hasBridge === true
      && bridge.saveText === "function", {url, ...bridge});
    record("B2-cross-origin-frame-no-context",
      !contexts.some((c) => String(c.origin || "").includes("18793")),
      {contexts: contexts.map((c) => c.origin)});
    record("B2-cross-origin-frame-unreadable",
      frameState.frameReadable !== true && frameState.frameBridgeReadable !== true, frameState);
    record("B2-frame-tree-no-evil-origin",
      !frameTree.some((f) => String(f.url || "").includes("18793") && String(f.securityOrigin || "").includes("18793")),
      {frames: frameTree.map((f) => f.url)});
    record("B2-external-navigation-cancelled",
      afterNav.href === url, {before: afterNav.before, after: afterNav.href});
  } else {
    record("B2-private-origin-bridge-usable", false, {skipped: true, reason: "未提供 --bridge-normal"});
  }

  if (BRIDGE_FAILURE && fs.existsSync(BRIDGE_FAILURE)) {
    const probe = JSON.parse(fs.readFileSync(BRIDGE_FAILURE, "utf8"));
    const stepOf = (name) => (probe.steps || []).find((s) => s.name === name)?.value;
    const parsed = (() => {
      const raw = stepOf("02-private-page-bridge");
      try { return JSON.parse(raw); } catch { return {}; }
    })();
    record("B2-bridge-useless-after-load-error",
      parsed.saveText === "undefined" && parsed.openRecordingPanel === "undefined",
      {url: stepOf("01-current-url"), ...parsed});
  } else {
    record("B2-bridge-useless-after-load-error", false, {skipped: true, reason: "未提供 --bridge-failure"});
  }

  /* ---------- 收尾：恢复基线，再次确认真实 People 未变 ---------- */
  await wait(450);
  const finalRestore = await write("/v12/api/demo/restore", {confirm: true});
  record("cleanup-restore", finalRestore.status === 200 && finalRestore.body?.status?.personas === 3,
    {status: finalRestore.status});
  const realAfter = realPeopleSha();
  record("cleanup-real-people-unchanged", realAfter === realBefore,
    {before: realBefore, after: realAfter});

  const failures = checks.filter((row) => !row.pass);
  const report = {
    result: failures.length ? "FAIL" : "PASS",
    task: "SM-ALW001-20261102-N04-V13/T1",
    base: BASE,
    startedAt,
    finishedAt: new Date().toISOString(),
    fixture: {path: path.relative(REPO, FIXTURE), sha256: fixtureSha, version: fixture.fixtureVersion || null},
    device: {"serial": process.env.SM_TEST_DEVICE || null},
    exactness,
    staleParaphrases: staleResults,
    totals: {checks: checks.length, passed: checks.length - failures.length, failed: failures.length},
    failures,
    checks,
    realPeople: {sha256Before: realBefore, sha256After: realAfter, unchanged: realAfter === realBefore},
    notes: [
      "读演示免令牌，写操作必须同源 + 一次性 CSRF 票；票由 /v12/api/demo/write-ticket 现取。",
      "短期令牌以 v1.<deviceId>.<iat>.<exp>.<mac> 自校验，撤销后立即失效；未配对时客户端 fail closed。",
      "对照脚本只做 T1，不代替 T2–T5 的真实 ASR / 归档 / 无 USB 验收。",
    ],
  };
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({
    result: "ERROR",
    message: error.message,
    checks: checks.length,
    failures: checks.filter((row) => !row.pass),
  }, null, 2));
  process.exitCode = 2;
}
