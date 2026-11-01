import fs from 'fs'; import path from 'path';
import WebSocket from './vendor/ws/index.js';
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page = list.find(x=>x.type==='page' && x.url.includes('socialmate-v1.2'));
if(!page) throw new Error('phone page not found');
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.on('open',r));
let id=0, pend=new Map(); ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.exceptionDetails?{__error:r.exceptionDetails.exception?.description}:r.result.value};
const shot=async n=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve('socialmate-v1.2/screenshots',n+'.png'),Buffer.from(s.data,'base64'))};
await send('Page.enable'); await send('Runtime.enable'); await new Promise(r=>setTimeout(r,600));
const out={};
out.viewport=await ev('({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,url:location.href,title:document.title})');
await ev('document.querySelector("[data-nav=chat]").click()'); await new Promise(r=>setTimeout(r,250)); await shot('phone-01-chat');
await ev('document.querySelector("[data-act=start]").click()'); await new Promise(r=>setTimeout(r,200));
out.modal=await ev('document.querySelector("#confirm")!==null');
await ev('document.querySelector("#confirm").checked=true;document.querySelector("[data-action=startok]").click()'); await new Promise(r=>setTimeout(r,250));
await ev('document.querySelector("[data-sample=running]").click()'); await new Promise(r=>setTimeout(r,500)); await shot('phone-02-running');
out.chat=await ev(`({cards:[...document.querySelectorAll('.autorec b')].map(x=>x.textContent.trim()),
  coach:document.querySelector('#coachresults').innerText.split('\\n').slice(0,6),
  bubbles:document.querySelectorAll('.bubble').length,
  manualClosed:!document.querySelector('details.manualextra').open})`);
await ev('document.querySelector(".autorec").click()'); await new Promise(r=>setTimeout(r,400)); await shot('phone-03-detail');
out.detail=await ev('({open:document.querySelector("#drawer").classList.contains("open"),text:document.querySelector("#drawerbody").innerText.slice(0,120)})');
await ev('document.querySelector("#closeDrawer").click()'); await new Promise(r=>setTimeout(r,300)); await shot('phone-04-back');
out.back=await ev('({open:document.querySelector("#drawer").classList.contains("open"),bubbles:document.querySelectorAll(".bubble").length})');
await ev('document.querySelector("#theme").click()'); await new Promise(r=>setTimeout(r,300)); await shot('phone-05-dark');
out.dark=await ev('document.documentElement.getAttribute("data-theme")');
out.overflow=await ev('({sw:document.documentElement.scrollWidth,iw:innerWidth})');
const checks={cards:out.chat.cards.includes('万绿园')&&out.chat.cards.includes('海口湾滨海步道')&&out.chat.cards.includes('白沙门公园'),
  coach:out.chat.coach.length>0,manual:out.chat.manualClosed,detail:out.detail.open,
  keepSession:out.back.bubbles===out.chat.bubbles&&!out.back.open,dark:out.dark==='dark',noOverflow:out.overflow.sw<=out.overflow.iw};
out.summary={passed:Object.values(checks).every(Boolean),at:new Date().toISOString(),checks};
console.log(JSON.stringify(out,null,2));fs.writeFileSync('socialmate-v1.2/phone-test-result.json',JSON.stringify(out,null,2));
ws.close(); process.exit(out.summary.passed?0:1);
