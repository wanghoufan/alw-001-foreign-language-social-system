/**
 * 人物详情聚合 / 事实精准撤回 / 见面前准备（P1-01、P1-04、P2-01）。
 *
 * 边界：
 * - People/<slug>/00-profile.md 是唯一事实源；本模块只读它，并按不可见标记 `<!--sm-src:KEY-->`
 *   区分「用户确认过、且有来源」的事实与「人工手写」的段落。没有来源标记的内容一律不当作 confirmed。
 * - 详情里的会话列表只由已确认事实的来源 sessionId 反查得到，绝不靠 spk 聚类猜人物。
 * - 撤回只删该 factId 对应的那一行事实，保留人工段落与文件其它内容；写前备份、原子替换、写后自检。
 * - 无法把 factId 映射到可靠来源时安全拒绝（409 SOURCE_UNMAPPABLE），宁可不删也不猜。
 * - 见面前准备是纯本地确定性规则：0 次外部请求，不编造用户自己的事实。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {assertSlug, peopleRoot} from "./people-store.mjs";

const MARKER = /<!--\s*sm-src:([A-Za-z0-9]{6,32})\s*-->/;
const SOURCE = /（来源：会话\s*(.+?)\s*·\s*段\s*(.+?)\s*·\s*(.+?)\s*用户确认）/;
const EDITED = /（已按用户修改保存[^）]*）/;
const FACT_ID = /^[A-Za-z0-9]{6,32}$/;
const BACKUP_KEEP = 10;
const PREP_MAX = 3;

const TOPIC_LABEL = {
  running: "运动/跑步",
  coffee: "咖啡",
  coast: "海边",
  work: "工作/学习",
  food: "吃/美食",
  travel: "出行/计划",
  language: "语言",
};

/** 本地关键词规则：只用于给归档会话打通用话题标签，不做任何身份或心理推断。 */
const TOPIC_RULES = [
  ["running", /run(ning|ner)?s?\b|jog|hiking|hike|gym|workout|跑步|慢跑|健身|散步|徒步|运动/i],
  ["coffee", /coffee|cafe|café|latte|espresso|咖啡|拿铁/i],
  ["coast", /beach|seaside|coast|sunset|海边|海滩|日落/i],
  ["work", /software|coding|program|project|office|colleague|study|exam|编程|软件|开发|工作|上班|学习|项目|考试/i],
  ["food", /food|restaurant|dinner|lunch|night market|cook|吃饭|美食|夜市|餐厅|做饭/i],
  ["travel", /travel|trip|holiday|vacation|travel plan|旅行|旅游|假期|出差/i],
  ["language", /english|chinese|language|translate|英语|中文|语言|翻译/i],
];

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function chmodQuiet(target, mode) {
  return fs.chmod(target, mode).catch(() => {});
}

function utcIso(stampText) {
  const raw = String(stampText || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(raw)) {
    const d = new Date(`${raw.replace(" ", "T")}:00Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

export function detectTopics(text) {
  const source = String(text || "");
  const found = [];
  for (const [key, rule] of TOPIC_RULES) if (rule.test(source)) found.push(TOPIC_LABEL[key]);
  return found.length ? [...new Set(found)] : ["日常"];
}

/**
 * 解析人物主档。
 * @returns {{name:string,lastContactRaw:string,confirmed:Array,manual:string[],sections:Array}}
 */
export function parsePersonProfile(text) {
  const lines = String(text || "").split("\n");
  let bodyStart = 0;
  let name = "";
  let lastContactRaw = "";
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) {
      bodyStart = end + 1;
      const nameLine = lines.slice(1, end).find((line) => /^name\s*:/.test(line));
      if (nameLine) name = nameLine.replace(/^name\s*:/, "").replace(/^["']|["']$/g, "").trim();
      const lastLine = lines.slice(1, end).find((line) => /^last_contact\s*:/.test(line));
      if (lastLine) lastContactRaw = lastLine.replace(/^last_contact\s*:/, "").trim();
    }
  }

  const confirmed = [];
  const manual = [];
  const manualEntries = [];
  const sections = [];
  let section = "";

  for (const line of lines.slice(bodyStart)) {
    const heading = line.match(/^#\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1].trim();
      sections.push(section);
      continue;
    }
    if (!line.trim()) continue;
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const content = bullet ? bullet[1] : line.trim();
    const marker = content.match(MARKER);
    if (!marker) {
      // 人工段落/人工列表项原样保留，永不参与撤回。
      const text = content.trim();
      manual.push(text);
      manualEntries.push({text, section: section || null});
      continue;
    }
    const sourceMatch = content.match(SOURCE);
    const cleanText = content
      .replace(MARKER, "")
      .replace(SOURCE, "")
      .replace(EDITED, "")
      .trim();
    const segmentRaw = sourceMatch ? sourceMatch[2].trim() : "";
    const segmentIndex = /^\d+$/.test(segmentRaw) ? Math.max(0, Number(segmentRaw) - 1) : null;
    confirmed.push({
      id: marker[1],
      text: cleanText,
      section: section || null,
      source: sourceMatch
        ? {
            sessionId: sourceMatch[1].trim().slice(0, 64),
            segmentIndex,
            date: utcIso(sourceMatch[3]),
            dateRaw: sourceMatch[3].trim(),
          }
        : null,
      /** 只有同时具备标记与可解析来源，才认为可安全定位；否则撤回一律 409。 */
      mappable: Boolean(sourceMatch && sourceMatch[1].trim()),
    });
  }

  return {name, lastContactRaw, confirmed, manual, manualEntries, sections};
}

async function readProfileFile(slug, root = peopleRoot()) {
  const safeSlug = assertSlug(slug);
  const file = path.join(root, safeSlug, "00-profile.md");
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw fail(404, "PERSON_NOT_FOUND", "人物主档不存在");
    throw error;
  }
  return {slug: safeSlug, file, text, parsed: parsePersonProfile(text)};
}

/**
 * 人物详情：confirmed 只来自带来源记录的已确认事实；manual 是人工段落原文。
 * @param {string} slug
 * @param {{root?:string, loadSession?:(sessionId:string)=>Promise<object|null>}} [options]
 */
export async function getPersonDetail(slug, options = {}) {
  const root = options.root || peopleRoot();
  const {parsed} = await readProfileFile(slug, root);
  const loadSession = typeof options.loadSession === "function" ? options.loadSession : null;

  const confirmed = parsed.confirmed.map((fact) => ({
    id: fact.id,
    text: fact.text,
    section: fact.section,
    mappable: fact.mappable,
    source: fact.source
      ? {sessionId: fact.source.sessionId, segmentIndex: fact.source.segmentIndex, date: fact.source.date}
      : null,
  }));

  // 会话列表只由已确认事实的来源 sessionId 反查，不按说话人聚类猜人物。
  const bySession = new Map();
  for (const fact of parsed.confirmed) {
    const sessionId = fact.source?.sessionId;
    if (!sessionId) continue;
    if (!bySession.has(sessionId)) {
      bySession.set(sessionId, {sessionId, date: fact.source.date, facts: []});
    }
    bySession.get(sessionId).facts.push(fact.text);
  }

  const sessions = [];
  for (const entry of bySession.values()) {
    let archived = null;
    if (loadSession) {
      try {
        archived = await loadSession(entry.sessionId);
      } catch {
        archived = null;
      }
    }
    const segments = Array.isArray(archived?.segments) ? archived.segments : [];
    const text = segments.map((s) => String(s?.textOriginal || s?.text || "")).join(" ");
    sessions.push({
      sessionId: entry.sessionId,
      date: entry.date || (archived?.startedAt ? new Date(archived.startedAt).toISOString().slice(0, 10) : null),
      topics: text ? detectTopics(text) : [],
      archived: Boolean(archived),
      confirmedCount: entry.facts.length,
    });
  }
  sessions.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

  const dates = parsed.confirmed
    .map((fact) => fact.source?.date)
    .filter(Boolean)
    .sort();
  const fromFacts = dates.length ? dates[dates.length - 1] : null;
  const fromFrontMatter = utcIso(parsed.lastContactRaw);
  const lastContact = [fromFacts, fromFrontMatter].filter(Boolean).sort().pop() || null;

  // 基本档案：按主档章节把「会话确认事实」与「人工补充」汇总；只读，不改文件。
  const buckets = new Map();
  const bucket = (name) => {
    const key = name && String(name).trim() ? String(name).trim() : "其他";
    if (!buckets.has(key)) buckets.set(key, []);
    return buckets.get(key);
  };
  for (const fact of confirmed) {
    bucket(fact.section).push({kind: "confirmed", text: fact.text, factId: fact.id,
      section: fact.section, source: fact.source});
  }
  for (const entry of parsed.manualEntries || []) {
    bucket(entry.section).push({kind: "manual", text: entry.text, section: entry.section});
  }
  const order = [];
  for (const raw of [...parsed.sections, ...confirmed.map((f) => f.section),
    ...(parsed.manualEntries || []).map((m) => m.section), "其他"]) {
    const name = raw && String(raw).trim() ? String(raw).trim() : "其他";
    if (!order.includes(name)) order.push(name);
  }
  const profileSections = order
    .map((section) => ({section, items: buckets.get(section) || []}))
    .filter((entry) => entry.items.length);

  return {
    person: {
      slug: String(slug),
      name: parsed.name || String(slug),
      confirmed,
      manual: parsed.manual,
      lastContact,
      sessions,
      profileSections,
    },
  };
}

async function readTombstones(dir) {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, ".sm-revoked.json"), "utf8"));
    return Array.isArray(raw?.revoked) ? raw.revoked : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    return [];
  }
}

async function backupFile(file) {
  const dir = path.join(path.dirname(file), ".sm-backup");
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const name = `00-profile.${new Date().toISOString().replace(/[:.]/g, "-")}.md.bak`;
  const dest = path.join(dir, name);
  await fs.copyFile(file, dest);
  await chmodQuiet(dest, 0o600);
  const names = (await fs.readdir(dir)).filter((n) => n.endsWith(".bak")).sort();
  for (const old of names.slice(0, Math.max(0, names.length - BACKUP_KEEP))) {
    await fs.rm(path.join(dir, old), {force: true});
  }
  return dest;
}

async function withLock(lockPath, fn) {
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
      if (Date.now() > deadline) throw fail(409, "PEOPLE_WRITE_BUSY", "该人物主档正在被另一个写入操作占用，请稍后重试");
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, {force: true});
  }
}

/** 只删这一行事实；如果删完留下连续空行，收掉多余的那一行。 */
function cutFactLine(lines, factId) {
  const marker = new RegExp(`<!--\\s*sm-src:${factId}\\s*-->`);
  const index = lines.findIndex((line) => marker.test(line));
  if (index < 0) return null;
  const next = [...lines];
  next.splice(index, 1);
  if (next[index - 1] !== undefined && next[index - 1].trim() === "" && next[index] !== undefined && next[index].trim() === "") {
    next.splice(index, 1);
  }
  return {lines: next, removedLine: lines[index]};
}

/**
 * 事实精准撤回。
 * @param {string} slug
 * @param {{factId:string, confirm:boolean, root?:string}} options
 * @returns {Promise<{ok:true, removed:Array, keptManual:true, alreadyRemoved?:true}>}
 */
export async function revokePersonFact(slug, options = {}) {
  const root = options.root || peopleRoot();
  const safeSlug = assertSlug(slug);
  if (options.confirm !== true) {
    throw fail(400, "CONFIRM_REQUIRED", "撤回已确认事实需要用户二次确认（confirm:true）");
  }
  const factId = String(options.factId || "").trim();
  if (!FACT_ID.test(factId)) throw fail(400, "INVALID_FACT_ID", "factId 格式不合法");

  const dir = path.join(root, safeSlug);
  const file = path.join(dir, "00-profile.md");
  let original;
  try {
    original = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw fail(404, "PERSON_NOT_FOUND", "人物主档不存在");
    throw error;
  }

  const parsed = parsePersonProfile(original);
  const fact = parsed.confirmed.find((item) => item.id === factId);
  const tombstones = await readTombstones(dir);
  const prior = tombstones.find((item) => item?.id === factId);

  if (!fact) {
    // 幂等：已经撤回过就明确返回 alreadyRemoved，而不是报错。
    if (prior) {
      return {ok: true, removed: [], keptManual: true, alreadyRemoved: true,
        revokedAt: prior.revokedAt || null};
    }
    throw fail(404, "FACT_NOT_FOUND", "这条事实不在该人物主档里");
  }
  if (!fact.mappable || !fact.source) {
    // 找不到可靠来源映射时安全拒绝：宁可让用户手工处理，也不猜着删。
    throw fail(409, "SOURCE_UNMAPPABLE", "无法定位来源，请手工处理");
  }

  const lockPath = path.join(dir, ".sm-write.lock");
  return withLock(lockPath, async () => {
    const current = await fs.readFile(file, "utf8");
    const currentParsed = parsePersonProfile(current);
    const stillThere = currentParsed.confirmed.find((item) => item.id === factId);
    if (!stillThere) {
      return {ok: true, removed: [], keptManual: true, alreadyRemoved: true, revokedAt: null};
    }
    if (!stillThere.mappable) throw fail(409, "SOURCE_UNMAPPABLE", "无法定位来源，请手工处理");

    const cut = cutFactLine(current.split("\n"), factId);
    if (!cut) throw fail(409, "SOURCE_UNMAPPABLE", "无法定位来源，请手工处理");

    const body = cut.lines.join("\n");
    const backup = await backupFile(file);
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

    const verify = await fs.readFile(file, "utf8");
    if (verify.includes(`sm-src:${factId}`) || verify.length >= current.length) {
      // 自检失败：用备份回滚，不允许出现「看起来删了但没删」。
      await fs.copyFile(backup, file);
      await chmodQuiet(file, 0o600);
      throw fail(500, "REVOKE_UNVERIFIED", "撤回后自检失败，已用备份回滚");
    }

    const revokedAt = new Date().toISOString();
    const nextTombstones = [...tombstones.filter((item) => item?.id !== factId), {
      id: factId,
      text: stillThere.text,
      section: stillThere.section,
      source: stillThere.source,
      revokedAt,
    }].slice(-500);
    const tombFile = path.join(dir, ".sm-revoked.json");
    const tombTemp = path.join(dir, `.sm-revoked.${process.pid}.tmp`);
    await fs.writeFile(tombTemp, JSON.stringify({schema: 1, revoked: nextTombstones}, null, 2),
      {encoding: "utf8", mode: 0o600});
    await chmodQuiet(tombTemp, 0o600);
    await fs.rename(tombTemp, tombFile);
    await chmodQuiet(tombFile, 0o600);

    return {
      ok: true,
      removed: [{id: factId, text: stillThere.text, section: stillThere.section, source: stillThere.source}],
      keptManual: true,
      alreadyRemoved: false,
      revokedAt,
      backup: path.relative(root, backup),
    };
  });
}

/** 事实 → 追问句的模板表。句子只引用对方已分享的话题，不添加任何未确认事实。 */
const TOPIC_QUESTIONS = {
  running: {
    en: "You mentioned running or the outdoors — where do you usually go?",
    zh: "你提到跑步或户外——你一般去哪里？",
  },
  coffee: {
    en: "You mentioned coffee — which café do you like best around here?",
    zh: "你提到咖啡——这附近你最喜欢哪家咖啡店？",
  },
  coast: {
    en: "You mentioned the seaside — how often do you go there?",
    zh: "你提到海边——你多久去一次？",
  },
  work: {
    en: "You mentioned work or study — what does a normal day look like for you?",
    zh: "你提到工作或学习——你平常的一天是什么样的？",
  },
  food: {
    en: "You mentioned food — which dish would you recommend to a friend?",
    zh: "你提到吃的——你会向朋友推荐哪道菜？",
  },
  travel: {
    en: "You mentioned a trip or plan — what are you looking forward to most?",
    zh: "你提到出行或计划——你最期待哪一部分？",
  },
  language: {
    en: "You mentioned languages — which one are you practising these days?",
    zh: "你提到语言——你最近在练哪一门？",
  },
  general: {
    en: "You mentioned that earlier — could you tell me a bit more about it?",
    zh: "你之前提到这件事——能再多说一点吗？",
  },
};

/** 事实不足时的通用模板：不含任何关于对方的具体信息。 */
const GENERIC_TEMPLATES = [
  {en: "What has been the highlight of your week so far?", zh: "这周到目前为止，你最开心的事是什么？"},
  {en: "What do you usually do on weekends around here?", zh: "你周末通常在这附近做什么？"},
  {en: "Is there anything you would like to try for the first time this month?", zh: "这个月有什么你想第一次尝试的事吗？"},
];

function topicOfFact(text) {
  const source = String(text || "");
  for (const [key, rule] of TOPIC_RULES) {
    if (key === "language" && !/english|chinese|language|translate|英语|中文|语言|翻译/i.test(source)) continue;
    if (rule.test(source)) return key;
  }
  return "general";
}

/**
 * 纯本地规则生成「见面前准备」：最多 3 条，英文优先 + 中文释义。
 * - 有已确认事实 → 由事实话题确定性生成，source:"confirmed-fact" 并带 factId；
 * - 事实不足 → 用通用模板补齐，source:"template"，绝不编造用户自己的事实；
 * - 完全没有已确认事实 → items 为空 + empty:true。
 */
export function buildPrep(confirmed) {
  const facts = (Array.isArray(confirmed) ? confirmed : [])
    .filter((fact) => fact && typeof fact.text === "string" && fact.text.trim() && fact.id);
  if (!facts.length) {
    return {items: [], empty: true, emptyReason: "NO_CONFIRMED_FACTS"};
  }
  const items = [];
  const seen = new Set();
  for (const fact of facts) {
    if (items.length >= PREP_MAX) break;
    const question = TOPIC_QUESTIONS[topicOfFact(fact.text)] || TOPIC_QUESTIONS.general;
    if (seen.has(question.en)) continue;
    seen.add(question.en);
    items.push({en: question.en, zh: question.zh, source: "confirmed-fact", factId: fact.id});
  }
  for (const template of GENERIC_TEMPLATES) {
    if (items.length >= PREP_MAX) break;
    if (seen.has(template.en)) continue;
    seen.add(template.en);
    items.push({en: template.en, zh: template.zh, source: "template"});
  }
  return {items: items.slice(0, PREP_MAX), empty: false, emptyReason: null};
}

/** 读取主档并生成见面前准备（不访问网络、不读归档）。 */
export async function getPersonPrep(slug, options = {}) {
  const root = options.root || peopleRoot();
  const {parsed} = await readProfileFile(slug, root);
  return {
    person: {slug: String(slug), name: parsed.name || String(slug)},
    ...buildPrep(parsed.confirmed),
  };
}

export const PERSON_DETAIL_LIMITS = {prepMax: PREP_MAX};
