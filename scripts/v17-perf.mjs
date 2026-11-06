#!/usr/bin/env node
/**
 * ALW-001 V1.7 真机 WebView 性能测量（只读、无产品副作用）。
 *
 * 用法：
 *   SM_SERIAL=<序列号> node scripts/v17-perf.mjs
 *   node scripts/v17-perf.mjs --serial <序列号> --out docs/plan/ALW001-N05-V1.7-R2/PERF-REPORT.md
 *   node scripts/v17-perf.mjs --help
 *   node scripts/v17-perf.mjs --dry-run
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE = "app.socialmate.dualmic";
const DEFAULT_PORT = 9933;
const DEFAULT_COLD_SAMPLES = 10;
const DEFAULT_TAB_SAMPLES = 10;
const THRESHOLD_COLD_MS = 2000;
const THRESHOLD_TAB_MS = 300;
const TABS = ["software", "hainan", "chat", "self", "people"];
const TAB_LABELS = {software: "软件", hainan: "海南", chat: "聊天", self: "关于我", people: "人物"};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "docs", "plan", "ALW001-N05-V1.7-R2", "PERF-REPORT.md");

function parseArgs(argv) {
    const out = {
        serial: process.env.SM_SERIAL || "",
        port: DEFAULT_PORT,
        package: PACKAGE,
        activity: ".MainActivity",
        coldSamples: DEFAULT_COLD_SAMPLES,
        tabSamples: DEFAULT_TAB_SAMPLES,
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
        else if (item === "--cold-samples") { out.coldSamples = Math.max(1, Number(next()) || DEFAULT_COLD_SAMPLES); i += 1; }
        else if (item === "--tab-samples") { out.tabSamples = Math.max(1, Number(next()) || DEFAULT_TAB_SAMPLES); i += 1; }
        else if (item === "--out") { out.out = path.resolve(next() || DEFAULT_OUT); i += 1; }
        else if (item === "--cdp-timeout-ms") { out.cdpTimeoutMs = Math.max(2000, Number(next()) || 20000); i += 1; }
        else if (item === "--tab-gap-ms") { out.tabGapMs = Math.max(0, Number(next()) || 0); i += 1; }
        else if (item === "--skip-cold") out.skipCold = true;
        else if (item === "--skip-tab") out.skipTab = true;
        else if (item === "--json") out.json = true;
        else if (item === "--no-write") out.noWrite = true;
        else if (item.startsWith("-")) throw new Error(`未知参数：${item}`);
    }
    return out;
}

function helpText() {
    return [
        "ALW-001 V1.7 真机 WebView 性能测量（只读）",
        "",
        "用法：",
        "  SM_SERIAL=<序列号> node scripts/v17-perf.mjs [选项]",
        "",
        "选项：",
        "  --serial <序列号>        指定测试设备；未给时读 SM_SERIAL，再没有则 NOT_RUN",
        "  --port <端口>            CDP 本地映射端口，默认 9933（避开 sm-cdp 的 9223）",
        "  --package <包名>         被测应用包名，默认 app.socialmate.dualmic",
        "  --activity <活动>        冷启动入口，默认 .MainActivity",
        "  --cold-samples <n>       冷启动样本数，默认 10",
        "  --tab-samples <n>        每个 Tab 的样本数，默认 10",
        "  --tab-gap-ms <n>         每次 Tab 切换后的间隔，默认 60",
        "  --cdp-timeout-ms <n>     单次等待页面上限，默认 20000",
        "  --out <路径>             报告输出，默认 docs/plan/ALW001-N05-V1.7-R2/PERF-REPORT.md",
        "  --skip-cold              不测冷启动",
        "  --skip-tab               不测 Tab 切换",
        "  --json                   结果 JSON 输出到 stdout（进度改走 stderr）",
        "  --no-write               不写报告文件",
        "  --dry-run                只检查环境与采样计划，不访问设备、不写文件",
        "  --help                   显示本帮助",
        "",
        "测量口径：",
        "  冷启动：force-stop 后 am start -W，cold = TotalTime + 页面 load（保守上界）；",
        "          DOM/load 取自页面 navigation timing。",
        "  Tab：点击 [data-nav] 到两次 requestAnimationFrame 完成，即下一帧提交。",
        "  门槛：冷启动 P95 ≤ 2000ms；Tab 各分组 P95 ≤ 300ms（近邻秩法，10 样本时 P95=max）。",
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

async function connectPage(serial, port, deadline) {
    let lastError = "尚未尝试";
    let forwardedPid = "";
    while (Date.now() < deadline) {
        const pidOut = adb(serial, ["shell", "pidof", PACKAGE], {allowFail: true, timeout: 10000}).stdout.trim();
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
    const tabs = ${JSON.stringify(TABS)};
    const rounds = ${sampleCount};
    const gap = ${gapMs};
    const samples = {};
    const failures = [];
    for (const id of tabs) samples[id] = [];
    const currentButton = document.querySelector('[data-nav].current');
    const original = currentButton ? currentButton.dataset.nav : 'software';
    for (let round = 0; round < rounds; round += 1) {
        for (const id of tabs) {
            const button = Array.from(document.querySelectorAll('[data-nav]')).find((b) => b.dataset.nav === id);
            if (!button) { failures.push({id, reason: 'missing-nav-button'}); continue; }
            const t0 = performance.now();
            button.click();
            const mode = await nextPaint(1000);
            const elapsed = performance.now() - t0;
            const main = document.getElementById('content');
            const titleEl = document.getElementById('pageTitle');
            const current = document.querySelector('[data-nav].current');
            const valid = mode === 'raf' && !!main && main.children.length > 0 && !!current && current.dataset.nav === id;
            samples[id].push({
                ms: Math.round(elapsed * 10) / 10,
                mode,
                valid,
                title: titleEl ? titleEl.textContent : '',
                children: main ? main.children.length : 0
            });
            await sleep(gap);
        }
    }
    const back = Array.from(document.querySelectorAll('[data-nav]')).find((b) => b.dataset.nav === original);
    if (back) { back.click(); await nextPaint(1000); }
    return {samples, failures, original, href: location.href, visibility: document.visibilityState};
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

async function readWebviewVersion(serial, port, timeoutMs) {
    try {
        await connectPage(serial, port, Date.now() + Math.min(timeoutMs, 8000));
        const version = await fetchJson(`http://127.0.0.1:${port}/json/version`, 2000);
        return version.Browser || version["User-Agent"] || null;
    } catch {
        return null;
    }
}

async function runColdStart(ctx) {
    const {serial, port, pkg, coldSamples, cdpTimeoutMs, log} = ctx;
    const samples = [];
    let failureStreak = 0;
    for (let index = 1; index <= coldSamples; index += 1) {
        log(`\n[冷启动 ${index}/${coldSamples}] force-stop + am start -W`);
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
            samples.push({index, valid: false, reason: `am start 失败：${text.trim().slice(0, 200)}`});
            failureStreak += 1;
            log("  失败：未能获取 TotalTime");
            if (failureStreak >= 3) {
                log("  连续 3 次启动失败，停止冷启动采样");
                break;
            }
            continue;
        }
        try {
            const {page} = await connectPage(serial, port, Date.now() + cdpTimeoutMs);
            const probe = await waitForReady(page.webSocketDebuggerUrl, cdpTimeoutMs);
            if (!isLocalPageUrl(probe.href)) {
                throw new Error(`当前页面不是本地页面：${probe.href}（请确认应用处于本机 UI 模式）`);
            }
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
                reason: valid ? "" : `页面不可见或计时缺失（visibility=${probe.visibility}, load=${probe.load}）`,
            });
            failureStreak = 0;
            log(`  TotalTime ${totalTime}ms | DOM ${fmt(probe.dom)} | load ${fmt(probe.load)} | cold ${totalTime + probe.load}ms${valid ? "" : "（无效）"}`);
        } catch (err) {
            samples.push({index, valid: false, reason: err.message});
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

async function ensureRunning(ctx) {
    const pid = adb(ctx.serial, ["shell", "pidof", ctx.pkg], {allowFail: true, timeout: 10000}).stdout.trim();
    if (pid) return;
    adb(ctx.serial, ["shell", "am", "start", "-n", `${ctx.pkg}/${ctx.activity}`], {timeout: 60000});
    await sleep(1200);
}

async function runTabSwitch(ctx) {
    const {serial, port, tabSamples, tabGapMs, cdpTimeoutMs, log} = ctx;
    await ensureRunning(ctx);
    const {page} = await connectPage(serial, port, Date.now() + cdpTimeoutMs);
    const state = await cdpEvaluate(page.webSocketDebuggerUrl, `({visibility: document.visibilityState, href: location.href, dpr: window.devicePixelRatio})`, 5000);
    if (!isLocalPageUrl(state.href)) {
        throw new Error(`当前页面不是本地页面：${state.href}（请确认应用处于本机 UI 模式）`);
    }
    if (state.visibility !== "visible") {
        throw new Error(`页面不可见（visibility=${state.visibility}）：请解锁手机并把 SocialMate 置前台`);
    }
    log(`\n[Tab 切换] 页面 ${state.href}`);
    await sleep(600);
    const result = await cdpEvaluate(
        page.webSocketDebuggerUrl,
        buildTabExpression(tabSamples, tabGapMs),
        120000,
    );
    if (!result || !result.samples) throw new Error("Tab 测量未返回样本");
    return {result, page: {...state, url: page.url, webSocketDebuggerUrl: page.webSocketDebuggerUrl}};
}

function normalizeTabResult(result, tabSamples) {
    const groups = {};
    for (const id of TABS) {
        const rows = Array.isArray(result.samples[id]) ? result.samples[id] : [];
        const validRows = rows.filter((row) => row && row.valid && typeof row.ms === "number");
        const stats = summarize(validRows.map((row) => row.ms));
        groups[id] = {
            label: TAB_LABELS[id],
            raw: rows,
            validValues: validRows.map((row) => row.ms),
            invalid: rows.length - validRows.length,
            stats,
            verdict: verdictOf(stats, tabSamples, THRESHOLD_TAB_MS),
        };
    }
    const combined = summarize(TABS.flatMap((id) => groups[id].validValues));
    return {groups, combined, failures: Array.isArray(result.failures) ? result.failures : []};
}

function buildReport(payload) {
    const {generatedAt, options, device, cold, tab, status, notRunReason, webview, notes} = payload;
    const lines = [];
    lines.push("# ALW-001 V1.7 性能测量报告");
    lines.push("");
    lines.push("> 由 `scripts/v17-perf.mjs` 自动生成。");
    lines.push(`> 生成时间：${generatedAt}`);
    lines.push(`> 总体结论：**${status}**`);
    if (notRunReason) lines.push(`> NOT_RUN 原因：${notRunReason}`);
    lines.push("");
    lines.push("## 1. 执行命令");
    lines.push("");
    lines.push("```bash");
    lines.push("SM_SERIAL=<设备序列号> node scripts/v17-perf.mjs \\");
    lines.push(`  --port ${options.port} --package ${options.package} --activity ${options.activity} \\`);
    lines.push(`  --cold-samples ${options.coldSamples} --tab-samples ${options.tabSamples}`);
    lines.push("```");
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
        const firstCold = cold && cold.samples.find((row) => row.valid && row.href);
        if (firstCold) lines.push(`| 页面 | ${firstCold.href} |`);
    } else {
        lines.push("未采集：本次运行没有连接设备。");
    }
    lines.push("");
    lines.push("## 3. 门槛与口径");
    lines.push("");
    lines.push("| 指标 | 门槛 | 口径 |");
    lines.push("| --- | --- | --- |");
    lines.push(`| 首个可操作页面 | ≤ ${THRESHOLD_COLD_MS}ms | \`force-stop\` → \`am start -W\` 得到 TotalTime，加上页面 navigation timing 的 \`loadEventEnd\`（保守上界） |`);
    lines.push(`| Tab 切换 | ≤ ${THRESHOLD_TAB_MS}ms | 点击导航按钮到两次 \`requestAnimationFrame\` 完成（下一帧提交） |`);
    lines.push("");
    lines.push("统计使用近邻秩法：P95 = 升序第 `ceil(0.95 × n)` 个；10 个样本时 P95 等于最大值。");
    lines.push("");

    if (cold) {
        lines.push("## 4. 冷启动样本");
        lines.push("");
        if (cold.samples.length) {
            lines.push("| # | TotalTime(ms) | WaitTime(ms) | DOM(ms) | load(ms) | cold=Total+load(ms) | 有效 |");
            lines.push("| --- | --- | --- | --- | --- | --- | --- |");
            for (const row of cold.samples) {
                if (row.valid) {
                    lines.push(`| ${row.index} | ${row.totalTime} | ${fmt(row.waitTime, "")} | ${fmt(row.dom, "")} | ${fmt(row.load, "")} | ${row.coldMs} | 是 |`);
                } else {
                    const reason = String(row.reason || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 80);
                    lines.push(`| ${row.index} | — | — | — | — | — | 否（${reason}） |`);
                }
            }
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
        lines.push("## 4. 冷启动样本");
        lines.push("");
        lines.push("未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。");
        lines.push("");
    }

    if (tab) {
        lines.push("## 5. Tab 切换样本");
        lines.push("");
        lines.push("| Tab | 原始样本(ms) | 无效 | P50 | P95 | min | max | mean | 结论 |");
        lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
        for (const id of TABS) {
            const group = tab.groups[id];
            const raw = group.validValues.length ? group.validValues.join(", ") : "—";
            const s = group.stats;
            lines.push(`| ${group.label} | ${raw} | ${group.invalid} | ${s ? s.p50 : "—"} | ${s ? s.p95 : "—"} | ${s ? Math.round(s.min) : "—"} | ${s ? Math.round(s.max) : "—"} | ${s ? s.mean : "—"} | ${group.verdict} |`);
        }
        const c = tab.combined;
        if (c) {
            lines.push(`| 合并 | ${c.n} 个有效 | ${TABS.reduce((sum, id) => sum + tab.groups[id].invalid, 0)} | ${c.p50} | ${c.p95} | ${Math.round(c.min)} | ${Math.round(c.max)} | ${c.mean} | — |`);
        }
        if (tab.failures && tab.failures.length) {
            lines.push("");
            lines.push(`注入失败记录：${tab.failures.map((row) => `${row.id}(${row.reason})`).join("、")}`);
        }
        lines.push("");
    } else {
        lines.push("## 5. Tab 切换样本");
        lines.push("");
        lines.push("未执行：没有连接到测试设备，或测量在完成前中止。不写入推测数据。");
        lines.push("");
    }

    lines.push("## 6. 结论");
    lines.push("");
    lines.push(`总体结论：**${status}**`);
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
            lines.push(`- Tab 切换：FAIL（超门槛：${failed.map((id) => TAB_LABELS[id]).join("、")}）`);
        } else if (notRun.length) {
            lines.push(`- Tab 切换：NOT_RUN（样本不足：${notRun.map((id) => TAB_LABELS[id]).join("、")}）`);
        } else {
            lines.push(`- Tab 切换：PASS（各分组 P95 ≤ ${THRESHOLD_TAB_MS}ms）`);
        }
    } else {
        lines.push("- Tab 切换：未测");
    }
    lines.push("");
    lines.push("## 7. 未验证项与限制");
    lines.push("");
    lines.push("- 冷启动 `cold` 是 `TotalTime + load` 的保守上界，不是端到端触控可操作时刻；入口 `MainActivity` 会立即跳转 `AsrActivity`，TotalTime 只覆盖入口活动。");
    lines.push("- 页面 `DOMContentLoaded` / `load` 取自 navigation timing；WebView 恢复页面可能出现计时缺失，缺失样本记为无效。");
    lines.push("- Tab 切换以两次 rAF 代表下一帧提交；未覆盖点击后异步数据加载（如海南私有地点的 setTimeout 补渲染）。");
    lines.push("- 测量期间要求手机解锁、亮屏、应用在前台；否则 rAF 不触发，样本记为无效。");
    lines.push("- 系统后台负载、缓存状态、电池策略会影响绝对数值；本报告只代表当次运行环境。");
    lines.push("- 未覆盖 TTS、录音、网络请求等重负载路径。");
    if (notes && notes.length) {
        for (const note of notes) lines.push(`- ${note}`);
    }
    lines.push("");
    return lines.join("\n");
}

function dryRun(options) {
    console.log("ALW-001 V1.7 性能测量 · 干跑检查\n");
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
        new Function(buildTabExpression(options.tabSamples, options.tabGapMs));
        new Function(PAGE_PROBE);
        console.log("- 注入脚本语法：✓");
    } catch (err) {
        console.log(`- 注入脚本语法：✗ ${err.message}`);
        return 2;
    }
    console.log("");
    console.log("采样计划：");
    console.log(`  · 冷启动 ${options.skipCold ? "跳过" : `${options.coldSamples} 次（force-stop + am start -W + CDP navigation timing）`}`);
    console.log(`  · Tab 切换 ${options.skipTab ? "跳过" : `${TABS.length} 个 × ${options.tabSamples} 次（${TABS.map((id) => TAB_LABELS[id]).join(" / ")}）`}`);
    console.log("");
    console.log("门槛：");
    console.log(`  · 首个可操作页面 ≤ ${THRESHOLD_COLD_MS}ms（P95）`);
    console.log(`  · Tab 切换 ≤ ${THRESHOLD_TAB_MS}ms（各分组 P95）`);
    console.log("");
    console.log("正式运行命令：");
    console.log(`  SM_SERIAL=<设备序列号> node scripts/v17-perf.mjs --out ${path.relative(ROOT, options.out) || options.out}`);
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
        log,
    };

    const serialCheck = resolveSerial(options.serial);
    if (!serialCheck.ok) {
        notRunReason = serialCheck.reason;
        log(`NOT_RUN：${notRunReason}`);
    } else {
        log(`设备已连接，开始测量（包名 ${options.package}）`);
        try {
            device = collectDeviceInfo(options.serial, options.package);
            log(`设备：${device.label} / Android ${device.android || "?"} / 应用 ${device.appVersion || "?"}`);
        } catch (err) {
            notes.push(`设备信息采集失败：${err.message}`);
        }

        try {
            if (!options.skipCold) {
                const samples = await runColdStart(ctx);
                const valid = samples.filter((row) => row.valid);
                cold = {
                    samples,
                    stats: summarize(valid.map((row) => row.coldMs)),
                    verdict: verdictOf(summarize(valid.map((row) => row.coldMs)), options.coldSamples, THRESHOLD_COLD_MS),
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

        try {
            webview = await readWebviewVersion(options.serial, options.port, options.cdpTimeoutMs);
        } catch {
            webview = null;
        }

        cleanupForward(options.serial, options.port);
    }

    if (!notRunReason) {
        if (!cold && !tab) {
            notRunReason = "冷启动与 Tab 均未执行";
        } else if (!cold && !options.skipCold) {
            notRunReason = "冷启动无有效样本";
        } else if (cold && cold.verdict === "NOT_RUN") {
            notRunReason = `冷启动有效样本不足（需要 ${options.coldSamples} 次）`;
        } else if (tab && tab.verdict === "NOT_RUN") {
            notRunReason = "Tab 切换存在样本不足的分组";
        }
    }

    const parts = [];
    if (!options.skipCold) parts.push(cold ? cold.verdict : "NOT_RUN");
    if (!options.skipTab) parts.push(tab ? tab.verdict : "NOT_RUN");
    if (!parts.length) parts.push("NOT_RUN");
    status = notRunReason ? (parts.includes("FAIL") ? "FAIL" : "NOT_RUN") : overallVerdict(parts);

    const payload = {
        generatedAt,
        options,
        device,
        webview,
        cold,
        tab,
        status,
        notRunReason,
        notes,
        durationSec: Math.round((Date.now() - started) / 100) / 10,
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