import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

const PORT = 9333;
const OUT = process.argv[2] || '/tmp/sm-v152';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/sm-chrome-v152-${process.pid}`;

await fs.mkdir(OUT, {recursive: true});

const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--force-device-scale-factor=1',
    'about:blank',
], {stdio: 'ignore'});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
    for (let i = 0; i < 50; i += 1) {
        try {
            const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const list = await res.json();
            const page = list.find((x) => x.type === 'page');
            if (page) return page;
        } catch { /* retry */ }
        await sleep(200);
    }
    throw new Error('chrome devtools not ready');
}

class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id && this.pending.has(msg.id)) {
                const {resolve, reject} = this.pending.get(msg.id);
                this.pending.delete(msg.id);
                if (msg.error) reject(new Error(JSON.stringify(msg.error)));
                else resolve(msg.result);
            }
        });
    }

    send(method, params = {}) {
        const id = ++this.id;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject});
            this.ws.send(JSON.stringify({id, method, params}));
            setTimeout(() => {
                if (this.pending.has(id)) {
                    this.pending.delete(id);
                    reject(new Error(`CDP timeout: ${method}`));
                }
            }, 20000);
        });
    }
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once: true});
    ws.addEventListener('error', reject, {once: true});
});
const cdp = new Cdp(ws);

await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {width: 393, height: 852, deviceScaleFactor: 2, mobile: true});

await cdp.send('Page.navigate', {url: 'http://127.0.0.1:8791/v12'});
await sleep(2500);

async function evaluate(expression) {
    const r = await cdp.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
}

async function shot(name) {
    const r = await cdp.send('Page.captureScreenshot', {format: 'png'});
    await fs.writeFile(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}

async function measure(label) {
    const data = await evaluate(`(() => {
      const q=(s)=>document.querySelector(s);
      const box=(s)=>{const e=q(s);if(!e)return null;const r=e.getBoundingClientRect();return {h:Math.round(r.height),w:Math.round(r.width),top:Math.round(r.top),bottom:Math.round(r.bottom)}};
      const vis=(s)=>{const e=q(s);if(!e)return null;const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'};
      const coach=q('#suggestionArea');
      const coachBox=coach?coach.getBoundingClientRect():null;
      const cards=[...document.querySelectorAll('.v152card')];
      const visibleCards=coachBox?cards.filter(c=>{const r=c.getBoundingClientRect();return r.top>=coachBox.top-2&&r.bottom<=coachBox.bottom+2}).length:null;
      const zhSamples=[...document.querySelectorAll('.v152bubble .v152zh, .v152card .v152zh')].map(e=>e.textContent.trim()).filter(Boolean).slice(0,5);
      return {
        label:${JSON.stringify(label)},
        viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
        immersive:document.body.classList.contains('sm-immersive'),
        topVisible:vis('.top'), tabVisible:vis('.mobilebar'),
        barButtons:document.querySelectorAll('#v152bar button, #v152bar select').length,
        subs:box('#v152subs'), coach:box('#suggestionArea'),
        ratio:box('#v152subs')&&box('#suggestionArea')?(box('#v152subs').h/box('#suggestionArea').h).toFixed(3):null,
        cards:cards.length, visibleCards,
        speakCopy:document.querySelectorAll('.v152card [data-sspeak], .v152card [data-scopy]').length,
        zhSamples,
        chips:document.querySelectorAll('.v152chip').length,
        chipTip:!!q('.v152chiptip'),
        hasPanelTitle:/关联资料|对话原文|最近 3 句|英文为主|来自你已有的数据库/.test(document.body.innerText),
        share:!!q('#v152share'), origin:!!q('#v152origin'),
        stopSheet:/本轮已停止/.test(document.body.innerText),
        barText:q('#v152bar')?q('#v152bar').innerText.replace(/\\n+/g,' | '):null,
        state:S.asrState, messages:S.session?S.session.messages.length:0,
        englishOnlyBubbles:[...document.querySelectorAll('.v152bubble')].every(b=>!b.querySelector('.v152zh'))
      };
    })()`);
    console.log(label, JSON.stringify(data, null, 2));
    return data;
}

const results = [];

await evaluate(`(function(){
  S.session={id:'selftest',messages:[
    {id:'a1',who:'friend',text:'Just arrived in Haikou, and the weather is so humid.',source:'tencent',speaker:'spk_0'},
    {id:'a2',who:'me',text:'Yes, it rains a lot in the afternoon here.',source:'tencent',speaker:'self'},
    {id:'a3',who:'friend',text:'I would like to find a coffee shop near the park.',source:'tencent',speaker:'spk_0'}
  ],date:'2026-11-05 09:50',cloudConsent:false,provider:'deepseek',model:'deepseek-flash',liveMode:true,speakerMap:{spk_0:'Mia Chen'}};
  S.asrState='ready';S.asrLink='';S.aiState='demo';S.ai=null;
  S.recs=[
    {kind:'place',id:'41',title:'海口湾滨海步道',en:'A seaside walk along Haikou Bay.'},
    {kind:'place',id:'1',title:'龙兴路',en:'A short street with cafes and vintage shops.'},
    {kind:'story',id:'haikou',title:'关于我 · 我来自海口',en:'I was born and raised in Haikou.'}
  ];
  S.v152.immersive=true;
  setTab('chat');
  S.suggFreeze=false;
  showRecs(true);
})()`);
await sleep(400);
results.push(await measure('immersive-default'));
await shot('01-immersive');

await evaluate(`document.querySelector('[data-v152tr]').click()`);
await sleep(200);
results.push(await measure('translate-one'));
await shot('02-translate');

await evaluate(`document.querySelector('.v152chip').click()`);
await sleep(300);
results.push(await measure('share-open'));
await shot('03-share');

await evaluate(`document.querySelector('[data-v152="origin"]').click()`);
await sleep(300);
results.push(await measure('origin-view'));
await shot('04-origin');

await evaluate(`document.querySelector('[data-v152="back-chat"]').click()`);
await sleep(200);
results.push(await measure('back-chat'));
await shot('05-back');

await evaluate(`document.querySelector('[data-v152="menu"]').click()`);
await sleep(200);
results.push(await measure('menu'));
await shot('06-menu');

await evaluate(`document.querySelector('[data-v152="stop"]').click()`);
await sleep(500);
results.push(await measure('stop-sheet'));
await shot('07-stop');

await evaluate(`S.v152.stopSheet=false;S.v152.immersive=false;S.asrState='off';smApplyImmersive();render()`);
await sleep(200);
results.push(await measure('exit-fullscreen'));
await shot('08-exit');

await fs.writeFile(`${OUT}/result.json`, JSON.stringify(results, null, 2));
console.log('OUT', OUT);
ws.close();
chrome.kill('SIGTERM');
process.exit(0);