import {test} from "node:test";
import assert from "node:assert/strict";
import {createAsrFinalAdapter} from "./asr-final-adapter.mjs";
const data={places:[{id:39,name:"万绿园",en:"People run here."},{id:41,name:"海口湾滨海步道",en:"Waterfront"}],apps:[],storyExamples:[]};
const final=(text,index=1)=>({type:"final",final:true,mock:false,track:"mix",speaker:"spk_0",index,
  startMs:index*1000,endMs:index*1000+600,text});
const mockedFetch=async(url,request)=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
  topic:"跑步",reply:"Sounds nice!",questions:["Do you prefer parks?"],share:"I can show you a park.",
  references:[{kind:"place",id:"39"}]
})}}]})});
test("does not bill mock, interim or unconsented transcript",async()=>{
  const a=createAsrFinalAdapter({data,env:{DEEPSEEK_API_KEY:"test_secret_123456789"},fetchImpl:mockedFetch,now:()=>10000});
  assert.equal((await a.accept({...final("running"),type:"interim"},{sessionId:"s",consent:true})).skipped,"not-real-final");
  assert.equal((await a.accept({...final("running"),mock:true},{sessionId:"s",consent:true})).skipped,"not-real-final");
  assert.equal((await a.accept(final("running"),{sessionId:"s",consent:false})).skipped,"consent-required");
  assert.equal(a.counts().activeSessions,0);
});
test("one final event → real AI; dedupe, throttle and reset",async()=>{
  let calls=0,at=10000;
  const adapter=createAsrFinalAdapter({data,env:{DEEPSEEK_API_KEY:"test_secret_123456789"},
    fetchImpl:async(...args)=>{calls++;return mockedFetch(...args)},now:()=>at});
  const opts={sessionId:"meeting1",consent:true,provider:"deepseek"};
  const result=await adapter.accept(final("I enjoy running outside",1),opts);
  assert.equal(result.mode,"real-ai");
  assert.equal(result.references[0].id,"39");
  assert.equal((await adapter.accept(final("I enjoy running outside",1),opts)).skipped,"duplicate");
  assert.equal((await adapter.accept(final("I also like parks",2),opts)).skipped,"throttled");
  at+=3000;
  assert.equal((await adapter.accept(final("Which park is nearby?",3),opts)).mode,"real-ai");
  assert.equal(calls,2);
  adapter.reset("meeting1");
  assert.equal(adapter.counts().activeSessions,0);
});
