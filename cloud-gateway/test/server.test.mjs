import test from "node:test";
import assert from "node:assert/strict";
import {startGateway, TEST_SECRET} from "./helpers.mjs";

test("/health 无需令牌，且不泄露任何密钥", async (t) => {
  const gw = await startGateway({
    env: {SM_DOUBAO_API_KEY: "secret-doubao-key", DEEPSEEK_API_KEY: "secret-deepseek-key"},
  });
  t.after(() => gw.close());

  const response = await gw.request("/health", {fingerprint: ""});
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.service, "alw001-cloud-gateway");
  assert.equal(response.json.stateDriver, "sqlite");
  assert.equal(response.json.providers.deepseek, true);
  assert.equal(response.json.providers.doubao, true);
  assert.equal(response.json.providers.asr, true);
  assert.equal(response.json.endpoints, gw.gateway.endpoints.length);
  const raw = JSON.stringify(response.json);
  assert.equal(raw.includes("secret-doubao-key"), false);
  assert.equal(raw.includes("secret-deepseek-key"), false);
  assert.equal(raw.includes(TEST_SECRET), false);
});

test("/v1/status 返回预算、限流与 ASR 状态", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());
  const issued = await gw.issueToken();
  const response = await gw.request("/v1/status", {token: issued.json.token});
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.budgets.deepseek.limitCny, 1);
  assert.equal(response.json.budgets["tts:doubao"].limitCny, 1);
  assert.equal(response.json.budgets["asr:tencent"].limitCny, 1);
  assert.equal(response.json.asr.provider, "p066");
  assert.equal(response.json.asr.configured, true);
  assert.equal(response.json.asr.partialStored, false);
  assert.equal(response.json.rate.limit, 1000);
});

test("未知端点 404", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());
  const response = await gw.request("/v1/nope");
  assert.equal(response.status, 404);
  assert.equal(response.json.code, "NOT_FOUND");
});

test("端点表覆盖 C4 要求的全部入口", async (t) => {
  const gw = await startGateway();
  t.after(() => gw.close());
  const routes = gw.gateway.endpoints.map((item) => `${item.method} ${item.pathname}`);
  for (const expected of [
    "GET /health",
    "POST /auth/token",
    "POST /auth/revoke",
    "GET /v1/status",
    "POST /v1/ai/translate",
    "POST /v1/ai/draft-en",
    "POST /v1/ai/analyze",
    "GET /v1/tts/voices",
    "POST /v1/tts/synthesize",
    "GET /v1/asr/status",
    "WS /v1/asr/stream",
  ]) {
    assert.ok(routes.includes(expected), `缺少端点 ${expected}`);
  }
});