/**
 * ALW-001 N05 V1.2 · 自动学习资料归档与索引（ADDENDUM V1.0）
 *
 * 设计边界：
 * - 只做“索引 + 派生”，不搬动、不改写任何原始资料；原始文件仍是唯一事实来源。
 * - 索引只保存路径引用、哈希、状态和最小元数据，不保存令牌、不把全文写进 index。
 * - 同一来源同一内容幂等；同名不同正文生成新版本，绝不覆盖旧版本。
 * - 派生文件放 processed/<materialId>/derived.json；原文逐字保留在原业务目录。
 * - 云端 AI 仅在明确 consent 下才可发生；本模块默认不发起任何外部请求，
 *   已有 AI 分段结果标为 existing_ai_segmentation，其余标 awaiting_consent。
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

export const SOURCE_TYPES = ["self_test", "course", "conversation", "thought", "practice_review"];
const SOURCE_TYPE_SET = new Set(SOURCE_TYPES);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_ROOT = 8000;
const MAX_WALK_DEPTH = 10;
const ALLOWED_EXT = new Set([".md", ".txt", ".json", ".jsonl"]);
const LOCK_STALE_MS = 10 * 60 * 1000;
const MAX_RUNS_KEPT = 40;
const DEFAULT_INTERVAL_SECONDS = 300;
const DEGRADED_AFTER_MISSED_CYCLES = 2;
const WATCH_STATE_FILE = "watch-state.json";
const HEALTH_FILE = "health.json";
const WATCH_LABEL = "com.alw.learning-archive-watch";

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha16(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function dayStamp(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
}

function normalizeRel(value) {
  return String(value || "").split(path.sep).join("/");
}

function safeName(value) {
  const base = path.basename(String(value || "material").replaceAll("\\", "/"));
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[<>:"/\\|?*]/g, "_").trim();
  return (cleaned || "material").slice(0, 120);
}

function safeSourceType(value) {
  const text = String(value || "");
  if (!SOURCE_TYPE_SET.has(text)) {
    const error = new Error(`sourceType 必须是 ${SOURCE_TYPES.join("/")}`);
    error.code = "INVALID_SOURCE_TYPE";
    error.status = 400;
    throw error;
  }
  return text;
}

function parseJson(text) {
  try {
    return {ok: true, value: JSON.parse(text)};
  } catch (error) {
    return {ok: false, error};
  }
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, 4096);
  return sample.includes(0);
}

function pickString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

/**
 * QA 自测 fixture 识别：仅按文件名约定或正文显式标记判定，绝不按内容相似度猜测，
 * 避免把真实学习记录误标成测试数据。命中后条目打 sourceTag="qa_fixture" 且 test=true，
 * 统计时从「真实学习成绩」中剔除（ARC03）。
 */
function looksLikeTestFixture({fileName, text}) {
  const name = String(fileName || "").toLowerCase();
  if (/(^|[-_.])(qa|test)[-_]?fixture([-_.]|$)/.test(name)) return true;
  if (/(^|[-_.])fixture[-_]?(qa|test)([-_.]|$)/.test(name)) return true;
  const head = String(text || "").slice(0, 4000);
  if (/^\s*"?(qa_fixture|test_fixture)"?\s*[:=]\s*true\s*$/im.test(head)) return true;
  return false;
}

function pickTime(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text) continue;
    const ms = Date.parse(text);
    if (!Number.isNaN(ms)) return new Date(ms).toISOString();
  }
  return "";
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeId(value, fallback) {
  const text = String(value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(text) ? text : fallback;
}

function fileDateFromName(name) {
  const hit = String(name).match(/(20\d{2}-\d{2}-\d{2})/);
  if (!hit) return "";
  const ms = Date.parse(`${hit[1]}T00:00:00Z`);
  return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
}

function defaultRoots({projectRoot, home, conversationRoot}) {
  const conversations = conversationRoot || process.env.SM_CONVERSATION_DIR
    || path.join(home, "Documents", "SocialMate", "Conversations");
  return [
    {
      key: "self_test",
      dir: path.join(projectRoot, "学习资料", "01-口语自测原始记录"),
      sourceApp: "p016_landedazi",
      classify: (rel) => rel.endsWith(".md") ? "self_test" : null,
    },
    {
      key: "course",
      dir: path.join(projectRoot, "SocialMate-Data", "Courses"),
      sourceApp: "course_import",
      classify: (rel) => /\.(md|txt|json)$/i.test(rel) ? "course" : null,
    },
    {
      key: "conversation",
      dir: conversations,
      sourceApp: "socialmate_android",
      classify: (rel) => rel.endsWith(".json") ? "conversation" : null,
    },
    {
      key: "private_places",
      dir: path.join(projectRoot, "SocialMate-Data", "PrivatePlaces"),
      sourceApp: "socialmate_mac",
      classify: (rel) => {
        if (rel.includes("/records-archive/")) return null;
        if (rel.includes("/records/") && rel.endsWith(".json")) return "thought";
        if (rel.includes("/practice/") && rel.endsWith(".json")) return "practice_review";
        return null;
      },
    },
    {
      key: "place_notes",
      dir: path.join(projectRoot, "SocialMate-Data", "PlaceNotes"),
      sourceApp: "socialmate_mac",
      classify: (rel) => {
        if (rel.includes("/records/") && rel.endsWith(".json")) return "thought";
        if (rel.includes("/practice/") && rel.endsWith(".json")) return "practice_review";
        return null;
      },
    },
    {
      key: "inbox",
      dir: path.join(projectRoot, "SocialMate-Data", "Inbox"),
      sourceApp: "user_private",
      classify: (rel) => /\.(md|txt|json)$/i.test(rel) ? "thought" : null,
    },
    {
      key: "practice",
      dir: path.join(projectRoot, "SocialMate-Data", "Practice"),
      sourceApp: "socialmate_mac",
      classify: (rel) => /\.(md|json)$/i.test(rel) ? "practice_review" : null,
    },
    {
      key: "archive_inbox",
      dir: "__ARCHIVE_INBOX__",
      sourceApp: "archive_inbox",
      classify: (rel) => {
        const [first] = String(rel).split("/");
        return SOURCE_TYPE_SET.has(first) ? first : null;
      },
    },
  ];
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function chmodQuiet(target, mode) {
  await fs.chmod(target, mode).catch(() => {});
}

async function atomicWrite(file, text) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, text, {encoding: "utf8", mode: 0o600});
  await chmodQuiet(tmp, 0o600);
  await fs.rename(tmp, file);
  await chmodQuiet(file, 0o600);
}

function sessionFromConversation(json) {
  return json && typeof json === "object" && json.session ? json.session : json;
}

function placeRefFromPath(relPath) {
  const hit = String(relPath).match(/(?:^|\/)(pv-[a-z0-9-]{1,32}|\d{1,3})\/(?:records|practice)\//);
  return hit ? hit[1] : "";
}

function parseSelfTest(text) {
  const sessions = [];
  const parts = String(text).split(/^## Session /m).slice(1);
  for (const part of parts) {
    const lines = part.split(/\r?\n/);
    const id = lines[0] ? lines[0].trim() : "";
    const grab = (heading) => {
      const start = part.indexOf(`### ${heading}`);
      if (start < 0) return "";
      const after = part.slice(start + heading.length + 4);
      const end = after.search(/\n### /);
      return (end < 0 ? after : after.slice(0, end)).trim();
    };
    const learningPoint = grab("学习重点");
    const keyPhrases = learningPoint.split(/\r?\n/)
      .map((line) => line.replace(/^\s*-\s*/, "").trim())
      .filter((line) => line && !/^未记录/.test(line))
      .slice(0, 20);
    const attempt = grab("我的英文尝试");
    sessions.push({
      sessionId: safeId(id, `session-${sessions.length + 1}`),
      learnedAt: (part.match(/^- learned_at:\s*(.+)$/m) || [])[1] || "",
      sourceZh: grab("中文意图"),
      reference: grab("AI 参考表达"),
      firstAttempt: attempt && attempt !== "未尝试" ? attempt : "",
      comparison: grab("AI 对比"),
      learningPoint: learningPoint && learningPoint !== "未记录" ? learningPoint : "",
      keyPhrases,
      pronunciation: "not_evaluated_no_audio",
    });
  }
  return sessions;
}

function deriveThought(json, text, entry, relPath) {
  const record = json && typeof json === "object" ? json : null;
  const blocks = asArray(record?.blocks).map((block) => ({
    blockId: String(block?.blockId || ""),
    order: Number(block?.order || 0),
    contentRevision: Number(block?.contentRevision || record?.revision || 1),
    sourceText: String(block?.sourceText || ""),
    cn: asArray(block?.cnSentences).map(String),
    enA: String(asArray(block?.enVariants)[0] || ""),
    enB: String(asArray(block?.enVariants)[1] || ""),
    phrases: asArray(block?.phrases).map(String),
    originalChanged: block?.originalChanged === true,
  }));
  const aiSegmented = record?.segmentation?.by === "ai"
    || blocks.some((block) => block.enA || block.enB);
  return {
    schema: 1,
    materialId: entry.materialId,
    sourceType: entry.sourceType,
    derivation: aiSegmented ? "existing_ai_segmentation" : "rules",
    derivationStatus: aiSegmented ? "ai_suggested_existing" : "normalized",
    cloudDerivation: "awaiting_consent",
    original: {
      pathRef: entry.originalPathRef,
      sha256: entry.originalSha256,
      bytes: entry.size,
      revision: record?.revision || null,
    },
    placeRefs: entry.placeRefs,
    recordId: record?.recordId || entry.sourceId,
    recordRevision: record?.revision || null,
    segmentation: record?.segmentation || null,
    cleanChinese: blocks.map((block) => block.cn.join("")).filter(Boolean).join("\n\n"),
    blocks,
    note: "原文逐字保留在原记录文件；本文件仅为派生视图，不改写原文。",
  };
}

function derivePractice(json, entry) {
  const report = json && typeof json === "object" ? json : {};
  return {
    schema: 1,
    materialId: entry.materialId,
    sourceType: entry.sourceType,
    derivation: "rules",
    derivationStatus: "normalized",
    cloudDerivation: "awaiting_consent",
    original: {pathRef: entry.originalPathRef, sha256: entry.originalSha256, bytes: entry.size},
    placeRefs: entry.placeRefs,
    recordId: report.recordId || "",
    blockId: report.blockId || entry.sourceId,
    result: report.status || "",
    contentRevision: report.contentRevision ?? null,
    currentRevision: report.currentRevision ?? null,
    weakPhrases: asArray(report.weakPhrases).map(String),
    practiceTime: report.practiceTime || entry.createdAt,
    reportExcerpt: String(report.rawReport || "").slice(0, 2000),
    note: "复盘独立于记录文件，旧报告不会被覆盖。",
  };
}

function deriveConversation(json, entry) {
  const session = sessionFromConversation(json) || {};
  const segments = asArray(session.segments).map((segment) => ({
    speakerId: String(segment?.speakerId || "unknown"),
    startMs: segment?.startMs ?? null,
    endMs: segment?.endMs ?? null,
    textOriginal: String(segment?.textOriginal || ""),
  }));
  return {
    schema: 1,
    materialId: entry.materialId,
    sourceType: entry.sourceType,
    derivation: session.ai?.text ? "existing_ai_summary" : "rules",
    derivationStatus: session.ai?.text ? "ai_suggested_existing" : "normalized",
    cloudDerivation: entry.consentScope === "cloud_ai_allowed" ? "allowed" : "awaiting_consent",
    original: {pathRef: entry.originalPathRef, sha256: entry.originalSha256, bytes: entry.size},
    sessionId: session.sessionId || entry.sourceId,
    startedAt: session.startedAt || entry.createdAt,
    endedAt: session.endedAt || "",
    segmentCount: segments.length,
    segments,
    aiSummary: session.ai?.text || "",
    note: "真实会话只在 retention 同意下索引；本文件不替代原始会话归档。",
  };
}

function deriveSelfTest(text, entry) {
  const sessions = parseSelfTest(text);
  const weak = [...new Set(sessions.flatMap((session) => session.keyPhrases))].slice(0, 50);
  return {
    schema: 1,
    materialId: entry.materialId,
    sourceType: entry.sourceType,
    derivation: "rules",
    derivationStatus: "normalized",
    cloudDerivation: "awaiting_consent",
    original: {pathRef: entry.originalPathRef, sha256: entry.originalSha256, bytes: entry.size},
    sessionCount: sessions.length,
    sessions,
    weakPhrases: weak,
    pronunciation: "not_evaluated_no_audio",
    note: "自测导出没有完整音频，因此不评价发音；仅分析表达与学习重点。",
  };
}

function deriveCourse(text, entry) {
  const headings = String(text).split(/\r?\n/)
    .filter((line) => /^#{1,4}\s+/.test(line))
    .map((line) => line.replace(/^#{1,4}\s+/, "").trim())
    .slice(0, 80);
  return {
    schema: 1,
    materialId: entry.materialId,
    sourceType: entry.sourceType,
    derivation: "rules",
    derivationStatus: "normalized",
    cloudDerivation: "awaiting_consent",
    original: {pathRef: entry.originalPathRef, sha256: entry.originalSha256, bytes: entry.size},
    headings,
    charCount: String(text).length,
    note: "课程材料只做结构索引；没有实际课程来源时报告 NO_SOURCE，不虚构导入成功。",
  };
}

function buildDerived(entry, {json, text}) {
  switch (entry.sourceType) {
    case "thought": return deriveThought(json, text, entry, entry.relativePath);
    case "practice_review": return derivePractice(json, entry);
    case "conversation": return deriveConversation(json, entry);
    case "self_test": return deriveSelfTest(text, entry);
    case "course": return deriveCourse(text, entry);
    default: throw new Error(`unknown sourceType ${entry.sourceType}`);
  }
}

export function createLearningArchive(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || REPO_ROOT);
  const home = options.home || os.homedir();
  const root = path.resolve(options.root || process.env.SM_LEARNING_ARCHIVE_DIR
    || path.join(projectRoot, "SocialMate-Data", "LearningArchive"));
  const roots = (options.roots || defaultRoots({projectRoot, home, conversationRoot: options.conversationRoot})).map((item) => ({
    ...item,
    dir: item.dir === "__ARCHIVE_INBOX__" ? path.join(root, "inbox") : item.dir,
  }));
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const indexPath = path.join(root, "index.json");
  const journalPath = path.join(root, "index.jsonl");
  const runsDir = path.join(root, "runs");
  const processedDir = path.join(root, "processed");
  const quarantineDir = path.join(root, "quarantine");
  const inboxDir = path.join(root, "inbox");
  const lockPath = path.join(root, "run.lock");

  async function ensureLayout() {
    for (const dir of [root, runsDir, processedDir, quarantineDir, inboxDir]) {
      await fs.mkdir(dir, {recursive: true, mode: 0o700});
      await chmodQuiet(dir, 0o700);
    }
  }

  async function loadIndex() {
    await ensureLayout();
    try {
      const parsed = JSON.parse(await fs.readFile(indexPath, "utf8"));
      if (!Array.isArray(parsed?.materials)) throw new Error("index schema invalid");
      return parsed;
    } catch (error) {
      if (error.code === "ENOENT") return {schema: 1, materials: []};
      // 损坏索引不静默覆盖：留档后从空索引继续，原文件仍在。
      const stamp = `${dayStamp(now())}-${Date.now()}`;
      await fs.mkdir(quarantineDir, {recursive: true, mode: 0o700});
      await fs.copyFile(indexPath, path.join(quarantineDir, `index-corrupt-${stamp}.json`)).catch(() => {});
      return {schema: 1, materials: [], recoveredFromCorruptIndex: true};
    }
  }

  async function saveIndex(index) {
    await atomicWrite(indexPath, JSON.stringify(index, null, 2));
  }

  async function appendJournal(event) {
    await fs.mkdir(root, {recursive: true, mode: 0o700});
    await fs.appendFile(journalPath, `${JSON.stringify(event)}\n`, {encoding: "utf8", mode: 0o600});
    await chmodQuiet(journalPath, 0o600);
  }

  async function quarantine(runId, {reason, sourcePathRef, fileName, buffer, errorCode}) {
    const dir = path.join(quarantineDir, runId);
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    await chmodQuiet(dir, 0o700);
    const name = `${Date.now()}-${safeName(fileName || "unknown")}`;
    const meta = {
      schema: 1,
      reason,
      errorCode: errorCode || reason,
      sourcePathRef: sourcePathRef || "",
      fileName: safeName(fileName || "unknown"),
      size: buffer ? buffer.length : 0,
      sha256: buffer ? sha256(buffer) : "",
      capturedAt: nowIso(now()),
    };
    await atomicWrite(path.join(dir, `${name}.json`), JSON.stringify(meta, null, 2));
    if (buffer && buffer.length <= MAX_FILE_BYTES) {
      const bin = path.join(dir, `${name}.bin`);
      await fs.writeFile(bin, buffer, {mode: 0o600});
      await chmodQuiet(bin, 0o600);
    }
    return meta;
  }

  async function acquireLock() {
    await ensureLayout();
    try {
      const stat = await fs.stat(lockPath);
      if (now() - stat.mtimeMs < LOCK_STALE_MS) return {ok: false, reason: "RUN_LOCKED"};
      await fs.rm(lockPath, {force: true});
    } catch {}
    await fs.writeFile(lockPath, JSON.stringify({pid: process.pid, at: nowIso(now())}), {mode: 0o600});
    await chmodQuiet(lockPath, 0o600);
    return {ok: true};
  }

  async function releaseLock() {
    await fs.rm(lockPath, {force: true}).catch(() => {});
  }

  async function readRuns() {
    try {
      const names = (await fs.readdir(runsDir)).filter((name) => name.endsWith(".json")).sort();
      return names;
    } catch {
      return [];
    }
  }

  async function pruneRuns() {
    const names = await readRuns();
    const extra = names.slice(0, Math.max(0, names.length - MAX_RUNS_KEPT));
    for (const name of extra) await fs.rm(path.join(runsDir, name), {force: true}).catch(() => {});
  }

  async function readWatchState() {
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(root, WATCH_STATE_FILE), "utf8"));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  async function writeWatchState(patch) {
    const previous = await readWatchState();
    const next = {...previous, ...patch, updatedAt: nowIso(now())};
    await atomicWrite(path.join(root, WATCH_STATE_FILE), JSON.stringify(next, null, 2));
    return next;
  }

  function pidAlive(pid) {
    const value = Number(pid);
    if (!Number.isInteger(value) || value <= 0) return false;
    try {
      process.kill(value, 0);
      return true;
    } catch (error) {
      return error.code === "EPERM";
    }
  }

  async function lastRunSummary() {
    const names = await readRuns();
    if (!names.length) return null;
    try {
      return JSON.parse(await fs.readFile(path.join(runsDir, names[names.length - 1]), "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * watch 心跳：每个周期开始/结束各写一次，供 --health 与外部脚本消费。
   * 漏扫判定：与上一个周期结束时间的间隔超过 1.5 倍区间，或本轮扫描失败/被锁，计 1 次漏扫；
   * 成功即清零。连续 2 次即 DEGRADED（S2 合同）。
   */
  async function recordCycle({intervalSeconds, startedAt, endedAt, summary, errorCode}) {
    const previous = await readWatchState();
    const interval = Math.max(30, Number(intervalSeconds) || DEFAULT_INTERVAL_SECONDS);
    const prevLoss = Number(previous.consecutiveMissedCycles) || 0;
    const prevEnd = Date.parse(previous.lastCycleEndedAt || "");
    const thisStart = Date.parse(startedAt || "");
    const gapMissed = Number.isFinite(prevEnd) && Number.isFinite(thisStart)
      ? thisStart - prevEnd > interval * 1500
      : false;
    const failed = Boolean(errorCode) || summary?.ok === false;
    const consecutiveMissedCycles = failed || gapMissed ? prevLoss + 1 : 0;
    return writeWatchState({
      schema: 1,
      label: WATCH_LABEL,
      pid: process.pid,
      intervalSeconds: interval,
      startedAt: previous.startedAt || startedAt || nowIso(now()),
      lastCycleStartedAt: startedAt || nowIso(now()),
      lastCycleEndedAt: endedAt || nowIso(now()),
      lastRunId: summary?.runId || previous.lastRunId || null,
      lastOk: summary ? summary.ok !== false : previous.lastOk ?? null,
      lastIndexed: Number.isFinite(summary?.indexed) ? summary.indexed : previous.lastIndexed ?? null,
      lastUnchanged: Number.isFinite(summary?.unchanged) ? summary.unchanged : previous.lastUnchanged ?? null,
      lastFailed: Number.isFinite(summary?.failed) ? summary.failed : previous.lastFailed ?? null,
      lastTotalMaterials: Number.isFinite(summary?.totalMaterials) ? summary.totalMaterials : previous.lastTotalMaterials ?? null,
      lastErrorCode: errorCode || null,
      consecutiveMissedCycles,
    });
  }

  async function walkFiles(dir, depth = 0, out = []) {
    if (depth > MAX_WALK_DEPTH || out.length >= MAX_FILES_PER_ROOT) return out;
    let entries;
    try {
      entries = await fs.readdir(dir, {withFileTypes: true});
    } catch {
      return out;
    }
    for (const entry of entries) {
      if (out.length >= MAX_FILES_PER_ROOT) break;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        out.push({path: full, symlink: true});
        continue;
      }
      if (entry.isDirectory()) {
        await walkFiles(full, depth + 1, out);
      } else if (entry.isFile()) {
        out.push({path: full, symlink: false});
      }
    }
    return out;
  }

  function sourceMetaFor({sourceType, relPath, fileName, json, text, absolutePath}) {
    if (sourceType === "conversation") {
      const session = sessionFromConversation(json) || {};
      const consent = session.consent || {};
      if (consent.retention !== true) {
        return {skip: true, reason: "CONSENT_REQUIRED"};
      }
      return {
        sourceId: safeId(session.sessionId, fileName.replace(/\.[^.]+$/, "")),
        createdAt: pickTime(session.startedAt, session.endedAt) || fileDateFromName(fileName),
        consentScope: consent.cloudAi === true ? "cloud_ai_allowed" : "local_only",
        sourceRevision: Number.isInteger(session.revision) ? session.revision : null,
        placeRefs: [],
        personRefs: [],
        practiceSessionRefs: [],
      };
    }
    if (sourceType === "thought") {
      const record = json && typeof json === "object" ? json : null;
      const place = record?.placeId != null ? String(record.placeId) : placeRefFromPath(relPath);
      return {
        sourceId: safeId(record?.recordId, fileName.replace(/\.[^.]+$/, "")),
        createdAt: pickTime(record?.createdAt, record?.updatedAt) || fileDateFromName(fileName),
        consentScope: "local_only",
        sourceRevision: Number.isInteger(record?.revision) ? record.revision : null,
        placeRefs: place ? [place] : [],
        personRefs: [],
        practiceSessionRefs: [],
      };
    }
    if (sourceType === "practice_review") {
      const report = json && typeof json === "object" ? json : null;
      const place = report?.placeId != null ? String(report.placeId) : placeRefFromPath(relPath);
      return {
        sourceId: safeId(report?.reportId, fileName.replace(/\.[^.]+$/, "")),
        createdAt: pickTime(report?.practiceTime, report?.createdAt) || fileDateFromName(fileName),
        consentScope: "local_only",
        sourceRevision: Number.isInteger(report?.contentRevision) ? report.contentRevision : null,
        placeRefs: place ? [place] : [],
        personRefs: [],
        practiceSessionRefs: report?.recordId && report?.blockId
          ? [{recordId: String(report.recordId), blockId: String(report.blockId)}] : [],
      };
    }
    if (sourceType === "self_test") {
      const exportId = (String(text).match(/^export_id:\s*([0-9a-f]{8,})$/m) || [])[1] || "";
      return {
        sourceId: safeId(exportId, fileName.replace(/\.[^.]+$/, "")),
        createdAt: pickTime((String(text).match(/^exported_at:\s*(.+)$/m) || [])[1]) || fileDateFromName(fileName),
        consentScope: "local_only",
        sourceRevision: null,
        placeRefs: [],
        personRefs: [],
        practiceSessionRefs: [],
      };
    }
    return {
      sourceId: safeId(fileName.replace(/\.[^.]+$/, ""), sha16(relPath)),
      createdAt: fileDateFromName(fileName),
      consentScope: "local_only",
      sourceRevision: null,
      placeRefs: [],
      personRefs: [],
      practiceSessionRefs: [],
    };
  }

  async function indexFile({rootDef, absolutePath, relPath, sourceType, state}) {
    const fileName = path.basename(absolutePath);
    const ext = path.extname(fileName).toLowerCase();
    const stat = await fs.stat(absolutePath);
    const sourcePathRef = `${rootDef.key}:${normalizeRel(relPath)}`;
    if (!ALLOWED_EXT.has(ext)) {
      return {status: "skipped", reason: "EXT_NOT_ALLOWED"};
    }
    if (stat.size <= 0) {
      await quarantine(state.runId, {reason: "EMPTY_FILE", sourcePathRef, fileName});
      return {status: "quarantined", reason: "EMPTY_FILE"};
    }
    if (stat.size > MAX_FILE_BYTES) {
      await quarantine(state.runId, {reason: "FILE_TOO_LARGE", sourcePathRef, fileName});
      return {status: "quarantined", reason: "FILE_TOO_LARGE"};
    }
    const buffer = await fs.readFile(absolutePath);
    if (looksBinary(buffer)) {
      await quarantine(state.runId, {reason: "BINARY_CONTENT", sourcePathRef, fileName, buffer});
      return {status: "quarantined", reason: "BINARY_CONTENT"};
    }
    const text = buffer.toString("utf8");
    let json = null;
    if (ext === ".json" || ext === ".jsonl") {
      const parsed = parseJson(text);
      if (!parsed.ok) {
        await quarantine(state.runId, {reason: "INVALID_JSON", sourcePathRef, fileName, buffer});
        return {status: "quarantined", reason: "INVALID_JSON"};
      }
      json = parsed.value;
    }
    const meta = sourceMetaFor({sourceType, relPath: normalizeRel(relPath), fileName, json, text, absolutePath});
    if (meta.skip) {
      return {status: "skipped", reason: meta.reason};
    }
    const originalSha256 = sha256(buffer);
    const logicalId = sha16(`${sourceType}|${meta.sourceId}`);
    const materialId = `lm-${sha16(`${sourceType}|${meta.sourceId}|${originalSha256}`)}`;
    const existingSame = state.index.materials.find((item) => item.materialId === materialId);
    if (existingSame && existingSame.originalSha256 === originalSha256) {
      return {status: "unchanged", materialId};
    }
    const versions = state.index.materials
      .filter((item) => item.logicalId === logicalId)
      .map((item) => Number(item.version) || 1);
    const version = versions.length ? Math.max(...versions) + 1 : 1;
    const testFixture = looksLikeTestFixture({fileName, text});
    const entry = {
      materialId,
      logicalId,
      sourceType,
      sourceApp: rootDef.sourceApp,
      sourceId: meta.sourceId,
      originalPathRef: sourcePathRef,
      relativePath: normalizeRel(relPath),
      originalSha256,
      size: buffer.length,
      createdAt: meta.createdAt || nowIso(now()),
      receivedAt: nowIso(now()),
      processingStatus: "indexed",
      version,
      derivedPathRef: "",
      sourceRevision: meta.sourceRevision,
      practiceSessionRefs: meta.practiceSessionRefs,
      personRefs: meta.personRefs,
      placeRefs: meta.placeRefs,
      consentScope: meta.consentScope,
      test: testFixture,
      sourceTag: testFixture ? "qa_fixture" : null,
      lastErrorCode: null,
      retryAfter: null,
    };
    const derived = buildDerived(entry, {json, text});
    const derivedRel = `processed/${materialId}/derived.json`;
    const derivedAbs = path.join(root, derivedRel);
    await atomicWrite(derivedAbs, JSON.stringify(derived, null, 2));
    entry.derivedPathRef = derivedRel;
    entry.processingStatus = derived.derivationStatus === "ai_suggested_existing"
      ? "ai_suggested" : "normalized";
    const existingIndex = state.index.materials.findIndex((item) => item.materialId === materialId);
    if (existingIndex >= 0) state.index.materials[existingIndex] = entry;
    else state.index.materials.push(entry);
    await appendJournal({
      at: nowIso(now()),
      action: "upsert",
      materialId,
      logicalId,
      sourceType,
      originalSha256,
      version,
      processingStatus: entry.processingStatus,
    });
    state.indexed += 1;
    return {status: "indexed", materialId, version};
  }

  async function scanRoot(rootDef, state) {
    if (!(await pathExists(rootDef.dir))) {
      state.roots.push({key: rootDef.key, dir: rootDef.dir, status: "NO_SOURCE", files: 0});
      return;
    }
    let realRoot;
    try {
      realRoot = await fs.realpath(rootDef.dir);
    } catch (error) {
      state.roots.push({key: rootDef.key, dir: rootDef.dir, status: "UNREADABLE", error: error.code || "UNREADABLE"});
      return;
    }
    const files = await walkFiles(realRoot);
    let count = 0;
    for (const item of files) {
      if (item.symlink) {
        state.quarantined += 1;
        await quarantine(state.runId, {
          reason: "SYMLINK_SKIPPED",
          sourcePathRef: `${rootDef.key}:${normalizeRel(path.relative(realRoot, item.path))}`,
          fileName: path.basename(item.path),
        });
        continue;
      }
      const relPath = normalizeRel(path.relative(realRoot, item.path));
      const sourceType = rootDef.classify(relPath);
      if (!sourceType) continue;
      let realFile;
      try {
        realFile = await fs.realpath(item.path);
      } catch {
        state.quarantined += 1;
        await quarantine(state.runId, {reason: "UNREADABLE", sourcePathRef: `${rootDef.key}:${relPath}`, fileName: path.basename(item.path)});
        continue;
      }
      if (realFile !== realRoot && !realFile.startsWith(`${realRoot}${path.sep}`)) {
        state.quarantined += 1;
        await quarantine(state.runId, {reason: "PATH_ESCAPE", sourcePathRef: `${rootDef.key}:${relPath}`, fileName: path.basename(item.path)});
        continue;
      }
      count += 1;
      state.scanned += 1;
      try {
        const result = await indexFile({rootDef, absolutePath: realFile, relPath, sourceType, state});
        if (result.status === "indexed") state.indexedBySource[sourceType] = (state.indexedBySource[sourceType] || 0) + 1;
        else if (result.status === "unchanged") state.unchanged += 1;
        else if (result.status === "quarantined") state.quarantined += 1;
        else if (result.status === "skipped") {
          state.skipped += 1;
          if (result.reason === "CONSENT_REQUIRED") state.skippedConsent += 1;
        }
      } catch (error) {
        state.failed += 1;
        await quarantine(state.runId, {
          reason: "INDEX_FAILED",
          errorCode: error.code || error.message,
          sourcePathRef: `${rootDef.key}:${relPath}`,
          fileName: path.basename(item.path),
        });
      }
    }
    state.roots.push({key: rootDef.key, dir: rootDef.dir, status: count ? "SCANNED" : "EMPTY", files: count});
  }

  async function runScan({runId} = {}) {
    await ensureLayout();
    const lock = await acquireLock();
    if (!lock.ok) return {ok: false, code: lock.reason, message: "已有扫描在运行"};
    const id = runId || `run-${new Date(now()).toISOString().replace(/[-:]/g, "").replace(/\..+/, "")}-${crypto.randomBytes(2).toString("hex")}`;
    const startedAt = nowIso(now());
    const state = {
      runId: id,
      index: await loadIndex(),
      roots: [],
      scanned: 0,
      indexed: 0,
      unchanged: 0,
      quarantined: 0,
      skipped: 0,
      skippedConsent: 0,
      failed: 0,
      indexedBySource: {},
    };
    try {
      for (const rootDef of roots) {
        await scanRoot(rootDef, state);
      }
      state.index.updatedAt = nowIso(now());
      await saveIndex(state.index);
      const summary = {
        ok: true,
        runId: id,
        startedAt,
        endedAt: nowIso(now()),
        roots: state.roots,
        scanned: state.scanned,
        indexed: state.indexed,
        indexedBySource: state.indexedBySource,
        unchanged: state.unchanged,
        quarantined: state.quarantined,
        skipped: state.skipped,
        skippedConsent: state.skippedConsent,
        failed: state.failed,
        totalMaterials: state.index.materials.length,
      };
      await atomicWrite(path.join(runsDir, `${id}.json`), JSON.stringify(summary, null, 2));
      await pruneRuns();
      return summary;
    } catch (error) {
      const summary = {
        ok: false,
        runId: id,
        startedAt,
        endedAt: nowIso(now()),
        error: error.code || error.message,
        totalMaterials: state.index.materials.length,
      };
      await atomicWrite(path.join(runsDir, `${id}.json`), JSON.stringify(summary, null, 2)).catch(() => {});
      return summary;
    } finally {
      await releaseLock();
    }
  }

  async function status() {
    const index = await loadIndex();
    const bySource = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
    const realBySource = Object.fromEntries(SOURCE_TYPES.map((type) => [type, 0]));
    const byStatus = {};
    const byConsent = {};
    let testFixtures = 0;
    for (const item of index.materials) {
      bySource[item.sourceType] = (bySource[item.sourceType] || 0) + 1;
      byStatus[item.processingStatus] = (byStatus[item.processingStatus] || 0) + 1;
      byConsent[item.consentScope] = (byConsent[item.consentScope] || 0) + 1;
      if (item.test === true || item.sourceTag === "qa_fixture") testFixtures += 1;
      else realBySource[item.sourceType] = (realBySource[item.sourceType] || 0) + 1;
    }
    const runs = await readRuns();
    let lastRun = null;
    if (runs.length) {
      try {
        lastRun = JSON.parse(await fs.readFile(path.join(runsDir, runs[runs.length - 1]), "utf8"));
      } catch {}
    }
    return {
      ok: true,
      root,
      updatedAt: index.updatedAt || null,
      total: index.materials.length,
      bySource,
      realBySource,
      testFixtures,
      realTotal: index.materials.length - testFixtures,
      byStatus,
      byConsent,
      awaitingConsent: index.materials.filter((item) => item.consentScope !== "cloud_ai_allowed").length,
      lastRun,
      roots: roots.map((item) => ({key: item.key, dir: item.dir})),
    };
  }

  /**
   * 健康摘要（机器可读）：lastScan / 计划间隔 / running PID / 最近 indexed|unchanged|failed /
   * 连续漏扫 ≥2 标 DEGRADED，并用既有恢复入口（launchctl kickstart 本 label）自恢复。
   * 不发起任何网络请求。
   */
  async function health({intervalSeconds} = {}) {
    const index = await loadIndex();
    const state = await readWatchState();
    const lastRun = await lastRunSummary();
    const interval = Math.max(30, Number(intervalSeconds || state.intervalSeconds || DEFAULT_INTERVAL_SECONDS));
    const lastScanAt = state.lastCycleEndedAt || lastRun?.endedAt || index.updatedAt || null;
    const lastScanMs = Date.parse(lastScanAt || "");
    const ageSeconds = Number.isFinite(lastScanMs) ? Math.max(0, Math.round((now() - lastScanMs) / 1000)) : null;
    const computedMissed = Number.isFinite(ageSeconds)
      ? Math.max(0, Math.floor(ageSeconds / interval) - 1)
      : null;
    const consecutiveMissedCycles = Number(state.consecutiveMissedCycles) || 0;
    const runningPid = Number(state.pid) || null;
    const running = pidAlive(runningPid);
    const sources = [];
    for (const item of roots) {
      sources.push({
        key: item.key,
        dir: item.dir,
        status: (await pathExists(item.dir)) ? "AVAILABLE" : "NO_SOURCE",
      });
    }
    let stateLabel = "OK";
    if (!running) stateLabel = "NOT_RUNNING";
    else if (consecutiveMissedCycles >= DEGRADED_AFTER_MISSED_CYCLES
      || (computedMissed !== null && computedMissed >= DEGRADED_AFTER_MISSED_CYCLES)) stateLabel = "DEGRADED";
    else if (!lastScanAt) stateLabel = "UNKNOWN";
    const report = {
      ok: stateLabel === "OK",
      state: stateLabel,
      checkedAt: nowIso(now()),
      root,
      label: WATCH_LABEL,
      lastScan: lastScanAt,
      lastScanAgeSeconds: ageSeconds,
      intervalSeconds: interval,
      nextScanEtaSeconds: Number.isFinite(ageSeconds) ? Math.max(0, interval - (ageSeconds % interval)) : interval,
      runningPid,
      running,
      missedCycles: computedMissed,
      consecutiveMissedCycles,
      degradedAfterMissedCycles: DEGRADED_AFTER_MISSED_CYCLES,
      lastRunId: lastRun?.runId || state.lastRunId || null,
      lastIndexed: lastRun?.indexed ?? state.lastIndexed ?? null,
      lastUnchanged: lastRun?.unchanged ?? state.lastUnchanged ?? null,
      lastFailed: lastRun?.failed ?? state.lastFailed ?? null,
      lastQuarantined: lastRun?.quarantined ?? null,
      lastErrorCode: state.lastErrorCode || (lastRun && lastRun.ok === false ? lastRun.error : null) || null,
      totalMaterials: index.materials.length,
      sources,
      recovery: {
        command: `launchctl kickstart -k gui/$(id -u)/${WATCH_LABEL}`,
        altCommand: `bash socialmate-v1.2/service-all.sh learning-archive --once`,
        note: "KeepAlive 会在进程退出时自动拉起并立即补扫；DEGRADED 在下一轮成功扫描后自动清零。",
      },
      cloudCalls: 0,
    };
    await atomicWrite(path.join(root, HEALTH_FILE), JSON.stringify(report, null, 2)).catch(() => {});
    return report;
  }

  async function ingest({sourceType, filename, content, sourceApp}) {
    await ensureLayout();
    const type = safeSourceType(sourceType);
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content ?? ""), "utf8");
    if (!buffer.length) {
      const error = new Error("内容为空"); error.code = "EMPTY_CONTENT"; error.status = 400; throw error;
    }
    if (buffer.length > MAX_FILE_BYTES) {
      const error = new Error(`内容超过 ${MAX_FILE_BYTES} 字节`); error.code = "CONTENT_TOO_LARGE"; error.status = 413; throw error;
    }
    const name = safeName(filename);
    if (!ALLOWED_EXT.has(path.extname(name).toLowerCase())) {
      const error = new Error("只接受 .md/.txt/.json/.jsonl"); error.code = "EXT_NOT_ALLOWED"; error.status = 400; throw error;
    }
    const digest = sha256(buffer);
    const dir = path.join(inboxDir, type, dayStamp(now()));
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    await chmodQuiet(dir, 0o700);
    const target = path.join(dir, `${digest.slice(0, 8)}-${name}`);
    if (!(await pathExists(target))) {
      await fs.writeFile(target, buffer, {mode: 0o600});
      await chmodQuiet(target, 0o600);
    }
    const index = await loadIndex();
    const state = {
      runId: `ingest-${Date.now()}`,
      index,
      roots: [],
      scanned: 0,
      indexed: 0,
      unchanged: 0,
      quarantined: 0,
      skipped: 0,
      skippedConsent: 0,
      failed: 0,
      indexedBySource: {},
    };
    const rootDef = roots.find((item) => item.key === "archive_inbox");
    const relPath = normalizeRel(path.relative(rootDef.dir, target));
    const result = await indexFile({rootDef, absolutePath: target, relPath, sourceType: type, state});
    await saveIndex(index);
    return {
      ok: result.status !== "quarantined",
      status: result.status,
      materialId: result.materialId || null,
      sha256: digest,
      pathRef: `archive_inbox:${relPath}`,
      duplicate: result.status === "unchanged",
      sourceType: type,
      sourceApp: sourceApp || rootDef.sourceApp,
    };
  }

  async function list({sourceType, status: statusFilter, limit = 200} = {}) {
    const index = await loadIndex();
    let items = index.materials;
    if (sourceType) items = items.filter((item) => item.sourceType === sourceType);
    if (statusFilter) items = items.filter((item) => item.processingStatus === statusFilter);
    return {
      ok: true,
      total: items.length,
      materials: items.slice(-Math.max(1, Math.min(Number(limit) || 200, 1000))).map((item) => ({
        materialId: item.materialId,
        sourceType: item.sourceType,
        sourceApp: item.sourceApp,
        sourceId: item.sourceId,
        version: item.version,
        processingStatus: item.processingStatus,
        consentScope: item.consentScope,
        createdAt: item.createdAt,
        placeRefs: item.placeRefs,
        derivedPathRef: item.derivedPathRef,
      })),
    };
  }

  /** 仅撤销索引条目与派生文件；原始资料永远保留在原业务目录，不删除。 */
  async function retract(materialId) {
    const index = await loadIndex();
    const at = index.materials.findIndex((item) => item.materialId === String(materialId));
    if (at < 0) return {ok: false, code: "NOT_FOUND", materialId: String(materialId)};
    const [entry] = index.materials.splice(at, 1);
    if (entry.derivedPathRef) {
      await fs.rm(path.join(root, entry.derivedPathRef), {force: true}).catch(() => {});
      await fs.rm(path.join(processedDir, entry.materialId), {recursive: true, force: true}).catch(() => {});
    }
    index.updatedAt = nowIso(now());
    await saveIndex(index);
    await appendJournal({at: nowIso(now()), action: "retract", materialId: entry.materialId, sourceType: entry.sourceType});
    return {ok: true, materialId: entry.materialId, originalPathRef: entry.originalPathRef, originalKept: true};
  }

  /**
   * 向后兼容的补标签：对已入索引的历史条目按同一套 fixture 规则补 test/sourceTag，
   * 只增字段、不改 materialId/hash/版本号，重复执行幂等。
   */
  async function markTestFixtures() {
    const index = await loadIndex();
    const updated = [];
    for (const item of index.materials) {
      const fileName = path.basename(String(item.relativePath || item.originalPathRef || ""));
      if (!looksLikeTestFixture({fileName})) continue;
      if (item.test === true && item.sourceTag === "qa_fixture") continue;
      item.test = true;
      item.sourceTag = "qa_fixture";
      updated.push(item.materialId);
    }
    if (updated.length) {
      index.updatedAt = nowIso(now());
      await saveIndex(index);
      for (const materialId of updated) {
        await appendJournal({at: nowIso(now()), action: "retag", materialId, sourceTag: "qa_fixture"});
      }
    }
    return {
      ok: true,
      updated,
      total: index.materials.length,
      testFixtures: index.materials.filter((item) => item.test === true || item.sourceTag === "qa_fixture").length,
    };
  }

  return {
    root,
    roots,
    runScan,
    status,
    health,
    recordCycle,
    readWatchState,
    markTestFixtures,
    ingest,
    list,
    retract,
    readIndex: loadIndex,
    ensureLayout,
  };
}