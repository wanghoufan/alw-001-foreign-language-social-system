/**
 * 会话原始记录归档（M2.1 核心模块，暂不接任何网络入口）。
 *
 * 设计边界（见 docs/ALW001-Conversation-Archive-AutoExport-Requirement-V1.0.md）：
 * - 只接受明确勾选「留存并导出」的会话；录音同意不等于留存同意。
 * - 只收 final 段；interim 不进持久化。
 * - 原文逐字保存，不改写；AI 内容单独一节。
 * - 按 sessionId 幂等：同内容重复投递返回 duplicate，不会写第二份。
 * - 文件名只由校验后的时间与会话 ID 生成，不接受调用方传入路径。
 * - 默认不保存任何 WAV/PCM。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SESSION_ID = /^[A-Za-z0-9_-]{8,64}$/;
const LIMITS = {segments: 5000, text: 8000, sessionsPerRoot: Infinity};

export function defaultRoot() {
  return process.env.SM_CONVERSATION_DIR
    || path.join(os.homedir(), "Documents", "SocialMate", "Conversations");
}

function assertIso(value, field) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new TypeError(`${field} 必须是 ISO8601 时间`);
  }
  return new Date(value).toISOString();
}

function normalizeSegment(segment, index) {
  if (!segment || typeof segment !== "object") throw new TypeError(`segments[${index}] 必须是对象`);
  if (segment.final !== true) throw new TypeError(`segments[${index}] 不是 final 段，拒绝入库`);
  // 逐字保留：不 trim、不改写，只拒绝真正的空字符串。
  const text = typeof segment.textOriginal === "string" ? segment.textOriginal
    : (typeof segment.text === "string" ? segment.text : "");
  if (!text.length) throw new TypeError(`segments[${index}] 原文为空`);
  if (text.length > LIMITS.text) throw new TypeError(`segments[${index}] 原文超过 ${LIMITS.text} 字`);
  const startMs = Number(segment.startMs);
  const endMs = Number(segment.endMs);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new TypeError(`segments[${index}] 时间戳无效`);
  }
  return {
    eventId: String(segment.eventId || `${index + 1}`),
    startMs,
    endMs,
    receivedAt: assertIso(segment.receivedAt || new Date().toISOString(), `segments[${index}].receivedAt`),
    speakerId: segment.speakerId ? String(segment.speakerId).slice(0, 40) : "unknown",
    track: segment.track === "A" || segment.track === "B" ? segment.track : "mix",
    provider: String(segment.provider || "unknown").slice(0, 40),
    mock: segment.mock === true,
    textOriginal: text,
  };
}

export function normalizeSession(input) {
  if (!input || typeof input !== "object") throw new TypeError("会话必须是对象");
  if (!SESSION_ID.test(String(input.sessionId || ""))) {
    throw new TypeError("sessionId 必须是 8–64 位字母、数字、下划线或连字符");
  }
  if (input?.consent?.retention !== true) {
    throw new TypeError("未获得留存并导出同意，拒绝入库");
  }
  const segments = Array.isArray(input.segments) ? input.segments : [];
  if (!segments.length) throw new TypeError("会话没有任何 final 段");
  if (segments.length > LIMITS.segments) throw new TypeError("段落数超过上限");

  const normalized = {
    schemaVersion: 1,
    sessionId: String(input.sessionId),
    startedAt: assertIso(input.startedAt, "startedAt"),
    endedAt: assertIso(input.endedAt, "endedAt"),
    appVersion: String(input.appVersion || "unknown").slice(0, 40),
    consent: {recording: input?.consent?.recording === true, retention: true,
      cloudAi: input?.consent?.cloudAi === true},
    revision: Math.max(1, Number(input.revision) || 1),
    segments: segments.map(normalizeSegment),
  };
  if (input.ai && typeof input.ai.text === "string" && input.ai.text.trim()) {
    normalized.ai = {
      text: input.ai.text.slice(0, LIMITS.text),
      provider: String(input.ai.provider || "unknown").slice(0, 40),
      createdAt: assertIso(input.ai.createdAt || new Date().toISOString(), "ai.createdAt"),
    };
  }
  return normalized;
}

export function contentHash(session) {
  return crypto.createHash("sha256").update(JSON.stringify(session)).digest("hex");
}

const pad = (n, width = 2) => String(n).padStart(width, "0");
const stamp = (ms) => {
  const d = new Date(ms);
  return `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
};
const day = (ms) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** 路径只由校验后的 startedAt 与 sessionId 派生，拒绝任何外部路径输入。 */
export function archivePaths(session, root = defaultRoot()) {
  const startedMs = Date.parse(session.startedAt);
  const d = new Date(startedMs);
  const year = String(d.getUTCFullYear());
  const month = pad(d.getUTCMonth() + 1);
  // 用完整 sessionId 避免短 ID 碰撞；文件名只由校验后的字段派生。
  const base = `SocialMate-${day(startedMs)}-${stamp(startedMs)}-${session.sessionId}`;
  const dir = path.join(root, year, month);
  return {dir, markdown: path.join(dir, `${base}.md`), json: path.join(dir, `${base}.json`)};
}

function fmt(ms) {
  const total = Math.max(0, Math.round(ms));
  const s = Math.floor(total / 1000);
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${pad(total % 1000, 3)}`;
}

export function renderMarkdown(session) {
  const lines = [
    "# SocialMate 会话记录",
    "",
    `- 会话 ID：${session.sessionId}`,
    `- 开始（UTC）：${session.startedAt}`,
    `- 结束（UTC）：${session.endedAt}`,
    `- 应用版本：${session.appVersion}`,
    `- 授权：录音=${session.consent.recording ? "是" : "否"} / 留存并导出=是 / 云端 AI=${session.consent.cloudAi ? "是" : "否"}`,
    `- 记录版本：${session.revision}`,
    "",
    "> 以下为 ASR 原始转写，保留识别错误与原语言，未经 AI 改写。",
    "> 说话人仅为聚类编号，不代表真实身份。",
    "",
    "## 原始转写",
    "",
  ];
  for (const segment of session.segments) {
    const tags = [
      `${fmt(segment.startMs)}–${fmt(segment.endMs)}`,
      `说话人 ${segment.speakerId}`,
      `轨道 ${segment.track}`,
      segment.provider,
      segment.mock ? "MOCK" : "real",
    ];
    lines.push(`- [${tags.join(" · ")}]`, `  ${segment.textOriginal}`, "");
  }
  if (session.ai) {
    lines.push("## AI 建议（独立生成，不覆盖原文）", "",
      `- 提供方：${session.ai.provider}`, `- 生成时间（UTC）：${session.ai.createdAt}`, "",
      session.ai.text, "");
  }
  return lines.join("\n");
}

/**
 * 幂等写入。返回 {status: "created"|"revised"|"duplicate", markdown, json}。
 * 同内容 → duplicate；更高 revision → revised；更低/相等但内容不同 → conflict。
 */
export async function saveSession(input, {root = defaultRoot()} = {}) {
  const session = normalizeSession(input);
  const hash = contentHash(session);
  const paths = archivePaths(session, root);

  let existing = null;
  try {
    existing = JSON.parse(await fs.readFile(paths.json, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (existing) {
    if (existing.contentHash === hash) return {status: "duplicate", ...paths, hash};
    if (Number(existing.session?.revision || 0) >= session.revision) {
      const conflict = new Error("同一会话的 revision 未提升，拒绝覆盖");
      conflict.code = "ARCHIVE_REVISION_CONFLICT";
      throw conflict;
    }
  }

  await fs.mkdir(paths.dir, {recursive: true, mode: 0o700});
  const payload = JSON.stringify({contentHash: hash, session}, null, 2);
  const markdown = renderMarkdown(session);
  const jsonTmp = `${paths.json}.${process.pid}.tmp`;
  const mdTmp = `${paths.markdown}.${process.pid}.tmp`;
  try {
    await fs.writeFile(mdTmp, markdown, {encoding: "utf8", mode: 0o600});
    await fs.writeFile(jsonTmp, payload, {encoding: "utf8", mode: 0o600});
    // JSON 最后提交：以 JSON 作为权威记录；中断时最多留下旧 JSON + 新 Markdown，
    // 下次重放会按同一 sessionId 重写两者，不会产生半份“已提交”状态。
    await fs.rename(mdTmp, paths.markdown);
    await fs.rename(jsonTmp, paths.json);
  } catch (error) {
    await fs.rm(mdTmp, {force: true}).catch(() => {});
    await fs.rm(jsonTmp, {force: true}).catch(() => {});
    throw error;
  }

  return {status: existing ? "revised" : "created", ...paths, hash};
}