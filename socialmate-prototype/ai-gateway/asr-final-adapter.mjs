/**
 * Conflict-free adapter for Tencent ASR final events.
 * The ASR bridge owner imports this module after reviewing his local changes.
 * No calls on interim or mock. No private data sent without consent.
 */
import {analyze} from "./core.mjs";
export function createAsrFinalAdapter({
  data,
  env=process.env,
  fetchImpl=fetch,
  minIntervalMs=2500,
  now=()=>Date.now()
}={}){
  const sessions=new Map();
  return {
    async accept(event,{sessionId,consent=false,provider="deepseek",model=undefined,includePersonal=false}={}){
      if(!event || event.mock===true || event.type!=="final" || event.final!==true)return {skipped:"not-real-final"};
      const text=String(event.text??"").trim().slice(0,700);
      if(!text)return {skipped:"empty"};
      const key=String(sessionId||event.sessionId||"").trim();
      if(!key)return {skipped:"missing-session"};
      if(!consent)return {skipped:"consent-required"};
      let session=sessions.get(key);
      if(!session){session={messages:[],ids:new Set(),lastCallAt:-Infinity};sessions.set(key,session);}
      const id=[event.track||"mix",event.index??"",event.startMs??"",event.endMs??"",text].join(":");
      if(session.ids.has(id))return {skipped:"duplicate"};
      session.ids.add(id);
      const speaker=event.speaker==="self"?"self":event.speaker==="friend"?"friend":"unknown";
      session.messages.push({speaker,text});
      session.messages=session.messages.slice(-8);
      if(now()-session.lastCallAt<minIntervalMs)return {skipped:"throttled"};
      session.lastCallAt=now();
      return analyze({consent:true,provider,model,includePersonal,messages:session.messages},{data,env,fetchImpl});
    },
    reset(sessionId){sessions.delete(String(sessionId));},
    counts(){return {activeSessions:sessions.size};}
  };
}
