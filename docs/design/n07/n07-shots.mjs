import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/n07-shot-profile-cdp";
const PORT = 9334;
const PAGE = pathToFileURL(path.join(HERE, "n07-prototype.html")).href;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SHOTS = [
  { file: "n07-01-idle.png", state: "idle", theme: "light" },
  { file: "n07-02-recording.png", state: "recording", theme: "light" },
  { file: "n07-03-translating.png", state: "translating", theme: "light" },
  { file: "n07-04-draft.png", state: "draft", theme: "light" },
  { file: "n07-05-paused.png", state: "paused", theme: "light" },
  { file: "n07-06-resumed.png", state: "resumed", theme: "light" },
  { file: "n07-07-menu.png", state: "menu", theme: "light" },
  { file: "n07-08-finished.png", state: "finished", theme: "light" },
  { file: "n07-09-dark-draft.png", state: "draft", theme: "dark" },
  { file: "n07-10-end-confirm.png", state: "confirm", theme: "light" },
];

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

const STATS_JS = `(async (b64) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, W, H).data;
  const canvasBg = [233, 238, 236];
  const appBg = [245, 247, 243];
  const near = (i, rgb, tol) => Math.abs(data[i]-rgb[0])<=tol && Math.abs(data[i+1]-rgb[1])<=tol && Math.abs(data[i+2]-rgb[2])<=tol;
  let minX = W, minY = H, maxX = -1, maxY = -1, content = 0, pine = 0, amber = 0;
  const bands = new Array(12).fill(0), bandN = new Array(12).fill(0);
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const i = (y * W + x) * 4;
      if (!near(i, canvasBg, 4)) {
        content++;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (near(i, [12,119,102], 12)) pine++;
      if (near(i, [163,93,24], 10)) amber++;
      const b = Math.min(11, Math.floor(y / (H / 12)));
      bands[b] += (data[i] + data[i+1] + data[i+2]) / 3; bandN[b]++;
    }
  }
  const edge = (x) => { const s = new Set(); for (let y = 0; y < H; y += 3) { const i = (y*W+x)*4; s.add(data[i]+','+data[i+1]+','+data[i+2]); } return [...s].slice(0, 4); };
  const px = (x, y) => { const i = ((y*W+x)*4); return [data[i], data[i+1], data[i+2], data[i+3]]; };
  let alphaMin = 255, alphaLow = 0;
  for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) { const a = data[(y*W+x)*4+3]; if (a < alphaMin) alphaMin = a; if (a < 255) alphaLow++; }
  return JSON.stringify({
    W, H,
    alphaMin, alphaLow,
    contentRatio: +(content / ((W/2) * (H/2))).toFixed(3),
    bbox: [minX, minY, maxX, maxY],
    bandsLum: bands.map((v, i) => +(v / bandN[i]).toFixed(1)),
    pine, amber,
    topPixel: px(Math.floor(W/2), 3),
    bottomPixel: px(Math.floor(W/2), H-3),
    y845: px(Math.floor(W/2), 845),
    y850: px(Math.floor(W/2), 850),
    corners: [px(2,2), px(W-3,2), px(2,H-3), px(W-3,H-3)],
    rightEdgeColors: edge(W-2),
    leftEdgeColors: edge(1)
  });
})`;

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
  await cmd("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });

  const results = [];
  for (const shot of SHOTS) {
    await cmd("Page.navigate", { url: `${PAGE}?shot=${shot.state}&theme=${shot.theme}` });
    for (let i = 0; i < 30; i++) {
      const r = await cmd("Runtime.evaluate", {
        expression: "document.readyState==='complete' && !!document.getElementById('app') && document.body.innerText.indexOf('实时字幕')>=0 && location.search.indexOf('shot='+new URLSearchParams(location.search).get('shot'))>=0",
        returnByValue: true,
      });
      if (r.result.value === true) break;
      await sleep(100);
    }
    await sleep(500);
    const snap = await cmd("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const buf = Buffer.from(snap.data, "base64");
    fs.writeFileSync(path.join(HERE, shot.file), buf);
    const probe = await cmd("Runtime.evaluate", {
      expression: "(()=>{const r=(s)=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();const c=getComputedStyle(e);return [s,Math.round(b.top),Math.round(b.bottom),Math.round(b.left),Math.round(b.right),c.backgroundColor,c.display,c.visibility]};return JSON.stringify({text:document.body.innerText.slice(0,80),scrollY:scrollY,live:r('.live'),conv:r('.conv'),empty:r('.empty'),coach:r('.coach'),tags:r('.tags'),sheet:r('.sheet'),modal:document.getElementById('modal').hidden,appBg:getComputedStyle(document.getElementById('app')).backgroundColor,innerH:innerHeight})})()",
      returnByValue: true,
    });
    console.log("PROBE " + shot.file + " " + probe.result.value);
    const st = await cmd("Runtime.evaluate", {
      expression: `${STATS_JS}(${JSON.stringify(snap.data)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    const stats = JSON.parse(st.result.value);
    results.push({ file: shot.file, state: shot.state, theme: shot.theme, bytes: buf.length, ...stats });
    console.log(`${shot.file} | ${stats.W}x${stats.H} | bytes=${buf.length} | content=${stats.contentRatio} | bbox=${stats.bbox.join(",")} | pine=${stats.pine} amber=${stats.amber} | top=${stats.topPixel.join(",")} bottom=${stats.bottomPixel.join(",")} | right=${stats.rightEdgeColors.length}`);
  }
  fs.writeFileSync(path.join(HERE, "n07-shots-check.json"), JSON.stringify(results, null, 2));
} finally {
  try { if (ws) ws.close(); } catch {}
  chrome.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}