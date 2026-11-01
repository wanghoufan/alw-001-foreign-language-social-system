/**
 * Phone WebView probe for the V0.4.0 live chain.
 * Uses the debug-build WebView DevTools socket forwarded by adb:
 *   adb -s <serial> forward tcp:9333 localabstract:webview_devtools_remote_<pid>
 * It navigates the embedded V1.2 page, sends synthetic PCM to the combined ASR
 * service, and verifies that the mock final event appears in the actual UI DOM.
 *
 * MOCK ONLY. This never proves real speech recognition.
 */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "./vendor/ws/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const cdpBase = arg("--cdp", "http://127.0.0.1:9333");
const navUrl = arg("--nav", "http://127.0.0.1:8791/v12?live=1");
const asrUrl = arg("--asr", "ws://127.0.0.1:8790/asr?track=mix&rate=16000&channels=1");
const mode = arg("--mode", "mock");
const shot = arg("--shot", path.join(here, "screenshots",
  mode === "real" ? "phone-v040-live-real.png" : "phone-v040-live-mock.png"));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const pages = await (await fetch(`${cdpBase}/json/list`)).json();
const page = pages.find(x => x.type === "page" && /\/v12/.test(x.url || ""));
if (!page) throw new Error("No /v12 WebView page found on CDP; open the SocialMate panel first.");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
let id = 0;
const pending = new Map();
ws.on("message", raw => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const {resolve, reject} = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, {resolve, reject});
  ws.send(JSON.stringify({id: i, method, params}));
});
const evaluate = async expression => {
  const r = await send("Runtime.evaluate", {expression, awaitPromise: true, returnByValue: true});
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || "evaluate failed");
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
if (!args.includes("--keep-page")) {
  const sep = navUrl.includes("?") ? "&" : "?";
  await send("Page.navigate", {url: `${navUrl}${sep}run=${Date.now()}`});
  await sleep(2500);
}
const initial = await evaluate(`({
  url: location.href,
  title: document.title,
  status: document.querySelector('.live-status')?.innerText || '',
  hasConnect: !!document.querySelector('[data-act="connect-asr"], [data-act="disconnect-asr"]'),
  hasMessages: !!document.querySelector('#messages')
})`);

// Synthetic 440Hz tone, then silence, then end. The bridge must be in MOCK mode.
const asr = new WebSocket(asrUrl);
await new Promise((res, rej) => { asr.on("open", res); asr.on("error", rej); });
const asrEvents = [];
let readyResolve;
const ready = new Promise(resolve => { readyResolve = resolve; });
asr.on("message", raw => {
  try {
    const event = JSON.parse(raw);
    asrEvents.push(event);
    if (event.type === "session" && event.status === "ready") readyResolve(true);
  } catch {}
});
await Promise.race([ready, sleep(6000)]);
const pcmPath = arg("--pcm", "");
let pcm;
if (pcmPath) {
  pcm = fs.readFileSync(pcmPath); // real mode: 16k mono PCM16LE speech sample
} else {
  const samples = 16000;
  pcm = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 10000), i * 2);
  }
}
for (let i = 0; i < pcm.length; i += 3200) {
  asr.send(pcm.subarray(i, i + 3200));
  await sleep(20);
}
const silence = Buffer.alloc(9600 * 2);
for (let i = 0; i < silence.length; i += 3200) {
  asr.send(silence.subarray(i, i + 3200));
  await sleep(20);
}
asr.send(JSON.stringify({type: "end"}));

let ui = null;
for (let i = 0; i < 40; i += 1) {
  await sleep(250);
  ui = await evaluate(`({
    messages: document.querySelector('#messages')?.innerText || '',
    status: document.querySelector('.live-status')?.innerText || '',
    coach: document.querySelector('#coachresults')?.innerText || '',
    recs: document.querySelector('#recresults')?.innerText || '',
    overflow: document.documentElement.scrollWidth <= innerWidth
  })`);
  const gotFinal = asrEvents.some(e => e.type === "final" && e.final === true);
  if (gotFinal && (mode === "real" ? /(microphone test|running outdoors)/i.test(ui.messages)
                                   : /speech detected/.test(ui.messages))) break;
}
let aiCheck = null;
if (args.includes("--ai-consent")) {
  const clicked = await evaluate(`(() => {
    const box = document.querySelector('#liveCloudConsent');
    if (!box) return false;
    box.click();
    return true;
  })()`);
  let aiUi = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    aiUi = await evaluate(`({
      coach: document.querySelector('#coachresults')?.innerText || '',
      recs: document.querySelector('#recresults')?.innerText || '',
      status: document.querySelector('.live-status')?.innerText || ''
    })`);
    if ((/真实 AI ·/.test(aiUi.coach) && !/请求中/.test(aiUi.coach)) ||
        /API|降级|失败/.test(aiUi.coach)) break;
  }
  aiCheck = {
    clicked,
    coach: aiUi?.coach || "",
    recs: aiUi?.recs || "",
    realAi: /真实 AI/.test(aiUi?.coach || ""),
    groundedCards: /万绿园/.test(aiUi?.recs || "") && /海口湾滨海步道/.test(aiUi?.recs || ""),
  };
}

const screenshot = await send("Page.captureScreenshot", {format: "png"});
fs.mkdirSync(path.dirname(shot), {recursive: true});
fs.writeFileSync(shot, Buffer.from(screenshot.data, "base64"));
const finalEvent = asrEvents.find(e => e.type === "final" && e.final === true);
const uiText = (ui?.messages || "") + (ui?.status || "");
const result = {
  ok: Boolean(finalEvent && finalEvent.mock === (mode === "mock") &&
    (mode === "real" ? /(microphone test|running outdoors)/i.test(ui?.messages || "")
                     : /speech detected/.test(ui?.messages || "")) &&
    (mode === "real" ? /腾讯云定稿/.test(uiText) : /模拟音频/.test(uiText))) &&
    (!args.includes("--ai-consent") || (aiCheck?.realAi && aiCheck?.groundedCards)),
  mode, initial, ui, finalEvent: finalEvent || null,
  asrEvents: asrEvents.length,
  asrTypes: asrEvents.map(e => ({type: e.type, status: e.status, mock: e.mock, text: e.text})),
  aiCheck,
  screenshot: shot,
  note: mode === "real"
    ? "REAL Tencent ASR from synthesized speech; NOT a human-voice acceptance."
    : "MOCK ONLY; not real speech recognition and not a paid-AI test.",
};
console.log(JSON.stringify(result, null, 2));
asr.close();
ws.close();
process.exit(result.ok ? 0 : 1);