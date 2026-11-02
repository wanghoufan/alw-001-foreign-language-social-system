/**
 * N04 三人物演示命名空间（隔离演示副本）。
 *
 * 硬边界：
 * - 演示数据只落在 SocialMate-Data/Demo/，与真实主档 SocialMate-Data/People/ 物理分离；
 *   任何写操作前都先做路径隔离断言，宁可 500 也不写错目录。
 * - 复用既有链路：人物事实仍写 `People/<slug>/00-profile.md`（appendPeopleFacts 的
 *   标记 / 幂等 / 原子替换 / 备份全部保留，只是 root 换成 Demo/People）；会话仍走
 *   conversation-archive.saveSession 落 YYYY/MM 的 .md + .json，不新造第二套存储。
 * - 母版 fixtures/demo-personas.json 只读；清空只删演示副本，恢复从母版重新种，
 *   已清空状态会持久化，重启不会自动重种。
 * - 全部内容 synthetic/mock，UI 必须标「演示数据」。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {saveSession} from "./conversation-archive.mjs";
import {pushDemoArchive} from "./demo-archive.mjs";
import {appendPeopleFacts, peopleRoot, SECTIONS} from "./people-store.mjs";
import {parsePersonProfile} from "./person-detail.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_DEMO_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "Demo");
const FIXTURE = path.join(REPO_ROOT, "docs", "plan",
  "ALW001-N04-Persona-Memory-Regression-V1.0", "fixtures", "demo-personas.json");
const STATE = "state.json";
const BACKUP_KEEP = 3;

export function demoRoot() {
  return path.resolve(process.env.SM_DEMO_DIR || DEFAULT_DEMO_ROOT);
}
export function demoPeopleRoot() {
  return path.join(demoRoot(), "People");
}
export function demoConversationsRoot() {
  return path.join(demoRoot(), "Conversations");
}

/**
 * 种入/恢复后异步投递到 Mac 演示归档（SDD §2.4）。
 * 归档端不可达时只留在本地待传队列，不阻塞接口、不影响手机默认可见；
 * 下一次 push（恢复/手动同步/服务重启后的显式调用）继续补传，已送达的不重复写。
 */
function scheduleArchivePush() {
  setImmediate(() => {
    pushDemoArchive({demoRoot: demoRoot(), conversationsDir: demoConversationsRoot()})
      .catch(() => {});
  });
}

/**
 * 演示根目录绝不能与真实主档目录相同、互为父子。任何写操作前都会调用。
 */
export function assertIsolated(root = demoRoot(), real = peopleRoot()) {
  const a = path.resolve(root);
  const b = path.resolve(real);
  const inside = (child, parent) => child === parent || child.startsWith(parent + path.sep);
  if (inside(a, b) || inside(b, a)) {
    throw Object.assign(new Error("演示目录与真实人物主档目录重叠，已拒绝启动演示写入"), {
      status: 500, code: "DEMO_ROOT_CONFLICT",
    });
  }
  return a;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function chmodQuiet(target, mode) {
  return fs.chmod(target, mode).catch(() => {});
}

async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/** 待确认候选的稳定 ID：同一来源 + 同一文本永远得到同一 ID，重复注入不会变成两条。 */
function pendingId(item) {
  return "pnd_" + crypto.createHash("sha1")
    .update(`${item?.source?.sessionId || ""}|${item?.source?.segmentIndex ?? "x"}|` +
      String(item?.text || "").toLowerCase().replace(/\s+/g, " "))
    .digest("hex").slice(0, 12);
}

/** 兼容第一版 state.json 里 pending 是单个对象；统一成数组，每条都有 id。 */
function normalizePending(raw) {
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? [raw] : []);
  return list
    .filter((item) => item && String(item.text || "").trim())
    .map((item) => ({...item, id: item.id || pendingId(item), confirmed: false}));
}

function normalizeState(state) {
  if (!state || typeof state !== "object") return state;
  for (const entry of state.personas || []) {
    entry.pending = normalizePending(entry.pending);
  }
  state.inbox = normalizePending(state.inbox);
  return state;
}

async function readState(root = demoRoot()) {
  return normalizeState(await readJson(path.join(root, STATE)));
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  await chmodQuiet(path.dirname(file), 0o700);
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), {encoding: "utf8", mode: 0o600});
  await chmodQuiet(temp, 0o600);
  await fs.rename(temp, file);
  await chmodQuiet(file, 0o600);
}

let fixtureCache = null;
/** 读取不可变母版（含 sha256，用于判断是否需要重新种）。 */
export async function readFixture() {
  const raw = await fs.readFile(FIXTURE, "utf8");
  const sha256 = crypto.createHash("sha256").update(raw).digest("hex");
  if (fixtureCache && fixtureCache.sha256 === sha256) return fixtureCache;
  const data = JSON.parse(raw);
  if (!Array.isArray(data.personas) || data.personas.length !== 3) {
    throw fail(500, "DEMO_FIXTURE_INVALID", "演示母版损坏：应包含 3 位人物");
  }
  fixtureCache = {data, sha256};
  return fixtureCache;
}

/** 只读当前演示副本状态；不触发种入。 */
export async function demoStatus() {
  const root = demoRoot();
  const state = await readState(root);
  const people = (await readdirSafe(demoPeopleRoot()))
    .filter((e) => e.isDirectory() && !e.name.startsWith("."));
  const sessionFiles = await listSessionFiles(demoConversationsRoot());
  let segments = 0;
  for (const file of sessionFiles) {
    const payload = await readJson(file);
    const list = Array.isArray(payload?.session?.segments) ? payload.session.segments : [];
    segments += list.filter((s) => s?.final !== false && s?.textOriginal).length;
  }
  const pending = (state?.personas || []).reduce((n, p) => n + (p.pending || []).length, 0)
    + (state?.inbox || []).length;
  return {
    ok: true,
    demo: true,
    isolatedRoot: path.relative(REPO_ROOT, root) || root,
    realRoot: path.relative(REPO_ROOT, peopleRoot()) || peopleRoot(),
    seeded: Boolean(state && state.cleared !== true && people.length),
    cleared: state ? state.cleared === true : false,
    clearedAt: state?.clearedAt || null,
    seededAt: state?.seededAt || null,
    fixtureVersion: state?.fixtureVersion || null,
    fixtureSha256: state?.fixtureSha256 || null,
    personas: people.length,
    sessions: sessionFiles.length,
    segments,
    pending,
    inbox: (state?.inbox || []).length,
    updatedAt: state?.updatedAt || null,
  };
}

/** 递归找出演示归档里的 .json（权威记录）。 */
async function listSessionFiles(dir, out = []) {
  for (const entry of await readdirSafe(dir)) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listSessionFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  out.sort();
  return out;
}

function utcDay(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function frontMatter(persona, sessions) {
  const last = sessions.map((s) => s.startedAt).sort().pop() || "";
  const first = sessions.map((s) => s.startedAt).sort()[0] || "";
  const [country, city] = String(persona.region || "").split(/[·,]/).map((v) => v.trim());
  return [
    "---",
    `name: ${persona.name}`,
    `country: ${country || ""}`,
    `city: ${city || ""}`,
    `languages: []`,
    `status_in_hainan: demo-only`,
    `occupation: unknown`,
    `relationship_stage: new_contact`,
    `first_met: ${utcDay(first)}`,
    `last_contact: ${utcDay(last)}`,
    `contact_channels: []`,
    `tags: [demo, fictional, synthetic]`,
    `demo: true`,
    `synthetic: true`,
    "---",
    "",
    "# 基本情况",
    "",
    `- 演示人物：虚构合成剧本，不是真人录音，不属于你的真实好友。（地区 ${persona.region || "—"}）`,
    `- 沟通风格（演示设定）：${persona.stylePreference || "—"}`,
    "",
    ...Object.values(SECTIONS).filter((title) => title !== "基本情况").flatMap((title) => [`# ${title}`, ""]),
    "",
  ].join("\n");
}

/** 从母版把一位人物的主档写进演示命名空间，事实走 appendPeopleFacts（保留来源标记）。 */
async function seedPersona(persona, root) {
  const dir = path.join(root, persona.slug);
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const file = path.join(dir, "00-profile.md");
  const body = frontMatter(persona, persona.sessions);
  const temp = path.join(dir, `.00-profile.${process.pid}.tmp`);
  await fs.writeFile(temp, body, {encoding: "utf8", mode: 0o600});
  await fs.rename(temp, file);
  await chmodQuiet(file, 0o600);

  const facts = persona.baselineConfirmedFacts.map((fact) => ({
    slug: persona.slug,
    section: fact.section,
    text: fact.text,
    sessionId: fact.source?.sessionId,
    segmentIndex: fact.source?.segmentIndex,
    confirmedAt: persona.sessions
      .find((s) => s.sessionId === fact.source?.sessionId)?.startedAt || null,
  }));
  const written = await appendPeopleFacts(facts, {root});
  if (written.added.length !== facts.length) {
    throw fail(500, "DEMO_SEED_FACTS_INCOMPLETE",
      `演示人物 ${persona.slug} 事实写入不完整（${written.added.length}/${facts.length}）`);
  }
  return file;
}

/** 把一人 3 段会话按既有归档管道写进 Demo/Conversations。base 是临时构建根，用于算出稳定相对路径。 */
async function seedSessions(persona, conversationsRoot, base) {
  const out = [];
  for (const session of persona.sessions) {
    const saved = await saveSession({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      appVersion: session.appVersion || "DEMO-N04",
      consent: {recording: true, retention: true, cloudAi: false},
      revision: session.revision || 1,
      segments: session.segments,
    }, {root: conversationsRoot});
    out.push({
      sessionId: session.sessionId,
      personSlug: persona.slug,
      startedAt: session.startedAt,
      segments: session.segments.length,
      markdown: path.relative(base, saved.markdown),
      json: path.relative(base, saved.json),
      status: saved.status,
    });
  }
  return out;
}

/**
 * 从母版种入演示副本。target 为临时目录，成功后整体替换，避免半份数据被读到。
 */
async function buildInto(target, {fixture}) {
  const peopleDir = path.join(target, "People");
  const convDir = path.join(target, "Conversations");
  await fs.mkdir(peopleDir, {recursive: true, mode: 0o700});
  await fs.mkdir(convDir, {recursive: true, mode: 0o700});
  const manifest = [];
  for (const persona of fixture.data.personas) {
    await seedPersona(persona, peopleDir);
    const sessions = await seedSessions(persona, convDir, target);
    manifest.push({
      slug: persona.slug,
      name: persona.name,
      region: persona.region,
      regionEn: persona.regionEn || "",
      style: persona.stylePreference || "",
      personality: persona.personality || "",
      topics: Array.isArray(persona.topics) ? persona.topics : [],
      sessions,
      pending: normalizePending([{
        ...persona.pendingCandidate,
        source: persona.pendingCandidate?.source || null,
        demonstration: true,
        confirmed: false,
        receivedAt: persona.sessions?.[1]?.endedAt || null,
      }]),
    });
  }
  const state = {
    schemaVersion: 2,
    mode: "demo-only-isolated",
    fixtureVersion: fixture.data.fixtureVersion || null,
    fixtureSha256: fixture.sha256,
    seededAt: new Date().toISOString(),
    clearedAt: null,
    cleared: false,
    updatedAt: null,
    inbox: [],
    notice: fixture.data.notice || "虚构合成演示数据，不是真人录音。",
    personas: manifest,
  };
  await writeJsonAtomic(path.join(target, STATE), state);
  return state;
}

async function backupCurrent(root) {
  const stampName = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(root, "Backups", stampName);
  const moved = [];
  let any = false;
  for (const name of ["People", "Conversations"]) {
    const from = path.join(root, name);
    try {
      await fs.stat(from);
    } catch {
      continue;
    }
    await fs.mkdir(dest, {recursive: true, mode: 0o700});
    await fs.rename(from, path.join(dest, name));
    moved.push(name);
    any = true;
  }
  if (any) {
    const backups = (await readdirSafe(path.join(root, "Backups")))
      .filter((e) => e.isDirectory()).map((e) => e.name).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - BACKUP_KEEP))) {
      await fs.rm(path.join(root, "Backups", old), {recursive: true, force: true});
    }
  }
  return {backup: any ? path.relative(root, dest) : null, moved};
}

/**
 * 确保首次运行有演示数据。已清空（用户自己删的）不自动重种。
 * @returns {Promise<{seeded:boolean, reason:string}>}
 */
export async function ensureDemoSeeded() {
  const root = assertIsolated();
  const state = await readState(root);
  if (state && state.cleared === true) return {seeded: false, reason: "cleared-by-user"};
  if (state && state.cleared !== true) {
    const status = await demoStatus();
    if (status.personas === 3 && status.sessions === 9) return {seeded: true, reason: "already"};
  }
  const fixture = await readFixture();
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  await chmodQuiet(root, 0o700);
  await backupCurrent(root);
  const temp = path.join(root, `.seed-${process.pid}-${Date.now()}`);
  await fs.rm(temp, {recursive: true, force: true});
  await buildInto(temp, {fixture});
  await fs.rename(path.join(temp, "People"), path.join(root, "People"));
  await fs.rename(path.join(temp, "Conversations"), path.join(root, "Conversations"));
  await fs.rename(path.join(temp, STATE), path.join(root, STATE));
  await fs.rm(temp, {recursive: true, force: true});
  scheduleArchivePush();
  return {seeded: true, reason: "seeded-from-fixture"};
}

/** 清空演示副本：只搬走演示目录，真实 People 完全不参与。 */
export async function clearDemo({confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "清空演示数据需要用户二次确认（confirm:true）");
  const root = assertIsolated();
  const state = await readState(root);
  if (state && state.cleared === true && !(await readdirSafe(demoPeopleRoot())).length) {
    return {ok: true, alreadyCleared: true, backup: null, status: await demoStatus()};
  }
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  const backup = await backupCurrent(root);
  await writeJsonAtomic(path.join(root, STATE), {
    schemaVersion: 1,
    mode: "demo-only-isolated",
    cleared: true,
    clearedAt: new Date().toISOString(),
    seededAt: null,
    fixtureVersion: state?.fixtureVersion || null,
    fixtureSha256: state?.fixtureSha256 || null,
    personas: [],
  });
  return {ok: true, cleared: true, backup: backup.backup, moved: backup.moved, status: await demoStatus()};
}

/** 恢复三人物标准演示：从不可变母版重新种，重复恢复不累加。 */
export async function restoreDemo({confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "恢复演示数据需要用户显式确认（confirm:true）");
  const root = assertIsolated();
  const fixture = await readFixture();
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  await chmodQuiet(root, 0o700);
  const backup = await backupCurrent(root);
  const temp = path.join(root, `.restore-${process.pid}-${Date.now()}`);
  await fs.rm(temp, {recursive: true, force: true});
  await buildInto(temp, {fixture});
  await fs.rename(path.join(temp, "People"), path.join(root, "People"));
  await fs.rename(path.join(temp, "Conversations"), path.join(root, "Conversations"));
  await fs.rename(path.join(temp, STATE), path.join(root, STATE));
  await fs.rm(temp, {recursive: true, force: true});
  const status = await demoStatus();
  scheduleArchivePush();
  return {ok: true, restored: true, backup: backup.backup, fixtureSha256: fixture.sha256, status};
}

/** 读一位演示人物的卡面与结构化详情（事实来自 Demo/People/*.md，不读母版）。 */
export async function readPersona(slug) {
  const root = assertIsolated();
  const state = await readState(root);
  const entry = (state?.personas || []).find((p) => p.slug === slug);
  const file = path.join(demoPeopleRoot(), String(slug), "00-profile.md");
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw fail(404, "DEMO_PERSON_NOT_FOUND", "演示人物不存在或已被清空");
    throw error;
  }
  const parsed = parsePersonProfile(text);
  const sessions = [];
  for (const meta of entry?.sessions || []) {
    const payload = await readJson(path.join(demoRoot(), meta.json));
    if (!payload?.session) continue;
    sessions.push(shapeSession(payload.session, meta));
  }
  sessions.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  const confirmed = parsed.confirmed.map((f) => ({
    id: f.id,
    text: f.text,
    section: f.section,
    source: f.source ? {sessionId: f.source.sessionId, segmentIndex: f.source.segmentIndex, date: f.source.date} : null,
  }));
  return {
    slug: String(slug),
    name: parsed.name || slug,
    region: entry?.region || "",
    regionEn: entry?.regionEn || "",
    style: entry?.style || "",
    personality: entry?.personality || "",
    topics: entry?.topics || [],
    confirmed,
    pending: (entry?.pending || []).map((item) => ({
      id: item.id,
      text: item.text,
      section: item.section || null,
      source: item.source || null,
      receivedAt: item.receivedAt || null,
      confirmed: false,
      demonstration: true,
    })),
    prep: buildDemoPrep(confirmed, slug),
    lastContact: sessions.length ? sessions[sessions.length - 1].startedAt : null,
    updatedAt: (entry?.pending || []).length ? entry.lastUpdatedAt || null : entry?.lastUpdatedAt || null,
    sessions,
  };
}

function shapeSession(session, meta) {
  const segments = (session.segments || []).map((s, i) => ({
    index: Number.isFinite(Number(s.index)) ? Number(s.index) : i,
    speakerId: s.speakerId || "unknown",
    track: s.track || "mix",
    startMs: Number(s.startMs) || 0,
    endMs: Number(s.endMs) || 0,
    mock: s.mock === true,
    provider: s.provider || "synthetic",
    final: true,
    textOriginal: String(s.textOriginal || ""),
  }));
  return {
    sessionId: session.sessionId,
    personSlug: meta?.personSlug || null,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    appVersion: session.appVersion,
    demo: true,
    synthetic: true,
    mock: true,
    segments,
    segmentCount: segments.length,
  };
}

/* ===================== 待确认事实 → 人工确认 → 专属话题重算 =====================
 * 规则（SDD §2.3 / T2）：
 * - 新 final 只进「待确认」队列（写 state.json），不碰 Demo/People 主档；
 * - 用户确认后才走 appendPeopleFacts 写进演示人物档案，写的是隔离目录；
 * - 专属问题由**已确认事实**确定性重算，因此确认一条就立刻变，不需要重启；
 * - 未确认候选绝不参与问题生成，避免把待核实内容当成已知事实。
 */
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const MONTH_ZH = {
  January: "1 月", February: "2 月", March: "3 月", April: "4 月", May: "5 月", June: "6 月",
  July: "7 月", August: "8 月", September: "9 月", October: "10 月", November: "11 月", December: "12 月",
};

/** 一条已确认事实 → 一句能追问的英文/中文问题（纯本地规则，不调用任何模型）。 */
function questionForFact(text) {
  const source = String(text || "");
  const month = MONTHS.find((m) => new RegExp(`\\b${m}\\b`, "i").test(source)) || "";
  if (/10\s*-?\s*k\b|10[- ]kilometre|kilometre race/i.test(source)) {
    return {
      en: `How is your 10K training${month ? ` for ${month}` : ""} going?`,
      zh: `你${month ? ` ${MONTH_ZH[month]}` : ""} 的 10 公里训练进展怎么样？`,
    };
  }
  if (/pull-?up/i.test(source)) {
    return {en: "How is your pull-up goal going?", zh: "你的引体向上目标进展如何？"};
  }
  if (/strength training|gym|lifting/i.test(source)) {
    return {en: "Have you found a routine that works for your gym mornings?", zh: "你找到适合早晨健身的节奏了吗？"};
  }
  if (/poster/i.test(source)) {
    return {en: "Have you made any new posters for local bands?", zh: "最近有为本地乐队做新海报吗？"};
  }
  if (/english|language/i.test(source)) {
    return {en: "What are you practising in English these days?", zh: "你最近在练哪些英语表达？"};
  }
  if (/photograph|photo|camera/i.test(source)) {
    return {en: "What have you been photographing lately?", zh: "你最近都在拍些什么？"};
  }
  if (/live[- ]music|gig|concert|venue/i.test(source)) {
    return {en: "What's the best small gig you've seen recently?", zh: "最近看过最棒的小型演出是哪一场？"};
  }
  if (/haikou/i.test(source) && /food|street|eat|dish/i.test(source)) {
    return {en: "What kind of Haikou street food would you like to try?", zh: "你想尝哪种海口小吃？"};
  }
  if (/coffee|caf[eé]/i.test(source)) {
    return {en: "Which café have you enjoyed most recently?", zh: "最近你最喜欢哪家咖啡店？"};
  }
  if (/food|dish|restaurant|cook/i.test(source)) {
    return {en: "Which dish would you recommend to a friend?", zh: "你会向朋友推荐哪道菜？"};
  }
  if (/travel|trip|visit|plan|book/i.test(source)) {
    return {en: "What are you looking forward to most about the trip?", zh: "这趟行程你最期待什么？"};
  }
  const fragment = source.length > 64 ? `${source.slice(0, 61).trim()}…` : source;
  return {
    en: `Last time you mentioned: "${fragment}" — how is that going?`,
    zh: `上次你提到：“${fragment}”——后来怎么样了？`,
  };
}

const DEMO_GENERIC = [
  {en: "What has been the highlight of your week so far?", zh: "这周到目前为止，你最开心的事是什么？"},
  {en: "What do you usually do on quiet weekends?", zh: "安静的周末你通常做什么？"},
  {en: "Is there anything you would like to try for the first time this month?", zh: "这个月你想第一次尝试什么？"},
];

/**
 * 生成「给这位朋友的 2 个专属问题 + 1 个通用破冰」。
 * 最新确认的事实排在最前，所以确认一条新事实后，第一条问题就会变。
 */
export function buildDemoPrep(confirmed, slug = "") {
  const facts = (Array.isArray(confirmed) ? confirmed : [])
    .filter((fact) => fact && fact.id && String(fact.text || "").trim());
  // 排序：确认时间新的在前；同一时间按档案里的追加顺序（越靠后越新）。
  const ordered = facts
    .map((fact, index) => ({fact, index}))
    .sort((a, b) => String(b.fact.source?.date || "").localeCompare(String(a.fact.source?.date || ""))
      || b.index - a.index)
    .map((item) => item.fact);
  const personalized = [];
  const seen = new Set();
  for (const fact of ordered) {
    const question = questionForFact(fact.text);
    if (seen.has(question.en)) continue;
    seen.add(question.en);
    personalized.push({
      en: question.en, zh: question.zh, source: "confirmed-fact",
      factId: fact.id, factText: fact.text,
    });
    if (personalized.length >= 2) break;
  }
  const offset = String(slug).split("").reduce((n, c) => n + c.charCodeAt(0), 0) % DEMO_GENERIC.length;
  const generic = DEMO_GENERIC
    .map((_, i) => DEMO_GENERIC[(offset + i) % DEMO_GENERIC.length])
    .find((item) => !seen.has(item.en)) || DEMO_GENERIC[0];
  return {
    personalized,
    generic: {...generic, source: "template"},
    empty: personalized.length === 0,
    note: "由已确认事实本地生成；待确认候选不参与。",
  };
}

/**
 * 演示用合成 final 回放：每次点一下，回放下一句未被用过的合成原文。
 * 文本来自 fixture 里同一段会话的可核对原句，来源 segmentIndex 真实存在。
 */
const REPLAY_FINALS = {
  "demo-oliver-uk": [{
    text: "Oliver keeps his runs easy on the days after heavy lifting.",
    section: "plan", sessionId: "sess_n04_demo_oliver_uk_3", segmentIndex: 1,
  }],
  "demo-maya-us": [{
    text: "Maya wants to try casual local food in Haikou before any live music.",
    section: "plan", sessionId: "sess_n04_demo_maya_us_3", segmentIndex: 5,
  }],
  "demo-jieun-kr": [{
    text: "Ji-eun noticed the shadows on the walls in her morning-light photo.",
    section: "interest", sessionId: "sess_n04_demo_jieun_kr_3", segmentIndex: 3,
  }],
};

/**
 * 注入一条演示 final（合成事件回放或显式文本）。
 * slug 为空时进入「未归属」队列，等用户选目标人物后才允许确认。
 */
export async function injectDemoFinal({slug, text, sessionId, segmentIndex, section, confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "注入演示 final 需要显式确认（confirm:true）");
  const root = assertIsolated();
  const state = await readState(root);
  if (!state || state.cleared === true) throw fail(404, "DEMO_CLEARED", "演示数据已清空，请先恢复演示数据");

  const target = String(slug || "").trim();
  const entry = target ? (state.personas || []).find((p) => p.slug === target) : null;
  if (target && !entry) throw fail(404, "DEMO_PERSON_NOT_FOUND", "演示人物不存在");

  let item;
  if (String(text || "").trim()) {
    const clean = String(text).replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    if (clean.length < 2) throw fail(400, "EMPTY_TEXT", "final 文本太短");
    item = {
      text: clean,
      section: section || "preference",
      source: {sessionId: sessionId || `demo-final-${Date.now()}`, segmentIndex: Number.isFinite(Number(segmentIndex)) ? Number(segmentIndex) : null},
    };
  } else {
    const replay = (REPLAY_FINALS[target] || []).find((candidate) => {
      const id = pendingId({text: candidate.text, source: {sessionId: candidate.sessionId, segmentIndex: candidate.segmentIndex}});
      const alreadyPending = (entry?.pending || []).some((p) => p.id === id);
      return !alreadyPending;
    });
    if (!replay) return {ok: true, added: false, duplicate: true, reason: "NO_REPLAY_LEFT", status: await demoStatus()};
    item = {text: replay.text, section: replay.section, source: {sessionId: replay.sessionId, segmentIndex: replay.segmentIndex}};
  }
  item = {...item, confirmed: false, demonstration: true, receivedAt: new Date().toISOString()};
  item.id = pendingId(item);

  const bucket = entry ? (entry.pending = entry.pending || []) : (state.inbox = state.inbox || []);
  if (bucket.some((p) => p.id === item.id)) {
    return {ok: true, added: false, duplicate: true, reason: "ALREADY_PENDING", item, status: await demoStatus()};
  }
  bucket.push(item);
  state.updatedAt = item.receivedAt;
  await writeJsonAtomic(path.join(root, STATE), state);
  const person = entry ? await readPersona(entry.slug) : null;
  return {
    ok: true, added: true, duplicate: false, demo: true, synthetic: true,
    item, attributedTo: entry ? entry.slug : null,
    pending: entry ? person.pending : state.inbox,
    person, status: await demoStatus(),
  };
}

/** 忽略一条待确认：只从演示队列移除，不写档案。 */
export async function ignoreDemoPending(slug, pendingIdValue, {confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "忽略候选需要显式确认（confirm:true）");
  const root = assertIsolated();
  const state = await readState(root);
  const target = String(slug || "").trim();
  const entry = target ? (state.personas || []).find((p) => p.slug === target) : null;
  if (target && !entry) throw fail(404, "DEMO_PERSON_NOT_FOUND", "演示人物不存在");
  const id = String(pendingIdValue || "");
  const from = entry ? entry.pending : state.inbox;
  const item = (from || []).find((p) => p.id === id);
  if (!item) throw fail(404, "PENDING_NOT_FOUND", "该待确认事实不存在（可能已处理）");
  if (entry) entry.pending = entry.pending.filter((p) => p.id !== id);
  else state.inbox = state.inbox.filter((p) => p.id !== id);
  const at = new Date().toISOString();
  if (entry) {
    entry.ignored = [...(entry.ignored || []).slice(-49), {id, text: item.text, ignoredAt: at}];
    entry.lastUpdatedAt = at;
  } else {
    state.ignoredInbox = [...(state.ignoredInbox || []).slice(-49), {id, text: item.text, ignoredAt: at}];
  }
  state.updatedAt = at;
  await writeJsonAtomic(path.join(root, STATE), state);
  const person = entry ? await readPersona(entry.slug) : null;
  return {
    ok: true, ignored: {id, text: item.text, ignoredAt: at}, demo: true, synthetic: true,
    pending: person ? person.pending : state.inbox, person, status: await demoStatus(),
  };
}

/**
 * 确认一条待确认事实：写入演示人物档案 → 立刻重算专属问题并返回。
 * 重复确认返回 duplicate:true 而不是新增第二条。
 */
export async function confirmDemoPending(slug, pendingIdValue, {confirm, attributionSlug} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "确认事实需要用户显式确认（confirm:true）");
  const root = assertIsolated();
  const state = await readState(root);
  if (!state || state.cleared === true) throw fail(404, "DEMO_CLEARED", "演示数据已清空，请先恢复演示数据");
  const target = String(slug || attributionSlug || "").trim();
  const entry = target ? (state.personas || []).find((p) => p.slug === target) : null;
  if (target && !entry) throw fail(404, "DEMO_PERSON_NOT_FOUND", "演示人物不存在");

  const id = String(pendingIdValue || "");
  const fromEntry = entry ? (entry.pending || []).find((p) => p.id === id) : null;
  // 未归属队列：必须由调用方显式给出目标人物，禁止猜身份。
  const item = fromEntry || (state.inbox || []).find((p) => p.id === id);
  if (!item) throw fail(404, "PENDING_NOT_FOUND", "该待确认事实不存在（可能已处理）");
  if (!entry) throw fail(400, "ATTRIBUTION_REQUIRED", "说话人身份未确定：请先选择这条事实属于哪位演示人物");

  const confirmedAt = new Date().toISOString();
  const written = await appendPeopleFacts([{
    slug: entry.slug,
    section: item.section || "preference",
    text: item.text,
    sessionId: item.source?.sessionId,
    segmentIndex: item.source?.segmentIndex,
    confirmedAt,
  }], {root: demoPeopleRoot()});
  const duplicate = written.skipped.some((s) => s.reason === "DUPLICATE");
  if (!written.added.length && !duplicate) {
    throw fail(500, "DEMO_CONFIRM_FAILED", `写入演示档案失败：${JSON.stringify(written.skipped)}`);
  }

  entry.pending = (entry.pending || []).filter((p) => p.id !== id);
  state.inbox = (state.inbox || []).filter((p) => p.id !== id);
  entry.lastUpdatedAt = confirmedAt;
  state.updatedAt = confirmedAt;
  await writeJsonAtomic(path.join(root, STATE), state);

  const person = await readPersona(entry.slug);
  return {
    ok: true, demo: true, synthetic: true, duplicate,
    confirmed: {text: item.text, section: item.section, source: item.source, confirmedAt,
      factId: written.added[0]?.key || null},
    pending: person.pending,
    prep: person.prep,
    person,
    status: await demoStatus(),
  };
}

/** 本轮未归属 final 列表（需用户选择目标人物）。 */
export async function listInbox() {
  const root = assertIsolated();
  const state = await readState(root);
  return (state?.inbox || []).map((item) => ({
    id: item.id, text: item.text, section: item.section || null, source: item.source || null,
    receivedAt: item.receivedAt || null, demonstration: true, attributed: false,
  }));
}

/** 3 张演示卡（含三段会话），供 /v12/api/demo/people。 */
export async function listPersonas() {
  const root = assertIsolated();
  const state = await readState(root);
  if (!state || state.cleared === true) return [];
  const out = [];
  for (const entry of state.personas || []) {
    try {
      const persona = await readPersona(entry.slug);
      out.push({
        slug: persona.slug,
        name: persona.name,
        region: persona.region || "",
        regionEn: persona.regionEn || "",
        style: persona.style || "",
        topics: persona.topics || [],
        lastContact: persona.lastContact,
        confirmedCount: persona.confirmed.length,
        pendingCount: persona.pending.length,
        sessionCount: persona.sessions.length,
        segmentCount: persona.sessions.reduce((n, s) => n + s.segments.length, 0),
        sessions: persona.sessions.map((s) => ({
          sessionId: s.sessionId,
          startedAt: s.startedAt,
          segmentCount: s.segmentCount,
        })),
      });
    } catch {
      // 单个主档缺失不应让整页空白；继续列出其余人物。
    }
  }
  return out;
}

/** 取单段演示会话（原文逐段）。 */
export async function readSession(sessionId) {
  const root = assertIsolated();
  const state = await readState(root);
  for (const entry of state?.personas || []) {
    const meta = (entry.sessions || []).find((s) => s.sessionId === sessionId);
    if (!meta) continue;
    const payload = await readJson(path.join(demoRoot(), meta.json));
    if (!payload?.session) break;
    return shapeSession(payload.session, meta);
  }
  throw fail(404, "DEMO_SESSION_NOT_FOUND", "演示会话不存在或已被清空");
}

export const DEMO_PATHS = {demoRoot, demoPeopleRoot, demoConversationsRoot, fixture: FIXTURE};
