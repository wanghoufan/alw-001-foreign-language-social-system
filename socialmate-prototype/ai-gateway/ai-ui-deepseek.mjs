import {spawn} from 'child_process';import fs from 'fs';import path from 'path';
import WebSocket from '../../socialmate-v1.2/vendor/ws/index.js';
const PORT=9342;
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/ai-ds-${Date.now()}`,'--window-size=390,900','http://127.0.0.1:8791/'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let t;
for(let i=0;i<60;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();t=l.find(x=>x.type==='page'&&x.url.includes('8791'));if(t)break}catch{}await sleep(250)}
if(!t)throw new Error('no page');
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.on('open',r));let id=0,p=new Map();
ws.on('message',d=>{const m=JSON.parse(d);if(m.id&&p.has(m.id)){p.get(m.id)(m);p.delete(m.id)}});
const send=(m,params={})=>new Promise((res,rej)=>{const i=++id;p.set(i,x=>x.error?rej(new Error(JSON.stringify(x.error))):res(x.result));ws.send(JSON.stringify({id:i,method:m,params}))});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true});return r.exceptionDetails?{__error:r.exceptionDetails.exception?.description}:r.result.value};
await send('Page.enable');await send('Runtime.enable');await sleep(900);
await ev('[...document.querySelectorAll("button")].find(b=>b.innerText.trim()==="聊天").click()');await sleep(250);
await ev('[...document.querySelectorAll("button")].find(b=>b.innerText.includes("开始演示会话")).click()');await sleep(250);
await ev('document.querySelector("#demoConsent").checked=true;document.querySelector("#cloudConsent").checked=true;');
await ev('[...document.querySelectorAll("#modalRoot button")].find(b=>b.innerText==="进入演示").click()');await sleep(300);
await ev('[...document.querySelectorAll("button")].find(b=>b.innerText.includes("户外跑步")).click()');
let status='';
for(let i=0;i<50;i++){await sleep(500);status=await ev('document.querySelector(".ai-status-bar .mini-tag")?.innerText||""');if(status.startsWith('真实 AI')||status.includes('模型未连接')||status.includes('未授权'))break;}
const cards=await ev('[...document.querySelectorAll(".rec-card h3")].map(x=>x.textContent.trim())');
const coach=await ev('document.querySelector(".coach-content")?.innerText.slice(0,700)');
const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.resolve('screenshots','ai-ui-deepseek-real.png'),Buffer.from(s.data,'base64'));
const out={status,cards,coach,ok:status.startsWith('真实 AI · DeepSeek')&&cards.includes('万绿园')};
console.log(JSON.stringify(out,null,2));fs.writeFileSync('ai-ui-result.json',JSON.stringify(out,null,2));
ws.close();chrome.kill();process.exit(out.ok?0:1);
