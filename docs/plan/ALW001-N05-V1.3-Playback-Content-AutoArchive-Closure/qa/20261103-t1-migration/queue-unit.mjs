#!/usr/bin/env node
/**
 * ALW-001 N05 V1.3 · T1 混合语言播放队列引擎单测
 *
 * 直接从 socialmate-v1.2/index.html 里切出真实实现（不复制一份逻辑），
 * 用假的 TTS 桥模拟「真实音频完成回调」，验证：
 *   - 一轮队列顺序：中文 → 英A → 英B → (词组中文 → 1000ms → 词组英文)*N
 *   - 循环 N 轮 = N 个完整队列，不是单文本循环
 *   - 词组中文与英文之间确实是 1000ms 静音（调度器计时）
 *   - 停止/切段取消后不再推进
 *   - 原生 error 事件 → failed，不静默成功
 *
 * 注意：这是「调度层」验证，不是音频音质验证；真机声线证据看 QA 报告里的 logcat。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统";
const HTML = path.join(ROOT, "socialmate-v1.2/index.html");
const REC = JSON.parse(fs.readFileSync(path.join(
  ROOT, "SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json"), "utf8"));

const html = fs.readFileSync(HTML, "utf8");
const start = html.indexOf("/* ============ N05 V1.3 学习播放队列");
const end = html.indexOf("(function installTtsHost()");
if (start < 0 || end < 0 || end < start) throw new Error("无法从 index.html 切出队列引擎代码段");
const engineSrc = html.slice(start, end);

function makeHarness() {
  const events = [];
  const timeline = [];
  let t0 = Date.now();
  const fakeBridge = {
    setRate() {},
    stop() { events.push({ ev: "bridge_stop" }); },
    speakTextWithIds(text, lang, loop, rid, bid, rev) {
      const at = Date.now();
      events.push({ ev: "speak", text, lang, loop, rid, bid, rev, at });
      const dur = Math.max(8, Math.min(40, String(text).length * 2));
      setTimeout(() => {
        if (cancelled) return;
        state.onState({ type: "state", state: "finished", wallMs: dur, fileMs: dur });
      }, dur);
      return JSON.stringify({ ok: true, code: "OK", cacheHit: false, providerId: "fake-system" });
    },
  };
  let cancelled = false;
  const N = { tts: { rate: 1, loop: 1, cur: 0, state: "idle", detail: "", last: null }, view: { placeId: "pv-hongcheng-lake-park" } };
  const stubs = `
    const N = arguments[0];
    const events = arguments[1];
    const state = arguments[2];
    function note(msg){ events.push({ev:'note', msg:String(msg)}); }
    function qa(){ return []; }
    function ttsBridge(){ return arguments[3]; }
    function ttsStop(){ events.push({ev:'tts_stop'}); }
    function bridgeResult(v){ return typeof v==='string'? JSON.parse(v) : (v||{}); }
    function setTtsState(s,d){ N.tts.state=s; N.tts.detail=d||''; events.push({ev:'state', state:s, detail:d||''}); }
    const performance = { now: () => Date.now() - (arguments[4]||0) };
    const window = { SocialMateLog: null };
    const document = {};
  `;
  const state = { onState: () => {} };
  const fn = new Function("N", "events", "state", "bridge", "t0",
    stubs.replace(/const N = arguments\[0\];/, "").replace(/const events = arguments\[1\];/, "")
      .replace(/const state = arguments\[2\];/, "").replace(/arguments\[3\]/g, "bridge")
      .replace(/arguments\[4\]/g, "t0")
    + engineSrc + `
    return { buildStudyPlaybackQueue, startStudyQueue, smTtsOnState, phrasePairsOf, phraseGapStats, getQueue: () => SMQ, cancel: (r) => smqCancel(r,false) };
  `);
  const api = fn(N, events, state, fakeBridge, t0);
  state.onState = api.smTtsOnState;
  return { api, events, N, state, timeline, markCancelled: () => { cancelled = true; } };
}

function kindsOf(items) { return items.map((i) => i.kind); }
function expectedKinds(playable) {
  const out = ["zh", "enA", "enB"];
  for (let i = 0; i < playable; i++) out.push("phrase-zh", "phrase-en");
  return out;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


async function waitDone(h, capMs) {
  const deadline = Date.now() + (capMs || 40000);
  while (Date.now() < deadline) {
    if (h.api.getQueue() === null) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const block = REC.blocks.find((b) => b.blockId === "blk-hc-2");
const playablePairs = block.phrasePairs.filter((p) => p.playable).length;

/* ---------- 1. 队列构建顺序 ---------- */
{
  const h = makeHarness();
  const built = h.api.buildStudyPlaybackQueue(REC, block, "full", {});
  const got = kindsOf(built.items);
  check("T1-U1 一轮顺序为中→英A→英B→词组对", JSON.stringify(got) === JSON.stringify(expectedKinds(playablePairs)),
    `kinds=${got.join(",")} playablePairs=${playablePairs}`);
  const gaps = built.items.filter((i) => i.kind === "phrase-en").map((i) => i.gapBeforeMs);
  check("T1-U2 词组中文→英文间隔恒为 1000ms", gaps.every((g) => g === 1000), `gaps=${gaps.join(",")}`);
  const zhFirst = built.items.find((i) => i.kind === "phrase-zh");
  check("T1-U3 词组先中文后英文（不会英文当先）",
    /[\u3400-\u9fff]/.test(zhFirst.text) && !/[\u3400-\u9fff]/.test(built.items.find((i) => i.kind === "phrase-en").text),
    `zh=${zhFirst.text} en=${built.items.find((i) => i.kind === "phrase-en").text}`);
  const notPlayable = built.items.filter((i) => i.kind === "phrase-en" && /[\u3400-\u9fff]/.test(i.text));
  check("T1-U4 英文声道里不含中文占位", notPlayable.length === 0, `bad=${notPlayable.length}`);
}

/* ---------- 2. 单播只播单项 ---------- */
for (const mode of ["zh", "enA", "enB"]) {
  const h = makeHarness();
  const built = h.api.buildStudyPlaybackQueue(REC, block, mode, {});
  check(`T1-U5 单播 ${mode} 只有 1 项且语种正确`,
    built.items.length === 1 && (mode === "zh" ? built.items[0].lang === "zh" : built.items[0].lang === "en"),
    `items=${built.items.length} lang=${built.items[0] && built.items[0].lang}`);
}

/* ---------- 3. 听词组：只有词组对 ---------- */
{
  const h = makeHarness();
  const built = h.api.buildStudyPlaybackQueue(REC, block, "phrases", {});
  const got = kindsOf(built.items);
  const want = expectedKinds(playablePairs).slice(3);
  check("T1-U6 听词组不包含整段中文/英A/英B", JSON.stringify(got) === JSON.stringify(want), `kinds=${got.join(",")}`);
}

/* ---------- 4. 真跑一轮：顺序 + 1000ms 间隔实测 ---------- */
await (async () => {
  const h = makeHarness();
  h.api.startStudyQueue(REC, block, "full", { loop: 1 });
  await waitDone(h, 30000);
  const speaks = h.events.filter((e) => e.ev === "speak");
  const order = speaks.map((s) => (s.lang === "zh" ? "zh" : "en"));
  check("T1-U7 实跑一轮元素数正确", speaks.length === 3 + playablePairs * 2, `speak=${speaks.length} want=${3 + playablePairs * 2}`);
  const zh2 = speaks.findIndex((s, i) => i > 2 && s.lang === "zh");
  const en2 = zh2 + 1;
  const gapMs = speaks[en2].at - speaks[zh2].at;
  check("T1-U8 第一个词组中间隔 ≥1000ms（实测）", gapMs >= 990,
    `measured=${gapMs}ms（含中文朗读完成时间，静音段由调度器保证 1000ms）`);
  check("T1-U9 全部走原生单次调用（loop 恒为 1，循环由队列负责）",
    speaks.every((s) => s.loop === 1), `loops=${[...new Set(speaks.map((s) => s.loop))].join(",")}`);
  check("T1-U10 缓存键带 recordId/blockId/revision",
    speaks.every((s) => s.rid === REC.recordId && s.bid === block.blockId && s.rev === 3),
    `rid=${speaks[0].rid} bid=${speaks[0].bid} rev=${speaks[0].rev}`);
})();

/* ---------- 5. 循环 3 轮 = 3 个完整队列 ---------- */
await (async () => {
  const h = makeHarness();
  h.api.startStudyQueue(REC, block, "full", { loop: 3 });
  const perRound = 3 + playablePairs * 2;
  await waitDone(h, 60000);
  const speaks = h.events.filter((e) => e.ev === "speak");
  const finishedState = h.N.tts.state;
  check("T1-U11 循环 3 轮共 3×完整队列", speaks.length === perRound * 3, `speak=${speaks.length} want=${perRound * 3}`);
  const first = speaks.slice(0, perRound).map((s) => (s.lang === "zh" ? "zh" : "en")).join(",");
  const second = speaks.slice(perRound, perRound * 2).map((s) => (s.lang === "zh" ? "zh" : "en")).join(",");
  check("T1-U12 每一轮顺序完全一致（不是只循环中文）", first === second, `r1=${first.slice(0, 40)}…`);
  check("T1-U13 结束后状态为 finished 且给出完成反馈", finishedState === "finished", `state=${finishedState} detail=${h.N.tts.detail}`);
})();

/* ---------- 6. 停止后不再推进 ---------- */
await (async () => {
  const h = makeHarness();
  h.api.startStudyQueue(REC, block, "full", { loop: 1 });
  await sleep(60);
  h.markCancelled();
  h.api.cancel("user_stop");
  const before = h.events.filter((e) => e.ev === "speak").length;
  await sleep(800);
  const after = h.events.filter((e) => e.ev === "speak").length;
  check("T1-U14 停止后不再有新的朗读请求", after === before, `before=${before} after=${after}`);
  check("T1-U15 停止后队列已释放", h.api.getQueue() === null, `queue=${h.api.getQueue()}`);
})();

/* ---------- 7. 原生 error 事件 ---------- */
await (async () => {
  const h = makeHarness();
  h.api.startStudyQueue(REC, block, "full", { loop: 1 });
  await sleep(5);
  h.markCancelled();
  h.api.smTtsOnState({ type: "state", state: "error", code: "TTS_LANG_UNAVAILABLE", message: "缺英文语音包" });
  const notes = h.events.filter((e) => e.ev === "note").map((e) => e.msg);
  check("T1-U16 原生报错时不静默成功，状态进 failed", h.N.tts.state === "failed",
    `state=${h.N.tts.state} detail=${h.N.tts.detail} note=${notes[notes.length - 1] || ""}`);
})();

/* ---------- 8. 缺译文的段：不把英文当中文播 ---------- */
{
  const h = makeHarness();
  const fakeBlock = { blockId: "blk-x", cnSentences: ["测试。"], enVariants: ["Test."], phrases: ["coconut water"] };
  const built = h.api.buildStudyPlaybackQueue({ recordId: "rec-x", revision: 1 }, fakeBlock, "phrases", {});
  const stats = built.phraseStats;
  check("T1-U17 只有英文的旧 phrases 不进可播队列", built.items.length === 0 && stats.missing === 1,
    `items=${built.items.length} missing=${stats.missing}`);
}

const failed = results.filter((r) => !r.ok);
const out = {
  schema: "alw001.n05v13.queue-unit.v1",
  at: new Date().toISOString(),
  blockId: block.blockId,
  recordRevision: REC.revision,
  playablePairs,
  total: results.length,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
};
const outPath = path.join(ROOT, "docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t1-migration/queue-unit.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`\n${out.passed}/${out.total} PASS` + (failed.length ? ` — 失败: ${failed.map((f) => f.name).join("; ")}` : ""));
process.exit(failed.length ? 1 : 0);
