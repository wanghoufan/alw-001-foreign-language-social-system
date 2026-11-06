import test from "node:test";
import assert from "node:assert/strict";
import {createDeepSeekService} from "../src/ai-deepseek.mjs";
import {deepseekJson, startGateway, upstreamStatus} from "./helpers.mjs";

async function tokenOf(gw, options = {}) {
  const issued = await gw.issueToken(options);
  assert.equal(issued.status, 201, JSON.stringify(issued.json));
  return issued.json.token;
}

test("成功翻译：返回 zh 并结算真实用量", async (t) => {
  const gw = await startGateway({gateway: {fetchImpl: deepseekJson('{"zh":"你好"}')}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: "Hello there", consent: true},
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.ok, true);
  assert.equal(response.json.zh, "你好");
  assert.equal(response.json.mode, "real-ai");
  assert.ok(response.json.billing.costCny > 0);
  assert.equal(response.json.budget.spentCny > 0, true);
});

test("非英文直接 passthrough，不调用上游", async (t) => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("不应该调用上游");
  };
  const gw = await startGateway({gateway: {fetchImpl}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: "今天天气不错", consent: true},
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.mode, "passthrough");
  assert.equal(response.json.billing.costCny, 0);
  assert.equal(calls, 0);
});

test("403：未显式同意 / 携带人物档案字段", async (t) => {
  const gw = await startGateway({gateway: {fetchImpl: deepseekJson('{"zh":"你好"}')}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const noConsent = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: "Hello"},
  });
  assert.equal(noConsent.status, 403);
  assert.equal(noConsent.json.code, "CONSENT_REQUIRED");

  const profile = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: "Hello", consent: true, person: {name: "某人"}},
  });
  assert.equal(profile.status, 403);
  assert.equal(profile.json.code, "PRIVACY_PROFILE_FIELD");
});

test("400：单句超过 700 字（翻译与 analyze）", async (t) => {
  const gw = await startGateway({gateway: {fetchImpl: deepseekJson('{"zh":"你好"}')}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);
  const longText = "a".repeat(701);

  const translate = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: longText, consent: true},
  });
  assert.equal(translate.status, 400);
  assert.equal(translate.json.code, "TEXT_TOO_LARGE");

  const analyze = await gw.request("/v1/ai/analyze", {
    method: "POST", token, body: {messages: [{speaker: "self", text: longText}], consent: true},
  });
  assert.equal(analyze.status, 400);
  assert.equal(analyze.json.code, "TEXT_TOO_LARGE");
});

test("402：预算为 0 时拒绝付费请求", async (t) => {
  const gw = await startGateway({
    env: {CLOUD_DEEPSEEK_BUDGET_CNY: "0"},
    gateway: {fetchImpl: deepseekJson('{"zh":"你好"}')},
  });
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/ai/translate", {
    method: "POST", token, body: {text: "Hello", consent: true},
  });
  assert.equal(response.status, 402);
  assert.equal(response.json.code, "BUDGET_ZERO");
  assert.equal(response.json.budget.limitCny, 0);
});

test("429：超速率返回 RATE_LIMITED 与 retryAfterMs", async (t) => {
  const gw = await startGateway({
    env: {CLOUD_RATE_LIMIT_PER_WINDOW: "2", CLOUD_RATE_WINDOW_MS: "60000"},
    gateway: {fetchImpl: deepseekJson('{"zh":"你好"}')},
  });
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const body = {text: "Hello", consent: true};
  assert.equal((await gw.request("/v1/ai/translate", {method: "POST", token, body})).status, 200);
  assert.equal((await gw.request("/v1/ai/translate", {method: "POST", token, body})).status, 200);
  const limited = await gw.request("/v1/ai/translate", {method: "POST", token, body});
  assert.equal(limited.status, 429);
  assert.equal(limited.json.code, "RATE_LIMITED");
  assert.ok(limited.json.retryAfterMs > 0);
});

test("上游错误映射：429 → 503 / 401 → 502", async (t) => {
  const rate = await startGateway({gateway: {fetchImpl: upstreamStatus(429)}});
  t.after(() => rate.close());
  const rateToken = await tokenOf(rate);
  const limited = await rate.request("/v1/ai/translate", {
    method: "POST", token: rateToken, body: {text: "Hello", consent: true},
  });
  assert.equal(limited.status, 503);
  assert.equal(limited.json.code, "PROVIDER_LIMIT");

  const auth = await startGateway({gateway: {fetchImpl: upstreamStatus(401)}});
  t.after(() => auth.close());
  const authToken = await tokenOf(auth);
  const denied = await auth.request("/v1/ai/translate", {
    method: "POST", token: authToken, body: {text: "Hello", consent: true},
  });
  assert.equal(denied.status, 502);
  assert.equal(denied.json.code, "PROVIDER_AUTH");
});

test("超时映射 504（可注入短超时）", async () => {
  const service = createDeepSeekService({
    env: {DEEPSEEK_API_KEY: "test-key-1234567890"},
    // 自定义 fetch 必须监听 signal，才能让 AbortController 真正结束等待。
    fetchImpl: (url, {signal}) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ok: true, json: async () => ({})}), 5000);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
    timeoutMs: 30,
  });
  await assert.rejects(
    () => service.translate({text: "Hello", consent: true}),
    (error) => error.status === 504 && error.code === "PROVIDER_TIMEOUT",
  );
});

test("analyze 成功返回接话、追问与分享", async (t) => {
  const content = JSON.stringify({topic: "问候", reply: "Nice to meet you.", questions: ["How was your day?"], share: "I like coffee."});
  const gw = await startGateway({gateway: {fetchImpl: deepseekJson(content)}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/ai/analyze", {
    method: "POST",
    token,
    body: {messages: [{speaker: "friend", text: "Hello!"}, {speaker: "self", text: "Hi!"}], consent: true},
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.reply, "Nice to meet you.");
  assert.deepEqual(response.json.questions, ["How was your day?"]);
  assert.equal(response.json.share, "I like coffee.");
});