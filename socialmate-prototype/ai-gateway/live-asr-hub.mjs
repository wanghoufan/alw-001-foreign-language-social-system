/**
 * Private, in-process ASR event fan-out to the localhost browser.
 * NO audio storage, NO external endpoint, NO API credential sharing.
 * One running ASR bridge calls hub.publish(event) after its own WebSocket sends the event.
 */
export function createLiveAsrHub({maxListeners=2,heartbeatMs=20000}={}){
  const subscribers=new Set();
  const allowed=new Set(["interim","final","session","error"]);
  function clean(event){
    if(!event||!allowed.has(event.type))return null;
    return {
      type:event.type,
      sessionId:String(event.sessionId||"").slice(0,80),
      track:["A","B","mix"].includes(event.track)?event.track:"mix",
      speaker:String(event.speaker||"unknown").slice(0,32),
      text:String(event.text||"").slice(0,700),
      final:event.final===true,
      mock:event.mock===true,
      provider:event.mock===true?"mock":event.provider==="tencent"?"tencent":"unknown",
      status:String(event.status||"").slice(0,32),
      index:Number.isInteger(event.index)?event.index:null,
      startMs:Number.isFinite(event.startMs)?Math.max(0,event.startMs):0,
      endMs:Number.isFinite(event.endMs)?Math.max(0,event.endMs):0,
      // T2：只透传候选标识与数量，不透传逐字以外的任何服务端状态。
      pendingId:event.pendingId?String(event.pendingId).slice(0,64):null,
      pendingCount:Number.isInteger(event.pendingCount)?event.pendingCount:null
    };
  }
  function publish(event){
    const data=clean(event);
    if(!data)return false;
    const line="event: asr\ndata: "+JSON.stringify(data)+"\n\n";
    for(const receiver of subscribers){
      if(receiver.writableEnded||receiver.destroyed){subscribers.delete(receiver);continue;}
      try{
        // A slow listener is dropped instead of buffering unlimited private transcripts.
        if(!receiver.write(line))receiver.end();
      }catch{subscribers.delete(receiver);}
    }
    return true;
  }
  function subscribe(req,res){
    if(subscribers.size>=maxListeners){
      res.writeHead(429,{"Content-Type":"application/json","Cache-Control":"no-store"});
      res.end(JSON.stringify({ok:false,code:"TOO_MANY_LISTENERS"}));return false;
    }
    res.writeHead(200,{
      "Content-Type":"text/event-stream; charset=utf-8",
      "Cache-Control":"no-store, no-transform",
      "Connection":"keep-alive",
      "X-Accel-Buffering":"no",
      "X-Content-Type-Options":"nosniff"
    });
    res.write("event: ready\ndata: "+JSON.stringify({ok:true,service:"local-asr"})+"\n\n");
    subscribers.add(res);
    const beat=setInterval(()=>{if(!res.writableEnded)res.write(": heartbeat\n\n");},heartbeatMs);
    beat.unref?.();
    const detach=()=>{clearInterval(beat);subscribers.delete(res);};
    req.on("close",detach);
    res.on("close",detach);
    return true;
  }
  function close(){
    for(const res of subscribers){try{res.end();}catch{}}
    subscribers.clear();
  }
  return {publish,subscribe,close,listenerCount:()=>subscribers.size};
}
export const liveAsrHub=createLiveAsrHub();
