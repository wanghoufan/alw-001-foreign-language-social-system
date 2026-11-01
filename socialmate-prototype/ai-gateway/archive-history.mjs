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