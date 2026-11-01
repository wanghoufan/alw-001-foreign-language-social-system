import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import {createAsrBridgeServer} from "../src/server.js";
import {stereoPcm16,closeWebSocket,waitForEvent,silentLogger} from "../test-support/helpers.js";

test("asr-bridge optional onEvent mirrors events without changing Android WebSocket contract",{
  timeout:15000
},async()=>{
  const copy=[],bridge=await createAsrBridgeServer({
    port:0,host:"127.0.0.1",forceMock:true,
    logger:silentLogger,onEvent:e=>copy.push(e)
  });
  let client;
  try{
    client=new WebSocket(bridge.url+"?track=mix&rate=48000&channels=2");
    const webEvents=[];
    client.on("message",buf=>{try{webEvents.push(JSON.parse(buf.toString("utf8")));}catch{}});
    await new Promise((resolve,reject)=>{client.once("open",resolve);client.once("error",reject);});
    const pcm=Buffer.concat([
      Buffer.alloc(48_000*4/5),
      stereoPcm16({sampleRate:48_000,durationMs:900,leftFreq:500,rightFreq:600,leftAmplitude:.45,rightAmplitude:.3}),
      Buffer.alloc(48_000*4/2)
    ]);
    for(let i=0;i<pcm.length;i+=19200)client.send(pcm.subarray(i,i+19200));
    client.send(JSON.stringify({type:"end"}));
    const end=await waitForEvent(webEvents,e=>e.type==="session"&&e.status==="ended",5000);
    assert.equal(end.mock,true);
    assert.equal(copy.some(e=>e.type==="final"&&e.mock===true),true);
    const mirrored=copy.find(e=>e.type==="final");
    assert.equal(typeof mirrored.sessionId,"string");
    assert.equal(mirrored.sessionId.length>0,true);
    assert.equal(mirrored.track,"mix");
    assert.equal(mirrored.mock,true);
    assert.ok(webEvents.some(e=>e.type==="final"&&e.sessionId===mirrored.sessionId));
  }finally{
    if(client)await closeWebSocket(client);
    await bridge.close();
  }
});
test("subscriber callback errors do not interrupt audio recognition",{
  timeout:15000
},async()=>{
  const bridge=await createAsrBridgeServer({
    port:0,host:"127.0.0.1",forceMock:true,
    logger:silentLogger,onEvent:()=>{throw Error("subscriber offline");}
  });
  let client;
  try{
    client=new WebSocket(bridge.url+"?track=mix&rate=48000&channels=2");
    const events=[];
    client.on("message",buf=>{try{events.push(JSON.parse(buf.toString("utf8")));}catch{}});
    await new Promise((resolve,reject)=>{client.once("open",resolve);client.once("error",reject);});
    client.send(JSON.stringify({type:"end"}));
    const ended=await waitForEvent(events,e=>e.type==="session"&&e.status==="ended",5000);
    assert.equal(ended.status,"ended");
  }finally{
    if(client)await closeWebSocket(client);
    await bridge.close();
  }
});
