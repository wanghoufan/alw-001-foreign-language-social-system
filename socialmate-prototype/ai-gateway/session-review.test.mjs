import assert from "node:assert/strict";
import test from "node:test";

import {buildAiReview, buildLocalReview, prepareSession, validateAiReview} from "./session-review.mjs";

const SESSION = {
  sessionId: "sess_20261101T120000_abc123",
  startedAt: "2026-11-01T12:00:00.000Z",
  endedAt: "2026-11-01T12:05:00.000Z",
  appVersion: "0.5.2",
  consent: {recording: true, retention: true, cloudAi: false},
  revision: 1,
  segments: [
    {eventId: "e1", startMs: 0, endMs: 3200, receivedAt: "2026-11-01T12:00:03.000Z",
      speakerId: "spk_0", track: "mix", provider: "tencent", mock: false,
      textOriginal: "I usually run in Evergreen Park on Sunday mornings. 你呢？"},
    {eventId: "e2", startMs: 3400, endMs: 6000, receivedAt: "2026-11-01T12:00:06.000Z",
      speakerId: "spk_1", track: "mix", provider: "tencent", mock: true,
      textOriginal: "I like coffee near the sea."},
    {eventId: "e3", startMs: 6200, endMs: 8000, receivedAt: "2026-11-01T12:00:08.000Z",
      speakerId: "spk_0", track: "mix", provider: "tencent", mock: false,
      textOriginal: "今天天气不错。"},
  ],
};

test("本地复盘：纯规则、不调用 AI，候选都带真实段号且归属未知", () => {
  const review = buildLocalReview(SESSION);
  assert.equal(review.engine, "local-keyword");
  assert.equal(review.aiUsed, false);
  assert.equal(review.stats.aiRequests, 0);
  assert.equal(review.summary.segments, 3);
  assert.deepEqual(review.summary.speakers, ["spk_0", "spk_1"]);
  assert.equal(review.summary.mockSegments, 1);
  assert.ok(review.items.length >= 2);
  for (const item of review.items) {
    assert.equal(item.attribution, "unknown");
    assert.equal(item.engine, "local-keyword");
    assert.ok(Number.isInteger(item.source.segmentIndex));
    assert.match(item.source.quote, new RegExp(item.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 12)));
  }
  // 模板句必须自曝是模板，不能冒充 AI
  assert.equal(review.howToReply.template, true);
  assert.ok(review.followUps.length >= 2);
  for (const q of review.followUps) assert.equal(q.template, true);
});

test("本地复盘：没有第一人称句子时不编造候选", () => {
  const review = buildLocalReview({
    ...SESSION,
    segments: [{eventId: "e1", startMs: 0, endMs: 1000, receivedAt: "2026-11-01T12:00:01.000Z",
      speakerId: "spk_0", track: "mix", provider: "tencent", mock: false,
      textOriginal: "Nice weather today."}],
  });
  assert.equal(review.items.length, 0);
  assert.equal(review.stats.candidates, 0);
});

test("prepareSession 拒绝非法会话", () => {
  assert.throws(() => prepareSession(null), /会话不存在/);
  assert.throws(() => prepareSession({sessionId: "short", segments: []}), /sessionId/);
  assert.throws(() => prepareSession({sessionId: "sess_20261101T120000_abc123", segments: []}), /没有 final 原文/);
});

test("validateAiReview 丢弃指不到段号的候选，并拒绝缺少要点的输出", () => {
  const prepared = prepareSession(SESSION);
  const review = validateAiReview({
    headline: "聊了跑步和咖啡",
    talkedAbout: ["晨跑路线", "海边咖啡"],
    howToReply: "Which park do you like best?",
    followUps: ["What time do you usually run?", "Do you drink coffee every day?"],
    candidates: [
      {kind: "fact", text: "I usually run in Evergreen Park on Sunday mornings.", segmentIndex: 0, confidence: "high"},
      {kind: "fact", text: "编造的段号", segmentIndex: 99, confidence: "high"},
      {kind: "fact", text: "I usually run in Evergreen Park on Sunday mornings.", segmentIndex: 0, confidence: "high"},
    ],
  }, prepared);
  assert.equal(review.items.length, 1);
  assert.equal(review.items[0].source.segmentIndex, 0);
  assert.equal(review.items[0].source.speakerId, "spk_0");
  assert.equal(review.dropped.length, 1);
  assert.equal(review.dropped[0].reason, "unknown-segment");

  assert.throws(() => validateAiReview({talkedAbout: [], followUps: []}, prepared), /缺少要点或追问/);
  assert.throws(() => validateAiReview(null, prepared), /未输出 JSON/);
});

test("validateAiReview：ASR 重复定稿导致的近似重复候选只保留更完整的一条", () => {
  const prepared = prepareSession(SESSION);
  const review = validateAiReview({
    headline: "重复定稿",
    talkedAbout: ["跑步"],
    howToReply: "Where do you run?",
    followUps: ["When do you run?"],
    candidates: [
      {kind: "fact", text: "I went running by the waterfront this morning", segmentIndex: 0, confidence: "high"},
      {kind: "fact", text: "I went running by the waterfront this morning and had coffee", segmentIndex: 1, confidence: "high"},
    ],
  }, prepared);
  assert.equal(review.items.length, 1);
  assert.match(review.items[0].text, /and had coffee/);
  assert.equal(review.dropped.filter((d) => d.reason === "near-duplicate").length >= 1, true);
});

test("buildAiReview 走真实模型路径：只提交带 index 的段落，输出仍标 ai", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({url, init});
    const payload = JSON.parse(init.body);
    assert.equal(payload.response_format.type, "json_object");
    assert.equal(payload.stream, false);
    const segments = JSON.parse(payload.messages[1].content).segments;
    assert.deepEqual(segments.map((s) => s.index), [0, 1, 2]);
    return {
      ok: true,
      json: async () => ({
        choices: [{message: {content: JSON.stringify({
          headline: "聊了跑步与咖啡",
          talkedAbout: ["周日晨跑"],
          howToReply: "Which park do you like best?",
          followUps: ["What time do you run?", "Do you like coffee?"],
          candidates: [{kind: "fact", text: "I run in Evergreen Park on Sunday mornings.", segmentIndex: 0, confidence: "medium"}],
          warnings: ["说话人身份未确认"],
        })}}],
        usage: {prompt_tokens: 300, completion_tokens: 120},
      }),
    };
  };
  const review = await buildAiReview(SESSION, {
    env: {DEEPSEEK_API_KEY: "sk-test-1234567890"}, fetchImpl: fakeFetch, timeoutMs: 3000,
  });
  assert.equal(calls.length, 1);
  assert.equal(review.engine, "ai");
  assert.equal(review.aiUsed, true);
  assert.equal(review.aiProvider, "deepseek");
  assert.equal(review.items.length, 1);
  assert.equal(review.followUps[0].template, false);
  assert.deepEqual(review.warnings, ["说话人身份未确认"]);
  assert.equal(review.stats.aiRequests, 1);
});

test("buildAiReview 在未配置密钥时直接拒绝，不发起请求", async () => {
  let called = false;
  await assert.rejects(
    () => buildAiReview(SESSION, {env: {}, fetchImpl: async () => { called = true; }}),
    /尚未在 Mac 服务端配置|未配置/,
  );
  assert.equal(called, false);
});
