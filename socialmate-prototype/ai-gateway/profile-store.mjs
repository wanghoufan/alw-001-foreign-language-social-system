/**
 * 本机档案持久化存储（仅本机回环服务调用）。
 * 数据落在 SocialMate-Data/Profile/，该目录已被 .gitignore 排除，不入公开仓库。
 * 只接受用户显式确认后的结构化快照；不读取、不写入任何密钥。
 *
 * 会话复盘确认写入（applyProfileCandidates）额外约束：
 * - 只追加，不覆盖：已存在的话题/人物备注永不改写。
 * - 按 sessionId + 段号 + 文本指纹去重，重复确认不会产生第二份。
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
    text: text(source?.text, 300),
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
    if (person.about) lines.push(person.about, "");
    for (const note of person.notes) lines.push(`- ${note}`);
    lines.push("");
  }
  const sources = Array.isArray(profile.sources) ? profile.sources : [];
  if (sources.length) {
    lines.push(`## 来源记录（${sources.length}）`, "",
      "> 每条记录指向产生它的会话原文段号；用于去重与回溯，内容本身仍以上面正文为准。", "");
    for (const item of sources) {
      lines.push(`- ${item.addedAt || "(时间未知)"} · 会话 ${item.sessionId} · 段 ${item.segmentIndex ?? "—"} · ${item.kind === "person" ? "人物" : "我的话题"} → ${item.target}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function readProfile() {
  try {
    const raw = await fs.readFile(path.join(dataRoot(), "current.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function writeProfile(input) {
  const profile = normalizeProfile(input);
  const root = dataRoot();
  await fs.mkdir(root, {recursive: true});
  const jsonPath = path.join(root, "current.json");
  const tempPath = path.join(root, `.current.json.${process.pid}.tmp`);
  await fs.writeFile(tempPath, JSON.stringify(profile, null, 2), {encoding: "utf8", mode: 0o600});
  await fs.rename(tempPath, jsonPath);
  await fs.writeFile(path.join(root, "current.md"), renderMarkdown(profile), "utf8");
  return profile;
}

export const PROFILE_PATHS = {dataRoot};

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

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

/**
 * 用户勾选并显式确认后，把复盘候选合并进本机档案。
 * 只追加；重复确认按 sourceKey 去重；任何一条不合格都不会中断其余条目。
 */
export async function applyProfileCandidates(input) {
  if (!input || input.confirm !== true) {
    throw fail(400, "CONFIRM_REQUIRED", "写入档案需要用户显式确认（confirm:true）");
  }
  const sessionId = String(input.sessionId || "");
  if (!SESSION_ID.test(sessionId)) throw fail(400, "INVALID_SESSION_ID", "sessionId 格式不合法");
  const items = Array.isArray(input.items) ? input.items : [];
  if (!items.length) throw fail(400, "NO_ITEMS", "没有勾选任何候选");
  if (items.length > LIMITS.stories) throw fail(400, "TOO_MANY_ITEMS", "一次提交的候选过多");

  const existing = await readProfile();
  const base = existing && typeof existing === "object" ? existing : {stories: [], people: [], sources: []};
  const stories = (Array.isArray(base.stories) ? base.stories : [])
    .map((s) => ({...s, tags: [...(s.tags || [])]}));
  const people = (Array.isArray(base.people) ? base.people : [])
    .map((p) => ({...p, notes: [...(p.notes || [])]}));
  const sources = (Array.isArray(base.sources) ? base.sources : []).map((s) => ({...s}));
  const seenKeys = new Set(sources.map((s) => s.key));

  const added = {stories: 0, notes: 0, people: 0};
  const skipped = [];

  for (const raw of items) {
    const kind = raw?.kind === "person" ? "person" : raw?.kind === "self" ? "self" : null;
    const text = String(raw?.text || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
    const segmentIndex = Number.isFinite(Number(raw?.segmentIndex)) ? Number(raw.segmentIndex) : null;
    if (!kind) { skipped.push({text, reason: "UNKNOWN_KIND"}); continue; }
    if (text.length < 2) { skipped.push({text, reason: "EMPTY_TEXT"}); continue; }
    const key = fingerprint(sessionId, kind, segmentIndex, text);
    if (seenKeys.has(key)) { skipped.push({text, reason: "DUPLICATE"}); continue; }

    if (kind === "self") {
      if (stories.length >= LIMITS.stories) { skipped.push({text, reason: "STORY_LIMIT"}); continue; }
      if (stories.some((s) => String(s.cn || "").replace(/\s+/g, " ").trim() === text)) {
        skipped.push({text, reason: "DUPLICATE"}); continue;
      }
      const id = `st-${key.slice(0, 10)}`;
      stories.push({
        id,
        title: shortTitle(raw?.title || text),
        cat: "会话复盘",
        tags: [],
        cn: text,
        en: typeof raw?.en === "string" ? raw.en.trim().slice(0, LIMITS.text) : "",
      });
      added.stories += 1;
      sources.push({key, sessionId, kind, segmentIndex, target: `story:${id}`, text, addedAt: new Date().toISOString()});
      seenKeys.add(key);
      continue;
    }

    const name = cleanName(raw?.name);
    if (!name) { skipped.push({text, reason: "NAME_REQUIRED"}); continue; }
    let person = people.find((p) => String(p.name || "").toLowerCase() === name.toLowerCase());
    if (!person) {
      if (people.length >= LIMITS.people) { skipped.push({text, reason: "PEOPLE_LIMIT"}); continue; }
      person = {id: `pp-${key.slice(0, 10)}`, name, about: "", notes: []};
      people.push(person);
      added.people += 1;
    }
    if (person.notes.length >= LIMITS.notes) { skipped.push({text, reason: "NOTE_LIMIT"}); continue; }
    if (person.notes.some((note) => String(note).replace(/\s+/g, " ").trim() === text)) {
      skipped.push({text, reason: "DUPLICATE"}); continue;
    }
    person.notes.push(text);
    added.notes += 1;
    sources.push({key, sessionId, kind, segmentIndex, target: `person:${person.id}`, text, addedAt: new Date().toISOString()});
    seenKeys.add(key);
  }

  if (!added.stories && !added.notes) {
    return {ok: true, added, skipped, sources: sources.length, updatedAt: base.updatedAt || null, unchanged: true};
  }
  const profile = await writeProfile({stories, people, sources});
  return {ok: true, added, skipped, sources: profile.sources.length,
    updatedAt: profile.updatedAt, stories: profile.stories.length, people: profile.people.length};
}
