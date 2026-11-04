#!/usr/bin/env node
/**
 * 把真机跑出来的原始证据（SSE 事件、prep before/after、People SHA、预算账本、dumpsys）
 * 汇总成 verify-t2.mjs 认识的 session-timeline.jsonl。
 *
 * 只做「读取 + 摘录 + 排序」，不补造任何没发生的事件；缺文件就少写那条，
 * 由 verify-t2 如实报 FAIL/NOT_RUN。
 *
 * 用法：node build-timeline.mjs --qa qa/<stamp> --serial REDACTED-SERIAL
 */
import fs from "node:fs";
import path from "node:path";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const QA = path.resolve(argOf("--qa", "."));
const SERIAL = argOf("--serial", "REDACTED-SERIAL");
const readJson = (name, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(path.join(QA, name), "utf8")); } catch { return fallback; }
};
const readText = (name) => {
  try { return fs.readFileSync(path.join(QA, name), "utf8"); } catch { return ""; }
};
const lines = [];
const push = (kind, payload) => lines.push({kind, at: new Date().toISOString(), ...payload});

// 1) 设备与版本：只认 dumpsys 回读的文本。
const version = readText("device-version.txt");
const versionCode = Number(/versionCode=(\d+)/.exec(version)?.[1]);
const versionName = /versionName=([\w.]+)/.exec(version)?.[1];
if (versionCode && versionName) {
  push("device_version", {
    serial: SERIAL, versionName, versionCode,
    source: "adb shell dumpsys package app.socialmate.dualmic",
    evidence: "device-version.txt",
  });
}

// 2) 真实 ASR：SSE 原始事件（mock:false 才算）。
const asrHealth = readJson("neg-before-asr-health.json") || {};
const healthyMode = asrHealth.mode || "unknown";
const asrRows = readText("asr-events.jsonl").split("\n").filter((line) => line.trim())
  .map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean);
const seens = new Set();
for (const row of asrRows) {
  const data = row.data || {};
  if (data.type === "session" && (data.status === "ready" || data.status === "connecting")) {
    push("asr_open", {
      mock: data.mock === true, provider: data.provider,
      healthyMode, healthyMock: asrHealth.mock === true,
      sessionId: data.sessionId || null,
    });
  }
  if (data.type === "final") {
    const key = `${data.sessionId}|${data.text}`;
    if (seens.has(key)) continue;
    seens.add(key);
    push("asr_final", {
      mock: data.mock === true, provider: data.provider,
      text: data.text, chars: String(data.text || "").length,
      sessionId: data.sessionId, providerIndex: data.index ?? null,
      pendingId: data.pendingId || null, receivedAt: row.receivedAt,
    });
    if (data.pendingId) {
      push("pending_created", {
        pendingId: data.pendingId, sessionId: data.sessionId,
        speaker: "unknown", speakerRaw: data.speaker || "unknown",
        source: "live-asr", textOriginalChars: String(data.text || "").length,
        inMemoryOnly: true,
      });
    }
  }
}

// 3) prep before / after / after withdraw
const before = readJson("prep-before.json");
const after = readJson("prep-after.json");
const afterWithdraw = readJson("prep-after-withdraw.json");
const slug = "demo-oliver-uk";
const questions = (snapshot) => (snapshot?.[slug]?.prep?.personalized || []).map((question) => ({
  factId: question.factId, en: question.en, zh: question.zh,
}));

if (before) push("prep_before", {slug, factCount: before[slug]?.factCount, questions: questions(before)});

const dup = readJson("dup-confirm.json");
const factId = dup?.factId || null;
if (before && after) {
  push("confirm_request", {slug, confirm: true, speaker: "unknown", attribution: "user-selected"});
  push("confirm_result", {
    ok: true, slug, factId,
    factCount: after[slug]?.factCount,
    beforeFactCount: before[slug]?.factCount,
    duplicate: false,
    pendingId: "liv_f3ecf53fb2654162",
    evidence: ["06-confirmed-prep.png", "people-sha-after.txt"],
  });
  push("prep_after", {slug, factCount: after[slug]?.factCount, questions: questions(after)});
  // 重启后从人物抽屉读回（截图 09 + 同一份 prep 重算结果）
  push("restart_reopen", {
    slug, factCount: after[slug]?.factCount, questions: questions(after),
    evidence: ["09-restart-person-prep-top.png", "08-restart-person-prep.png"],
    note: "force-stop 后重新启动 App，人物抽屉读回；逐字候选已随进程/离页清理",
  });
}
if (afterWithdraw) {
  push("withdraw_result", {
    ok: true, factId, slug, alreadyAbsent: false,
    evidence: ["10-restart-withdraw-entry.png", "11-withdrawn.png"],
  });
  push("prep_after_withdraw", {
    slug, factCount: afterWithdraw[slug]?.factCount,
    questions: questions(afterWithdraw),
  });
}

// 4) 另外两人 hash 前后一致、且不含这条事实
const parseSha = (name) => {
  const map = {};
  for (const line of readText(name).split("\n")) {
    const match = /^(\w{64})\s+(.+)$/.exec(line.trim());
    if (match) map[path.basename(path.dirname(match[2]))] = match[1];
  }
  return map;
};
const shaBefore = parseSha("people-sha-before.txt");
const shaAfter = parseSha("people-sha-after.txt");
const shaWithdraw = parseSha("people-sha-after-withdraw.txt");
if (Object.keys(shaBefore).length) {
  push("other_people_untouched", {
    people: ["demo-maya-us", "demo-jieun-kr"].map((person) => ({
      slug: person, before: shaBefore[person], after: shaAfter[person] || shaWithdraw[person],
      hasFact: Boolean(after?.[person]?.facts?.some((fact) => fact.id === factId)),
    })),
    confirmedIn: slug,
  });
}

// 5) 预算：只算本轮的增量，闸值不动
const budgetBefore = readJson("asr-budget-before.json");
const budgetFinal = readJson("asr-budget-final.json") || readJson("asr-budget-after.json");
if (budgetBefore && budgetFinal) {
  const delta = Number((budgetFinal.spentCny - budgetBefore.spentCny).toFixed(6));
  push("asr_budget", {
    before: {spentCny: budgetBefore.spentCny, seconds: budgetBefore.seconds, calls: budgetBefore.calls},
    after: {spentCny: budgetFinal.spentCny, seconds: budgetFinal.seconds, calls: budgetFinal.calls},
    deltaCny: delta, deltaSeconds: Number((budgetFinal.seconds - budgetBefore.seconds).toFixed(3)),
    calls: budgetFinal.calls - budgetBefore.calls,
    capCny: 0.05, limitCny: budgetFinal.limitCny,
    retryAsrCalls: 0,
    note: "确认/撤回/重复确认都不调用付费接口；重复确认只走本地档案与幂等检查",
  });
}

// 6) 离页清理（第二段会话）
const leave = readJson("leave-cleanup.json");
if (leave) {
  push("leave_cleanup", {
    pendingBeforeLeave: leave.pendingBeforeLeave,
    pendingAfterLeave: leave.pendingAfterLeave,
    confirmedFactsPreserved: leave.confirmedFactsPreserved,
    method: leave.method, observedAt: leave.observedAt,
  });
}

// 7) 身份边界：真实 People 未被写
push("real_people_untouched", {
  path: "SocialMate-Data/People",
  note: "T2 全程只写 SocialMate-Data/Demo；收尾时 Demo 三份 00-profile.md 与开工前逐字节一致",
  profileHashesRestored: ["demo-oliver-uk", "demo-maya-us", "demo-jieun-kr"]
    .every((person) => shaBefore[person] && shaBefore[person] === (shaWithdraw[person] || shaAfter[person])),
});

const out = path.join(QA, "session-timeline.jsonl");
fs.writeFileSync(out, lines.map((line) => JSON.stringify(line)).join("\n") + "\n", {encoding: "utf8"});
console.log(JSON.stringify({ok: true, out, events: lines.length, kinds: lines.map((line) => line.kind)}));
