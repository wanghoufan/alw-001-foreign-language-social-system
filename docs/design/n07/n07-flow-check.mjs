import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PROFILE = "/tmp/n07-flow-profile";
const PORT = 9335;
const PAGE = pathToFileURL(path.join(HERE, "n07-prototype.html")).href;
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
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
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

const results = [];
function add(step, pass, detail) {
  results.push({ step, pass, detail });
  console.log((pass ? "PASS " : "FAIL ") + step + " | " + JSON.stringify(detail));
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
  await cmd("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await cmd("Page.navigate", { url: PAGE });
  await sleep(800);

  const ev = async (expr) => (await cmd("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  add("初始为未开始", await ev("document.getElementById('stateText').textContent==='未开始' && document.getElementById('btnMain').textContent==='开始'"), await ev("document.getElementById('stateText').textContent"));

  await ev("document.getElementById('btnEn').click()");
  add("未开始点译英只提示不计费", await ev("document.getElementById('toast').textContent.indexOf('先说一句中文')>=0 && document.getElementById('stateText').textContent==='未开始'"), await ev("document.getElementById('toast').textContent"));

  await ev("document.getElementById('btnMain').click()");
  add("开始后进入录音中", await ev("document.getElementById('stateText').textContent==='录音中' && document.getElementById('btnMain').textContent==='暂停' && document.querySelectorAll('.bubble').length===3"), await ev("document.querySelectorAll('.bubble').length"));
  const t1 = await ev("document.getElementById('timer').textContent");
  await sleep(1300);
  const t2 = await ev("document.getElementById('timer').textContent");
  add("录音中计时递增", t1 !== t2, { t1, t2 });

  await ev("document.querySelector('.bubble[data-id=\"m2\"]').click()");
  add("可先点中文气泡选中目标", await ev("document.querySelector('.bubble[data-id=\"m2\"]').classList.contains('pick')"), await ev("document.querySelector('.bubble[data-id=\"m2\"]').className"));

  await ev("document.getElementById('btnEn').click()");
  add("译英请求中按钮禁用", await ev("document.getElementById('btnEn').textContent==='翻译中' && document.getElementById('btnEn').disabled===true"), await ev("document.getElementById('btnEn').textContent"));
  await sleep(1200);
  add("译文嵌入原中文气泡", await ev("(()=>{const d=document.querySelector('.draft');return !!d && d.closest('.bubble').dataset.id==='m2' && d.textContent.indexOf('I haven')===0 && !d.querySelector('button')})()"), await ev("(document.querySelector('.draft')||{}).textContent"));

  const tm1 = await ev("document.getElementById('timer').textContent");
  await sleep(1300);
  add("译英期间录音继续计时", tm1 !== (await ev("document.getElementById('timer').textContent")), { tm1, tm2: await ev("document.getElementById('timer').textContent") });

  await ev("document.getElementById('btnMain').click()");
  add("暂停后状态/麦克风/主按钮一致", await ev("document.getElementById('stateText').textContent==='已暂停' && document.getElementById('btnMain').textContent==='继续' && document.getElementById('micBadge').textContent==='麦克风已关闭' && document.getElementById('interim').textContent.indexOf('已暂停')>=0"), await ev("[document.getElementById('stateText').textContent,document.getElementById('micBadge').textContent]"));

  const pt1 = await ev("document.getElementById('timer').textContent");
  await sleep(1300);
  add("暂停后计时冻结", pt1 === (await ev("document.getElementById('timer').textContent")), { pt1, pt2: await ev("document.getElementById('timer').textContent") });

  await ev("document.getElementById('btnEn').click()");
  add("暂停态点译英不暗中恢复采音", await ev("document.getElementById('stateText').textContent==='已暂停' && document.getElementById('micBadge').textContent==='麦克风已关闭' && document.getElementById('toast').textContent.indexOf('已经译好')>=0"), await ev("document.getElementById('toast').textContent"));

  await ev("document.getElementById('btnMain').click()");
  add("继续回到同一轮并追加字幕", await ev("document.getElementById('stateText').textContent==='录音中' && document.querySelectorAll('.sysline').length===1 && document.querySelectorAll('.bubble').length===5 && !!document.querySelector('.bubble[data-id=\"m5\"]')"), await ev("[document.querySelectorAll('.bubble').length,document.querySelectorAll('.sysline').length]"));

  await ev("document.getElementById('btnMore').click()");
  add("⋯ 菜单可打开且含结束本轮", await ev("document.getElementById('sheet').classList.contains('open') && document.querySelector('[data-act=end]')!==null"), await ev("document.getElementById('sheet').className"));
  await ev("document.querySelector('[data-act=end]').click()");
  add("结束本轮需二次确认", await ev("document.getElementById('modal').hidden===false && document.getElementById('stateText').textContent==='录音中'"), await ev("document.getElementById('modal').hidden"));
  await ev("document.getElementById('mEnd').click()");
  add("确认后封存且主按钮回开始", await ev("document.getElementById('stateText').textContent==='已结束' && document.getElementById('btnMain').textContent==='开始' && document.getElementById('micBadge').textContent==='本轮已封存' && document.getElementById('modal').hidden===true"), await ev("document.getElementById('stateText').textContent"));
  add("结束后译英禁用", await ev("document.getElementById('btnEn').disabled===true"), await ev("document.getElementById('btnEn').disabled"));

  await ev("document.getElementById('btnMain').click()");
  add("结束后重新开始为新的一轮", await ev("document.getElementById('stateText').textContent==='录音中' && document.querySelectorAll('.sysline').length===0 && document.querySelectorAll('.bubble').length===3 && !document.querySelector('.draft')"), await ev("[document.querySelectorAll('.sysline').length,document.querySelectorAll('.draft').length]"));

  await ev("document.getElementById('protoTheme').click()");
  add("可切深色", await ev("document.documentElement.dataset.theme==='dark'"), await ev("document.documentElement.dataset.theme"));
  await ev("document.getElementById('protoTheme').click()");
  add("可切回浅色", await ev("document.documentElement.dataset.theme==='light'"), await ev("document.documentElement.dataset.theme"));

  add("界面无禁用控件文案", await ev("!/发送|复制|自动朗读|中文模式|英文模式/.test(document.getElementById('app').innerText)"), await ev("(document.getElementById('app').innerText.match(/发送|复制|自动朗读|中文模式|英文模式/g)||[])"));

  fs.writeFileSync(path.join(HERE, "n07-flow-check.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
  const failed = results.filter((r) => !r.pass).length;
  console.log(`TOTAL ${results.length} / FAIL ${failed}`);
  if (failed) process.exitCode = 1;
} finally {
  try { if (ws) ws.close(); } catch {}
  chrome.kill("SIGTERM");
  await sleep(300);
  fs.rmSync(PROFILE, { recursive: true, force: true });
}