#!/usr/bin/env node
/**
 * V1.7 真机视口/主题取证：393×852 + 深色。
 *
 * 只通过 CDP Emulation 覆盖 WebView 视口，不改 Android 系统分辨率、不写产品数据。
 * 产物：evidence/07-393x852.png、evidence/08-dark-393x852.png。
 */
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const PORT = Number(process.env.SM_CDP_PORT || 9223);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs/plan/ALW001-N05-V1.7-R2/evidence");

const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
const page = list.find((p) => p.type === "page" && /127\.0\.0\.1/.test(p.url || ""));
if (!page) throw new Error("没有找到本机页面；先 adb forward 到 WebView DevTools");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, {once: true});
  ws.addEventListener("error", reject, {once: true});
});
let seq = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++seq;
  pending.set(id, resolve);
  ws.send(JSON.stringify({id, method, params}));
});
const evaluate = async (expression) => {
  const response = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
  if (response.error) throw new Error(JSON.stringify(response.error));
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
  return response.result?.result?.value;
};
const shot = async (file) => {
  const response = await send("Page.captureScreenshot", {format: "png", captureBeyondViewport: false});
  if (!response.result?.data) throw new Error("截图失败");
  await fs.writeFile(path.join(outDir, file), Buffer.from(response.result.data, "base64"));
};

await fs.mkdir(outDir, {recursive: true});
await send("Emulation.setDeviceMetricsOverride", {
  width: 393,
  height: 852,
  deviceScaleFactor: 2.75,
  mobile: true,
});
await new Promise((r) => setTimeout(r, 700));

const layout = JSON.parse(await evaluate(`JSON.stringify({
  width: innerWidth, height: innerHeight,
  scrollWidth: document.documentElement.scrollWidth,
  scrollHeight: document.documentElement.scrollHeight,
  overflowX: document.documentElement.scrollWidth > innerWidth + 1,
  tabs: [...document.querySelectorAll('nav a,nav button')].map(e => e.textContent.trim()).filter(Boolean).slice(0,6),
  fontBody: getComputedStyle(document.body).fontSize,
  fontLabel: getComputedStyle(document.querySelector('.formlabel') || document.body).fontSize
})`));
await shot("07-393x852.png");

const dark = await evaluate(`(function(){
  try { SAV.theme='dark'; theming(); }
  catch (e) { document.documentElement.dataset.theme='dark'; }
  return document.documentElement.dataset.theme + '|' + getComputedStyle(document.body).backgroundColor;
})()`);
await new Promise((r) => setTimeout(r, 300));
await shot("08-dark-393x852.png");

await evaluate(`(function(){
  try { SAV.theme='light'; theming(); }
  catch (e) { document.documentElement.dataset.theme='light'; }
  return document.documentElement.dataset.theme;
})()`);
await send("Emulation.clearDeviceMetricsOverride");
ws.close();

console.log(JSON.stringify({layout, dark}, null, 2));