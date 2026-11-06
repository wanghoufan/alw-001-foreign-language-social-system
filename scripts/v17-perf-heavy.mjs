#!/usr/bin/env node
/**
 * ALW-001 V1.7 重负载真机 WebView 性能测量（录音 + 豆包朗读同时进行）。
 *
 * 只读页面状态：不写 localStorage、不改产品数据、不点击「开始录音」；仅点击导航 Tab。
 *
 * 用法：
 *   SM_SERIAL=<序列号> node scripts/v17-perf-heavy.mjs
 *   node scripts/v17-perf-heavy.mjs --serial <序列号> --samples 5
 *   node scripts/v17-perf-heavy.mjs --help
 *   node scripts/v17-perf-heavy.mjs --dry-run
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = "app.socialmate.dualmic";
const DEFAULT_PORT = 9934;
const DEFAULT_SAMPLES = 5;
const THRESHOLD_COLD_MS = 2000;
const THRESHOLD_TAB_MS = 300;
const TABS = ["software", "hainan", "chat", "self", "people"];
const TAB_LABELS = {software: "软件", hainan: "海南", chat: "聊天", self: "关于我", people: "人物"};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "docs", "plan", "ALW001-N05-V1.7-R2", "PERF-HEAVY-REPORT.md");

function parseArgs(argv) {
    const out = {
        serial: process.env.SM_SERIAL || "",
        port: DEFAULT_PORT,
        package: PACKAGE,
        activity: ".MainActivity",
        samples: DEFAULT_SAMPLES,
        coldSamples: null,
        tabSamples: null,
        coldPrecondition: "each",
        requireTts: false,
        out: DEFAULT_OUT,
        cdpTimeoutMs: 20000,
        tabGapMs: 60,
        skipCold: false,
        skipTab: false,
        dryRun: false,
        json: false,
        noWrite: false,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        const next = () => argv[i + 1];
        if (item === "--help" || item === "-h") out.help = true;
        else if (item === "--dry-run") out.dryRun = true;
        else if (item === "--serial") { out.serial = next() || ""; i += 1; }
        else if (item === "--port") { out.port = Number(next()) || DEFAULT_PORT; i += 1; }
        else if (item === "--package") { out.package = next() || PACKAGE; i += 1; }
        else if (item === "--activity") { out.activity = next() || ".MainActivity"; i += 1; }
        else if (item === "--samples") { out.samples = Math.max(1, Number(next()) || DEFAULT_SAMPLES); i += 1; }
        else if (item === "--cold-samples") { out.coldSamples = Math.max(1, Number(next()) || DEFAULT_SAMPLES); i += 1; }
        else if (item === "--tab-samples") { out.tabSamples = Math.max(1, Number(next()) || DEFAULT_SAMPLES); i += 1; }
        else if (item === "--cold-precondition") {
            const value = next() || "each";
            if (value !== "each" && value !== "first") throw new Error(`--cold-precondition 只接受 each 或 first（收到 ${value}）`);
            out.coldPrecondition = value;
            i += 1;
        }
        else if (item === "--require-tts") out.requireTts = true;
        else if (item === "--out") { out.out = path.resolve(next() || DEFAULT_OUT); i += 1; }
        else if (item === "--cdp-timeout-ms") { out.cdpTimeoutMs = Math.max(2000, Number(next()) || 20000); i += 1; }
        else if (item === "--tab-gap-ms") { out.tabGapMs = Math.max(0, Number(next()) || 0); i += 1; }
        else if (item === "--skip-cold") out.skipCold = true;
        else if (item === "--skip-tab") out.skipTab = true;
        else if (item === "--json") out.json = true;
        else if (item === "--no-write") out.noWrite = true;
        else if (item.startsWith("-")) throw new Error(`未知参数：${item}`);
    }
    out.coldSamples = out.coldSamples ?? out.samples;
    out.tabSamples = out.tabSamples ?? out.samples;
    return out;
}

function helpText() {
    return [
        "ALW-001 V1.7 重负载真机 WebView 性能测量（录音 + 豆包朗读，只读）",
        "",
        "用法：",
        "  SM_SERIAL=<序列号> node scripts/v17-perf-heavy.mjs [选项]",
        "",
        "选项：",
        "  --serial <序列号>        指定测试设备；未给时读 SM_SERIAL，再没有则 NOT_RUN",
        "  --port <端口>            CDP 本地映射端口，默认 9934（避开 sm-cdp 的 9223 与 v17-perf 的 9933）",
        "  --package <包名>         被测应用包名，默认 app.socialmate.dualmic",
        "  --activity <活动>        冷启动入口，默认 .MainActivity",
        "  --samples <n>            冷启动与每个 Tab 的样本数，默认 5",
        "  --cold-samples <n>       单独覆盖冷启动样本数",
        "  --tab-samples <n>        单独覆盖每个 Tab 的样本数",
        "  --cold-precondition <m>  冷启动前置口径：each=每次 force-stop 前都要求录音中（默认，严格）；",
        "                           first=只在首轮检查录音中，后续样本记录启动后恢复情况",
        "  --require-tts            要求前置检测到豆包朗读正在播放，否则 NOT_RUN",
        "  --tab-gap-ms <n>         每次 Tab 切换后的间隔，默认 60",
        "  --cdp-timeout-ms <n>     单次等待页面上限，默认 20000",
        "  --out <路径>             报告输出，默认 docs/plan/ALW001-N05-V1.7-R2/PERF-HEAVY-REPORT.md",
        "  --skip-cold              不测冷启动",
        "  --skip-tab               不测 Tab 切换",
        "  --json                   结果 JSON 输出到 stdout（进度改走 stderr）",
        "  --no-write               不写报告文件",
        "  --dry-run                只检查环境与采样计划，不访问设备、不写文件",
        "  --help                   显示本帮助",
        "",
        "前置要求（脚本不代做）：",
        "  1. 手机已解锁、亮屏，SocialMate 在「聊天」页处于「正在听 / 录音中」状态；",
        "  2. 如测「录音 + 豆包朗读」，请先手动触发朗读，让朗读与录音同时进行；",
        "  3. 脚本只读页面状态，不会点击「开始录音」，也不会写 localStorage。",
        "",
        "测量口径：",
        "  冷启动：force-stop 后 am start -W，cold = TotalTime + 页面 load（保守上界）；",
        "          force-stop 会中断录音与朗读，启动后是否恢复如实记录，不伪造连续录音。",
        "  Tab：录音中依次点击 软件/海南/聊天/关于我/人物，到两次 requestAnimationFrame 完成且主内容可见。",
        "  门槛：冷启动 P95 ≤ 2000ms；Tab 各分组 P95 ≤ 300ms（近邻秩法，5 样本时 P95=max）。",
        "",
        "退出码：PASS=0，FAIL=1，NOT_RUN=2。",
    ].join("\n");
}

function logFactory(jsonMode) {
    return (...args) => {
        if (jsonMode) console.error(...args);
        else console.log(...args);
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCmd(cmd, args, {timeout = 30000, allowFail = false} = {}) {
    const res = spawnSync(cmd, args, {encoding: "utf8", timeout, maxBuffer: 4 * 1024 * 1024});
    if (res.error) {
        if (allowFail) return {ok: false, code: -1, stdout: "", stderr: String(res.error.message || res.error)};
        throw new Error(`${cmd} 执行失败：${res.error.message}`);
    }
    const result = {ok: res.status === 0, code: res.status, stdout: res.stdout || "", stderr: res.stderr || ""};
    if (!result.ok && !allowFail) {
        throw new Error(`${cmd} 退出码 ${res.status}：${(result.stderr || result.stdout).trim().slice(0, 300)}`);
    }
    return result;
}

function adb(serial, args, options = {}) {
    return runCmd("adb", ["-s", serial, ...args], options);
}

function cleanupForward(serial, port) {
    adb(serial, ["forward", "--remove", `tcp:${port}`], {allowFail: true, timeout: 10000});
}

function findOnPath(name) {
    const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
    for (const dir of dirs) {
        const candidate = path.join(dir, name);
        try {
            if (fs.existsSync(candidate)) return candidate;
        } catch {
            /* ignore */
        }
    }
    return "";
}

function numberFrom(pattern, text) {
    const m = pattern.exec(text || "");
    return m ? Number(m[1]) : null;
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const rank = Math.ceil((p / 100) * sorted.length);
    const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
    return sorted[index];
}

function summarize(values) {
    const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
    if (!nums.length) return null;
    const sorted = [...nums].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return {
        n: sorted.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        mean: Math.round((sum / sorted.length) * 10) / 10,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
    };
}

function fmt(value, unit = "ms") {
    return value === null || value === undefined ? "—" : `${Math.round(value)}${unit}`;
}

function isLocalPageUrl(url) {
    return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url || "");
}

function verdictOf(stats, expected, threshold) {
    if (!stats || stats.n < expected) return "NOT_RUN";
    return stats.p95 <= threshold ? "PASS" : "FAIL";
}

function overallVerdict(parts) {
    if (parts.some((p) => p === "FAIL")) return "FAIL";
    if (parts.some((p) => p === "NOT_RUN")) return "NOT_RUN";
    return "PASS";
}

async function fetchJson(url, timeoutMs) {
    const res = await fetch(url, {signal: AbortSignal.timeout(timeoutMs)});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

async function connectPage(serial, port, pkg, deadline) {
    let lastError = "尚未尝试";
    let forwardedPid = "";
    while (Date.now() < deadline) {
        const pidOut = adb(serial, ["shell", "pidof", pkg], {allowFail: true, timeout: 10000}).stdout.trim();
        const pid = pidOut.split(/\s+/).filter(Boolean)[0];
        if (!pid) {
            lastError = "应用进程未启动";
            await sleep(250);
            continue;
        }
        try {
            if (forwardedPid !== pid) {
                cleanupForward(serial, port);
                const forwarded = adb(serial, ["forward", `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`], {
                    timeout: 10000,
                    allowFail: true,
                });
                if (!forwarded.ok) {
                    lastError = `adb forward 失败：${(forwarded.stderr || forwarded.stdout).trim().slice(0, 120)}`;
                    await sleep(250);
                    continue;
                }
                forwardedPid = pid;
            }
            const list = await fetchJson(`http://127.0.0.1:${port}/json/list`, 1500);
            const pages = Array.isArray(list) ? list.filter((item) => item.type === "page") : [];
            const preferred = pages.find((item) => /127\.0\.0\.1|localhost|\/v12/.test(item.url || ""));
            const page = preferred || pages[0];
            if (page && page.webSocketDebuggerUrl) {
                return {pid, page};
            }
            lastError = "没有可调试页面";
        } catch (err) {
            lastError = err.message || String(err);
        }
        await sleep(250);
    }
    throw new Error(`CDP 不可用：${lastError}`);
}

async function cdpEvaluate(wsUrl, expression, timeoutMs = 20000) {
    const socket = new WebSocket(wsUrl);
    try {
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`CDP 超时（${timeoutMs}ms）`)), timeoutMs);
            const finish = (err, value) => {
                clearTimeout(timer);
                if (err) reject(err);
                else resolve(value);
            };
            socket.addEventListener("open", () => {
                socket.send(JSON.stringify({
                    id: 1,
                    method: "Runtime.evaluate",
                    params: {expression, awaitPromise: true, returnByValue: true, userGesture: true},
                }));
            });
            socket.addEventListener("message", (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch {
                    return;
                }
                if (msg.id !== 1) return;
                if (msg.error) {
                    finish(new Error(`CDP 错误：${JSON.stringify(msg.error)}`));
                    return;
                }
                const details = msg.result || {};
                if (details.exceptionDetails) {
                    const text = details.exceptionDetails.exception?.description
                        || details.exceptionDetails.text || "页面异常";
                    finish(new Error(text));
                    return;
                }
                finish(null, details.result ? details.result.value : undefined);
            });
            socket.addEventListener("error", (event) => {
                finish(new Error(`CDP 连接失败：${event.message || "unknown"}`));
            });
        });
    } finally {
        try {
            socket.close();
        } catch {
            /* ignore */
        }
    }
}

const PAGE_PROBE = `(() => {
    const nav = performance.getEntriesByType('navigation')[0] || null;
    const timing = performance.timing || null;
    const main = document.getElementById('content');
    let dom = nav ? nav.domContentLoadedEventEnd : null;
    let load = nav ? nav.loadEventEnd : null;
    if ((!nav || !load) && timing) {
        const base = timing.navigationStart || 0;
        dom = dom || (timing.domContentLoadedEventEnd ? timing.domContentLoadedEventEnd - base : null);
        load = load || (timing.loadEventEnd ? timing.loadEventEnd - base : null);
    }
    return {
        href: location.href,
        title: document.title,
        readyState: document.readyState,
        visibility: document.visibilityState,
        dom: dom && dom > 0 ? Math.round(dom) : null,
        load: load && load > 0 ? Math.round(load) : null,
        now: Math.round(performance.now()),
        contentChildren: main ? main.children.length : 0
    };
})()`;

const RECORDING_PROBE = `(() => {
    const out = {
        href: location.href,
        visibility: document.visibilityState,
        recording: false,
        native: null,
        nativeError: '',
        pillText: '',
        asrState: null,
        hasSession: false,
        textMatch: false,
        sources: [],
        tts: {detectable: false, running: null, state: null, domState: '', error: ''}
    };
    try {
        if (window.SocialMateAndroid && typeof window.SocialMateAndroid.isRecording === 'function') {
            out.native = window.SocialMateAndroid.isRecording() === true;
            if (out.native) out.sources.push('native');
        }
    } catch (err) {
        out.nativeError = String(err && err.message || err).slice(0, 120);
    }
    try {
        const pill = document.querySelector('.v152livepill');
        if (pill) out.pillText = String(pill.textContent || '').trim().slice(0, 40);
        if (/录音中|正在听/.test(out.pillText)) out.sources.push('pill');
    } catch (err) { /* ignore */ }
    try {
        if (typeof S !== 'undefined' && S) {
            out.asrState = S.asrState || null;
            out.hasSession = !!S.session;
            if ((out.asrState === 'ready' || out.asrState === 'mock') && out.hasSession) out.sources.push('asrState');
        }
    } catch (err) { /* ignore */ }
    try {
        const text = (document.body && document.body.innerText) || '';
        out.textMatch = /正在听|录音中/.test(text);
        if (out.textMatch) out.sources.push('visibleText');
    } catch (err) { /* ignore */ }
    try {
        if (window.SocialMateTts && typeof window.SocialMateTts.queueState === 'function') {
            out.tts.detectable = true;
            const raw = window.SocialMateTts.queueState();
            const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
            out.tts.state = obj && (obj.state || obj.outcome || null);
            out.tts.running = !!(obj && obj.running === true && obj.paused !== true);
        }
    } catch (err) {
        out.tts.error = String(err && err.message || err).slice(0, 120);
    }
    if (out.tts.running === null) {
        try {
            const el = document.querySelector('[data-tts-state]');
            if (el) {
                out.tts.domState = el.dataset.state || '';
                out.tts.running = out.tts.domState === 'playing';
            }
        } catch (err) { /* ignore */ }
    }
    out.recording = out.native === true || out.sources.length > 0;
    return out;
})()`;

async function waitForReady(wsUrl, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    let last = null;
    while (Date.now() < deadline) {
        last = await cdpEvaluate(wsUrl, PAGE_PROBE, Math.min(5000, timeoutMs));
        if (last && last.readyState === "complete" && last.contentChildren > 0 && last.load > 0) return last;
        await sleep(150);
    }
    throw new Error(`页面 ready 超时（最后状态：${JSON.stringify(last)}）`);
}

function recordingProbeJs() {
    return `(() => {
        try {
            let native = null;
            try {
                if (window.SocialMateAndroid && typeof window.SocialMateAndroid.isRecording === 'function') {
                    native = window.SocialMateAndroid.isRecording() === true;
                }
            } catch (err) { /* ignore */ }
            let asrState = null;
            let hasSession = false;
            try {
                if (typeof S !== 'undefined' && S) {
                    asrState = S.asrState || null;
                    hasSession = !!S.session;
                }
            } catch (err) { /* ignore */ }
            let pillText = '';
            try {
                const pill = document.querySelector('.v152livepill');
                if (pill) pillText = String(pill.textContent || '').trim().slice(0, 40);
            } catch (err) { /* ignore */ }
            const recording = native === true
                || /录音中|正在听/.test(pillText)
                || ((asrState === 'ready' || asrState === 'mock') && hasSession);
            return {recording, native, asrState, hasSession, pillText};
        } catch (err) {
            return {recording: false, native: null, asrState: null, hasSession: false, pillText: '', error: String(err && err.message || err).slice(0, 120)};
        }
    })()`;
}

function buildTabExpression(sampleCount, gapMs) {
    return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const nextPaint = (timeoutMs) => new Promise((resolve) => {
        let settled = false;
        const finish = (mode) => { if (settled) return; settled = true; resolve(mode); };
        try {
            requestAnimationFrame(() => requestAnimationFrame(() => finish('raf')));
        } catch {
            finish('error');
        }
        setTimeout(() => finish('timeout'), timeoutMs);
    });
    const probeRecording = ${recordingProbeJs()};
    const tabs = ${JSON.stringify(TABS)};
    const rounds = ${sampleCount};
    const gap = ${gapMs};
    const samples = {};
    const failures = [];
    const recordingLost = [];
    for (const id of tabs) samples[id] = [];
    const currentButton = document.querySelector('[data-nav].current');
    const original = currentButton ? currentButton.dataset.nav : 'software';
    for (let round = 0; round < rounds; round += 1) {
        const rec = probeRecording();
        if (!rec.recording) recordingLost.push(round + 1);
        for (const id of tabs) {
            const button = Array.from(document.querySelectorAll('[data-nav]')).find((b) => b.dataset.nav === id);
            if (!button) { failures.push({id, round: round + 1, reason: 'missing-nav-button'}); continue; }
            const t0 = performance.now();
            button.click();
            const mode = await nextPaint(1000);
            const elapsed = performance.now() - t0;
            const main = document.getElementById('content');
            const titleEl = document.getElementById('pageTitle');
            const current = document.querySelector('[data-nav].current');
            const painted = !!main && main.children.length > 0 && main.offsetHeight > 0;
            const switched = !!current && current.dataset.nav === id;
            const valid = mode === 'raf' && painted && switched && rec.recording;
            let reason = '';
            if (!valid) {
                if (!rec.recording) reason = 'recording-lost';
                else if (mode !== 'raf') reason = 'frame-' + mode;
                else if (!painted) reason = 'main-not-visible';
                else if (!switched) reason = 'nav-not-switched';
                else reason = 'unknown';
            }
            samples[id].push({
                ms: Math.round(elapsed * 10) / 10,
                mode,
                valid,
                reason,
                round: round + 1,
                recording: rec.recording,
                title: titleEl ? titleEl.textContent : '',
                children: main ? main.children.length : 0
            });
            await sleep(gap);
        }
    }
    const back = Array.from(document.querySelectorAll('[data-nav]')).find((b) => b.dataset.nav === original);
    if (back) { back.click(); await nextPaint(1000); }
    return {samples, failures, recordingLost, original, href: location.href, visibility: document.visibilityState};
})()`;
}

function collectDeviceInfo(serial, pkg) {
    const getprop = (key) => adb(serial, ["shell", "getprop", key], {allowFail: true, timeout: 10000}).stdout.trim();
    const manufacturer = getprop("ro.product.manufacturer");
    const model = getprop("ro.product.model");
    const android = getprop("ro.build.version.release");
    const sdk = getprop("ro.build.version.sdk");
    const abi = getprop("ro.product.cpu.abi");
    const wmSize = adb(serial, ["shell", "wm", "size"], {allowFail: true, timeout: 10000}).stdout.trim();
    const dump = adb(serial, ["shell", "dumpsys", "package", pkg], {allowFail: true, timeout: 20000}).stdout;
    const versionName = (/versionName=([^\s]+)/.exec(dump) || [])[1] || null;
    const versionCode = (/versionCode=(\d+)/.exec(dump) || [])[1] || null;
    return {
        label: [manufacturer, model].filter(Boolean).join(" ") || "未知机型",
        android: android || null,
        sdk: sdk || null,
        abi: abi || null,
        screen: wmSize.replace(/\s+/g, " ").trim() || null,
        appVersion: versionName,
        appVersionCode: versionCode,
    };
}

function resolveSerial(serial) {
    if (!serial) return {ok: false, reason: "未提供设备序列号：请设置 SM_SERIAL 或传 --serial"};
    const devices = runCmd("adb", ["devices"], {allowFail: true, timeout: 15000});
    if (!devices.ok) return {ok: false, reason: "adb 不可用：" + (devices.stderr || devices.stdout).trim().slice(0, 200)};
    const lines = devices.stdout.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean);
    const connected = lines.filter((line) => /\sdevice$/.test(line)).length;
    const present = lines.some((line) => line.split(/\s+/)[0] === serial && /\sdevice$/.test(line));
    if (!present) {
        return {ok: false, reason: `指定设备未连接（当前 ${connected} 台处于 device 状态）`};
    }
    return {ok: true};
}

async function readWebviewVersion(serial, port, pkg, timeoutMs) {
    try {
        await connectPage(serial, port, pkg, Date.now() + Math.min(timeoutMs, 8000));
        const version = await fetchJson(`http://127.0.0.1:${port}/json/version`, 2000);
        return version.Browser || version["User-Agent"] || null;
    } catch {
        return null;
    }
}

async function ensureRunning(ctx) {
    const pid = adb(ctx.serial, ["shell", "pidof", ctx.pkg], {allowFail: true, timeout: 10000}).stdout.trim();
    if (pid) return;
    adb(ctx.serial, ["shell", "am", "start", "-n", `${ctx.pkg}/${ctx.activity}`], {timeout: 60000});
    await sleep(1200);
}

async function probeAppState(ctx) {
    await ensureRunning(ctx);
    const {page} = await connectPage(ctx.serial, ctx.port, ctx.pkg, Date.now() + ctx.cdpTimeoutMs);
    return cdpEvaluate(page.webSocketDebuggerUrl, RECORDING_PROBE, Math.min(6000, ctx.cdpTimeoutMs))
        .then((probe) => ({ok: true, probe, page: {url: page.url, webSocketDebuggerUrl: page.webSocketDebuggerUrl}}));
}

function summarizeProbe(probe) {
    return {
        recording: !!probe.recording,
        sources: Array.isArray(probe.sources) ? probe.sources : [],
        native: probe.native,
        nativeError: probe.nativeError || "",
        asrState: probe.asrState,
        hasSession: probe.hasSession,
        pillText: probe.pillText,
        textMatch: !!probe.textMatch,
        tts: probe.tts || {detectable: false, running: null, state: null},
        href: probe.href || "",
        visibility: probe.visibility || "",
    };
}

async function runColdStart(ctx) {
    const {serial, port, pkg, coldSamples, cdpTimeoutMs, log, options} = ctx;
    const samples = [];
    let failureStreak = 0;
    let firstPreconditionPassed = false;

    for (let index = 1; index <= coldSamples; index += 1) {
        log(`\n[冷启动 ${index}/${coldSamples}] 前置检查 → force-stop → am start -W`);
        let pre = null;
        const needCheck = options.coldPrecondition === "each" || !firstPreconditionPassed;
        if (needCheck) {
            try {
                const snapshot = await probeAppState(ctx);
                pre = summarizeProbe(snapshot.probe);
                if (!pre.recording) {
                    samples.push({
                        index,
                        valid: false,
                        reason: "precondition-not-recording：启动前未检测到录音中（页面/原生桥均无信号）",
                        precondition: pre,
                    });
                    log(`  跳过：启动前未处于录音中（信号 ${pre.sources.join(",") || "无"}）`);
                    await sleep(500);
                    continue;
                }
                if (options.requireTts && pre.tts.running !== true) {
                    samples.push({
                        index,
                        valid: false,
                        reason: "precondition-not-tts：启动前未检测到豆包朗读播放",
                        precondition: pre,
                    });
                    log("  跳过：启动前未检测到朗读播放（--require-tts）");
                    await sleep(500);
                    continue;
                }
                firstPreconditionPassed = true;
            } catch (err) {
                samples.push({index, valid: false, reason: `前置检查失败：${err.message}`, precondition: pre});
                failureStreak += 1;
                log(`  失败：${err.message}`);
                if (failureStreak >= 3) break;
                continue;
            } finally {
                cleanupForward(serial, port);
            }
        }

        adb(serial, ["shell", "am", "force-stop", pkg], {timeout: 15000});
        await sleep(350);
        const started = runCmd("adb", ["-s", serial, "shell", "am", "start", "-W", "-n", `${pkg}/${ctx.activity}`], {
            timeout: 60000,
            allowFail: true,
        });
        const text = `${started.stdout}\n${started.stderr}`;
        const totalTime = numberFrom(/TotalTime:\s*(\d+)/i, text);
        const waitTime = numberFrom(/WaitTime:\s*(\d+)/i, text);
        if (!started.ok || totalTime === null) {
            samples.push({index, valid: false, reason: `am start 失败：${text.trim().slice(0, 200)}`, precondition: pre});
            failureStreak += 1;
            log("  失败：未能获取 TotalTime");
            if (failureStreak >= 3) {
                log("  连续 3 次启动失败，停止冷启动采样");
                break;
            }
            continue;
        }
        try {
            const {page} = await connectPage(serial, port, pkg, Date.now() + cdpTimeoutMs);
            const probe = await waitForReady(page.webSocketDebuggerUrl, cdpTimeoutMs);
            if (!isLocalPageUrl(probe.href)) {
                throw new Error(`当前页面不是本地页面：${probe.href}（请确认应用处于本机 UI 模式）`);
            }
            const after = await cdpEvaluate(page.webSocketDebuggerUrl, RECORDING_PROBE, Math.min(6000, cdpTimeoutMs));
            const afterState = summarizeProbe(after);
            const valid = !!probe.load && probe.visibility === "visible";
            samples.push({
                index,
                valid,
                totalTime,
                waitTime,
                dom: probe.dom,
                load: probe.load,
                coldMs: Math.round(totalTime + probe.load),
                pageReadyMs: probe.now,
                href: probe.href,
                precondition: pre,
                recordingAtReady: afterState.recording,
                recordingSourcesAtReady: afterState.sources,
                ttsAtReady: afterState.tts,
                reason: valid ? "" : `页面不可见或计时缺失（visibility=${probe.visibility}, load=${probe.load}）`,
            });
            failureStreak = 0;
            log(`  TotalTime ${totalTime}ms | DOM ${fmt(probe.dom)} | load ${fmt(probe.load)} | cold ${totalTime + probe.load}ms | 启动后录音 ${afterState.recording ? "是" : "否"} | 启动后朗读 ${afterState.tts.running === true ? "是" : "否"}`);
        } catch (err) {
            samples.push({index, valid: false, reason: err.message, precondition: pre});
            failureStreak += 1;
            log(`  失败：${err.message}`);
        } finally {
            cleanupForward(serial, port);
        }
        if (failureStreak >= 3) {
            log("  连续 3 次 CDP 不可用，停止冷启动采样");
            break;
        }
        await sleep(400);
    }
    return samples;
}

async function runTabSwitch(ctx) {
    const {serial, port, tabSamples, tabGapMs, cdpTimeoutMs, log} = ctx;
    await ensureRunning(ctx);
    const {page} = await connectPage(serial, port, ctx.pkg, Date.now() + cdpTimeoutMs);
    let state;
    try {
        state = await cdpEvaluate(page.webSocketDebuggerUrl, RECORDING_PROBE, Math.min(6000, cdpTimeoutMs));
    } finally {
        cleanupForward(serial, port);
    }
    if (!isLocalPageUrl(state.href)) {
        throw new Error(`当前页面不是本地页面：${state.href}（请确认应用处于本机 UI 模式）`);
    }
    if (state.visibility !== "visible") {
        throw new Error(`页面不可见（visibility=${state.visibility}）：请解锁手机并把 SocialMate 置前台`);
    }
    if (!state.recording) {
        const detail = summarizeProbe(state);
        throw new Error(`未检测到录音中（信号：${detail.sources.join(",") || "无"}；asrState=${detail.asrState}）：请先在「聊天」页开始录音`);
    }
    const tts = summarizeProbe(state).tts;
    log(`\n[Tab 切换·录音中] 页面 ${state.href}${tts.running === true ? "（朗读播放中）" : ""}`);
    const {page: freshPage} = await connectPage(serial, port, ctx.pkg, Date.now() + cdpTimeoutMs);
    try {
        const result = await cdpEvaluate(
            freshPage.webSocketDebuggerUrl,
            buildTabExpression(tabSamples, tabGapMs),
            Math.max(120000, tabSamples * TABS.length * 1200),
        );
        if (!result || !result.samples) throw new Error("Tab 测量未返回样本");
        return {result, page: {href: state.href, url: freshPage.url, visibility: state.visibility}};
    } finally {
        cleanupForward(serial, port);
    }
}

function normalizeTabResult(result, tabSamples) {
    const groups = {};
    for (const id of TABS) {
        const rows = Array.isArray(result.samples[id]) ? result.samples[id] : [];
        const validRows = rows.filter((row) => row && row.valid && typeof row.ms === "number");
        const stats = summarize(validRows.map((row) => row.ms));
        const invalidReasons = {};
        for (const row of rows) {
            if (row && !row.valid && row.reason) invalidReasons[row.reason] = (invalidReasons[row.reason] || 0) + 1;
        }
        groups[id] = {
            label: TAB_LABELS[id],
            raw: rows,
            validValues: validRows.map((row) => row.ms),
            invalid: rows.length - validRows.length,
            invalidReasons,
            stats,
            verdict: verdictOf(stats, tabSamples, THRESHOLD_TAB_MS),
        };
    }
    const combined = summarize(TABS.flatMap((id) => groups[id].validValues));
    return {
        groups,
        combined,
        failures: Array.isArray(result.failures) ? result.failures : [],
        recordingLost: Array.isArray(result.recordingLost) ? result.recordingLost : [],
    };
}

function buildReport(payload) {
    const {
        generatedAt, options, device, webview, precheck, cold, tab,
        status, notRunReason, coldPrecondition, durationSec, notes,
    } = payload;
    const lines = [];
    lines.push("# ALW-001 V1.7 重负载性能测量报告（录音 + 豆包朗读）");
    lines.push("");
    lines.push("> 由 `scripts/v17-perf-heavy.mjs` 自动生成。");
    lines.push(`> 生成时间：${generatedAt}`);
    lines.push(`> 总体结论：**${status}**`);
    if (notRunReason) lines.push(`> NOT_RUN 原因：${notRunReason}`);
    lines.push("");
    lines.push("## 1. 执行命令");
    lines.push("");
    lines.push("```bash");
    lines.push("SM_SERIAL=<设备序列号> node scripts/v17-perf-heavy.mjs \\");
    lines.push(`  --port ${options.port} --package ${options.package} --activity ${options.activity} \\`);
    lines.push(`  --samples ${options.samples} --cold-precondition ${options.coldPrecondition}${options.requireTts ? " --require-tts" : ""}`);
    lines.push("```");
    lines.push("");
    lines.push("前置条件：手机解锁亮屏，应用在「聊天」页处于「正在听 / 录音中」；如需测双负载，先手动触发豆包朗读。脚本不代点「开始录音」。");
    lines.push("");
    lines.push("真机序列号只从 `SM_SERIAL` 或 `--serial` 读取，不写入本报告。");
    lines.push("");
    lines.push("## 2. 设备与环境");
    lines.push("");
    if (device) {
        lines.push("| 项目 | 值 |");
        lines.push("| --- | --- |");
        lines.push(`| 设备 | ${device.label} |`);
        lines.push(`| Android | ${device.android || "未知"}（SDK ${device.sdk || "未知"}） |`);
        lines.push(`| ABI | ${device.abi || "未知"} |`);
        lines.push(`| 屏幕 | ${device.screen || "未知"} |`);
        lines.push(`| 应用 | ${device.appVersion || "未知"}${device.appVersionCode ? `（versionCode ${device.appVersionCode}）` : ""} |`);
        lines.push(`| WebView | ${webview || "未采集"} |`);
        if (precheck && precheck.href) lines.push(`| 页面 | ${precheck.href} |`);
    } else {
        lines.push("未采集：本次运行没有连接设备。");
    }
    lines.push("");
    lines.push("## 3. 门槛与口径");
    lines.push("");
    lines.push("| 指标 | 门槛 | 口径 |");
    lines.push("| --- | --- | --- |");
    lines.push(`| 冷启动到可操作 | ≤ ${THRESHOLD_COLD_MS}ms | \`force-stop\` → \`am start -W\` 的 TotalTime + 页面 \`loadEventEnd\`（保守上界） |`);
    lines.push(`| 录音中 Tab 切换 | ≤ ${THRESHOLD_TAB_MS}ms | 点击导航到两次 \`requestAnimationFrame\` 完成，且主内容有子节点、高度大于 0、当前 Tab 已切换 |`);
    lines.push("");
    lines.push(`统计使用近邻秩法：P95 = 升序第 \`ceil(0.95 × n)\` 个；n=${options.samples} 时 P95 等于最大值。`);
    lines.push("");
    lines.push("## 4. 前置状态检测（只读）");
    lines.push("");
    if (precheck) {
        lines.push("| 项目 | 值 |");
        lines.push("| --- | --- |");
        lines.push(`| 录音中 | ${precheck.recording ? "是" : "否"}（信号：${precheck.sources.join("、") || "无"}） |`);
        lines.push(`| 原生桥 isRecording | ${precheck.native === null ? "不可用" : precheck.native ? "true" : "false"}${precheck.nativeError ? `（${precheck.nativeError}）` : ""} |`);
        lines.push(`| 页面 asrState | ${precheck.asrState || "未知"} |`);
        lines.push(`| 会话存在 | ${precheck.hasSession ? "是" : "否"} |`);
        lines.push(`| 录音 pill 文案 | ${precheck.pillText || "—"} |`);
        lines.push(`| 朗读可检测 | ${precheck.tts.detectable ? "是" : "否"} |`);
        lines.push(`| 朗读播放中 | ${precheck.tts.running === null ? "未知" : precheck.tts.running ? "是" : "否"}${precheck.tts.state ? `（${precheck.tts.state}）` : ""} |`);
        lines.push(`| 页面可见 | ${precheck.visibility || "未知"} |`);
    } else {
        lines.push("未检测：本次运行没有连接设备，或未进入前置检查。");
    }
    lines.push("");
    if (coldPrecondition === "first") {
        lines.push("冷启动前置口径为 `first`：仅首轮要求录音中，后续样本不再阻断，启动后恢复情况见第 5 节。");
        lines.push("");
    } else {
        lines.push("冷启动前置口径为 `each`：每次 force-stop 前都要求录音中；force-stop 会中断录音，脚本不会自动恢复，需要人工重新开始录音后再采下一轮。");
        lines.push("");
    }

    lines.push("## 5. 冷启动样本（录音中前置）");
    lines.push("");
    if (cold) {
        if (cold.samples.length) {
            lines.push("| # | 启动前录音 | TotalTime(ms) | WaitTime(ms) | DOM(ms) | load(ms) | cold=Total+load(ms) | 启动后录音 | 启动后朗读 | 有效 |");
            lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
            for (const row of cold.samples) {
                const preRec = row.precondition ? (row.precondition.recording ? "是" : "否") : "未检查";
                const afterRec = row.valid ? (row.recordingAtReady ? "是" : "否") : "—";
                const afterTts = row.valid ? (row.ttsAtReady && row.ttsAtReady.running === true ? "是" : "否") : "—";
                if (row.valid) {
                    lines.push(`| ${row.index} | ${preRec} | ${row.totalTime} | ${fmt(row.waitTime, "")} | ${fmt(row.dom, "")} | ${fmt(row.load, "")} | ${row.coldMs} | ${afterRec} | ${afterTts} | 是 |`);
                } else {
                    const reason = String(row.reason || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 90);
                    lines.push(`| ${row.index} | ${preRec} | — | — | — | — | — | — | — | 否（${reason}） |`);
                }
            }
            const readyRec = cold.samples.filter((row) => row.valid && row.recordingAtReady).length;
            const readyValid = cold.samples.filter((row) => row.valid).length;
            lines.push("");
            lines.push(`启动后录音恢复：${readyRec}/${readyValid}（有效冷启动样本）。force-stop 必然中断录音，恢复由应用自身决定，本报告如实记录，不假定连续。`);
        } else {
            lines.push("无有效样本。");
        }
        lines.push("");
        lines.push("| 统计 | min | mean | P50 | P95 | max | n | 结论 |");
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
        const s = cold.stats;
        if (s) {
            lines.push(`| cold(ms) | ${Math.round(s.min)} | ${s.mean} | ${s.p50} | ${s.p95} | ${s.max} | ${s.n} | ${cold.verdict} |`);
        } else {
            lines.push(`| cold(ms) | — | — | — | — | — | 0 | ${cold.verdict} |`);
        }
        lines.push("");
    } else {
        lines.push("未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。");
        lines.push("");
    }

    lines.push("## 6. 录音中 Tab 切换样本");
    lines.push("");
    if (tab) {
        lines.push("| Tab | 原始样本(ms) | 无效 | P50 | P95 | min | max | mean | 结论 |");
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
        for (const id of TABS) {
            const group = tab.groups[id];
            const raw = group.validValues.length ? group.validValues.join(", ") : "—";
            const s = group.stats;
            lines.push(`| ${group.label} | ${raw} | ${group.invalid} | ${s ? s.p50 : "—"} | ${s ? s.p95 : "—"} | ${s ? Math.round(s.min) : "—"} | ${s ? Math.round(s.max) : "—"} | ${s ? s.mean : "—"} | ${group.verdict} |`);
            const reasons = Object.entries(group.invalidReasons || {});
            if (reasons.length) {
                lines.push(`| ↳ 无效原因 | ${reasons.map(([key, count]) => `${key}×${count}`).join("、")} | | | | | | | |`);
            }
        }
        const c = tab.combined;
        if (c) {
            lines.push(`| 合并 | ${c.n} 个有效 | ${TABS.reduce((sum, id) => sum + tab.groups[id].invalid, 0)} | ${c.p50} | ${c.p95} | ${Math.round(c.min)} | ${Math.round(c.max)} | ${c.mean} | — |`);
        }
        if (tab.recordingLost.length) {
            lines.push("");
            lines.push(`录音掉线轮次：第 ${tab.recordingLost.join("、")} 轮（这些轮次样本计为无效，不当作录音中口径）。`);
        }
        if (tab.failures && tab.failures.length) {
            lines.push("");
            lines.push(`注入失败记录：${tab.failures.map((row) => `${row.id}#${row.round}(${row.reason})`).join("、")}`);
        }
        lines.push("");
    } else {
        lines.push("未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。");
        lines.push("");
    }

    lines.push("## 7. 结论");
    lines.push("");
    lines.push(`总体结论：**${status}**${durationSec ? `（本机耗时 ${durationSec}s）` : ""}`);
    lines.push("");
    if (cold) {
        lines.push(`- 冷启动：${cold.verdict}${cold.stats ? `（P95 ${cold.stats.p95}ms / 门槛 ${THRESHOLD_COLD_MS}ms，有效样本 ${cold.stats.n}）` : "（无有效样本）"}`);
    } else {
        lines.push("- 冷启动：未测");
    }
    if (tab) {
        const failed = TABS.filter((id) => tab.groups[id].verdict === "FAIL");
        const notRun = TABS.filter((id) => tab.groups[id].verdict === "NOT_RUN");
        if (failed.length) {
            lines.push(`- 录音中 Tab 切换：FAIL（超门槛：${failed.map((id) => TAB_LABELS[id]).join("、")}）`);
        } else if (notRun.length) {
            lines.push(`- 录音中 Tab 切换：NOT_RUN（样本不足：${notRun.map((id) => TAB_LABELS[id]).join("、")}）`);
        } else {
            lines.push(`- 录音中 Tab 切换：PASS（各分组 P95 ≤ ${THRESHOLD_TAB_MS}ms）`);
        }
    } else {
        lines.push("- 录音中 Tab 切换：未测");
    }
    lines.push("");
    lines.push("## 8. 未验证项与限制");
    lines.push("");
    lines.push("- `force-stop` 会终止录音与朗读；冷启动只能保证「启动前处于重负载状态」，无法保证启动全程录音连续。启动后是否恢复单独记录，不据此伪造。");
    lines.push("- 冷启动 `cold` 是 `TotalTime + load` 的保守上界，不是端到端触控可操作时刻；入口 `MainActivity` 会立即跳转 `AsrActivity`，TotalTime 只覆盖入口活动。");
    lines.push("- 朗读状态来自 `SocialMateTts.queueState()`（`running` 且未暂停）或页面 `[data-tts-state=playing]`，只代表采样时点，未做音频级校验，也未验证豆包声线内容。");
    lines.push("- 录音状态来自原生桥 `SocialMateAndroid.isRecording()`、页面 `S.asrState`（ready/mock 且有 session）、可见文案；任一信号命中即视为录音中，信号来源已逐条记录。");
    lines.push("- Tab 切换以两次 rAF 代表下一帧提交；未覆盖点击后的异步数据补渲染（如海南私有地点的 setTimeout 补渲染）。");
    lines.push("- 样本数为 5 时 P95 等于最大值，统计粒度有限；如需更稳的 P95，请提高 `--samples`。");
    lines.push("- 测量期间要求手机解锁、亮屏、应用在前台；否则 rAF 不触发，样本记为无效。");
    lines.push("- 系统后台负载、缓存状态、电池策略会影响绝对数值；本报告只代表当次运行环境。");
    lines.push("- 未覆盖长时间录音的内存增长、音频丢帧、TTS 队列切换与熄屏播放。");
    lines.push("- 脚本只读页面状态，未写 localStorage、未改产品数据；Tab 点击只改变页面内存中的当前页。");
    if (notes && notes.length) {
        for (const note of notes) lines.push(`- ${note}`);
    }
    lines.push("");
    return lines.join("\n");
}

function dryRun(options) {
    console.log("ALW-001 V1.7 重负载性能测量（录音 + 朗读）· 干跑检查\n");
    const nodeOk = Number(process.versions.node.split(".")[0]) >= 22;
    console.log(`- Node：v${process.versions.node} ${nodeOk ? "✓（需 ≥22 以支持全局 WebSocket/fetch）" : "✗ 需要 ≥22"}`);
    const adbPath = findOnPath("adb");
    console.log(`- adb：${adbPath ? `${adbPath} ✓` : "未在 PATH 中找到 ✗"}`);
    const outDir = path.dirname(options.out);
    const outDirOk = fs.existsSync(outDir);
    console.log(`- 报告目录：${outDir} ${outDirOk ? "✓ 已存在" : "（运行时自动创建）"}`);
    console.log(`- 报告路径：${options.out}`);
    console.log(`- 设备序列号：${options.serial ? "已通过参数/环境变量提供（不在输出中显示）" : "未提供（正式运行会 NOT_RUN）"}`);
    try {
        new Function(RECORDING_PROBE);
        new Function(buildTabExpression(options.tabSamples, options.tabGapMs));
        new Function(PAGE_PROBE);
        console.log("- 注入脚本语法：✓（录音探测 / Tab 采样 / 页面探针）");
    } catch (err) {
        console.log(`- 注入脚本语法：✗ ${err.message}`);
        return 2;
    }
    console.log("");
    console.log("采样计划：");
    console.log(`  · 冷启动 ${options.skipCold ? "跳过" : `${options.coldSamples} 次 × 前置口径 ${options.coldPrecondition}（force-stop + am start -W + CDP navigation timing）`}`);
    console.log(`  · Tab 切换 ${options.skipTab ? "跳过" : `${TABS.length} 个 × ${options.tabSamples} 次（${TABS.map((id) => TAB_LABELS[id]).join(" / ")}）`}`);
    console.log(`  · 朗读要求：${options.requireTts ? "必须检测到播放（--require-tts）" : "记录但不阻断"}`);
    console.log("");
    console.log("前置要求（脚本不代做）：");
    console.log("  · 手机解锁亮屏，应用在「聊天」页处于「正在听 / 录音中」；");
    console.log("  · 如需双负载，先手动触发豆包朗读；");
    console.log("  · 冷启动 force-stop 会中断录音，`each` 口径需要人工在每轮前重新开始录音。");
    console.log("");
    console.log("门槛：");
    console.log(`  · 冷启动到可操作 ≤ ${THRESHOLD_COLD_MS}ms（P95）`);
    console.log(`  · 录音中 Tab 切换 ≤ ${THRESHOLD_TAB_MS}ms（各分组 P95）`);
    console.log("");
    console.log("正式运行命令：");
    console.log(`  SM_SERIAL=<设备序列号> node scripts/v17-perf-heavy.mjs --out ${path.relative(ROOT, options.out) || options.out}`);
    console.log("");
    console.log("干跑通过：未访问设备、未写任何文件。");
    return nodeOk && adbPath ? 0 : 2;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        console.log(helpText());
        return 0;
    }
    if (options.dryRun) {
        return dryRun(options);
    }

    const log = logFactory(options.json);
    const generatedAt = new Date().toLocaleString("zh-CN", {hour12: false});
    const started = Date.now();
    const notes = [];
    let device = null;
    let webview = null;
    let precheck = null;
    let cold = null;
    let tab = null;
    let notRunReason = "";
    let status = "NOT_RUN";

    const ctx = {
        serial: options.serial,
        port: options.port,
        pkg: options.package,
        activity: options.activity,
        coldSamples: options.coldSamples,
        tabSamples: options.tabSamples,
        cdpTimeoutMs: options.cdpTimeoutMs,
        tabGapMs: options.tabGapMs,
        options,
        log,
        keepForward: false,
    };

    const serialCheck = resolveSerial(options.serial);
    if (!serialCheck.ok) {
        notRunReason = serialCheck.reason;
        log(`NOT_RUN：${notRunReason}`);
    } else {
        log(`设备已连接，开始重负载测量（包名 ${options.package}，前置口径 ${options.coldPrecondition}）`);
        try {
            device = collectDeviceInfo(options.serial, options.package);
            log(`设备：${device.label} / Android ${device.android || "?"} / 应用 ${device.appVersion || "?"}`);
        } catch (err) {
            notes.push(`设备信息采集失败：${err.message}`);
        }

        try {
            const snapshot = await probeAppState(ctx);
            precheck = summarizeProbe(snapshot.probe);
            log(`前置：录音中 ${precheck.recording ? "是" : "否"}（${precheck.sources.join("、") || "无信号"}）；朗读 ${precheck.tts.running === null ? "未知" : precheck.tts.running ? "播放中" : "未播放"}`);
        } catch (err) {
            notRunReason = `前置状态检测失败：${err.message}`;
            log(`NOT_RUN：${notRunReason}`);
        } finally {
            cleanupForward(options.serial, options.port);
        }

        if (precheck && !precheck.recording) {
            notRunReason = "未检测到录音中状态（原生 isRecording、页面 asrState、可见文案均无信号）；按口径标 NOT_RUN，未采样";
            log(`NOT_RUN：${notRunReason}`);
        } else if (precheck && options.requireTts && precheck.tts.running !== true) {
            notRunReason = "未检测到豆包朗读播放（--require-tts），按口径标 NOT_RUN，未采样";
            log(`NOT_RUN：${notRunReason}`);
        } else if (precheck) {
            try {
                if (!options.skipCold) {
                    const samples = await runColdStart(ctx);
                    const validValues = samples.filter((row) => row.valid).map((row) => row.coldMs);
                    const stats = summarize(validValues);
                    cold = {
                        samples,
                        stats,
                        verdict: verdictOf(stats, options.coldSamples, THRESHOLD_COLD_MS),
                    };
                }
                if (!options.skipTab) {
                    const {result} = await runTabSwitch(ctx);
                    const normalized = normalizeTabResult(result, options.tabSamples);
                    tab = {
                        ...normalized,
                        verdict: overallVerdict(Object.values(normalized.groups).map((group) => group.verdict)),
                    };
                }
            } catch (err) {
                notRunReason = err.message;
                log(`NOT_RUN：${notRunReason}`);
            }
        }

        try {
            webview = await readWebviewVersion(options.serial, options.port, options.package, options.cdpTimeoutMs);
        } catch {
            webview = null;
        }

        cleanupForward(options.serial, options.port);
    }

    if (!notRunReason) {
        if (!cold && !tab) {
            notRunReason = "冷启动与 Tab 均未执行";
        } else if (cold && cold.verdict === "NOT_RUN") {
            notRunReason = `冷启动有效样本不足（需要 ${options.coldSamples} 次；检查是否每次 force-stop 前都处于录音中）`;
        } else if (tab && tab.verdict === "NOT_RUN") {
            notRunReason = "Tab 切换存在样本不足的分组（录音掉线或页面未就绪）";
        }
    }

    const parts = [];
    if (!options.skipCold) parts.push(cold ? cold.verdict : "NOT_RUN");
    if (!options.skipTab) parts.push(tab ? tab.verdict : "NOT_RUN");
    if (!parts.length) parts.push("NOT_RUN");
    status = notRunReason ? (parts.includes("FAIL") ? "FAIL" : "NOT_RUN") : overallVerdict(parts);

    if ((cold && cold.samples.some((row) => row.precondition && row.precondition.recording === false))) {
        notes.push("存在启动前未处于录音中的冷启动轮次，这些轮次计为无效。");
    }

    const payload = {
        generatedAt,
        options,
        device,
        webview,
        precheck,
        cold,
        tab,
        status,
        notRunReason,
        coldPrecondition: options.coldPrecondition,
        durationSec: Math.round((Date.now() - started) / 100) / 10,
        notes,
    };

    if (!options.noWrite) {
        const reportPath = options.out;
        fs.mkdirSync(path.dirname(reportPath), {recursive: true});
        fs.writeFileSync(reportPath, buildReport(payload), "utf8");
        log(`\n报告已写入：${reportPath}`);
    }

    log(`\n总体结论：${status}`);
    if (notRunReason) log(`原因：${notRunReason}`);
    if (cold) log(`冷启动：${cold.verdict}${cold.stats ? `（P50 ${cold.stats.p50}ms / P95 ${cold.stats.p95}ms / n=${cold.stats.n}）` : "（无有效样本）"}`);
    if (tab) {
        for (const id of TABS) {
            const group = tab.groups[id];
            log(`Tab ${TAB_LABELS[id]}：${group.verdict}${group.stats ? `（P50 ${group.stats.p50}ms / P95 ${group.stats.p95}ms / n=${group.stats.n}）` : "（无有效样本）"}`);
        }
    }

    if (options.json) {
        const output = {...payload, options: {...options, serial: options.serial ? "<redacted>" : ""}};
        console.log(JSON.stringify(output, null, 2));
    }

    return status === "PASS" ? 0 : status === "FAIL" ? 1 : 2;
}

main().then((code) => {
    process.exitCode = code;
}).catch((err) => {
    console.error("失败：" + (err.message || err));
    process.exitCode = 1;
});