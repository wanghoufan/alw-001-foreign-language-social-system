#!/usr/bin/env node
/**
 * T10 真机 DOM 测量（ALW-001 V1.5.2 Chat Compact Layout）。
 *
 * 通过 adb forward 把手机 WebView 的 devtools 端口映射到本机，复用 scripts/sm-cdp.mjs
 * 在真实页面里取布局数据；只连 127.0.0.1，不写密钥，不操作其他设备。
 *
 * 用法：
 *   node t10-measure.mjs --serial <serial>
 *   SM_SERIAL=<serial> node t10-measure.mjs --action open-share
 *   node t10-measure.mjs --serial <serial> --action open-origin
 *   node t10-measure.mjs --serial <serial> --action back
 *   node t10-measure.mjs --serial <serial> --action stop
 *
 * 参数：
 *   --serial   设备序列号（必填，也可用环境变量 SM_SERIAL）
 *   --pkg      Android 包名，默认 app.socialmate.dualmic
 *   --port     本机 CDP 端口，默认 9229（避开现有 9223）
 *   --action   measure（默认）| open-share | open-origin | back | stop
 *   --out      结果文件路径，默认脚本目录下 t10-measure-result.json
 *   --help     显示帮助
 */

import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PKG = "app.socialmate.dualmic";
const DEFAULT_PORT = 9229;
const DEFAULT_OUT = path.join(SCRIPT_DIR, "t10-measure-result.json");
const ACTIONS = new Set(["measure", "open-share", "open-origin", "back", "stop"]);

function parseArgs(argv) {
    const out = {
        serial: process.env.SM_SERIAL || "",
        pkg: DEFAULT_PKG,
        port: DEFAULT_PORT,
        action: "measure",
        out: DEFAULT_OUT,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        if (item === "--serial") out.serial = argv[++i] || "";
        else if (item === "--pkg") out.pkg = argv[++i] || DEFAULT_PKG;
        else if (item === "--port") out.port = Number(argv[++i]) || DEFAULT_PORT;
        else if (item === "--action") out.action = argv[++i] || "measure";
        else if (item === "--out") out.out = argv[++i] || DEFAULT_OUT;
        else if (item === "--help" || item === "-h") out.help = true;
        else throw new Error("未知参数：" + item);
    }
    return out;
}

function help() {
    return [
        "T10 真机 DOM 测量",
        "",
        "  node t10-measure.mjs --serial <serial> [--action measure|open-share|open-origin|back|stop]",
        "  SM_SERIAL=<serial> node t10-measure.mjs",
        "",
        "  --pkg     默认 app.socialmate.dualmic",
        "  --port    默认 9229（只连 127.0.0.1）",
        "  --out     默认脚本目录下 t10-measure-result.json",
        "",
        "只读测量；--action 只在页面内做一次点击/返回，不写业务数据。",
    ].join("\n");
}

function adb(serial, args) {
    try {
        return execFileSync("adb", ["-s", serial, ...args], {
            encoding: "utf8",
            timeout: 20000,
            stdio: ["ignore", "pipe", "pipe"],
        }).trim();
    } catch (err) {
        const detail = String(err.stderr || err.stdout || err.message || err).trim();
        throw new Error("adb " + args.join(" ") + " 失败：" + detail);
    }
}

function findCdpScript(startDir) {
    let dir = startDir;
    for (let i = 0; i < 10; i += 1) {
        const candidate = path.join(dir, "scripts", "sm-cdp.mjs");
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return "";
}

function parseJsonOutput(text, label) {
    const trimmed = String(text || "").trim();
    if (!trimmed) throw new Error(label + " 无输出");
    try {
        return JSON.parse(trimmed);
    } catch {
        const first = trimmed.indexOf("{");
        const last = trimmed.lastIndexOf("}");
        if (first >= 0 && last > first) {
            try {
                return JSON.parse(trimmed.slice(first, last + 1));
            } catch {
                // 落到下面的统一报错
            }
        }
        throw new Error(label + " 输出不是 JSON：" + trimmed.slice(0, 300));
    }
}

function runCdp(cdpScript, port, expression) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "t10-measure-"));
    const exprFile = path.join(tmpDir, "expr.js");
    fs.writeFileSync(exprFile, expression, "utf8");
    try {
        const stdout = execFileSync(
            process.execPath,
            [cdpScript, "--port", String(port), "--file", exprFile],
            {encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "pipe"]}
        );
        return parseJsonOutput(stdout, "CDP");
    } catch (err) {
        const detail = String(err.stderr || err.stdout || err.message || err).trim();
        throw new Error("CDP 执行失败：" + detail);
    } finally {
        fs.rmSync(tmpDir, {recursive: true, force: true});
    }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MEASURE_EXPR = String.raw`
(async () => {
  const first = (sels) => {
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };
  const firstAll = (sels) => {
    for (const sel of sels) {
      try {
        const list = document.querySelectorAll(sel);
        if (list.length) return Array.from(list);
      } catch (e) {}
    }
    return [];
  };
  const styleVisible = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
  };
  const onScreen = (el) => {
    if (!el || !styleVisible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const heightOf = (el) => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
  const round3 = (n) => (typeof n === 'number' && isFinite(n) ? Number(n.toFixed(3)) : null);

  const state = (typeof S !== 'undefined' && S) ? S : (window.S || null);

  const top = first(['.top']);
  const tab = first(['.mobilebar']);
  const barRoot = first(['#v152bar', '.v152bar', '#v151bar', '.v151bar', '[data-sm-bar]']);
  const subs = first(['#v152subs', '.v152subs', '#messages', '.conversation']);
  const coach = first(['#v152coach', '.v152coach', '#suggestionArea', '.suggestionpanel']);
  const cards = firstAll(['.v152card', '.suggcard', '[data-sugg]']);

  const immersiveByClass = !!(document.body && document.body.classList.contains('sm-immersive'))
    || !!(document.documentElement && document.documentElement.classList.contains('sm-immersive'));
  const immersiveByState = !!(state && state.immersive === true);
  const immersive = immersiveByClass || immersiveByState;

  let barCount = null;
  if (barRoot) barCount = barRoot.querySelectorAll('button, select').length;

  const subsHeight = heightOf(subs);
  const coachHeight = heightOf(coach);
  const ratio = (typeof subsHeight === 'number' && typeof coachHeight === 'number' && coachHeight > 0)
    ? round3(subsHeight / coachHeight)
    : null;

  let firstScreenSuggestions = null;
  if (coach) {
    const coachRect = coach.getBoundingClientRect();
    firstScreenSuggestions = 0;
    for (const card of cards) {
      if (!onScreen(card)) continue;
      const r = card.getBoundingClientRect();
      if (r.bottom <= coachRect.bottom + 0.5 && r.top >= coachRect.top - 0.5) firstScreenSuggestions += 1;
    }
  }

  let speakCount = 0;
  let copyCount = 0;
  for (const card of cards) {
    speakCount += card.querySelectorAll('[data-sspeak]').length;
    copyCount += card.querySelectorAll('[data-scopy]').length;
  }

  const chineseRe = /[\u4e00-\u9fff]/;
  const stripUi = (text) => String(text || '')
    .replace(/中文|收起|翻译|☆|★/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const samples = [];
  const pushSample = (el) => {
    if (samples.length >= 5 || !el || !onScreen(el)) return;
    const text = stripUi(el.innerText);
    if (!text || !chineseRe.test(text)) return;
    const cut = text.slice(0, 80);
    if (!samples.includes(cut)) samples.push(cut);
  };
  if (subs) {
    let messageEls = Array.from(subs.querySelectorAll('.bubble, .v152msg, .msgtext, .chatline, .turn'));
    if (!messageEls.length) {
      messageEls = Array.from(subs.querySelectorAll('*')).filter((el) => el.children.length === 0);
    }
    for (const el of messageEls) pushSample(el);
  }
  for (const card of cards) {
    const textEl = card.querySelector('.suggtext, .v152cardtext, [data-sm-card-text]');
    pushSample(textEl || card);
  }

  const chipRoot = first(['#v152chips', '.v152chips', '[data-sm-chips]']);
  let chipEls = firstAll(['.v152chip', '[data-sm-chip]']);
  if (!chipEls.length && chipRoot) {
    chipEls = Array.from(chipRoot.querySelectorAll('.chip, .n05chip, button, [role="button"]'));
  }
  const chipCount = chipEls.length;

  const titleEls = Array.from(document.querySelectorAll('.paneltitle, .v152chiptitle, .chiptitle, [data-sm-chips-title]'));
  const titleStill = titleEls.some((el) => onScreen(el) && /关联资料/.test(el.innerText || ''));
  const kindEl = first(['.v152chipkind', '.chipkind', '[data-sm-chip-kind]']);
  const kindStill = (kindEl && onScreen(kindEl))
    || chipEls.some((el) => !!el.querySelector('.v152chipkind, .chipkind, .kind, .cat, .tag'))
    || chipEls.some((el) => /^(地点|关于我|人物|软件)[·:：]/.test(String(el.innerText || '').trim()));

  const shareEl = first(['#v152share', '.v152share', '[data-sm-share]', '.sharecard']);
  const originEl = first(['#v152origin', '.v152origin', '[data-sm-origin-view]']);

  const fromState = (value) => {
    if (!value) return null;
    const candidates = [
      value.asr && value.asr.activeSessions,
      value.activeSessions,
      value.asrStatus && value.asrStatus.activeSessions,
      value.health && value.health.activeSessions,
      value.asr && value.asr.active_sessions,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && isFinite(candidate)) return candidate;
    }
    return null;
  };

  let activeSessions = fromState(state);
  let activeSessionsSource = activeSessions === null ? null : 'window.S';
  if (activeSessions === null) {
    try {
      const res = await fetch('/v12/health', {cache: 'no-store'});
      if (res.ok) {
        const data = await res.json();
        const candidates = [
          data.activeSessions,
          data.active_sessions,
          data.asr && data.asr.activeSessions,
          data.asr && data.asr.active_sessions,
          data.sessions,
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'number' && isFinite(candidate)) {
            activeSessions = candidate;
            activeSessionsSource = '/v12/health';
            break;
          }
        }
      }
    } catch (e) {}
  }

  return {
    page: {href: location.href, title: document.title},
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    immersive: immersive,
    immersiveDetail: {classList: immersiveByClass, state: immersiveByState},
    topVisible: styleVisible(top),
    tabVisible: styleVisible(tab),
    barCount: barCount,
    subsHeight: subsHeight,
    coachHeight: coachHeight,
    ratio: ratio,
    firstScreenSuggestions: firstScreenSuggestions,
    suggestCards: cards.length,
    hasSpeakOrCopyButtons: speakCount + copyCount > 0,
    speakOrCopyDetail: {speak: speakCount, copy: copyCount},
    visibleChineseSamples: samples,
    chipCount: chipCount,
    chipHasTitleOrKind: titleStill || kindStill,
    chipTitleOrKindDetail: {title: titleStill, kind: kindStill},
    shareOpen: onScreen(shareEl),
    originView: onScreen(originEl) || !!(state && state.view === 'origin'),
    activeSessions: activeSessions,
    activeSessionsSource: activeSessionsSource,
    measuredAt: new Date().toISOString(),
  };
})()
`;

const ACTION_EXPR = {
    "open-share": String.raw`
(async () => {
  const first = (sels) => {
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };
  const chip = first(['.v152chip', '[data-sm-chip]', '#v152chips .chip', '.v152chips .chip', '.n05chip']);
  if (!chip) return {ok: false, reason: 'chip-not-found'};
  chip.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {ok: true, called: 'chip.click', text: String(chip.innerText || '').trim().slice(0, 60)};
})()
`,
    "open-origin": String.raw`
(async () => {
  const first = (sels) => {
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };
  const scope = first(['#v152share', '.v152share', '[data-sm-share]', '.sharecard']) || document;
  let target = null;
  for (const sel of ['[data-sm-origin]', '#v152originBtn', '[data-act="origin"]']) {
    try {
      const el = scope.querySelector(sel);
      if (el) { target = el; break; }
    } catch (e) {}
  }
  if (!target) {
    target = Array.from(scope.querySelectorAll('button, a, [role="button"]'))
      .find((el) => /原资料/.test(String(el.innerText || '')));
  }
  if (!target) return {ok: false, reason: 'origin-button-not-found'};
  target.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {ok: true, called: 'origin-button.click', text: String(target.innerText || '').trim().slice(0, 60)};
})()
`,
    back: String.raw`
(async () => {
  if (typeof window.smExitImmersive === 'function') {
    window.smExitImmersive();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {ok: true, called: 'smExitImmersive'};
  }
  if (typeof window.smBack === 'function') {
    window.smBack();
    await new Promise((resolve) => setTimeout(resolve, 250));
    return {ok: true, called: 'smBack'};
  }
  window.history.back();
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {ok: true, called: 'history.back'};
})()
`,
    stop: String.raw`
(async () => {
  const first = (sels) => {
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };
  let target = first(['[data-sm-stop]', '#v152stop', '[data-act="stop"]']);
  if (!target) {
    target = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find((el) => /停止/.test(String(el.innerText || '')));
  }
  if (!target) return {ok: false, reason: 'stop-button-not-found'};
  target.click();
  await new Promise((resolve) => setTimeout(resolve, 250));
  return {ok: true, called: 'stop-button.click', text: String(target.innerText || '').trim().slice(0, 60)};
})()
`,
};

function printFlat(value, prefix = "") {
    if (value === null || value === undefined) {
        console.log(prefix + ": " + String(value));
        return;
    }
    if (typeof value !== "object") {
        console.log(prefix + ": " + String(value));
        return;
    }
    if (Array.isArray(value)) {
        console.log(prefix + ": " + JSON.stringify(value));
        return;
    }
    for (const [key, item] of Object.entries(value)) {
        printFlat(item, prefix ? prefix + "." + key : key);
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(help());
        return;
    }
    if (!args.serial) {
        throw new Error("缺少设备序列号：请用 --serial <serial> 或环境变量 SM_SERIAL 指定");
    }
    if (!ACTIONS.has(args.action)) {
        throw new Error("不支持的 --action：" + args.action + "（可选 measure|open-share|open-origin|back|stop）");
    }
    const cdpScript = findCdpScript(SCRIPT_DIR);
    if (!cdpScript) throw new Error("找不到 scripts/sm-cdp.mjs");

    const pid = adb(args.serial, ["shell", "pidof", args.pkg]).split(/\s+/).filter(Boolean)[0];
    if (!pid) throw new Error("找不到进程 " + args.pkg + "：请先在手机上打开 SocialMate");

    let forwarded = false;
    try {
        adb(args.serial, ["forward", "tcp:" + args.port, "localabstract:webview_devtools_remote_" + pid]);
        forwarded = true;
        await wait(500);

        let actionResult = null;
        if (args.action !== "measure") {
            actionResult = runCdp(cdpScript, args.port, ACTION_EXPR[args.action]);
            await wait(600);
        }

        const measurement = runCdp(cdpScript, args.port, MEASURE_EXPR);
        const record = {
            ts: new Date().toISOString(),
            action: args.action,
            targetPackage: args.pkg,
            cdpPort: args.port,
            actionResult: actionResult,
            measurement: measurement,
        };
        fs.writeFileSync(args.out, JSON.stringify(record, null, 2) + "\n", "utf8");

        console.log("[t10-measure] result: " + args.out);
        console.log("[t10-measure] action: " + args.action);
        printFlat(record.measurement);
        if (actionResult) {
            console.log("[t10-measure] actionResult:");
            printFlat(actionResult);
        }
    } finally {
        if (forwarded) {
            try {
                adb(args.serial, ["forward", "--remove", "tcp:" + args.port]);
            } catch (err) {
                console.error("清理 forward 失败：" + err.message);
            }
        }
    }
}

main().catch((err) => {
    console.error("失败：" + (err.message || err));
    process.exit(1);
});