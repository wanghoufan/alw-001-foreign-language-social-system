import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
const dataset=JSON.parse(html.match(/<script type="application\/json" id="dataset">([\s\S]*?)<\/script>/)[1]);
const logic=[...html.matchAll(/<script(?:\s+[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).at(-1);

function createHarness({origin="http://127.0.0.1:8791",cloudConsent=true,search="",manualStart=true,immediateTimers=false}={}){
  const nodes=new Map(),hooks={},apiCalls=[],streams=[];
  const node=q=>{
    if(!nodes.has(q)){
      const n={innerHTML:"",textContent:"",value:"",checked:false,style:{},dataset:{},
        addEventListener(){},setAttribute(){},insertAdjacentHTML(where,text){this.innerHTML=text+this.innerHTML},
        classList:{add(){},remove(){},toggle(){}}};
      nodes.set(q,n);
    }
    return nodes.get(q);
  };
  const document={
    documentElement:{dataset:{},setAttribute(k,v){this.dataset[k.replace("data-","")]=v}},
    getElementById(id){return id==="dataset"?{textContent:JSON.stringify(dataset)}:node("#"+id)},
    querySelector:node,querySelectorAll(){return []},
    addEventListener(k,fn){hooks[k]=fn},
    body:{appendChild(){}},createElement(){return {style:{},click(){},remove(){}}}
  };
  class EventSourceMock{
    constructor(url){this.url=url;this.events={};this.closed=false;streams.push(this);}
    addEventListener(k,fn){this.events[k]=fn;}
    emit(k,payload){if(!this.closed)this.events[k]?.({data:JSON.stringify(payload)});}
    close(){this.closed=true;}
  }
  const window={
    location:{origin,search},scrollTo(){},EventSource:EventSourceMock,
    fetch:async(url,req)=>{
      apiCalls.push({url,body:JSON.parse(req.body)});
      return{ok:true,json:async()=>({
        mode:"real-ai",topic:"跑步",reply:"Nice to meet you.",
        questions:["Do you usually run in the morning?"],
        share:"I can show you a nice park.",
        references:[{kind:"place",id:"39"}]
      })};
    }
  };
  const storage={getItem(){return null},setItem(){}};
  const timer=fn=>{if(immediateTimers)fn();return 1;};
  vm.runInNewContext(logic,{window,document,localStorage:storage,
    setTimeout:timer,clearTimeout(){},confirm:()=>true,Date,URL,Blob,console},{timeout:3000});
  const click=dataset=>hooks.click({target:{closest(query){const m=query.match(/^\[data-([a-z]+)\]$/);return m&&Object.hasOwn(dataset,m[1])?{dataset}:null;}}});
  if(manualStart){
    click({nav:"chat"});click({act:"start"});
    node("#confirm").checked=true;node("#cloudConsent").checked=cloudConsent;
    node("#providerChoice").value="deepseek/deepseek-flash";
    click({action:"startok"});
  }
  return {click,node,apiCalls,streams,hooks};
}
const finalEvent=(id,{mock=false,when=1200}={})=>({
  type:"final",final:true,mock,provider:mock?"mock":"tencent",
  sessionId:"test-session",track:"mix",speaker:"spk_0",index:id,
  startMs:when,endMs:when+800,text:mock?"[mock] speech detected 800 ms":"I like running outdoors."
});
async function drain(){for(let i=0;i<16;i++)await Promise.resolve();}
test("real subtitles use private same-origin EventSource; interim NEVER calls paid AI",()=>{
  const h=createHarness();h.click({act:"connect-asr"});
  assert.equal(h.streams.length,1);
  assert.equal(h.streams[0].url,"/api/asr/live");
  h.streams[0].emit("asr",{type:"interim",mock:false,final:false,
    text:"I like runn...",sessionId:"test-session",speaker:"spk_0"});
  assert.equal(h.apiCalls.length,0);
  assert.match(h.node("#asrInterim").textContent,/I like runn/);
  assert.doesNotMatch(h.node("#content").innerHTML,/腾讯云定稿/);
});
test("mock final produces visible mock subtitle, NO model billing",()=>{
  const h=createHarness();h.click({act:"connect-asr"});
  h.streams[0].emit("asr",finalEvent(1,{mock:true}));
  assert.equal(h.apiCalls.length,0);
  assert.match(h.node("#content").innerHTML,/模拟音频|MOCK/);
  assert.match(h.node("#content").innerHTML,/说话人待确认/);
});
test("real final triggers one AI call, preserves unknown speaker, deduplicates replay",async()=>{
  const h=createHarness();h.click({act:"connect-asr"});
  const event=finalEvent(1);
  h.streams[0].emit("asr",event);
  await drain();
  assert.equal(h.apiCalls.length,1);
  assert.equal(h.apiCalls[0].url,"/api/ai/analyze");
  assert.equal(h.apiCalls[0].body.consent,true);
  assert.equal(h.apiCalls[0].body.messages[0].speaker,"unknown");
  assert.match(h.node("#content").innerHTML,/说话人待确认/);
  assert.match(h.node("#coachresults").innerHTML,/真实 AI/);
  assert.match(h.node("#recresults").innerHTML,/万绿园/);
  h.streams[0].emit("asr",event);
  assert.equal(h.apiCalls.length,1);
});
test("live captions without cloud consent never send text to model",()=>{
  const h=createHarness({cloudConsent:false});h.click({act:"connect-asr"});
  h.streams[0].emit("asr",finalEvent(1));
  assert.equal(h.apiCalls.length,0);
  assert.match(h.node("#content").innerHTML,/I like running outdoors/);
});
test("file-only preview must not open live stream",()=>{
  const h=createHarness({origin:"null"});h.click({act:"connect-asr"});
  assert.equal(h.streams.length,0);
});
test("explicit stop disconnects and prevents events being processed",()=>{
  const h=createHarness();h.click({act:"connect-asr"});
  const source=h.streams[0];h.click({act:"disconnect-asr"});
  assert.equal(source.closed,true);
  source.emit("asr",finalEvent(1));
  assert.equal(h.apiCalls.length,0);
});

test("live=1 auto-opens a session and reconnects after a dropped SSE stream",()=>{
  const h=createHarness({search:"?live=1&from=android",manualStart:false,immediateTimers:true});
  assert.equal(h.streams.length,1);
  assert.equal(h.streams[0].url,"/api/asr/live");
  h.streams[0].emit("ready",{ok:true});
  h.streams[0].emit("asr",finalEvent(1,{mock:true}));
  assert.match(h.node("#content").innerHTML,/\[mock\] speech detected/);
  assert.equal(h.apiCalls.length,0);
  // Network drop -> onerror -> automatic EventSource reconnect, no user tap.
  h.streams[0].onerror();
  assert.equal(h.streams.length,2);
  assert.equal(h.streams.at(-1).url,"/api/asr/live");
});

test("live mode keeps cloud AI off until the user ticks the explicit consent box",async()=>{
  const h=createHarness({search:"?live=1",manualStart:false});
  assert.equal(h.streams.length,1);
  assert.match(h.node("#content").innerHTML,/id="liveCloudConsent"/);
  assert.match(h.node("#content").innerHTML,/默认不发送/);
  h.streams[0].emit("asr",finalEvent(1));
  await drain();
  assert.equal(h.apiCalls.length,0);
  h.node("#liveCloudConsent").checked=true;
  h.hooks.change({target:{id:"liveCloudConsent",checked:true}});
  await drain();
  assert.equal(h.apiCalls.length,1);
});
