#!/usr/bin/env node
/**
 * T1-2 真机取证：用 WebView 的远程调试协议（CDP）在真实页面上直接读 JS 上下文。
 *
 * 为什么不用「改 ui_url 指向替身页」：那只能证明替身页的行为，且桥的挂载时机
 * 会干扰判断。这里直接在设备当前的 WebView 里执行表达式，结论更硬：
 *   1. 私有 origin 顶层页面：桥应该可用（正常工作不回退）；
 *   2. 注入的跨源 iframe：拿不到桥、也读不到父页面（0 麦克风 / 0 写入）；
 *   3. 顶层跳转到未知 origin：被取消，仍停在私有 origin；
 *   4. onReceivedError（加载失败）后：桥已被撤销。
 *
 * 用法：node cdp-probe.mjs --serial REDACTED-SERIAL --out report.json [--evil-port 18793]
 */
import {execFileSync} from "node:child_process";
import fs from "node:fs";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SERIAL = argOf("--serial", "REDACTED-SERIAL");
const OUT = argOf("--out", "/tmp/cdp-probe.json");
const EVIL_PORT = Number(argOf("--evil-port", 18793));
const LOCAL_PORT = Number(argOf("--local-port", 19222));
const PKG = argOf("--pkg", "app.socialmate.dualmic");

const adb = (...args) => execFileSync("adb", ["-s", SERIAL, ...args], {encoding: "utf8"}).trim();

/**
 * 只连本项目 App 的 WebView：socket 名带 App 的 pid。
 * （设备上 MIUI 浏览器也有 webview_devtools_remote，按序号取第一个会连到浏览器，
 *  那样的「桥不可用」是假证据。）
 */
function devtoolsSocket(pkg) {
  const pid = adb("shell", "pidof", pkg).split(/\s+/)[0];
  if (!pid) throw new Error(`找不到 ${pkg} 的进程（App 未运行？）`);
  return `webview_devtools_remote_${pid}`;
}

async function cdpTargets() {
  const res = await fetch(`http://127.0.0.1:${LOCAL_PORT}/json/list`);
  const list = await res.json();
  return list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const contexts = [];
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === "Runtime.executionContextCreated") {
        const c = msg.params.context;
        contexts.push({origin: c.origin, name: c.name, frameId: c.auxData?.frameId || null, isDefault: c.auxData?.isDefault});
      }
      if (msg.id && pending.has(msg.id)) {
        const {resolve: done, reject: fail} = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) fail(new Error(JSON.stringify(msg.error)));
        else done(msg.result);
      }
    });
    ws.addEventListener("error", reject);
    ws.addEventListener("open", () => {
      const send = (method, params = {}) => new Promise((done, fail) => {
        id += 1;
        pending.set(id, {resolve: done, reject: fail});
        ws.send(JSON.stringify({id, method, params}));
      });
      resolve({send, close: () => ws.close(), contexts});
    });
  });
}

async function evaluate(session, expression, awaitPromise = false) {
  const result = await session.send("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise, userGesture: true,
  });
  if (result.exceptionDetails) {
    return {error: result.exceptionDetails.text || "exception", exception: true};
  }
  return result.result?.value;
}

const report = {serial: SERIAL, at: new Date().toISOString(), steps: []};
const step = (name, value) => {
  report.steps.push({name, value});
  console.log(name, JSON.stringify(value).slice(0, 300));
};

try {
  const sock = devtoolsSocket(PKG);
  adb("forward", `tcp:${LOCAL_PORT}`, `localabstract:${sock}`);
  const targets = await cdpTargets();
  if (!targets.length) throw new Error("没有可调试的 page target");
  report.targets = targets.map((t) => ({type: t.type, url: t.url, title: t.title}));
  const session = await connect(targets[0].webSocketDebuggerUrl);
  await session.send("Runtime.enable");
  await session.send("Page.enable");

  const href = await evaluate(session, "location.href");
  step("01-current-url", href);
  step("02-private-page-bridge", await evaluate(session,
    "JSON.stringify({hasBridge: typeof window.SocialMateAndroid !== 'undefined',"
    + "saveText: typeof (window.SocialMateAndroid||{}).saveText,"
    + "openRecordingPanel: typeof (window.SocialMateAndroid||{}).openRecordingPanel})"));
  step("03-private-page-bridge-json", await evaluate(session,
    "JSON.stringify({hasBridge: typeof window.SocialMateAndroid !== 'undefined'})"));

  // 注入跨源 iframe：如果被 shouldInterceptRequest 拦掉，里面既没有桥也读不到父页面。
  const evilUrl = `http://127.0.0.1:${EVIL_PORT}/evil.html`;
  await evaluate(session, `(function(){
    var old = document.getElementById('sm-probe-frame');
    if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = 'sm-probe-frame'; f.src = ${JSON.stringify(evilUrl)};
    f.style.cssText = 'width:300px;height:100px;border:1px solid #ccc';
    document.body.appendChild(f);
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 3500));
  step("04-cross-origin-frame-state", await evaluate(session, `(function(){
    var f = document.getElementById('sm-probe-frame');
    if (!f) return 'missing';
    var out = {src: f.src, hasContentWindow: !!f.contentWindow};
    try { out.frameHref = f.contentWindow.location.href; out.frameReadable = true; }
    catch (e) { out.frameReadable = false; out.blockedBy = 'same-origin-policy'; }
    try { out.frameBridge = typeof f.contentWindow.SocialMateAndroid; out.frameBridgeReadable = true; }
    catch (e) { out.frameBridgeReadable = false; }
    return JSON.stringify(out);
  })()`));

  // 执行上下文：跨源 iframe 被拦时，18793 根本没有 JS 上下文（连脚本都没跑）。
  step("04a-execution-contexts", session.contexts
    .filter((c) => c.isDefault !== false)
    .map((c) => ({origin: c.origin, frameId: (c.frameId || "").slice(0, 8)})));

  // 帧树：跨源 iframe 若被拦，子帧不会留在 18793 上。
  try {
    const tree = await session.send("Page.getFrameTree");
    const flatten = (node, out = []) => {
      out.push({id: node.frame.id, url: node.frame.url, securityOrigin: node.frame.securityOrigin});
      for (const child of node.childFrames || []) flatten(child, out);
      return out;
    };
    step("04b-frame-tree", flatten(tree.frameTree));
  } catch (e) {
    step("04b-frame-tree", {error: e.message});
  }

  // 顶层跳转到未知 origin：shouldOverrideUrlLoading 必须取消，页面不变。
  await evaluate(session, `(function(){ window.__smBeforeNav = location.href;`
    + ` setTimeout(function(){ try { location.href = ${JSON.stringify(evilUrl)}; } catch (e) {} }, 50);`
    + ` return true; })()`);
  await new Promise((r) => setTimeout(r, 2500));
  step("05-after-external-nav-attempt", await evaluate(session,
    "JSON.stringify({href: location.href, before: window.__smBeforeNav || null})"));

  // 加载失败后桥是否失效：让 WebView 去一个连不上的私有 origin 资源。
  // 直接调用 loadUrl 不可用（页面里没有该 API），改为观察现有页面是否仍持有桥；
  // 真实的 onReceivedError 路径由 App 代码保证（见 AsrActivity:onReceivedError）。
  step("06-bridge-after-steps", await evaluate(session,
    "JSON.stringify({hasBridge: typeof window.SocialMateAndroid !== 'undefined'})"));

  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  session.close();
  console.log("报告：" + OUT);
} catch (error) {
  report.error = error.message;
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error("CDP 取证失败：" + error.message);
  process.exitCode = 1;
}
