import {spawn} from 'node:child_process';
const PORT=9335;
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const chrome=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/sm-c2-${process.pid}`,'--hide-scrollbars','--no-first-run','--no-default-browser-check','--disable-gpu','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function target(){for(let i=0;i<60;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(x=>x.type==='page');if(p)return p}catch{}await sleep(200)}throw Error('no target')}
const page=await target();const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true})});
let seq=0;const pend=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pend.set(id,m=>m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result));ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pend.has(id)){pend.delete(id);reject(Error('timeout '+method))}},20000)});
await send('Page.enable');await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride',{width:393,height:852,deviceScaleFactor:2,mobile:true});
await send('Page.navigate',{url:'http://127.0.0.1:8791/v12'});await sleep(2500);
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value};
await ev(`(function(){
 S.session={id:'p2',messages:[{id:'q1',who:'friend',text:'Just arrived in Haikou, and the weather is so humid.',source:'tencent',speaker:'spk_0'},{id:'q2',who:'me',text:'Yes, it rains a lot in the afternoon here.',source:'tencent',speaker:'self'},{id:'q3',who:'friend',text:'I would like to find a coffee shop near the park.',source:'tencent',speaker:'spk_0'}],date:'x',cloudConsent:false,provider:'deepseek',model:'deepseek-flash',liveMode:true,speakerMap:{spk_0:'Mia Chen'}};
 S.asrState='ready';S.aiState='demo';S.ai=null;
 S.recs=[{kind:'place',id:'41',title:'海口湾滨海步道',en:'x'},{kind:'person',id:'li',title:'李雷',en:'x'}];
 S.people={mode:'demo',state:'idle',note:'',list:[{slug:'li',name:'李雷',about:'我在海口工作，喜欢跑步。'}],detail:null,err:'',suggest:null,prepItems:[],drafts:null};
 S.v152.immersive=true;setTab('chat');S.suggFreeze=false;showRecs(true);
})()`);
await sleep(300);
const r1=await ev(`(()=>{
 const cs=(s,p)=>{const e=document.querySelector(s);return e?getComputedStyle(e)[p]:null};
 const cards=[...document.querySelectorAll('.v152card')];
 const first=cards[0];
 first.querySelector('[data-v152zh]').click();
 const before=cards.map(c=>!!c.querySelector('.v152zh'));
 const fav=first.querySelector('[data-v152fav]');
 fav.click();
 return {suggEn:cs('.v152card .suggtext','fontSize'),suggZh:cs('.v152card .v152zh','fontSize'),bubbleEn:cs('.v152bubble .v152en','fontSize'),
  zhAfterClick:cards.map(c=>!!c.querySelector('.v152zh')),favText:fav.textContent,favOn:fav.classList.contains('on'),h3:document.querySelectorAll('.v152coach h3').length,
  chipHeights:[...document.querySelectorAll('.v152chip')].map(x=>Math.round(x.getBoundingClientRect().height))};
})()`);
console.log('R1',JSON.stringify(r1,null,2));
await ev(`document.querySelectorAll('.v152chip')[1].click()`);await sleep(250);
const r2=await ev(`(()=>{const s=document.querySelector('#v152share');return {open:!!s,text:s?s.innerText:null}})()`);
console.log('PERSON-SHARE',JSON.stringify(r2,null,2));
await ev(`0`);
await ev(`S.v152.share=null;render();S.asrState='off';document.querySelector('[data-v152="stop"]')`);
const r3=await ev(`(()=>{document.querySelector('[data-v152="stop"]')?null:null;S.v152.stopSheet=true;render();return {buttons:[...document.querySelectorAll('#v152root [data-v152]')].map(x=>x.dataset.v152).filter(x=>['finish','discard','resume'].includes(x)),text:document.querySelector('.v152sheet')?document.querySelector('.v152sheet').innerText:null}})()`);
console.log('STOP',JSON.stringify(r3,null,2));
const r4=await ev(`(()=>{
 S.ai={reply:'AI SENTINEL REPLY',questions:['AI Q1','AI Q2','AI Q3'],share:'AI SHARE',topic:'coffee'};
 S.aiState='ready';S.suggFreeze=false;S.v152.stopSheet=false;showRecs(true);
 const cards=[...document.querySelectorAll('.v152card .suggtext')].map(x=>x.textContent);
 const groups=[...document.querySelectorAll('.v152coach .sgroup')].map(g=>({key:g.dataset.sgroup,items:g.querySelectorAll('.v152card').length}));
 S.suggFreeze=true;
 S.ai.reply='AI SENTINEL REPLY 2';
 showRecs();
 const badge=document.querySelector('#suggNewBadge');
 return {firstCards:cards.slice(0,4),groups,badgeVisible:badge?!badge.classList.contains('hidden'):null,badgeText:badge?badge.textContent:null};
})()`);
console.log('AI-FREEZE',JSON.stringify(r4,null,2));
ws.close();chrome.kill('SIGTERM');process.exit(0);
