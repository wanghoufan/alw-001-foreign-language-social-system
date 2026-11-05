/**
 * V1.6 三大活资料库：统一私有卡片层。
 *
 * 存储布局（默认 SocialMate-Data/PrivateCards/，可用 SM_PRIVATE_CARDS_DIR 覆盖）：
 *   places/<id>.json        用户新建的私有地点卡片（不写 places-115.json）
 *   stories/<id>.json       关于我
 *   apps/<id>.json          软件作品
 *   overrides/<kind>-<id>.json  对内置/公开资料的覆盖层（原数据不动）
 *   trash/<kind>/<id>.json  软删除区
 *   media/<cardId>/<mediaId>.<ext>  已压缩图片（含缩略图）
 *   .sm-backup/             写前备份
 *
 * 约定：所有写操作先写临时文件再 rename；目录 0700、文件 0600；
 * 卡片一律带 revision（整数）与 updatedAt，PATCH 必须带当前 revision，冲突返回 REVISION_CONFLICT。
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const KINDS = new Set(["place", "story", "app"]);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MEDIA_ID_RE = /^m[a-f0-9]{16}$/;
const MEDIA_FILE_RE = /^m[a-f0-9]{16}\.(jpg|png|webp)$/;
const MAX_CARDS_PER_KIND = 500;
const MAX_TEXT = 4000;
const MAX_TAGS = 12;
const MAX_MEDIA_BYTES = 6 * 1024 * 1024;
const MAX_MEDIA_PER_CARD = 12;
const MAX_IMAGE_EDGE = 4096;

export class CardError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function assertKind(kind) {
  if (!KINDS.has(kind)) throw new CardError(400, "KIND_INVALID", "kind 只能是 place / story / app");
  return kind;
}

function assertId(id) {
  const value = String(id || "");
  if (!ID_RE.test(value)) throw new CardError(400, "ID_INVALID", "卡片 id 只能是小写字母数字与连字符");
  return value;
}

function clip(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, max);
}

function normalizeTags(input) {
  const list = Array.isArray(input) ? input : (typeof input === "string" ? input.split(/[,，\s]+/) : []);
  const out = [];
  for (const item of list) {
    const tag = clip(item, 24).trim();
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

function slugify(value) {
  const ascii = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  if (ascii) return ascii;
  return "c-" + crypto.createHash("sha1").update(String(value || Date.now())).digest("hex").slice(0, 8);
}

function nowIso() {
  return new Date().toISOString();
}

let tmpSeq = 0;
function atomicWrite(file, text, mode = 0o600) {
  tmpSeq += 1;
  // 临时名必须每次唯一：同进程并发写同一目标时，共用一个 tmp 会互相覆盖/rename ENOENT。
  const tmp = path.join(path.dirname(file),
    "." + path.basename(file) + "." + process.pid + "." + tmpSeq.toString(36) + "." +
    crypto.randomBytes(6).toString("hex") + ".tmp");
  return fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700})
    .then(() => fs.writeFile(tmp, text, {mode}))
    .then(() => fs.chmod(tmp, mode))
    .then(() => fs.rename(tmp, file))
    .catch((err) => fs.rm(tmp, {force: true}).catch(() => {}).then(() => { throw err; }));
}

/** 目标文件级串行队列：同一张卡片的读-改-写排队，不同卡片仍可并行。 */
function createLockTable() {
  const queues = new Map();
  return function withLock(key, fn) {
    const prev = queues.get(key) || Promise.resolve();
    // 前一次失败也要让下一次继续跑，否则一次写错会永久卡住该卡片。
    const run = prev.then(fn, fn);
    const tail = run.then(() => {}, () => {});
    queues.set(key, tail);
    tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return run;
  };
}

async function readJson(file) {
  try {
    return JSON.parse((await fs.readFile(file, "utf8")) || "null");
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
    throw err;
  }
}

/** 轻量图片头解析：只取宽高，不做解码。 */
function imageSize(buf) {
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return {format: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
  }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8X" && buf.length >= 30) {
      return {format: "webp", width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3)};
    }
    if (chunk === "VP8 " && buf.length >= 30) {
      return {format: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff};
    }
    return {format: "webp", width: 0, height: 0};
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buf[offset + 1];
      const length = buf.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return {format: "jpeg", width: buf.readUInt16BE(offset + 7), height: buf.readUInt16BE(offset + 5)};
      }
      offset += 2 + length;
    }
    return {format: "jpeg", width: 0, height: 0};
  }
  return null;
}

export function createPrivateCards(options = {}) {
  const root = options.root || process.env.SM_PRIVATE_CARDS_DIR
    || path.join(repoRoot, "SocialMate-Data", "PrivateCards");

  const dirOf = (kind) => path.join(root, kind === "place" ? "places" : kind === "story" ? "stories" : "apps");
  const fileOf = (kind, id) => path.join(dirOf(kind), assertId(id) + ".json");
  const trashDir = (kind) => path.join(root, "trash", kind);
  const trashFile = (kind, id) => path.join(trashDir(kind), assertId(id) + ".json");
  const overrideFile = (kind, id) => path.join(root, "overrides", kind + "-" + assertId(id) + ".json");
  const mediaDir = (cardId) => path.join(root, "media", assertId(cardId));
  const backupDir = () => path.join(root, ".sm-backup");
  const withCardLock = createLockTable();

  /** 损坏的卡片文件不能静默消失：记进 warnings，同时打一行服务端日志。 */
  function noteCorrupt(warnings, kind, name, err) {
    const warning = {kind, file: name, error: String((err && err.message) || err)};
    if (Array.isArray(warnings)) warnings.push(warning);
    console.warn("[private-cards] 跳过损坏卡片文件:", JSON.stringify(warning));
  }

  async function backup(kind, id, record) {
    try {
      await fs.mkdir(backupDir(), {recursive: true, mode: 0o700});
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await atomicWrite(path.join(backupDir(), kind + "-" + id + "-" + stamp + ".json"),
        JSON.stringify(record, null, 2));
    } catch { /* 备份失败不阻断主写入，与既有 store 保持一致 */ }
  }

  function normalizeCard(kind, raw, existing = null) {
    const stamp = nowIso();
    const base = existing || {};
    const id = base.id || assertId(raw.id || (kind === "place" ? "pv-" + slugify(raw.cnName || raw.enName || raw.cn || "card") : slugify(raw.title || raw.cn || raw.en || "card")));
    return {
      id,
      kind,
      schema: 1,
      private: true,
      revision: Number(base.revision || 0),
      createdAt: base.createdAt || stamp,
      updatedAt: stamp,
      deletedAt: null,
      cnName: clip(raw.cnName || base.cnName, 80),
      enName: clip(raw.enName || base.enName, 120),
      title: clip(raw.title || base.title, 80),
      cn: clip(raw.cn === undefined ? base.cn : raw.cn, MAX_TEXT),
      en: clip(raw.en === undefined ? base.en : raw.en, MAX_TEXT),
      city: clip(raw.city === undefined ? base.city : raw.city, 40),
      category: clip(raw.category === undefined ? base.category : raw.category, 40),
      cat: clip(raw.cat === undefined ? base.cat : raw.cat, 40),
      tags: normalizeTags(raw.tags === undefined ? base.tags : raw.tags),
      coverMediaId: base.coverMediaId || "",
      media: Array.isArray(base.media) ? base.media : [],
      source: clip(raw.source || base.source || "user", 40),
      prompt: clip(raw.prompt === undefined ? base.prompt : raw.prompt, MAX_TEXT),
      status: clip(raw.status === undefined ? base.status : raw.status, 80),
    };
  }

  async function list(kind, {includeDeleted = false, warnings = null} = {}) {
    assertKind(kind);
    const live = [];
    const dir = dirOf(kind);
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      if (!err || (err.code !== "ENOENT" && err.code !== "ENOTDIR")) throw err;
    }
    for (const name of names) {
      if (!name.endsWith(".json") || name.startsWith(".")) continue;
      let record;
      try {
        record = await readJson(path.join(dir, name));
      } catch (err) {
        noteCorrupt(warnings, kind, name, err);
        continue;
      }
      if (!record || record.kind !== kind) continue;
      live.push(record);
    }
    live.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    if (!includeDeleted) return live;
    const deleted = [];
    let trashed = [];
    try {
      trashed = await fs.readdir(trashDir(kind));
    } catch { /* 没有回收站就是空 */ }
    for (const name of trashed) {
      if (!name.endsWith(".json")) continue;
      let record;
      try {
        record = await readJson(path.join(trashDir(kind), name));
      } catch (err) {
        noteCorrupt(warnings, kind, name, err);
        continue;
      }
      if (record) deleted.push(record);
    }
    return live.concat(deleted.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt))));
  }

  async function get(kind, id) {
    assertKind(kind);
    const record = await readJson(fileOf(kind, id));
    if (!record) throw new CardError(404, "CARD_NOT_FOUND", "卡片不存在");
    return record;
  }

  async function create(input = {}) {
    const kind = assertKind(input.kind);
    const all = await list(kind);
    if (all.length >= MAX_CARDS_PER_KIND) throw new CardError(429, "CARD_LIMIT", "该类卡片已达上限");
    const explicit = input.id ? assertId(input.id) : "";
    const base = explicit || (kind === "place"
      ? "pv-" + slugify(input.cnName || input.enName || input.cn || "card")
      : slugify(input.title || input.cn || input.en || "card"));
    let id = base;
    let n = 2;
    for (;;) {
      const file = fileOf(kind, id);
      // 同 id 的「查重 + 写入」必须原子：两个窗口同时新建同名卡片时不能互相覆盖。
      const record = await withCardLock(file, async () => {
        if (await readJson(file)) return null;
        const card = normalizeCard(kind, {...input, id});
        card.revision = 1;
        card.createdAt = nowIso();
        card.updatedAt = card.createdAt;
        await atomicWrite(file, JSON.stringify(card, null, 2));
        return card;
      });
      if (record) return record;
      if (explicit) throw new CardError(409, "CARD_EXISTS", "同 id 卡片已存在");
      id = base.slice(0, 56) + "-" + n;
      n += 1;
    }
  }

  async function update(kind, id, {revision, patch} = {}) {
    assertKind(kind);
    const file = fileOf(kind, id);
    return withCardLock(file, async () => {
      const current = await get(kind, id);
      // P1：契约要求 PATCH 必须带当前 revision；缺省一律拒绝，不再默认放行。
      if (revision === undefined || revision === null) {
        const missing = new CardError(400, "REVISION_REQUIRED", "修改卡片必须带当前 revision");
        missing.currentRevision = current.revision;
        throw missing;
      }
      if (Number(revision) !== Number(current.revision)) {
        const conflict = new CardError(409, "REVISION_CONFLICT", "卡片已被其他窗口修改，请刷新后再改");
        conflict.currentRevision = current.revision;
        throw conflict;
      }
      const next = normalizeCard(kind, {...(patch || {}), id}, current);
      next.revision = Number(current.revision) + 1;
      await backup(kind, id, current);
      await atomicWrite(file, JSON.stringify(next, null, 2));
      return next;
    });
  }

  async function softDelete(kind, id) {
    assertKind(kind);
    const file = fileOf(kind, id);
    return withCardLock(file, async () => {
      const current = await get(kind, id);
      const trashed = {...current, deletedAt: nowIso(), revision: Number(current.revision) + 1};
      await backup(kind, id, current);
      await atomicWrite(trashFile(kind, id), JSON.stringify(trashed, null, 2));
      await fs.rm(file, {force: true});
      return trashed;
    });
  }

  async function restore(kind, id) {
    assertKind(kind);
    const file = fileOf(kind, id);
    return withCardLock(file, async () => {
      const trashed = await readJson(trashFile(kind, id));
      if (!trashed) throw new CardError(404, "TRASH_NOT_FOUND", "回收站里没有这张卡片");
      // 删除后允许用同 id 新建；此时恢复不能覆盖在库卡片，返回 409 交给用户决定。
      const live = await readJson(file);
      if (live) {
        const conflict = new CardError(409, "RESTORE_CONFLICT", "同 id 卡片已存在，未覆盖");
        conflict.currentRevision = live.revision;
        throw conflict;
      }
      await fs.mkdir(dirOf(kind), {recursive: true, mode: 0o700});
      trashed.deletedAt = null;
      trashed.updatedAt = nowIso();
      trashed.revision = Number(trashed.revision) + 1;
      await atomicWrite(file, JSON.stringify(trashed, null, 2));
      await fs.rm(trashFile(kind, id), {force: true});
      return trashed;
    });
  }

  /** 覆盖层：只记录被用户改写的字段，原 115 地点/内置资料保持只读。 */
  async function putOverride(kind, id, patch = {}) {
    assertKind(kind);
    const file = overrideFile(kind, id);
    const current = (await readJson(file)) || {kind, id, createdAt: nowIso(), revision: 0};
    const next = {
      ...current,
      values: {...(current.values || {}), ...(patch || {})},
      revision: Number(current.revision || 0) + 1,
      updatedAt: nowIso(),
      deletedAt: null,
    };
    delete next.values.deletedAt;
    await atomicWrite(file, JSON.stringify(next, null, 2));
    return next;
  }

  async function listOverrides(kind) {
    assertKind(kind);
    const dir = path.join(root, "overrides");
    let names = [];
    try { names = await fs.readdir(dir); } catch { return []; }
    const out = [];
    for (const name of names) {
      if (!name.startsWith(kind + "-") || !name.endsWith(".json")) continue;
      const record = await readJson(path.join(dir, name)).catch(() => null);
      if (record && !record.deletedAt) out.push(record);
    }
    return out;
  }

  async function getOverride(kind, id) {
    return readJson(overrideFile(kind, id));
  }

  async function deleteOverride(kind, id) {
    await fs.rm(overrideFile(kind, id), {force: true});
    return {ok: true};
  }

  async function addMedia(kind, id, {data, mime} = {}) {
    assertKind(kind);
    const file = fileOf(kind, id);
    // 同一卡片的「读卡片 → 追加条目 → 写回」串行；不同卡片仍并行，避免全局排队。
    return withCardLock(file, async () => {
      const card = await get(kind, id);
      if (!Array.isArray(card.media)) card.media = [];
      if (card.media.length >= MAX_MEDIA_PER_CARD) throw new CardError(429, "MEDIA_LIMIT", "每张卡片最多 12 张图片");
      const text = String(data || "");
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(text) || text.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 64) {
        throw new CardError(400, "MEDIA_INVALID", "图片数据非法或过大");
      }
      const buf = Buffer.from(text, "base64");
      if (buf.length > MAX_MEDIA_BYTES) throw new CardError(413, "MEDIA_TOO_LARGE", "单张图片压缩后不得超过 6MB");
      const size = imageSize(buf);
      if (!size) throw new CardError(400, "MEDIA_TYPE_INVALID", "只接受 JPEG / PNG / WebP");
      if ((size.width && size.width > MAX_IMAGE_EDGE) || (size.height && size.height > MAX_IMAGE_EDGE)) {
        throw new CardError(400, "MEDIA_DIMENSION", "图片边长不得超过 4096px");
      }
      const ext = size.format === "jpeg" ? "jpg" : size.format === "png" ? "png" : "webp";
      const mediaId = "m" + crypto.randomBytes(8).toString("hex");
      const dir = mediaDir(card.id);
      await fs.mkdir(dir, {recursive: true, mode: 0o700});
      const mediaFile = path.join(dir, mediaId + "." + ext);
      await atomicWrite(mediaFile, buf);
      const entry = {
        id: mediaId,
        file: path.basename(mediaFile),
        mime: mime && /^image\/(jpeg|png|webp)$/.test(mime) ? mime : "image/" + (ext === "jpg" ? "jpeg" : ext),
        bytes: buf.length,
        width: size.width,
        height: size.height,
        addedAt: nowIso(),
      };
      card.media.push(entry);
      if (!card.coverMediaId) card.coverMediaId = mediaId;
      card.revision = Number(card.revision) + 1;
      card.updatedAt = nowIso();
      await atomicWrite(file, JSON.stringify(card, null, 2));
      return {media: entry, card};
    });
  }

  async function setCover(kind, id, mediaId) {
    assertKind(kind);
    const file = fileOf(kind, id);
    return withCardLock(file, async () => {
      const card = await get(kind, id);
      if (!(card.media || []).some((m) => m.id === mediaId)) {
        throw new CardError(404, "MEDIA_NOT_FOUND", "图片不属于这张卡片");
      }
      card.coverMediaId = mediaId;
      card.revision = Number(card.revision) + 1;
      card.updatedAt = nowIso();
      await atomicWrite(file, JSON.stringify(card, null, 2));
      return card;
    });
  }

  /** 只按 mediaId 在 media/<cardId>/ 下找唯一候选文件，不信任卡片里存的 file 字段。 */
  async function findMediaFile(cardId, mediaId) {
    if (!MEDIA_ID_RE.test(String(mediaId || ""))) {
      throw new CardError(400, "MEDIA_PATH_INVALID", "图片路径非法");
    }
    const dir = mediaDir(cardId);
    let names = [];
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) return null;
      throw err;
    }
    const matcher = new RegExp("^" + mediaId + "\\.(jpg|png|webp)$");
    const matches = names.filter((name) => matcher.test(name));
    if (matches.length === 0) return null;
    if (matches.length > 1) throw new CardError(409, "MEDIA_AMBIGUOUS", "同一图片存在多个候选文件");
    const file = path.join(dir, matches[0]);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new CardError(400, "MEDIA_PATH_INVALID", "图片路径非法");
    if (path.dirname(path.resolve(file)) !== path.resolve(dir)) {
      throw new CardError(400, "MEDIA_PATH_INVALID", "图片路径非法");
    }
    return file;
  }

  async function deleteMedia(kind, id, mediaId) {
    assertKind(kind);
    const file = fileOf(kind, id);
    return withCardLock(file, async () => {
      const card = await get(kind, id);
      const entry = (card.media || []).find((m) => m.id === mediaId);
      if (!entry) throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
      const target = await findMediaFile(card.id, mediaId);
      if (target) await fs.rm(target, {force: true});
      card.media = card.media.filter((m) => m.id !== mediaId);
      if (card.coverMediaId === mediaId) card.coverMediaId = card.media[0] ? card.media[0].id : "";
      card.revision = Number(card.revision) + 1;
      card.updatedAt = nowIso();
      await atomicWrite(file, JSON.stringify(card, null, 2));
      return card;
    });
  }

  async function readMedia(cardId, fileName) {
    const safeCard = assertId(cardId);
    const base = path.basename(String(fileName || ""));
    if (!MEDIA_FILE_RE.test(base)) throw new CardError(400, "MEDIA_PATH_INVALID", "图片路径非法");
    const dir = mediaDir(safeCard);
    const file = path.join(dir, base);
    let stat;
    try {
      stat = await fs.lstat(file);
    } catch {
      throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
    }
    // lstat 不跟随软链接：符号链接直接拒绝，其余非普通文件（目录/设备）同样拒绝。
    if (stat.isSymbolicLink() || !stat.isFile()) throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
    let real, realDir;
    try {
      real = await fs.realpath(file);
      realDir = await fs.realpath(dir);
    } catch {
      throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
    }
    if (real !== path.join(realDir, base)) throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
    try {
      const buf = await fs.readFile(real);
      const ext = path.extname(base).slice(1);
      return {buf, mime: ext === "jpg" ? "image/jpeg" : "image/" + ext};
    } catch {
      throw new CardError(404, "MEDIA_NOT_FOUND", "图片不存在");
    }
  }

  async function stats() {
    const out = {root, kinds: {}};
    for (const kind of KINDS) {
      const live = await list(kind);
      const all = await list(kind, {includeDeleted: true});
      out.kinds[kind] = {live: live.length, deleted: all.length - live.length};
    }
    return out;
  }

  return {
    root, list, get, create, update, softDelete, restore,
    putOverride, listOverrides, getOverride, deleteOverride,
    addMedia, setCover, deleteMedia, readMedia, stats,
  };
}