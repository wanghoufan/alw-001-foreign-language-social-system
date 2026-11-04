import {execFileSync} from "node:child_process";
const SERIAL="REDACTED-SERIAL";
const adb=(...a)=>execFileSync("adb",["-s",SERIAL,...a],{encoding:"utf8"}).trim();
const pid=adb("shell","pidof","app.socialmate.dualmic").split(/\s+/)[0];
adb("forward","tcp:19222",`localabstract:webview_devtools_remote_${pid}`);
const list=await (await fetch("http://127.0.0.1:19222/json/list")).json();
const page=list.find(t=>t.type==="page");
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener("open",r));
let id=0;const pend=new Map();
ws.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
const send=(m,p={})=>new Promise(r=>{id++;pend.set(id,r);ws.send(JSON.stringify({id,method:m,params:p}))});
await send("Runtime.enable");
const ev=async e=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});return r.result?.value};
const out = await ev(`(async function(){
  const t = await (await fetch('/v12/api/demo/write-ticket',{cache:'no-store'})).json();
  const res = await fetch('/v12/api/demo/people/demo-oliver-uk/pending/pnd_notexist/ignore',
    {method:'POST',headers:{'Content-Type':'application/json','x-sm-write':t.ticket},body:JSON.stringify({confirm:true})});
  const body = await res.json().catch(()=>null);
  const noTicket = await fetch('/v12/api/demo/clear',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"confirm":true}'});
  const noTicketBody = await noTicket.json().catch(()=>null);
  return JSON.stringify({withTicket:{status:res.status,code:body&&body.code},withoutTicket:{status:noTicket.status,code:noTicketBody&&noTicketBody.code}});
})()`);
console.log(out);
process.exit(0);
