import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import WebSocket from './vendor/ws/index.js';

const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT=9335; const file='file://'+path.resolve('socialmate-v1.2/index.html');
const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--allow-file-access-from-files',`--remote-debugging-port=${PORT}`,'--user-data-dir=/tmp/sm-topics','--window-size=390,844',file],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let t; for(let i=0;i<40;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.startsWith('file:'));if(t)break}catch{} await sleep(250)}
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));
let id=0,pend=new Map();ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend.set(i,m=>m.error?rej(new Error(JSON.stringify(m.error))):res(m.result));ws.send(JSON.stringify({id:i,method,params}))});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.exceptionDetails?{__error:r.exceptionDetails.exception?.description}:r.result.value};
await send('Page.enable');await send('Runtime.enable');

const cases=[
 {key:'running',kind:'sample',text:''},
 {key:'coffee',kind:'sample',text:''},
 {key:'software',kind:'sample',text:''},
 {key:'beach',kind:'type',text:'I love the beach and sunset by the sea.'},
 {key:'other',kind:'type',text:'I adopted a rescue dog last month.'}
];
const out=[];
for(const c of cases){
 await send('Page.reload'); await sleep(900);
 const r=await ev(`(async()=>{
   document.querySelector('[data-nav="chat"]').click(); await new Promise(r=>setTimeout(r,120));
   document.querySelector('[data-act="start"]').click(); await new Promise(r=>setTimeout(r,150));
   document.querySelector('#confirm').checked=true; document.querySelector('[data-action="startok"]').click(); await new Promise(r=>setTimeout(r,220));
   ${c.kind==='sample'?`document.querySelector('[data-sample="${c.key}"]').click();`:
     `const el=document.querySelector('#msg'); el.value=${JSON.stringify(c.text)}; el.dispatchEvent(new Event('input')); document.querySelector('[data-act="send"]').click();`}
   await new Promise(r=>setTimeout(r,400));
   const manual=document.querySelector('details.manualextra');
   return {cards:[...document.querySelectorAll('.autorec b')].map(x=>x.textContent.trim()),
     coach:document.querySelector('#coachresults').innerText.split('\\n').slice(0,3),
     manualClosed:!manual.open};
 })()`);
 out.push({case:c.key,...r});
}
console.log(JSON.stringify(out,null,2));
fs.writeFileSync('socialmate-v1.2/topic-test-result.json',JSON.stringify(out,null,2));
ws.close();chrome.kill();
const checks={
 running:out[0].cards.includes('万绿园')&&out[0].cards.includes('海口湾滨海步道')&&out[0].cards.includes('白沙门公园'),
 coffee:out[1].cards.some(x=>/龙兴路|滨海新村|咖啡/.test(x)),
 software:out[2].cards.length>0,
 beach:out[3].cards.some(x=>/海口湾|华彩|云洞/.test(x)),
 other:out[4].coach[0]==='继续交流' && out[4].cards.every(x=>!x.includes('万绿园')),
 manual:out.every(x=>x.manualClosed)
};
console.log('CHECKS',JSON.stringify(checks));
console.log(JSON.stringify({passed:Object.values(checks).every(Boolean), at:new Date().toISOString(), checks},null,2));
process.exit(Object.values(checks).every(Boolean)?0:1);
