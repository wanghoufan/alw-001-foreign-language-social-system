import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {normalizeSession, saveSession} from "./conversation-archive.mjs";

async function tempRoot(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sm-archive-"));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  return dir;
}

const base = (override = {}) => ({
  sessionId: "sess_20261101_abcd1234",
  startedAt: "2026-11-01T02:00:00.000Z",
  endedAt: "2026-11-01T02:05:00.000Z",
  appVersion: "0.4.0",
  consent: {recording: true, retention: true, cloudAi: false},
  segments: [
    {
      eventId: "e1", final: true, startMs: 0, endMs: 3200,
      receivedAt: "2026-11-01T02:00:04.000Z", speakerId: null,
      track: "mix", provider: "tencent", mock: false,
      textOriginal: "Hello, this is social media with our voice.",
    },
  ],
  ...override,
});

test("写入 Markdown 与 JSON，文件名与权限符合约定", async (t) => {
  const root = await tempRoot(t);
  const result = await saveSession(base(), {root});
  assert.equal(result.status, "created");
  assert.match(path.basename(result.markdown),
    /^SocialMate-2026-11-01-020000-sess_20261101_abcd1234\.md$/);

  const markdown = await fs.readFile(result.markdown, "utf8");
  assert.match(markdown, /以下为 ASR 原始转写/);
  assert.match(markdown, /Hello, this is social media with our voice\./);
  assert.match(markdown, /说话人 unknown/);

  const json = JSON.parse(await fs.readFile(result.json, "utf8"));
  assert.equal(json.session.sessionId, "sess_20261101_abcd1234");
  assert.equal(json.contentHash, result.hash);

  const stat = await fs.stat(result.json);
  assert.equal(stat.mode & 0o777, 0o600);
});

test("未勾选留存同意时拒绝入库", async (t) => {
  const root = await tempRoot(t);
  await assert.rejects(
    () => saveSession(base({consent: {recording: true, retention: false}}), {root}),
    /留存并导出同意/,
  );
});

test("interim 段被拒绝", async (t) => {
  const root = await tempRoot(t);
  const payload = base();
  payload.segments[0].final = false;
  await assert.rejects(() => saveSession(payload, {root}), /不是 final 段/);
});

test("同内容重复投递返回 duplicate，不写第二份", async (t) => {
  const root = await tempRoot(t);
  const first = await saveSession(base(), {root});
  const second = await saveSession(base(), {root});
  assert.equal(second.status, "duplicate");
  assert.equal(second.markdown, first.markdown);
  const files = (await fs.readdir(path.dirname(first.json))).filter((f) => f.endsWith(".md"));
  assert.equal(files.length, 1);
});

test("更高 revision 覆盖，更低 revision 冲突", async (t) => {
  const root = await tempRoot(t);
  await saveSession(base(), {root});
  const revised = base({
    revision: 2,
    segments: [{...base().segments[0], textOriginal: "Hello, this is SocialMate with a real voice."}],
  });
  assert.equal((await saveSession(revised, {root})).status, "revised");
  await assert.rejects(() => saveSession(base({revision: 1}), {root}), /revision 未提升/);
});

test("sessionId 不能用于路径穿越", async (t) => {
  const root = await tempRoot(t);
  await assert.rejects(() => saveSession(base({sessionId: "../../etc/passwd"}), {root}), /sessionId/);
});

test("MOCK 标识与 AI 小节独立保留", async (t) => {
  const root = await tempRoot(t);
  const payload = base({
    segments: [{...base().segments[0], mock: true}],
    ai: {text: "Try asking about the coffee place.", provider: "deepseek", createdAt: "2026-11-01T02:06:00.000Z"},
  });
  const result = await saveSession(payload, {root});
  const markdown = await fs.readFile(result.markdown, "utf8");
  assert.match(markdown, /MOCK/);
  assert.match(markdown, /## AI 建议（独立生成，不覆盖原文）/);
  assert.match(markdown, /Try asking about the coffee place\./);
});

test("归一化不保留音频字段", () => {
  const session = normalizeSession({...base(), wavPath: "/tmp/secret.wav", audio: "base64"});
  assert.equal("wavPath" in session, false);
  assert.equal("audio" in session, false);
});
test("原文逐字保留，不 trim", async (t) => {
  const root = await tempRoot(t);
  const text = "  Hello,  this is  SocialMate.  ";
  const result = await saveSession(base({segments: [{...base().segments[0], textOriginal: text}]}), {root});
  const json = JSON.parse(await fs.readFile(result.json, "utf8"));
  assert.equal(json.session.segments[0].textOriginal, text);
  const markdown = await fs.readFile(result.markdown, "utf8");
  assert.ok(markdown.includes(text));
});

test("文件名使用完整 sessionId，避免短 ID 碰撞", async (t) => {
  const root = await tempRoot(t);
  const a = await saveSession(base({sessionId: "sess_aaaabbbb_1111"}), {root});
  const b = await saveSession(base({sessionId: "sess_aaaabbbb_2222"}), {root});
  assert.notEqual(a.markdown, b.markdown);
});
