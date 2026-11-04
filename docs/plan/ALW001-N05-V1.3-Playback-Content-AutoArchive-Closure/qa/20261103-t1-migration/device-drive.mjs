#!/usr/bin/env node
/**
 * ALW-001 N05 V1.3 · 真机 WebView CDP 驱动（只用 Node 标准库）
 *
 * 用途：在 Note11 上打开红城湖记录、按真实用户点击顺序点按钮、
 * 读取页面里的播放队列时间线（window.__smQueueLog()）与状态，
 * 并截图取证。所有点击都用 CDP Input.dispatchMouseEvent 打到真实坐标，
 * 不是直接调用页面函数。
 *
 * 用法：
 *   node device-drive.mjs <命令> [参数]
 *   node device-drive.mjs eval "<js>"        在页面里求值并打印结果
 *   node device-drive.mjs tap "<selector>"   点某个元素（真实坐标）
 *   node device-drive.mjs shot <文件名>       截图到 qa/20261103-t5/shots/
 *   node device-drive.mjs log                读取播放队列时间线
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

const QA = "/Users/zzymima0000/Developer/coding/1.Active/alw-001-外语社交系统/docs/plan/ALW001-N05-V1.3-Playback-Content-AutoArchive-Closure/qa/20261103-t5";
const SHOTS = path.join(QA, "shots");
const CDP = "http://127.0.0.1:" + (process.env.SM_CDP_PORT || "9222");

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(new Error("bad json: " + data.slice(0, 200))); } });
    }).on("error", reject);
  });
}

async function connect() {
  const list = await httpJson(CDP + "/json");
  const page = list.find((t) => t.type === "page" && String(t.url).includes("/v12"));
  if (!page) throw new Error("找不到 /v12 页面：" + JSON.stringify(list.map((t) => t.url)));
  const { default: WebSocket } = await import("node:worker_threads").then(() => ({ default: globalThis.WebSocket }));
  const ws = new globalThis.WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", rej);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  return { send, close: () => ws.close() };
}

async function evaluate(cdp, expr) {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("JS 异常: " + JSON.stringify(r.exceptionDetails).slice(0, 600));
  return r.result.value;
}

async function tapSelector(cdp, selector, index = 0) {
  const sel = JSON.stringify(selector);
  const pick = `(function(){
    var els=Array.from(document.querySelectorAll(${sel})).filter(function(e){
      var r=e.getBoundingClientRect(); return r.width>0&&r.height>0;
    });
    var el=els[${index}]; if(!el) return null;
    el.scrollIntoView({block:'center'});
    return true;
  })()`;
  // 有遮挡弹窗先关掉（不是本次要测的控件），否则点击会落到弹窗上
  const closed = await evaluate(cdp, `(function(){
    var open=document.querySelector('#modalbg.open,#modalbg.open');
    if(!open) return 'none';
    var btn=open.querySelector('.modalclose,[data-action="close"],#closeModal');
    if(btn){ btn.click(); return 'clicked'; }
    var ev=new KeyboardEvent('keydown',{key:'Escape',bubbles:true}); document.dispatchEvent(ev); return 'escape';
  })()`);
  if (closed !== 'none') await new Promise((r) => setTimeout(r, 350));
  await evaluate(cdp, "document.documentElement.style.scrollBehavior='auto';true");
  if (!(await evaluate(cdp, pick))) throw new Error("找不到可见元素: " + selector + "[" + index + "]");
  // 兜底：浏览器 scrollIntoView 偶尔不带动自定义滚动容器，这里手动把每个可滚动祖先滚到位，最多重试 3 次
  for (let attempt = 0; attempt < 8; attempt++) {
    await new Promise((r) => setTimeout(r, 400));
    const need = await evaluate(cdp, `(function(){
      var els=Array.from(document.querySelectorAll(${sel})).filter(function(e){
        var r=e.getBoundingClientRect(); return r.width>0&&r.height>0;
      });
      var el=els[${index}]; if(!el) return 'missing';
      var r=el.getBoundingClientRect();
      if(r.top>=0&&r.bottom<=window.innerHeight+1) return 'ok';
      // 只操作最近的可滚动祖先（多次滚动会互相抵消），没有就滚 window
      var node=el.parentElement, box=null;
      while(node&&node!==document.documentElement){
        if(node.scrollHeight>node.clientHeight+4){ box=node; break; }
        node=node.parentElement;
      }
      var er=el.getBoundingClientRect();
      if(box){
        var cr=box.getBoundingClientRect();
        box.scrollTop += (er.top-cr.top)-box.clientHeight/2;
      }else{
        window.scrollBy(0,(er.top-window.innerHeight/2));
      }
      return 'scrolled';
    })()`);
    if (need === 'ok') {
      // 等布局真正稳定：两次测量位置一致才点，避免平滑滚动/动画中途点到别处
      const a = await evaluate(cdp, `(()=>{var e=Array.from(document.querySelectorAll(${sel})).filter(function(x){var r=x.getBoundingClientRect();return r.width>0&&r.height>0;})[${index}];return e?e.getBoundingClientRect().top:-1})()`);
      await new Promise((r) => setTimeout(r, 220));
      const b = await evaluate(cdp, `(()=>{var e=Array.from(document.querySelectorAll(${sel})).filter(function(x){var r=x.getBoundingClientRect();return r.width>0&&r.height>0;})[${index}];return e?e.getBoundingClientRect().top:-1})()`);
      if (Math.abs(a - b) < 1) break;
      continue;
    }
    if (need === 'missing') throw new Error("滚不到元素: " + selector);
  }
  const box = await evaluate(cdp, `(function(){
    var els=Array.from(document.querySelectorAll(${sel})).filter(function(e){
      var r=e.getBoundingClientRect(); return r.width>0&&r.height>0;
    });
    var el=els[${index}]; if(!el) return null;
    var r=el.getBoundingClientRect();
    return {x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height,vh:window.innerHeight,
      text:(el.textContent||'').trim().slice(0,40),inView:(r.top>=0&&r.bottom<=window.innerHeight+1)};
  })()`);
  if (!box) throw new Error("滚不到元素: " + selector);
  if (!box.inView) throw new Error("元素不在可视区: " + JSON.stringify(box));
  for (const type of ["mousePressed", "mouseReleased"]) {
    await cdp.send("Input.dispatchMouseEvent", { type, x: box.x, y: box.y, button: "left", clickCount: 1 });
  }
  await new Promise((r) => setTimeout(r, 200));
  delete box.vh; delete box.inView;
  return box;
}

async function shot(cdp, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const r = await cdp.send("Page.captureScreenshot", { format: "png" });
  const file = path.join(SHOTS, name.endsWith(".png") ? name : name + ".png");
  fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  return file;
}

const [cmd, arg1, arg2] = process.argv.slice(2);
const cdp = await connect();
try {
  if (cmd === "eval") console.log(JSON.stringify(await evaluate(cdp, arg1), null, 2));
  else if (cmd === "tap") console.log(JSON.stringify(await tapSelector(cdp, arg1, Number(arg2) || 0)));
  else if (cmd === "shot") console.log(await shot(cdp, arg1));
  else if (cmd === "emulate") {
    const w = Number(arg1) || 360, h = Number(arg2) || 640;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
    await new Promise((r) => setTimeout(r, 600));
    console.log(JSON.stringify(await evaluate(cdp, `({w:innerWidth,h:innerHeight,overflowX:document.documentElement.scrollWidth>innerWidth})`)));
  }
  else if (cmd === "emulate-off") {
    await cdp.send("Emulation.clearDeviceMetricsOverride");
    console.log("cleared");
  }
  else if (cmd === "waitfor") {
    const cap = Number(arg2) || 20000;
    const t0 = Date.now();
    let ok = false;
    while (Date.now() - t0 < cap) {
      ok = await evaluate(cdp, `!!Array.from(document.querySelectorAll(${JSON.stringify(arg1)})).find(function(e){var r=e.getBoundingClientRect();return r.width>0&&r.height>0;})`);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log(JSON.stringify({ selector: arg1, found: ok, waitedMs: Date.now() - t0 }));
    if (!ok) process.exitCode = 2;
  }
  else if (cmd === "log") console.log(JSON.stringify(await evaluate(cdp, "window.__smQueueLog?window.__smQueueLog():[]"), null, 2));
  else if (cmd === "state") console.log(JSON.stringify(await evaluate(cdp, "({q:window.__smQueueState?window.__smQueueState():null,state:document.querySelector('[data-tts-state]')&&document.querySelector('[data-tts-state]').textContent})"), null, 2));
  else throw new Error("未知命令: " + cmd);
} finally {
  cdp.close();
}
