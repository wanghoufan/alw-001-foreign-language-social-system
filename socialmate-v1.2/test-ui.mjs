import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import WebSocket from './vendor/ws/index.js';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const file = 'file://' + path.resolve('socialmate-v1.2/index.html');
const shots = path.resolve('socialmate-v1.2/screenshots');
fs.mkdirSync(shots, { recursive: true });
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--allow-file-access-from-files',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/sm-v12-chrome-${Date.now()}`, '--window-size=390,844', file], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const t = list.find((x) => x.type === 'page' && x.url.startsWith('file:'));
      if (t) return t;
    } catch {}
    await sleep(250);
  }
  throw new Error('chrome target not ready');
}
const t = await target();
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((r) => ws.on('open', r));
let id = 0; const pending = new Map();
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) return { __error: r.exceptionDetails.text, desc: r.exceptionDetails.exception?.description };
  return r.result.value;
};

await send('Page.enable'); await send('Runtime.enable'); await sleep(1200);

const result = {};
result.data = await evalJs(`(() => {
  const d = JSON.parse(document.getElementById('dataset').textContent);
  return { apps: d.apps.length, steps: d.apps.reduce((n,a)=>n+a.steps.length,0), places: d.places.length,
    uniquePlaces: new Set(d.places.map(p=>p.id)).size,
    p39: d.places.find(p=>p.id===39)?.cnName, p41: d.places.find(p=>p.id===41)?.cnName, p45: d.places.find(p=>p.id===45)?.cnName,
    tabs: [...document.querySelectorAll('.mobilebar [data-nav]')].map(x=>x.textContent.trim()) };
})()`);

result.chat = await evalJs(`(async () => {
  document.querySelector('[data-nav="chat"]').click();
  await new Promise(r=>setTimeout(r,120));
  const firstView = document.querySelector('#content').innerHTML;
  const banned = /开始演示|开始对话演示|模拟输入|模拟识别完成|手动演示|本地规则模拟|data-sample/.test(firstView);
  const cta = document.querySelector('.chatbar .mainbtn')?.textContent.trim() || '';
  document.querySelector('[data-act="start-recording"]').click();
  await new Promise(r=>setTimeout(r,250));
  document.querySelector('#msg').value = 'I like running outdoors near the sea. Is there a nice park or running route in Haikou?';
  document.querySelector('[data-act="send"]').click();
  await new Promise(r=>setTimeout(r,400));
  const cards=[...document.querySelectorAll('.autorec b')].map(x=>x.textContent.trim());
  const coach=document.querySelector('#coachresults').innerText;
  const bubbles=document.querySelectorAll('.bubble').length;
  document.querySelector('.autorec').click();
  await new Promise(r=>setTimeout(r,300));
  const drawerOpen=document.querySelector('#drawer').classList.contains('open');
  const drawerText=document.querySelector('#drawerbody').innerText;
  const hasMaps=/maps|高德/i.test(drawerText);
  document.querySelector('#closeDrawer').click();
  await new Promise(r=>setTimeout(r,200));
  return {cards, coach, bubbles, drawerOpen, drawerText: drawerText.slice(0,220), hasMaps, banned, cta,
    afterClose:{drawerOpen:document.querySelector('#drawer').classList.contains('open'), bubbles:document.querySelectorAll('.bubble').length}};
})()`);

for (const [w,h,name] of [[360,800,'mobile-360'],[390,844,'mobile-390'],[412,915,'mobile-412'],[430,932,'mobile-430'],[1440,1000,'desktop']]) {
  await send('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<600});
  await sleep(400);
  const shot = await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(path.join(shots,name+'.png'), Buffer.from(shot.data,'base64'));
  result[name]=await evalJs('({sw:document.documentElement.scrollWidth,iw:innerWidth,tab:document.querySelector(".mobilebar .current")?.textContent.trim()})');
}
// dark theme (fresh profile => starts light)
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
result.initialTheme = await evalJs('document.documentElement.getAttribute("data-theme")');
await evalJs('document.querySelector("#theme").click()');
await sleep(300);
const dark = await send('Page.captureScreenshot',{format:'png'});
fs.writeFileSync(path.join(shots,'mobile-390-dark.png'), Buffer.from(dark.data,'base64'));
result.dark=await evalJs('document.documentElement.getAttribute("data-theme") === "dark"');

const checks = {
  apps51: result.data.apps===51, steps204: result.data.steps===204,
  places115: result.data.places===115 && result.data.uniquePlaces===115,
  tabs5: result.data.tabs.length===5,
  // 产品界面不得出现开发/演示态入口：只有真实动作「开始录音」（浏览器退回「连接实时字幕」）。
  noDemoEntry: result.chat.banned===false,
  ctaIsRealAction: result.chat.cta==='开始录音' || result.chat.cta==='连接实时字幕',
  autoCards: result.chat.cards.includes('万绿园') && result.chat.cards.includes('海口湾滨海步道') && result.chat.cards.includes('白沙门公园'),
  drawer: result.chat.drawerOpen && result.chat.hasMaps,
  keepSession: result.chat.afterClose.bubbles===result.chat.bubbles,
  lightDefault: result.initialTheme==='light',
  darkToggle: result.dark===true,
  noOverflow: [360,390,412,430].every(w=>result['mobile-'+w].sw<=result['mobile-'+w].iw)
};
const ok = Object.values(checks).every(Boolean);
result.summary={passed:ok, at:new Date().toISOString(), checks};
console.log(JSON.stringify(result,null,2));
fs.writeFileSync('socialmate-v1.2/ui-test-result.json', JSON.stringify(result,null,2));
ws.close(); chrome.kill();
process.exit(ok?0:1);
