import test from "node:test";
import assert from "node:assert/strict";
import {startGateway, TEST_FP} from "./helpers.mjs";

test("签发设备令牌：只返回一次明文，且不含 master secret", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());

  const issued = await gw.issueToken();
  assert.equal(issued.status, 201);
  assert.equal(issued.json.ok, true);
  assert.match(issued.json.token, /^smk1\./);
  assert.equal(issued.json.tokenType, "Bearer");
  assert.deepEqual(issued.json.scopes, ["ai", "tts", "asr", "status"]);
  assert.equal(JSON.stringify(issued.json).includes(gw.env.CLOUD_GATEWAY_TOKEN_SECRET), false);
  assert.equal(JSON.stringify(issued.json).includes("CLOUD_GATEWAY_TOKEN_SECRET"), false);

  const status = await gw.request("/v1/status", {token: issued.json.token});
  assert.equal(status.status, 200);
  assert.equal(status.json.ok, true);
  assert.equal(status.json.deviceId, "device-0001");
});

test("401：缺少令牌 / 错误签名 / 未知令牌", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());

  const none = await gw.request("/v1/status", {fingerprint: TEST_FP});
  assert.equal(none.status, 401);
  assert.equal(none.json.code, "TOKEN_REQUIRED");

  const issued = await gw.issueToken();
  const token = issued.json.token;
  const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
  const bad = await gw.request("/v1/status", {token: tampered});
  assert.equal(bad.status, 401);
  assert.equal(bad.json.code, "TOKEN_BAD_SIGNATURE");

  const unknown = await gw.request("/v1/status", {token: "smk1.eyJ4IjoxfQ.signature"});
  assert.equal(unknown.status, 401);
  assert.ok(["TOKEN_BAD_SIGNATURE", "TOKEN_INVALID"].includes(unknown.json.code));
});

test("403：设备指纹不匹配 / scope 不足", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());

  const issued = await gw.issueToken({fingerprint: TEST_FP});
  const mismatch = await gw.request("/v1/status", {token: issued.json.token, fingerprint: "another-device-fingerprint"});
  assert.equal(mismatch.status, 403);
  assert.equal(mismatch.json.code, "DEVICE_MISMATCH");

  const limited = await gw.issueToken({deviceId: "device-scope", scopes: ["status"]});
  const forbidden = await gw.request("/v1/tts/voices", {token: limited.json.token});
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.json.code, "SCOPE_FORBIDDEN");
});

test("撤销后立即失效（401 TOKEN_REVOKED）", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());

  const issued = await gw.issueToken();
  const token = issued.json.token;
  const before = await gw.request("/v1/status", {token});
  assert.equal(before.status, 200);

  const revoked = await gw.request("/auth/revoke", {method: "POST", token, body: {}});
  assert.equal(revoked.status, 200);
  assert.equal(revoked.json.ok, true);

  const after = await gw.request("/v1/status", {token});
  assert.equal(after.status, 401);
  assert.equal(after.json.code, "TOKEN_REVOKED");
});

test("管理令牌可撤销其他设备；错误的 admin token 被拒绝", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());

  const issued = await gw.issueToken();
  const wrong = await gw.request("/auth/token", {
    method: "POST",
    fingerprint: "",
    headers: {"x-admin-token": "wrong-admin"},
    body: {deviceId: "device-x", fingerprint: "fingerprint-xxxx", scopes: ["status"]},
  });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.code, "ADMIN_TOKEN_INVALID");

  const revoked = await gw.request("/auth/revoke", {
    method: "POST",
    fingerprint: "",
    headers: {"x-admin-token": gw.env.CLOUD_GATEWAY_ADMIN_TOKEN},
    body: {jti: issued.json.jti},
  });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.json.ok, true);

  const after = await gw.request("/v1/status", {token: issued.json.token});
  assert.equal(after.status, 401);
  assert.equal(after.json.code, "TOKEN_REVOKED");
});

test("过期令牌 401 TOKEN_EXPIRED（可注入时钟）", async (t) => {
  let clock = Date.now();
  const gw = await startGateway({now: () => clock});
  t.after(() => gw.close());

  const issued = await gw.issueToken({ttlSeconds: 60});
  assert.equal(issued.status, 201);
  assert.equal((await gw.request("/v1/status", {token: issued.json.token})).status, 200);
  clock += 61_000;
  const expired = await gw.request("/v1/status", {token: issued.json.token});
  assert.equal(expired.status, 401);
  assert.equal(expired.json.code, "TOKEN_EXPIRED");
});