import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/n07-cdp-profile";
const PORT = 9333;
const PAGE = pathToFileURL(path.join(HERE, "n07-prototype.html")).href;
const WIDTHS = [375, 393, 430];
const STATES = ["resumed", "translating", "menu", "draft", "paused", "idle", "finished"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-allow-origins=*",
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${PORT}`,
  "--window-size=393,852",
  "about:blank",
], { stdio: "ignore" });

async function waitPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("Chrome DevTools 未就绪");
}

let ws;
const pending = new Map();
let seq = 0;
function cmd(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (msg) => msg.error ? reject(new Error(method + " " + JSON.stringify(msg.error))) : resolve(msg.result));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  await cmd("Page.enable");
  await cmd("Runtime.enable");

  const report = { generatedAt: new Date().toISOString(), chrome: (await cmd("Browser.getVersion")).product, runs: [] };
  for (const width of WIDTHS) {
    for (const state of STATES) {
      await cmd("Emulation.setDeviceMetricsOverride", { width, height: 852, deviceScaleFactor: 1, mobile: true });
      await cmd("Page.navigate", { url: `${PAGE}?audit=1&shot=${state}` });
      await sleep(800);
      const out = await cmd("Runtime.evaluate", {
        expression: "(document.getElementById('auditOut')||{}).textContent || 'NO_AUDIT'",
        returnByValue: true,
      });
      const text = out.result.value;
      if (!text.startsWith("AUDIT_JSON:")) { report.runs.push({ width, state, error: text }); continue; }
      const data = JSON.parse(text.slice("AUDIT_JSON:".length));
      report.runs.push({ width, state, data });
    }
  }
  fs.writeFileSync(path.join(HERE, "n07-measure.json"), JSON.stringify(report, null, 2));
  for (const run of report.runs) {
    if (run.error) { console.log(`${run.width} ${run.state}: ERROR ${run.error}`); continue; }
    const d = run.data;
    console.log([
      `w=${run.width} state=${run.state}`,
      `vw=${d.vw} app=${d.appW}x${d.appH}`,
      `overflowX=${d.overflowX} offenders=${d.offenders.length}`,
      `topRow allInside=${d.topRow.allInside} scrollW/clientW=${d.topRow.scrollW}/${d.topRow.clientW} wrap=${d.topRow.wrap}`,
      `headerBefore=${d.headerTopBefore} headerAfterScroll=${d.headerTopAfterScroll}`,
      `draftGap=${d.draft ? d.draft.gapBelowLine : "-"}`,
      `tagsBottom=${d.tagsBottom} coachBottom=${d.coachBottom}`,
      `smallFonts=${d.minFontViolations.length}`,
      `forbidden=${JSON.stringify(d.forbiddenWords)}`,
    ].join(" | "));
  }
} finally {
  try { if (ws) ws.close(); } catch {}
  chrome.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}