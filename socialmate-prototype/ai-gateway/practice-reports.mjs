/**
 * N05 S5 单段练习复盘（PRACT01）。
 *
 * 边界：
 * - 复盘独立存放，绝不回写 record JSON：同段练两次 = 两个独立文件，旧记录字节不变。
 * - 每条复盘绑定 placeId/recordId/blockId/contentRevision；版本不一致时仍保存，
 *   但标记 status=stale-version，避免旧报告被错归档成当前版本。
 * - 不做「自动已掌握」判定：weakPhrases 只是用户回贴文本的聚合，不推断掌握程度。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const MAX_REPORT_CHARS = 8000;
const MAX_WEAK_PHRASES = 40;
const STATUSES = new Set(["draft", "confirmed", "stale-version", "review", "pass"]);

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function chmodQuiet(target, mode) {
  return fs.chmod(target, mode).catch(() => {});
}

function placeIdOf(value) {
  const text = String(value ?? "");
  if (/^pv-[a-z0-9-]{1,32}$/.test(text)) return text;
  if (!/^\d{1,3}$/.test(text)) throw fail(400, "INVALID_PLACE_ID", "placeId 不合法");
  const id = Number(text);
  if (id < 1 || id > 115) throw fail(400, "INVALID_PLACE_ID", "placeId 超出 115 个固定地点范围");
  return String(id);
}

function safeId(value, code) {
  const text = String(value ?? "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(text)) throw fail(400, code, "标识不合法");
  return text;
}

function cleanPhrases(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw fail(400, "INVALID_WEAK_PHRASES", "weakPhrases 必须是数组");
  return [...new Set(
    value.map((item) => String(item ?? "").replace(/[\u0000-\u001f]/g, " ").trim())
      .filter((item) => item.length > 0 && item.length <= 120),
  )].slice(0, MAX_WEAK_PHRASES);
}

export function createPracticeReportsStore(options = {}) {
  const notesRoot = () => options.notesRoot || process.env.SM_PLACE_NOTES_DIR
    || path.join(REPO_ROOT, "SocialMate-Data", "PlaceNotes");
  const privatePlacesRoot = () => options.privatePlacesRoot || process.env.SM_PRIVATE_PLACES_DIR
    || path.join(REPO_ROOT, "SocialMate-Data", "PrivatePlaces");
  const now = typeof options.now === "function" ? options.now : () => new Date();
  const newId = options.newId || (() => `pr-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`);

  function rootOf(placeId) {
    return placeIdOf(placeId).startsWith("pv-") ? privatePlacesRoot() : notesRoot();
  }

  function reportDir(placeId, blockId) {
    return path.join(rootOf(placeId), placeIdOf(placeId), "practice", safeId(blockId, "INVALID_BLOCK_ID"));
  }

  async function readRecord(placeId, recordId) {
    const file = path.join(rootOf(placeId), placeIdOf(placeId), "records",
      `${safeId(recordId, "INVALID_RECORD_ID")}.json`);
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") throw fail(404, "RECORD_NOT_FOUND", "地点记录不存在");
      throw error;
    }
  }

  async function listReports(placeId, blockId) {
    const dir = reportDir(placeId, blockId);
    let names = [];
    try {
      names = (await fs.readdir(dir)).filter((name) => name.endsWith(".json"));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
    return (await Promise.all(names.map(async (name) => {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, name), "utf8"));
      } catch {
        return null;
      }
    }))).filter(Boolean).sort((a, b) => String(b.practiceTime).localeCompare(String(a.practiceTime)));
  }

  async function save(placeId, recordId, blockId, input = {}) {
    if (input.confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "保存练习复盘需要用户显式确认");
    const place = placeIdOf(placeId);
    const rid = safeId(recordId, "INVALID_RECORD_ID");
    const bid = safeId(blockId, "INVALID_BLOCK_ID");
    const record = await readRecord(place, rid);
    const block = (Array.isArray(record.blocks) ? record.blocks : [])
      .find((item) => String(item?.blockId) === bid);
    if (!block) throw fail(404, "BLOCK_NOT_FOUND", "该记录里没有这个学习段");

    const rawReport = String(input.rawReport ?? "").replace(/[\u0000-\u001f]/g, " ").trim();
    if (rawReport.length < 4) throw fail(400, "EMPTY_REPORT", "复盘内容太短，请粘贴 ChatGPT 的总结");
    if (rawReport.length > MAX_REPORT_CHARS) {
      throw fail(413, "REPORT_TOO_LARGE", `复盘内容超过 ${MAX_REPORT_CHARS} 字符上限`);
    }
    const requestedRevision = Number(input.contentRevision ?? record.revision);
    if (!Number.isInteger(requestedRevision) || requestedRevision < 1) {
      throw fail(400, "INVALID_CONTENT_REVISION", "contentRevision 不合法");
    }
    // 版本不一致仍保留报告（旧文章版本要可读），但明确标记，绝不冒充当前版本。
    const currentRevision = Number(record.revision) || 1;
    const status = requestedRevision === currentRevision
      ? (STATUSES.has(String(input.status)) && String(input.status) !== "stale-version"
        ? String(input.status) : "confirmed")
      : "stale-version";

    const practiceTime = String(input.practiceTime || now().toISOString());
    const parsedTime = Date.parse(practiceTime);
    if (Number.isNaN(parsedTime)) throw fail(400, "INVALID_PRACTICE_TIME", "practiceTime 不是合法时间");

    const report = {
      schema: 1,
      reportId: newId(),
      placeId: place.startsWith("pv-") ? place : Number(place),
      recordId: rid,
      blockId: bid,
      blockContentRevision: Number(block.contentRevision) || 1,
      contentRevision: requestedRevision,
      currentRevision,
      rawReport,
      weakPhrases: cleanPhrases(input.weakPhrases),
      practiceTime: new Date(parsedTime).toISOString(),
      status,
      source: "external_chatgpt_paste",
      autoCaptured: false,
      createdAt: now().toISOString(),
    };

    const dir = reportDir(place, bid);
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    await chmodQuiet(dir, 0o700);
    const file = path.join(dir, `${report.reportId}.json`);
    const temp = path.join(dir, `.${report.reportId}.tmp`);
    await fs.writeFile(temp, JSON.stringify(report, null, 2), {encoding: "utf8", mode: 0o600});
    await chmodQuiet(temp, 0o600);
    await fs.rename(temp, file);
    await chmodQuiet(file, 0o600);

    const verify = JSON.parse(await fs.readFile(file, "utf8"));
    if (verify.rawReport !== rawReport) {
      await fs.rm(file, {force: true });
      throw fail(500, "PRACTICE_WRITE_UNVERIFIED", "复盘写入后自检失败，已删除本次文件");
    }
    return {
      ok: true,
      report,
      staleVersion: status === "stale-version",
      note: status === "stale-version"
        ? "这条复盘属于旧内容版本，已单独保留，不会覆盖或串到当前版本"
        : "复盘已作为独立记录保存，旧记录保持原样",
    };
  }

  /** 弱项聚合（只读）：按 blockId 汇总次数、最近练习时间与弱项词频。 */
  async function aggregate(placeId) {
    const place = placeIdOf(placeId);
    const root = path.join(rootOf(place), place);
    let recordIds = [];
    try {
      recordIds = (await fs.readdir(path.join(root, "records")))
        .filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    let blockIds = [];
    try {
      blockIds = (await fs.readdir(path.join(root, "practice"), {withFileTypes: true}))
        .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const blocks = [];
    const totals = new Map();
    let reportCount = 0;
    for (const blockId of blockIds) {
      const reports = await listReports(place, blockId);
      if (!reports.length) continue;
      reportCount += reports.length;
      const phrases = new Map();
      const statuses = {};
      for (const report of reports) {
        for (const phrase of report.weakPhrases || []) {
          const entry = phrases.get(phrase) || {phrase, count: 0, lastAt: null};
          entry.count += 1;
          if (!entry.lastAt || String(report.practiceTime) > entry.lastAt) entry.lastAt = report.practiceTime;
          phrases.set(phrase, entry);
        }
        statuses[report.status] = (statuses[report.status] || 0) + 1;
      }
      const weakPhrases = [...phrases.values()].sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase));
      for (const item of weakPhrases) {
        const total = totals.get(item.phrase) || {phrase: item.phrase, count: 0};
        total.count += item.count;
        totals.set(item.phrase, total);
      }
      blocks.push({
        blockId,
        recordId: reports[0].recordId,
        practiceCount: reports.length,
        latestPracticeTime: reports[0].practiceTime,
        currentRevision: reports[0].currentRevision,
        statuses,
        weakPhrases,
        reports: reports.map((report) => ({
          reportId: report.reportId,
          contentRevision: report.contentRevision,
          practiceTime: report.practiceTime,
          status: report.status,
          excerpt: String(report.rawReport || '').slice(0, 500),
        })),
      });
    }
    blocks.sort((a, b) => String(b.latestPracticeTime).localeCompare(String(a.latestPracticeTime)));
    return {
      ok: true,
      placeId: place.startsWith("pv-") ? place : Number(place),
      recordIds,
      blockCount: blocks.length,
      reportCount,
      blocks,
      topWeakPhrases: [...totals.values()].sort((a, b) => b.count - a.count).slice(0, 10),
      autoMastery: false,
      note: "只汇总用户回贴的弱项文本，不自动判定已掌握",
    };
  }

  return {save, aggregate, listReports, reportDir, notesRoot};
}

export const PRACTICE_LIMITS = {maxReportChars: MAX_REPORT_CHARS, maxWeakPhrases: MAX_WEAK_PHRASES};