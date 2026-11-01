/**
 * 本机档案持久化存储（仅本机回环服务调用）。
 * 数据落在 SocialMate-Data/Profile/，该目录已被 .gitignore 排除，不入公开仓库。
 * 只接受用户显式确认后的结构化快照；不读取、不写入任何密钥。
 *
 * 会话复盘确认写入拆成两步（便于与正式人物主档做事务/补偿）：
 *   planProfileCandidates()  只计算、不落盘；
 *   commitProfilePlan()      真正原子写盘。
 *
 * 安全约束：
 * - 只追加，不覆盖：已存在的话题/人物备注永不改写。
 * - 按 sessionId + 段号 + 文本指纹去重，重复确认不会产生第二份。
 * - 人物归属必须由用户显式选择已存在的稳定 peopleSlug；不接受“凭显示名猜人物”。
 * - 段号必须能在归档会话里找到（由调用方传入 validSegmentIndexes），客户端传参不可自证。
 * - 来源记录保存在 `sources`，用于去重与回溯，不进入公开仓库。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "Profile");

const LIMITS = {stories: 200, people: 200, text: 2000, tags: 12, notes: 50, sources: 500};
const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;

function dataRoot() {
  return process.env.SM_PROFILE_DIR || DEFAULT_ROOT;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function text(value, max = LIMITS.text) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return list.map((tag) => text(tag, 40).trim()).filter(Boolean).slice(0, LIMITS.tags);
}

function normalizeStory(story, index) {
  return {
    id: text(story?.id, 80) || `story-${index + 1}`,
    title: text(story?.title, 200),
    cat: text(story?.cat, 60) || "生活",
    tags: normalizeTags(story?.tags),
    cn: text(story?.cn),
    en: text(story?.en),
  };
}

function normalizePerson(person, index) {
  return {
    id: text(person?.id, 80) || `person-${index + 1}`,
    name: text(person?.name, 120),
    // 正式人物主档的稳定标识；有它才可能与 People/<slug>/00-profile.md 对应。
    peopleSlug: text(person?.peopleSlug, 64),
    about: text(person?.about),
    notes: (Array.isArray(person?.notes) ? person.notes : [])
      .map((note) => text(note, 500).trim())
      .filter(Boolean)
      .slice(0, LIMITS.notes),
  };
}

/** 来源记录：谁（哪轮会话哪一段）产生了哪条档案内容，用于去重与回溯。 */
function normalizeSource(source) {
  return {
    key: text(source?.key, 80),
    sessionId: text(source?.sessionId, 64),
    kind: source?.kind === "person" ? "person" : "self",
    segmentIndex: Number.isFinite(Number(source?.segmentIndex)) ? Number(source.segmentIndex) : null,
    target: text(source?.target, 120),
    peopleSlug: text(source?.peopleSlug, 64),
    section: text(source?.section, 40),
    text: text(source?.text, 300),
    // 用户把候选改写后保存时，这里保留模型/规则的原始候选文本，便于回溯“改了什么”。
    original: text(source?.original, 300),
    addedAt: text(source?.addedAt, 40),
  };
}

/** 只保留已知字段，避免把浏览器里的主题/设置/未知内容带进档案。 */
export function normalizeProfile(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("档案必须是对象");
  }
  const stories = (Array.isArray(input.stories) ? input.stories : []).slice(0, LIMITS.stories);
  const people = (Array.isArray(input.people) ? input.people : []).slice(0, LIMITS.people);
  const sources = (Array.isArray(input.sources) ? input.sources : []).slice(-LIMITS.sources);
  const updatedAt = new Date().toISOString();
  return {
    schema: 1,
    source: "v1.2-ui",
    confirmedByUser: true,
    updatedAt,
    stories: stories.map(normalizeStory),
    people: people.map(normalizePerson),
    sources: sources.map(normalizeSource).filter((item) => item.key && item.sessionId),
  };
}

function renderMarkdown(profile) {
  const lines = [
    "# SocialMate 本机档案",
    "",
    `> 由用户在界面显式确认后写入；更新时间 ${profile.updatedAt}。`,
    "> 本文件位于本机私有数据目录，不进入公开仓库。",
    "",
    `## 我的话题（${profile.stories.length}）`,
    "",
  ];
  for (const story of profile.stories) {
    lines.push(`### ${story.title || "(未命名)"}`, "");
    if (story.tags.length) lines.push(`标签：${story.tags.join("、")}`, "");
    if (story.cn) lines.push(`中文事实：${story.cn}`, "");
    if (story.en) lines.push(`English: ${story.en}`, "");
  }
  lines.push(`## 人物（${profile.people.length}）`, "");
  for (const person of profile.people) {
    lines.push(`### ${person.name || "(未命名)"}`, "");
    if (person.peopleSlug) lines.push(`人物主档：People/${person.peopleSlug}/00-profile.md`, "");
    if (person.about) lines.push(person.about, "");
    for (const note of person.notes) lines.push(`- ${note}`);
    lines.push("");
  }
  const sources = Array.isArray(profile.sources) ? profile.sources : [];
  if (sources.length) {
    lines.push(`## 来源记录（${sources.length}）`, "",
      "> 每条记录指向产生它的会话原文段号；用于去重与回溯，内容本身仍以上面正文为准。", "");
    for (const item of sources) {
      const where = item.kind === "person" ? `人物 ${item.peopleSlug || item.target}` : "我的话题";
      lines.push(`- ${item.addedAt || "(时间未知)"} · 会话 ${item.sessionId} · 段 ${item.segmentIndex ?? "—"} · ${where} → ${item.target}`);
      if (item.original) lines.push(`  - 原始候选：${item.original}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function chmodQuiet(target, mode) {
  try {
    await fs.chmod(target, mode);
  } catch {}
}

/** 私有目录 0700、文件 0600：收紧历史遗留的 0644 文件。 */
async function ensurePrivate(target, mode) {
  await chmodQuiet(target, mode);
}

export async function readProfile() {
  try {
    const raw = await fs.readFile(path.join(dataRoot(), "current.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    // ENOENT：还没写过档案；ENOTDIR：档案目录缺失或被占位。两者都等价于“当前没有档案”。
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

export async function writeProfile(input) {
  const profile = normalizeProfile(input);
  const root = dataRoot();
  await fs.mkdir(root, {recursive: true, mode: 0o700});
  await ensurePrivate(root, 0o700);
  const jsonPath = path.join(root, "current.json");
  const tempPath = path.join(root, `.current.json.${process.pid}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(profile, null, 2), {encoding: "utf8", mode: 0o600});
  await ensurePrivate(tempPath, 0o600);
  await fs.rename(tempPath, jsonPath);
  await ensurePrivate(jsonPath, 0o600);
  // current.md 此前是 0644（umask 默认），与 current.json 的 0600 不一致：统一收紧到 0600。
  const mdPath = path.join(root, "current.md");
  await fs.writeFile(mdPath, renderMarkdown(profile), {encoding: "utf8", mode: 0o600});
  await ensurePrivate(mdPath, 0o600);
  return profile;
}

/** 已有档案的权限收紧（不改正文）。用于启动/巡检时修正历史 0644 文件。 */
export async function tightenPermissions() {
  const root = dataRoot();
  const result = {root, changed: []};
  try {
    await ensurePrivate(root, 0o700);
    for (const name of ["current.json", "current.md"]) {
      const file = path.join(root, name);
      try {
        const before = (await fs.stat(file)).mode & 0o777;
        await ensurePrivate(file, 0o600);
        const after = (await fs.stat(file)).mode & 0o777;
        if (before !== after) result.changed.push({file: name, from: before.toString(8), to: after.toString(8)});
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return result;
}

export const PROFILE_PATHS = {dataRoot};

function cleanName(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
}

function fingerprint(sessionId, kind, segmentIndex, text) {
  return crypto.createHash("sha1")
    .update(`${sessionId}|${kind}|${segmentIndex ?? "x"}|${String(text).toLowerCase().replace(/\s+/g, " ")}`)
    .digest("hex").slice(0, 16);
}

function shortTitle(text) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > 18 ? oneLine.slice(0, 18) + "…" : oneLine;
}

function cleanFact(value) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
}

/**
 * 计算本次确认要写入的内容（不落盘）。
 * options.validSegmentIndexes：归档会话里真实存在的段号数组；缺省视为配置错误，直接拒绝。
 * options.knownPeople：{slug: {name}} 真实存在的人物主档；人物候选必须命中其中之一。
 */
export async function planProfileCandidates(input, options = {}) {
  if (!input || input.confirm !== true) {
    throw fail(400, "CONFIRM_REQUIRED", "写入档案需要用户显式确认（confirm:true）");
  }
  const sessionId = String(input.sessionId || "");
  if (!SESSION_ID.test(sessionId)) throw fail(400, "INVALID_SESSION_ID", "sessionId 格式不合法");
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw fail(400, "NO_ITEMS", "没有勾选任何候选");
  if (items.length > LIMITS.stories) throw fail(400, "TOO_MANY_ITEMS", "一次提交的候选过多");

  if (!Array.isArray(options.validSegmentIndexes)) {
    throw fail(500, "SEGMENT_VALIDATION_REQUIRED", "服务端必须先用归档会话校验段号，再写入档案");
  }
  const validIndexes = new Set(options.validSegmentIndexes.map(Number));
  const knownPeople = options.knownPeople && typeof options.knownPeople === "object" ? options.knownPeople : {};
  const confirmedAt = new Date().toISOString();

  const base = (await readProfile()) || {stories: [], people: [], sources: []};
  const stories = (Array.isArray(base.stories) ? base.stories : []).map((s) => ({...s, tags: [...(s.tags || [])]}));
  const people = (Array.isArray(base.people) ? base.people : []).map((p) => ({...p, notes: [...(p.notes || [])]}));
  const sources = (Array.isArray(base.sources) ? base.sources : []).map((s) => ({...s}));
  const seenKeys = new Set(sources.map((s) => s.key));

  const added = {stories: 0, notes: 0, people: 0};
  const skipped = [];
  /** 需要同步到正式人物主档的事实（只含已被用户显式归属到真实 slug 的条目）。 */
  const peopleFacts = [];

  for (const raw of items) {
    const kind = raw?.kind === "person" ? "person" : raw?.kind === "self" ? "self" : null;
    const factText = cleanFact(raw?.text);
    const segmentIndex = Number.isFinite(Number(raw?.segmentIndex)) ? Number(raw.segmentIndex) : null;
    const originalText = cleanFact(raw?.originalText);
    if (!kind) { skipped.push({text: factText, reason: "UNKNOWN_KIND"}); continue; }
    if (factText.length < 2) { skipped.push({text: factText, reason: "EMPTY_TEXT"}); continue; }
    if (segmentIndex === null || !validIndexes.has(segmentIndex)) {
      // 段号必须能在归档原文里找到，否则这条事实没有可追溯来源，一律不收。
      skipped.push({text: factText, reason: "SEGMENT_NOT_FOUND", segmentIndex});
      continue;
    }
    const key = fingerprint(sessionId, kind, segmentIndex, factText);
    if (seenKeys.has(key)) { skipped.push({text: factText, reason: "DUPLICATE"}); continue; }

    if (kind === "self") {
      if (stories.length >= LIMITS.stories) { skipped.push({text: factText, reason: "STORY_LIMIT"}); continue; }
      if (stories.some((s) => String(s.cn || "").replace(/\s+/g, " ").trim() === factText)) {
        skipped.push({text: factText, reason: "DUPLICATE"}); continue;
      }
      const id = `st-${key.slice(0, 10)}`;
      stories.push({
        id,
        title: shortTitle(raw?.title || factText),
        cat: "会话复盘",
        tags: [],
        cn: factText,
        en: typeof raw?.en === "string" ? raw.en.trim().slice(0, LIMITS.text) : "",
      });
      added.stories += 1;
      sources.push({key, sessionId, kind, segmentIndex, target: `story:${id}`, text: factText,
        original: originalText && originalText !== factText ? originalText : "", addedAt: confirmedAt});
      seenKeys.add(key);
      continue;
    }

    // 人物事实：身份只能由用户从真实人物主档里显式选择，不能靠显示名猜测。
    const slug = String(raw?.peopleSlug || "").trim();
    if (!slug) { skipped.push({text: factText, reason: "PERSON_NOT_SELECTED"}); continue; }
    if (!Object.prototype.hasOwnProperty.call(knownPeople, slug)) {
      skipped.push({text: factText, reason: "UNKNOWN_PERSON", peopleSlug: slug}); continue;
    }
    let person = people.find((p) => String(p.peopleSlug || "").toLowerCase() === slug.toLowerCase());
    if (!person) {
      if (people.length >= LIMITS.people) { skipped.push({text: factText, reason: "PEOPLE_LIMIT"}); continue; }
      person = {id: `pp-${key.slice(0, 10)}`, name: cleanName(knownPeople[slug].name || slug),
        peopleSlug: slug, about: "", notes: []};
      people.push(person);
      added.people += 1;
    }
    if (person.notes.length >= LIMITS.notes) { skipped.push({text: factText, reason: "NOTE_LIMIT"}); continue; }
    if (person.notes.some((note) => String(note).replace(/\s+/g, " ").trim() === factText)) {
      skipped.push({text: factText, reason: "DUPLICATE"}); continue;
    }
    const section = typeof raw?.section === "string" ? raw.section.trim().slice(0, 40) : "";
    person.notes.push(factText);
    added.notes += 1;
    sources.push({key, sessionId, kind, segmentIndex, target: `person:${person.id}`, peopleSlug: slug,
      section, text: factText, original: originalText && originalText !== factText ? originalText : "",
      addedAt: confirmedAt});
    seenKeys.add(key);
    peopleFacts.push({slug, section, text: factText, sessionId, segmentIndex, confirmedAt,
      editedFrom: originalText && originalText !== factText ? originalText : ""});
  }

  return {sessionId, confirmedAt, base, stories, people, sources, added, skipped, peopleFacts,
    changed: Boolean(added.stories || added.notes)};
}

/** 把 plan 落盘（原子替换 + 0600）。 */
export async function commitProfilePlan(plan) {
  if (!plan || !plan.changed) {
    return {ok: true, added: plan?.added || {stories: 0, notes: 0, people: 0}, skipped: plan?.skipped || [],
      unchanged: true, updatedAt: plan?.base?.updatedAt || null};
  }
  const profile = await writeProfile({stories: plan.stories, people: plan.people, sources: plan.sources});
  return {ok: true, added: plan.added, skipped: plan.skipped, sources: profile.sources.length,
    updatedAt: profile.updatedAt, stories: profile.stories.length, people: profile.people.length};
}

/**
 * 兼容入口：单模块（不涉及 People 同步）时的直接应用。
 * 正式接口请走 review-confirm.mjs（含人物主档事务与回滚）。
 */
export async function applyProfileCandidates(input, options = {}) {
  const plan = await planProfileCandidates(input, options);
  const result = await commitProfilePlan(plan);
  return {...result, peopleFacts: plan.peopleFacts};
}
