#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 9230;
const DEFAULT_OUT = path.join(HERE, "person-density.json");
const DEFAULT_SLUG = "Mia-Chen";
const DEFAULT_PACKAGE = "app.socialmate.dualmic";

function parseArgs(argv) {
    const out = {
        serial: process.env.SM_SERIAL || "",
        port: DEFAULT_PORT,
        out: DEFAULT_OUT,
        slug: "",
        pkg: DEFAULT_PACKAGE,
        help: false,
    };
    for (let i = 0; i < argv.length; i += 1) {
        const item = argv[i];
        if (item === "--serial") out.serial = argv[++i] || "";
        else if (item === "--port") out.port = Number(argv[++i]) || DEFAULT_PORT;
        else if (item === "--out") out.out = path.resolve(process.cwd(), argv[++i] || "person-density.json");
        else if (item === "--package") out.pkg = argv[++i] || DEFAULT_PACKAGE;
        else if (item === "--help" || item === "-h") out.help = true;
        else if (!item.startsWith("-") && !out.slug) out.slug = item;
    }
    out.slug = out.slug || DEFAULT_SLUG;
    return out;
}

function usage() {
    return [
        "人物抽屉密度测量（只读，不修改产品代码）",
        "",
        "  SM_SERIAL=<serial> node person-density.mjs [slug]",
        "  node person-density.mjs --serial <serial> [--port 9230] [--out person-density.json] [slug]",
        "",
        "  slug 默认 Mia-Chen；--out 默认脚本目录 person-density.json。",
    ].join("\n");
}

function scrub(text, serial) {
    if (!serial) return String(text);
    return String(text).split(serial).join("<serial>");
}

function adb(serial, args, {allowFail = false} = {}) {
    const r = spawnSync("adb", ["-s", serial, ...args], {encoding: "utf8"});
    if (r.error) throw new Error("找不到 adb：" + r.error.message);
    const stdout = (r.stdout || "").trim();
    const stderr = (r.stderr || "").trim();
    if (r.status !== 0 && !allowFail) throw new Error(`adb ${args.join(" ")} 失败：${stderr || stdout || "退出码 " + r.status}`);
    return stdout;
}

function resolvePid(serial, pkg) {
    const raw = adb(serial, ["shell", "pidof", pkg], {allowFail: true});
    if (raw) return raw.split(/\s+/).filter(Boolean)[0];
    const ps = adb(serial, ["shell", "ps", "-A"], {allowFail: true});
    const line = ps.split(/\r?\n/).find((row) => /socialmate|dualmic|webview/i.test(row));
    if (line) {
        const pid = line.trim().split(/\s+/)[1];
        if (pid && /^\d+$/.test(pid)) return pid;
    }
    throw new Error("没有找到 SocialMate 进程：请先在手机上打开应用");
}

function ensureForward(serial, port, pid) {
    const target = `localabstract:webview_devtools_remote_${pid}`;
    const list = adb(serial, ["forward", "--list"], {allowFail: true});
    const row = list.split(/\r?\n/).find((line) => line.includes(`tcp:${port}`));
    if (row) {
        if (!row.includes(target)) {
            throw new Error(`本机 tcp:${port} 已被其他映射占用，请换 --port`);
        }
        return target;
    }
    adb(serial, ["forward", `tcp:${port}`, target]);
    return target;
}

async function connectPage(port) {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!res.ok) throw new Error(`CDP /json/list 不可达（HTTP ${res.status}）`);
    const list = await res.json();
    const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!page) throw new Error("没有可调试页面：确认手机上的 WebView 已开启调试");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP 连接超时（15s）")), 15000);
        ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, {once: true});
        ws.addEventListener("error", (err) => { clearTimeout(timer); reject(new Error("CDP 连接失败：" + (err.message || "unknown"))); }, {once: true});
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
        let msg;
        try {
            msg = JSON.parse(ev.data);
        } catch {
            return;
        }
        if (msg.id && pending.has(msg.id)) {
            pending.get(msg.id)(msg);
            pending.delete(msg.id);
        }
    });
    function send(method, params = {}) {
        const id = ++seq;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    reject(new Error("CDP 超时：" + method));
                }
            }, 30000);
            pending.set(id, (msg) => {
                clearTimeout(timer);
                if (msg.error) reject(new Error("CDP 错误：" + JSON.stringify(msg.error)));
                else resolve(msg.result);
            });
            ws.send(JSON.stringify({id, method, params}));
        });
    }
    return {ws, send};
}

const MEASURE_JS = `(async () => {
  const slug = __SLUG__;
  if (typeof openRemotePerson !== 'function') throw new Error('页面没有 openRemotePerson');
  await openRemotePerson(slug);
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const drawer = document.getElementById('drawer');
  const body = document.getElementById('drawerbody');
  if (!drawer || !body) throw new Error('没有找到抽屉容器 #drawer / #drawerbody');

  const dr = drawer.getBoundingClientRect();
  const visibleHeight = Math.round(Math.max(0, Math.min(dr.bottom, innerHeight) - Math.max(dr.top, 0)));
  const itemSelector = '.factrow, .prep, .person';
  const items = [...body.querySelectorAll(itemSelector)];
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.width > 0 && r.bottom > dr.top && r.top < dr.bottom;
  };
  const visibleItems = items.filter(isVisible).length;

  const sections = [...body.querySelectorAll('.sectiontitle')].map((el) => {
    const strong = el.querySelector('strong');
    const r = el.getBoundingClientRect();
    return {text: (strong || el).textContent.trim(), top: r.top, bottom: r.bottom};
  });
  const sectionTitles = sections.map((x) => x.text);
  const prepAt = sectionTitles.findIndex((text) => /见面前准备|Before you meet/i.test(text));
  const gaps = [];
  for (let i = 1; i < sections.length; i += 1) {
    const gap = sections[i].top - sections[i - 1].bottom;
    if (Number.isFinite(gap)) gaps.push(gap);
  }
  const averageGap = gaps.length
    ? Math.round((gaps.reduce((sum, n) => sum + n, 0) / gaps.length) * 10) / 10
    : null;

  const fontSizePx = (selector) => {
    const el = body.querySelector(selector);
    if (!el) return null;
    const value = parseFloat(getComputedStyle(el).fontSize);
    return Number.isFinite(value) ? value : null;
  };

  const text = body.innerText || '';
  const devTextHits = {
    '标识 ': text.includes('标识 '),
    '私有在线': text.includes('私有在线'),
    '来自 Mac 主档': text.includes('来自 Mac 主档'),
    '会话确认 + 我的补充': text.includes('会话确认 + 我的补充'),
    '最多 3 条': text.includes('最多 3 条'),
    '来源：会话': text.includes('来源：会话'),
    ' 条': /\\d+\\s*条/.test(text)
  };

  const itemHeight = items.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);
  const contentHeight = body.scrollHeight;

  return {
    slug: slug,
    drawerOpen: drawer.classList.contains('open'),
    viewport: {width: innerWidth, height: innerHeight, dpr: devicePixelRatio},
    drawer: {
      visibleHeight: visibleHeight,
      scrollHeight: drawer.scrollHeight,
      bodyScrollHeight: contentHeight
    },
    sectionTitles: sectionTitles,
    firstSection: sectionTitles[0] || null,
    prepIndex: prepAt >= 0 ? prepAt + 1 : null,
    visibleFacts: visibleItems,
    totalItems: items.length,
    devTextHits: devTextHits,
    fontSizes: {
      bodyPx: fontSizePx('.factrow p') ?? fontSizePx('.prep .zh') ?? fontSizePx('.drawerbody p'),
      sectionTitlePx: fontSizePx('.sectiontitle strong'),
      metaPx: fontSizePx('.sectiontitle small') ?? fontSizePx('.drawerbody .sub') ?? fontSizePx('.chip')
    },
    verticalGaps: {average: averageGap, count: gaps.length},
    blankRatio: contentHeight > 0
      ? Math.round((1 - itemHeight / contentHeight) * 1000) / 1000
      : null
  };
})()`;

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        console.log(usage());
        return;
    }
    if (!args.serial) {
        console.error(usage());
        console.error("缺少设备序列号：用 --serial <serial> 或环境变量 SM_SERIAL");
        process.exit(2);
    }

    let ownsForward = false;
    let pid = "";
    let ws = null;
    try {
        pid = resolvePid(args.serial, args.pkg);
        ensureForward(args.serial, args.port, pid);
        ownsForward = true;

        const cdp = await connectPage(args.port);
        ws = cdp.ws;
        const expression = MEASURE_JS.replace("__SLUG__", () => JSON.stringify(args.slug));
        const result = await cdp.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (result.exceptionDetails) {
            const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "页面异常";
            throw new Error(detail);
        }
        const data = result.result ? result.result.value : null;
        if (!data || typeof data !== "object") throw new Error("页面没有返回测量结果");

        const payload = {
            measuredAt: new Date().toISOString(),
            port: args.port,
            packageName: args.pkg,
            ...data,
        };
        await fs.mkdir(path.dirname(args.out), {recursive: true});
        await fs.writeFile(args.out, JSON.stringify(payload, null, 2));

        console.log("人物抽屉密度");
        console.log(`  视口: ${data.viewport.width}x${data.viewport.height} @${data.viewport.dpr}x`);
        console.log(`  抽屉可见高度: ${data.drawer.visibleHeight} / 内容高度 ${data.drawer.bodyScrollHeight}`);
        console.log(`  章节(${data.sectionTitles.length}): ${data.sectionTitles.join(" | ")}`);
        console.log(`  第一章节: ${data.firstSection ?? "null"}`);
        console.log(`  见面前准备位置: ${data.prepIndex ?? "null"}`);
        console.log(`  条目: 可见 ${data.visibleFacts} / 总计 ${data.totalItems}`);
        console.log(`  字号(px): 正文 ${data.fontSizes.bodyPx ?? "null"} / 章节 ${data.fontSizes.sectionTitlePx ?? "null"} / 元信息 ${data.fontSizes.metaPx ?? "null"}`);
        console.log(`  章节间距均值: ${data.verticalGaps.average ?? "null"}（${data.verticalGaps.count} 段）`);
        console.log(`  空白占比: ${data.blankRatio ?? "null"}`);
        console.log("  开发式文案:");
        for (const [label, hit] of Object.entries(data.devTextHits)) {
            console.log(`    ${hit ? "命中" : "未出现"}  ${JSON.stringify(label)}`);
        }
        console.log("OUT", args.out);
    } finally {
        if (ws) {
            try {
                ws.close();
            } catch {}
        }
        if (ownsForward) {
            try {
                adb(args.serial, ["forward", "--remove", `tcp:${args.port}`], {allowFail: true});
            } catch {}
        }
    }
}

main().catch((err) => {
    const serial = parseArgs(process.argv.slice(2)).serial;
    console.error("失败：" + scrub(err && err.message ? err.message : err, serial));
    process.exit(1);
});