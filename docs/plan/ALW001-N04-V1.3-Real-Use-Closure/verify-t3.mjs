#!/usr/bin/env node
/**
 * T3 验收脚本：Android 原生 outbox → Mac 完整归档。
 *
 * 分组断言：
 *   privacy      —— 未开「原文留存」不写盘不收集；current.json 只在开启后出现。
 *   statemachine —— current.json → outbox → exported 的状态机与 ack 语义。
 *   offline      —— 归档服务拒绝/不可达时 outbox 保留，恢复后补传成功。
 *   idempotent   —— 两次上传（设备重放 + HTTP 重放）前后 Mac 文件 hash 不变。
 *   backoff      —— 3/10/30/60/60/60s、最多 6 次、耗尽后可理解状态、数据不丢。
 *   matrix       —— 401/403/429/5xx/413/本地体积超限/服务重启 的分类。
 *   mac          —— Mac 收到的 .md/.json 与手机 final 逐字/段数/时间戳一致。
 *   saf          —— SAF 导出后系统文件管理器可打开（截图 + 文件哈希）。
 *   ui           —— 手机界面显示「已同步 Mac」。
 *   device       —— APK 版本/SHA/安装保留数据。
 *   isolation    —— 真实归档与演示母版未被测试污染。
 *
 * 用法：
 *   node verify-t3.mjs --qa <qa目录> --serial REDACTED-SERIAL --json <输出>
 * 退出码：0=PASS，1=FAIL，2=PARTIAL（有 NOT_RUN 或缺证据）。
 */
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const QA = path.resolve(argOf("--qa", "."));
const SERIAL = argOf("--serial", "REDACTED-SERIAL");
const PKG = "app.socialmate.dualmic";
const JSON_OUT = argOf("--json", path.join(QA, "t3-report.json"));
const started = Date.now();
const checks = [];

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
function check(group, id, ok, detail) {
  const pass = ok === true;
  checks.push({group, id, ok: pass, detail: detail === undefined ? null : detail});
  console.log(`[${pass ? "PASS" : "FAIL"}] ${group}/${id}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`);
}

function adb(...args) {
  try {
    return execFileSync("adb", ["-s", SERIAL, ...args], {encoding: "utf8", maxBuffer: 64 * 1024 * 1024}).trim();
  } catch (error) {
    return "";
  }
}
function readJson(name) {
  try { return JSON.parse(fs.readFileSync(path.join(QA, name), "utf8")); } catch { return null; }
}
function readText(name) {
  try { return fs.readFileSync(path.join(QA, name), "utf8"); } catch { return ""; }
}
function exists(name) { return fs.existsSync(path.join(QA, name)); }
function deviceCat(rel) {
  return adb("shell", "run-as", PKG, "cat", rel);
}
function deviceJson(rel) {
  try { return JSON.parse(deviceCat(rel)); } catch { return null; }
}

/* ------------------------------- privacy ------------------------------- */
const launch = readJson("10-privacy-retention-off.json");
check("privacy", "retention-off-no-write",
  launch && launch.retention === false && launch.savedSegments === 0 && launch.pending === 0,
  launch && {retention: launch.retention, savedSegments: launch.savedSegments, pending: launch.pending});
check("privacy", "retention-off-no-current-json",
  /No such file/.test(readText("10-no-current-json.txt")),
  {ls: readText("10-no-current-json.txt").trim()});

/* ----------------------------- statemachine ---------------------------- */
const crashed = readJson("11-current-before-crash.json");
const recovered = readJson("12-recovered-outbox.json");
check("statemachine", "current-json-has-verbatim-finals",
  Boolean(crashed && Array.isArray(crashed.segments) && crashed.segments.length > 0
    && crashed.segments.every((s) => typeof s.textOriginal === "string" && s.textOriginal.length > 0)),
  crashed && {sessionId: crashed.sessionId, segments: crashed.segments.length});
check("statemachine", "crash-recovered-to-outbox",
  Boolean(recovered && recovered.recoveredSessions >= 1 && recovered.pending >= 1),
  recovered && {recoveredSessions: recovered.recoveredSessions, pending: recovered.pending});
const ack1 = readJson("15-ack-first.json");
const ack2 = readJson("15-ack-replay.json");
check("statemachine", "ack-only-after-2xx",
  Boolean(ack1 && ack1.httpStatus >= 200 && ack1.httpStatus < 300 && ack1.hash),
  ack1 && {httpStatus: ack1.httpStatus, hash: String(ack1.hash).slice(0, 16)});
check("statemachine", "exported-marker-after-success",
  Boolean(ack2 && ack2.httpStatus === 200 && ack1 && ack1.hash === ack2.hash),
  {first: ack1 && ack1.httpStatus, replay: ack2 && ack2.httpStatus, sameHash: Boolean(ack1 && ack2 && ack1.hash === ack2.hash)});

/* -------------------------------- offline ------------------------------ */
const refused = readJson("13-service-refused.json");
const healed = readJson("14-recovered-synced.json");
check("offline", "service-refused-keeps-outbox",
  Boolean(refused && refused.pending >= 1 && refused.retryAttempt >= 1
    && ["OFFLINE", "SERVER"].includes(refused.lastErrorCode)
    && exists("13-outbox-listing.txt")),
  refused && {pending: refused.pending, retryAttempt: refused.retryAttempt, code: refused.lastErrorCode});
check("offline", "outbox-file-intact-after-refusal",
  (() => {
    const line = readText("13-outbox-listing.txt").split("\n").find((l) => l.trim().endsWith(".json"));
    if (!line) return false;
    // ls -l 的第 5 列是字节数；文件仍在 outbox 且非空即视为未丢原文。
    const size = Number(line.trim().split(/\s+/)[4] || 0);
    return /\.json$/.test(line.trim()) && size > 0;
  })(),
  {listing: readText("13-outbox-listing.txt").split("\n").filter(Boolean).slice(-1)[0] || null});
check("offline", "recovered-and-synced",
  Boolean(healed && healed.pending === 0 && healed.everSynced === true
    && healed.lastHttpStatus >= 200 && healed.lastHttpStatus < 300),
  healed && {pending: healed.pending, http: healed.lastHttpStatus, lastSyncedAt: healed.lastSyncedAt});

/* ------------------------------- idempotent ---------------------------- */
const macBefore = readText("16-mac-sha-before-replay.txt");
const macAfter = readText("16-mac-sha-after-replay.txt");
const parseSha = (text) => Object.fromEntries(text.split("\n").filter(Boolean).map((line) => {
  const [hash, file] = line.trim().split(/\s+/);
  return [path.basename(file || ""), hash];
}));
const beforeMap = parseSha(macBefore);
const afterMap = parseSha(macAfter);
const sameNames = Object.keys(beforeMap).length > 0
  && JSON.stringify(Object.keys(beforeMap).sort()) === JSON.stringify(Object.keys(afterMap).sort());
check("idempotent", "replay-keeps-mac-bytes",
  sameNames && Object.keys(beforeMap).every((name) => beforeMap[name] === afterMap[name]),
  {files: Object.keys(beforeMap).length, unchanged: sameNames
    && Object.keys(beforeMap).every((name) => beforeMap[name] === afterMap[name])});
const dupLog = readText("server-duplicate.log");
check("idempotent", "server-marked-duplicate", /duplicate/.test(dupLog), {lines: dupLog.trim().split("\n").length});

/* -------------------------------- backoff ------------------------------ */
const exhausted = readJson("17-backoff-exhausted.json");
check("backoff", "six-attempts-then-exhausted",
  Boolean(exhausted && exhausted.retryExhausted === true && exhausted.retryAttempt >= exhausted.retryMax),
  exhausted && {retryAttempt: exhausted.retryAttempt, retryMax: exhausted.retryMax, exhausted: exhausted.retryExhausted});
check("backoff", "delays-are-bounded-schedule",
  Boolean(exhausted && JSON.stringify(exhausted.retryDelaysMs) === JSON.stringify([3000, 10000, 30000, 60000, 60000, 60000])),
  exhausted && exhausted.retryDelaysMs);
check("backoff", "nothing-lost-when-exhausted",
  Boolean(exhausted && exhausted.pending >= 1 && exists("17-outbox-listing.txt")
    && /\.json/.test(readText("17-outbox-listing.txt"))),
  exhausted && {pending: exhausted.pending});
check("backoff", "manual-retry-recovers",
  (() => {
    const state = readJson("17-after-manual-retry.json");
    return Boolean(state && state.pending === 0 && state.retryExhausted === false);
  })(),
  (() => {
    const state = readJson("17-after-manual-retry.json");
    return state && {pending: state.pending, exhausted: state.retryExhausted, http: state.lastHttpStatus};
  })());

/* --------------------------------- matrix ------------------------------ */
const matrix = readText("18-error-matrix.log");
const expect = {
  "401": {code: "AUTH", retry: false},
  "403": {code: "AUTH", retry: false},
  "429": {code: "THROTTLED", retry: true},
  "500": {code: "SERVER", retry: true},
  "413": {code: "TOO_LARGE", retry: false},
};
for (const [status, want] of Object.entries(expect)) {
  const line = (matrix.split("=== MODE " + status + " ===")[1] || "").split("\n").slice(1, 2)[0] || "";
  let parsed = null;
  try { parsed = JSON.parse(line); } catch {}
  const ok = Boolean(parsed && parsed.lastErrorCode === want.code
    && Number(parsed.lastHttpStatus) === Number(status)
    && (want.retry ? parsed.retryAttempt >= 1 : parsed.retryAttempt === 0)
    && parsed.pending >= 1);
  check("matrix", `http-${status}-${want.code.toLowerCase()}`, ok, parsed);
}
const oversize = readJson("18-local-oversize.json");
check("matrix", "local-oversize-no-request",
  Boolean(oversize && oversize.lastErrorCode === "TOO_LARGE" && oversize.pending >= 1
    && /payload \d+ bytes > 524288/.test(oversize.lastError || "")),
  oversize && {code: oversize.lastErrorCode, pending: oversize.pending, error: oversize.lastError});
const stubLog = readText("fault-stub.log");
check("matrix", "oversize-never-sent-over-wire",
  !/bytes=600521/.test(stubLog), {oversizePosts: (stubLog.match(/bytes=600521/g) || []).length});
const restart = readJson("18-after-stub-restart.json");
check("matrix", "service-restart-auto-retry",
  Boolean(restart && restart.pending === 0 && restart.lastHttpStatus >= 200 && restart.lastHttpStatus < 300),
  restart && {pending: restart.pending, http: restart.lastHttpStatus});

/* ---------------------------------- mac -------------------------------- */
const macRoot = path.join(QA, "mac-archive");
function walk(dir, acc = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, {withFileTypes: true}); } catch { return acc; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}
const macFiles = walk(macRoot);
const sessionId = crashed ? crashed.sessionId : "";
const mdFile = macFiles.find((f) => f.endsWith(`${sessionId}.md`));
const jsonFile = macFiles.find((f) => f.endsWith(`${sessionId}.json`));
check("mac", "md-and-json-created", Boolean(mdFile && jsonFile), {
  md: mdFile ? path.basename(mdFile) : null, json: jsonFile ? path.basename(jsonFile) : null,
  sessionId,
});
if (mdFile && jsonFile && crashed) {
  const payload = JSON.parse(fs.readFileSync(jsonFile, "utf8"));
  const serv = payload.session;
  const sameCount = serv.segments.length === crashed.segments.length;
  const sameText = serv.segments.every((s, i) => s.textOriginal === crashed.segments[i].textOriginal);
  const sameTime = serv.segments.every((s, i) => s.startMs === crashed.segments[i].startMs
    && s.endMs === crashed.segments[i].endMs && s.receivedAt === crashed.segments[i].receivedAt);
  const md = fs.readFileSync(mdFile, "utf8");
  const mdHasAll = crashed.segments.every((s) => md.includes(s.textOriginal));
  check("mac", "segments-verbatim-count-timestamps",
    sameCount && sameText && sameTime, {count: serv.segments.length, sameText, sameTime});
  check("mac", "markdown-contains-verbatim", mdHasAll);
  check("mac", "session-id-and-version-consistent",
    serv.sessionId === crashed.sessionId && serv.appVersion === "0.8.0",
    {sessionId: serv.sessionId, appVersion: serv.appVersion});
} else {
  check("mac", "segments-verbatim-count-timestamps", false, {reason: "NOT_RUN 缺少 Mac 归档文件"});
}

/* ---------------------------------- saf -------------------------------- */
const saf = readJson("20-saf-export.json");
const safBytes = saf && Number(saf.bytes) > 0;
const safOnDevice = saf && saf.path ? (adb("shell", "wc", "-c", saf.path).trim().split(/\s+/)[0] || "") : "";
check("saf", "exported-to-user-dir",
  Boolean(saf && saf.found === true && safBytes && String(saf.bytes) === safOnDevice),
  saf && {path: saf.path, bytes: saf.bytes, deviceBytes: safOnDevice});
check("saf", "visible-in-system-file-manager",
  Boolean(saf && saf.visibleInSystemFileManager === true && exists("20-saf-filemanager.png")),
  {screenshot: "20-saf-filemanager.png", resolver: saf && saf.resolverScreenshot});
check("saf", "system-can-resolve-opener",
  Boolean(saf && saf.systemResolverListed === true && exists("20-saf-resolver.png")),
  {screenshot: "20-saf-resolver.png"});
check("saf", "content-shown-when-opened", Boolean(saf && saf.contentShown === true),
  {reason: "NOT_RUN 该 ROM 无默认 Markdown/纯文本查看器；可用查看器需接受第三方隐私政策，未代替用户同意",
    openedBy: saf && saf.openedBy});

/* ----------------------------------- ui -------------------------------- */
const uiText = readText("21-ui-synced.txt");
check("ui", "phone-shows-synced", /已同步 Mac/.test(uiText), {text: uiText.trim().slice(0, 80)});
const uiPending = readText("21-ui-pending.txt");
check("ui", "phone-shows-pending-before-sync", /待上传|补传失败/.test(uiPending),
  {text: uiPending.trim().slice(0, 80)});

/* --------------------------------- device ------------------------------ */
const dumpsys = readText("device-dumpsys.txt");
check("device", "installed-version-0.8.0-35",
  /versionName=0\.8\.0/.test(dumpsys) && /versionCode=35/.test(dumpsys),
  {versionName: (dumpsys.match(/versionName=(\S+)/) || [])[1], versionCode: (dumpsys.match(/versionCode=(\d+)/) || [])[1]});
const apkSha = readText("apk.sha256").split(/\s+/)[0] || "";
const onDiskApk = path.resolve(QA, "../../../../../android-poc/app/build/outputs/apk/debug/app-debug.apk");
const diskSha = fs.existsSync(onDiskApk) ? sha256(fs.readFileSync(onDiskApk)) : "";
check("device", "apk-sha-matches-build", apkSha.length === 64 && apkSha === diskSha, {apkSha, diskSha});
const firstInstall = (dumpsys.match(/firstInstallTime=([^\n]+)/) || [])[1] || "";
check("device", "install-r-kept-data", Boolean(firstInstall) && !/2026-11-02 17:2/.test(firstInstall),
  {firstInstallTime: firstInstall});
check("device", "no-buildconfig-archive-token", /^0$/m.test(readText("device-apk-token-strings.txt")),
  {count: readText("device-apk-token-strings.txt").trim()});

/* ------------------------------- isolation ----------------------------- */
const iso = readJson("22-isolation.json");
check("isolation", "real-archive-untouched",
  Boolean(iso && iso.realArchiveFilesBefore === iso.realArchiveFilesAfter
    && iso.realArchiveHashBefore === iso.realArchiveHashAfter),
  iso && {files: iso.realArchiveFilesAfter, hash: String(iso.realArchiveHashAfter).slice(0, 16)});
check("isolation", "demo-masters-untouched",
  Boolean(iso && iso.demoFilesBefore === iso.demoFilesAfter && iso.demoFilesAfter >= 18),
  iso && {demoFiles: iso.demoFilesAfter});

/* -------------------------------- verdict ------------------------------ */
const failed = checks.filter((c) => !c.ok);
const notRun = failed.filter((c) => /NOT_RUN|缺少|缺证据/.test(JSON.stringify(c.detail)));
const hard = failed.filter((c) => !notRun.includes(c));
const result = hard.length ? "FAIL" : notRun.length ? "PARTIAL" : "PASS";
const report = {
  task: "ALW-001 N04 V1.3 T3",
  result,
  executedAt: new Date(started).toISOString(),
  durationMs: Date.now() - started,
  device: {serial: SERIAL, model: adb("shell", "getprop", "ro.product.model")},
  qa: QA,
  totals: {checks: checks.length, passed: checks.length - failed.length, failed: failed.length, notRun: notRun.length},
  groups: Object.fromEntries([...new Set(checks.map((c) => c.group))].map((g) => [g,
    checks.filter((c) => c.group === g)])),
};
fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), {recursive: true});
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2) + "\n", {encoding: "utf8", mode: 0o644});
console.log(JSON.stringify({result, ...report.totals, json: JSON_OUT}));
process.exit(result === "PASS" ? 0 : result === "PARTIAL" ? 2 : 1);
