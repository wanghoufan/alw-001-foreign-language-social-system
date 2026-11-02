/**
 * 正式人物主档（People/<slug>/00-profile.md）的安全写入。
 *
 * 边界（对应 N02 P1 与 SocialMate-Data/00-README.md）：
 * - 只有用户在复盘页显式勾选、并把事实归属到**某个已存在的稳定 slug** 时才写；不新建人物目录、不合并人物。
 * - 只追加到目标语义章节末尾，不改 front matter、不改人工写的段落、不重排既有内容。
 * - 每条写入带来源（会话 ID + 段号 + 确认时间）与不可见的幂等标记，重复保存不产生第二条。
 * - 原子替换 + 写前备份 + 写后自检；自检失败用备份回滚，绝不留下半截文件。
 * - 文件 0600、目录 0700；不复制录音原文，只存用户确认后的事实文本与来源引用。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "People");

/** slug 只允许字母数字开头，避免 `..`、隐藏目录与绝对路径。 */
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MARKER = /<!--\s*sm-src:([A-Za-z0-9]{6,32})\s*-->/g;
const MAX_TEXT = 300;
const BACKUP_KEEP = 10;

const SLUG_RESERVED = new Set(["_template"]);
const SLUG_MAX = 48;

/** 允许写入的语义章节：内部 key → 模板里的二级标题（`# 兴趣` 这种一级标题）。 */
export const SECTIONS = {
  basic: "基本情况",
  interest: "兴趣",
  hainan: "海南生活",
  work: "工作 / 学习",
  common: "共同点",
  plan: "对方近期计划",
  preference: "已确认偏好",
  avoid: "不宜重复询问",
  topics: "后续可以继续的话题",
};
const DEFAULT_SECTION = "preference";

export function peopleRoot() {
  return process.env.SM_PEOPLE_DIR || DEFAULT_ROOT;
}

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

export function assertSlug(slug) {
  const value = String(slug || "");
  if (!SLUG.test(value) || value.includes("..")) {
    throw fail(400, "INVALID_PERSON_SLUG", "人物标识不合法");
  }
  return value;
}

/**
 * 显示名 → 建议 slug 的纯规则转换（P1-02）。只做字符转换，绝不据此推断人物身份：
 * - 拉丁字母名：去重音后转小写 ASCII，非字母数字折叠成单个连字符；
 * - 中文/其它不受支持字符：无含义短 ID `person-YYYYMMDD-<4位hex>`；
 * - 重名不覆盖，改为在末尾追加 -2/-3 作为可用替代。
 * 本函数只读文件系统判断占用，**不会创建任何目录或文件**；创建仍必须走显式 POST + confirm。
 */
function latinBase(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/, "");
}

async function slugTaken(root, slug) {
  if (SLUG_RESERVED.has(slug) || !SLUG.test(slug) || slug.includes("..")) return true;
  try {
    await fs.stat(path.join(root, slug));
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function utcDay(now) {
  const d = now instanceof Date ? now : new Date(now);
  const base = Number.isNaN(d.getTime()) ? new Date() : d;
  return base.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * @param {string} name 用户输入的显示名
 * @param {{root?:string, now?:Date|string, randomHex?:string}} [options]
 * @returns {Promise<{slug:string,available:boolean,alternative:string,base:string}>}
 */
export async function suggestSlug(name, options = {}) {
  const root = options.root || peopleRoot();
  const display = String(name || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!display) throw fail(400, "PERSON_NAME_REQUIRED", "请先填写姓名，再生成人物标识");

  let base = latinBase(display);
  if (!base) {
    const hex = String(options.randomHex || crypto.randomBytes(2).toString("hex"))
      .toLowerCase().replace(/[^0-9a-f]/g, "").padEnd(4, "0").slice(0, 4);
    base = `person-${utcDay(options.now || new Date())}-${hex}`;
  }
  // 候选序列：base、base-2 … base-99（仍受 SLUG 长度上限保护，超长部分截断后重试）。
  const candidates = [base];
  for (let i = 2; i <= 99; i += 1) {
    const suffix = `-${i}`;
    candidates.push(base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "") + suffix);
  }
  // 收集前两个可用候选：第一个用于判断首选是否可用，第二个用作确定可用的备选。
  const free = [];
  for (const candidate of candidates) {
    if (await slugTaken(root, candidate)) continue;
    free.push(candidate);
    if (free.length === 2) break;
  }
  const baseAvailable = free[0] === base;
  return {
    slug: base,
    available: baseAvailable,
    // 首选可用时给下一个候选（便于用户主动换一个）；首选被占用时给真正可用的那个。
    alternative: (baseAvailable ? free[1] : free[0]) || free[0] || base,
    base,
  };
}

async function safeReaddir(dir) {
  try {
    return await fs.readdir(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function frontMatterName(text) {
  const match = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return "";
  const line = match[1].split(/\r?\n/).find((l) => /^name\s*:/.test(l));
  if (!line) return "";
  return line.replace(/^name\s*:/, "").replace(/^["']|["']$/g, "").trim();
}

/** 列出真实存在的人物主档；不含模板目录。用于复盘页选择归属目标。 */
export async function listPeople() {
  const root = peopleRoot();
  const out = [];
  for (const entry of await safeReaddir(root)) {
    if (!entry.isDirectory() || entry.name === "_template" || entry.name.startsWith(".")) continue;
    const file = path.join(root, entry.name, "00-profile.md");
    let text = "";
    try {
      text = await fs.readFile(file, "utf8");
    } catch {
      continue; // 没有主档的目录不算候选，避免写到错误位置
    }
    out.push({slug: entry.name, name: frontMatterName(text) || entry.name, hasProfile: true});
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}

const FALLBACK_TEMPLATE = [
  "---", "name:", "country:", "city:", "languages: []", "status_in_hainan:", "occupation:",
  "relationship_stage: new_contact", "first_met:", "last_contact:", "contact_channels: []", "tags: []",
  "---", "", "# 基本情况", "", "# 兴趣", "", "# 海南生活", "", "# 工作 / 学习", "",
  "# 共同点", "", "# 对方近期计划", "", "# 已确认偏好", "", "# 不宜重复询问", "", "# 后续可以继续的话题", "",
].join("\n");

/** front matter 里的名字必须是单行安全值：去掉控制字符，含特殊符号时加引号。 */
function yamlSafeName(value) {
  const oneLine = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!oneLine) return "";
  return /[:#\[\]{}&*!|>'"%@`]/.test(oneLine)
    ? `"${oneLine.replace(/"/g, "'")}"`
    : oneLine;
}

/**
 * 用户显式点「新建人物」时，用 `_template/00-profile.md` 生成一份正式主档。
 * 只建目录与模板文件，不写任何事实；已存在则原样返回，绝不覆盖。
 */
export async function createPersonFile({slug, name, root = peopleRoot()}) {
  const safeSlug = assertSlug(slug);
  const safeName = yamlSafeName(name);
  if (!safeName) throw fail(400, "PERSON_NAME_REQUIRED", "新建人物需要填写姓名");

  const dir = path.join(root, safeSlug);
  const file = path.join(dir, "00-profile.md");
  try {
    await fs.stat(file);
    return {slug: safeSlug, created: false, existing: true, file: path.relative(root, file)};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let template;
  try {
    template = await fs.readFile(path.join(root, "_template", "00-profile.md"), "utf8");
  } catch {
    template = FALLBACK_TEMPLATE;
  }
  const body = /^name\s*:/m.test(template)
    ? template.replace(/^name\s*:.*$/m, `name: ${safeName}`)
    : template.replace(/^---\r?\n/, `---\nname: ${safeName}\n`);

  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  // 新建主档也走「临时文件 → 原子替换」，避免留下半截文件。
  const temp = path.join(dir, `.00-profile.${process.pid}.tmp`);
  await fs.writeFile(temp, body, {encoding: "utf8", mode: 0o600});
  await chmodQuiet(temp, 0o600);
  await fs.rename(temp, file);
  await chmodQuiet(file, 0o600);
  return {slug: safeSlug, created: true, file: path.relative(root, file)};
}

/** 回滚用：删除本轮新建、且仍只有模板内容（无 sm-src 标记）的人物主档。 */
export async function removeEmptyPersonFile(slug, root = peopleRoot()) {
  const safeSlug = assertSlug(slug);
  const dir = path.join(root, safeSlug);
  const file = path.join(dir, "00-profile.md");
  try {
    const text = await fs.readFile(file, "utf8");
    if (text.includes("sm-src:")) return {slug: safeSlug, removed: false};
  } catch {
    return {slug: safeSlug, removed: false};
  }
  await fs.rm(dir, {recursive: true, force: true});
  return {slug: safeSlug, removed: true};
}

/** 解析 Markdown：保留 front matter 原样，记录每个 `# 标题` 的行区间。 */function parseMarkdown(text) {
  const lines = String(text).split("\n");
  let bodyStart = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) bodyStart = end + 1;
  }
  const headings = [];
  for (let i = bodyStart; i < lines.length; i += 1) {
    const match = lines[i].match(/^#\s+(.+?)\s*$/);
    if (match) headings.push({title: match[1].trim(), index: i});
  }
  return {lines, headings, bodyStart};
}

function sectionRange(parsed, title) {
  const at = parsed.headings.findIndex((h) => h.title === title);
  if (at < 0) return null;
  const start = parsed.headings[at].index;
  const nextHeading = parsed.headings.find((h) => h.index > start);
  const end = nextHeading ? nextHeading.index : parsed.lines.length;
  return {start, end};
}

function usedKeys(text) {
  const keys = new Set();
  for (const match of String(text).matchAll(MARKER)) keys.add(match[1]);
  return keys;
}

export function sourceKey(sessionId, segmentIndex, factText) {
  return crypto.createHash("sha1")
    .update(`${sessionId}|${segmentIndex ?? "x"}|${String(factText).toLowerCase().replace(/\s+/g, " ")}`)
    .digest("hex").slice(0, 16);
}

function stamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 16).replace("T", " ");
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * 把一条事实插进指定章节末尾。返回新的行数组。
 * 章节不存在时在文末新建同名标题（保留模板/人工结构，不动其它章节）。
 */
function insertFact(lines, headings, sectionTitle, bullet) {
  const parsed = {lines, headings};
  const range = sectionRange(parsed, sectionTitle);
  if (!range) {
    const tail = lines.length && lines[lines.length - 1] === "" ? lines.slice(0, -1) : [...lines];
    return [...tail, "", `# ${sectionTitle}`, "", bullet, ""];
  }
  // 章节末尾：跳过结尾空行，把 bullet 追加在最后一条内容之后。
  let insertAt = range.end;
  while (insertAt > range.start + 1 && lines[insertAt - 1].trim() === "") insertAt -= 1;
  const prev = insertAt > 0 ? lines[insertAt - 1] : "";
  // 上一行不是列表项时补一个空行，避免新条目被渲染成上一段正文的一部分。
  const needsBlank = prev.trim() !== "" && !/^\s*([-*+]|\d+\.)\s/.test(prev) && !/^#/.test(prev);
  const next = [...lines];
  next.splice(insertAt, 0, ...(needsBlank ? ["", bullet] : [bullet]));
  return next;
}

async function chmodQuiet(target, mode) {
  try {
    await fs.chmod(target, mode);
  } catch {}
}

async function backupFile(file) {
  const dir = path.join(path.dirname(file), ".sm-backup");
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const name = `00-profile.${new Date().toISOString().replace(/[:.]/g, "-")}.md.bak`;
  const dest = path.join(dir, name);
  await fs.copyFile(file, dest);
  await chmodQuiet(dest, 0o600);
  // 只保留最近 N 份，避免无限增长。
  const entries = (await safeReaddir(dir)).filter((e) => e.isFile() && e.name.endsWith(".bak"))
    .map((e) => e.name).sort();
  for (const old of entries.slice(0, Math.max(0, entries.length - BACKUP_KEEP))) {
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
      if (Date.now() > deadline) throw fail(409, "PEOPLE_WRITE_BUSY", "同一人物主档正在被另一个写入操作占用，请稍后重试");
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
  }
  try {
    return await fn();
  } finally {
    await fs.rm(lockPath, {force: true});
  }
}

/**
 * 追加事实到 People/<slug>/00-profile.md。
 * facts: [{slug, section, text, sessionId, segmentIndex, confirmedAt, editedFrom}]
 * root 仅供演示命名空间（Demo/People）复用同一条写入链路，默认仍是真实主档。
 * 返回 {added:[{slug,section}], skipped:[{reason}], files:[...]}
 */
export async function appendPeopleFacts(facts, {root = peopleRoot()} = {}) {
  const list = Array.isArray(facts) ? facts : [];
  const added = [];
  const skipped = [];
  const files = new Set();

  for (const fact of list) {
    let slug;
    try {
      slug = assertSlug(fact?.slug);
    } catch {
      skipped.push({reason: "INVALID_PERSON_SLUG", slug: String(fact?.slug || "")});
      continue;
    }
    const clean = String(fact?.text || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (clean.length < 2) {
      skipped.push({reason: "EMPTY_TEXT", slug});
      continue;
    }
    const sectionKey = Object.prototype.hasOwnProperty.call(SECTIONS, fact?.section) ? fact.section : DEFAULT_SECTION;
    const sectionTitle = SECTIONS[sectionKey];
    const file = path.join(root, slug, "00-profile.md");
    let original;
    try {
      original = await fs.readFile(file, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        skipped.push({reason: "PEOPLE_FILE_MISSING", slug});
        continue;
      }
      throw error;
    }

    const key = sourceKey(fact.sessionId, fact.segmentIndex, clean);
    if (usedKeys(original).has(key)) {
      skipped.push({reason: "DUPLICATE", slug});
      continue;
    }

    const source = `（来源：会话 ${String(fact.sessionId || "").slice(0, 64)} · 段 ${Number.isFinite(Number(fact.segmentIndex)) ? Number(fact.segmentIndex) + 1 : "—"} · ${stamp(fact.confirmedAt)} 用户确认）`;
    const edited = typeof fact.editedFrom === "string" && fact.editedFrom.trim() && fact.editedFrom.trim() !== clean
      ? "（已按用户修改保存，原始候选见本机档案来源记录）" : "";
    const bullet = `- ${clean}${source}${edited}<!--sm-src:${key}-->`;

    await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
    const lockPath = path.join(path.dirname(file), ".sm-write.lock");

    await withLock(lockPath, async () => {
      const current = await fs.readFile(file, "utf8");
      if (usedKeys(current).has(key)) {
        skipped.push({reason: "DUPLICATE", slug});
        return;
      }
      const parsed = parseMarkdown(current);
      const lines = insertFact(parsed.lines, parsed.headings, sectionTitle, bullet);
      const body = lines.join("\n");
      const backup = await backupFile(file);
      const temp = path.join(path.dirname(file), `.00-profile.${process.pid}.tmp`);
      await fs.writeFile(temp, body, {encoding: "utf8", mode: 0o600});
      await chmodQuiet(temp, 0o600);
      try {
        await fs.rename(temp, file);
      } catch (error) {
        await fs.rm(temp, {force: true});
        throw error;
      }
      await chmodQuiet(file, 0o600);
      await chmodQuiet(path.dirname(file), 0o700);
      const verify = await fs.readFile(file, "utf8");
      if (!verify.includes(`sm-src:${key}`)) {
        // 自检失败：用备份回滚，不允许出现“看起来成功但内容没写进去”。
        await fs.copyFile(backup, file);
        throw fail(500, "PEOPLE_WRITE_UNVERIFIED", "人物主档写入后自检失败，已用备份回滚");
      }
      added.push({slug, section: sectionKey, file: path.relative(root, file),
        backup: path.relative(root, backup), key});
      files.add(file);
    });
  }

  return {added, skipped, files: [...files].map((f) => path.relative(root, f))};
}

export const PEOPLE_PATHS = {root: peopleRoot};
export const PEOPLE_SECTIONS = SECTIONS;
