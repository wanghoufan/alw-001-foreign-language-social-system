/**
 * ALW-001 AI preview bridge: private localhost-only server.
 * cd socialmate-prototype/ai-gateway && node --env-file-if-exists=.env server.mjs
 * No CORS; only same-origin HTML may use the API from the browser.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import {fileURLToPath} from "node:url";
import {analyze,AiError,status,PROVIDERS} from "./core.mjs";
import {liveAsrHub} from "./live-asr-hub.mjs";
import {readProfile,writeProfile,tightenPermissions} from "./profile-store.mjs";
import {createPersonFile,listPeople,suggestSlug} from "./people-store.mjs";
import {getPersonDetail,getPersonPrep,revokePersonFact} from "./person-detail.mjs";
import {addFavorite,listFavorites,removeFavorite} from "./favorites-store.mjs";
import {confirmReview} from "./review-confirm.mjs";
import {buildAiReview,buildLocalReview} from "./session-review.mjs";
import {addDemoFact,bulkDeleteDemoFacts,clearDemo,confirmDemoPending,deleteDemoFact,demoConversationsRoot,demoRoot,demoStatus,editDemoFact,ensureDemoSeeded,ignoreDemoPending,injectDemoFinal,listInbox,listPersonas,moveDemoFactsGroup,readDemoChangelog,readPersona,readSession,restoreDemo,undoDemoChangelog} from "./demo-store.mjs";
import {demoArchiveStatus,pushDemoArchive} from "./demo-archive.mjs";
import {clear as clearLiveFacts,confirmLivePending,ignoreLivePending,listLiveFacts,pending as pendingLiveFacts,status as liveFactsStatus,withdrawLiveFact} from "./live-facts.mjs";
import {createWriteGuard,sameOriginOf,WRITE_HEADER} from "./demo-write-guard.mjs";
import {claimPairing,isLoopback,issuePairingCode,listDevices,pairingCodeStatus,refreshToken,revokeDevice,verifyToken} from "./pairing.mjs";
import {createManualFactsStore} from "./manual-facts.mjs";
import {callDeepSeekMatch,createPlaceNotesStore} from "./place-notes.mjs";
import {createPrivatePlaces} from "./private-places.mjs";
import {CardError, createPrivateCards} from "./private-cards.mjs";
import {createPracticeReportsStore} from "./practice-reports.mjs";
import {createLearningArchive} from "./learning-archive.mjs";
import {assertPrivacy, createTtsService, normalizeSpeakRequest} from "./tts-providers.mjs";
import {sha256Hex} from "./tts-cache.mjs";
import {isPrivateIp} from "./lan-net.mjs";
import {startLanDiscovery} from "./lan-discovery.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const proto=path.resolve(here,"..");
const repoRoot=path.resolve(here,"..","..");
const PORT=Number(process.env.SOCIALMATE_AI_PORT||8791);
const HOST=String(process.env.SOCIALMATE_HOST||"").trim()||"127.0.0.1"; // 局域网模式由启动脚本显式开启；默认仍只绑回环。
// User-authorized DeepSeek budget. Conservative peak rates (yuan / 1M tokens):
// official pricing 2026-11: cache hit 0.04, miss 2, output 8 for deepseek-flash.
const BUDGET_LIMIT=Math.max(0,Number(process.env.DEEPSEEK_BUDGET_CNY||1));
const BUDGET_FILE=process.env.DEEPSEEK_BUDGET_FILE||path.join(here,".local","ai-budget.json");
const RESERVE_CNY=0.01; // one bounded reply cannot exceed this at current rates
// 界面偏好（朗读音色/引擎）：局域网与 Tailscale 两个访问地址共用同一份，避免换网后音色重置导致缓存全部失效。
const UI_PREFS_FILE=path.join(repoRoot,"SocialMate-Data","Prefs","ui.json");
const UI_PREF_VOICES=new Set(["zh_female_xiaohe_uranus_bigtts","zh_male_m191_uranus_bigtts","zh_female_yingyujiaoxue_uranus_bigtts"]);
async function readUiPrefs(){
  try{
    const parsed=JSON.parse(await fs.readFile(UI_PREFS_FILE,"utf8"));
    return parsed&&typeof parsed==="object"?parsed:{};
  }catch{return {};}
}
async function writeUiPrefs(next){
  await fs.mkdir(path.dirname(UI_PREFS_FILE),{recursive:true});
  await fs.writeFile(UI_PREFS_FILE,JSON.stringify(next,null,2),{mode:0o600});
}
let budget={spentCny:0,calls:0,updatedAt:null};
try{budget={...budget,...JSON.parse(await fs.readFile(BUDGET_FILE,"utf8"))};}catch{}
function budgetStatus(){
  const spent=Number(budget.spentCny)||0;
  return {limitCny:BUDGET_LIMIT,spentCny:Number(spent.toFixed(6)),
    remainingCny:Number(Math.max(0,BUDGET_LIMIT-spent).toFixed(6)),calls:Number(budget.calls)||0,
    reserveCny:RESERVE_CNY,updatedAt:budget.updatedAt||null};
}
export function estimateDeepSeekCost(usage){
  if(!usage||typeof usage!=="object")return 0.01; // unknown usage: conservative flat reserve
  const hit=Number(usage.prompt_cache_hit_tokens)||0;
  const prompt=Number(usage.prompt_tokens)||0;
  const miss=Number.isFinite(Number(usage.prompt_cache_miss_tokens))
    ? Number(usage.prompt_cache_miss_tokens)
    : Math.max(0,prompt-hit);
  const out=Number(usage.completion_tokens)||0;
  return (hit*0.04+miss*2+out*8)/1_000_000;
}
async function recordDeepSeekUsage(usage){
  const cost=estimateDeepSeekCost(usage);
  budget.spentCny=(Number(budget.spentCny)||0)+cost;
  budget.calls=(Number(budget.calls)||0)+1;
  budget.updatedAt=new Date().toISOString();
  await fs.mkdir(path.dirname(BUDGET_FILE),{recursive:true});
  await fs.writeFile(BUDGET_FILE,JSON.stringify(budget,null,2),"utf8");
}
// Set by live-server.mjs only after the in-process ASR bridge is listening.
// This is what distinguishes the combined service from the old standalone AI-only server.
let asrBridge=null;
export function setAsrBridge(bridge){
  if(!bridge){asrBridge=null;return;}
  const {mode,mock,port,url,httpServer,activeSessions,budget}=bridge;
  asrBridge={mode,mock,port,url,httpServer,activeSessions,budget};
}
function asrStatus(){
  if(!asrBridge)return {combined:false,asr:null};
  const active=typeof asrBridge.activeSessions==="function"?asrBridge.activeSessions():0;
  const budget=typeof asrBridge.budget==="function"?asrBridge.budget():null;
  return {combined:true,asr:{mode:asrBridge.mode,mock:asrBridge.mock===true,port:asrBridge.port,
    url:asrBridge.url,activeSessions:active,...(budget?{budget}:{})}};
}
const STATIC=new Map([
  ["/","index.html"],["/index.html","index.html"],
  ["/app.js","app.js"],["/styles.css","styles.css"],["/data.js","data.js"],
  ["/public-share.html","public-share.html"],["/public-share.js","public-share.js"],
  ["/public-places.js","public-places.js"]
]);
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
/** 单段 Range 解析（bytes=a-b / a- / -n）；非法返回 {invalid:true}，交由路由回 416。 */
function parseRange(header,total){
  const raw=String(header||"").trim();
  if(!raw)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(raw);
  if(!match)return {invalid:true};
  let start=match[1]===""?null:Number(match[1]);
  let end=match[2]===""?null:Number(match[2]);
  if(start===null&&end===null)return {invalid:true};
  if(start===null){
    const suffix=end;
    if(!Number.isFinite(suffix)||suffix<=0)return {invalid:true};
    start=Math.max(0,total-suffix);end=total-1;
  }else if(end===null||end>=total){
    end=total-1;
  }
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||start>=total)return {invalid:true};
  return {start,end};
}
function json(res,code,obj){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(JSON.stringify(obj));
}
/**
 * 静态文本资源（页面/脚本）的 send：no-cache + ETag + gzip。
 * 原实现统一 no-store：真机离开 WiFi（蜂窝 + Tailscale）时每次冷启动都要重下 582KB 页面，
 * 首屏和地点详情明显慢。no-cache 仍要求每次校验，内容没变回 304，改完立即生效的能力不变。
 */
const TEXT_CACHE=new Map();
async function sendTextCached(req,res,filePath,{contentType="text/html; charset=utf-8",csp=""}={}){
  let st;
  try{ st=await fs.stat(filePath); }
  catch{ return json(res,404,{ok:false,code:"NOT_FOUND"}); }
  let c=TEXT_CACHE.get(filePath);
  if(!c||c.mtimeMs!==st.mtimeMs||c.size!==st.size){
    const raw=await fs.readFile(filePath);
    c={mtimeMs:st.mtimeMs,size:st.size,etag:'"'+sha256Hex(raw).slice(0,16)+'"',raw,gz:null};
    TEXT_CACHE.set(filePath,c);
  }
  const headers={"Content-Type":contentType,"Cache-Control":"no-cache","ETag":c.etag,
    "Vary":"Accept-Encoding","X-Content-Type-Options":"nosniff"};
  if(csp)headers["Content-Security-Policy"]=csp;

  if(String(req.headers["if-none-match"]||"")===c.etag){
    res.writeHead(304,headers);
    return res.end();
  }
  if(String(req.headers["accept-encoding"]||"").includes("gzip")){
    if(!c.gz)c.gz=zlib.gzipSync(c.raw);
    headers["Content-Encoding"]="gzip";
    return res.writeHead(200,headers).end(c.gz);
  }
  return res.writeHead(200,headers).end(c.raw);
}
const ARCHIVE_HOST="127.0.0.1";
const ARCHIVE_PORT=Number(process.env.SM_ARCHIVE_PORT||8781);
/**
 * 归档服务的只读客户端（令牌只放在请求头里透传，本服务不记录、不回显）。
 * 抽成可注入对象，测试才能把「归档服务」换成假实现，不去碰用户真实的 8781。
 */
export function createArchiveClient({host=ARCHIVE_HOST,port=ARCHIVE_PORT}={}){
  /** 缓冲式读取：会后复盘要整份 JSON，令牌只作为请求头。 */
  function get(pathname,token,timeoutMs=8000){
    return new Promise((resolve,reject)=>{
      const upstream=http.request({host,port,path:pathname,method:"GET",
        headers:{"x-archive-token":token},timeout:timeoutMs},(up)=>{
          let body="";
          up.setEncoding("utf8");
          up.on("data",(chunk)=>{body+=chunk;if(body.length>4_000_000)up.destroy();});
          up.on("end",()=>resolve({status:up.statusCode||502,body}));
        });
      upstream.on("timeout",()=>upstream.destroy(new Error("archive timeout")));
      upstream.on("error",reject);
      upstream.end();
    });
  }
  // 只反代归档服务的 GET 只读接口；归档端未启动时返回 503，让前端能区分“没开服务”和“令牌错误”。
  function proxy(req,res,url){
    if(req.method!=="GET")return json(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
    const target=url.pathname.replace(/^\/v12/,"")+url.search;
    const upstream=http.request({host,port,path:target,method:"GET",
      headers:{"x-archive-token":String(req.headers["x-archive-token"]||"")},
      timeout:8000},(up)=>{
        res.writeHead(up.statusCode||502,{
          "Content-Type":up.headers["content-type"]||"application/json; charset=utf-8",
          "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
        up.pipe(res);
      });
    upstream.on("timeout",()=>upstream.destroy(new Error("archive timeout")));
    upstream.on("error",()=>{
      if(!res.headersSent)json(res,503,{ok:false,code:"ARCHIVE_UNAVAILABLE",
        error:"归档服务未启动（socialmate-v1.2/archive-service.sh start）"});
      else res.destroy();
    });
    upstream.end();
  }
  return {host,port,get,proxy};
}
const defaultArchive=createArchiveClient();
async function readPayload(req,maxBytes=16000){
  let len=0,parts=[];
  for await (const buf of req){len+=buf.length;if(len>maxBytes)throw new AiError(413,"TOO_LARGE","请求体超过上限");parts.push(buf);}
  try{return JSON.parse(Buffer.concat(parts).toString("utf8"));}
  catch{throw new AiError(400,"INVALID_JSON","请求不是 JSON");}
}
async function loadArchivedSession(sessionId,token,archive=defaultArchive){
  let result;
  try{
    result=await archive.get("/api/archive/session/"+encodeURIComponent(sessionId),token);
  }catch{
    throw new AiError(503,"ARCHIVE_UNAVAILABLE","归档服务未启动或不可达");
  }
  if(result.status===401)throw new AiError(401,"UNAUTHORIZED","归档令牌无效");
  if(result.status===404)throw new AiError(404,"SESSION_NOT_FOUND","归档里没有这个会话");
  if(result.status!==200)throw new AiError(502,"ARCHIVE_READ_FAILED","读取归档会话失败（HTTP "+result.status+"）");
  let parsed;
  try{parsed=JSON.parse(result.body);}catch{throw new AiError(502,"ARCHIVE_READ_FAILED","归档返回内容不是 JSON");}
  if(!parsed?.session)throw new AiError(502,"ARCHIVE_READ_FAILED","归档返回缺少会话原文");
  return parsed.session;
}
let corpus=null;
let activeRequest=false,lastRequestAt=0; // One private user; avoid accidental rapid repeated billed calls.
// 写入类接口的限流：单机单人场景，防止误连点与脚本重放把档案写乱。
const APPLY_WINDOW_MS=60_000, APPLY_MAX=12, APPLY_MIN_GAP_MS=400;
/** 每个 handler 实例独立的限流器：测试可拿到干净状态，生产仍只有一个实例。 */
function createRateLimiter(limits){
  const windowMs=(limits&&limits.windowMs)||APPLY_WINDOW_MS;
  const max=(limits&&limits.max)||APPLY_MAX;
  // minGapMs 显式为 0 时必须生效（`||` 会把它吞成默认 400ms）。
  const minGapMs=(limits&&limits.minGapMs!==undefined)?limits.minGapMs:APPLY_MIN_GAP_MS;
  let hits=[],lastAt=0;
  return ()=>{
    const now=Date.now();
    hits=hits.filter((t)=>now-t<windowMs);
    if(now-lastAt<minGapMs)
      return {ok:false,retryAfterMs:minGapMs-(now-lastAt)};
    if(hits.length>=max)
      return {ok:false,retryAfterMs:windowMs-(now-hits[0])};
    hits.push(now);lastAt=now;
    return {ok:true};
  };
}
async function loadData(){
  if(corpus)return corpus;
  const text=await fs.readFile(path.join(proto,"data.js"),"utf8");
  const match=text.match(/window\.SOCIALMATE_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
  if(!match)throw new Error("无法读取正式原型 data.js");
  const d=JSON.parse(match[1]);
  if(d.apps.length<50||d.places.length<115)throw new Error("正式资料未通过 51/115 校验");
  corpus=d;return corpus;
}
function originOK(req,port=PORT){
  const origin=req.headers.origin;
  // Browser same-origin requests include origin; curl without Origin is allowed only on localhost.
  if(!origin)return true;
  let parsed;
  try{parsed=new URL(origin);}catch{return false;}
  // 真机经由 Tailscale Serve（https://<host>:8443）访问时，Host 由代理原样透传：
  // 只要 Origin 与本次请求的 Host 相同就是同源，不能只认 127.0.0.1:<port>。
  const host=String(req.headers["x-forwarded-host"]||req.headers.host||"");
  if(host&&parsed.host===host)return true;
  return parsed.host==="127.0.0.1:"+port||parsed.host==="localhost:"+port;
}
/**
 * 生成请求处理器。默认使用真实归档客户端与本机端口；
 * 测试可注入假 archive 并在随机端口起一个临时 httptest 服务器，避免占用 8790/8791/8781。
 */
export function createHandler(options={}){
  const archive=options.archive||defaultArchive;
  const port=Number(options.port)||PORT;
  const rateLimit=options.rateLimit||createRateLimiter();
  /* N05 V1.3：朗读合成是「多条短请求」型负载，用独立额度（48 次/分钟、最小间隔 150ms）。
     仍然限流，只是不让一轮完整多语队列（15+ 项）被必然拒绝；缓存命中不消耗该额度。 */
  const ttsRateLimit=options.ttsRateLimit||createRateLimiter({windowMs:60000,max:48,minGapMs:150});
  /* 图片上传与卡片的文字保存走不同节奏：一张卡片保存后常常立刻连传 2–6 张图。
     媒体只保留每分钟 30 次的总量闸，不再要求最小间隔（0ms），否则连续多图必被 429。 */
  const mediaRateLimit=options.mediaRateLimit||createRateLimiter({windowMs:60000,max:30,minGapMs:0});
  const writeGuard=options.writeGuard||createWriteGuard();
  /* N05 S2/S3/S5：人物手工补记、私有地点活档案、单段练习复盘。
     存储根目录均可注入（测试用临时目录），生产默认落到 SocialMate-Data 下。 */
  const practiceStore=options.practiceStore||createPracticeReportsStore({
    notesRoot:options.placeNotesRoot,
    privatePlacesRoot:options.privatePlacesRoot,
    ...(options.now?{now:options.now}:{})});
  const privatePlaces=options.privatePlaces||createPrivatePlaces(
    options.privatePlacesRoot?{root:options.privatePlacesRoot}:{});
  /* V1.6 三大活资料库：统一私有卡片层（新建/编辑/软删/恢复/覆盖层/媒体）。 */
  const privateCards=options.privateCards||createPrivateCards(
    options.privateCardsRoot?{root:options.privateCardsRoot}:{});
  const learningArchive=options.learningArchive||createLearningArchive({
    ...(options.learningArchiveRoot?{root:options.learningArchiveRoot}:{}),
    projectRoot:repoRoot,
    ...(options.conversationRoot?{conversationRoot:options.conversationRoot}:{}),
  });
  const placeNotes=options.placeNotes||createPlaceNotesStore({
    notesRoot:options.placeNotesRoot,
    placesFile:options.placesFile,
    practiceStore,
    ...(options.now?{now:options.now}:{}),
    ...(options.aiMatch?{aiMatch:options.aiMatch}:{aiMatch:callDeepSeekMatch}),
  });
  const manualFacts=options.manualFacts||createManualFactsStore({
    root:options.manualFactsRoot,
    ...(options.now?{now:options.now}:{}),
    ...(options.aiExtract?{aiExtract:options.aiExtract}:{}),
    budgetStatus,
  });
  /* N05 TTS 适配层：缓存根可注入（测试用临时目录），默认 SocialMate-Data/TtsCache。 */
  const tts=options.ttsService||createTtsService({root:options.ttsCacheRoot});
  /**
   * 演示写操作闸（T1-4）：同源 + CSRF 票 + 写授权。
   * 只对「会改状态」的请求生效；读演示仍然免令牌，手机首次打开不会是空白。
   */
  const requireWriteAuth=(req,res)=>{
    const same=sameOriginOf(req,port);
    if(!same.ok){
      json(res,403,{ok:false,code:same.reason,
        error:"写操作必须来自本服务同源页面（缺少或跨源的 Origin/Referer 一律拒绝）"});
      return false;
    }
    const ticket=writeGuard.consume(req);
    if(!ticket.ok){
      json(res,403,{ok:false,code:ticket.code,
        error:"写操作需要一次性的写授权票（先 GET /v12/api/demo/write-ticket）"});
      return false;
    }
    return true;
  };
  /* 归档令牌探测缓存：只在当前 handler 实例内（不落到全局模块变量），TTL 30 秒。
     只缓存「有效」结果；401 与归档不可达都不缓存，令牌失效能立刻反映到下一次请求。
     图片墙一屏 12 张图不会再各自打一次 8781。 */
  const TOKEN_PROBE_TTL_MS=30000;
  const tokenProbeCache=new Map();
  const probeArchiveToken=async(token)=>{
    const now=Date.now();
    const hit=tokenProbeCache.get(token);
    if(hit&&hit.expiresAt>now)return {ok:true};
    if(hit)tokenProbeCache.delete(token);
    const check=await archive.get("/api/archive/session/__token_probe__",token).catch(()=>null);
    if(!check)return {ok:false,reason:"unavailable"};
    if(check.status===401)return {ok:false,reason:"unauthorized"};
    if(tokenProbeCache.size>=256){
      for(const [key,value] of tokenProbeCache)if(value.expiresAt<=now)tokenProbeCache.delete(key);
      if(tokenProbeCache.size>=256)tokenProbeCache.clear();
    }
    tokenProbeCache.set(token,{expiresAt:now+TOKEN_PROBE_TTL_MS});
    return {ok:true};
  };
  return async(req,res)=>{
  try{
    if(!isPrivateIp(req.socket.remoteAddress))
      return json(res,403,{ok:false,code:"LAN_ONLY",error:"仅允许本机或局域网访问"});
    const url=new URL(req.url||"/","http://127.0.0.1:"+port);
    if(!originOK(req,port))return json(res,403,{ok:false,code:"ORIGIN_REJECTED"});
    if(url.pathname==="/api/asr/live"&&req.method==="GET"){
      liveAsrHub.subscribe(req,res);
      return;
    }
    if(url.pathname==="/api/ai/health"&&req.method==="GET"){
      const bridge=asrStatus();
      return json(res,200,{ok:true,defaultProvider:"deepseek",providers:status(),
        service:"ALW001 conversation AI gateway",mode:"real-api-only",
        features:{asrLive:bridge.combined,combinedService:bridge.combined},
        asr:bridge.asr,budget:budgetStatus(),
        note:"不以规则模板冒充真实 AI"});
    }
    if(url.pathname==="/api/asr/status"&&req.method==="GET"){
      const bridge=asrStatus();
      return json(res,200,{ok:true,...bridge,
        service:"ALW001 combined ASR + AI gateway"});
    }
    /* ===================== T2：真实 ASR final → 待确认候选 =====================
       候选只在本进程内存里（逐字原文不落盘）；读接口供手机私有 UI 轮询/事件刷新，
       写接口必须同源 + 一次性写票 + confirm:true + 用户显式选人。
       真实 SocialMate-Data/People 没有任何写路径，只写隔离的 Demo/People。 */
    if(url.pathname==="/v12/api/live/status"&&req.method==="GET"){
      return json(res,200,{ok:true,...liveFactsStatus(),
        note:"逐字 final 只在内存短暂展示；不写录音、不写逐字到文件。"});
    }
    if(url.pathname==="/v12/api/live/pending"&&req.method==="GET"){
      await ensureDemoSeeded();
      const items=pendingLiveFacts({sessionId:url.searchParams.get("sessionId")||""});
      const people=await listPersonas();
      return json(res,200,{ok:true,count:items.length,items,
        targets:people.map((person)=>({slug:person.slug,name:person.name,
          nameZh:person.nameZh,nameEn:person.nameEn})),
        privacy:{transcriptInMemoryOnly:true,requiresAttribution:true,speakerUnknown:true,
          realPeopleUntouched:true}});
    }
    if(url.pathname==="/v12/api/live/facts"&&req.method==="GET"){
      return json(res,200,{ok:true,
        items:await listLiveFacts({sessionId:url.searchParams.get("sessionId")||""})});
    }
    /* 离开会话/页面：只清内存候选，不碰已确认档案，因此不需要写票（同源仍校验）。 */
    if(url.pathname==="/v12/api/live/clear"&&req.method==="POST"){
      const body=await readPayload(req,4000).catch(()=>({}));
      return json(res,200,{ok:true,...clearLiveFacts({sessionId:body?.sessionId||""})});
    }
    const livePendingMatch=url.pathname.match(/^\/v12\/api\/live\/pending\/([^/]+)\/(confirm|ignore)$/);
    if(livePendingMatch&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let pendingId;
      try{pendingId=decodeURIComponent(livePendingMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PENDING_ID",error:"候选标识不合法"});}
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"处理实时候选需要用户显式确认"});
      if(livePendingMatch[2]==="ignore")
        return json(res,200,{...await ignoreLivePending({pendingId,confirm:true}),
          demo:true,realPeopleUntouched:true});
      return json(res,200,{...await confirmLivePending({pendingId,slug:body?.slug,
        candidateFact:body?.candidateFact,confirm:true}),demo:true});
    }
    const liveWithdrawMatch=url.pathname.match(/^\/v12\/api\/live\/facts\/([^/]+)\/withdraw$/);
    if(liveWithdrawMatch&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let factId;
      try{factId=decodeURIComponent(liveWithdrawMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_FACT_ID",error:"事实标识不合法"});}
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"撤回事实需要用户显式确认"});
      return json(res,200,{...await withdrawLiveFact({factId,slug:body?.slug,confirm:true}),demo:true});
    }
    /* ===================== 设备配对 / 短期令牌（T1-3） =====================
       长期归档令牌不再进 APK：手机先本机配对，再用设备 secret 换 ≤24h 的短期令牌。
       配对码只对回环请求可见（首次必须由用户在 Mac 上点一次），单次有效。 */
    if(url.pathname==="/v12/api/pair/code"&&req.method==="GET"){
      if(!isLoopback(req))
        return json(res,403,{ok:false,code:"PAIRING_CODE_LOCAL_ONLY",
          error:"配对码只能在本机（Mac 回环地址）读取"});
      const issued=issuePairingCode();
      console.log(`[socialmate-ai] pairing code issued, expires ${issued.expiresAt}`);
      return json(res,200,{ok:true,code:issued.code,expiresAt:issued.expiresAt,ttlMs:issued.ttlMs,
        note:"在手机「配对」里输入这 6 位数字；一次性、5 分钟内有效。"});
    }
    if(url.pathname==="/v12/api/pair/claim"&&req.method==="POST"){
      const body=await readPayload(req,8000);
      const claimed=await claimPairing({code:body?.code,deviceName:body?.deviceName});
      // 设备密钥只在这一次响应里出现，服务端只留封装副本。
      return json(res,200,{ok:true,deviceId:claimed.deviceId,deviceSecret:claimed.deviceSecret,
        token:claimed.token,expiresAt:claimed.expiresAt,ttlHours:claimed.ttlHours,
        note:"deviceSecret 请存进 Keystore，不要写日志、不要再回传。"});
    }
    if(url.pathname==="/v12/api/pair/token"&&req.method==="POST"){
      const body=await readPayload(req,8000);
      const refreshed=await refreshToken(body||{});
      return json(res,200,{ok:true,...refreshed});
    }
    if(url.pathname==="/v12/api/pair/status"&&req.method==="GET"){
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!isLoopback(req)){
        const check=await verifyToken(token).catch(()=>null);
        if(!check?.ok)return json(res,401,{ok:false,code:"UNAUTHORIZED",error:"查看设备列表需要本机访问或有效令牌"});
      }
      return json(res,200,{ok:true,devices:await listDevices(),code:pairingCodeStatus()});
    }
    if(url.pathname==="/v12/api/pair/revoke"&&req.method==="POST"){
      if(!isLoopback(req))
        return json(res,403,{ok:false,code:"REVOKE_LOCAL_ONLY",error:"撤销设备只能在本机执行"});
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"撤销设备需要显式确认"});
      const revoked=await revokeDevice(body?.deviceId);
      return json(res,200,{ok:true,...revoked,note:"撤销后该设备之前签发的令牌立即失效。"});
    }
    /* 写授权票：GET 不改状态，跨源页面即使能发请求也读不到响应（本服务无 CORS 头）。 */
    if(url.pathname==="/v12/api/demo/write-ticket"&&req.method==="GET"){
      const ticket=writeGuard.issue();
      return json(res,200,{ok:true,ticket:ticket.ticket,expiresAt:ticket.expiresAt,
        ttlMs:ticket.ttlMs,header:WRITE_HEADER,note:"一次写一张票，过期或重放都会被拒绝。"});
    }
    if(url.pathname==="/api/profile"&&req.method==="GET"){
      return json(res,200,{ok:true,profile:await readProfile()});
    }
    if(url.pathname==="/api/profile"&&req.method==="PUT"){
      const body=await readPayload(req,65536);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"写入本机档案需要用户显式确认"});
      const profile=await writeProfile(body);
      return json(res,200,{ok:true,updatedAt:profile.updatedAt,
        stories:profile.stories.length,people:profile.people.length});
    }
    if(url.pathname==="/api/ai/analyze"&&req.method==="POST"){
      if(activeRequest || Date.now()-lastRequestAt<1200)
        return json(res,429,{ok:false,code:"AI_BUSY",error:"上一轮 AI 尚未结束或请求过于频繁，请稍候"});
      const body=await readPayload(req);
      if(body?.provider==="deepseek"){
        const left=budgetStatus().remainingCny;
        if(left<=RESERVE_CNY)
          return json(res,402,{ok:false,code:"BUDGET_EXHAUSTED",
            error:"DeepSeek 授权额度已用尽（上限 "+BUDGET_LIMIT+" 元）",budget:budgetStatus()});
      }
      activeRequest=true;lastRequestAt=Date.now();
      try{
        const result=await analyze(body,{data:await loadData()});
        if(result.provider==="deepseek"){
          try{await recordDeepSeekUsage(result.usage);}
          catch(error){console.error("[socialmate-ai] budget ledger write failed:",error.message);}
          result.budget=budgetStatus();
        }
        return json(res,200,{ok:true,...result});
      }finally{activeRequest=false;}
    }
    // 按需单句翻译：只在用户点「翻译」时调用；一次一句，写同一 DeepSeek 预算账本。
    if(url.pathname==="/api/ai/translate"&&req.method==="POST"){
      const body=await readPayload(req,20000);
      if(body?.consent!==true)
        return json(res,403,{ok:false,code:"CONSENT_REQUIRED",error:"翻译前需要对这一句明确同意"});
      const text=String(body?.text||"").trim().slice(0,700);
      if(!text)return json(res,400,{ok:false,code:"INVALID_INPUT",error:"缺少待翻译句子"});
      if(!/[A-Za-z]/.test(text))return json(res,200,{ok:true,zh:text,mode:"passthrough"});
      const cfg=PROVIDERS.deepseek;
      const secret=String(process.env[cfg.keyEnv]||"").trim();
      if(!secret)return json(res,503,{ok:false,code:"PROVIDER_NOT_CONFIGURED",error:"服务端未配置 "+cfg.keyEnv});
      if(budgetStatus().remainingCny<=RESERVE_CNY)
        return json(res,402,{ok:false,code:"BUDGET_EXHAUSTED",
          error:"DeepSeek 授权额度已用尽（上限 "+BUDGET_LIMIT+" 元）",budget:budgetStatus()});
      if(activeRequest||Date.now()-lastRequestAt<1200)
        return json(res,429,{ok:false,code:"AI_BUSY",error:"上一轮 AI 尚未结束或请求过于频繁，请稍候"});
      activeRequest=true;lastRequestAt=Date.now();
      const startedAt=Date.now();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
      try{
        const response=await fetch(cfg.url,{method:"POST",signal:controller.signal,
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+secret},
          body:JSON.stringify({model:cfg.model,max_tokens:300,stream:false,
            response_format:{type:"json_object"},thinking:{type:"disabled"},
            messages:[{role:"system",content:"Translate the user's English sentence into natural, concise Simplified Chinese. Output exactly one JSON object {\"zh\":\"中文翻译\"}. Keep names, places and numbers accurate. Do not add explanations, pinyin, or the original English."},
              {role:"user",content:text}]})});
        if(!response.ok){
          const code=response.status===429?"PROVIDER_LIMIT":response.status===401||response.status===403?"PROVIDER_AUTH":"PROVIDER_ERROR";
          return json(res,response.status===429?503:502,{ok:false,code,error:"上游 API 返回 HTTP "+response.status});
        }
        const data=await response.json();
        const content=data?.choices?.[0]?.message?.content||"";
        let parsed=null;
        try{parsed=JSON.parse(content);}catch{
          const fenced=content.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
          const match=fenced.match(/\{[\s\S]*\}/);
          try{parsed=JSON.parse(fenced);}catch{try{parsed=match?JSON.parse(match[0]):null;}catch{parsed=null;}}
        }
        const zh=String(parsed?.zh||"").trim().slice(0,600);
        if(!zh)return json(res,502,{ok:false,code:"INVALID_AI_OUTPUT",error:"上游未返回中文翻译"});
        try{await recordDeepSeekUsage(data.usage);}
        catch(error){console.error("[socialmate-ai] budget ledger write failed:",error.message);}
        return json(res,200,{ok:true,zh,provider:"deepseek",model:cfg.model,mode:"real-ai",
          latencyMs:Date.now()-startedAt,usage:data.usage||null,budget:budgetStatus()});
      }catch(error){
        if(error?.name==="AbortError")return json(res,504,{ok:false,code:"PROVIDER_TIMEOUT",error:"翻译超时"});
        return json(res,502,{ok:false,code:"PROVIDER_NETWORK",error:"请求模型 API 失败"});
      }finally{clearTimeout(timer);activeRequest=false;}
    }
    /* V1.6 T4：中文 → 自然英文草稿（活资料库用）。
       与按需翻译共用 DeepSeek 账本、consent 与 busy 闸；中文真源由调用方保存，AI 失败不阻断。 */
    if(url.pathname==="/api/ai/draft-en"&&req.method==="POST"){
      // 花钱接口不能只靠 consent：先校验归档令牌，局域网内任意设备没有令牌就不能消耗预算。
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!token)
        return json(res,401,{ok:false,code:"TOKEN_REQUIRED",error:"生成英文草稿需要归档访问令牌"});
      const probe=await probeArchiveToken(token);
      if(!probe.ok){
        if(probe.reason==="unavailable")
          return json(res,503,{ok:false,code:"ARCHIVE_UNAVAILABLE",error:"归档服务未启动或不可达"});
        return json(res,401,{ok:false,code:"UNAUTHORIZED",error:"归档令牌无效"});
      }
      const body=await readPayload(req,20000);
      if(body?.consent!==true)
        return json(res,403,{ok:false,code:"CONSENT_REQUIRED",error:"生成英文草稿前需要明确同意"});
      const text=String(body?.text||"").trim().slice(0,1200);
      if(!text)return json(res,400,{ok:false,code:"INVALID_INPUT",error:"缺少中文内容"});
      if(!/[\u3400-\u9fff]/.test(text))return json(res,200,{ok:true,en:text,mode:"passthrough"});
      const cfg=PROVIDERS.deepseek;
      const secret=String(process.env[cfg.keyEnv]||"").trim();
      if(!secret)return json(res,503,{ok:false,code:"PROVIDER_NOT_CONFIGURED",error:"服务端未配置 "+cfg.keyEnv});
      if(budgetStatus().remainingCny<=RESERVE_CNY)
        return json(res,402,{ok:false,code:"BUDGET_EXHAUSTED",
          error:"DeepSeek 授权额度已用尽（上限 "+BUDGET_LIMIT+" 元）",budget:budgetStatus()});
      if(activeRequest||Date.now()-lastRequestAt<1200)
        return json(res,429,{ok:false,code:"AI_BUSY",error:"上一轮 AI 尚未结束或请求过于频繁，请稍候"});
      activeRequest=true;lastRequestAt=Date.now();
      const startedAt=Date.now();
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
      try{
        const response=await fetch(cfg.url,{method:"POST",signal:controller.signal,
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+secret},
          body:JSON.stringify({model:cfg.model,max_tokens:400,stream:false,
            response_format:{type:"json_object"},thinking:{type:"disabled"},
            messages:[{role:"system",content:"Turn the user's Simplified Chinese note into natural spoken English (1-2 short sentences). Keep names, places and numbers accurate. Never invent experiences or facts that are not in the Chinese text. Output exactly one JSON object {\"en\":\"English draft\"}. No explanations, no pinyin, no Chinese."},
              {role:"user",content:text}]})});
        if(!response.ok){
          const code=response.status===429?"PROVIDER_LIMIT":response.status===401||response.status===403?"PROVIDER_AUTH":"PROVIDER_ERROR";
          return json(res,response.status===429?503:502,{ok:false,code,error:"上游 API 返回 HTTP "+response.status});
        }
        const data=await response.json();
        const content=data?.choices?.[0]?.message?.content||"";
        let parsed=null;
        try{parsed=JSON.parse(content);}catch{
          const fenced=content.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
          const match=fenced.match(/\{[\s\S]*\}/);
          try{parsed=match?JSON.parse(match[0]):null;}catch{parsed=null;}
        }
        const en=String(parsed?.en||"").trim().slice(0,1200);
        if(!en)return json(res,502,{ok:false,code:"INVALID_AI_OUTPUT",error:"上游未返回英文草稿"});
        try{await recordDeepSeekUsage(data.usage);}
        catch(error){console.error("[socialmate-ai] budget ledger write failed:",error.message);}
        return json(res,200,{ok:true,en,provider:"deepseek",model:cfg.model,mode:"real-ai",
          draft:true,latencyMs:Date.now()-startedAt,usage:data.usage||null,budget:budgetStatus()});
      }catch(error){
        if(error?.name==="AbortError")return json(res,504,{ok:false,code:"PROVIDER_TIMEOUT",error:"生成英文草稿超时"});
        return json(res,502,{ok:false,code:"PROVIDER_NETWORK",error:"请求模型 API 失败"});
      }finally{clearTimeout(timer);activeRequest=false;}
    }
    // 会后复盘：读的是已归档原文，因此必须带归档令牌（由归档服务校验，本服务不存储令牌）。
    // mode=local 只用本地规则，0 次外部请求；mode=ai 需要当轮显式同意 + 1 元预算闸。
    if(url.pathname==="/v12/api/review"&&req.method==="POST"){
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!token)
        return json(res,401,{ok:false,code:"TOKEN_REQUIRED",error:"读取本轮原文需要归档访问令牌"});
      const body=await readPayload(req,256000);
      const mode=body?.mode==="ai"?"ai":"local";
      const sessionId=String(body?.sessionId||"");
      if(!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId))
        return json(res,400,{ok:false,code:"INVALID_SESSION_ID",error:"sessionId 格式不合法"});
      const session=await loadArchivedSession(sessionId,token,archive);
      if(mode==="local"){
        const review=buildLocalReview(session);
        return json(res,200,{ok:true,review});
      }
      if(body?.consent!==true)
        return json(res,403,{ok:false,code:"CONSENT_REQUIRED",
          error:"把原文发送给云端模型需要当轮勾选同意；未勾选时不会有任何外部请求"});
      const left=budgetStatus().remainingCny;
      if(left<=RESERVE_CNY)
        return json(res,402,{ok:false,code:"BUDGET_EXHAUSTED",
          error:"DeepSeek 授权额度已用尽（上限 "+BUDGET_LIMIT+" 元）",budget:budgetStatus()});
      if(activeRequest||Date.now()-lastRequestAt<1200)
        return json(res,429,{ok:false,code:"AI_BUSY",error:"上一轮 AI 尚未结束或请求过于频繁，请稍候"});
      activeRequest=true;lastRequestAt=Date.now();
      try{
        const review=await buildAiReview(session,{provider:"deepseek"});
        try{await recordDeepSeekUsage(review.usage);}
        catch(error){console.error("[socialmate-ai] budget ledger write failed:",error.message);}
        review.budget=budgetStatus();
        return json(res,200,{ok:true,review});
      }finally{activeRequest=false;}
    }
    // 复盘候选确认写入：令牌 + 归档会话（段号可证）双重校验，再走 Profile/People 事务。
    // confirm:true 只是用户意图声明，不能替代服务端对来源与权限的核验。
    if(url.pathname==="/v12/api/review/apply"&&req.method==="POST"){
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!token)
        return json(res,401,{ok:false,code:"TOKEN_REQUIRED",error:"确认写入需要归档访问令牌"});
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"写入操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,256000);
      const sessionId=String(body?.sessionId||"");
      if(!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId))
        return json(res,400,{ok:false,code:"INVALID_SESSION_ID",error:"sessionId 格式不合法"});
      // 先取归档会话：令牌无效 → 401，会话不存在 → 404，段号也以这份真实原文为准。
      const session=await loadArchivedSession(sessionId,token,archive);
      const result=await confirmReview(body,session);
      return json(res,200,result);
    }
    // 所有 /v12/api/people* 都用同一种令牌校验：令牌只放请求头，由归档服务判定有效性。
    const peopleToken=async(res,action)=>{
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!token){
        json(res,401,{ok:false,code:"TOKEN_REQUIRED",error:action+"需要归档访问令牌"});
        return null;
      }
      const check=await probeArchiveToken(token);
      if(!check.ok){
        if(check.reason==="unavailable")
          json(res,503,{ok:false,code:"ARCHIVE_UNAVAILABLE",error:"归档服务未启动或不可达"});
        else
          json(res,401,{ok:false,code:"UNAUTHORIZED",error:"归档令牌无效"});
        return null;
      }
      return token;
    };
    /* TTS 沿用同一套鉴权：配对短期令牌优先，其次回落到本机归档令牌探测；
       令牌只从请求头读取，不回显、不落盘、不进日志。 */
    const ttsToken=async(res,action)=>{
      const token=String(req.headers["x-archive-token"]||"").trim();
      if(!token){
        json(res,401,{ok:false,code:"TOKEN_REQUIRED",error:action+"需要设备令牌或本机归档令牌"});
        return null;
      }
      const paired=await verifyToken(token).catch(()=>null);
      if(paired?.ok)return token;
      const check=await archive.get("/api/archive/session/__token_probe__",token).catch(()=>null);
      if(!check){
        json(res,503,{ok:false,code:"ARCHIVE_UNAVAILABLE",error:"归档服务未启动或不可达"});
        return null;
      }
      if(check.status===401){
        json(res,401,{ok:false,code:"UNAUTHORIZED",error:"令牌无效"});
        return null;
      }
      return token;
    };
    if(url.pathname==="/v12/api/people"&&req.method==="GET"){
      const token=await peopleToken(res,"读取人物主档列表");
      if(!token)return;
      return json(res,200,{ok:true,people:await listPeople()});
    }
    // P1-02：显式新建人物。只有用户点了「确认新建」并带 confirm=true 才会落盘；
    // 已存在同名目录时原样返回（created:false），不覆盖任何已有内容。
    if(url.pathname==="/v12/api/people"&&req.method==="POST"){
      const token=await peopleToken(res,"新建人物");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"写入操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,16000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"新建人物需要用户显式确认"});
      const created=await createPersonFile({slug:String(body?.slug||""),name:String(body?.name||"")});
      return json(res,200,{ok:true,created:created.created,existing:created.existing===true,
        person:{slug:created.slug,name:String(body?.name||"").trim()}});
    }
    // P1-02：只给建议，不创建。返回可用性判断与确定可用的备选，创建仍走上面的显式确认路径。
    if(url.pathname==="/v12/api/people/slug-suggest"&&req.method==="GET"){
      const token=await peopleToken(res,"读取人物主档列表");
      if(!token)return;
      const suggestion=await suggestSlug(url.searchParams.get("name")||"");
      return json(res,200,{ok:true,slug:suggestion.slug,available:suggestion.available,
        alternative:suggestion.alternative});
    }
    const personMatch=url.pathname.match(/^\/v12\/api\/people\/([^/]+)$/);
    if(personMatch&&req.method==="GET"){
      const token=await peopleToken(res,"读取人物详情");
      if(!token)return;
      let slug;
      try{slug=decodeURIComponent(personMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      // 会话原文只用于补日期与话题；取不到时详情仍然返回，来源仍以主档里的记录为准。
      const loadSession=async(sessionId)=>{
        try{return await loadArchivedSession(sessionId,token,archive);}
        catch{return null;}
      };
      const detail=await getPersonDetail(slug,{loadSession});
      return json(res,200,{ok:true,...detail});
    }
    // P2-01：见面前准备，纯本地规则，0 次外部请求。
    if(url.pathname.match(/^\/v12\/api\/people\/[^/]+\/prep$/)&&req.method==="GET"){
      const token=await peopleToken(res,"读取人物详情");
      if(!token)return;
      let slug;
      try{slug=decodeURIComponent(url.pathname.split("/")[4]||"");}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const prep=await getPersonPrep(slug);
      return json(res,200,{ok:true,items:prep.items,empty:prep.empty,
        emptyReason:prep.empty?prep.emptyReason:null});
    }
    // P1-04：事实精准撤回。令牌 + 写限流 + 二次确认；无法定位来源时安全拒绝。
    if(url.pathname.match(/^\/v12\/api\/people\/[^/]+\/facts\/revoke$/)&&req.method==="POST"){
      const token=await peopleToken(res,"撤回已确认事实");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"写入操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let slug;
      try{slug=decodeURIComponent(url.pathname.split("/")[4]||"");}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const body=await readPayload(req,16000);
      const result=await revokePersonFact(slug,{factId:body?.factId,confirm:body?.confirm===true});
      return json(res,200,result);
    }
    /* ===================== N05 S2：人物手工补记（MEM01） =====================
       草稿只写 SocialMate-Data/ManualFactBatches；确认才写 People/<slug>/00-profile.md。
       AI 只在用户点「AI 整理」并显式同意时调用一次 DeepSeek；不可用就降级为手工切句。 */
    const manualDraftMatch=url.pathname.match(/^\/v12\/api\/people\/([^/]+)\/facts\/draft$/);
    if(manualDraftMatch&&req.method==="POST"){
      const token=await peopleToken(res,"整理人物补记草稿");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let slug;
      try{slug=decodeURIComponent(manualDraftMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const body=await readPayload(req,32000);
      const {status:httpStatus,...result}=await manualFacts.draft(slug,body);
      return json(res,httpStatus||200,result);
    }
    const manualConfirmMatch=url.pathname.match(/^\/v12\/api\/people\/([^/]+)\/facts\/confirm$/);
    if(manualConfirmMatch&&req.method==="POST"){
      const token=await peopleToken(res,"确认人物补记");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let slug;
      try{slug=decodeURIComponent(manualConfirmMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const body=await readPayload(req,32000);
      const result=await manualFacts.confirm(slug,body);
      return json(res,200,result);
    }
    const manualRevokeMatch=url.pathname.match(/^\/v12\/api\/people\/([^/]+)\/facts\/revoke-manual$/);
    if(manualRevokeMatch&&req.method==="POST"){
      const token=await peopleToken(res,"撤回人物手工补记");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let slug;
      try{slug=decodeURIComponent(manualRevokeMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const body=await readPayload(req,16000);
      return json(res,200,await manualFacts.revoke(slug,body));
    }
    const manualDraftsMatch=url.pathname.match(/^\/v12\/api\/people\/([^/]+)\/facts\/drafts$/);
    if(manualDraftsMatch&&req.method==="GET"){
      const token=await peopleToken(res,"读取人物补记草稿");
      if(!token)return;
      let slug;
      try{slug=decodeURIComponent(manualDraftsMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      return json(res,200,await manualFacts.listDrafts(slug));
    }
    // 草稿只在本机可删（回环地址 + 写票 + 同源），不触碰已确认内容。
    const manualDraftDeleteMatch=url.pathname.match(/^\/v12\/api\/people\/facts\/drafts\/([^/]+)$/);
    if(manualDraftDeleteMatch&&req.method==="DELETE"){
      if(!isLoopback(req))
        return json(res,403,{ok:false,code:"DRAFT_DELETE_LOCAL_ONLY",error:"删除草稿只能在本机执行"});
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let draftId;
      try{draftId=decodeURIComponent(manualDraftDeleteMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_DRAFT_ID",error:"草稿标识不合法"});}
      if(url.searchParams.get("confirm")!=="1")
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"删除草稿需要 confirm=1"});
      return json(res,200,await manualFacts.deleteDraft(draftId,{confirm:true}));
    }
    /* ===================== N05 S3：私有地点活档案（LOC01） =====================
       原介绍只读 115 源；私有记录只写 SocialMate-Data/PlaceNotes/<placeId>/records。 */
    if(url.pathname==="/v12/api/prefs"&&req.method==="GET"){
      const token=await peopleToken(res,"读取界面设置");
      if(!token)return;
      return json(res,200,{ok:true,prefs:await readUiPrefs()});
    }
    if(url.pathname==="/v12/api/prefs"&&req.method==="POST"){
      const token=await peopleToken(res,"保存界面设置");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const body=await readPayload(req,4000);
      const cur=await readUiPrefs();
      const next={...cur};
      if(typeof body?.ttsVoice==="string"&&UI_PREF_VOICES.has(body.ttsVoice))next.ttsVoice=body.ttsVoice;
      if(body?.ttsEngine==="doubao"||body?.ttsEngine==="system")next.ttsEngine=body.ttsEngine;
      next.updatedAt=new Date().toISOString();
      await writeUiPrefs(next);
      return json(res,200,{ok:true,prefs:next});
    }
    if(url.pathname==="/v12/api/places/match"&&req.method==="POST"){
      const token=await peopleToken(res,"地点匹配");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,16000);
      const budget=budgetStatus();
      const aiConsent=body?.aiConsent===true&&budget.remainingCny>RESERVE_CNY;
      const result=await placeNotes.matchPlace({text:body?.text,aiConsent});
      return json(res,200,{...result,
        ...(body?.aiConsent===true&&!aiConsent?{aiUnavailable:{code:"AI_UNAVAILABLE",reason:"BUDGET_EXHAUSTED"}}:{}),
        realPlacesUntouched:true});
    }
    if(url.pathname==="/v12/api/places/unassigned"&&req.method==="GET"){
      const token=await peopleToken(res,"读取未归属地点草稿");
      if(!token)return;
      return json(res,200,{...await placeNotes.listUnassigned(),realPlacesUntouched:true});
    }
    if(url.pathname==="/v12/api/private-places"&&req.method==="GET"){
      const token=await peopleToken(res,"读取私有地点");
      if(!token)return;
      const list=await privatePlaces.readAll();
      return json(res,200,{ok:true,count:list.length,
        places:list.map((place)=>privatePlaces.toPublic(place)),realPlacesUntouched:true});
    }
    if(url.pathname==="/v12/api/private-places"&&req.method==="POST"){
      const token=await peopleToken(res,"新建私有地点");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,16000);
      const created=await privatePlaces.create(body||{});
      return json(res,200,{...created,realPlacesUntouched:true});
    }
    /* ===== V1.6 三大活资料库：统一私有卡片层 =====
       三类卡片共用一套新建/读取/编辑/软删/恢复/媒体接口；115 公开地点与内置资料只读，
       用户改写只落 overrides/<kind>-<id>.json，可撤销还原。 */
    if(url.pathname==="/v12/api/cards"&&req.method==="GET"){
      const token=await peopleToken(res,"读取活资料库");
      if(!token)return;
      const kind=String(url.searchParams.get("kind")||"");
      if(!["place","story","app"].includes(kind))
        return json(res,400,{ok:false,code:"KIND_INVALID",error:"kind 只能是 place / story / app"});
      const includeDeleted=url.searchParams.get("includeDeleted")==="1";
      // 损坏的卡片文件不能静默消失：随列表返回 warnings（同时也打服务端日志）。
      const warnings=[];
      const cards=await privateCards.list(kind,{includeDeleted,warnings});
      const body={ok:true,kind,count:cards.length,cards};
      if(warnings.length)body.warnings=warnings;
      return json(res,200,body);
    }
    if(url.pathname==="/v12/api/cards"&&req.method==="POST"){
      const token=await peopleToken(res,"新建活资料卡片");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,64000);
      const card=await privateCards.create(body||{});
      return json(res,200,{ok:true,card,realPlacesUntouched:true});
    }
    if(url.pathname==="/v12/api/cards/stats"&&req.method==="GET"){
      const token=await peopleToken(res,"读取活资料库统计");
      if(!token)return;
      return json(res,200,{ok:true,...await privateCards.stats()});
    }
    const cardMatch=url.pathname.match(/^\/v12\/api\/cards\/(place|story|app)\/([a-z0-9][a-z0-9-]{0,63})(?:\/(restore|cover|media)(?:\/(m[a-f0-9]{16}))?)?$/);
    if(cardMatch){
      const [,kind,id,action,mediaId]=cardMatch;
      const write=req.method==="PATCH"||req.method==="DELETE"||req.method==="POST";
      const token=await peopleToken(res,write?"修改活资料卡片":"读取活资料卡片");
      if(!token)return;
      if(write&&!requireWriteAuth(req,res))return;
      if(req.method==="GET"&&!action){
        const card=await privateCards.get(kind,id);
        const override=await privateCards.getOverride(kind,id);
        return json(res,200,{ok:true,card,override});
      }
      if(req.method==="PATCH"&&!action){
        const limit=rateLimit();
        if(!limit.ok)
          return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
            retryAfterMs:limit.retryAfterMs});
        const body=await readPayload(req,64000);
        const card=await privateCards.update(kind,id,{revision:body?.revision,patch:body?.patch||body});
        return json(res,200,{ok:true,card});
      }
      if(req.method==="DELETE"&&!action){
        if(url.searchParams.get("confirm")!=="1")
          return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"删除卡片需要 confirm=1"});
        const limit=rateLimit();
        if(!limit.ok)
          return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
            retryAfterMs:limit.retryAfterMs});
        const card=await privateCards.softDelete(kind,id);
        return json(res,200,{ok:true,card,trashed:true});
      }
      if(req.method==="POST"&&action==="restore"){
        const card=await privateCards.restore(kind,id);
        return json(res,200,{ok:true,card,restored:true});
      }
      if(req.method==="POST"&&action==="media"){
        const limit=mediaRateLimit();
        if(!limit.ok)
          return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
            retryAfterMs:limit.retryAfterMs});
        const body=await readPayload(req,9*1024*1024);
        return json(res,200,{ok:true,...await privateCards.addMedia(kind,id,{data:body?.data,mime:body?.mime})});
      }
      if(req.method==="DELETE"&&action==="media"&&mediaId){
        const card=await privateCards.deleteMedia(kind,id,mediaId);
        return json(res,200,{ok:true,card});
      }
      if(req.method==="POST"&&action==="cover"){
        const body=await readPayload(req,4000);
        const card=await privateCards.setCover(kind,id,String(body?.mediaId||""));
        return json(res,200,{ok:true,card});
      }
      return json(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
    }
    const cardOverrideMatch=url.pathname.match(/^\/v12\/api\/cards\/(place|story|app)\/([a-z0-9][a-z0-9-]{0,63})\/override$/);
    if(cardOverrideMatch){
      const [,kind,id]=cardOverrideMatch;
      const token=await peopleToken(res,"改写资料覆盖层");
      if(!token)return;
      if(req.method==="GET"){
        return json(res,200,{ok:true,override:await privateCards.getOverride(kind,id)});
      }
      if(!requireWriteAuth(req,res))return;
      if(req.method==="DELETE"){
        await privateCards.deleteOverride(kind,id);
        return json(res,200,{ok:true,restored:true});
      }
      const body=await readPayload(req,64000);
      const override=await privateCards.putOverride(kind,id,body?.values||body||{});
      return json(res,200,{ok:true,override});
    }
    const cardMediaFileMatch=url.pathname.match(/^\/v12\/media\/([a-z0-9][a-z0-9-]{0,63})\/(m[a-f0-9]{16}\.(?:jpg|png|webp))$/);
    if(cardMediaFileMatch&&req.method==="GET"){
      const token=await peopleToken(res,"读取卡片图片");
      if(!token)return;
      const {buf,mime}=await privateCards.readMedia(cardMediaFileMatch[1],cardMediaFileMatch[2]);
      return res.writeHead(200,{"Content-Type":mime,
        "Cache-Control":"private, max-age=86400","X-Content-Type-Options":"nosniff",
        "Content-Length":String(buf.length)}).end(buf);
    }
    const placeSegmentMatch=url.pathname.match(/^\/v12\/api\/places\/(\d{1,3}|pv-[a-z0-9-]{1,32})\/records\/segment$/);
    if(placeSegmentMatch&&req.method==="POST"){
      const token=await peopleToken(res,"分段预览");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,64000);
      const budget=budgetStatus();
      const aiConsent=body?.aiConsent===true&&budget.remainingCny>RESERVE_CNY;
      const result=await placeNotes.segmentPreview(body?.rawInput,{
        maxSentencesPerBlock:body?.maxSentencesPerBlock, aiConsent});
      return json(res,200,{...result,
        ...(body?.aiConsent===true&&!aiConsent?{aiUnavailable:{code:"AI_UNAVAILABLE",reason:"BUDGET_EXHAUSTED"}}:{}),
        sourceTextUnchanged:true});
    }
    const placeRecordsMatch=url.pathname.match(/^\/v12\/api\/places\/(\d{1,3}|unassigned|pv-[a-z0-9-]{1,32})\/records$/);
    if(placeRecordsMatch&&req.method==="POST"){
      const token=await peopleToken(res,"保存地点记录");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,48000);
      const result=await placeNotes.createRecord(placeRecordsMatch[1],body);
      return json(res,200,{...result,realPlacesUntouched:true});
    }
    const placeWeakMatch=url.pathname.match(/^\/v12\/api\/places\/(\d{1,3}|pv-[a-z0-9-]{1,32})\/practice\/weak$/);
    if(placeWeakMatch&&req.method==="GET"){
      const token=await peopleToken(res,"读取练习弱项");
      if(!token)return;
      return json(res,200,await practiceStore.aggregate(placeWeakMatch[1]));
    }
    /* ===================== N05 S5：单段练习复盘（PRACT01） ===================== */
    const practiceMatch=url.pathname.match(
      /^\/v12\/api\/places\/(\d{1,3}|pv-[a-z0-9-]{1,32})\/records\/([^/]+)\/blocks\/([^/]+)\/practice$/);
    if(practiceMatch&&req.method==="POST"){
      const token=await peopleToken(res,"保存练习复盘");
      if(!token)return;
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let recordId,blockId;
      try{
        recordId=decodeURIComponent(practiceMatch[2]);
        blockId=decodeURIComponent(practiceMatch[3]);
      }catch{return json(res,400,{ok:false,code:"INVALID_PRACTICE_TARGET",error:"标识不合法"});}
      const body=await readPayload(req,24000);
      const result=await practiceStore.save(practiceMatch[1],recordId,blockId,body);
      return json(res,200,{...result,recordUntouched:true});
    }
    const placeDetailMatch=url.pathname.match(/^\/v12\/api\/places\/(\d{1,3}|pv-[a-z0-9-]{1,32})$/);
    if(placeDetailMatch&&req.method==="GET"){
      const token=await peopleToken(res,"读取地点详情");
      if(!token)return;
      return json(res,200,await placeNotes.getPlaceDetail(placeDetailMatch[1]));
    }
    /* ===================== 自动学习资料归档（ADDENDUM V1.0） =====================
       只读索引 + 本地扫描；不搬原文件、不改原文。status 供日报/健康检查读取；
       scan/ingest 需要设备令牌，限流防误连点。ingest 只接受白名单类型、大小与扩展名。 */
    if(url.pathname==="/v12/api/learning-archive/status"&&req.method==="GET"){
      const token=await peopleToken(res,"读取学习资料归档状态");
      if(!token)return;
      return json(res,200,await learningArchive.status());
    }
    if(url.pathname==="/v12/api/learning-archive/scan"&&req.method==="POST"){
      const token=await peopleToken(res,"扫描学习资料归档");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      await readPayload(req,4000).catch(()=>({}));
      const summary=await learningArchive.runScan();
      return json(res,summary.ok?200:423,summary);
    }
    if(url.pathname==="/v12/api/learning-archive/ingest"&&req.method==="POST"){
      const token=await peopleToken(res,"投递学习资料");
      if(!token)return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,2*1024*1024);
      if(!body||typeof body.content!=="string")
        return json(res,400,{ok:false,code:"CONTENT_REQUIRED",error:"需要 content 文本"});
      try{
        const result=await learningArchive.ingest({
          sourceType:body.sourceType,
          filename:body.filename||"material.md",
          content:body.content,
          sourceApp:body.sourceApp,
        });
        return json(res,result.ok?200:422,result);
      }catch(error){
        return json(res,error.status||400,{ok:false,code:error.code||"INGEST_FAILED",error:error.message});
      }
    }
    if(url.pathname==="/v12/api/learning-archive/materials"&&req.method==="GET"){
      const token=await peopleToken(res,"读取学习资料索引");
      if(!token)return;
      return json(res,200,await learningArchive.list({
        sourceType:url.searchParams.get("sourceType")||undefined,
        status:url.searchParams.get("status")||undefined,
        limit:url.searchParams.get("limit")||200,
      }));
    }
    /* ===================== N05 S6：TTS 提供商适配层 =====================
       provider：aws-polly（真实云，用户选定）/ aws-polly-fake（本地替身，真机验收）/
       fake（本地预置）/ system-fallback（服务端不合成，FALLBACK_ONLY）/ 三个未接骨架。
       /synthesize 顺序：参数校验 → 同意闸 403 → aws-polly 未配置 501 → 计费 402 → 合成。
       aws-polly 使用独立账本（硬上限 0），任何计费请求在进入适配器前就被拒，账本零变动。
       音频只经 audioId 读取，客户端无法指定目录或厂商 URL；响应/日志不含 AWS Key。 */
    if(url.pathname==="/v12/api/tts/providers"&&req.method==="GET"){
      const token=await ttsToken(res,"读取 TTS 提供商清单");
      if(!token)return;
      return json(res,200,await tts.listProviders());
    }
    if(url.pathname==="/v12/api/tts/voices"&&req.method==="GET"){
      const token=await ttsToken(res,"读取 TTS 语音清单");
      if(!token)return;
      return json(res,200,tts.listVoices(url.searchParams.get("locale")||""));
    }
    if(url.pathname==="/v12/api/tts/synthesize"&&req.method==="POST"){
      const token=await ttsToken(res,"申请合成朗读音频");
      if(!token)return;
      const limit=ttsRateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"合成请求过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,64000);
      const speak=normalizeSpeakRequest(body||{});
      await assertPrivacy(body,speak);
      // 客户端可选声明 textSha256：用来发现「文本在传输/前端被改写」，不一致直接拒绝。
      if(body?.textSha256!==undefined
        &&String(body.textSha256).toLowerCase()!==sha256Hex(speak.text))
        return json(res,400,{ok:false,code:"TEXT_SHA_MISMATCH",
          error:"text 与客户端声明的 textSha256 不一致（服务端不改写文本）"});
      const policy=tts.policyOf(speak.providerId);
      const estimate=body?.estimate===true;
      if(estimate){
        // 只报价：不写音频、不建缓存条目、不动账本。
        return json(res,200,await tts.quote(speak,{explicitConsent:body?.explicitConsent===true}));
      }
      if(!requireWriteAuth(req,res))return;
      // ① 同意闸：云 provider 未显式同意 → 403（回显摘录只 40 字，不含任何 Key）。
      if(policy.requiresConsent&&body?.explicitConsent!==true){
        const echo=tts.consentEcho(speak);
        return json(res,403,{ok:false,code:"CONSENT_REQUIRED",
          error:"把学习文本发送给第三方 TTS 属于外部数据传输，默认关闭；需要本次显式同意（explicitConsent:true）",
          consent:{required:true,given:false,explicit:false,willTransmit:false,
            providerId:echo.providerId,providerLabel:echo.providerLabel,
            textExcerpt:echo.textExcerpt,charCount:echo.charCount,
            estimatedCostCny:echo.estimatedCostCny,currency:echo.currency,
            region:echo.region,engine:echo.engine,configured:echo.configured,
            wouldStoreAs:echo.storedAs}});
      }
      // ② 云 provider 未配置（无凭据/无 SDK）→ 501；只回原因码，不回凭据、不发网络。
      if(policy.kind==="cloud"&&policy.configured!==true){
        return json(res,501,{ok:false,code:"PROVIDER_NOT_CONFIGURED",
          error:speak.providerId==="aws-polly"?"Amazon Polly 尚未配置：本轮不发起任何真实云请求":"该云 TTS 尚未配置：缺少服务端密钥",
          providerId:speak.providerId,region:policy.region||null,
          reason:policy.configuredReason||"CREDENTIALS_NOT_FOUND",
          realCloudCallsThisBuild:0});
      }
      // ③ 计费闸：计费 provider 走各自独立账本；limit=0 仍 402，用户填预算并重启后才放行。
      if(policy.billingEnabled){
        const ledgerProvider=speak.providerId;
        const ledger=await tts.providerLedger(ledgerProvider);
        const spent=Number(ledger.spentCny)||0;
        const limit=Number(ledger.limitCny)||0;
        const cost=Number(tts.costOf(speak))||0;
        if(limit<=0||spent+cost>limit){
          return json(res,402,{ok:false,code:"TTS_BUDGET_ZERO",
            error:limit<=0
              ?"TTS 计费预算为 0：任何计费请求都会被拒绝，账本不会变动"
              :"TTS 预算余额不足：本次请求会被拒绝，账本不会变动",
            providerId:speak.providerId,
            ledgerProviderId:ledgerProvider,
            budget:{currency:"CNY",limitCny:limit,spentCny:spent,
              estimatedCostCny:cost,
              entries:Array.isArray(ledger.entries)?ledger.entries.length:0,
              file:`TtsCache/ledger/${ledgerProvider}.json`}});
        }
      }
      const result=await tts.synthesize(speak);
      let budgetInfo=null;
      if(policy.billingEnabled){
        /* 记账只发生在 synthesize() 的新合成分支；缓存命中不重复计费，这里只回读账本。 */
        const ledger=await tts.providerLedger(speak.providerId);
        budgetInfo={recorded:result.synthesis?.performed===true,
          limitCny:Number(ledger.limitCny)||0,spentCny:Number(ledger.spentCny)||0};
      }
      return json(res,200,{...result,
        ...(policy.kind==="cloud"?{consent:tts.consentEcho(speak)}:{}),
        ...(budgetInfo?{budget:budgetInfo}:{})});
    }
    const ttsAudioMatch=url.pathname.match(/^\/v12\/api\/tts\/audio\/(tts-[a-f0-9]{32})$/);
    if(ttsAudioMatch&&req.method==="GET"){
      const token=await ttsToken(res,"读取朗读音频");
      if(!token)return;
      const {meta,bytes,audioSha256}=await tts.audio(ttsAudioMatch[1]);
      const total=bytes.length;
      const common={
        "Content-Type":meta.mimeType||"audio/wav",
        "Accept-Ranges":"bytes",
        "Cache-Control":"private, max-age=0, must-revalidate",
        "ETag":'"'+audioSha256+'"',
        "X-Tts-Audio-Sha256":audioSha256,
        "X-Content-Type-Options":"nosniff",
        "Referrer-Policy":"no-referrer",
      };
      const range=parseRange(req.headers.range,total);
      if(range?.invalid){
        res.writeHead(416,{...common,"Content-Range":"bytes */"+total,"Content-Length":"0"});
        return res.end();
      }
      if(range){
        const slice=bytes.subarray(range.start,range.end+1);
        res.writeHead(206,{...common,"Content-Range":`bytes ${range.start}-${range.end}/${total}`,
          "Content-Length":String(slice.length)});
        return res.end(slice);
      }
      res.writeHead(200,{...common,"Content-Length":String(total)});
      return res.end(bytes);
    }
    // P2-03：收藏表达（本机 Markdown/JSON，不碰 Profile）。
    if(url.pathname==="/v12/api/favorites"&&req.method==="GET"){
      return json(res,200,{ok:true,...await listFavorites()});
    }
    if(url.pathname==="/v12/api/favorites"&&req.method==="POST"){
      const body=await readPayload(req,16000);
      const result=await addFavorite(body);
      return json(res,200,result);
    }
    const favoriteMatch=url.pathname.match(/^\/v12\/api\/favorites\/([^/]+)$/);
    if(favoriteMatch&&req.method==="DELETE"){
      let id;
      try{id=decodeURIComponent(favoriteMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_FAVORITE_ID",error:"收藏标识不合法"});}
      return json(res,200,await removeFavorite(id));
    }
    /* N04 演示命名空间：只读写 SocialMate-Data/Demo（与真实 People/归档物理隔离）。
       内容是 Git 里的虚构母版，不含任何真实主档/录音，因此读接口不需要令牌——
       否则手机首次打开会只剩空白，违反「默认可见」要求。写接口仍要求 confirm:true + 限流。 */
    if(url.pathname==="/v12/api/demo/status"&&req.method==="GET"){
      const seed=await ensureDemoSeeded();
      return json(res,200,{ok:true,demo:true,synthetic:true,...await demoStatus(),seed,
        demoRoot:path.relative(repoRoot,demoRoot())});
    }
    if(url.pathname==="/v12/api/demo/people"&&req.method==="GET"){
      await ensureDemoSeeded();
      const status=await demoStatus();
      return json(res,200,{ok:true,demo:true,synthetic:true,
        notice:"虚构合成演示数据，不是真人录音",status,
        archive:await demoArchiveStatus({demoRoot:demoRoot(),conversationsDir:demoConversationsRoot()}),
        inbox:await listInbox(),people:await listPersonas()});
    }
    const demoPersonMatch=url.pathname.match(/^\/v12\/api\/demo\/people\/([^/]+)$/);
    if(demoPersonMatch&&req.method==="GET"){
      await ensureDemoSeeded();
      let slug;
      try{slug=decodeURIComponent(demoPersonMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      return json(res,200,{ok:true,demo:true,synthetic:true,person:await readPersona(slug)});
    }
    const demoSessionMatch=url.pathname.match(/^\/v12\/api\/demo\/sessions\/([^/]+)$/);
    if(demoSessionMatch&&req.method==="GET"){
      await ensureDemoSeeded();
      let sessionId;
      try{sessionId=decodeURIComponent(demoSessionMatch[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_SESSION_ID",error:"会话标识不合法"});}
      return json(res,200,{ok:true,demo:true,synthetic:true,session:await readSession(sessionId)});
    }
    /* 档案详情：分组事实 + 变更记录（读接口不要求令牌，内容仍是虚构演示）。
       写接口沿用真实人物档案的令牌 + 同源 + 写限流，不新增明文密钥。 */
    const demoPersonPath=url.pathname.match(/^\/v12\/api\/demo\/people\/([^/]+)(?:\/(.*))?$/);
    if(demoPersonPath){
      let demoSlug;
      try{demoSlug=decodeURIComponent(demoPersonPath[1]);}
      catch{return json(res,400,{ok:false,code:"INVALID_PERSON_SLUG",error:"人物标识不合法"});}
      const rest=demoPersonPath[2]||"";
      if(rest==="changelog"&&req.method==="GET"){
        return json(res,200,{ok:true,demo:true,synthetic:true,...await readDemoChangelog(demoSlug)});
      }
      const editMatch=rest.match(/^facts\/([^/]+)\/(edit|delete)$/);
      const undoMatch=rest.match(/^changelog\/([^/]+)\/undo$/);
      const isProfileWrite=req.method==="POST"&&(
        rest==="facts"||rest==="facts/bulk-delete"||rest==="facts/bulk-group"||editMatch||undoMatch);
      if(isProfileWrite){
        const token=await peopleToken(res,"编辑演示人物档案");
        if(!token)return;
        if(!requireWriteAuth(req,res))return;
        const limit=rateLimit();
        if(!limit.ok)
          return json(res,429,{ok:false,code:"RATE_LIMITED",error:"写入操作过于频繁，请稍后再试",
            retryAfterMs:limit.retryAfterMs});
        const body=await readPayload(req,128000);
        if(body?.confirm!==true)
          return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"修改演示档案需要用户显式确认"});
        if(rest==="facts"){
          return json(res,200,await addDemoFact(demoSlug,{text:body.text,group:body.group,confirm:true}));
        }
        if(rest==="facts/bulk-delete"){
          return json(res,200,await bulkDeleteDemoFacts(demoSlug,body.factIds,{confirm:true}));
        }
        if(rest==="facts/bulk-group"){
          return json(res,200,await moveDemoFactsGroup(demoSlug,body.factIds,body.group,{confirm:true}));
        }
        if(editMatch){
          let factId;
          try{factId=decodeURIComponent(editMatch[1]);}
          catch{return json(res,400,{ok:false,code:"INVALID_FACT_ID",error:"factId 格式不合法"});}
          const result=editMatch[2]==="delete"
            ?await deleteDemoFact(demoSlug,factId,{confirm:true})
            :await editDemoFact(demoSlug,factId,{text:body.text,lang:body.lang==="en"?"en":"zh",confirm:true});
          return json(res,200,result);
        }
        if(undoMatch){
          let entryId;
          try{entryId=decodeURIComponent(undoMatch[1]);}
          catch{return json(res,400,{ok:false,code:"INVALID_CHANGELOG_ID",error:"变更记录标识不合法"});}
          return json(res,200,await undoDemoChangelog(demoSlug,entryId,{confirm:true}));
        }
        return json(res,404,{ok:false,code:"NOT_FOUND"});
      }
    }
    /* 演示 final → 待确认 → 人工确认/忽略。全部只写 SocialMate-Data/Demo；
       确认后才写演示人物档案，写的是 Demo/People（appendPeopleFacts 注入 root）。 */
    if(url.pathname==="/v12/api/demo/final"&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,64000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"注入演示 final 需要用户显式确认"});
      return json(res,200,await injectDemoFinal({...body,confirm:true}));
    }
    const demoPendingMatch=url.pathname.match(
      /^\/v12\/api\/demo\/(?:people\/([^/]+)\/)?pending\/([^/]+)\/(confirm|ignore)$/);
    if(demoPendingMatch&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      let slug="",pendingId="";
      try{
        slug=demoPendingMatch[1]?decodeURIComponent(demoPendingMatch[1]):"";
        pendingId=decodeURIComponent(demoPendingMatch[2]);
      }catch{return json(res,400,{ok:false,code:"INVALID_PENDING_ID",error:"待确认标识不合法"});}
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"处理待确认事实需要用户显式确认"});
      const target=slug||(body?.slug?String(body.slug):"");
      const result=demoPendingMatch[3]==="ignore"
        ?await ignoreDemoPending(target,pendingId,{confirm:true})
        :await confirmDemoPending(target,pendingId,{confirm:true,attributionSlug:target});
      return json(res,200,{...result,realPeopleUntouched:true});
    }
    if((url.pathname==="/v12/api/demo/clear"||url.pathname==="/v12/api/demo/restore")&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"操作过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"演示数据操作需要用户显式确认"});
      const result=url.pathname.endsWith("/clear")
        ?await clearDemo({confirm:true})
        :await restoreDemo({confirm:true});
      return json(res,200,{...result,demo:true,realPeopleUntouched:true});
    }
    /* 演示归档（SDD §2.4 / T3）：队列在 SocialMate-Data/Demo，投递目标是 Mac 固定演示目录。
       只允许本机受控端点，客户端不能传路径；正式归档与真实 People 不参与。 */
    if(url.pathname==="/v12/api/demo/archive/status"&&req.method==="GET"){
      return json(res,200,{ok:true,demo:true,synthetic:true,realArchiveUntouched:true,
        ...await demoArchiveStatus({demoRoot:demoRoot(),conversationsDir:demoConversationsRoot()})});
    }
    if(url.pathname==="/v12/api/demo/archive/push"&&req.method==="POST"){
      if(!requireWriteAuth(req,res))return;
      const limit=rateLimit();
      if(!limit.ok)
        return json(res,429,{ok:false,code:"RATE_LIMITED",error:"同步演示归档过于频繁，请稍后再试",
          retryAfterMs:limit.retryAfterMs});
      const body=await readPayload(req,8000);
      if(body?.confirm!==true)
        return json(res,400,{ok:false,code:"CONFIRM_REQUIRED",error:"同步演示归档需要用户显式确认"});
      const result=await pushDemoArchive({demoRoot:demoRoot(),conversationsDir:demoConversationsRoot()});
      return json(res,200,{...result,demo:true,synthetic:true,realArchiveUntouched:true});
    }
    if(req.method!=="GET")return json(res,405,{ok:false,code:"METHOD_NOT_ALLOWED"});
    if(url.pathname==="/profile-sync.js"){
      const bytes=await fs.readFile(path.join(here,"profile-sync.js"));
      return res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8",
        "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}).end(bytes);
    }
    if(url.pathname==="/v12"||url.pathname==="/v12/"){
      /* T1-2 第二道闸：frame-src 'none' 让页面连 iframe 都不能建。
         WebView 的 addJavascriptInterface 会暴露给本 WebView 的所有 frame，
         因此「非私有 frame」必须在文档层就不存在，而不是等它加载完再判断。 */
      return sendTextCached(req,res,path.resolve(proto,"..","socialmate-v1.2","index.html"),{
        contentType:"text/html; charset=utf-8",
        csp:"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
          + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
          + "connect-src 'self'; media-src 'self' blob:; frame-src 'none'; child-src 'none'; "
          + "object-src 'none'; base-uri 'none'; form-action 'none'"});
    }
    // 海南地点配图：同源静态图片，路径固定为 /v12/img/<city_folder>/<id3>/<file>.webp
    // 只为「地点卡片」服务：白名单后缀 + 禁止 .. 穿越，命中失败直接 404。
    if(url.pathname.startsWith("/v12/img/")){
      const rel=decodeURIComponent(url.pathname.slice("/v12/img/".length));
      if(!/^[A-Za-z0-9_-]{1,32}\/\d{3}\/[A-Za-z0-9_-]{1,16}\.webp$/.test(rel))
        return json(res,400,{ok:false,code:"INVALID_IMAGE_PATH"});
      const file=path.resolve(proto,"..","docs","成果整理","Hainan-Travel-Guide","images",rel);
      const rootDir=path.resolve(proto,"..","docs","成果整理","Hainan-Travel-Guide","images");
      if(!file.startsWith(rootDir+path.sep))
        return json(res,400,{ok:false,code:"INVALID_IMAGE_PATH"});
      try{
        const buf=await fs.readFile(file);
        return res.writeHead(200,{"Content-Type":"image/webp","Cache-Control":"public, max-age=604800",
          "X-Content-Type-Options":"nosniff"}).end(buf);
      }catch{
        return json(res,404,{ok:false,code:"IMAGE_NOT_FOUND"});
      }
    }
    // 归档历史页与归档 API 都经由本服务同源提供，避免手机上出现跨端口/跨源请求。
    // /v12/history        → 归档历史页（静态壳，不含任何数据）
    // /v12/api/archive/*  → 反代到本机归档接收端（令牌由调用方以请求头携带）
    if(url.pathname==="/v12/history"||url.pathname==="/v12/history/"){
      return sendTextCached(req,res,path.join(here,"archive-history.html"),{
        contentType:"text/html; charset=utf-8",
        csp:"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'"});
    }
    if(url.pathname.startsWith("/v12/api/archive/")){
      await archive.proxy(req,res,url);
      return;
    }
    const file=STATIC.get(url.pathname);
    if(!file)return json(res,404,{ok:false,code:"NOT_FOUND"});
    // Fixed allowlist, no directory traversal or dotfiles.
    return sendTextCached(req,res,path.join(proto,file),{
      contentType:MIME[path.extname(file)]||"application/octet-stream"});
  }catch(err){
    if(err instanceof AiError)
      return json(res,err.status,{ok:false,code:err.code,error:err.message});
    const statusCode=Number(err?.status);
    // 4xx/5xx 只在错误自带 code 时原样返回（AI_UNAVAILABLE、PLACES_CORRUPT 等），
    // 未知异常仍统一收敛成 500，避免把内部细节暴露给客户端。
    if(Number.isInteger(statusCode)&&statusCode>=400&&statusCode<600&&typeof err?.code==="string"){
      // 只透出可公开的补充字段（如 409 时保留的客户端稿件），不整包解构错误对象。
      const extra={};
      for(const key of ["reason","keptDraft","currentRevision","currentRawSha256","options"]){
        if(err[key]!==undefined)extra[key]=err[key];
      }
      return json(res,statusCode,{ok:false,code:String(err.code),error:err.message,...extra});
    }
    return json(res,500,{ok:false,code:"INTERNAL_ERROR",
      error:"服务内部错误（不暴露凭证和个人资料）"});
  }
  };
}
// 兼容既有启动方式：直接 `node server.mjs` 或由 live-server.mjs 导入时都必须监听 8791。
// 测试用 SM_AI_NO_LISTEN=1 阻止自动监听，再在随机端口自建实例。
const server=http.createServer(createHandler());
server.on("error",(error)=>{
  if(error.code==="EADDRINUSE"){
    console.error("[socialmate-ai] Port "+PORT+" is already in use. It may be the old standalone server.mjs or another project.");
    console.error("[socialmate-ai] Run: bash socialmate-v1.2/service-v040.sh ensure");
    process.exit(1);
  }
  console.error("[socialmate-ai] HTTP server error:",error.message);
  process.exit(1);
});
// 私密目录/文件权限巡检：历史遗留的 0644（如 current.md）在启动时收紧到 0600，不改正文。
// 测试模式（SM_AI_NO_LISTEN=1）下不启动监听也不做启动巡检，避免碰到真实数据目录。
if(process.env.SM_AI_NO_LISTEN!=="1"){
  tightenPermissions().then((r)=>{
    if(r.changed.length)console.log("[socialmate-ai] permissions tightened:",JSON.stringify(r.changed));
  }).catch((error)=>console.error("[socialmate-ai] permission check failed:",error.message));
  server.listen(PORT,HOST,()=>{
    console.log("[socialmate-ai] http://"+HOST+":"+PORT+
      " | models configured:",JSON.stringify(Object.fromEntries(Object.entries(status()).map(([k,x])=>[k,x.configured]))));
    if(HOST==="0.0.0.0")startLanDiscovery({aiPort:PORT});
  });
}
export {server};
