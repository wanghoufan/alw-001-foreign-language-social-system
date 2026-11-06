#!/usr/bin/env node
/**
 * V1.7 迁移导出（Mac → 手机本地备份）。
 *
 * 只读调用 8791 私有服务，把「页面契约结构」的数据导出成 LocalStore.importBackup 可导入的 JSON：
 * people / cards / favorites / privatePlaces / placeRecords / practice / prefs / profile。
 *
 * 边界：
 * - 不导出任何密钥、令牌、会话原文、录音文件；
 * - 不修改 SocialMate-Data；
 * - 媒体文件单独复制到 media/，由 adb 推送到手机私有目录。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.join(ROOT, ".local", "v17-migration-20261106");
const BASE = process.env.SM_BASE || "http://127.0.0.1:8791";
const TOKEN = (await fs.readFile(path.join(ROOT, "socialmate-v1.2", ".local", "archive-token"), "utf8")).trim();
const DATA = path.join(ROOT, "SocialMate-Data");

async function api(pathname, init = {}) {
  const res = await fetch(BASE + pathname, {
    ...init,
    headers: {Accept: "application/json", "x-archive-token": TOKEN, ...(init.headers || {})},
  });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = {raw: text.slice(0, 200)}; }
  if (!res.ok) throw new Error(`${pathname} HTTP ${res.status} ${body?.code || body?.error || ""}`);
  return body;
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
}

async function walk(dir, out = []) {
  let entries = [];
  try { entries = await fs.readdir(dir, {withFileTypes: true}); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

async function main() {
  await fs.mkdir(OUT_DIR, {recursive: true});
  const stamp = new Date().toISOString();

  const people = [];
  const list = await api("/v12/api/people");
  for (const row of list.people || []) {
    try {
      const detail = await api(`/v12/api/people/${encodeURIComponent(row.slug)}`);
      if (detail.person) people.push(detail.person);
    } catch (error) {
      console.warn(`skip person ${row.slug}: ${error.message}`);
    }
  }

  const cards = [];
  for (const kind of ["place", "story", "app"]) {
    const d = await api(`/v12/api/cards?kind=${kind}`);
    for (const card of d.cards || []) cards.push(card);
  }

  const fav = await api("/v12/api/favorites");
  const favorites = fav.items || [];

  const privatePlaces = [];
  const placeRecords = [];
  const pv = await api("/v12/api/private-places");
  for (const place of pv.places || []) {
    privatePlaces.push(place);
    try {
      const detail = await api(`/v12/api/places/${encodeURIComponent(place.id)}`);
      for (const record of detail.records || []) placeRecords.push(record);
    } catch (error) {
      console.warn(`skip private place ${place.id}: ${error.message}`);
    }
  }
  for (let id = 1; id <= 115; id++) {
    try {
      const detail = await api(`/v12/api/places/${id}`);
      if ((detail.recordCount || 0) > 0) {
        for (const record of detail.records || []) placeRecords.push(record);
      }
    } catch {
      // 单个地点读取失败不阻断整体迁移；计数会在报告里体现。
    }
  }
  const unassigned = await api("/v12/api/places/unassigned").catch(() => ({records: []}));
  for (const record of unassigned.records || []) {
    placeRecords.push({...record, unassigned: true, placeId: null});
  }

  const practice = [];
  for (const file of await walk(path.join(DATA, "PlaceNotes"))) {
    if (!file.includes(`${path.sep}practice${path.sep}`)) continue;
    const report = await readJson(file);
    if (report?.reportId) practice.push(report);
  }
  for (const file of await walk(path.join(DATA, "PrivatePlaces"))) {
    if (!file.includes(`${path.sep}practice${path.sep}`)) continue;
    const report = await readJson(file);
    if (report?.reportId) practice.push(report);
  }

  const prefs = (await api("/v12/api/prefs")).prefs || {};
  const profile = (await api("/api/profile")).profile || null;

  const mediaIndex = [];
  const mediaOut = path.join(OUT_DIR, "media");
  for (const card of cards) {
    for (const media of card.media || []) {
      const src = path.join(DATA, "PrivateCards", "media", card.id, media.file);
      try {
        const bytes = await fs.readFile(src);
        const dir = path.join(mediaOut, card.id);
        await fs.mkdir(dir, {recursive: true});
        await fs.writeFile(path.join(dir, media.file), bytes);
        mediaIndex.push({
          cardId: card.id,
          mediaId: media.id,
          file: media.file,
          mime: media.mime || "image/jpeg",
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        });
      } catch (error) {
        console.warn(`skip media ${card.id}/${media.file}: ${error.code || error.message}`);
      }
    }
  }

  const backup = {
    schema: 1,
    app: "SocialMate",
    exportedAt: stamp,
    source: "mac-8791",
    people,
    cards,
    favorites,
    privatePlaces,
    placeRecords,
    practice,
    prefs,
    profile,
    mediaIndex,
    counts: {
      people: people.length,
      cards: cards.length,
      favorites: favorites.length,
      privatePlaces: privatePlaces.length,
      placeRecords: placeRecords.length,
      practice: practice.length,
      media: mediaIndex.length,
    },
  };
  const file = path.join(OUT_DIR, "migration-backup.json");
  await fs.writeFile(file, JSON.stringify(backup, null, 2));
  const sha = crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
  await fs.writeFile(path.join(OUT_DIR, "migration-backup.sha256"), `${sha}  migration-backup.json\n`);
  console.log(JSON.stringify({file, sha256: sha, counts: backup.counts}, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});