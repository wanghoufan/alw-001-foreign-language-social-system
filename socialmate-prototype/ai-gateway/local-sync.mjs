/**
 * V1.7 局域网同步 MVP（手机 ↔ Mac）。
 *
 * 边界：
 * - 上传只写 `<dataDir>/Backups/<deviceId>-<exportedAt>.json`，不写 People / PrivateCards /
 *   PrivatePlaces / PlaceNotes 等真源目录；
 * - 拉取是纯只读组合：复用现有 store 的读取函数，不新增第二套数据模型；
 * - 不返回密钥、令牌或归档会话原文；错误信息固定中文，不回显服务器绝对路径；
 * - 鉴权沿用 server.mjs 的私网/同源 + x-archive-token（由挂载处完成）。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {listPeople} from "./people-store.mjs";
import {getPersonDetail} from "./person-detail.mjs";
import {createPrivateCards} from "./private-cards.mjs";
import {createPrivatePlaces} from "./private-places.mjs";
import {createPlaceNotesStore} from "./place-notes.mjs";
import {createPracticeReportsStore} from "./practice-reports.mjs";
import {listFavorites} from "./favorites-store.mjs";
import {readProfile} from "./profile-store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_DATA_DIR = path.join(REPO_ROOT, "SocialMate-Data");
const APP = "SocialMate";
const SCHEMA = 1;
const MAX_BYTES = 40 * 1024 * 1024;
const DEVICE_ID = /^[A-Za-z0-9._-]{1,64}$/;
const CARD_KINDS = ["place", "story", "app"];

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  res.end(JSON.stringify(obj));
}

/** 读取请求体；超过上限时继续排空但不保留内容，避免把内存打满。 */
async function readBody(req, limit) {
  let total = 0;
  let tooLarge = false;
  let parts = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) {
      tooLarge = true;
      parts = [];
      continue;
    }
    if (!tooLarge) parts.push(chunk);
  }
  if (tooLarge) return {tooLarge: true, bytes: total, text: null};
  return {tooLarge: false, bytes: total, text: Buffer.concat(parts).toString("utf8")};
}

function validatePush(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {code: "INVALID_BODY", error: "请求体必须是对象"};
  }
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId : "";
  if (!DEVICE_ID.test(deviceId)) {
    return {code: "INVALID_DEVICE_ID",
      error: "deviceId 只允许字母、数字、点、下划线和短横线（1–64 位）"};
  }
  const exportedAt = typeof payload.exportedAt === "string" ? payload.exportedAt : "";
  const stamp = Date.parse(exportedAt);
  if (!exportedAt || !Number.isFinite(stamp)) {
    return {code: "INVALID_EXPORTED_AT", error: "exportedAt 必须是合法的 ISO 时间"};
  }
  const backup = payload.backup;
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    return {code: "INVALID_BACKUP", error: "backup 必须是对象"};
  }
  if (backup.schema !== SCHEMA) {
    return {code: "SCHEMA_MISMATCH", error: "backup.schema 必须为 1"};
  }
  if (backup.app !== APP) {
    return {code: "APP_MISMATCH", error: "backup.app 必须为 SocialMate"};
  }
  return {ok: true, deviceId, exportedAt: new Date(stamp).toISOString()};
}

async function readPrefsFile(dataDir) {
  try {
    const raw = await fs.readFile(path.join(dataDir, "Prefs", "ui.json"), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {object} [options]
 * @param {string} [options.dataDir] 数据根目录（默认 SocialMate-Data，可用 SM_DATA_DIR 覆盖）
 * @param {number} [options.maxBytes] 上传上限（默认 40MB）
 * @param {object} [options.privateCards] 复用 server.mjs 已创建的卡片层
 * @param {object} [options.privatePlaces] 复用私有地点层
 * @param {object} [options.placeNotes] 复用地点记录层
 * @param {object} [options.practiceStore] 复用练习复盘层
 * @param {Function} [options.readPrefs] 复用 server.mjs 的界面偏好读取
 */
export function createLocalSync(options = {}) {
  const dataDir = path.resolve(options.dataDir || process.env.SM_DATA_DIR || DEFAULT_DATA_DIR);
  const backupsDir = path.resolve(options.backupsDir || path.join(dataDir, "Backups"));
  const maxBytes = Number(options.maxBytes) > 0 ? Number(options.maxBytes) : MAX_BYTES;

  let sources = null;
  function resolveSources() {
    if (sources) return sources;
    const privateCards = options.privateCards
      || createPrivateCards({root: path.join(dataDir, "PrivateCards")});
    const privatePlaces = options.privatePlaces
      || createPrivatePlaces({root: path.join(dataDir, "PrivatePlaces")});
    const placeNotes = options.placeNotes
      || createPlaceNotesStore({
        notesRoot: path.join(dataDir, "PlaceNotes"),
        privatePlaces,
      });
    const practiceStore = options.practiceStore
      || createPracticeReportsStore({
        notesRoot: path.join(dataDir, "PlaceNotes"),
        privatePlacesRoot: path.join(dataDir, "PrivatePlaces"),
      });
    sources = {
      listPeople: options.listPeople || listPeople,
      personDetail: options.personDetail || ((slug) => getPersonDetail(slug)),
      privateCards,
      privatePlaces,
      placeNotes,
      practiceStore,
      listFavorites: options.listFavorites || listFavorites,
      readProfile: options.readProfile || readProfile,
      readPrefs: options.readPrefs || (() => readPrefsFile(dataDir)),
    };
    return sources;
  }

  async function collectPeople(s) {
    const rows = await s.listPeople();
    const people = [];
    for (const row of rows) {
      let detail = null;
      try {
        const result = await s.personDetail(row.slug);
        detail = result?.person || null;
      } catch {
        detail = null;
      }
      people.push({slug: row.slug, name: row.name, hasProfile: row.hasProfile === true, detail});
    }
    return people;
  }

  async function collectCards(s) {
    // 手机导入契约是扁平 cards 数组（每条带 kind），不是 {kind: rows} 对象。
    const out = [];
    for (const kind of CARD_KINDS) {
      const rows = await s.privateCards.list(kind, {includeDeleted: true});
      for (const card of rows) out.push({...card, kind: card.kind || kind});
    }
    return out;
  }

  async function collectPlaceRecords(s) {
    const notesRoot = s.placeNotes.notesRoot();
    const ids = [];
    let entries = [];
    try {
      entries = await fs.readdir(notesRoot, {withFileTypes: true});
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^\d{1,3}$/.test(entry.name)) continue;
      const id = Number(entry.name);
      if (id >= 1 && id <= 115) ids.push(id);
    }
    for (const place of await s.privatePlaces.readAll()) {
      if (typeof place?.id === "string" && !ids.includes(place.id)) ids.push(place.id);
    }
    if (!ids.includes(s.placeNotes.UNASSIGNED)) ids.push(s.placeNotes.UNASSIGNED);

    const out = [];
    for (const placeId of ids) {
      let records = [];
      try {
        records = await s.placeNotes.listRecordsWithProgress(placeId);
      } catch {
        records = [];
      }
      // 手机导入契约是扁平 records（每条带 placeId），不是 {placeId, records} 分组。
      for (const record of records) out.push({...record, placeId});
    }
    return out;
  }

  async function collectPractice(s, placeRecords) {
    const out = [];
    for (const record of placeRecords) {
      const placeId = record.placeId;
      for (const block of record.blocks || []) {
        let reports = [];
        try {
          reports = await s.practiceStore.listReports(placeId, block.blockId);
        } catch {
          reports = [];
        }
        for (const report of reports) {
          out.push({...report, placeId, recordId: record.recordId, blockId: block.blockId});
        }
      }
    }
    return out;
  }

  async function buildBackup() {
    const s = resolveSources();
    const exportedAt = new Date().toISOString();
    const people = await collectPeople(s);
    const cards = await collectCards(s);
    const favorites = await s.listFavorites();
    const privatePlaces = await s.privatePlaces.readAll();
    const placeRecords = await collectPlaceRecords(s);
    const practice = await collectPractice(s, placeRecords);
    const prefs = await s.readPrefs().catch(() => ({}));
    const profile = await s.readProfile().catch(() => null);
    return {schema: SCHEMA, app: APP, exportedAt, people, cards, favorites,
      privatePlaces, placeRecords, practice, prefs, profile};
  }

  async function handlePush(req, res) {
    if (req.method !== "POST") {
      return sendJson(res, 405, {ok: false, code: "METHOD_NOT_ALLOWED",
        error: "同步上传只接受 POST"});
    }
    const read = await readBody(req, maxBytes);
    if (read.tooLarge) {
      return sendJson(res, 413, {ok: false, code: "TOO_LARGE",
        error: `备份超过 ${Math.round(maxBytes / 1024 / 1024)}MB 上限`});
    }
    let payload;
    try {
      payload = JSON.parse(read.text);
    } catch {
      return sendJson(res, 400, {ok: false, code: "INVALID_JSON", error: "请求体不是合法 JSON"});
    }
    const checked = validatePush(payload);
    if (!checked.ok) {
      return sendJson(res, 400, {ok: false, code: checked.code, error: checked.error});
    }

    const safeStamp = checked.exportedAt.replace(/[:.]/g, "-");
    const fileName = `${checked.deviceId}-${safeStamp}.json`;
    const target = path.join(backupsDir, fileName);
    if (path.dirname(target) !== backupsDir) {
      return sendJson(res, 500, {ok: false, code: "BACKUP_WRITE_FAILED",
        error: "备份写入失败：目标路径不合法"});
    }
    const receivedAt = new Date().toISOString();
    const stored = {schema: SCHEMA, app: APP, deviceId: checked.deviceId,
      exportedAt: checked.exportedAt, receivedAt, backup: payload.backup};
    const text = JSON.stringify(stored, null, 2);
    const temp = path.join(backupsDir,
      `.${fileName}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`);
    try {
      await fs.mkdir(backupsDir, {recursive: true, mode: 0o700});
      await fs.chmod(backupsDir, 0o700).catch(() => {});
      await fs.writeFile(temp, text, {encoding: "utf8", mode: 0o600});
      await fs.chmod(temp, 0o600).catch(() => {});
      await fs.rename(temp, target);
      await fs.chmod(target, 0o600).catch(() => {});
    } catch {
      await fs.rm(temp, {force: true}).catch(() => {});
      return sendJson(res, 500, {ok: false, code: "BACKUP_WRITE_FAILED",
        error: "备份写入失败：服务器未能保存到本地备份目录"});
    }
    return sendJson(res, 200, {ok: true, stored: true,
      file: path.relative(dataDir, target).split(path.sep).join("/"),
      bytes: Buffer.byteLength(text), at: receivedAt});
  }

  async function handlePull(req, res) {
    if (req.method !== "GET") {
      return sendJson(res, 405, {ok: false, code: "METHOD_NOT_ALLOWED", error: "拉取备份只接受 GET"});
    }
    let backup;
    try {
      backup = await buildBackup();
    } catch {
      return sendJson(res, 500, {ok: false, code: "BACKUP_EXPORT_FAILED",
        error: "导出备份失败：读取本机数据时出错"});
    }
    return sendJson(res, 200, {ok: true, backup, at: backup.exportedAt});
  }

  async function handleStatus(req, res) {
    if (req.method !== "GET") {
      return sendJson(res, 405, {ok: false, code: "METHOD_NOT_ALLOWED", error: "同步状态只接受 GET"});
    }
    let entries = [];
    try {
      entries = await fs.readdir(backupsDir, {withFileTypes: true});
    } catch (error) {
      if (error.code !== "ENOENT") {
        return sendJson(res, 500, {ok: false, code: "BACKUP_STATUS_FAILED",
          error: "读取备份目录状态失败"});
      }
    }
    let backups = 0;
    let latest = null;
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name.startsWith(".")) continue;
      backups += 1;
      let stat = null;
      try {
        stat = await fs.stat(path.join(backupsDir, entry.name));
      } catch {
        stat = null;
      }
      if (stat && (!latest || stat.mtimeMs > latest)) latest = stat.mtimeMs;
    }
    return sendJson(res, 200, {ok: true, service: "local-sync", backups,
      lastAt: latest === null ? null : new Date(latest).toISOString()});
  }

  return {dataDir, backupsDir, maxBytes, handlePush, handlePull, handleStatus, buildBackup};
}