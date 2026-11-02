/**
 * ALW-001 AI preview bridge: private localhost-only server.
 * cd socialmate-prototype/ai-gateway && node --env-file-if-exists=.env server.mjs
 * No CORS; only same-origin HTML may use the API from the browser.
 */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {analyze,AiError,status} from "./core.mjs";
import {liveAsrHub} from "./live-asr-hub.mjs";
import {readProfile,writeProfile,tightenPermissions} from "./profile-store.mjs";
import {createPersonFile,listPeople,suggestSlug} from "./people-store.mjs";
import {getPersonDetail,getPersonPrep,revokePersonFact} from "./person-detail.mjs";
import {addFavorite,listFavorites,removeFavorite} from "./favorites-store.mjs";
import {confirmReview} from "./review-confirm.mjs";
import {buildAiReview,buildLocalReview} from "./session-review.mjs";
import {addDemoFact,bulkDeleteDemoFacts,clearDemo,confirmDemoPending,deleteDemoFact,demoConversationsRoot,demoRoot,demoStatus,editDemoFact,ensureDemoSeeded,ignoreDemoPending,injectDemoFinal,listInbox,listPersonas,moveDemoFactsGroup,readDemoChangelog,readPersona,readSession,restoreDemo,undoDemoChangelog} from "./demo-store.mjs";
import {demoArchiveStatus,pushDemoArchive} from "./demo-archive.mjs";
const here=path.dirname(fileURLToPath(import.meta.url));
const proto=path.resolve(here,"..");
const repoRoot=path.resolve(here,"..","..");
const PORT=Number(process.env.SOCIALMATE_AI_PORT||8791);
const HOST="127.0.0.1"; // Never bind publicly without authentication and HTTPS.
// User-authorized DeepSeek budget. Conservative peak rates (yuan / 1M tokens):
// official pricing 2026-11: cache hit 0.04, miss 2, output 8 for deepseek-flash.
const BUDGET_LIMIT=Math.max(0,Number(process.env.DEEPSEEK_BUDGET_CNY||1));
const BUDGET_FILE=process.env.DEEPSEEK_BUDGET_FILE||path.join(here,".local","ai-budget.json");
const RESERVE_CNY=0.01; // one bounded reply cannot exceed this at current rates
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
function json(res,code,obj){
  res.writeHead(code,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
    "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  res.end(JSON.stringify(obj));
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
function createRateLimiter(){
  let hits=[],lastAt=0;
  return ()=>{
    const now=Date.now();
    hits=hits.filter((t)=>now-t<APPLY_WINDOW_MS);
    if(now-lastAt<APPLY_MIN_GAP_MS)
      return {ok:false,retryAfterMs:APPLY_MIN_GAP_MS-(now-lastAt)};
    if(hits.length>=APPLY_MAX)
      return {ok:false,retryAfterMs:APPLY_WINDOW_MS-(now-hits[0])};
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
  return async(req,res)=>{
  try{
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
      const check=await archive.get("/api/archive/session/__token_probe__",token).catch(()=>null);
      if(!check){
        json(res,503,{ok:false,code:"ARCHIVE_UNAVAILABLE",error:"归档服务未启动或不可达"});
        return null;
      }
      if(check.status===401){
        json(res,401,{ok:false,code:"UNAUTHORIZED",error:"归档令牌无效"});
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
      const html=await fs.readFile(path.resolve(proto,"..","socialmate-v1.2","index.html"));
      return res.writeHead(200,{"Content-Type":"text/html; charset=utf-8",
        "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}).end(html);
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
      const html=await fs.readFile(path.join(here,"archive-history.html"));
      return res.writeHead(200,{"Content-Type":"text/html; charset=utf-8",
        "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'"}).end(html);
    }
    if(url.pathname.startsWith("/v12/api/archive/")){
      await archive.proxy(req,res,url);
      return;
    }
    const file=STATIC.get(url.pathname);
    if(!file)return json(res,404,{ok:false,code:"NOT_FOUND"});
    // Fixed allowlist, no directory traversal or dotfiles.
    const bytes=await fs.readFile(path.join(proto,file));
    return res.writeHead(200,{"Content-Type":MIME[path.extname(file)]||"application/octet-stream",
      "Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}).end(bytes);
  }catch(err){
    if(err instanceof AiError)
      return json(res,err.status,{ok:false,code:err.code,error:err.message});
    const statusCode=Number(err?.status);
    if(Number.isInteger(statusCode)&&statusCode>=400&&statusCode<500)
      return json(res,statusCode,{ok:false,code:String(err.code||"REJECTED"),error:err.message});
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
  server.listen(PORT,HOST,()=>console.log("[socialmate-ai] http://"+HOST+":"+PORT+
    " | models configured:",JSON.stringify(Object.fromEntries(Object.entries(status()).map(([k,x])=>[k,x.configured])))));
}
export {server};
