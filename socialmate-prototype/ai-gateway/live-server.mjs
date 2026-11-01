#!/usr/bin/env node
/**
 * All-in-one ALW-001 local dev: same process runs Tencent ASR bridge on 8790
 * and private read-only V1.2 + AI / SSE on 8791.
 * In-process callback, no public transcript webhook and no shared relay secret.
 *
 * Run from repo root:
 * node --env-file-if-exists=android-poc/asr-bridge/.env \
 *      --env-file-if-exists=socialmate-prototype/ai-gateway/.env \
 *      socialmate-prototype/ai-gateway/live-server.mjs
 */
// Fail closed: .env files are loaded by Node before this module executes.
// Never allow private speech/AI requests with certificate validation disabled.
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
  console.error("[socialmate-live] BLOCKED: TLS certificate verification disabled. Remove NODE_TLS_REJECT_UNAUTHORIZED=0 from the launch environment or private .env and restart.");
  process.exit(78);
}

// Load application modules only after the TLS preflight passes.
const {liveAsrHub} = await import("./live-asr-hub.mjs");
const {createAsrBridgeServer} = await import("../../android-poc/asr-bridge/src/server.js");

let bridge=null;
let shuttingDown=false;
let restartTimer=null;
let restartCount=0;
let setAsrCapability=null;
const MAX_RESTARTS=5;
let AI_PORT="8791";

function bridgeOptions(){
  return {onEvent:e=>liveAsrHub.publish(e)};
}

async function startAsr(){
  bridge=await createAsrBridgeServer(bridgeOptions());
  const module=await import("./server.mjs");
  setAsrCapability=module.setAsrBridge;
  setAsrCapability(bridge);
  if(!AI_PORT)AI_PORT=String(process.env.SOCIALMATE_AI_PORT||8791);
  console.log("[socialmate-live] ASR:",bridge.url,"mode:",bridge.mode,
    "| combined capability advertised on http://127.0.0.1:"+AI_PORT+"/api/asr/status");
  console.log("[socialmate-live] UI:  http://127.0.0.1:"+AI_PORT+"/v12");
  if(bridge.mock)console.warn("[socialmate-live] MOCK ASR: captions are not real speech recognition.");
  watchAsrHealth();
}

function watchAsrHealth(){
  const current=bridge;
  if(!current)return;
  current.httpServer.on("close",()=>{
    if(shuttingDown||bridge!==current)return;
    console.error("[socialmate-live] ASR bridge closed unexpectedly; scheduling restart.");
    liveAsrHub.publish({type:"error",text:"ASR 服务已断开，正在自动恢复…",mock:current.mock,
      provider:current.mock?"mock":"tencent",track:"mix"});
    bridge=null;
    setAsrCapability?.(null);
    scheduleRestart();
  });
  current.httpServer.on("error",(error)=>{
    if(shuttingDown||bridge!==current)return;
    console.error("[socialmate-live] ASR bridge error:",error.message);
  });
}

function scheduleRestart(){
  if(shuttingDown||restartTimer)return;
  if(restartCount>=MAX_RESTARTS){
    console.error("[socialmate-live] ASR restart limit reached; manual restart required.");
    return;
  }
  restartCount+=1;
  const delay=Math.min(8000,1000*Math.pow(2,restartCount-1));
  console.warn(`[socialmate-live] ASR restart ${restartCount}/${MAX_RESTARTS} in ${delay}ms`);
  restartTimer=setTimeout(async()=>{
    restartTimer=null;
    if(shuttingDown)return;
    try{
      await startAsr();
      restartCount=0;
      console.log("[socialmate-live] ASR restarted; captions can reconnect.");
      liveAsrHub.publish({type:"session",status:"ready",text:"ASR 服务已恢复，可直接接收字幕",
        mock:bridge.mock,provider:bridge.mock?"mock":"tencent",track:"mix",final:false});
    }catch(error){
      console.error("[socialmate-live] ASR restart failed:",error.message);
      scheduleRestart();
    }
  },delay);
}

async function shutdown(signal){
  if(shuttingDown)return;
  shuttingDown=true;
  if(restartTimer){clearTimeout(restartTimer);restartTimer=null;}
  console.log("[socialmate-live] Shutting down on",signal);
  liveAsrHub.close();
  try{await bridge?.close();}finally{process.exit(0);}
}

process.on("SIGINT",()=>void shutdown("SIGINT"));
process.on("SIGTERM",()=>void shutdown("SIGTERM"));
process.on("unhandledRejection",(reason)=>{
  console.error("[socialmate-live] Unhandled rejection:",reason?.message||reason);
});

try{
  // ASR first: the AI server's health endpoint must advertise the combined
  // capability from its very first request, otherwise installers can mistake
  // an old AI-only server for this combined service.
  await startAsr();
}catch(error){
  console.error("[socialmate-live] Could not start ASR bridge:",error.message);
  console.error("[socialmate-live] Port 8790 might already be in use; run socialmate-v1.2/service-v040.sh status");
  process.exit(1);
}