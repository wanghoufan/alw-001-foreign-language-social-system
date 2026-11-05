import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

const PORT = 9334;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = `/tmp/sm-chrome-v152p-${process.pid}`;
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], {stdio: 'ignore'});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
    for (let i = 0; i < 60; i += 1) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const page = list.find((x) => x.type === 'page');
            if (page) return page;
        } catch { /* retry */ }
        await sleep(200);
    }
    throw new Error('no target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, {once: true}); ws.addEventListener('error', rej, {once: true}); });
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
function send(method, params = {}) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
        pending.set(id, (m) => m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result));
        ws.send(JSON.stringify({id, method, params}));
        setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('timeout ' + method)); } }, 20000);
    });
}
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {width: 393, height: 852, deviceScaleFactor: 2, mobile: true});
await send('Page.navigate', {url: 'http://127.0.0.1:8791/v12'});
await sleep(2500);

async function ev(expression) {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
}

await ev(`(function(){
  S.session={id:'probe',messages:[
    {id:'p1',who:'friend',text:'Just arrived in Haikou, and the weather is so humid.',source:'tencent',speaker:'spk_0'},
    {id:'p2',who:'me',text:'Yes, it rains a lot in the afternoon here.',source:'tencent',speaker:'self'},
    {id:'p3',who:'friend',text:'I would like to find a coffee shop near the park.',source:'tencent',speaker:'spk_0'}
  ],date:'2026-11-05',cloudConsent:false,provider:'deepseek',model:'deepseek-flash',liveMode:true,speakerMap:{spk_0:'Mia Chen'}};
  S.asrState='ready';S.aiState='demo';S.ai=null;
  S.recs=[{kind:'place',id:'41',title:'海口湾滨海步道',en:'x'},{kind:'place',id:'1',title:'龙兴路',en:'x'},{kind:'story',id:'haikou',title:'关于我 · 我来自海口',en:'x'}];
  S.v152.immersive=true;setTab('chat');S.suggFreeze=false;showRecs(true);
})()`);
await sleep(300);

const base = await ev(`(() => {
  const box=(s)=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}};
  const cs=(s,prop)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[prop]:null};
  const cards=[...document.querySelectorAll('.v152card')];
  return {
    cardHeights:cards.slice(0,6).map(c=>Math.round(c.getBoundingClientRect().height)),
    h3:document.querySelectorAll('.v152coach h3').length,
    enSize:cs('.v152card .suggtext','fontSize'),
    zhSize:cs('.v152zh','fontSize')||null,
    bubbleEnSize:cs('.v152bubble .v152en','fontSize'),
    barHeight:box('#v152bar')?box('#v152bar').h:null,
    chips:[...document.querySelectorAll('.v152chip')].map(x=>x.textContent.trim()),
    chipHeight:box('.v152chip')?box('.v152chip').h:null,
    stopButtonSize:cs('.v152stop','fontSize'),
    barOrder:[...document.querySelectorAll('#v152bar > *')].map(x=>x.tagName+(x.className?'.'+String(x.className).split(' ')[0]:'')),
    backReturn:(function(){const before=S.asrState;const r=window.smBack();return {r,immersive:S.v152.immersive,stateBefore:before,stateAfter:S.asrState,messages:S.session?S.session.messages.length:0}})()
  };
})()`);
console.log('BASE', JSON.stringify(base, null, 2));

await ev(`S.v152.immersive=true;setTab('chat');showRecs(true);document.querySelectorAll('.v152chip')[0].click()`);
await sleep(300);
const share = await ev(`(() => {
 const sheet=document.querySelector('#v152share');
 const text=sheet?sheet.innerText:null;
 const btn=[...document.querySelectorAll('#v152share [data-v152]')].map(b=>b.dataset.v152+':'+b.textContent.trim());
 return {open:!!sheet,text,btn,shareTextSize:sheet?getComputedStyle(sheet.querySelector('.v152sharetext')||sheet).fontSize:null};
})()`);
console.log('SHARE', JSON.stringify(share, null, 2));

await ev(`document.querySelector('[data-v152="origin"]').click()`);
await sleep(300);
const origin = await ev(`(() => {
 const root=document.querySelector('#v152origin');
 const text=root?root.innerText:null;
 const imgs=[...document.querySelectorAll('#v152origin img')].map(i=>({src:i.getAttribute('src'),w:i.naturalWidth,h:i.naturalHeight}));
 const pill=document.querySelector('.v152livepill');
 return {open:!!root,text,imgs,pill:pill?pill.innerText:null,headerSize:root?getComputedStyle(root.querySelector('h1')).fontSize:null,
  bodySize:root?getComputedStyle(root.querySelector('.v152block p')||root).fontSize:null,
  top:document.body.classList.contains('sm-immersive'),
  footer:document.querySelector('.v152originfoot')?document.querySelector('.v152originfoot').innerText:null};
})()`);
console.log('ORIGIN', JSON.stringify(origin, null, 2));

await ev(`document.querySelector('[data-v152="back-chat"]').click()`);
await sleep(200);
await ev(`SAV.theme='dark';theming&&theming()`);
await sleep(300);
const dark = await ev(`(() => {
 const cs=(s,p)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null};
 return {theme:document.documentElement.getAttribute('data-theme'),bg:cs('body','backgroundColor'),ink:cs('.v152bubble .v152en','color'),
  cardBg:cs('.v152card','backgroundColor'),cardInk:cs('.v152card .suggtext','color'),bar:cs('#v152bar','backgroundColor')};
})()`);
console.log('DARK', JSON.stringify(dark, null, 2));

ws.close();
chrome.kill('SIGTERM');
process.exit(0);