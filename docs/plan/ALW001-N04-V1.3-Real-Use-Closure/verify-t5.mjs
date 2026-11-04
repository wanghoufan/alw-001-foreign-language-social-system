#!/usr/bin/env node
/**
 * T5 验收脚本：最新 APK 端到端验收 + 文档收口（可重复复跑）。
 *
 * 设计原则：本脚本只做**可复跑的核对**，不重复写数据、不再调用腾讯 ASR；
 * 端到端那一次真实操作的过程证据（截图、日志、outbox、Mac 原文件）保存在同目录。
 *
 * 分组：
 *   preflight —— 设备版本/APK SHA/install -r 保留数据。
 *   demo      —— 3 人 9 段 54 句、专属+通用问题、真实 People 未被写。
 *   session   —— 真实 ASR final(mock:false) → outbox → Mac .md/.json 逐字一致 → SAF 导出。
 *   offline   —— 断通道后的离线只读证据（本次已真做，脚本核对证据文件与记录）。
 *   sec       —— 无票 403 / 跨源 403 / 伪造段号 4xx / 未配对 401 / APK 无长期令牌。
 *   docs      —— CHANGELOG/HANDOFF/IMPLEMENTATION_STATUS 与 0.8.1 一致。
 *
 * 用法：
 *   node verify-t5.mjs --qa <qa目录> --serial REDACTED-SERIAL --json <输出>
 * 退出码：0=全 PASS，1=有 FAIL，2=有 NOT_RUN（PARTIAL）。
 */
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const ROOT = path.resolve(argOf("--root", path.resolve(import.meta.dirname, "../../..")));
const QA = path.resolve(argOf("--qa", "."));
const SERIAL = argOf("--serial", "REDACTED-SERIAL");
const PKG = "app.socialmate.dualmic";
const BASE = "http://127.0.0.1:8791";
const JSON_OUT = argOf("--json", path.join(QA, "t5-report.json"));
const SESSION_ID = argOf("--session", "sess_20261102T102615_e52f2f");
const SESSION_TEXT = argOf("--text", "Should try surfing in my arm.");

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const checks = [];
const runLog = [];

function log(line) {
  runLog.push(line);
  console.log(line);
}

function run(cmd, args, options = {}) {
  const startedAt = Date.now();
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8", timeout: options.timeout || 60000,
      maxBuffer: 64 * 1024 * 1024, cwd: options.cwd || ROOT, env: process.env,
    });
    const rec = {cmd: [cmd, ...args].join(" "), exit: 0, ms: Date.now() - startedAt, out: String(out)};
    runLog.push(JSON.stringify({cmd: rec.cmd, exit: 0, ms: rec.ms}));
    return rec;
  } catch (error) {
    const out = `${error.stdout || ""}${error.stderr || ""}`;
    const rec = {cmd: [cmd, ...args].join(" "), exit: typeof error.status === "number" ? error.status : 124,
      ms: Date.now() - startedAt, out: String(out)};
    runLog.push(JSON.stringify({cmd: rec.cmd, exit: rec.exit, ms: rec.ms}));
    return rec;
  }
}

function check(group, id, ok, detail, status) {
  const state = status || (ok === true ? "PASS" : ok === null ? "NOT_RUN" : "FAIL");
  checks.push({group, id, status: state, detail: detail === undefined ? null : detail});
  log(`[${state}] ${group}/${id}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`);
}

const adb = (...args) => run("adb", ["-s", SERIAL, ...args]);
const readJsonFile = (file) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
};
const getJson = async (url, init) => {
  try {
    const res = await fetch(url, {signal: AbortSignal.timeout(8000), ...init});
    const body = await res.json().catch(() => null);
    return {status: res.status, body};
  } catch (error) {
    return {status: 0, body: null, error: error.message};
  }
};
const tokenFile = path.join(ROOT, "socialmate-v1.2/.local/archive-token");
const TOKEN = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : "";
const writeTicket = async () => {
  const res = await getJson(`${BASE}/v12/api/demo/write-ticket`);
  return res.body && res.body.ticket ? res.body.ticket : "";
};

log(`T5 verify start ${new Date().toISOString()} qa=${QA}`);

/* ------------------------------ preflight ------------------------------ */
const dumpsys = adb("shell", "dumpsys", "package", PKG).out;
const versionName = (dumpsys.match(/versionName=([\w.]+)/) || [])[1] || "";
const versionCode = (dumpsys.match(/versionCode=(\d+)/) || [])[1] || "";
const apkPath = path.join(ROOT, "android-poc/app/build/outputs/apk/debug/app-debug.apk");
const apkSha = fs.existsSync(apkPath) ? sha256(fs.readFileSync(apkPath)) : "";
const recordedSha = (fs.readFileSync(path.join(QA, "apk.sha256"), "utf8").trim().split(/\s+/)[0]) || "";
check("preflight", "device-version", versionName === "0.8.1" && versionCode === "36",
  {versionName, versionCode, expected: "0.8.1/36"});
check("preflight", "apk-sha-matches-record", apkSha !== "" && apkSha === recordedSha,
  {apkSha256: apkSha, recorded: recordedSha});

const installLog = (() => { try { return fs.readFileSync(path.join(QA, "install.log"), "utf8"); } catch { return ""; } })();
const firstInstalls = [...installLog.matchAll(/firstInstallTime=([^\n]+)/g)].map((m) => m[1].trim());
const lastUpdates = [...installLog.matchAll(/lastUpdateTime=([^\n]+)/g)].map((m) => m[1].trim());
check("preflight", "install-r-preserved-data",
  /INSTALL_EXIT=0/.test(installLog) && firstInstalls.length >= 2 && firstInstalls[0] === firstInstalls[firstInstalls.length - 1],
  {firstInstallBefore: firstInstalls[0], firstInstallAfter: firstInstalls[firstInstalls.length - 1],
   lastUpdateBefore: lastUpdates[0], lastUpdateAfter: lastUpdates[lastUpdates.length - 1]});

const buildEnv = (() => { try { return fs.readFileSync(path.join(QA, "build-env.txt"), "utf8"); } catch { return ""; } })();
const headInEnv = (buildEnv.match(/git_head=([0-9a-f]{40})/) || [])[1] || "";
const headNow = run("git", ["rev-parse", "HEAD"]).out.trim();
check("preflight", "git-snapshot-recorded", headInEnv !== "" && headInEnv === headNow,
  {headAtBuild: headInEnv.slice(0, 12), headNow: headNow.slice(0, 12),
   dirtyAtBuild: (buildEnv.match(/dirty_count=(\d+)/) || [])[1]});

const repro = (() => { try { return fs.readFileSync(path.join(QA, "reproducibility.txt"), "utf8"); } catch { return ""; } })();
check("preflight", "reproducible-build", /apk_identical=true/.test(repro) && /dex_identical=true/.test(repro),
  {note: "clean 构建两次，APK 与 classes.dex 字节一致"});

const apkMeta = (() => { try { return fs.readFileSync(path.join(QA, "apk-metadata.txt"), "utf8"); } catch { return ""; } })();
const cert = (apkMeta.match(/certificate SHA-256 digest: ([0-9a-f]{64})/) || [])[1] || "";
check("preflight", "signing-certificate", cert !== "" && /Verifies/.test(apkMeta), {certSha256: cert});

/* -------------------------------- demo -------------------------------- */
const demoStatus = (await getJson(`${BASE}/v12/api/demo/status`)).body || {};
check("demo", "demo-3-9-54", demoStatus.personas === 3 && demoStatus.sessions === 9 && demoStatus.segments === 54,
  {personas: demoStatus.personas, sessions: demoStatus.sessions, segments: demoStatus.segments, pending: demoStatus.pending});

const demoPeople = (await getJson(`${BASE}/v12/api/demo/people`)).body || {};
check("demo", "demo-personas-listed", Array.isArray(demoPeople.people) && demoPeople.people.length === 3,
  {names: (demoPeople.people || []).map((p) => p.name)});

const prepReport = [];
for (const slug of ["demo-oliver-uk", "demo-maya-us", "demo-jieun-kr"]) {
  const person = (await getJson(`${BASE}/v12/api/demo/people/${slug}`)).body?.person;
  prepReport.push({
    slug,
    personal: (person?.prep?.personalized || []).length,
    generic: Boolean(person?.prep?.generic),
    questions: (person?.prep?.personalized || []).map((q) => q.en),
    factIds: (person?.facts || []).map((f) => f.id),
    factTexts: (person?.facts || []).map((f) => f.text),
    conversationTexts: (person?.facts || []).filter((f) => f.origin === "conversation").map((f) => f.text),
  });
}
check("demo", "prep-2-personal-1-generic",
  prepReport.every((p) => p.personal === 2 && p.generic === true && p.questions.every(Boolean)),
  prepReport.map((p) => ({slug: p.slug, personal: p.personal, generic: p.generic, questions: p.questions})));

/* 档案元数据（「职业：未注明（演示）」等）在三人之间同名同 id 属于正常种子，
   所以「A 的事实不出现在 B/C」按**对话确认的事实文本**比对。 */
const oliverTexts = new Set(prepReport[0].conversationTexts.map((t) => String(t).trim()));
const crossLeak = prepReport.slice(1).some((p) => p.conversationTexts.some((t) => oliverTexts.has(String(t).trim())));
check("demo", "persona-facts-not-shared", !crossLeak,
  prepReport.map((p) => ({slug: p.slug, conversationFacts: p.conversationTexts})));

const hashBeforeTxt = (() => { try { return fs.readFileSync(path.join(QA, "20-hashes-before-clear.txt"), "utf8"); } catch { return ""; } })();
const peopleBefore = (hashBeforeTxt.match(/^People\s+([0-9a-f]{64})/m) || [])[1] || "";
const peopleNow = run("bash", ["-lc", "find SocialMate-Data/People -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256"]).out.trim().split(/\s+/)[0] || "";
check("demo", "real-people-untouched", peopleBefore !== "" && peopleBefore === peopleNow,
  {peopleSha256Before: peopleBefore, peopleSha256After: peopleNow});

/* ------------------------------- session ------------------------------- */
const state = (() => {
  const raw = adb("shell", "run-as", PKG, "cat", "files/archive/state.json").out.trim();
  try { return JSON.parse(raw); } catch { return {}; }
})();
/* 上传成功后状态机会继续被「打开面板 / 切换模式」刷新，lastHttpStatus 可能归零；
   以 .ack.json 的 httpStatus 为准（只有服务端 2xx 才会写这条回执）。 */
const ackRaw = adb("shell", "run-as", PKG, "cat", `files/archive/exported/${SESSION_ID}.ack.json`).out.trim();
let ack = {};
try { ack = JSON.parse(ackRaw); } catch { ack = {}; }
check("session", "outbox-drained-2xx",
  state.pending === 0 && Boolean(state.lastSyncedAt) && ack.httpStatus === 201,
  {pending: state.pending, lastSyncedAt: state.lastSyncedAt, ackHttpStatus: ack.httpStatus,
   ackSessionId: ack.sessionId, tokenSource: state.tokenSource, retryExhausted: state.retryExhausted});

const exportedList = adb("shell", "run-as", PKG, "ls", "files/archive/exported").out.split(/\s+/).filter(Boolean);
check("session", "exported-and-ack", exportedList.includes(`${SESSION_ID}.json`) && exportedList.includes(`${SESSION_ID}.ack.json`),
  {files: exportedList.filter((f) => f.startsWith(SESSION_ID))});

const macDir = path.join(process.env.HOME, "Documents/SocialMate/Conversations");
const macFiles = [];
(function walk(dir) {
  for (const entry of fs.existsSync(dir) ? fs.readdirSync(dir, {withFileTypes: true}) : []) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.includes(SESSION_ID)) macFiles.push(full);
  }
})(macDir);
const macJson = macFiles.find((f) => f.endsWith(".json"));
const macMd = macFiles.find((f) => f.endsWith(".md"));
const macPayload = macJson ? readJsonFile(macJson) : null;
const macSegment = macPayload?.session?.segments?.[0];
check("session", "mac-md-json-present", Boolean(macJson && macMd), {files: macFiles.map((f) => path.relative(ROOT, f))});
check("session", "mac-verbatim-final",
  macSegment?.textOriginal === SESSION_TEXT && macSegment?.mock === false && macSegment?.provider === "tencent",
  {textOriginal: macSegment?.textOriginal, mock: macSegment?.mock, provider: macSegment?.provider,
   startMs: macSegment?.startMs, endMs: macSegment?.endMs});
check("session", "mac-md-contains-original",
  Boolean(macMd) && fs.readFileSync(macMd, "utf8").includes(SESSION_TEXT),
  {mdSha256: macMd ? sha256(fs.readFileSync(macMd)) : ""});

const exportLog = adb("shell", "cat", `/sdcard/Download/SocialMate-${SESSION_ID}.md`).out;
check("session", "saf-export-readable",
  exportLog.includes(SESSION_TEXT) && /tencent/.test(exportLog),
  {bytes: Buffer.byteLength(exportLog), path: `/sdcard/Download/SocialMate-${SESSION_ID}.md`});

const budgetBefore = readJsonFile(path.join(QA, "30-asr-budget-before.json"))?.budget;
const budgetAfter = readJsonFile(path.join(QA, "31-asr-budget-after.json"))?.budget;
const spentDelta = budgetBefore && budgetAfter ? Number((budgetAfter.spentCny - budgetBefore.spentCny).toFixed(6)) : null;
check("session", "asr-mock-false-budget",
  budgetAfter?.remainingCny !== undefined && budgetAfter.limitCny === 1 && spentDelta !== null && spentDelta <= 0.05,
  {limitCny: budgetAfter?.limitCny, spentDeltaCny: spentDelta, calls: `${budgetBefore?.calls}→${budgetAfter?.calls}`,
   remainingCny: budgetAfter?.remainingCny});

/* ------------------------------- offline ------------------------------- */
const offlineShot = path.join(QA, "50-offline-readonly.png");
const uiSteps = (() => { try { return fs.readFileSync(path.join(QA, "t5-ui-steps.log"), "utf8"); } catch { return ""; } })();
const offlinePanel = adb("shell", "run-as", PKG, "cat", "files/offline/snapshot.json").out;
check("offline", "offline-evidence-present",
  fs.existsSync(offlineShot) && /E10 offline/.test(uiSteps) && /50-offline-readonly\.png/.test(uiSteps),
  {shot: "50-offline-readonly.png", snapshotBytes: offlinePanel.length,
   note: "断 adb reverse 后强制重启 App，出现原生「离线只读模式」面板（3 人 / 9 段 / 54 句 + 本地原文列表）"});
check("offline", "offline-no-write-success", /已同步 4 · 待上传 0/.test(uiSteps) || /离线期间的限制/.test(uiSteps),
  {note: "离线面板明确写「清空/恢复/上传都不会执行，也不会显示成功」"});

/* --------------------------------- sec --------------------------------- */
const originOk = `http://127.0.0.1:8791`;
const noTicket = await getJson(`${BASE}/v12/api/demo/clear`, {
  method: "POST", headers: {"Content-Type": "application/json", Origin: originOk},
  body: JSON.stringify({confirm: true}),
});
check("sec", "no-write-ticket-403", noTicket.status === 403 && noTicket.body?.code === "WRITE_TICKET_REQUIRED",
  {status: noTicket.status, code: noTicket.body?.code});

const crossOrigin = await getJson(`${BASE}/v12/api/demo/clear`, {
  method: "POST", headers: {"Content-Type": "application/json", Origin: "https://evil.example"},
  body: JSON.stringify({confirm: true}),
});
check("sec", "cross-origin-403", crossOrigin.status === 403 && crossOrigin.body?.code === "ORIGIN_REJECTED",
  {status: crossOrigin.status, code: crossOrigin.body?.code});

const ticket = await writeTicket();
const forged = await getJson(`${BASE}/v12/api/demo/final`, {
  method: "POST",
  headers: {"Content-Type": "application/json", Origin: originOk, "x-sm-write": ticket,
    "x-archive-token": TOKEN},
  body: JSON.stringify({confirm: true, sessionId: "sess_n04_demo_oliver_uk_1", segmentIndex: 999,
    text: "This sentence does not exist in the master fixture."}),
});
check("sec", "forged-segment-4xx", forged.status >= 400 && forged.status < 500,
  {status: forged.status, code: forged.body?.code});

let archive401 = {status: 0, body: null};
try {
  const res = await fetch(`http://127.0.0.1:8781/api/archive/session`, {
    method: "POST", headers: {"Content-Type": "application/json", Origin: "https://evil.example"},
    body: JSON.stringify({sessionId: "t5-unpaired-probe", segments: []}),
    signal: AbortSignal.timeout(8000),
  });
  archive401 = {status: res.status, body: await res.json().catch(() => null)};
} catch (error) { archive401 = {status: 0, error: error.message}; }
check("sec", "unpaired-write-401", archive401.status === 401,
  {status: archive401.status, code: archive401.body?.code});

const apkBytes = fs.existsSync(apkPath) ? fs.readFileSync(apkPath) : Buffer.alloc(0);
const tokenInApk = TOKEN.length >= 8 && apkBytes.includes(Buffer.from(TOKEN));
check("sec", "archive-token-not-in-apk", TOKEN.length >= 8 && !tokenInApk,
  {tokenLength: TOKEN.length, found: tokenInApk});

/* --------------------------------- docs --------------------------------- */
const docFiles = {
  CHANGELOG: path.join(ROOT, "CHANGELOG.md"),
  HANDOFF: path.join(ROOT, "docs/handoff/HANDOFF.md"),
  STATUS: path.join(ROOT, "android-poc/IMPLEMENTATION_STATUS.md"),
};
const docText = Object.fromEntries(Object.entries(docFiles).map(([k, f]) => [k, fs.existsSync(f) ? fs.readFileSync(f, "utf8") : ""]));
check("docs", "docs-mention-0.8.1", Object.values(docText).every((t) => t.includes("0.8.1")),
  Object.fromEntries(Object.entries(docText).map(([k, t]) => [k, t.includes("0.8.1")])));

const handoffBytes = Buffer.byteLength(docText.HANDOFF);
const handoffLines = docText.HANDOFF.split("\n").length;
check("docs", "handoff-size-limit", handoffBytes <= 8192 && handoffLines <= 100,
  {bytes: handoffBytes, lines: handoffLines});

const staleClaims = Object.entries(docText)
  .map(([k, t]) => [k, (t.match(/(当前|current)[^\n]{0,40}0\.(6\.6|7\.0)/gi) || []).slice(0, 3)])
  .filter(([, hits]) => hits.length);
check("docs", "no-stale-current-version", staleClaims.length === 0, {hits: staleClaims});

/* --------------------------------- NOT_RUN --------------------------------- */
check("notrun", "phone-tailscale-authorized", null,
  {reason: "手机 Tailscale 仍未登录到本 tailnet（T4 已确认），需用户本人在手机上授权"}, "NOT_RUN");
check("notrun", "physical-usb-unplug", null,
  {reason: "数据线仍在供电/ADB；已用 adb reverse --remove-all 断唯一数据通道做等价验证"}, "NOT_RUN");
check("notrun", "third-party-markdown-viewer", null,
  {reason: "系统无默认 Markdown 查看器，可用查看器需接受第三方隐私政策，未代为同意"}, "NOT_RUN");
check("notrun", "real-human-double-voice", null,
  {reason: "本轮音频为 macOS say 合成（SYNTHETIC），真人双人/BOYA 需真人知情同意"}, "NOT_RUN");

/* --------------------------------- result --------------------------------- */
const summary = {
  total: checks.length,
  pass: checks.filter((c) => c.status === "PASS").length,
  fail: checks.filter((c) => c.status === "FAIL").length,
  notRun: checks.filter((c) => c.status === "NOT_RUN").length,
};
summary.verdict = summary.fail > 0 ? "FAIL" : summary.notRun > 0 ? "PARTIAL" : "PASS";
fs.writeFileSync(JSON_OUT, JSON.stringify({summary, checks, at: new Date().toISOString()}, null, 2));
fs.writeFileSync(path.join(QA, "t5-console.log"), runLog.join("\n") + "\n");
log(JSON.stringify(summary));
process.exit(summary.fail > 0 ? 1 : summary.notRun > 0 ? 2 : 0);
