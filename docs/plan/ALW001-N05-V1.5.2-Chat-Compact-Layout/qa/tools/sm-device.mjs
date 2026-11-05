import fs from 'node:fs/promises';

const PORT = Number(process.argv[2] || 9224);
const OUT = process.argv[3] || 'docs/plan/ALW001-N05-V1.5.2-Chat-Compact-Layout/qa/t10-device';
await fs.mkdir(OUT, {recursive: true});

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((x) => x.type === 'page');
if (!page) throw new Error('没有可调试页面');
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

async function ev(expression) {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
}
async function shot(name) {
    const r = await send('Page.captureScreenshot', {format: 'png'});
    await fs.writeFile(`${OUT}/${name}.png`, Buffer.from(r.data, 'base64'));
}
async function measure(label) {
    const data = await ev(`(() => {
      const q=(s)=>document.querySelector(s);
      const box=(s)=>{const e=q(s);if(!e)return null;const r=e.getBoundingClientRect();return {h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}};
      const vis=(s)=>{const e=q(s);if(!e)return null;const c=getComputedStyle(e);return c.display!=='none'&&c.visibility!=='hidden'};
      const coach=q('#suggestionArea');const cb=coach?coach.getBoundingClientRect():null;
      const cards=[...document.querySelectorAll('.v152card')];
      const visible=cb?cards.filter(c=>{const r=c.getBoundingClientRect();return r.top>=cb.top-2&&r.bottom<=cb.bottom+2}).length:null;
      const cs=(s,p)=>{const e=q(s);return e?getComputedStyle(e)[p]:null};
      return {label:${JSON.stringify(label)},viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio},
       immersive:document.body.classList.contains('sm-immersive'),top:vis('.top'),tab:vis('.mobilebar'),
       barOrder:[...document.querySelectorAll('#v152bar > *')].map(x=>x.tagName),
       subs:box('#v152subs'),coach:box('#suggestionArea'),
       ratio:box('#v152subs')&&box('#suggestionArea')?(box('#v152subs').h/box('#suggestionArea').h).toFixed(3):null,
       cards:cards.length,visible,
       chatEn:cs('.v152bubble .v152en','fontSize'),suggEn:cs('.v152card .suggtext','fontSize'),zhSize:cs('.v152card .v152zh','fontSize'),
       speakCopy:document.querySelectorAll('.v152card [data-sspeak],.v152card [data-scopy]').length,
       zh:[...document.querySelectorAll('.v152bubble .v152zh,.v152card .v152zh')].map(e=>e.textContent.trim()).slice(0,4),
       chips:document.querySelectorAll('.v152chip').length,chipH:box('.v152chip')?box('.v152chip').h:null,
       share:!!q('#v152share'),origin:!!q('#v152origin'),stop:/本轮已停止/.test(document.body.innerText),
       activeSessions:(window.__smHealth&&window.__smHealth.activeSessions)??null,state:S.asrState,messages:S.session?S.session.messages.length:0};
    })()`);
    console.log(label, JSON.stringify(data));
    return data;
}

const results = [];
await ev(`(function(){
  S.session={id:'device-qa',messages:[
    {id:'d1',who:'friend',text:'Just arrived in Haikou, and the weather is so humid.',source:'tencent',speaker:'spk_0'},
    {id:'d2',who:'me',text:'Yes, it rains a lot in the afternoon here.',source:'tencent',speaker:'self'},
    {id:'d3',who:'friend',text:'I would like to find a coffee shop near the park.',source:'tencent',speaker:'spk_0'}
  ],date:'2026-11-05',cloudConsent:false,provider:'deepseek',model:'deepseek-flash',liveMode:true,speakerMap:{spk_0:'Mia Chen'}};
  S.asrState='ready';S.asrLink='';S.aiState='demo';S.ai=null;
  S.recs=[{kind:'place',id:'41',title:'海口湾滨海步道',en:'x'},{kind:'place',id:'1',title:'龙兴路',en:'x'},{kind:'story',id:'haikou',title:'关于我 · 我来自海口',en:'x'}];
  S.v152.immersive=true;setTab('chat');S.suggFreeze=false;showRecs(true);
})()`);
await new Promise(r => setTimeout(r, 500));
results.push(await measure('immersive-default'));
await shot('01-immersive');

await ev(`document.querySelector('[data-v152tr]').click()`);
await new Promise(r => setTimeout(r, 300));
results.push(await measure('translate-one'));
await shot('02-translate');

await ev(`document.querySelector('.v152chip').click()`);
await new Promise(r => setTimeout(r, 400));
results.push(await measure('share-open'));
await shot('03-share');

await ev(`document.querySelector('[data-v152="origin"]').click()`);
await new Promise(r => setTimeout(r, 400));
results.push(await measure('origin-view'));
await shot('04-origin');

await ev(`document.querySelector('[data-v152="back-chat"]').click()`);
await new Promise(r => setTimeout(r, 300));
results.push(await measure('back-chat'));
await shot('05-back');

await ev(`document.querySelector('[data-v152="menu"]').click()`);
await new Promise(r => setTimeout(r, 300));
results.push(await measure('menu'));
await shot('06-menu');

await ev(`document.querySelector('[data-v152="menu-close"]').click();render()`);
await new Promise(r => setTimeout(r, 200));
await ev(`S.v152.stopSheet=true;S.v152.immersive=false;S.asrState='off';smApplyImmersive();render()`);
await new Promise(r => setTimeout(r, 300));
results.push(await measure('stop-sheet'));
await shot('07-stop');

await ev(`S.v152.stopSheet=false;S.v152.view='chat';S.v152.immersive=false;render()`);
await new Promise(r => setTimeout(r, 200));
results.push(await measure('exit-fullscreen'));
await shot('08-exit');

await fs.writeFile(`${OUT}/result.json`, JSON.stringify(results, null, 2));
console.log('OUT', OUT);
ws.close();
process.exit(0);