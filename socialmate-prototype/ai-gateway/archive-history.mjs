/**
 * 归档历史索引（只读）。
 *
 * 职责边界：
 * - 只读取 conversation-archive.mjs 写出的 JSON（权威记录）；Markdown 视为派生视图。
 * - 只返回元数据用于列表，完整原文仅在按 sessionId 读取时返回。
 * - 日期过滤使用 UTC 日期（与归档目录 YYYY/MM 及文件名日期一致），避免本地时区造成跨日错配。
 * - 不接受调用方传入路径片段；sessionId 必须通过 SESSION_ID 校验后才拼路径。
 */
import fs from "node:fs/promises";
import path from "node:path";
import {defaultRoot, renderMarkdown} from "./conversation-archive.mjs";
import {readProfile} from "./profile-store.mjs";

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function safeReaddir(dir) {
  try {
    return await fs.readdir(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

/** 收集 root/YYYY/MM/*.json 的绝对路径，按日期目录顺序返回。 */
export async function collectJsonFiles(root = defaultRoot()) {
  const out = [];
  for (const year of await safeReaddir(root)) {
    if (!year.isDirectory() || !/^\d{4}$/.test(year.name)) continue;
    const yearDir = path.join(root, year.name);
    for (const month of await safeReaddir(yearDir)) {
      if (!month.isDirectory() || !/^\d{2}$/.test(month.name)) continue;
      const monthDir = path.join(yearDir, month.name);
      for (const file of await safeReaddir(monthDir)) {
        if (file.isFile() && file.name.endsWith(".json")) out.push(path.join(monthDir, file.name));
      }
    }
  }
  return out.sort();
}

async function readRecord(file) {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    const session = raw?.session;
    if (!session || !SESSION_ID.test(String(session.sessionId || ""))) return null;
    return {raw, session, file};
  } catch {
    // 单份损坏不应让整份历史列表失败；跳过并在日志里由调用方统计。
    return null;
  }
}

function summarize({raw, session, file}) {
  const speakers = new Set(session.segments.map((s) => s.speakerId));
  const durationMs = Math.max(0, Date.parse(session.endedAt) - Date.parse(session.startedAt));
  return {
    sessionId: session.sessionId,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    day: utcDay(session.startedAt),
    durationMs,
    segmentCount: session.segments.length,
    speakers: [...speakers].sort(),
    hasAi: Boolean(session.ai?.text),
    aiProvider: session.ai?.provider || null,
    revision: session.revision,
    appVersion: session.appVersion,
    consent: session.consent,
    contentHash: raw.contentHash || null,
    file: path.relative(path.dirname(path.dirname(path.dirname(file))), file),
  };
}

function inRange(day, from, to) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** 列出会话元数据（不含原文）。from/to 为 YYYY-MM-DD，闭区间，按 UTC 日期比较。 */
export async function listSessions({root = defaultRoot(), from = "", to = ""} = {}) {
  if (from && !DATE.test(from)) throw Object.assign(new Error("from 必须是 YYYY-MM-DD"), {status: 400});
  if (to && !DATE.test(to)) throw Object.assign(new Error("to 必须是 YYYY-MM-DD"), {status: 400});
  const files = await collectJsonFiles(root);
  const items = [];
  let skipped = 0;
  for (const file of files) {
    const record = await readRecord(file);
    if (!record) {
      skipped += 1;
      continue;
    }
    const item = summarize(record);
    if (inRange(item.day, from, to)) items.push(item);
  }
  items.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
  return {
    root,
    total: items.length,
    scanned: files.length,
    skipped,
    from: from || null,
    to: to || null,
    items,
  };
}

/** 按 sessionId 读取完整会话（含原文）。 */
export async function getSession(sessionId, {root = defaultRoot()} = {}) {
  if (!SESSION_ID.test(String(sessionId || ""))) {
    throw Object.assign(new Error("sessionId 格式不合法"), {status: 400});
  }
  for (const file of await collectJsonFiles(root)) {
    const record = await readRecord(file);
    // 以 JSON 内的 sessionId 为准，不依赖文件名约定。
    if (record?.session?.sessionId === sessionId) {
      return {item: summarize(record), session: record.session};
    }
  }
  return null;
}

/** 导出区间内全部会话为单份 Markdown，按时间升序拼接。 */
export async function exportSessions({root = defaultRoot(), from = "", to = ""} = {}) {
  if (from && !DATE.test(from)) throw Object.assign(new Error("from 必须是 YYYY-MM-DD"), {status: 400});
  if (to && !DATE.test(to)) throw Object.assign(new Error("to 必须是 YYYY-MM-DD"), {status: 400});
  const sessions = [];
  for (const file of await collectJsonFiles(root)) {
    const record = await readRecord(file);
    if (!record) continue;
    const day = utcDay(record.session.startedAt);
    if (!inRange(day, from, to)) continue;
    sessions.push(record.session);
  }
  sessions.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  const range = from || to ? `${from || "不限"} → ${to || "不限"}` : "全部";
  const header = [
    "# SocialMate 会话归档导出",
    "",
    `- 导出时间（UTC）：${new Date().toISOString()}`,
    `- 日期范围（UTC）：${range}`,
    `- 会话数：${sessions.length}`,
    "- 说明：以下为 ASR 原文，逐字保留，未经改写。",
    "",
    "---",
    "",
  ].join("\n");
  const body = sessions.map((s) => renderMarkdown(s)).join("\n\n---\n\n");
  return {markdown: header + body + "\n", count: sessions.length};
}

/* ------------------------------------------------------------------ *
 * 历史检索 + 分页（P1-03）
 *
 * 边界：
 * - 关键词只在服务端本机归档里匹配，不调用任何第三方服务；搜索词不写日志、不回显到错误里。
 * - person 过滤只认用户确认过的人物归属记录（Profile.sources 里 kind=person 且 peopleSlug 命中），
 *   绝不按说话人聚类 spk_* 猜人物。
 * - limit 默认 20、上限 50；cursor 是只含 startedAt + sessionId 的不透明串，非法即 400。
 * ------------------------------------------------------------------ */
export const SEARCH_LIMIT_DEFAULT = 20;
export const SEARCH_LIMIT_MAX = 50;
const KEYWORD_MAX = 100;
const EXCERPT_MAX = 160;
const EXCERPT_COUNT = 3;
const CURSOR = /^[A-Za-z0-9_-]{8,240}$/;

function encodeCursor(item) {
  return Buffer.from(`${item.startedAt}|${item.sessionId}`, "utf8").toString("base64url");
}

function decodeCursor(cursor) {
  if (!CURSOR.test(cursor)) throw Object.assign(new Error("cursor 格式不合法"), {status: 400});
  let raw;
  try {
    raw = Buffer.from(cursor, "base64url").toString("utf8");
  } catch {
    throw Object.assign(new Error("cursor 格式不合法"), {status: 400});
  }
  const at = raw.lastIndexOf("|");
  if (at <= 0) throw Object.assign(new Error("cursor 格式不合法"), {status: 400});
  return {startedAt: raw.slice(0, at), sessionId: raw.slice(at + 1)};
}

function excerpt(text, keyword) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!keyword) return value.slice(0, EXCERPT_MAX);
  const at = value.toLowerCase().indexOf(keyword);
  if (at < 0) return value.slice(0, EXCERPT_MAX);
  const from = Math.max(0, at - 40);
  return (from > 0 ? "…" : "") + value.slice(from, from + EXCERPT_MAX);
}

/**
 * 会话检索（服务端本地规则，0 次外部请求）。
 * @param {{root?:string, q?:string, person?:string, from?:string, to?:string, limit?:number, cursor?:string, profile?:object}} options
 */
export async function searchSessions(options = {}) {
  const root = options.root || defaultRoot();
  const from = String(options.from || "");
  const to = String(options.to || "");
  if (from && !DATE.test(from)) throw Object.assign(new Error("from 必须是 YYYY-MM-DD"), {status: 400});
  if (to && !DATE.test(to)) throw Object.assign(new Error("to 必须是 YYYY-MM-DD"), {status: 400});

  const rawKeyword = String(options.q || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  const keyword = rawKeyword.slice(0, KEYWORD_MAX).toLowerCase();
  const person = String(options.person || "").trim();
  if (person && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(person)) {
    throw Object.assign(new Error("person 必须是已确认的人物标识"), {status: 400});
  }
  const rawLimit = options.limit === undefined || options.limit === null || options.limit === ""
    ? SEARCH_LIMIT_DEFAULT : Number(options.limit);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(SEARCH_LIMIT_MAX, Math.max(1, Math.trunc(rawLimit)))
    : SEARCH_LIMIT_DEFAULT;
  const cursor = options.cursor ? decodeCursor(String(options.cursor)) : null;

  // 人物归属只来自用户确认记录；没有 Profile 时 person 过滤必然为空。
  const profile = options.profile !== undefined ? options.profile : await readProfile().catch(() => null);
  const names = new Map();
  for (const entry of Array.isArray(profile?.people) ? profile.people : []) {
    if (entry?.peopleSlug) names.set(String(entry.peopleSlug), String(entry.name || entry.peopleSlug));
  }
  const attribution = new Map();
  for (const source of Array.isArray(profile?.sources) ? profile.sources : []) {
    if (source?.kind !== "person") continue;
    const slug = String(source.peopleSlug || "");
    const sessionId = String(source.sessionId || "");
    if (!slug || !sessionId) continue;
    if (!attribution.has(sessionId)) attribution.set(sessionId, new Set());
    attribution.get(sessionId).add(slug);
  }

  const files = await collectJsonFiles(root);
  const matched = [];
  let skipped = 0;
  for (const file of files) {
    const record = await readRecord(file);
    if (!record) {
      skipped += 1;
      continue;
    }
    const summary = summarize(record);
    if (!inRange(summary.day, from, to)) continue;

    const people = [...(attribution.get(summary.sessionId) || [])]
      .sort()
      .map((slug) => ({slug, name: names.get(slug) || slug}));
    if (person) {
      if (!people.some((entry) => entry.slug === person)) continue;
    }

    const segments = record.session.segments;
    const hits = [];
    if (keyword) {
      for (let index = 0; index < segments.length; index += 1) {
        const text = String(segments[index]?.textOriginal ?? segments[index]?.text ?? "");
        if (!text.toLowerCase().includes(keyword)) continue;
        hits.push({index, speakerId: String(segments[index]?.speakerId || "unknown"),
          text: excerpt(text, keyword)});
        if (hits.length >= EXCERPT_COUNT) break;
      }
      if (!hits.length) continue;
    }

    matched.push({
      sessionId: summary.sessionId,
      startedAt: summary.startedAt,
      date: summary.day,
      durationMs: summary.durationMs,
      segments: {
        total: segments.length,
        matched: keyword ? hits.length : 0,
        excerpts: hits,
      },
      people,
      hasFinal: segments.every((segment) => segment?.final !== false),
    });
  }

  matched.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))
    || String(b.sessionId).localeCompare(String(a.sessionId)));

  let start = 0;
  if (cursor) {
    const at = matched.findIndex((item) => item.startedAt === cursor.startedAt && item.sessionId === cursor.sessionId);
    start = at < 0 ? matched.length : at + 1;
  }
  const page = matched.slice(start, start + limit);
  const nextCursor = start + limit < matched.length && page.length
    ? encodeCursor(page[page.length - 1]) : null;

  return {
    items: page,
    nextCursor,
    matched: matched.length,
    scanned: files.length,
    skipped,
    limit,
    q: Boolean(keyword),
    person: person || null,
    from: from || null,
    to: to || null,
  };
}