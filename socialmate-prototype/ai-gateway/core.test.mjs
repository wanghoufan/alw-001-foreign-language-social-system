import {test} from "node:test";
import assert from "node:assert/strict";
import {PROVIDERS,AiError,status,validateRequest,topicFrom,candidatesFor,validateModelOutput,analyze} from "./core.mjs";

const data={
 places:[
  {id:39,name:"万绿园",en:"Locals come here to run outdoors.",cn:"跑步散步的绿地"},
  {id:41,name:"海口湾滨海步道",en:"A waterfront walk in Haikou.",cn:"海边散步"},
  {id:45,name:"白沙门公园",en:"A seaside park with shady walking paths.",cn:"海边公园"},
  {id:3,name:"骑楼老街",en:"Old architecture and cafes.",cn:"历史街区"}
 ],
 apps:[{id:"P001",name:"English portfolio app",category:"A",en:"A software project"}],
 storyExamples:[{id:"coffee",title:"我喜欢咖啡",en:"I often make lattes.",status:"confirmed",keywords:["coffee"]},
   {id:"secret",title:"待确认",en:"Unknown story",status:"review",keywords:["coffee"]}]
};
const messages=[{speaker:"friend",text:"I love running outdoors. Where can I run in Haikou?"}];
const valid={consent:true,messages,provider:"deepseek"};
test("official endpoint and correct model IDs",()=>{
  assert.equal(PROVIDERS.deepseek.model,"deepseek-flash");
  assert.equal(PROVIDERS["opencode-go"].model,"deepseek-v4.1-flash");
  assert.equal(PROVIDERS["opencode-go"].url,"https://opencode.ai/inference/go/openai/v1/chat/completions");
  assert.equal(status({}).deepseek.configured,false);
});
test("strict consent and valid provider/model",()=>{
  assert.throws(()=>validateRequest({messages}),e=>e.code==="CONSENT_REQUIRED");
  assert.throws(()=>validateRequest({consent:true,messages,provider:"fake"}),e=>e.code==="INVALID_PROVIDER");
  assert.equal(validateRequest({...valid,model:"deepseek-v4-pro"}).model,"deepseek-v4-pro");
});
test("running automatically retrieves 3 grounded Hainan destinations",()=>{
  assert.equal(topicFrom("I love jogging outdoors"),"running");
  const found=candidatesFor(messages,data,false).candidates;
  assert.deepEqual(found.slice(0,3).map(x=>x.id),["39","41","45"]);
  assert.equal(found.some(x=>x.kind==="story"),false);
});
test("personal context requires additional opt-in and excludes unconfirmed draft",()=>{
  const q=[{speaker:"friend",text:"Let's talk about coffee"}];
  assert.equal(candidatesFor(q,data,false).candidates.some(x=>x.kind==="story"),false);
  const found=candidatesFor(q,data,true).candidates;
  assert.equal(found.some(x=>x.id==="coffee"&&x.kind==="story"),true);
  assert.equal(found.some(x=>x.id==="secret"),false);
});
test("model cannot invent place ID or rewrite corpus references",()=>{
  const result=validateModelOutput({topic:"户外跑步",reply:"That sounds nice.",
    questions:["Do you run at night?","Where do you usually run?"],
    share:"I can show you a local park.",references:[
      {kind:"place",id:"39"},{kind:"place",id:"999"},{kind:"story",id:"secret"}]},
    [{kind:"place",id:"39",title:"万绿园"}]);
  assert.deepEqual(result.references,[{kind:"place",id:"39",title:"万绿园"}]);
});
test("missing API key is explicit, never reported real",async()=>{
  await assert.rejects(analyze(valid,{data,env:{}}),e=>e.code==="PROVIDER_NOT_CONFIGURED");
});
test("real DeepSeek provider sends bounded JSON and disables thinking",async()=>{
  let target,body,auth;
  const fetchImpl=async(url,options)=>{
    target=url;body=JSON.parse(options.body);auth=options.headers.Authorization;
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      topic:"户外运动",reply:"That's lovely!",questions:["Do you enjoy parks?","Morning or evening?"],
      share:"I can show you a park in Haikou.",references:[{kind:"place",id:"39"},{kind:"place",id:"999"}]
    })}}]})};
  };
  const response=await analyze(valid,{data,env:{DEEPSEEK_API_KEY:"only_fake_test_secret_000"},fetchImpl});
  assert.equal(target,"https://api.deepseek.com/chat/completions");
  assert.equal(body.model,"deepseek-flash");
  assert.equal(body.thinking.type,"disabled");
  assert.equal(body.response_format.type,"json_object");
  assert.equal(auth,"Bearer only_fake_test_secret_000");
  assert.equal(response.mode,"real-ai");
  assert.deepEqual(response.references.map(r=>r.id),["39","41","45"]);
  assert.equal(response.referenceMode,"model+retrieval");
});
test("OpenCode Go uses its own key and model",async()=>{
  let target,model,headers;
  const fetchImpl=async(url,options)=>{target=url;model=JSON.parse(options.body).model;headers=options.headers;
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      reply:"Hi!",questions:["What do you like?"],share:"I can show you a place.",references:[]
    })}}]})};
  };
  const response=await analyze({...valid,provider:"opencode-go",model:"deepseek-v4.1-flash"},{
    data,env:{OPENCODE_GO_API_KEY:"only_fake_go_test_000"},fetchImpl});
  assert.match(target,/opencode\.ai\/inference\/go\/openai\/v1/);
  assert.equal(model,"deepseek-v4.1-flash");
  assert.equal(response.provider,"opencode-go");
  assert.ok(headers["x-opencode-session"],"OpenCode Go 需要 x-opencode-session 才能路由");
});
test("429, bad JSON and invalid endpoint cause explicit errors",async()=>{
  await assert.rejects(analyze(valid,{data,env:{DEEPSEEK_API_KEY:"only_fake_test_000"},fetchImpl:async()=>({ok:false,status:429})}),e=>e.code==="PROVIDER_LIMIT");
  await assert.rejects(analyze({...valid,provider:"opencode-go"},{
    data,env:{OPENCODE_GO_API_KEY:"only_fake_go_test_000",OPENCODE_GO_API_URL:"http://127.0.0.1/private"}}),e=>e.code==="INVALID_ENDPOINT");
});

test("invalid JSON retries once, then succeeds",async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;
    if(calls===1)return {ok:true,json:async()=>({choices:[{message:{content:"not json"}}]})};
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      reply:"Hello!",questions:["How are you?"],share:"I can show you a place.",references:[]
    })}}]})};
  };
  const r=await analyze(valid,{data,env:{DEEPSEEK_API_KEY:"only_fake_test_secret_000"},fetchImpl});
  assert.equal(calls,2);assert.equal(r.mode,"real-ai");
});
