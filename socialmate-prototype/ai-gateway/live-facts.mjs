/**
 * T2：真实 ASR final → 待确认候选 → 用户指定人物并确认 → 人物档案事实。
 *
 * 硬边界（对应 PLAN T2 与 ACCEPTANCE QA03）：
 * - 事件驱动：监听 8790 桥的真实 final（mock:true 一律拒绝），不是 demo/final 回放；
 * - 内存优先：逐字原文只在本进程内存里短暂存在，默认不写任何文件；进程重启即消失；
 * - 单条字段分离：sessionId / segmentIndex / textOriginal / candidateFact 四个字段独立，
 *   speaker 恒为 unknown，ASR 的 spk_0/A/B 只作为 speakerRaw 审计，绝不自动归人；
 * - 只有用户显式给出目标人物 + confirm:true，才写入演示人物档案（隔离 Demo/People），
 *   真实 SocialMate-Data/People 与本模块无任何写路径；
 * - 重复确认、快速连点、断线重连：pendingId 幂等 + people-store 的 sm-src 去重，合计 0 双写；
 * - 确认/撤回都不调用任何付费接口，ASR 计费只取决于 8790 实际送入腾讯云的音频。
 *
 * 落盘内容仅限「元数据索引」：factId / slug / sessionId / segmentIndex / confirmedAt，
 * 不含逐字原文，用于重启后仍能撤回。事实正文是用户在候选卡上确认的那句摘要。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  addDemoConversationFact, assertIsolated, deleteDemoFact, demoRoot, readPersona,
} from "./demo-store.mjs";

export const LIVE_TTL_MS = 30 * 60 * 1000;
export const MAX_PENDING = 40;
export const MAX_SESSIONS = 8;
export const MAX_TEXT = 700;
const DEDUPE_WINDOW_MS = 90 * 1000;
const INDEX_FILE = "live-facts.json";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sessions = new Map(); // sessionId -> {sessionId, createdAt, lastAt, seq, finals}
const confirmedById = new Map(); // pendingId -> {slug, factId, at}
const counters = {ingested: 0, rejectedMock: 0, rejectedEmpty: 0, duplicated: 0, confirmed: 0, withdrawn: 0};

/* 单用户单进程：确认/撤回串行化，快速连点或断线重试不会并发写索引。 */
let queue = Promise.resolve();
function serial(fn) {
  const next = queue.then(fn, fn);
  queue = next.catch(() => {});
  return next;
}

function fail(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * 候选摘要：从原文做**轻量抽取**，去掉第一人称主语和口头填充词，
 * 让它成为一条可编辑的事实陈述，而不是把逐字 final 原样当摘要（两者必须分字段）。
 */
export function summarize(text) {
  let value = normalizeText(text);
  value = value.replace(/^(?:um+|uh+|er+|so|well|you know|i mean)[,\s]+/i, "");
  value = value.replace(/^(?:i am|i'm|i've|i|we are|we're|we|it's)\s+/i, "");
  if (!value) value = normalizeText(text);
  value = value.charAt(0).toUpperCase() + value.slice(1);
  value = value.replace(/[.,;!?]+$/, "");
  if (value.length > 120) value = `${value.slice(0, 117).trim()}…`;
  return value;
}

function pendingIdOf(sessionId, segmentIndex, text) {
  return "liv_" + crypto.createHash("sha1")
    .update(`${sessionId}|${segmentIndex}|${String(text).toLowerCase()}`)
    .digest("hex").slice(0, 16);
}

function purgeExpired(now = Date.now()) {
  for (const [sessionId, session] of sessions) {
    if (now - session.lastAt > LIVE_TTL_MS) {
      sessions.delete(sessionId);
      continue;
    }
    session.finals = session.finals.filter((item) => now - item.lastAtMs <= LIVE_TTL_MS);
  }
  // 会话数上限：先淘汰最久没更新的。
  if (sessions.size > MAX_SESSIONS) {
    const ordered = [...sessions.values()].sort((a, b) => a.lastAt - b.lastAt);
    for (const session of ordered.slice(0, sessions.size - MAX_SESSIONS)) sessions.delete(session.sessionId);
  }
  // 待确认总量上限：淘汰最旧的候选（只在内存里，丢了可以重新录）。
  const all = [...sessions.values()].flatMap((session) => session.finals);
  if (all.length > MAX_PENDING) {
    const drop = new Set(all.sort((a, b) => a.lastAtMs - b.lastAtMs).slice(0, all.length - MAX_PENDING)
      .map((item) => item.id));
    for (const session of sessions.values()) {
      session.finals = session.finals.filter((item) => !drop.has(item.id));
    }
  }
}

function ensureSession(event) {
  const sessionId = String(event.sessionId || "").trim().slice(0, 80);
  if (!sessionId) return null;
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId, createdAt: Date.now(), lastAt: Date.now(), seq: 0, finals: [],
      track: event.track || "mix", mock: event.mock === true,
    };
    sessions.set(sessionId, session);
  }
  session.lastAt = Date.now();
  return session;
}

/**
 * 消费一条 ASR 事件。只有真实（mock:false）final 会进入候选队列。
 * 返回 {accepted, reason?, item?, pendingCount}；永不抛错，避免拖垮 ASR 事件循环。
 */
export function ingest(event) {
  try {
    if (!event || event.type !== "final" || event.final !== true) {
      return {accepted: false, reason: "NOT_FINAL", pendingCount: countPending()};
    }
    if (event.mock === true) {
      counters.rejectedMock += 1;
      return {accepted: false, reason: "MOCK_FINAL_REJECTED", pendingCount: countPending()};
    }
    const text = normalizeText(event.text);
    if (text.length < 2) {
      counters.rejectedEmpty += 1;
      return {accepted: false, reason: "EMPTY_TEXT", pendingCount: countPending()};
    }
    const session = ensureSession(event);
    if (!session) return {accepted: false, reason: "SESSION_ID_REQUIRED", pendingCount: countPending()};
    purgeExpired();

    const now = Date.now();
    // 断线重连/上游重发：90 秒内同句视为同一条，只留一条候选。
    const duplicate = [...sessions.values()]
      .flatMap((s) => s.finals)
      .find((item) => item.textOriginal === text && now - item.lastAtMs <= DEDUPE_WINDOW_MS);
    if (duplicate) {
      counters.duplicated += 1;
      return {accepted: false, reason: "DUPLICATE_FINAL", item: duplicate, pendingCount: countPending()};
    }

    const segmentIndex = session.seq;
    session.seq += 1;
    const item = {
      id: pendingIdOf(session.sessionId, segmentIndex, text),
      sessionId: session.sessionId,
      segmentIndex,
      textOriginal: text,
      candidateFact: summarize(text),
      candidateFactSource: "extractive",
      speaker: "unknown",
      // spk_0 / A / B 只做审计，UI 与写档案都不读这个字段来归人。
      speakerRaw: String(event.speaker || "unknown").slice(0, 32),
      providerIndex: Number.isInteger(event.index) ? event.index : null,
      track: event.track || "mix",
      startMs: Number.isFinite(event.startMs) ? event.startMs : 0,
      endMs: Number.isFinite(event.endMs) ? event.endMs : 0,
      mock: false,
      provider: "tencent",
      receivedAt: new Date(now).toISOString(),
      lastAtMs: now,
      attribution: null,
      confirmed: false,
      source: "live-asr",
      demonstration: false,
    };
    session.finals.push(item);
    counters.ingested += 1;
    purgeExpired();
    return {accepted: true, item, pendingCount: countPending()};
  } catch {
    return {accepted: false, reason: "INGEST_FAILED", pendingCount: countPending()};
  }
}

function countPending() {
  let total = 0;
  for (const session of sessions.values()) total += session.finals.length;
  return total;
}

export function pending({sessionId} = {}) {
  purgeExpired();
  const filter = String(sessionId || "").trim();
  const items = [...sessions.values()]
    .filter((session) => !filter || session.sessionId === filter)
    .flatMap((session) => session.finals)
    .sort((a, b) => b.lastAtMs - a.lastAtMs)
    .map((item) => ({...item, lastAtMs: undefined}));
  return items;
}

export function status() {
  purgeExpired();
  return {
    pending: countPending(),
    sessions: [...sessions.values()].map((session) => ({
      sessionId: session.sessionId, track: session.track, pending: session.finals.length,
      createdAt: new Date(session.createdAt).toISOString(),
      lastAt: new Date(session.lastAt).toISOString(),
    })),
    confirmed: confirmedById.size,
    ttlMs: LIVE_TTL_MS,
    maxPending: MAX_PENDING,
    // 逐字原文只在内存：这里显式声明，便于验收脚本断言。
    persistedTranscripts: false,
    diskFormat: "metadata-only (factId/slug/sessionId/segmentIndex/confirmedAt)",
    counters: {...counters},
  };
}

/** 离开会话/页面时的清理：只动内存，不碰已确认档案。 */
export function clear({sessionId} = {}) {
  const filter = String(sessionId || "").trim();
  if (!filter) {
    const removed = countPending();
    sessions.clear();
    return {ok: true, cleared: removed, scope: "all"};
  }
  const session = sessions.get(filter);
  const removed = session ? session.finals.length : 0;
  sessions.delete(filter);
  return {ok: true, cleared: removed, scope: "session", sessionId: filter};
}

function findPending(id) {
  for (const session of sessions.values()) {
    const found = session.finals.find((item) => item.id === id);
    if (found) return {session, item: found};
  }
  return null;
}

function indexPath() {
  return path.join(demoRoot(), INDEX_FILE);
}

async function readIndex() {
  try {
    const raw = JSON.parse(await fs.readFile(indexPath(), "utf8"));
    if (!raw || !Array.isArray(raw.items)) return {schema: 1, items: []};
    // 只接受元数据字段，防御历史脏数据把逐字原文带进来。
    return {
      schema: 1,
      items: raw.items.filter((item) => item && item.factId && item.slug).map((item) => ({
        factId: String(item.factId), slug: String(item.slug),
        sessionId: String(item.sessionId || ""), segmentIndex: Number(item.segmentIndex),
        confirmedAt: item.confirmedAt || null, withdrawnAt: item.withdrawnAt || null,
      })),
    };
  } catch {
    return {schema: 1, items: []};
  }
}

async function writeIndex(index) {
  const target = indexPath();
  await fs.mkdir(path.dirname(target), {recursive: true, mode: 0o700});
  const temp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify({schema: 1, items: index.items}, null, 2)}\n`,
    {encoding: "utf8", mode: 0o600});
  await fs.rename(temp, target);
  return target;
}

/**
 * 确认一条候选：必须显式给出目标人物（禁用 spk_0 等自动归属）。
 * 同名 pendingId 重复提交返回 duplicate:true，不新增第二条事实、不额外写盘。
 */
async function confirmLivePendingInner({pendingId, slug, candidateFact, confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "确认事实需要用户显式确认（confirm:true）");
  assertIsolated();
  const target = String(slug || "").trim();
  const id = String(pendingId || "").trim();
  if (!id) throw fail(400, "PENDING_ID_REQUIRED", "缺少待确认事实标识");

  const found = findPending(id);
  if (!found) {
    const remembered = confirmedById.get(id);
    if (remembered) {
      const person = await readPersona(remembered.slug);
      return {
        ok: true, duplicate: true, alreadyConfirmed: true, id,
        factId: remembered.factId, slug: remembered.slug,
        person, prep: person.prep, realPeopleUntouched: true,
      };
    }
    throw fail(404, "LIVE_PENDING_NOT_FOUND", "这条候选已不在内存队列里（已处理或已过期）");
  }
  if (!target) throw fail(400, "ATTRIBUTION_REQUIRED", "说话人未确定：请先选择这条事实属于哪位人物");
  // readPersona 只读演示命名空间；真实 People 的同名 slug 不会命中也写不进去。
  const before = await readPersona(target);
  const item = found.item;
  const factText = normalizeText(candidateFact || item.candidateFact || "");
  if (factText.length < 2) throw fail(400, "EMPTY_FACT_TEXT", "候选摘要为空，无法写入");

  const written = await addDemoConversationFact({
    slug: target,
    text: factText,
    section: "preference",
    group: "other",
    sessionId: item.sessionId,
    segmentIndex: item.segmentIndex,
    sourceLabel: `实时会话 ${item.sessionId.slice(0, 8)}… 段 ${item.segmentIndex + 1}`,
    confirm: true,
  });

  found.session.finals = found.session.finals.filter((pending) => pending.id !== id);
  confirmedById.set(id, {slug: target, factId: written.factId, at: written.confirmedAt});

  const index = await readIndex();
  if (!index.items.some((entry) => entry.factId === written.factId)) {
    index.items.push({
      factId: written.factId, slug: target, sessionId: item.sessionId,
      segmentIndex: item.segmentIndex, confirmedAt: written.confirmedAt,
    });
    await writeIndex(index);
  }
  if (!written.duplicate) counters.confirmed += 1;

  const person = await readPersona(target);
  return {
    ok: true,
    duplicate: written.duplicate,
    id,
    factId: written.factId,
    slug: target,
    confirmed: {
      sessionId: item.sessionId,
      segmentIndex: item.segmentIndex,
      textOriginal: item.textOriginal, // 只在本次响应里回显；不落盘
      candidateFact: factText,
      speaker: "unknown",
      confirmedAt: written.confirmedAt,
    },
    before: {prep: before.prep, factCount: before.factCount},
    after: {prep: person.prep, factCount: person.factCount},
    prep: person.prep,
    person,
    realPeopleUntouched: true,
  };
}

export function confirmLivePending(args = {}) {
  return serial(() => confirmLivePendingInner(args));
}

export async function ignoreLivePending({pendingId, confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "忽略候选需要用户显式确认（confirm:true）");
  const id = String(pendingId || "").trim();
  const found = findPending(id);
  if (!found) throw fail(404, "LIVE_PENDING_NOT_FOUND", "这条候选已不在内存队列里");
  found.session.finals = found.session.finals.filter((item) => item.id !== id);
  return {ok: true, ignored: id, pendingCount: countPending()};
}

/** 重启后仍能撤回：索引里只有元数据，事实正文本来就在演示人物档案里。 */
export async function listLiveFacts({sessionId} = {}) {
  const index = await readIndex();
  const filter = String(sessionId || "").trim();
  const seen = new Set();
  const items = index.items
    .filter((item) => !item.withdrawnAt && (!filter || item.sessionId === filter))
    .filter((item) => (seen.has(item.factId) ? false : (seen.add(item.factId), true)))
    .sort((a, b) => String(b.confirmedAt || "").localeCompare(String(a.confirmedAt || "")));
  const out = [];
  for (const item of items) {
    let person;
    try {
      person = await readPersona(item.slug);
    } catch {
      continue;
    }
    const fact = (person.confirmed || []).find((entry) => entry.id === item.factId);
    if (!fact) continue;
    out.push({
      ...item, text: fact.text, section: fact.section, group: fact.group,
      sourceExactTextUnavailable: true, live: true,
    });
  }
  return out;
}

async function withdrawLiveFactInner({factId, slug, confirm} = {}) {
  if (confirm !== true) throw fail(400, "CONFIRM_REQUIRED", "撤回事实需要用户显式确认（confirm:true）");
  assertIsolated();
  const id = String(factId || "").trim();
  const index = await readIndex();
  const entry = index.items.find((item) => item.factId === id);
  if (!entry) throw fail(404, "LIVE_FACT_NOT_FOUND", "这条事实不是实时会话写入的，不能用实时撤回");
  const target = String(slug || entry.slug).trim();
  if (target !== entry.slug) {
    throw fail(403, "FACT_OWNERSHIP_MISMATCH", "这条事实属于另一位人物，拒绝按错误归属撤回");
  }

  if (entry.withdrawnAt) {
    // 重复撤回：幂等成功，不重复删除、不重复记 changelog。
    const person2 = await readPersona(target);
    return {ok: true, withdrawn: false, alreadyAbsent: true, factId: id, slug: target,
      prep: person2.prep, person: person2, realPeopleUntouched: true};
  }

  const person = await readPersona(target);
  const exists = (person.confirmed || []).some((fact) => fact.id === id);
  if (exists) {
    await deleteDemoFact(target, id, {confirm: true});
    counters.withdrawn += 1;
  }
  const withdrawnAt = new Date().toISOString();
  const next = {...index, items: index.items.map((item) =>
    item.factId === id ? {...item, withdrawnAt} : item)};
  await writeIndex(next);
  const after = await readPersona(target);
  return {
    ok: true, withdrawn: exists, alreadyAbsent: !exists, factId: id, slug: target,
    prep: after.prep, person: after, realPeopleUntouched: true,
  };
}

export function withdrawLiveFact(args = {}) {
  return serial(() => withdrawLiveFactInner(args));
}

/** 仅供测试/诊断：把内存状态与索引一起清掉，不碰已确认事实。 */
export function resetForTests() {
  sessions.clear();
  confirmedById.clear();
  for (const key of Object.keys(counters)) counters[key] = 0;
}

export const LIVE_FACTS_PATHS = {index: indexPath};

export {UUID_RE as LIVE_SESSION_ID_RE};
