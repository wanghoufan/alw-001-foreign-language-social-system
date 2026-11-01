/**
 * HTTP 路由层自动化 QA（P0-04 后端部分）。
 * 用随机端口 + 假归档客户端：不占用 8790/8791/8781，也不碰真实 SocialMate-Data。
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {appendPeopleFacts, createPersonFile, listPeople} from "./people-store.mjs";

const TOKEN = "sm-test-token-0123456789abcdef";

async function makeWorkspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sm-http-"));
  const dirs = {
    people: path.join(root, "People"),
    profile: path.join(root, "Profile"),
    favorites: path.join(root, "Favorites"),
  };
  for (const dir of Object.values(dirs)) await fs.mkdir(dir, {recursive: true});
  const previous = {
    people: process.env.SM_PEOPLE_DIR,
    profile: process.env.SM_PROFILE_DIR,
    favorites: process.env.SM_FAVORITES_DIR,
    noListen: process.env.SM_AI_NO_LISTEN,
  };
  process.env.SM_PEOPLE_DIR = dirs.people;
  process.env.SM_PROFILE_DIR = dirs.profile;
  process.env.SM_FAVORITES_DIR = dirs.favorites;
  process.env.SM_AI_NO_LISTEN = "1";
  t.after(async () => {
    const restore = (key, value) => (value === undefined ? delete process.env[key] : (process.env[key] = value));
    restore("SM_PEOPLE_DIR", previous.people);
    restore("SM_PROFILE_DIR", previous.profile);
    restore("SM_FAVORITES_DIR", previous.favorites);
    restore("SM_AI_NO_LISTEN", previous.noListen);
    await fs.rm(root, {recursive: true, force: true});
  });
  return {root, dirs};
}

/** 假归档：只认正确的请求头令牌，从不联网。 */
function fakeArchive(sessions = {}) {
  return {
    async get(pathname, token) {
      if (token !== TOKEN) return {status: 401, body: "{}"};
      const match = String(pathname).match(/^\/api\/archive\/session\/(.+)$/);
      const sessionId = decodeURIComponent(match ? match[1] : "");
      if (sessionId === "__token_probe__") return {status: 404, body: "{}"};
      const session = sessions[sessionId];
      return session ? {status: 200, body: JSON.stringify({session})} : {status: 404, body: "{}"};
    },
    async proxy(req, res, url) {
      res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
      res.end(JSON.stringify({ok: true, proxied: url.pathname}));
    },
  };
}

function call(port, pathname, {method = "GET", headers = {}, body = null} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host: "127.0.0.1", port, path: pathname, method,
      headers: {
        ...(payload ? {"content-type": "application/json", "content-length": payload.length} : {}),
        ...headers,
      },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({status: res.statusCode, json, text: data});
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function startServer(t, options = {}) {
  const {createHandler} = await import("./server.mjs");
  const server = http.createServer(createHandler({archive: options.archive || fakeArchive()}));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {port: server.address().port, server};
}

test("无令牌 401，令牌错误 401，且响应体里不出现令牌", async (t) => {
  await makeWorkspace(t);
  const {port} = await startServer(t);

  const noToken = await call(port, "/v12/api/people");
  assert.equal(noToken.status, 401);
  assert.equal(noToken.json.code, "TOKEN_REQUIRED");

  const wrong = await call(port, "/v12/api/people/slug-suggest?name=Anna",
    {headers: {"x-archive-token": "wrong-token-value"}});
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.code, "UNAUTHORIZED");

  const ok = await call(port, "/v12/api/people/slug-suggest?name=Anna",
    {headers: {"x-archive-token": TOKEN}});
  assert.equal(ok.status, 200);
  assert.equal(ok.text.includes(TOKEN), false, "令牌绝不能出现在响应体里");
  assert.equal(ok.json.slug, "anna");
});

test("跨源 Origin 403，同源 Origin 放行", async (t) => {
  await makeWorkspace(t);
  const {port} = await startServer(t);
  const rejected = await call(port, "/v12/api/favorites", {headers: {origin: "https://evil.example"}});
  assert.equal(rejected.status, 403);
  assert.equal(rejected.json.code, "ORIGIN_REJECTED");

  const same = await call(port, "/v12/api/favorites",
    {headers: {origin: `http://127.0.0.1:${port}`}});
  assert.equal(same.status, 200);
  assert.equal(same.json.ok, true);
});

test("输入名字只给建议、不建人物；重名给可用替代", async (t) => {
  const {dirs} = await makeWorkspace(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  const {port} = await startServer(t);

  const taken = await call(port, "/v12/api/people/slug-suggest?name=Anna",
    {headers: {"x-archive-token": TOKEN}});
  assert.equal(taken.status, 200);
  assert.equal(taken.json.slug, "anna");
  assert.equal(taken.json.available, false);
  assert.equal(taken.json.alternative, "anna-2");

  const fresh = await call(port, "/v12/api/people/slug-suggest?name=New%20Friend",
    {headers: {"x-archive-token": TOKEN}});
  assert.equal(fresh.json.slug, "new-friend");
  assert.equal(fresh.json.available, true);
  assert.deepEqual((await listPeople()).map((p) => p.slug), ["anna"], "建议接口不能创建人物");
  assert.deepEqual((await fs.readdir(dirs.people)).sort(), ["anna"]);
});

test("路径注入与目录穿越被拒绝", async (t) => {
  await makeWorkspace(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  const {port} = await startServer(t);
  const headers = {"x-archive-token": TOKEN};
  const cases = [
    ["/v12/api/people/%2e%2e%2f%2e%2e%2fetc%2fpasswd", "INVALID_PERSON_SLUG"],
    ["/v12/api/people/%2Fetc%2Fpasswd", "INVALID_PERSON_SLUG"],
    ["/v12/api/people/.hidden", "INVALID_PERSON_SLUG"],
    ["/v12/api/people/anna%00", "INVALID_PERSON_SLUG"],
  ];
  for (const [pathname, code] of cases) {
    const response = await call(port, pathname, {headers});
    assert.equal(response.status, 400, `${pathname} 必须是 400`);
    assert.equal(response.json.code, code);
  }
  const revoke = await call(port, "/v12/api/people/%2e%2e%2fetc/facts/revoke",
    {method: "POST", headers, body: {factId: "abcdef123456", confirm: true}});
  assert.equal(revoke.status, 400);
});

test("写入限流：连续两次撤回请求第二次 429", async (t) => {
  await makeWorkspace(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  const {port} = await startServer(t);
  const headers = {"x-archive-token": TOKEN, "content-type": "application/json"};

  const first = await call(port, "/v12/api/people/anna/facts/revoke",
    {method: "POST", headers, body: {factId: "abcdef123456", confirm: true}});
  assert.equal(first.status, 404, "找不到 factId 应是 404");

  const second = await call(port, "/v12/api/people/anna/facts/revoke",
    {method: "POST", headers, body: {factId: "abcdef123456", confirm: true}});
  assert.equal(second.status, 429);
  assert.equal(second.json.code, "RATE_LIMITED");
  assert.ok(second.json.retryAfterMs > 0);
});

test("人物详情与 prep 路由：详情带来源，prep 最多 3 条", async (t) => {
  await makeWorkspace(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  const sessionId = "sess_20261101T120000_http01";
  await appendPeopleFacts([{
    slug: "anna", section: "interest", text: "喜欢在海边喝咖啡。",
    sessionId, segmentIndex: 0, confirmedAt: "2026-11-01T13:00:00.000Z",
  }]);
  const {port} = await startServer(t, {
    archive: fakeArchive({
      [sessionId]: {sessionId, startedAt: "2026-11-01T12:00:00.000Z",
        segments: [{speakerId: "spk_1", textOriginal: "I like coffee near the beach."}]},
    }),
  });
  const headers = {"x-archive-token": TOKEN};

  const detail = await call(port, "/v12/api/people/anna", {headers});
  assert.equal(detail.status, 200);
  const {person} = detail.json;
  assert.equal(person.slug, "anna");
  assert.equal(person.confirmed.length, 1);
  assert.equal(person.confirmed[0].source.sessionId, sessionId);
  assert.equal(person.sessions[0].archived, true);
  assert.ok(person.sessions[0].topics.includes("咖啡"));

  const prep = await call(port, "/v12/api/people/anna/prep", {headers});
  assert.equal(prep.status, 200);
  assert.equal(prep.json.empty, false);
  assert.ok(prep.json.items.length <= 3);
  assert.equal(prep.json.items[0].source, "confirmed-fact");
});

test("收藏路由：新增、去重、列表、删除，缺 confirm 拒绝", async (t) => {
  await makeWorkspace(t);
  const {port} = await startServer(t);

  const missing = await call(port, "/v12/api/favorites",
    {method: "POST", body: {en: "Hello there.", zh: "你好。"}});
  assert.equal(missing.status, 400);
  assert.equal(missing.json.code, "CONFIRM_REQUIRED");

  const added = await call(port, "/v12/api/favorites", {method: "POST",
    body: {en: "That sounds good.", zh: "听起来不错。", personSlug: "anna", confirm: true}});
  assert.equal(added.status, 200);
  assert.equal(added.json.duplicate, false);

  const duplicate = await call(port, "/v12/api/favorites", {method: "POST",
    body: {en: "that   SOUNDS good.", zh: "重复", confirm: true}});
  assert.equal(duplicate.json.duplicate, true);
  assert.equal(duplicate.json.total, 1);

  const list = await call(port, "/v12/api/favorites");
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].en, "That sounds good.");

  const id = added.json.item.id;
  const removed = await call(port, `/v12/api/favorites/${id}`, {method: "DELETE"});
  assert.equal(removed.status, 200);
  assert.equal(removed.json.removed, true);
  assert.equal((await call(port, `/v12/api/favorites/${id}`, {method: "DELETE"})).status, 404);
  assert.equal((await call(port, "/v12/api/favorites")).json.total, 0);
});

test("方法限制与既有接口兼容：GET /api/profile 仍可用", async (t) => {
  await makeWorkspace(t);
  const {port} = await startServer(t);
  // POST /v12/api/people 现在是受支持的「新建人物」入口，无令牌时应是 401 而不是 405。
  const wrongMethod = await call(port, "/v12/api/people", {method: "POST", body: {}});
  assert.equal(wrongMethod.status, 401);
  assert.equal(wrongMethod.json.code, "TOKEN_REQUIRED");
  const unsupported = await call(port, "/v12/api/people", {method: "PUT", body: {}});
  assert.equal(unsupported.status, 405);

  const profile = await call(port, "/api/profile");
  assert.equal(profile.status, 200);
  assert.equal(profile.json.ok, true);
  assert.equal(profile.json.profile, null, "空档案目录应返回 null 而不是报错");

  const proxied = await call(port, "/v12/api/archive/sessions?q=coffee",
    {headers: {"x-archive-token": TOKEN}});
  assert.equal(proxied.status, 200);
  assert.equal(proxied.json.proxied, "/v12/api/archive/sessions", "只读 GET 直接反代，不改写查询串");
});

test("既有接口向后兼容：人物列表、Profile 写入、本地复盘仍按原契约返回", async (t) => {
  await makeWorkspace(t);
  await createPersonFile({slug: "anna", name: "Anna"});
  const sessionId = "sess_20261101T120000_compat";
  const {port} = await startServer(t, {
    archive: fakeArchive({
      [sessionId]: {sessionId, startedAt: "2026-11-01T12:00:00.000Z",
        segments: [
          {speakerId: "spk_0", startMs: 0, endMs: 1000, textOriginal: "I like hiking on Sunday."},
          {speakerId: "spk_1", startMs: 1000, endMs: 2000, textOriginal: "I work at a cafe near the sea."},
        ]},
    }),
  });
  const headers = {"x-archive-token": TOKEN};

  const people = await call(port, "/v12/api/people", {headers});
  assert.equal(people.status, 200);
  assert.deepEqual(people.json.people.map((p) => p.slug), ["anna"]);

  const putProfile = await call(port, "/api/profile", {method: "PUT", body: {
    confirm: true, stories: [{id: "st-1", title: "跑步", cat: "生活", tags: ["跑步"], cn: "我周日喜欢徒步。", en: ""}],
    people: [],
  }});
  assert.equal(putProfile.status, 200);
  assert.equal(putProfile.json.stories, 1);
  assert.equal(typeof putProfile.json.updatedAt, "string");

  const noToken = await call(port, "/v12/api/review", {method: "POST", body: {sessionId, mode: "local"}});
  assert.equal(noToken.status, 401);

  const review = await call(port, "/v12/api/review",
    {method: "POST", headers, body: {sessionId, mode: "local"}});
  assert.equal(review.status, 200);
  assert.equal(review.json.review.engine, "local-keyword");
  assert.equal(review.json.review.aiUsed, false, "本地复盘不允许调用外部模型");

  const badSession = await call(port, "/v12/api/review",
    {method: "POST", headers, body: {sessionId: "bad id!", mode: "local"}});
  assert.equal(badSession.status, 400);
  assert.equal(badSession.json.code, "INVALID_SESSION_ID");

  const consent = await call(port, "/v12/api/review",
    {method: "POST", headers, body: {sessionId, mode: "ai"}});
  assert.equal(consent.status, 403, "未勾选同意时不得发起云端调用");
  assert.equal(consent.json.code, "CONSENT_REQUIRED");
});

test("随机端口启动：不占用 8790/8791/8781", async (t) => {
  await makeWorkspace(t);
  const {port} = await startServer(t);
  assert.ok(port > 0);
  for (const reserved of [8790, 8791, 8781]) assert.notEqual(port, reserved);
});

test("P1-02 新建人物：未确认 400、无令牌 401、非法标识 400、成功后 0600/0700 且幂等", async (t) => {
  const {dirs} = await makeWorkspace(t);
  const {port} = await startServer(t);
  const headers = {"x-archive-token": TOKEN, "content-type": "application/json"};

  const noToken = await call(port, "/v12/api/people",
    {method: "POST", headers: {"content-type": "application/json"}, body: {slug: "anna", name: "Anna", confirm: true}});
  assert.equal(noToken.status, 401);

  const noConfirm = await call(port, "/v12/api/people",
    {method: "POST", headers, body: {slug: "anna", name: "Anna"}});
  assert.equal(noConfirm.status, 400);
  assert.equal(noConfirm.json.code, "CONFIRM_REQUIRED");
  assert.deepEqual(await fs.readdir(dirs.people), [], "未确认时不能建任何目录");

  // 写入接口有 400ms 最小间隔，测试里显式等待，避免把限流 429 误判成参数校验失败。
  await new Promise((resolve) => setTimeout(resolve, 450));
  const traversal = await call(port, "/v12/api/people",
    {method: "POST", headers, body: {slug: "../escape", name: "Evil", confirm: true}});
  assert.equal(traversal.status, 400);
  assert.equal(traversal.json.code, "INVALID_PERSON_SLUG");

  await new Promise((resolve) => setTimeout(resolve, 450));
  const created = await call(port, "/v12/api/people",
    {method: "POST", headers, body: {slug: "new-friend", name: "新朋友", confirm: true}});
  assert.equal(created.status, 200);
  assert.equal(created.json.created, true);
  assert.equal(created.json.person.slug, "new-friend");

  const dir = path.join(dirs.people, "new-friend");
  const file = path.join(dir, "00-profile.md");
  const dirMode = (await fs.stat(dir)).mode & 0o777;
  const fileMode = (await fs.stat(file)).mode & 0o777;
  assert.equal(dirMode, 0o700, "人物目录必须是 0700");
  assert.equal(fileMode, 0o600, "人物主档必须是 0600");
  assert.match(await fs.readFile(file, "utf8"), /新朋友/);

  await new Promise((resolve) => setTimeout(resolve, 450));
  const again = await call(port, "/v12/api/people",
    {method: "POST", headers, body: {slug: "new-friend", name: "新朋友", confirm: true}});
  assert.equal(again.status, 200);
  assert.equal(again.json.created, false, "重复新建不新增也不覆盖");
  assert.equal(again.json.existing, true);
  assert.deepEqual((await fs.readdir(dirs.people)).sort(), ["new-friend"]);
});
