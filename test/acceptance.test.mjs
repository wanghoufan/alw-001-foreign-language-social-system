import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

let temp, app, server, base, createdPath, addedInteraction;
async function start(){
  server=http.createServer((req,res)=>app.handle(req,res));
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
  base=`http://127.0.0.1:${server.address().port}`;
}
async function stop(){if(server?.listening)await new Promise(resolve=>server.close(resolve));}
async function json(route,opts){const r=await fetch(base+route,opts);return {status:r.status,body:await r.json()};}
before(async()=>{
  temp=await fs.mkdtemp(path.join(os.tmpdir(),'socialmate-acceptance-'));
  process.env.SOCIALMATE_DATA_DIR=temp;
  app=await import('../server.mjs');
  const initializer=await import('../scripts/initialize-data.mjs');
  await initializer.initializeData(temp);
  await start();
});
after(async()=>{await stop();if(temp)await fs.rm(temp,{recursive:true,force:true});});

test('Test A — fictional person, UTF-8 and YAML front matter',async()=>{
  const p=await fs.readFile(path.join(temp,'People/Test-Anna/00-profile.md'),'utf8');
  assert.match(p,/^---\nname: Test-Anna/m);assert.match(p,/country: Russia/);assert.match(p,/喜欢健身和咖啡/);assert.match(p,/虚构演示资料/);
  const created=await json('/api/people',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Anna 新朋友',country:'俄罗斯',city:'海口',languages:'English, 中文',interests:'健身, 咖啡'})});
  assert.equal(created.status,201);createdPath=created.body.path;
  const saved=await fs.readFile(path.join(temp,createdPath),'utf8');assert.match(saved,/name: "Anna 新朋友"/);assert.match(saved,/city: "海口"/);assert.match(saved,/tags: \["健身", "咖啡"\]/);
});
test('Test B — dated interaction preserves tentative plans as tentative',async()=>{
  const p=await fs.readFile(path.join(temp,'People/Test-Anna/2026-10-04-gym.md'),'utf8');
  assert.match(p,/2026-10-04/);assert.match(p,/周末可能去万宁/);assert.match(p,/尚未确认是否成行/);assert.match(p,/每周训练四次/);assert.match(p,/加了微信/);
  const rel=createdPath.replace('/00-profile.md','/2026-10-04-gym.md');const content='# 时间 / 地点\n\n2026-10-04，健身房。\n\n# 本次发生了什么\n\n见面并加了微信。\n\n# 对方主动分享的新信息\n\n周末可能去万宁（尚未确认是否成行）。\n\n# 我分享了什么\n\n未记录。\n\n# 下次可以继续\n\nDid you end up going to Wanning?\n';
  const preview=await json('/api/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content})});assert.equal(preview.status,200);assert.equal(preview.body.baseHash,'NEW');
  const saved=await json('/api/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content,baseHash:preview.body.baseHash,changeId:preview.body.changeId})});assert.equal(saved.status,200);addedInteraction=rel;
  assert.match(await fs.readFile(path.join(temp,rel),'utf8'),/尚未确认是否成行/);
});
test('Test C — communication card facts and reminders are present',async()=>{
  const card=await fs.readFile(path.join(temp,'People/Test-Anna/2026-10-04-沟通卡.md'),'utf8');
  for(const s of ['万宁','中文','健身','Did you end up going to Wanning?','How\'s your Chinese going?','coffee','咖啡','不要重复询问'])assert.ok(card.includes(s),s);
});
test('Test D — National Day topic has before/during/after and requested variants',async()=>{
  const topic=await fs.readFile(path.join(temp,'Topics/Holidays/2026-10-04-国庆-聊天话题包.md'),'utf8');
  for(const s of ['节日前','节日期间','节日后','海口 / 海南版本','健身房版本','酒吧版本','高频词汇','自然邀约'])assert.ok(topic.includes(s),s);
});
test('Test E — Live practice prompt defines Haikou gym, level, timing and debrief',async()=>{
  const html=await (await fetch(base+'/')).text();
  assert.match(html,/option>海口健身房/);assert.match(html,/Level \$\{level\.n\} · \$\{level\.short\}/);
  for(const s of ['10分钟','真人','第一次认识的外国女生','结束练习','中文复盘','预测任何真实人物的反应'])assert.ok(html.includes(s),s);
  for(const s of ["n:1,short:'很友好'","n:2,short:'正常交流'","n:3,short:'稍微冷淡'","n:4,short:'嘈杂酒吧'","n:5,short:'自由实战'",'怎么选','会主动提问、接话','偶尔有自然停顿','回答较短','酒吧噪声','不照顾你的练习节奏','levelSelect.onchange=updateLevel','level.desc'])assert.ok(html.includes(s),s);
});
test('Test F — restart keeps person, interaction and topic files on disk',async()=>{
  await stop();await start();
  const {status,body}=await json('/api/files');assert.equal(status,200);
  assert.ok(body.files.includes('People/Test-Anna/00-profile.md'));
  assert.ok(body.files.includes('People/Test-Anna/2026-10-04-gym.md'));
  assert.ok(body.files.includes(addedInteraction));
  assert.ok(body.files.includes('Topics/Holidays/2026-10-04-国庆-聊天话题包.md'));
  assert.equal(body.people.length,2);
});
test('Test G — preview is non-mutating, explicit approval writes, stale/invalid changes reject',async()=>{
  const rel='People/Test-Anna/00-profile.md';const original=(await fs.readFile(path.join(temp,rel),'utf8'));
  const candidate=original.replace('喜欢健身和咖啡。','喜欢健身和咖啡。\n\n审阅确认的演示补充。');
  let result=await json('/api/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content:candidate})});
  assert.equal(result.status,200);assert.equal(await fs.readFile(path.join(temp,rel),'utf8'),original);
  const preview=result.body;
  result=await json('/api/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content:candidate,baseHash:preview.baseHash,changeId:preview.changeId})});
  assert.equal(result.status,200);assert.equal(await fs.readFile(path.join(temp,rel),'utf8'),candidate);
  result=await json('/api/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content:'错误候选'})});
  assert.equal(result.status,200);const stale=result.body;
  await fs.appendFile(path.join(temp,rel),'\n人工并发修改。');
  result=await json('/api/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:rel,content:stale.after,baseHash:stale.baseHash,changeId:stale.changeId})});
  assert.equal(result.status,409);
  result=await json('/api/apply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'People/Test-Anna/2026-10-04-gym.md',content:'覆盖',baseHash:'x',changeId:'x'})});
  assert.equal(result.status,409);
  result=await json('/api/preview',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({path:'People/Test-Anna/2026-10-04-gym.md',content:'覆盖'})});
  assert.equal(result.status,409);
  assert.match(await fs.readFile(path.join(temp,'People/Test-Anna/2026-10-04-gym.md'),'utf8'),/周末可能去万宁/);
  assert.equal((await json('/api/read?path='+encodeURIComponent('../README.md'))).status,400);
});
