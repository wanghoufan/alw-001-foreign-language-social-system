#!/usr/bin/env node
/**
 * T4 验收脚本：拔 USB 后安全外出使用 + Mac 自恢复。
 *
 * 分组断言：
 *   stack     —— 8790/8791/8781/8782 四端口统一健康检查；LaunchAgent 已加载。
 *   crash     —— 单个服务被 kill 后由看门狗自动拉起（不手工 heal）。
 *   reboot    —— 卸载/加载 LaunchAgent 模拟 Mac 重启后自恢复。
 *   gui       —— 图形界面一键恢复（.app 双击）可用，不需要终端。
 *   write     —— 服务不可用时「清空/恢复/上传」不显示成功，且磁盘数据不变。
 *   offline   —— 离线时 APP 显示只读缓存（3 人/9 段/54 句 + 本地原文），不白屏。
 *   recover   —— 恢复后重新在线，演示与真实数据哈希与基线一致（不混写）。
 *   tls       —— Tailscale 私有入口证书链有效（openssl 校验 + curl 不加 -k）。
 *   nousb     —— 无 adb reverse 状态下访问（手机侧 Tailscale 未授权 → NOT_RUN）。
 *
 * 用法：
 *   node verify-t4.mjs --qa <qa目录> --serial REDACTED-SERIAL --json <输出>
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
const HOST = argOf("--host", "mac-mini.tail4e4317.ts.net");
const PKG = "app.socialmate.dualmic";
const LABEL = "com.alw.socialmate-stack";
const JSON_OUT = argOf("--json", path.join(QA, "t4-report.json"));
const CA_FILE = "/private/etc/ssl/cert.pem";
const UID = execFileSync("id", ["-u"], {encoding: "utf8"}).trim();

fs.mkdirSync(QA, {recursive: true});
const runLog = [];
const checks = [];
const started = Date.now();

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function log(line) {
  runLog.push(line);
  console.log(line);
}

/** 统一执行入口：记录命令、退出码、输出，永不 throw。 */
function run(cmd, args, options = {}) {
  const startedAt = Date.now();
  try {
    const out = execFileSync(cmd, args, {
      encoding: options.encoding === undefined ? "utf8" : options.encoding,
      timeout: options.timeout || 60000,
      maxBuffer: 64 * 1024 * 1024,
      cwd: options.cwd || ROOT,
      env: process.env,
    });
    const record = {
      cmd: [cmd, ...args].join(" "),
      exit: 0,
      ms: Date.now() - startedAt,
      out: typeof out === "string" ? out.slice(0, options.maxOut || 200000) : `<${out.length} bytes>`,
    };
    runLog.push(JSON.stringify({cmd: record.cmd, exit: 0, ms: record.ms}));
    return record;
  } catch (error) {
    const stdout = error.stdout ? error.stdout.toString() : "";
    const stderr = error.stderr ? error.stderr.toString() : "";
    const record = {
      cmd: [cmd, ...args].join(" "),
      exit: typeof error.status === "number" ? error.status : 124,
      ms: Date.now() - startedAt,
      out: (stdout + stderr).slice(0, options.maxOut || 200000),
      error: error.message,
    };
    runLog.push(JSON.stringify({cmd: record.cmd, exit: record.exit, ms: record.ms}));
    return record;
  }
}

function check(group, id, ok, detail, status) {
  const state = status || (ok === true ? "PASS" : ok === null ? "NOT_RUN" : "FAIL");
  checks.push({group, id, status: state, ok: state === "PASS" && ok === true, detail: detail === undefined ? null : detail});
  log(`[${state}] ${group}/${id}${detail === undefined ? "" : " :: " + JSON.stringify(detail)}`);
}

const adb = (...args) => run("adb", ["-s", SERIAL, ...args], {timeout: 60000});
const sh = (script, timeout) => run("bash", ["-lc", script], {timeout: timeout || 60000});

function screenshot(name) {
  try {
    const buf = execFileSync("adb", ["-s", SERIAL, "exec-out", "screencap", "-p"], {
      timeout: 60000,
      maxBuffer: 64 * 1024 * 1024,
    });
    const file = path.join(QA, name);
    fs.writeFileSync(file, buf);
    log(`SHOT ${name} ${sha256(buf)} ${buf.length}B`);
    return {file: name, sha256: sha256(buf), bytes: buf.length};
  } catch (error) {
    log(`SHOT FAILED ${name}: ${error.message}`);
    return null;
  }
}

/** uiautomator 文本：原生面板与网页元素都会出现在 text 属性里。 */
function uiText() {
  adb("shell", "uiautomator", "dump", "/sdcard/t4-ui.xml");
  const out = adb("shell", "cat", "/sdcard/t4-ui.xml").out || "";
  const texts = [];
  const re = /text="([^"]*)"/g;
  let m;
  while ((m = re.exec(out))) {
    if (m[1].trim()) texts.push(m[1].replace(/&#10;/g, "\n"));
  }
  return texts.join(" \n ");
}

function uiNode(pattern) {
  adb("shell", "uiautomator", "dump", "/sdcard/t4-ui.xml");
  const out = adb("shell", "cat", "/sdcard/t4-ui.xml").out || "";
  const re = /<node[^>]*text="([^"]*)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
  let m;
  while ((m = re.exec(out))) {
    if (pattern.test(m[1])) {
      return {
        text: m[1],
        x: Math.round((Number(m[2]) + Number(m[4])) / 2),
        y: Math.round((Number(m[3]) + Number(m[5])) / 2),
      };
    }
  }
  return null;
}

function tapAt(x, y) {
  adb("shell", "input", "tap", String(x), String(y));
}

/** 按文字点按；找不到时退回到调用方给的备用坐标（网页内部元素不一定都暴露）。 */
function tapText(pattern, fallback) {
  const node = uiNode(pattern);
  if (node) {
    log(`TAP "${node.text}" @ ${node.x},${node.y}`);
    tapAt(node.x, node.y);
    return true;
  }
  if (fallback) {
    log(`TAP fallback @ ${fallback.x},${fallback.y}（未在控件树中找到 ${pattern}）`);
    tapAt(fallback.x, fallback.y);
    return true;
  }
  log(`TAP NOT_FOUND ${pattern}`);
  return false;
}

const healthJson = () => {
  const res = run("bash", ["socialmate-v1.2/service-all.sh", "health", "--json"]);
  try {
    return {...JSON.parse(res.out.trim().split("\n").pop()), exit: res.exit};
  } catch {
    return {ok: false, exit: res.exit, raw: res.out.slice(0, 400)};
  }
};

const waitHealthy = (seconds) => {
  const deadline = Date.now() + seconds * 1000;
  let last = null;
  while (Date.now() < deadline) {
    last = healthJson();
    if (last.ok) return {ok: true, waitedMs: seconds * 1000 - (deadline - Date.now()), health: last};
    try { execFileSync("sleep", ["1"]); } catch { }
  }
  return {ok: false, waitedMs: seconds * 1000, health: last};
};

const portPid = (port) => {
  const res = run("bash", ["-lc", `lsof -nP -iTCP:${port} -sTCP:LISTEN -t 2>/dev/null | head -1`]);
  return res.out.trim().split("\n")[0];
};

const demoHash = () => {
  const res = run("bash", ["-lc",
    "cd SocialMate-Data && find Demo People -type f -name '*.json' -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256"]);
  return res.out.trim().split(" ")[0] || "";
};

/** 手机端离线快照：证明 App 确实拿到了演示数据（不依赖 WebView 的无障碍树）。 */
function deviceSnapshot() {
  const out = run("adb", ["-s", SERIAL, "shell", "run-as", PKG, "cat", "files/offline/snapshot.json"]).out || "";
  try {
    const snap = JSON.parse(out);
    const status = (snap.demo && snap.demo.status) || {};
    return {
      ok: true,
      savedAt: snap.savedAt,
      personas: status.personas,
      sessions: status.sessions,
      segments: status.segments,
      pending: status.pending,
      cleared: status.cleared,
      people: ((snap.demo && snap.demo.people) || []).map(p => p.name),
    };
  } catch {
    return {ok: false, raw: out.slice(0, 300)};
  }
}

/**
 * 读取 WebView 真实 DOM 文本（Chrome DevTools Protocol）。
 * debug 构建里 WebView.setWebContentsDebuggingEnabled(true)，因此可以只读地拿到页面文字，
 * 用来断言「有没有出现成功提示」而不靠肉眼。失败时返回 null，调用方回退到快照断言。
 */
async function pageText() {
  const pid = (adb("shell", "pidof", PKG).out || "").trim().split(/\s+/)[0];
  if (!pid) return null;
  run("adb", ["-s", SERIAL, "forward", "tcp:9222", `localabstract:webview_devtools_remote_${pid}`]);
  let targets;
  try {
    const res = await fetch("http://127.0.0.1:9222/json", {signal: AbortSignal.timeout(4000)});
    targets = await res.json();
  } catch {
    return null;
  }
  const target = (targets || []).find(t => t.type === "page" && t.webSocketDebuggerUrl);
  if (!target) return null;
  return await new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; try { ws.close(); } catch { } resolve(value); } };
    let ws;
    try {
      ws = new WebSocket(target.webSocketDebuggerUrl);
    } catch {
      return resolve(null);
    }
    const timer = setTimeout(() => done(null), 5000);
    ws.onopen = () => ws.send(JSON.stringify({id: 1, method: "Runtime.evaluate",
      params: {expression: "document.body.innerText", returnByValue: true, awaitPromise: false}}));
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id !== 1) return;
        clearTimeout(timer);
        done(msg.result && msg.result.result && typeof msg.result.result.value === "string"
          ? msg.result.result.value : null);
      } catch {
        clearTimeout(timer);
        done(null);
      }
    };
    ws.onerror = () => { clearTimeout(timer); done(null); };
  });
}

const demoStatusApi = () => {
  const res = run("curl", ["-s", "--max-time", "5", "http://127.0.0.1:8791/v12/api/demo/status"]);
  try { return JSON.parse(res.out); } catch { return {}; }
};

/* ===================================================================== */
log(`T4 verify start ${new Date().toISOString()} qa=${QA}`);

/* --------------------------- 0 前置事实 --------------------------- */
const device = {
  serial: SERIAL,
  model: (adb("shell", "getprop", "ro.product.model").out || "").trim(),
  android: (adb("shell", "getprop", "ro.build.version.release").out || "").trim(),
  sdk: (adb("shell", "getprop", "ro.build.version.sdk").out || "").trim(),
  versionName: (adb("shell", "dumpsys", "package", PKG).out.match(/versionName=([\w.]+)/) || [])[1] || "",
  versionCode: (adb("shell", "dumpsys", "package", PKG).out.match(/versionCode=(\d+)/) || [])[1] || "",
  apkSha256: "",
};
const apkPath = path.join(ROOT, "android-poc/app/build/outputs/apk/debug/app-debug.apk");
if (fs.existsSync(apkPath)) device.apkSha256 = sha256(fs.readFileSync(apkPath));
const gitHead = run("git", ["rev-parse", "--short", "HEAD"]).out.trim();
const gitDirty = run("git", ["status", "--porcelain"]).out.split("\n").filter(Boolean).length;
fs.writeFileSync(path.join(QA, "00-device.json"), JSON.stringify({device, gitHead, gitDirty, at: new Date().toISOString()}, null, 2));
check("preflight", "device-report", true, {model: device.model, android: device.android, versionName: device.versionName, versionCode: device.versionCode, apkSha256: device.apkSha256.slice(0, 16), gitHead, gitDirty});

/* ------------------------- 1 四端口健康 ------------------------- */
const health0 = healthJson();
fs.writeFileSync(path.join(QA, "10-health-before.json"), JSON.stringify(health0, null, 2));
check("stack", "health-4-ports", health0.ok === true && health0.exit === 0,
  {exit: health0.exit, ports: health0.ports && health0.ports.map(p => `${p.port}:${p.ok ? "OK" : "DOWN"}`)});

const agentPrint = run("launchctl", ["print", `gui/${UID}/${LABEL}`]);
const agentLoaded = agentPrint.exit === 0 && /state = (running|active)/.test(agentPrint.out);
check("stack", "launch-agent-loaded", agentLoaded, {exit: agentPrint.exit, label: LABEL});

const plist = `${process.env.HOME}/Library/LaunchAgents/${LABEL}.plist`;
check("stack", "launch-agent-plist", fs.existsSync(plist), {plist});

/* 图形界面一键恢复：.app 只调用 launchctl（不直接拉 node，避免隐私授权弹窗） */
const guiApp = path.join(ROOT, "release/t4/SocialMate 服务恢复.app");
const guiScript = path.join(guiApp, "Contents/Resources/Scripts/main.scpt");
if (fs.existsSync(guiScript)) {
  const asText = run("bash", ["-lc", `osadecompile ${JSON.stringify(guiScript)}`]).out;
  check("gui", "recovery-app-present", fs.existsSync(guiApp) && /launchctl kickstart/.test(asText),
    {app: "release/t4/SocialMate 服务恢复.app", usesLaunchctl: /launchctl kickstart/.test(asText), mentionsNode: /archive-receiver|live-server/.test(asText)});
} else {
  check("gui", "recovery-app-present", false, {reason: "缺少 .app", guiApp});
}
const manualGuiShot = path.join(QA, "50-gui-recovery-dialog.png");
if (fs.existsSync(manualGuiShot)) {
  check("gui", "manual-doubleclick-evidence", true, {shot: "50-gui-recovery-dialog.png", note: "人工双击后对话框截图（已自动恢复）"});
} else {
  check("gui", "manual-doubleclick-evidence", null, {reason: "本次未生成双击截图"}, "NOT_RUN");
}

/* ---------------------- 2b 鉴权/CORS/日志泄密 ---------------------- */
const tokenFile = path.join(ROOT, "socialmate-v1.2/.local/archive-token");
const demoTokenFile = path.join(ROOT, "socialmate-v1.2/.local/demo-archive-token");
const realToken = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, "utf8").trim() : "";
const demoToken = fs.existsSync(demoTokenFile) ? fs.readFileSync(demoTokenFile, "utf8").trim() : "";
/* 归档写端点：无令牌必须 401（跨源也拿不到数据） */
const noTokenPost = run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-X", "POST",
  "-H", "Content-Type: application/json", "-H", "Origin: https://evil.example",
  "--data", '{"sessionId":"t4-probe","segments":[]}', "--max-time", "6", `https://${HOST}/alw/api/archive/session`]);
check("sec", "archive-post-requires-token", noTokenPost.out.trim() === "401", {status: noTokenPost.out.trim(), origin: "https://evil.example"});
/* 不允许任何通配 CORS 放行 */
const corsProbe = run("bash", ["-lc",
  `curl -s -D- -o /dev/null -H 'Origin: https://evil.example' --max-time 6 https://${HOST}:8443/api/ai/health | grep -i '^access-control-allow-origin' || true; ` +
  `curl -s -D- -o /dev/null -H 'Origin: https://evil.example' --max-time 6 https://${HOST}/alw/health | grep -i '^access-control-allow-origin' || true`]);
check("sec", "no-wildcard-cors", !/\*/.test(corsProbe.out), {allowOriginHeaders: corsProbe.out.trim().split("\n").filter(Boolean)});
/* 令牌不得出现在本项目日志里（只报告命中数，不打印令牌） */
const tokenLeak = run("bash", ["-lc",
  `grep -rlF ${JSON.stringify(realToken)} socialmate-v1.2/.local/qa socialmate-prototype/ai-gateway/*.log 2>/dev/null | head -3; ` +
  `grep -rlF ${JSON.stringify(demoToken)} socialmate-v1.2/.local/qa socialmate-prototype/ai-gateway/*.log 2>/dev/null | head -3`]);
check("sec", "tokens-not-in-logs", tokenLeak.out.trim() === "", {filesWithToken: tokenLeak.out.trim().split("\n").filter(Boolean), tokenConfigured: Boolean(realToken && demoToken)});

/* --------------------------- 2 证书链 --------------------------- */
const openssl = run("bash", ["-lc",
  `echo | openssl s_client -connect 100.125.100.15:443 -servername ${HOST} -verify_return_error -CAfile ${CA_FILE} 2>&1`]);
const verifyLine = (openssl.out.match(/Verify return code: (\d+ \([^)]+\))/) || [])[1] || "";
check("tls", "openssl-chain-443", /Verify return code: 0 \(ok\)/.test(openssl.out), {verifyLine});

const openssl8443 = run("bash", ["-lc",
  `echo | openssl s_client -connect 100.125.100.15:8443 -servername ${HOST} -verify_return_error -CAfile ${CA_FILE} 2>&1`]);
const verifyLine8443 = (openssl8443.out.match(/Verify return code: (\d+ \([^)]+\))/) || [])[1] || "";
check("tls", "openssl-chain-8443", /Verify return code: 0 \(ok\)/.test(openssl8443.out), {verifyLine: verifyLine8443});

const openssl10000 = run("bash", ["-lc",
  `echo | openssl s_client -connect 100.125.100.15:10000 -servername ${HOST} -verify_return_error -CAfile ${CA_FILE} 2>&1`]);
check("tls", "openssl-chain-10000", /Verify return code: 0 \(ok\)/.test(openssl10000.out),
  {verifyLine: (openssl10000.out.match(/Verify return code: (\d+ \([^)]+\))/) || [])[1] || ""});

const tailUrls = [
  ["8790-asr", `https://${HOST}:10000/health`],
  ["8791-ui", `https://${HOST}:8443/api/ai/health`],
  ["8791-page", `https://${HOST}:8443/v12`],
  ["8781-archive", `https://${HOST}/alw/health`],
];
const tailResults = [];
for (const [name, url] of tailUrls) {
  const res = run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10", url]);
  tailResults.push({name, url, code: res.out.trim(), exit: res.exit});
}
check("tls", "tailnet-https-endpoints", tailResults.every(r => r.code === "200"), tailResults);

/* 不许出现明文/关校验手段（只看脚本与源码，不看历史文档） */
const forbidden = run("bash", ["-lc",
  "grep -rn -E 'curl +(-[a-zA-Z]+ +)*-k|NODE_TLS_REJECT_UNAUTHORIZED=0|http://100\\.' socialmate-v1.2/*.sh socialmate-prototype/ai-gateway/*.mjs android-poc/app/src/main/java/app/socialmate/dualmic/*.java 2>/dev/null | grep -v -E ':[0-9]+: *#' | grep -v -E 'Sanitized|=== \"0\"|BLOCKED|never set' | head -5"]);
check("tls", "no-insecure-flags", forbidden.out.trim() === "", {hits: forbidden.out.trim().split("\n").filter(Boolean)});

/* ------------------------ 3 崩溃自动恢复 ------------------------ */
const victimPort = 8782;
const victimPid = portPid(victimPort);
const victimCmd = run("bash", ["-lc", `ps -p ${victimPid} -o command= 2>/dev/null`]).out.trim();
const victimOwned = victimCmd.includes("archive-receiver.mjs") && victimCmd.includes(ROOT);
check("crash", "victim-is-project-owned", Boolean(victimPid) && victimOwned, {port: victimPort, pid: victimPid, owned: victimOwned, cmdTail: victimCmd.slice(-60)});
let crashRecovery = {ok: false};
if (victimPid && victimOwned) {
  run("kill", ["-9", victimPid]);
  log(`KILL -9 ${victimPid} (${victimPort})`);
  crashRecovery = waitHealthy(60);
  const newPid = portPid(victimPort);
  check("crash", "watchdog-restarted", crashRecovery.ok && newPid !== victimPid,
    {oldPid: victimPid, newPid, waitedMs: crashRecovery.waitedMs});
} else {
  check("crash", "watchdog-restarted", false, {reason: "找不到可安全 kill 的本项目进程"});
}
const watchLog = run("bash", ["-lc", "tail -n 40 socialmate-v1.2/.local/qa/stack.log"]).out;
fs.writeFileSync(path.join(QA, "30-stack-log-after-crash.txt"), watchLog);
check("crash", "log-records-heal", /HEAL: 端口 8782 不健康/.test(watchLog), {logTail: watchLog.split("\n").slice(-3)});

/* ---------------------- 4 模拟 Mac 重启 ---------------------- */
run("launchctl", ["bootout", `gui/${UID}/${LABEL}`]);
try { execFileSync("sleep", ["2"]); } catch { }
const afterBootout = healthJson();
check("reboot", "agent-unloaded-services-down", afterBootout.ok === false, {ports: afterBootout.ports && afterBootout.ports.map(p => `${p.port}:${p.ok}`)});
const bootstrap = run("bash", ["socialmate-v1.2/service-all.sh", "agent-install"]);
const rebootRecovery = waitHealthy(90);
check("reboot", "bootstrap-recovers", bootstrap.exit === 0 && rebootRecovery.ok,
  {bootstrapExit: bootstrap.exit, waitedMs: rebootRecovery.waitedMs, ports: rebootRecovery.health && rebootRecovery.health.ports && rebootRecovery.health.ports.map(p => `${p.port}:${p.ok}`)});

/* -------------------- 5 手机基线（在线） -------------------- */
const reverseBefore = run("bash", ["-lc", `adb -s ${SERIAL} reverse --list`]).out.trim();
const reverseReady = ["8790", "8791", "8781"].every(p => reverseBefore.includes(`tcp:${p}`));
if (!reverseReady) {
  for (const p of ["8790", "8791", "8781"]) adb("reverse", `tcp:${p}`, `tcp:${p}`);
}
const hashBefore = demoHash();
adb("logcat", "-c");
adb("shell", "am", "force-stop", PKG);
adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
try { execFileSync("sleep", ["9"]); } catch { }
/* 首屏默认在「软件」页，点底部「人物」进演示区（网页内部控件，用坐标） */
tapAt(974, 2191);
try { execFileSync("sleep", ["3"]); } catch { }
const baselineText = uiText();
const baselineShot = screenshot("10-baseline-online.png");
fs.writeFileSync(path.join(QA, "11-baseline-ui.txt"), baselineText);
const baselineDom = await pageText();
fs.writeFileSync(path.join(QA, "13-baseline-dom.txt"), baselineDom || "(CDP 不可用)");
const baselineSnap = deviceSnapshot();
fs.writeFileSync(path.join(QA, "12-baseline-snapshot.json"), JSON.stringify(baselineSnap, null, 2));
const baselineOnline = Boolean(baselineDom && /Oliver Reed/.test(baselineDom) && /Maya/.test(baselineDom) && /Ji-eun/.test(baselineDom));
check("stack", "phone-online-baseline", baselineOnline || baselineSnap.personas === 3,
  {domLoaded: Boolean(baselineDom), threePeopleInDom: baselineOnline,
   snapshotPersonas: baselineSnap.personas, snapshotSessions: baselineSnap.sessions, snapshotSavedAt: baselineSnap.savedAt,
   shot: baselineShot && baselineShot.sha256});
check("stack", "data-hash-baseline", Boolean(hashBefore), {demoHash: hashBefore});

/* ------------------ 6 服务不可用时的写操作 ------------------ */
run("launchctl", ["bootout", `gui/${UID}/${LABEL}`]);
run("bash", ["socialmate-v1.2/service-all.sh", "down"]);
const downHealth = healthJson();
check("write", "services-down-for-write-test", downHealth.ok === false, {ports: downHealth.ports && downHealth.ports.map(p => `${p.ok}`)});

tapAt(210, 1403); // 「清空演示数据」
try { execFileSync("sleep", ["1"]); } catch { }
const modalShot = screenshot("21-clear-modal-offline.png");
tapAt(874, 1542); // 「确认清空」
/* 提示条只显示两三秒：立刻轮询 DOM，拿到第一帧带「清空失败」的文字 */
let failDom = null;
for (let i = 0; i < 8; i++) {
  const text = await pageText();
  if (text && (!failDom || /清空失败/.test(text))) failDom = text;
  if (text && /清空失败/.test(text)) break;
  try { execFileSync("sleep", ["0.4"]); } catch { }
}
const failShot = screenshot("22-clear-failed-toast.png");
const afterFailText = uiText();
fs.writeFileSync(path.join(QA, "23-clear-failed-ui.txt"), afterFailText);
fs.writeFileSync(path.join(QA, "25-clear-failed-dom.txt"), failDom || "(CDP 不可用)");
/* 成功提示是「已清空演示数据（真实数据未改动）」；失败态不许出现它 */
const successPhrase = /已清空演示数据（真实数据未改动）/.test(afterFailText + (failDom || ""));
check("write", "no-false-success", !successPhrase,
  {shot: failShot && failShot.sha256, modalShot: modalShot && modalShot.sha256, domAvailable: Boolean(failDom)});
/* 失败原因必须当场可见：页面提示里出现「清空失败」 */
check("write", "failure-message-visible", Boolean(failDom) && /清空失败/.test(failDom),
  {domExcerpt: failDom ? (failDom.match(/[^\n]*清空失败[^\n]*/) || [""])[0] : null,
   note: failDom ? null : "CDP 不可用，失败提示以截图 22-clear-failed-toast.png 为准"});

/* ------------------ 7 离线只读（无 adb reverse） ------------------ */
adb("reverse", "--remove-all");
const reverseAfter = run("bash", ["-lc", `adb -s ${SERIAL} reverse --list`]).out.trim();
check("offline", "no-adb-reverse", reverseAfter === "", {reverseList: reverseAfter});
adb("shell", "am", "force-stop", PKG);
adb("shell", "monkey", "-p", PKG, "-c", "android.intent.category.LAUNCHER", "1");
try { execFileSync("sleep", ["9"]); } catch { }
const offlineText = uiText();
fs.writeFileSync(path.join(QA, "31-offline-ui.txt"), offlineText);
const offlineShot = screenshot("30-offline-readonly.png");
const offlineOk = /离线只读模式/.test(offlineText)
  && /Oliver Reed/.test(offlineText) && /Maya/.test(offlineText) && /Ji-eun/.test(offlineText)
  && /9 段会话/.test(offlineText) && /本地原文/.test(offlineText)
  && /清空 \/ 恢复演示数据、上传原文都不会执行/.test(offlineText);
check("offline", "readonly-cache-shown", offlineOk, {
  shot: offlineShot && offlineShot.sha256,
  hasOfflineBanner: /离线只读模式/.test(offlineText),
  has3People: /Oliver Reed/.test(offlineText) && /Maya/.test(offlineText) && /Ji-eun/.test(offlineText),
  noWhiteScreen: offlineText.trim().length > 200,
});

/* ---------------------- 8 恢复后合并 ---------------------- */
const bootstrap2 = run("bash", ["socialmate-v1.2/service-all.sh", "agent-install"]);
const recoverHealth = waitHealthy(90);
for (const p of ["8790", "8791", "8781"]) adb("reverse", `tcp:${p}`, `tcp:${p}`);
const retry = uiNode(/^重试连接$/);
if (retry) { tapAt(retry.x, retry.y); } else { log("RETRY button not found in dump"); }
let recoveredDom = null;
for (let i = 0; i < 15; i++) {
  try { execFileSync("sleep", ["2"]); } catch { }
  recoveredDom = await pageText();
  if (recoveredDom && !/网页无法打开|ERR_CONNECTION/.test(recoveredDom)) break;
}
const recoveredText = uiText();
const recoveredShot = screenshot("40-recovered-online.png");
tapAt(974, 2191);
try { execFileSync("sleep", ["3"]); } catch { }
const recoveredPeopleText = uiText();
const peopleShot = screenshot("41-recovered-people.png");
fs.writeFileSync(path.join(QA, "42-recovered-ui.txt"), recoveredText + "\n--- people ---\n" + recoveredPeopleText);
fs.writeFileSync(path.join(QA, "44-recovered-dom.txt"), recoveredDom || "(CDP 不可用)");
const hashAfter = demoHash();
const statusAfter = demoStatusApi();
const snapAfter = deviceSnapshot();
fs.writeFileSync(path.join(QA, "43-recovered-status.json"), JSON.stringify({statusAfter, snapAfter}, null, 2));
check("recover", "back-online", bootstrap2.exit === 0 && recoverHealth.ok
  && Boolean(recoveredDom) && !/网页无法打开|ERR_CONNECTION/.test(recoveredDom || ""),
  {waitedMs: recoverHealth.waitedMs, retryFound: Boolean(retry),
   domOnline: Boolean(recoveredDom) && !/网页无法打开|ERR_CONNECTION/.test(recoveredDom),
   domHead: (recoveredDom || "").split("\n").slice(0, 3)});
check("recover", "demo-not-cleared-by-failed-write",
  hashAfter === hashBefore && Boolean(hashAfter) && statusAfter.cleared === false,
  {hashBefore, hashAfter, cleared: statusAfter.cleared, shot: peopleShot && peopleShot.sha256});
check("recover", "demo-counts-intact",
  statusAfter.personas === 3 && statusAfter.sessions === 9 && statusAfter.segments === 54
  && snapAfter.personas === 3 && snapAfter.sessions === 9,
  {
    server: {personas: statusAfter.personas, sessions: statusAfter.sessions, segments: statusAfter.segments},
    phoneSnapshot: {personas: snapAfter.personas, sessions: snapAfter.sessions, savedAt: snapAfter.savedAt},
    shot: recoveredShot && recoveredShot.sha256,
  });

/* --------------------- 9 无 USB / Tailnet --------------------- */
const tsStatus = run("bash", ["-lc", "tailscale status --json"]);
let peers = [];
try {
  const parsed = JSON.parse(tsStatus.out);
  peers = Object.values(parsed.Peer || {}).map(p => ({host: p.HostName, os: p.OS, online: p.Online, ips: p.TailscaleIPs}));
} catch { }
fs.writeFileSync(path.join(QA, "50-tailscale-peers.json"), JSON.stringify(peers, null, 2));
const phoneIfaces = adb("shell", "ip", "-o", "addr").out;
const phoneHasTailnet = /tailscale0|100\.\d+\.\d+\.\d+/.test(phoneIfaces);
const phoneTailscalePkg = /com\.tailscale\.ipn/.test(adb("shell", "pm", "list", "packages").out);
check("nousb", "mac-side-tailnet-entry-verified",
  tailResults.every(r => r.code === "200") && /Verify return code: 0/.test(openssl.out),
  {endpoints: tailResults.map(r => `${r.name}=${r.code}`)});
if (!phoneHasTailnet) {
  check("nousb", "phone-tailnet-session", null,
    {tailscaleInstalled: phoneTailscalePkg, phoneTailnetInterface: false, peers, reason: "手机 Tailscale 未登录/未授权到本 tailnet：无 tailscale0 接口，ping 100.125.100.15 100% 丢包；需要用户本人在手机上登录并授权设备"}, "NOT_RUN");
} else {
  const ping = adb("shell", "ping", "-c", "1", "-W", "2", "100.125.100.15");
  check("nousb", "phone-tailnet-session", /1 (packets )?received|1 received/.test(ping.out), {ping: ping.out.slice(0, 200)});
}

/* ------------------------- 汇总 ------------------------- */
run("adb", ["-s", SERIAL, "forward", "--remove", "tcp:9222"]);
const failed = checks.filter(c => c.status === "FAIL");
const notRun = checks.filter(c => c.status === "NOT_RUN");
const report = {
  task: "SM-ALW001-20261102-N04-V13/T4",
  startedAt: new Date(started).toISOString(),
  finishedAt: new Date().toISOString(),
  durationMs: Date.now() - started,
  root: ROOT,
  qa: QA,
  device,
  git: {head: gitHead, dirtyFiles: gitDirty},
  host: HOST,
  checks,
  summary: {
    total: checks.length,
    pass: checks.filter(c => c.status === "PASS").length,
    fail: failed.length,
    notRun: notRun.length,
    verdict: failed.length > 0 ? "FAIL" : notRun.length > 0 ? "PARTIAL" : "PASS",
  },
  artifacts: fs.readdirSync(QA).filter(f => f !== path.basename(JSON_OUT)),
};
fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(QA, "t4-run.log"), runLog.join("\n"));

log(`SUMMARY ${JSON.stringify(report.summary)}`);
process.exit(failed.length > 0 ? 1 : notRun.length > 0 ? 2 : 0);
