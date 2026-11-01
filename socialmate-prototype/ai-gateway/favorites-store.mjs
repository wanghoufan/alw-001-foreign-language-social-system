/**
 * 收藏表达（P2-03）：本机 Markdown/JSON 轻量存储，不另建平台、不动 Profile。
 *
 * 边界：
 * - 目录 0700、文件 0600；默认落在 SocialMate-Data/Favorites/（已被 .gitignore 排除）。
 * - 同一条表达（英文归一化后比较）重复收藏不新增，直接返回已有条目并标 duplicate:true。
 * - 容量上限 500 条；超限明确拒绝并提示先删除，绝不静默丢弃。
 * - profile.schema=1 属于 Profile，本模块只写自己的 files，不读写 Profile。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_DIR = path.join(REPO_ROOT, "SocialMate-Data", "Favorites");

export const FAVORITES_LIMIT = 500;
const MAX_EN = 300;
const MAX_ZH = 300;
const MAX_SOURCE = 200;
const SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

export function favoritesDir() {
  return process.env.SM_FAVORITES_DIR || DEFAULT_DIR;
}

function jsonFile() {
  return path.join(favoritesDir(), "favorites.json");
}

function mdFile() {
  return path.join(favoritesDir(), "favorites.md");
}

function chmodQuiet(target, mode) {
  return fs.chmod(target, mode).catch(() => {});
}

/** 归一化只用于判重与生成稳定 ID，不改变存储的原文。 */
export function normalizeFavorite(en) {
  return String(en || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
}

function favoriteId(en) {
  return `fav-${crypto.createHash("sha1").update(normalizeFavorite(en).toLowerCase()).digest("hex").slice(0, 10)}`;
}

function cleanText(value, max) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

async function readStore() {
  let raw;
  try {
    raw = await fs.readFile(jsonFile(), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return {schema: 1, updatedAt: null, items: []};
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fail(500, "FAVORITES_CORRUPT", "收藏文件不是合法 JSON，请先备份并检查 SocialMate-Data/Favorites/favorites.json");
  }
  const items = (Array.isArray(parsed?.items) ? parsed.items : [])
    .filter((item) => item && typeof item.en === "string" && item.en.trim())
    .slice(0, FAVORITES_LIMIT);
  return {schema: 1, updatedAt: parsed?.updatedAt || null, items};
}

function renderMarkdown(store) {
  const lines = [
    "# SocialMate 收藏表达",
    "",
    `> 由用户在本机界面手动收藏；共 ${store.items.length} / ${FAVORITES_LIMIT} 条。`,
    `> 更新时间：${store.updatedAt || "(尚未写入)"}`,
    "",
  ];
  for (const item of store.items) {
    lines.push(`## ${item.en}`, "");
    if (item.zh) lines.push(`- 中文：${item.zh}`);
    if (item.source) lines.push(`- 来源：${item.source}`);
    if (item.personSlug) lines.push(`- 相关人物：${item.personSlug}`);
    lines.push(`- 收藏时间：${item.createdAt}`, "");
  }
  return lines.join("\n");
}

async function writeStore(store) {
  const dir = favoritesDir();
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  await chmodQuiet(dir, 0o700);
  const payload = JSON.stringify(store, null, 2);
  const jsonTemp = path.join(dir, `.favorites.${process.pid}.tmp`);
  const mdTemp = path.join(dir, `.favorites.${process.pid}.tmp.md`);
  await fs.writeFile(jsonTemp, payload, {encoding: "utf8", mode: 0o600});
  await fs.writeFile(mdTemp, renderMarkdown(store), {encoding: "utf8", mode: 0o600});
  await chmodQuiet(jsonTemp, 0o600);
  await chmodQuiet(mdTemp, 0o600);
  try {
    await fs.rename(mdTemp, mdFile());
    await fs.rename(jsonTemp, jsonFile());
  } catch (error) {
    await fs.rm(jsonTemp, {force: true}).catch(() => {});
    await fs.rm(mdTemp, {force: true}).catch(() => {});
    throw error;
  }
  await chmodQuiet(jsonFile(), 0o600);
  await chmodQuiet(mdFile(), 0o600);
  return store;
}

export async function listFavorites() {
  const store = await readStore();
  const items = [...store.items].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {items, total: store.items.length, limit: FAVORITES_LIMIT};
}

/**
 * 新增收藏。
 * @param {{en:string, zh?:string, source?:string, personSlug?:string, confirm?:boolean}} input
 */
export async function addFavorite(input) {
  if (!input || input.confirm !== true) {
    throw fail(400, "CONFIRM_REQUIRED", "收藏需要用户显式确认（confirm:true）");
  }
  const en = normalizeFavorite(input.en);
  if (en.length < 2) throw fail(400, "EN_REQUIRED", "收藏需要填写英文表达（至少 2 个字符）");
  if (en.length > MAX_EN) throw fail(400, "EN_TOO_LONG", `英文表达不能超过 ${MAX_EN} 字符`);
  if (!/[A-Za-z]/.test(en)) throw fail(400, "EN_NOT_LATIN", "英文表达里至少要有一个英文字母");
  const zh = cleanText(input.zh, MAX_ZH);
  const source = cleanText(input.source, MAX_SOURCE);
  const personSlug = cleanText(input.personSlug, 64);
  if (personSlug && !SLUG.test(personSlug)) throw fail(400, "INVALID_PERSON_SLUG", "人物标识不合法");

  const store = await readStore();
  const key = en.toLowerCase();
  const existing = store.items.find((item) => normalizeFavorite(item.en).toLowerCase() === key);
  if (existing) {
    return {ok: true, duplicate: true, item: existing, total: store.items.length, limit: FAVORITES_LIMIT};
  }
  if (store.items.length >= FAVORITES_LIMIT) {
    throw fail(409, "FAVORITES_FULL",
      `收藏已达上限 ${FAVORITES_LIMIT} 条，请先删除一些再添加`);
  }

  const item = {
    id: favoriteId(en),
    en,
    zh,
    source,
    personSlug,
    createdAt: new Date().toISOString(),
  };
  // 极端情况下（不同英文但哈希撞车）改用随机后缀，保证 id 唯一。
  if (store.items.some((entry) => entry.id === item.id)) {
    item.id = `${item.id}-${crypto.randomBytes(3).toString("hex")}`;
  }
  const next = {...store, updatedAt: item.createdAt, items: [...store.items, item]};
  await writeStore(next);
  return {ok: true, duplicate: false, item, total: next.items.length, limit: FAVORITES_LIMIT};
}

export async function removeFavorite(id) {
  const raw = String(id || "").trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(raw)) throw fail(400, "INVALID_FAVORITE_ID", "收藏标识不合法");
  const store = await readStore();
  const index = store.items.findIndex((item) => item.id === raw);
  if (index < 0) throw fail(404, "FAVORITE_NOT_FOUND", "没有这条收藏");
  const [removed] = store.items.slice(index, index + 1);
  const items = [...store.items.slice(0, index), ...store.items.slice(index + 1)];
  const next = {...store, updatedAt: new Date().toISOString(), items};
  await writeStore(next);
  return {ok: true, removed: true, item: removed, total: next.items.length, limit: FAVORITES_LIMIT};
}

export const FAVORITES_PATHS = {favoritesDir};
