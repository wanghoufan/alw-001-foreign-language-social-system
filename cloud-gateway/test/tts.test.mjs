import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {doubaoAudio, startGateway} from "./helpers.mjs";

const DOUBAO_ENV = {SM_DOUBAO_API_KEY: "test-doubao-key-0123456789"};
const VOICE = "en_male_tim_uranus_bigtts";

async function tokenOf(gw) {
  const issued = await gw.issueToken();
  assert.equal(issued.status, 201, JSON.stringify(issued.json));
  return issued.json.token;
}

test("豆包 TTS：逐行 JSON 拼 base64，返回音频字节与元数据", async (t) => {
  const audio = Buffer.from("fake-mp3-payload-001122334455");
  let calls = 0;
  const fetchImpl = async (...args) => {
    calls += 1;
    return doubaoAudio(audio)(...args);
  };
  const gw = await startGateway({env: DOUBAO_ENV, gateway: {fetchImpl}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/tts/synthesize", {
    method: "POST",
    token,
    body: {text: "Hello, nice to meet you.", consent: true, voiceId: VOICE},
  });
  assert.equal(response.status, 200, JSON.stringify(response.json));
  assert.equal(response.json.ok, true);
  assert.equal(response.json.provider, "doubao");
  assert.equal(response.json.modelVersion, "doubao-seed-tts-2.0-v1");
  assert.equal(response.json.voiceId, VOICE);
  assert.equal(response.json.mimeType, "audio/mpeg");
  assert.equal(response.json.bytes, audio.length);
  assert.deepEqual(Buffer.from(response.json.audioBase64, "base64"), audio);
  assert.equal(response.json.stored, false);
  assert.match(response.json.textSha256, /^[a-f0-9]{64}$/);
  assert.equal(calls, 1);
});

test("400：TTS 文本 2000 字符上限 / 未知音色 / 非法语速", async (t) => {
  const gw = await startGateway({env: DOUBAO_ENV, gateway: {fetchImpl: doubaoAudio()}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const tooLong = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {text: "a".repeat(2001), consent: true, voiceId: VOICE},
  });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.json.code, "TEXT_TOO_LARGE");

  const unknownVoice = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {text: "Hello", consent: true, voiceId: "not-a-voice"},
  });
  assert.equal(unknownVoice.status, 400);
  assert.equal(unknownVoice.json.code, "UNKNOWN_VOICE");

  const badRate = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {text: "Hello", consent: true, voiceId: VOICE, rate: 3},
  });
  assert.equal(badRate.status, 400);
  assert.equal(badRate.json.code, "INVALID_RATE");
});

test("403：TTS 未显式同意", async (t) => {
  const gw = await startGateway({env: DOUBAO_ENV, gateway: {fetchImpl: doubaoAudio()}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {text: "Hello", voiceId: VOICE},
  });
  assert.equal(response.status, 403);
  assert.equal(response.json.code, "CONSENT_REQUIRED");
});

test("402：TTS 预算为 0", async (t) => {
  const gw = await startGateway({
    env: {...DOUBAO_ENV, CLOUD_TTS_BUDGET_CNY: "0"},
    gateway: {fetchImpl: doubaoAudio()},
  });
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {text: "Hello", consent: true, voiceId: VOICE},
  });
  assert.equal(response.status, 402);
  assert.equal(response.json.code, "BUDGET_ZERO");
});

test("幂等：同一 Idempotency-Key 只合成一次、只扣一次费", async (t) => {
  let calls = 0;
  const fetchImpl = async (...args) => {
    calls += 1;
    return doubaoAudio(Buffer.from("idempotent-audio"))(...args);
  };
  const gw = await startGateway({env: DOUBAO_ENV, gateway: {fetchImpl}});
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const key = "idem-key-00000001";
  const body = {text: "Please say this once only.", consent: true, voiceId: VOICE};
  const first = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body, headers: {"Idempotency-Key": key},
  });
  assert.equal(first.status, 200);
  assert.equal(first.json.replayed, false);

  const second = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body, headers: {"Idempotency-Key": key},
  });
  assert.equal(second.status, 200);
  assert.equal(second.json.replayed, true);
  assert.equal(second.json.audioBase64, first.json.audioBase64);
  assert.equal(second.json.budget.spentCny, first.json.budget.spentCny);
  assert.equal(calls, 1, "幂等重放不应再次调用上游");

  const conflict = await gw.request("/v1/tts/synthesize", {
    method: "POST", token, body: {...body, text: "A different sentence."}, headers: {"Idempotency-Key": key},
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.code, "IDEMPOTENCY_CONFLICT");
});

test("不落盘原文：幂等响应只含音频与 sha，不含学习文本", async (t) => {
  const source = "UNIQUE-LEARNING-SENTENCE-9f3c2b-do-not-store-plaintext";
  const gw = await startGateway({
    env: DOUBAO_ENV,
    gateway: {fetchImpl: doubaoAudio(Buffer.from("sha-audio"))},
  });
  t.after(() => gw.close());
  const token = await tokenOf(gw);

  const response = await gw.request("/v1/tts/synthesize", {
    method: "POST",
    token,
    body: {text: source, consent: true, voiceId: VOICE},
    headers: {"Idempotency-Key": "idem-no-plaintext"},
  });
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(response.json).includes(source), false);

  const db = new DatabaseSync(path.join(gw.dir, "state.db"), {readOnly: true});
  try {
    const row = db.prepare("SELECT response_json FROM idempotency WHERE key=?").get("idem-no-plaintext");
    assert.ok(row, "幂等记录应存在");
    assert.equal(String(row.response_json).includes(source), false, "幂等表不得出现原文");
    assert.equal(String(row.response_json).includes('"textSha256"'), true);
  } finally {
    db.close();
  }
});