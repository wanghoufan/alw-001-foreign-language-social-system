import {test} from "node:test";
import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {createLiveAsrHub} from "./live-asr-hub.mjs";

function client(){
  const req=new EventEmitter(),res=new EventEmitter(),messages=[];
  res.headers={};res.writableEnded=false;res.destroyed=false;
  res.writeHead=(code,headers)=>{res.status=code;res.headers=headers;};
  res.write=text=>{messages.push(text);return true;};
  res.end=text=>{if(text)messages.push(text);res.writableEnded=true;res.emit("close");};
  return{req,res,messages};
}
test("final ASR event forwarded with explicit mock and source, no audio or extra secrets",()=>{
  const hub=createLiveAsrHub(),a=client();
  assert.equal(hub.subscribe(a.req,a.res),true);
  assert.equal(hub.listenerCount(),1);
  assert.equal(hub.publish({type:"final",sessionId:"abc",track:"mix",speaker:"spk_0",text:"Hello!",
    mock:false,provider:"tencent",startMs:0,endMs:600,index:7,final:true,
    audio:"private PCM audio",SecretKey:"NEVER"}),true);
  const event=a.messages.at(-1);
  assert.match(event,/event: asr/);
  const line=event.split("\n").find(x=>x.startsWith("data: "));
  const parsed=JSON.parse(line.slice(6));
  assert.deepEqual({type:parsed.type,provider:parsed.provider,mock:parsed.mock,speaker:parsed.speaker},
    {type:"final",provider:"tencent",mock:false,speaker:"spk_0"});
  assert.equal("audio" in parsed,false);
  assert.equal("SecretKey" in parsed,false);
  hub.close();
  assert.equal(hub.listenerCount(),0);
});
test("mock flag, interim and backpressure preserved; invalid events ignored",()=>{
  const hub=createLiveAsrHub(),a=client();
  hub.subscribe(a.req,a.res);
  assert.equal(hub.publish({type:"unsafe",text:"test"}),false);
  hub.publish({type:"interim",text:"mock text",mock:true,provider:"tencent",track:"A"});
  const parsed=JSON.parse(a.messages.at(-1).split("\n")[1].slice(6));
  assert.equal(parsed.mock,true);
  assert.equal(parsed.provider,"mock");
  assert.equal(parsed.final,false);
  hub.close();
});
test("only two local observers at a time; closes detach",()=>{
  const hub=createLiveAsrHub({maxListeners:2}),a=client(),b=client(),c=client();
  assert.equal(hub.subscribe(a.req,a.res),true);
  assert.equal(hub.subscribe(b.req,b.res),true);
  assert.equal(hub.subscribe(c.req,c.res),false);
  assert.equal(c.res.status,429);
  a.req.emit("close");
  assert.equal(hub.listenerCount(),1);
  hub.close();
  assert.equal(hub.listenerCount(),0);
});
