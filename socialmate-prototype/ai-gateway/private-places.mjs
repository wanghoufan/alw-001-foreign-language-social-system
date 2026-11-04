/**
 * N05 V1.2 T2 私有地点命名空间。
 *
 * 边界（与 place-notes 一致，且更严）：
 * - 只写 `SocialMate-Data/PrivatePlaces/<id>/place.json` 与该目录下的 `records/`；
 * - 绝不读写 `socialmate-v1.2/source/places-115.json`，也绝不生成 1–115 的 id；
 * - id 形如 `pv-hongcheng-park`（小写 ASCII），由服务端从中文名派生，客户端不能传路径；
 * - 新建必须 `confirm === true`；同 id 已存在时返回既有条目（不覆盖）。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_ROOT = path.join(REPO_ROOT, "SocialMate-Data", "PrivatePlaces");
const ID_RE = /^pv-[a-z0-9][a-z0-9-]{1,31}$/;

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

export function isPrivatePlaceId(value) {
  return ID_RE.test(String(value ?? ""));
}

export function assertPrivatePlaceId(value) {
  const text = String(value ?? "");
  if (!ID_RE.test(text)) throw fail(400, "INVALID_PRIVATE_PLACE_ID", "私有地点 id 必须形如 pv-lower-ascii");
  return text;
}

/** 中文名 → 稳定 id：取拼音不可行，这里用用户给的英文名 slug；没有则用时间戳后缀。 */
export function slugOf(input) {
  const base = String(input?.enName || input?.slugHint || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  if (base) return `pv-${base}`;
  return `pv-${crypto.createHash("sha1").update(String(input?.cnName || "place")).digest("hex").slice(0, 8)}`;
}

export function createPrivatePlaces(options = {}) {
  const root = () => options.root || process.env.SM_PRIVATE_PLACES_DIR || DEFAULT_ROOT;

  const dirOf = (id) => path.join(root(), assertPrivatePlaceId(id));
  const fileOf = (id) => path.join(dirOf(id), "place.json");

  async function readAll() {
    let names = [];
    try {
      names = await fs.readdir(root());
    } catch {
      return [];
    }
    const out = [];
    for (const name of names.sort()) {
      if (!isPrivatePlaceId(name)) continue;
      try {
        out.push(JSON.parse(await fs.readFile(fileOf(name), "utf8")));
      } catch {
        // 单个文件坏掉不影响其他私有地点
      }
    }
    return out;
  }

  async function get(id) {
    const safe = assertPrivatePlaceId(id);
    try {
      return JSON.parse(await fs.readFile(fileOf(safe), "utf8"));
    } catch {
      throw fail(404, "PRIVATE_PLACE_NOT_FOUND", "没有这个私有地点");
    }
  }

  async function create(input = {}) {
    if (input.confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "新建私有地点需要 confirm=true");
    const cnName = String(input.cnName ?? "").trim();
    if (!cnName) throw fail(400, "CN_NAME_REQUIRED", "中文名不能为空");
    if (cnName.length > 40) throw fail(400, "CN_NAME_TOO_LONG", "中文名过长");
    const id = isPrivatePlaceId(input.id) ? assertPrivatePlaceId(input.id) : slugOf(input);
    const existing = await readAll();
    const same = existing.find((item) => item.id === id);
    if (same) return {ok: true, created: false, place: same};

    const now = new Date().toISOString();
    const place = {
      id,
      private: true,
      cnName,
      enName: String(input.enName ?? "").trim().slice(0, 60),
      city: String(input.city ?? "海口").trim().slice(0, 20),
      category: String(input.category ?? "私有地点").trim().slice(0, 20),
      cn: String(input.cn ?? "").slice(0, 2000),
      en: String(input.en ?? "").slice(0, 2000),
      photos: Array.isArray(input.photos) ? input.photos.slice(0, 12) : [],
      source: String(input.source ?? "user_private"),
      note: String(input.note ?? "").slice(0, 400),
      createdAt: now,
      updatedAt: now,
    };
    await fs.mkdir(dirOf(id), {recursive: true, mode: 0o700});
    await fs.chmod(dirOf(id), 0o700).catch(() => {});
    const tmp = path.join(dirOf(id), `.place-${process.pid}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(place, null, 2), {encoding: "utf8", mode: 0o600});
    await fs.chmod(tmp, 0o600).catch(() => {});
    await fs.rename(tmp, fileOf(id));
    await fs.chmod(fileOf(id), 0o600).catch(() => {});
    return {ok: true, created: true, place};
  }

  /** 与 115 源同构的字段（供前端合并展示）。 */
  function toPublic(place) {
    return {
      id: place.id,
      private: true,
      cnName: place.cnName,
      enName: place.enName,
      city: place.city,
      category: place.category,
      cn: place.cn,
      en: place.en,
      photos: place.photos || [],
      createdAt: place.createdAt,
    };
  }

  return {readAll, get, create, toPublic, dirOf, fileOf, root};
}