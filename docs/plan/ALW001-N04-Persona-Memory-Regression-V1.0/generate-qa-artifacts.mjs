#!/usr/bin/env node
/**
 * N04 第三步 QA 产物生成（SDD §4）。
 *
 * 真跑内容：
 * 1) 读 8791 的演示人物接口，生成三人事实/话题/专属问题对照；
 * 2) 对三人各自「待确认」候选执行一次真实确认，记录确认前后问题快照 → 记忆时间线；
 * 3) 记录清空 → 恢复的真实状态与真实档案哈希不变证明；
 * 4) 结尾恢复 3 人物 / 9 会话 / 54 句基线。
 *
 * 产出（docs/plan/ALW001-N04-Persona-Memory-Regression-V1.0/qa/20261102/）：
 * - persona-comparison.json
 * - memory-timeline.jsonl
 * - clear-restore.json
 * - device.json（真机序列号 / 版本 / APK SHA）
 * archive-inventory.json 由 verify-demo-archive.mjs 生成（含逐文件 sha256）。
 */
import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..", "..");
const BASE = process.env.N04_BASE || "http://127.0.0.1:8791";
const QA = path.join(HERE, "qa", "20261102");
const SERIAL = process.env.N04_SERIAL || "WGBMXWDIAIFMPFCQ";
const APK = process.env.N04_APK || path.join(REPO, "android-poc", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const REAL_ARCHIVE = path.join(process.env.HOME, "Documents", "SocialMate", "Conversations");
const REAL_PEOPLE = path.join(REPO, "SocialMate-Data", "People");
const MAC_DEMO = path.join(process.env.HOME, "Documents", "SocialMate", "Demo", "Conversations");
const FIXTURE = path.join(HERE, "fixtures", "demo-personas.json");

fs.mkdirSync(QA, {recursive: true});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function hashTree(root, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return out;
    throw error;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) hashTree(full, out);
    else if (entry.isFile()) out.push({path: path.relative(root, full), bytes: fs.statSync(full).size,
      sha256: sha256(fs.readFileSync(full))});
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function digestOf(list) {
  // 与第二步 / verify-demo-archive.mjs 同一口径（按完整 "路径 sha" 行排序）。
  return sha256(list.map((i) => `${i.path} ${i.sha256}`).sort().join("\n"));
}

function adb(args) {
  try {
    return execFileSync("adb", ["-s", SERIAL, ...args], {encoding: "utf8", timeout: 15000}).trim();
  } catch {
    return "";
  }
}

function deviceInfo() {
  const dump = adb(["shell", "dumpsys", "package", "app.socialmate.dualmic"]);
  const versionName = (dump.match(/versionName=([^\s]+)/) || [])[1] || "";
  const versionCode = (dump.match(/versionCode=(\d+)/) || [])[1] || "";
  const model = adb(["shell", "getprop", "ro.product.model"]);
  const android = adb(["shell", "getprop", "ro.build.version.release"]);
  let apkSha256 = null;
  try {
    apkSha256 = sha256(fs.readFileSync(APK));
  } catch { /* APK 尚未构建时留空，不伪造 */ }
  return {
    serial: SERIAL,
    model: model || null,
    android: android || null,
    versionName: versionName || null,
    versionCode: versionCode ? Number(versionCode) : null,
    apkPath: APK,
    apkSha256,
    label: "真机（合成演示数据，非真人录音）",
  };
}

async function get(p) {
  const res = await fetch(BASE + p);
  return {status: res.status, body: await res.json().catch(() => null)};
}

async function post(p, body) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(BASE + p, {
      method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
    });
    const parsed = await res.json().catch(() => null);
    if (res.status !== 429) return {status: res.status, body: parsed};
    await wait(Math.min(65_000, Number(parsed?.retryAfterMs) || 1_000) + 250);
  }
  return {status: 429, body: {ok: false, code: "RATE_LIMITED"}};
}

const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const fixtureBySlug = new Map(fixture.personas.map((p) => [p.slug, p]));
const device = deviceInfo();
fs.writeFileSync(path.join(QA, "device.json"), JSON.stringify({generatedAt: new Date().toISOString(), ...device}, null, 2));

const baseline = await post("/v12/api/demo/restore", {confirm: true});
if (baseline.status !== 200) {
  console.error(JSON.stringify(baseline.body, null, 2));
  process.exit(1);
}
await wait(600);

const peopleRes = await get("/v12/api/demo/people");
const people = peopleRes.body?.people || [];
const before = new Map();
for (const p of people) {
  const detail = await get("/v12/api/demo/people/" + encodeURIComponent(p.slug));
  before.set(p.slug, detail.body?.person || null);
}

// ── 1. persona-comparison.json
const comparison = {
  generatedAt: new Date().toISOString(),
  mode: "real-run",
  synthetic: true,
  notice: "3 位均为虚构剧本人物；问题由已确认事实本地规则生成，0 次模型调用。",
  device,
  base: BASE,
  personas: [],
  crossPersona: {},
};

const allPersonalized = new Map();
const allGeneric = [];
for (const p of people) {
  const person = before.get(p.slug);
  const fx = fixtureBySlug.get(p.slug) || {};
  const personalized = (person?.prep?.personalized || []).map((q) => ({
    en: q.en, zh: q.zh, basedOnFact: q.factText, factId: q.factId, source: q.source,
  }));
  personalized.forEach((q) => {
    if (!allPersonalized.has(q.en)) allPersonalized.set(q.en, []);
    allPersonalized.get(q.en).push(p.slug);
  });
  if (person?.prep?.generic?.en) allGeneric.push(person.prep.generic.en);
  comparison.personas.push({
    slug: p.slug,
    name: p.name,
    region: p.region,
    regionEn: p.regionEn,
    style: p.style,
    personality: person?.personality || "",
    topics: person?.topics || [],
    confirmedFacts: (person?.confirmed || []).map((f) => ({
      id: f.id, text: f.text, section: f.section, source: f.source,
    })),
    pendingCandidates: (person?.pending || []).map((f) => ({
      id: f.id, text: f.text, section: f.section, source: f.source, receivedAt: f.receivedAt,
    })),
    personalized,
    generic: person?.prep?.generic || null,
    expected: fx.expected || null,
    cautions: fx.conversationCautions || "",
    actualVsExpectedNote: "母版 expected 是人工撰写的目标文案；实际文案由唯一事实本地规则生成，语义一致但措辞可能不同。",
  });
}

const shared = [...allPersonalized.entries()].filter(([, slugs]) => slugs.length > 1);
const topicSets = comparison.personas.map((p) => new Set(p.topics));
const commonTopics = [...topicSets[0] || []].filter((t) => topicSets.every((s) => s.has(t)));
comparison.crossPersona = {
  personalizedTotal: [...allPersonalized.values()].reduce((n, v) => n + v.length, 0),
  personalizedDistinct: allPersonalized.size,
  duplicatedAcrossPersonas: shared.map(([en, slugs]) => ({en, slugs})),
  allPersonalizedDistinct: shared.length === 0,
  genericQuestions: allGeneric,
  genericMayRepeat: true,
  commonTopics,
  uniqueTopics: comparison.personas.map((p) => ({
    slug: p.slug, topics: p.topics.filter((t) => !commonTopics.includes(t)),
  })),
  factDivision: comparison.personas.map((p) => ({
    slug: p.slug,
    facts: p.confirmedFacts.map((f) => f.text),
    factSources: p.confirmedFacts.map((f) => f.source),
  })),
  assertions: {
    eachPersonaHas2Personalized: comparison.personas.every((p) => p.personalized.length === 2),
    eachPersonalizedCitesFact: comparison.personas.every((p) => p.personalized.every((q) => Boolean(q.factId))),
    noPersonalizedLeakAcrossPersonas: shared.length === 0,
    genericAllowedToRepeat: true,
  },
};
fs.writeFileSync(path.join(QA, "persona-comparison.json"), JSON.stringify(comparison, null, 2));

// ── 2. memory-timeline.jsonl（先写既有事实/待确认，再写真实确认）
const timeline = [];
const push = (event) => timeline.push({ts: event.ts || new Date().toISOString(), ...event});
for (const p of comparison.personas) {
  for (const fact of p.confirmedFacts) {
    push({
      ts: fact.source?.date || null,
      type: "fact_confirmed",
      mode: "derived-from-archive",
      persona: p.slug,
      factId: fact.id,
      text: fact.text,
      source: fact.source,
      note: "基线已确认事实，时间取来源会话开始时间；不在本轮重复写入。",
    });
  }
  for (const candidate of p.pendingCandidates) {
    push({
      ts: candidate.receivedAt || null,
      type: "final_pending",
      mode: "derived-from-archive",
      persona: p.slug,
      pendingId: candidate.id,
      text: candidate.text,
      source: candidate.source,
      note: "合成 final 进入待确认队列，确认前不写档案。",
    });
  }
}

let liveConfirms = 0;
for (const p of comparison.personas) {
  const person = before.get(p.slug);
  const candidate = (person?.pending || [])[0];
  if (!candidate) continue;
  const prepBefore = person.prep;
  await wait(500);
  const confirmed = await post(
    `/v12/api/demo/people/${encodeURIComponent(p.slug)}/pending/${encodeURIComponent(candidate.id)}/confirm`,
    {confirm: true});
  if (confirmed.status !== 200 || !confirmed.body?.ok) {
    push({type: "confirm_failed", persona: p.slug, error: confirmed.body || confirmed.status});
    continue;
  }
  liveConfirms += 1;
  const prepAfter = confirmed.body.prep;
  push({
    type: "human_confirmed",
    mode: "live-run",
    persona: p.slug,
    factId: confirmed.body.confirmed?.factId || null,
    text: confirmed.body.confirmed?.text || candidate.text,
    source: confirmed.body.confirmed?.source || candidate.source,
    pendingId: candidate.id,
    prepBefore: prepBefore.personalized.map((q) => q.en),
    prepAfter: prepAfter.personalized.map((q) => q.en),
  });
  const added = prepAfter.personalized[0]?.en || null;
  push({
    type: "suggestion_updated",
    mode: "live-run",
    persona: p.slug,
    changed: JSON.stringify(prepBefore.personalized.map((q) => q.en)) !==
      JSON.stringify(prepAfter.personalized.map((q) => q.en)),
    newQuestion: added,
    basedOnFactId: prepAfter.personalized[0]?.factId || null,
    generic: prepAfter.generic?.en || null,
  });
}
await wait(700);
const restoredAfterTimeline = await post("/v12/api/demo/restore", {confirm: true});
push({
  type: "demo_restored",
  mode: "live-run",
  persona: "*",
  status: restoredAfterTimeline.body?.status || null,
  note: "时间线取证完成后恢复标准演示基线，不改动真实档案。",
});
fs.writeFileSync(path.join(QA, "memory-timeline.jsonl"),
  timeline.map((event) => JSON.stringify(event)).join("\n") + "\n");

// ── 3. clear-restore.json（真实清空 → 真实恢复，记录前后哈希）
await wait(700);
const stateBefore = (await get("/v12/api/demo/status")).body;
const archiveBefore = (await get("/v12/api/demo/archive/status")).body;
const realArchiveBefore = hashTree(REAL_ARCHIVE);
const realPeopleBefore = hashTree(REAL_PEOPLE);
const macDemoBefore = hashTree(MAC_DEMO);
const archiveQueueBefore = hashTree(path.join(REPO, "SocialMate-Data", "Demo"));

await wait(500);
const cleared = await post("/v12/api/demo/clear", {confirm: true});
const stateCleared = (await get("/v12/api/demo/status")).body;
const archiveQueueCleared = hashTree(path.join(REPO, "SocialMate-Data", "Demo"));
const realArchiveAfterClear = hashTree(REAL_ARCHIVE);
const realPeopleAfterClear = hashTree(REAL_PEOPLE);

await wait(700);
const restored = await post("/v12/api/demo/restore", {confirm: true});
await wait(1200);
const stateRestored = (await get("/v12/api/demo/status")).body;
const archiveRestored = (await get("/v12/api/demo/archive/status")).body;
const realArchiveAfter = hashTree(REAL_ARCHIVE);
const realPeopleAfter = hashTree(REAL_PEOPLE);
const macDemoAfter = hashTree(MAC_DEMO);
const archiveQueueAfter = hashTree(path.join(REPO, "SocialMate-Data", "Demo"));

const clearRestore = {
  generatedAt: new Date().toISOString(),
  mode: "real-run",
  synthetic: true,
  device,
  scope: {
    demo: "SocialMate-Data/Demo + ~/Documents/SocialMate/Demo/Conversations",
    real: "SocialMate-Data/People + ~/Documents/SocialMate/Conversations",
  },
  before: {
    demo: stateBefore,
    archive: {total: archiveBefore?.total, delivered: archiveBefore?.delivered,
      pending: archiveBefore?.pending, remoteFiles: archiveBefore?.remoteFiles},
    demoTree: {files: archiveQueueBefore.length, digest: digestOf(archiveQueueBefore)},
    macDemoArchive: {files: macDemoBefore.length, digest: digestOf(macDemoBefore)},
    realPeople: {files: realPeopleBefore.length, sha256: digestOf(realPeopleBefore)},
    realArchive: {files: realArchiveBefore.length, sha256: digestOf(realArchiveBefore)},
  },
  afterClear: {
    demo: stateCleared,
    demoTree: {files: archiveQueueCleared.length, digest: digestOf(archiveQueueCleared)},
    realPeople: {files: realPeopleAfterClear.length, sha256: digestOf(realPeopleAfterClear)},
    realArchive: {files: realArchiveAfterClear.length, sha256: digestOf(realArchiveAfterClear)},
    note: "清空只搬走演示副本；Mac 演示归档与正式档案不动，退出重进保持 cleared:true。",
  },
  afterRestore: {
    demo: stateRestored,
    archive: {total: archiveRestored?.total, delivered: archiveRestored?.delivered,
      pending: archiveRestored?.pending, remoteFiles: archiveRestored?.remoteFiles},
    demoTree: {files: archiveQueueAfter.length, digest: digestOf(archiveQueueAfter)},
    macDemoArchive: {files: macDemoAfter.length, digest: digestOf(macDemoAfter)},
    realPeople: {files: realPeopleAfter.length, sha256: digestOf(realPeopleAfter)},
    realArchive: {files: realArchiveAfter.length, sha256: digestOf(realArchiveAfter)},
    note: "恢复从不可变母版重建；Mac 演示归档通过幂等重复投递确认，不产生第二份。",
  },
  assertions: {
    clearedToZero: stateCleared?.personas === 0 && stateCleared?.sessions === 0 &&
      stateCleared?.segments === 0 && stateCleared?.cleared === true,
    restoredToBaseline: stateRestored?.personas === 3 && stateRestored?.sessions === 9 &&
      stateRestored?.segments === 54,
    demoQueueCleared: archiveQueueCleared.filter((f) => f.path.endsWith(".json")).length === 0 ||
      !archiveQueueCleared.some((f) => f.path.startsWith("Conversations")),
    macDemoArchiveUntouched:
      digestOf(macDemoBefore) === digestOf(macDemoAfter) && macDemoBefore.length === macDemoAfter.length,
    realPeopleUnchanged:
      digestOf(realPeopleBefore) === digestOf(realPeopleAfter) &&
      realPeopleBefore.length === realPeopleAfter.length,
    realArchiveUnchanged:
      digestOf(realArchiveBefore) === digestOf(realArchiveAfter) &&
      realArchiveBefore.length === realArchiveAfter.length,
    archiveStillDelivered: archiveRestored?.delivered === 9 && archiveRestored?.pending === 0,
  },
  liveConfirms,
};
fs.writeFileSync(path.join(QA, "clear-restore.json"), JSON.stringify(clearRestore, null, 2));

const summary = {
  qaDir: QA,
  device,
  personaComparison: {
    personas: comparison.personas.length,
    assertions: comparison.crossPersona.assertions,
  },
  timeline: {
    events: timeline.length,
    liveConfirms,
    types: [...new Set(timeline.map((t) => t.type))],
  },
  clearRestore: clearRestore.assertions,
};
console.log(JSON.stringify(summary, null, 2));
if (Object.values(clearRestore.assertions).some((v) => v !== true)) process.exitCode = 1;
