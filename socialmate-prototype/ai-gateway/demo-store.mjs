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
import {appendPeopleFacts, assertSlug, peopleRoot, SECTIONS, sourceKey} from "./people-store.mjs";
import {parsePersonProfile} from "./person-detail.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_DEMO_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "Demo");
const FIXTURE = path.join(REPO_ROOT, "docs", "plan",
  "ALW001-N04-Persona-Memory-Regression-V1.0", "fixtures", "demo-personas.json");
const STATE = "state.json";
const BACKUP_KEEP = 3;
const CHANGELOG = "changelog.jsonl";
const FACTS_META = "facts-meta.json";

/* ===================== 人物档案五分组（固定顺序，禁止自创第六组） ===================== */
export const PROFILE_GROUPS = [
  {id: "basic", zh: "基本情况", en: "Basics"},
  {id: "communication", zh: "沟通习惯", en: "Communication"},
  {id: "hobby", zh: "爱好", en: "Hobbies"},
  {id: "life", zh: "生活习惯", en: "Daily habits"},
  {id: "other", zh: "其他", en: "Other"},
];
const GROUP_IDS = new Set(PROFILE_GROUPS.map((g) => g.id));
const DEFAULT_GROUP = "other";

/**
 * 演示事实的中英对照与分组。键是母版/旧演示档案里的英文原句。
 * 旧数据没有 group 字段时按这里兜底；仍找不到的一律归「其他」，绝不丢历史。
 */
const DEMO_FACT_TEXT = {
  "Oliver goes strength training three mornings a week.": {
    zh: "奥利弗每周有三个早晨做力量训练。", group: "hobby",
  },
  "Oliver is working toward his first strict pull-up.": {
    zh: "奥利弗正在练习，目标是完成第一个标准引体向上。", group: "hobby",
  },
  "Oliver is preparing for his first 10-kilometre race in December.": {
    zh: "奥利弗正在为 12 月的第一次 10 公里比赛做准备。", group: "other",
  },
  "Oliver keeps his runs easy on the days after heavy lifting.": {
    zh: "大重量训练后的第二天，奥利弗只做轻松跑。", group: "life",
  },
  "Maya designs posters for small local bands.": {
    zh: "玛雅为本地小型乐队设计海报。", group: "other",
  },
  "Maya enjoys small live-music gigs.": {
    zh: "玛雅喜欢小型现场音乐演出。", group: "hobby",
  },
  "Maya is considering a trip to Haikou and wants to try local street food.": {
    zh: "玛雅在考虑来海口旅行，想尝尝本地小吃。", group: "other",
  },
  "Maya wants to try casual local food in Haikou before any live music.": {
    zh: "玛雅想先在海口随便吃点本地小吃，再去看现场音乐。", group: "other",
  },
  "Ji-eun enjoys photographing old streets.": {
    zh: "智恩喜欢拍摄老街。", group: "hobby",
  },
  "Ji-eun prefers quiet cafes to crowded bars.": {
    zh: "比起拥挤的酒吧，智恩更喜欢安静的咖啡店。", group: "life",
  },
  "Ji-eun is practising English to talk about her photography.": {
    zh: "智恩正在练英语，想用自己的照片来交流。", group: "other",
  },
  "Ji-eun noticed the shadows on the walls in her morning-light photo.": {
    zh: "智恩注意到她那张晨光照片里墙上的影子。", group: "hobby",
  },
};

/** 演示人物中文名与职业占位（母版没有职业，不编造）。 */
const DEMO_PERSONA_META = {
  "demo-oliver-uk": {
    nameZh: "奥利弗·里德", nameEn: "Oliver Reed",
    occupationZh: "未注明", occupationEn: "not stated",
    styleZh: "简短、直接、具体、少闲聊",
    styleEn: "Short, direct, concrete, little small talk",
  },
  "demo-maya-us": {
    nameZh: "玛雅·托雷斯", nameEn: "Maya Torres",
    occupationZh: "未注明", occupationEn: "not stated",
    styleZh: "轻松、积极、开放式、有趣的追问",
    styleEn: "Relaxed, upbeat, open-ended, curious follow-ups",
  },
  "demo-jieun-kr": {
    nameZh: "智恩·朴", nameEn: "Ji-eun Park",
    occupationZh: "未注明", occupationEn: "not stated",
    styleZh: "温和、留停顿、一次只问一件事",
    styleEn: "Gentle, leaves pauses, one question at a time",
  },
};

function groupTitle(id, lang = "zh") {
  const group = PROFILE_GROUPS.find((g) => g.id === id) || PROFILE_GROUPS.at(-1);
  return group[lang === "en" ? "en" : "zh"];
}

function normalizeGroup(value) {
  const id = String(value || "").trim();
  return GROUP_IDS.has(id) ? id : DEFAULT_GROUP;
}

function hasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ""));
}
function hasLatin(text) {
  return /[A-Za-z]{2,}/.test(String(text || ""));
}

/** 一条事实的双语快照；前端按语言取字段，缺失时回退并标注。 */
function factSnapshot(text, meta = {}) {
  const primary = String(text || "").trim();
  const textZh = String(meta.textZh || (hasChinese(primary) ? primary : "")).trim();
  const textEn = String(meta.textEn || (!hasChinese(primary) && hasLatin(primary) ? primary : "")).trim();
  return {text: primary, textZh, textEn};
}

function shortText(value, max = 72) {
  const oneLine = String(value || "").replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** 会话标题：演示母版里同一人物的第 N 段会话，用「第 N 次对话」做来源。 */
function conversationTitle(sessionId) {
  const match = String(sessionId || "").match(/_(\d+)$/);
  return match ? `第 ${Number(match[1])} 次对话` : "对话";
}

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

/* ===================== 事实元数据（group / 英文翻译） =====================
 * 事实正文仍写在 Demo/People/<slug>/00-profile.md（复用既有标记与来源行），
 * 分组和中英翻译落在同目录 facts-meta.json，按 factId 索引。
 * 旧数据没有这个文件时按英文原句表兜底；再找不到就归「其他」。
 */
async function readFactsMeta(slug, root = demoPeopleRoot()) {
  const file = path.join(root, String(slug), FACTS_META);
  const raw = await readJson(file);
  return raw && typeof raw === "object" && raw.facts && typeof raw.facts === "object"
    ? {schema: 1, facts: {...raw.facts}}
    : {schema: 1, facts: {}};
}

async function writeFactsMeta(slug, meta, root = demoPeopleRoot()) {
  const file = path.join(root, String(slug), FACTS_META);
  await writeJsonAtomic(file, {schema: 1, facts: meta.facts || {}});
  return file;
}

function metaForFact(fact, meta) {
  const stored = meta.facts[fact.id] || {};
  const translated = DEMO_FACT_TEXT[fact.text] || {};
  const snapshot = factSnapshot(fact.text, {
    textZh: stored.textZh || translated.zh,
    textEn: stored.textEn || (hasChinese(fact.text) ? "" : fact.text),
  });
  return {
    group: normalizeGroup(stored.group || translated.group),
    textZh: snapshot.textZh,
    textEn: snapshot.textEn,
    origin: stored.origin || (fact.source ? "conversation" : "manual"),
    createdAt: stored.createdAt || null,
    updatedAt: stored.updatedAt || null,
  };
}

/* ===================== 变更记录 changelog.jsonl（只追加） ===================== */
export function demoChangelogFile(root = demoRoot()) {
  return path.join(root, CHANGELOG);
}

async function readChangelog(root = demoRoot()) {
  let raw = "";
  try {
    raw = await fs.readFile(demoChangelogFile(root), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const entries = [];
  for (const line of String(raw).split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === "object" && parsed.id) entries.push(parsed);
    } catch {
      // 单行损坏不应让整份历史不可读。
    }
  }
  return entries;
}

async function appendChangelog(entries, root = demoRoot()) {
  const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
  if (!list.length) return [];
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  await chmodQuiet(root, 0o700);
  const file = demoChangelogFile(root);
  const existing = await fs.stat(file).catch(() => null);
  if (!existing) await fs.writeFile(file, "", {encoding: "utf8", mode: 0o600});
  await chmodQuiet(file, 0o600);
  const body = list.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  await fs.appendFile(file, body, {encoding: "utf8", mode: 0o600});
  return list;
}

function changelogId() {
  return "chg_" + crypto.randomBytes(8).toString("hex");
}

function changelogEntry({slug, action, source, summary, factId, before, after, batchId, undoOf}) {
  return {
    id: changelogId(),
    at: new Date().toISOString(),
    slug,
    action,
    source: source || "手动编辑",
    summary: shortText(summary),
    factId: factId || null,
    before: before || null,
    after: after || null,
    batchId: batchId || null,
    undoOf: undoOf || null,
  };
}

/** 倒序变更记录；原条目是否被撤回由后续 undo 条目推导，不改写历史行。 */
function changelogForSlug(entries, slug) {
  const undone = new Map();
  for (const entry of entries) {
    if (entry.action === "undo" && entry.undoOf) undone.set(entry.undoOf, entry.at);
  }
  return entries
    .filter((entry) => entry.slug === slug)
    .map((entry) => ({
      ...entry,
      undone: undone.has(entry.id),
      undoneAt: undone.get(entry.id) || null,
      undoable: ["add", "edit", "delete"].includes(entry.action) && !undone.has(entry.id),
    }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
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

/**
 * 从母版把一位人物的主档写进演示命名空间。
 * 事实正文用中文（中文为主），英文原句/翻译与分组写 facts-meta.json；
 * 同时产出本次种入的新增变更记录，交给调用方追加到 changelog.jsonl。
 */
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

  const who = DEMO_PERSONA_META[persona.slug] || {};
  const at = new Date().toISOString();
  const meta = {schema: 1, facts: {}};
  const facts = [];
  const changes = [];

  const addFact = ({textZh, textEn, group, source, summary, manual = false}) => {
    // 手写人设事实也写一条可解析的来源行（标记为 manual），避免正文解析歧义；
    // UI 的「手动编辑」标签以 facts-meta.origin 为准。
    const origin = manual || !source?.sessionId ? "manual" : "conversation";
    const lineSource = origin === "manual" ? {sessionId: "manual", segmentIndex: null} : source;
    const key = sourceKey(lineSource?.sessionId, lineSource?.segmentIndex, textZh);
    facts.push({
      slug: persona.slug,
      section: "preference",
      text: textZh,
      sessionId: lineSource?.sessionId,
      segmentIndex: lineSource?.segmentIndex,
      confirmedAt: at,
    });
    meta.facts[key] = {
      group: normalizeGroup(group),
      textZh,
      textEn,
      origin,
      createdAt: at,
      updatedAt: at,
    };
    changes.push(changelogEntry({
      slug: persona.slug,
      action: "add",
      source: origin === "conversation" ? conversationTitle(source.sessionId) : "手动编辑",
      summary: summary || `新增：${textZh}`,
      factId: key,
      after: {textZh, textEn, group: normalizeGroup(group)},
    }));
    return key;
  };

  // 基本情况 / 沟通习惯：演示母版的人设字段，不是从对话里推断的。
  addFact({
    textZh: `来自${persona.region || "未注明地区"}`,
    textEn: `From ${persona.regionEn || persona.region || "an unstated region"}`,
    group: "basic", summary: "新增：基本情况（地区）", manual: true,
  });
  addFact({
    textZh: `职业：${who.occupationZh || "未注明"}（演示）`,
    textEn: `Occupation: ${who.occupationEn || "not stated"} (demo)`,
    group: "basic", summary: "新增：基本情况（职业）", manual: true,
  });
  addFact({
    textZh: `沟通风格：${persona.stylePreference || "未注明"}`,
    textEn: `Communication style: ${who.styleEn || persona.stylePreference || "not stated"}`,
    group: "communication", summary: "新增：沟通风格", manual: true,
  });

  for (const fact of persona.baselineConfirmedFacts) {
    const translated = DEMO_FACT_TEXT[fact.text] || {};
    const textZh = translated.zh || fact.text;
    addFact({
      textZh,
      textEn: fact.text,
      group: translated.group || "other",
      source: {sessionId: fact.source?.sessionId, segmentIndex: fact.source?.segmentIndex},
    });
  }

  const written = await appendPeopleFacts(facts, {root});
  if (written.added.length !== facts.length) {
    throw fail(500, "DEMO_SEED_FACTS_INCOMPLETE",
      `演示人物 ${persona.slug} 事实写入不完整（${written.added.length}/${facts.length}）`);
  }
  await writeFactsMeta(persona.slug, meta, root);
  return {file, changes};
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
  const changes = [];
  for (const persona of fixture.data.personas) {
    const seeded = await seedPersona(persona, peopleDir);
    changes.push(...seeded.changes);
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
  return {state, changes};
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
    if (status.personas === 3 && status.sessions === 9) {
      await ensureChangelogMigrated(root, state);
      return {seeded: true, reason: "already"};
    }
  }
  const fixture = await readFixture();
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  await chmodQuiet(root, 0o700);
  await backupCurrent(root);
  const temp = path.join(root, `.seed-${process.pid}-${Date.now()}`);
  await fs.rm(temp, {recursive: true, force: true});
  const built = await buildInto(temp, {fixture});
  await fs.rename(path.join(temp, "People"), path.join(root, "People"));
  await fs.rename(path.join(temp, "Conversations"), path.join(root, "Conversations"));
  await fs.rename(path.join(temp, STATE), path.join(root, STATE));
  await fs.rm(temp, {recursive: true, force: true});
  await appendChangelog(built.changes, root);
  scheduleArchivePush();
  return {seeded: true, reason: "seeded-from-fixture"};
}

/**
 * 旧演示目录没有 changelog.jsonl 时补一次基线新增记录，保证「历史记录」不是空白。
 * 只补一次：文件已存在就直接返回，绝不覆盖用户后来产生的历史。
 */
async function ensureChangelogMigrated(root, state) {
  const file = demoChangelogFile(root);
  const exists = await fs.stat(file).catch(() => null);
  if (exists) return false;
  const at = state?.seededAt || new Date().toISOString();
  const changes = [];
  for (const entry of state?.personas || []) {
    const profile = path.join(root, "People", entry.slug, "00-profile.md");
    let text = "";
    try {
      text = await fs.readFile(profile, "utf8");
    } catch {
      continue;
    }
    const parsed = parsePersonProfile(text);
    const meta = await readFactsMeta(entry.slug, path.join(root, "People"));
    for (const fact of parsed.confirmed) {
      const info = metaForFact(fact, meta);
      changes.push({
        id: changelogId(), at, slug: entry.slug,
        action: "add",
        source: fact.source ? conversationTitle(fact.source.sessionId) : "手动编辑",
        summary: shortText(`新增：${info.textZh || fact.text}`),
        factId: fact.id,
        before: null,
        after: {textZh: info.textZh, textEn: info.textEn, group: info.group},
        batchId: null, undoOf: null,
      });
    }
  }
  if (changes.length) await appendChangelog(changes, root);
  return changes.length > 0;
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
  const built = await buildInto(temp, {fixture});
  await fs.rename(path.join(temp, "People"), path.join(root, "People"));
  await fs.rename(path.join(temp, "Conversations"), path.join(root, "Conversations"));
  await fs.rename(path.join(temp, STATE), path.join(root, STATE));
  await fs.rm(temp, {recursive: true, force: true});
  await appendChangelog(built.changes, root);
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
  const meta = await readFactsMeta(slug, demoPeopleRoot());
  const confirmed = parsed.confirmed.map((f) => {
    const info = metaForFact(f, meta);
    return {
      id: f.id,
      text: f.text,
      section: f.section,
      group: info.group,
      groupTitle: groupTitle(info.group, "zh"),
      textZh: info.textZh,
      textEn: info.textEn,
      origin: info.origin,
      sourceLabel: info.origin === "manual" || !f.source ? "手动编辑" : conversationTitle(f.source.sessionId),
      mappable: Boolean(f.mappable),
      source: f.source ? {sessionId: f.source.sessionId, segmentIndex: f.source.segmentIndex, date: f.source.date} : null,
    };
  });
  const groups = PROFILE_GROUPS.map((group) => {
    const facts = confirmed.filter((fact) => fact.group === group.id);
    return {...group, count: facts.length, factIds: facts.map((fact) => fact.id)};
  });
  const who = DEMO_PERSONA_META[String(slug)] || {};
  const changelog = changelogForSlug(await readChangelog(root), String(slug));
  return {
    slug: String(slug),
    name: parsed.name || slug,
    nameZh: who.nameZh || entry?.nameZh || parsed.name || String(slug),
    nameEn: who.nameEn || entry?.nameEn || parsed.name || String(slug),
    region: entry?.region || "",
    regionEn: entry?.regionEn || "",
    occupationZh: who.occupationZh || "未注明",
    occupationEn: who.occupationEn || "not stated",
    style: entry?.style || "",
    personality: entry?.personality || "",
    topics: entry?.topics || [],
    confirmed,
    facts: confirmed,
    groups,
    groupsOrder: PROFILE_GROUPS.map((group) => group.id),
    factCount: confirmed.length,
    changelog,
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
  const translated = DEMO_FACT_TEXT[item.text] || {};
  const textZh = translated.zh || item.text;
  const textEn = translated.zh ? item.text : (hasChinese(item.text) ? "" : item.text);
  const group = normalizeGroup(translated.group || item.section || "other");
  const written = await appendPeopleFacts([{
    slug: entry.slug,
    section: item.section || "preference",
    text: textZh,
    sessionId: item.source?.sessionId,
    segmentIndex: item.source?.segmentIndex,
    confirmedAt,
  }], {root: demoPeopleRoot()});
  const duplicate = written.skipped.some((s) => s.reason === "DUPLICATE");
  if (!written.added.length && !duplicate) {
    throw fail(500, "DEMO_CONFIRM_FAILED", `写入演示档案失败：${JSON.stringify(written.skipped)}`);
  }

  const factId = written.added[0]?.key
    || sourceKey(item.source?.sessionId, item.source?.segmentIndex, textZh);
  if (!duplicate) {
    const meta = await readFactsMeta(entry.slug, demoPeopleRoot());
    meta.facts[factId] = {
      group, textZh, textEn, origin: "conversation",
      createdAt: confirmedAt, updatedAt: confirmedAt,
    };
    await writeFactsMeta(entry.slug, meta, demoPeopleRoot());
    await appendChangelog([changelogEntry({
      slug: entry.slug,
      action: "add",
      source: item.source?.sessionId ? conversationTitle(item.source.sessionId) : "手动编辑",
      summary: `新增：${textZh}`,
      factId,
      after: {textZh, textEn, group},
    })], root);
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

/* ===================== 档案事实的单条 / 批量编辑（仅演示命名空间） =====================
 * 事实正文仍在 00-profile.md，分组/翻译在 facts-meta.json，历史在 changelog.jsonl。
 * 所有写操作：路径隔离断言 + 文件锁 + 写前备份 + 原子替换 + 写后自检。
 * 只允许演示人物；真实 People 目录完全不参与（root 固定 demoPeopleRoot）。
 */
const FACT_ID_RE = /^[A-Za-z0-9]{6,32}$/;
const MAX_FACT_TEXT = 300;
const MAX_BULK = 50;

function cleanFactText(value) {
  const text = String(value || "").replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, MAX_FACT_TEXT);
  if (text.length < 2) throw fail(400, "EMPTY_FACT_TEXT", "事实内容太短");
  return text;
}

function checkFactId(value) {
  const id = String(value || "").trim();
  if (!FACT_ID_RE.test(id)) throw fail(400, "INVALID_FACT_ID", "factId 格式不合法");
  return id;
}

async function withDemoLock(lockPath, fn) {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx", 0o600);
      try {
        await handle.writeFile(String(process.pid));
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (Date.now() > deadline) throw fail(409, "DEMO_WRITE_BUSY", "演示档案正在被另一个写入操作占用，请稍后重试");
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, {force: true});
  }
}

async function backupDemoFile(file) {
  const dir = path.join(path.dirname(file), ".sm-backup");
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const dest = path.join(dir, `00-profile.${new Date().toISOString().replace(/[:.]/g, "-")}.md.bak`);
  await fs.copyFile(file, dest);
  await chmodQuiet(dest, 0o600);
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith(".bak")).sort();
  for (const old of names.slice(0, Math.max(0, names.length - 10))) {
    await fs.rm(path.join(dir, old), {force: true});
  }
  return dest;
}

async function writeDemoProfileFile(file, body, verify) {
  const backup = await backupDemoFile(file);
  const dir = path.dirname(file);
  const temp = path.join(dir, `.00-profile.${process.pid}.tmp`);
  await fs.writeFile(temp, body, {encoding: "utf8", mode: 0o600});
  await chmodQuiet(temp, 0o600);
  try {
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, {force: true});
    throw error;
  }
  await chmodQuiet(file, 0o600);
  await chmodQuiet(dir, 0o700);
  const after = await fs.readFile(file, "utf8");
  if (!verify(after)) {
    await fs.copyFile(backup, file);
    await chmodQuiet(file, 0o600);
    throw fail(500, "DEMO_WRITE_UNVERIFIED", "演示档案写入后自检失败，已用备份回滚");
  }
  return {backup, body: after};
}

async function loadDemoProfileForWrite(slug) {
  assertIsolated();
  const safe = assertSlug(slug);
  const file = path.join(demoPeopleRoot(), safe, "00-profile.md");
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw fail(404, "DEMO_PERSON_NOT_FOUND", "演示人物不存在或已被清空");
    throw error;
  }
  return {slug: safe, file, text, parsed: parsePersonProfile(text)};
}

function snapshotOf(fact, meta) {
  const info = metaForFact(fact, meta);
  return {
    textZh: info.textZh, textEn: info.textEn, group: info.group, origin: info.origin,
    source: fact.source ? {sessionId: fact.source.sessionId, segmentIndex: fact.source.segmentIndex} : null,
  };
}

function markerOf(factId) {
  return `<!--sm-src:${factId}-->`;
}

/** 只替换这一行事实正文，保留原来的来源后缀与不可见标记。 */
function replaceFactLineInText(text, factId, nextZh) {
  const lines = String(text).split("\n");
  const marker = new RegExp(`<!--\\s*sm-src:${factId}\\s*-->`);
  const index = lines.findIndex((line) => marker.test(line));
  if (index < 0) return null;
  const line = lines[index];
  const markerMatch = line.match(marker);
  const head = line.slice(0, markerMatch.index);
  const tail = line.slice(markerMatch.index);
  const prefixMatch = head.match(/^(\s*[-*+]\s+)/);
  const prefix = prefixMatch ? prefixMatch[1] : "- ";
  const rest = head.slice(prefix.length);
  const sourceAt = rest.search(/（来源：/);
  const suffix = sourceAt >= 0 ? rest.slice(sourceAt) : "";
  lines[index] = `${prefix}${nextZh}${suffix}${tail}`;
  return lines.join("\n");
}

function deleteFactLineInText(text, factId) {
  const lines = String(text).split("\n");
  const marker = new RegExp(`<!--\\s*sm-src:${factId}\\s*-->`);
  const index = lines.findIndex((line) => marker.test(line));
  if (index < 0) return null;
  const removed = lines[index];
  const next = [...lines];
  next.splice(index, 1);
  if (next[index - 1] !== undefined && next[index - 1].trim() === ""
    && next[index] !== undefined && next[index].trim() === "") {
    next.splice(index, 1);
  }
  return {text: next.join("\n"), removedLine: removed};
}

function appendFactLineToText(text, {factId, textZh, source}) {
  const sourceText = source?.sessionId
    ? `（来源：会话 ${String(source.sessionId).slice(0, 64)} · 段 ${
      Number.isFinite(Number(source.segmentIndex)) ? Number(source.segmentIndex) + 1 : "—"
    } · ${new Date().toISOString().slice(0, 16).replace("T", " ")} 用户确认）`
    : `（来源：手动编辑 · ${new Date().toISOString().slice(0, 16).replace("T", " ")} 用户确认）`;
  const line = `- ${textZh}${sourceText}${markerOf(factId)}`;
  const base = String(text);
  return `${base}${base.endsWith("\n") || base === "" ? "" : "\n"}${line}\n`;
}

/**
 * 单条编辑。lang=zh 改中文正文并重写主档；lang=en 只改英文翻译字段。
 */
export async function editDemoFact(slug, factId, {text, lang = "zh", confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "编辑事实需要用户显式确认（confirm:true）");
  const id = checkFactId(factId);
  const value = cleanFactText(text);
  const ctx = await loadDemoProfileForWrite(slug);
  const fact = ctx.parsed.confirmed.find((item) => item.id === id);
  if (!fact) throw fail(404, "FACT_NOT_FOUND", "这条事实不在该演示人物档案里");
  const meta = await readFactsMeta(ctx.slug);
  const before = snapshotOf(fact, meta);
  const after = {...before};
  const useEn = lang === "en";

  await withDemoLock(path.join(path.dirname(ctx.file), ".sm-write.lock"), async () => {
    if (!useEn) {
      const next = replaceFactLineInText(await fs.readFile(ctx.file, "utf8"), id, value);
      if (!next) throw fail(404, "FACT_NOT_FOUND", "这条事实已不在档案里");
      await writeDemoProfileFile(ctx.file, next, (body) => body.includes(`sm-src:${id}`) && body.includes(value));
      after.textZh = value;
    } else {
      after.textEn = value;
    }
    meta.facts[id] = {
      ...(meta.facts[id] || {}),
      group: before.group,
      textZh: after.textZh,
      textEn: after.textEn,
      origin: meta.facts[id]?.origin || (fact.source ? "conversation" : "manual"),
      createdAt: meta.facts[id]?.createdAt || null,
      updatedAt: new Date().toISOString(),
    };
    await writeFactsMeta(ctx.slug, meta);
  });

  const entry = changelogEntry({
    slug: ctx.slug, action: "edit", source: "手动编辑",
    summary: useEn ? `修改英文：${shortText(before.textEn)} → ${shortText(after.textEn)}`
      : `修改：${shortText(before.textZh)} → ${shortText(after.textZh)}`,
    factId: id, before, after,
  });
  await appendChangelog([entry]);
  return {ok: true, entry, person: await readPersona(ctx.slug), realPeopleUntouched: true};
}

/** 单条删除（不要求来源可映射；演示命名空间内只删这一行）。 */
export async function deleteDemoFact(slug, factId, {confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "删除事实需要用户二次确认（confirm:true）");
  const id = checkFactId(factId);
  const ctx = await loadDemoProfileForWrite(slug);
  const fact = ctx.parsed.confirmed.find((item) => item.id === id);
  if (!fact) throw fail(404, "FACT_NOT_FOUND", "这条事实不在该演示人物档案里");
  const meta = await readFactsMeta(ctx.slug);
  const before = snapshotOf(fact, meta);

  await withDemoLock(path.join(path.dirname(ctx.file), ".sm-write.lock"), async () => {
    const cut = deleteFactLineInText(await fs.readFile(ctx.file, "utf8"), id);
    if (!cut) throw fail(404, "FACT_NOT_FOUND", "这条事实已不在档案里");
    await writeDemoProfileFile(ctx.file, cut.text, (body) => !body.includes(`sm-src:${id}`));
    delete meta.facts[id];
    await writeFactsMeta(ctx.slug, meta);
  });

  const entry = changelogEntry({
    slug: ctx.slug, action: "delete", source: "手动编辑",
    summary: `删除：${shortText(before.textZh)}`, factId: id, before, after: null,
  });
  await appendChangelog([entry]);
  return {ok: true, removed: [{id, ...before}], entry, person: await readPersona(ctx.slug), realPeopleUntouched: true};
}

/** 批量删除。每条事实各留一条可独立撤回的变更记录，同一 batchId 便于追溯。 */
export async function bulkDeleteDemoFacts(slug, factIds, {confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "批量删除需要用户二次确认（confirm:true）");
  const ids = [...new Set((Array.isArray(factIds) ? factIds : []).map((id) => String(id || "").trim()))]
    .filter(Boolean);
  if (!ids.length) throw fail(400, "NO_FACTS_SELECTED", "请先勾选要删除的事实");
  if (ids.length > MAX_BULK) throw fail(400, "TOO_MANY_FACTS", `一次最多处理 ${MAX_BULK} 条`);
  ids.forEach(checkFactId);

  const ctx = await loadDemoProfileForWrite(slug);
  const meta = await readFactsMeta(ctx.slug);
  const batchId = "bat_" + crypto.randomBytes(6).toString("hex");
  const removed = [];

  await withDemoLock(path.join(path.dirname(ctx.file), ".sm-write.lock"), async () => {
    let body = await fs.readFile(ctx.file, "utf8");
    for (const id of ids) {
      const fact = ctx.parsed.confirmed.find((item) => item.id === id);
      if (!fact) continue;
      const cut = deleteFactLineInText(body, id);
      if (!cut) continue;
      removed.push({id, ...snapshotOf(fact, meta)});
      body = cut.text;
      delete meta.facts[id];
    }
    if (!removed.length) throw fail(404, "FACT_NOT_FOUND", "选中的事实都不在档案里");
    const remaining = new Set(removed.map((item) => item.id));
    await writeDemoProfileFile(ctx.file, body, (text) =>
      removed.every((item) => !text.includes(`sm-src:${item.id}`)) && remaining.size > 0);
    await writeFactsMeta(ctx.slug, meta);
  });

  const entries = removed.map((item) => changelogEntry({
    slug: ctx.slug, action: "delete", source: "手动编辑",
    summary: `删除：${shortText(item.textZh)}`, factId: item.id,
    before: item, after: null, batchId,
  }));
  await appendChangelog(entries);
  return {
    ok: true, batchId, removedCount: removed.length, removed, entries,
    person: await readPersona(ctx.slug), realPeopleUntouched: true,
  };
}

/** 批量改分组：只动 facts-meta.json，不改事实正文。 */
export async function moveDemoFactsGroup(slug, factIds, group, {confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "修改分组需要用户显式确认（confirm:true）");
  const ids = [...new Set((Array.isArray(factIds) ? factIds : []).map((id) => String(id || "").trim()))]
    .filter(Boolean);
  if (!ids.length) throw fail(400, "NO_FACTS_SELECTED", "请先勾选要移动的事实");
  if (ids.length > MAX_BULK) throw fail(400, "TOO_MANY_FACTS", `一次最多处理 ${MAX_BULK} 条`);
  ids.forEach(checkFactId);
  const target = normalizeGroup(group);
  if (!GROUP_IDS.has(String(group))) throw fail(400, "INVALID_GROUP", "分组不在五个固定分组内");

  const ctx = await loadDemoProfileForWrite(slug);
  const meta = await readFactsMeta(ctx.slug);
  const batchId = "bat_" + crypto.randomBytes(6).toString("hex");
  const moved = [];

  await withDemoLock(path.join(path.dirname(ctx.file), ".sm-write.lock"), async () => {
    for (const id of ids) {
      const fact = ctx.parsed.confirmed.find((item) => item.id === id);
      if (!fact) continue;
      const before = snapshotOf(fact, meta);
      if (before.group === target) continue;
      meta.facts[id] = {
        ...(meta.facts[id] || {}),
        group: target,
        textZh: before.textZh,
        textEn: before.textEn,
        origin: meta.facts[id]?.origin || (fact.source ? "conversation" : "manual"),
        createdAt: meta.facts[id]?.createdAt || null,
        updatedAt: new Date().toISOString(),
      };
      moved.push({id, before, after: {...before, group: target}});
    }
    if (!moved.length) throw fail(409, "NO_GROUP_CHANGE", "选中事实已经在这个分组里");
    await writeFactsMeta(ctx.slug, meta);
  });

  const entries = moved.map((item) => changelogEntry({
    slug: ctx.slug, action: "edit", source: "手动编辑",
    summary: `分组：${groupTitle(item.before.group)} → ${groupTitle(target)}`,
    factId: item.id, before: item.before, after: item.after, batchId,
  }));
  await appendChangelog(entries);
  return {
    ok: true, batchId, movedCount: moved.length, group: target, entries,
    person: await readPersona(ctx.slug), realPeopleUntouched: true,
  };
}

/** 新增一条手动事实（中文为主；英文可在之后单独编辑）。 */
export async function addDemoFact(slug, {text, group = "other", confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "新增事实需要用户显式确认（confirm:true）");
  const value = cleanFactText(text);
  const target = GROUP_IDS.has(String(group)) ? String(group) : DEFAULT_GROUP;
  const ctx = await loadDemoProfileForWrite(slug);
  const meta = await readFactsMeta(ctx.slug);
  const id = sourceKey(undefined, undefined, value);
  if (ctx.parsed.confirmed.some((fact) => fact.id === id)) {
    throw fail(409, "FACT_EXISTS", "这条事实已经存在");
  }
  const at = new Date().toISOString();

  await withDemoLock(path.join(path.dirname(ctx.file), ".sm-write.lock"), async () => {
    const body = appendFactLineToText(await fs.readFile(ctx.file, "utf8"), {
      factId: id, textZh: value, source: null,
    });
    await writeDemoProfileFile(ctx.file, body, (next) => next.includes(`sm-src:${id}`) && next.includes(value));
    meta.facts[id] = {
      group: target, textZh: value,
      textEn: hasChinese(value) ? "" : value,
      origin: "manual", createdAt: at, updatedAt: at,
    };
    await writeFactsMeta(ctx.slug, meta);
  });

  const entry = changelogEntry({
    slug: ctx.slug, action: "add", source: "手动编辑",
    summary: `新增：${shortText(value)}`, factId: id,
    after: {textZh: value, textEn: hasChinese(value) ? "" : value, group: target},
  });
  await appendChangelog([entry]);
  return {ok: true, entry, person: await readPersona(ctx.slug), realPeopleUntouched: true};
}

/** 撤回一条历史：新增→删掉该条；修改→回滚旧值；删除→恢复；撤回本身也追加留痕。 */
export async function undoDemoChangelog(slug, entryId, {confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "撤回变更需要用户显式确认（confirm:true）");
  const ctx = await loadDemoProfileForWrite(slug);
  const all = await readChangelog(demoRoot());
  const target = all.filter((entry) => entry.slug === ctx.slug).find((entry) => entry.id === String(entryId || ""));
  if (!target) throw fail(404, "CHANGELOG_NOT_FOUND", "这条变更记录不存在");
  if (target.action === "undo") throw fail(400, "UNDO_NOT_UNDOABLE", "撤回记录本身不能再撤回");
  if (all.some((entry) => entry.action === "undo" && entry.undoOf === target.id)) {
    throw fail(409, "ALREADY_UNDONE", "这条变更已经撤回过了");
  }
  const factId = checkFactId(target.factId);
  const meta = await readFactsMeta(ctx.slug);
  const current = ctx.parsed.confirmed.find((item) => item.id === factId);
  const lock = path.join(path.dirname(ctx.file), ".sm-write.lock");

  await withDemoLock(lock, async () => {
    if (target.action === "add") {
      if (current) {
        const cut = deleteFactLineInText(await fs.readFile(ctx.file, "utf8"), factId);
        if (!cut) throw fail(409, "FACT_NOT_FOUND", "要撤回的事实已不在档案里");
        await writeDemoProfileFile(ctx.file, cut.text, (body) => !body.includes(`sm-src:${factId}`));
      }
      delete meta.facts[factId];
      await writeFactsMeta(ctx.slug, meta);
      return;
    }
    if (target.action === "delete") {
      if (current) {
        // 已经被别的路径恢复过：不重复插入，只把元数据补回旧分组。
        meta.facts[factId] = {
          ...(meta.facts[factId] || {}), group: target.before?.group || DEFAULT_GROUP,
          textZh: target.before?.textZh || "", textEn: target.before?.textEn || "",
          origin: meta.facts[factId]?.origin || "manual",
          createdAt: meta.facts[factId]?.createdAt || null, updatedAt: new Date().toISOString(),
        };
      } else {
        const body = appendFactLineToText(await fs.readFile(ctx.file, "utf8"), {
          factId, textZh: target.before?.textZh || "", source: target.before?.source || null,
        });
        await writeDemoProfileFile(ctx.file, body, (text) => text.includes(`sm-src:${factId}`));
        meta.facts[factId] = {
          group: target.before?.group || DEFAULT_GROUP,
          textZh: target.before?.textZh || "", textEn: target.before?.textEn || "",
          origin: target.before?.origin || "manual",
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
      }
      await writeFactsMeta(ctx.slug, meta);
      return;
    }
    // edit：回滚整份快照（正文 + 英文 + 分组）。
    if (!current) throw fail(409, "FACT_NOT_FOUND", "要回滚的事实已不在档案里，无法撤回");
    const before = target.before || {};
    if (before.textZh && before.textZh !== current.text) {
      const next = replaceFactLineInText(await fs.readFile(ctx.file, "utf8"), factId, before.textZh);
      if (!next) throw fail(409, "FACT_NOT_FOUND", "要回滚的事实已不在档案里");
      await writeDemoProfileFile(ctx.file, next, (body) => body.includes(before.textZh));
    }
    meta.facts[factId] = {
      ...(meta.facts[factId] || {}),
      group: before.group || normalizeGroup(meta.facts[factId]?.group),
      textZh: before.textZh || current.text,
      textEn: before.textEn || "",
      origin: meta.facts[factId]?.origin || "manual",
      createdAt: meta.facts[factId]?.createdAt || null,
      updatedAt: new Date().toISOString(),
    };
    await writeFactsMeta(ctx.slug, meta);
  });

  const entry = changelogEntry({
    slug: ctx.slug, action: "undo", source: "手动编辑",
    summary: `撤回：${target.summary}`, factId, undoOf: target.id,
    before: target.after || null, after: target.before || null,
  });
  await appendChangelog([entry]);
  return {ok: true, entry, undone: target.id, person: await readPersona(ctx.slug), realPeopleUntouched: true};
}

/** 变更记录（倒序）+ 计数，供详情页时间线直接渲染。 */
export async function readDemoChangelog(slug) {
  const safe = assertSlug(slug);
  const entries = changelogForSlug(await readChangelog(demoRoot()), safe);
  return {
    ok: true, slug: safe, count: entries.length,
    counts: {
      add: entries.filter((e) => e.action === "add").length,
      edit: entries.filter((e) => e.action === "edit").length,
      delete: entries.filter((e) => e.action === "delete").length,
      undo: entries.filter((e) => e.action === "undo").length,
    },
    entries,
  };
}

export const DEMO_PATHS = {demoRoot, demoPeopleRoot, demoConversationsRoot, fixture: FIXTURE};
