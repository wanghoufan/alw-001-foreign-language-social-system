/**
 * 局域网同步 MVP 自动化测试（node:test）。
 * 每个用例使用独立临时数据目录，不读写真实 SocialMate-Data。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {createLocalSync} from "./local-sync.mjs";

const SUBDIRS = ["People", "Profile", "Favorites", "PrivateCards", "PrivatePlaces", "PlaceNotes"];

async function makeWorkspace(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-local-sync-"));
  const dataDir = path.join(root, "SocialMate-Data");
  for (const name of SUBDIRS) await fs.mkdir(path.join(dataDir, name), {recursive: true});

  const previous = {
    people: process.env.SM_PEOPLE_DIR,
    profile: process.env.SM_PROFILE_DIR,
    favorites: process.env.SM_FAVORITES_DIR,
  };
  process.env.SM_PEOPLE_DIR = path.join(dataDir, "People");
  process.env.SM_PROFILE_DIR = path.join(dataDir, "Profile");
  process.env.SM_FAVORITES_DIR = path.join(dataDir, "Favorites");

  const sync = createLocalSync({dataDir, ...options});
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/push") return sync.handlePush(req, res);
    if (url.pathname === "/pull") return sync.handlePull(req, res);
    if (url.pathname === "/status") return sync.handleStatus(req, res);
    res.writeHead(404, {"Content-Type": "application/json; charset=utf-8"});
    res.end(JSON.stringify({ok: false, code: "NOT_FOUND"}));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;

  t.after(async () => {
    const restore = (key, value) => (value === undefined ? delete process.env[key] : (process.env[key] = value));
    restore("SM_PEOPLE_DIR", previous.people);
    restore("SM_PROFILE_DIR", previous.profile);
    restore("SM_FAVORITES_DIR", previous.favorites);
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(root, {recursive: true, force: true});
  });
  return {root, dataDir, base, sync};
}

function backupBody(overrides = {}) {
  return {
    deviceId: "phone-01",
    exportedAt: "2026-11-05T12:00:00.000Z",
    backup: {schema: 1, app: "SocialMate", people: [], cards: {}},
    ...overrides,
  };
}

async function post(base, body) {
  const res = await fetch(base + "/push", {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify(body),
  });
  return {status: res.status, json: await res.json()};
}

test("push 正常：写入 Backups、返回相对路径与字节数，同名覆盖幂等", async (t) => {
  const {dataDir, base} = await makeWorkspace(t);

  const first = await post(base, backupBody());
  assert.equal(first.status, 200);
  assert.equal(first.json.ok, true);
  assert.equal(first.json.stored, true);
  assert.equal(first.json.file, "Backups/phone-01-2026-11-05T12-00-00-000Z.json");
  assert.ok(first.json.bytes > 0);
  assert.match(first.json.at, /^\d{4}-\d{2}-\d{2}T/);

  const file = path.join(dataDir, first.json.file);
  const stored = JSON.parse(await fs.readFile(file, "utf8"));
  assert.equal(stored.backup.schema, 1);
  assert.equal(stored.deviceId, "phone-01");
  assert.equal(stored.exportedAt, "2026-11-05T12:00:00.000Z");

  const again = await post(base, backupBody());
  assert.equal(again.status, 200);
  assert.equal(again.json.file, first.json.file);

  const entries = await fs.readdir(path.join(dataDir, "Backups"));
  assert.deepEqual(entries.sort(), ["phone-01-2026-11-05T12-00-00-000Z.json"]);
});

test("deviceId 非法返回 400 且不落盘", async (t) => {
  const {dataDir, base} = await makeWorkspace(t);

  for (const deviceId of ["../evil", "a".repeat(65), "", "手机-01"]) {
    const result = await post(base, backupBody({deviceId}));
    assert.equal(result.status, 400, `deviceId=${deviceId}`);
    assert.equal(result.json.ok, false);
    assert.equal(result.json.code, "INVALID_DEVICE_ID");
  }

  await assert.rejects(fs.readdir(path.join(dataDir, "Backups")), {code: "ENOENT"});
});

test("backup schema/app 不匹配返回 400", async (t) => {
  const {base} = await makeWorkspace(t);

  const wrongSchema = await post(base, backupBody({backup: {schema: 2, app: "SocialMate"}}));
  assert.equal(wrongSchema.status, 400);
  assert.equal(wrongSchema.json.code, "SCHEMA_MISMATCH");

  const wrongApp = await post(base, backupBody({backup: {schema: 1, app: "Other"}}));
  assert.equal(wrongApp.status, 400);
  assert.equal(wrongApp.json.code, "APP_MISMATCH");

  const notObject = await post(base, backupBody({backup: "x"}));
  assert.equal(notObject.status, 400);
  assert.equal(notObject.json.code, "INVALID_BACKUP");
});

test("超过上限返回 413", async (t) => {
  const {base} = await makeWorkspace(t, {maxBytes: 512});
  const oversized = backupBody({
    backup: {schema: 1, app: "SocialMate", payload: "x".repeat(2048)},
  });

  const result = await post(base, oversized);
  assert.equal(result.status, 413);
  assert.equal(result.json.ok, false);
  assert.equal(result.json.code, "TOO_LARGE");
});

test("pull 返回 schema 1 且只读，不创建备份文件", async (t) => {
  const {dataDir, base} = await makeWorkspace(t);

  const res = await fetch(base + "/pull");
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.backup.schema, 1);
  assert.equal(body.backup.app, "SocialMate");
  assert.match(body.backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  for (const key of ["people", "cards", "favorites", "privatePlaces", "placeRecords", "practice"]) {
    assert.ok(key in body.backup, key);
  }
  assert.deepEqual(body.backup.people, []);
  assert.deepEqual(body.backup.privatePlaces, []);
  assert.deepEqual(body.backup.placeRecords, []);
  assert.deepEqual(body.backup.practice, []);
  assert.deepEqual(body.backup.prefs, {});
  assert.equal(body.backup.profile, null);
  assert.deepEqual(body.backup.cards, {place: [], story: [], app: []});

  await assert.rejects(fs.readdir(path.join(dataDir, "Backups")), {code: "ENOENT"});
});

test("status 统计备份文件数与最新时间", async (t) => {
  const {base} = await makeWorkspace(t);

  const empty = await fetch(base + "/status").then((res) => res.json());
  assert.equal(empty.ok, true);
  assert.equal(empty.service, "local-sync");
  assert.equal(empty.backups, 0);
  assert.equal(empty.lastAt, null);

  await post(base, backupBody());
  await post(base, backupBody({deviceId: "phone-02", exportedAt: "2026-11-06T08:30:00.000Z"}));

  const filled = await fetch(base + "/status").then((res) => res.json());
  assert.equal(filled.backups, 2);
  assert.match(filled.lastAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(!Number.isNaN(Date.parse(filled.lastAt)));
});