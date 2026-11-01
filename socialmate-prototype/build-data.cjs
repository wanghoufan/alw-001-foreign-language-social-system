#!/usr/bin/env node
/**
 * Repeatable, one-way source adapter:
 * authoritative portfolio V1.4 + 115-location guide + reviewed story seed
 * -> standalone offline prototype/data.js (without changing either source).
 *
 * node socialmate-prototype/build-data.cjs --check
 * node socialmate-prototype/build-data.cjs
 */
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const ROOT=__dirname,project=path.resolve(ROOT,'..');
const portfolioPath=path.join(project,'docs','成果整理','2026-10-31 - Mac Mini - ChatGPT - Bilingual Software Portfolio-Demo Guide - V1.4.md');
const guidePath=path.join(project,'docs','成果整理','Hainan-Travel-Guide','baseline','places.json');
const guideRoot=path.join(project,'docs','成果整理','Hainan-Travel-Guide');
const storyPath=path.join(ROOT,'story-seeds.json');
const outputPath=path.join(ROOT,'data.js');
const publicPath=path.join(ROOT,'public-places.js');
const checkOnly=process.argv.includes('--check');
const content=fs.readFileSync(portfolioPath,'utf8');
const groups=content.split(/^## ([ABC])｜(.+)$/gm);
const apps=[];
function section(txt,start,end){
  const at=txt.indexOf(start);
  if(at<0)return'';
  const from=at+start.length;
  let to=txt.length;
  end.forEach(stop=>{const pos=txt.indexOf(stop,from);if(pos>=0&&pos<to)to=pos;});
  return txt.slice(from,to).trim();
}
for(let i=1;i<groups.length;i+=3){
  const category=groups[i],group=groups[i+1],body=groups[i+2];
  const blocks=body.split(/^### (P\d+[^｜\n]*)｜([^\n]+)$/gm);
  for(let j=1;j<blocks.length;j+=3){
    const id=blocks[j].trim(),name=blocks[j+1].trim(),txt=blocks[j+2];
    const cn=section(txt,'**中文**',['**English**','**功能演示']);
    const en=section(txt,'**English**',['**功能演示','### ']);
    const mode=(txt.match(/\*\*功能演示｜([^\n]+)\*\*/)||[])[1]||'';
    const lines=txt.split('\n'),steps=[];
    for(let k=0;k<lines.length;k++){
      const match=lines[k].match(/^\s*(\d+)\.\s+\*\*([^*]+)\*\*\s*(.*?)\s*$/);
      if(!match)continue;
      const no=Number(match[1]),label=match[2].trim(),detail=match[3].trim();
      const following=lines.slice(k+1,k+5).join('\n');
      const english=following.match(/(?:\*\*English｜\*\*|-\s*English:)\s*([^\n]+)/);
      const additional=following.match(/-\s*中文：\s*([^\n]+)/);
      steps.push({
        no,cn:(label.replace(/^中文｜/,'')+(detail?' '+detail:'')).trim(),
        note:additional?.[1]?.trim()||'',
        en:english?.[1]?.trim()||''
      });
    }
    apps.push({id,name,category,group,cn,en,mode,steps,needVerify:/资料有限|未经过|尚未/.test(mode)});
  }
}
const rawPlaces=JSON.parse(fs.readFileSync(guidePath,'utf8'));
const places=rawPlaces.map(p=>{
  const photo=(p.photos||[]).find(x=>x.local && x.status!=='not_found' && fs.existsSync(path.join(guideRoot,x.local)));
  return {
    id:p.id,city:p.city,name:p.name,enName:p.en_name,category:p.category,cn:p.cn,en:p.en,
    location:p.location_cn,mapAmap:p.map_amap,mapGoogle:p.map_google,warning:Boolean(p.warning),
    img:photo?.local||'',photoStatus:photo?.status||'none'
  };
});
const stories=JSON.parse(fs.readFileSync(storyPath,'utf8'));
const phrasesPath=path.join(project,'SocialMate-Data','Language','English','高频句型.md');
const holidayPath=path.join(project,'SocialMate-Data','Topics','Holidays','2026-10-04-国庆-聊天话题包.md');
const phrases=fs.readFileSync(phrasesPath,'utf8').split('\n').filter(s=>s.startsWith('- ')).map(s=>s.slice(2));
const holidayPhrases=fs.readFileSync(holidayPath,'utf8').split('\n')
  .filter(s=>/^\d+\.\s+[A-Z]/.test(s)).map(s=>s.replace(/^\d+\.\s+/,''));
assert.equal(apps.length,51,'V1.4 software count changed; review importer deliberately');
assert.equal(new Set(apps.map(x=>x.id)).size,51,'duplicate P IDs');
assert.equal(apps.reduce((sum,a)=>sum+a.steps.length,0),204,'demo steps count changed; inspect source');
assert.equal(places.length,115,'Hainan source count changed; review importer');
assert.equal(new Set(places.map(x=>x.id)).size,115,'duplicate location IDs');
assert.ok(apps.every(a=>a.cn && a.en && a.steps.length>0),'missing bilingual portfolio data');
assert.ok(places.every(p=>p.cn && p.en && p.mapAmap && p.mapGoogle),'missing location content/maps');
assert.ok(Array.isArray(stories) && stories.length>0,'missing story seed');
const result={
  apps,places,phrases,holidayPhrases,
  meta:{portfolio:'Bilingual Software Portfolio-Demo Guide V1.4',hainan:'Hainan-Travel-Guide baseline places.json',
    portfolioCount:apps.length,placeCount:places.length},
  storyExamples:stories
};

const publicPlaces=places.map(p=>({
  id:p.id,name:p.name,enName:p.enName,city:p.city,category:p.category,
  cn:p.cn,en:p.en,location:p.location,mapAmap:p.mapAmap,mapGoogle:p.mapGoogle
}));
const publicOutput='/* Public-only read-only Hainan place cards. No private people/stories/audio. */\n'+
  'window.SOCIALMATE_PUBLIC_PLACES = '+JSON.stringify({
    meta:{kind:'hainan-public-read-only',count:publicPlaces.length,source:'Hainan-Travel-Guide baseline places.json'},
    places:publicPlaces
  })+';\n';
const output='/* Source-derived offline demo data; do not edit originals. */\n'+
  'window.SOCIALMATE_DATA = '+JSON.stringify(result)+';\n';
if(!checkOnly){
  fs.writeFileSync(outputPath,output,'utf8');
  fs.writeFileSync(publicPath,publicOutput,'utf8');
  console.log('WROTE',outputPath);
}else{
  const old=fs.readFileSync(outputPath,'utf8');
  const marker='window.SOCIALMATE_DATA = ';
  const oldParsed=JSON.parse(old.slice(old.indexOf(marker)+marker.length).trim().replace(/;$/,''));
  assert.deepEqual(oldParsed.apps,apps,'portfolio data is stale; regenerate');
  const withoutOptionalPhoto=xs=>xs.map(({img,photoStatus,...place})=>place);
  assert.deepEqual(withoutOptionalPhoto(oldParsed.places),withoutOptionalPhoto(places),
    'Hainan text/map data is stale; regenerate');
  assert.deepEqual(oldParsed.storyExamples,stories,'story seeds are stale; regenerate');
  const publicCurrent=fs.readFileSync(publicPath,'utf8');
  const publicMarker='window.SOCIALMATE_PUBLIC_PLACES = ';
  const publicParsed=JSON.parse(publicCurrent.slice(publicCurrent.indexOf(publicMarker)+publicMarker.length).trim().replace(/;$/,''));
  assert.deepEqual(publicParsed.places,publicPlaces,'public Hainan data is stale; regenerate');
  assert.ok(!/(storyExamples|personId|sessionId|SecretKey)/i.test(publicCurrent),
    'public Hainan bundle must not contain private data');
  console.log('SOURCE CHECK PASS (no file mutated); regenerate with node build-data.cjs to apply changes');
}
console.log(JSON.stringify({software:apps.length,demoSteps:204,hainan:places.length,storySeeds:stories.length,photosLocal:places.filter(p=>p.img).length}));
