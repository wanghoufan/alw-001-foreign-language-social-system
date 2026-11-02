import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const source=fs.readFileSync(path.join(ROOT,'source','V1.1-baseline.html'),'utf8');
function payload(value){
  return JSON.parse(value.match(/<script type="application\/json" id="dataset">([\s\S]*?)<\/script>/)[1]);
}
const D=payload(html);
// 取真正的主逻辑内联脚本：外部引用（src=...）与 dataset 的 JSON 脚本不算。
const js=[...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim()).at(-1);

function createHarness({origin='null',cloudResult=null,stored={}}={}){
  const nodes=new Map(),handlers={},calls=[];
  function el(selector){
    if(!nodes.has(selector)){
      const node={textContent:'',innerHTML:'',value:'',checked:false,style:{},dataset:{},
        setAttribute(){},focus(){},addEventListener(){},remove(){},
        insertAdjacentHTML(where,html){this.innerHTML=html+this.innerHTML}};
      node.classList={add(){},remove(){},toggle(){}};
      nodes.set(selector,node);
    }
    return nodes.get(selector);
  }
  const document={
    documentElement:{dataset:{},setAttribute(k,v){this.dataset[k.replace('data-','')]=v}},
    getElementById(id){return id==='dataset'?{textContent:JSON.stringify(D)}:el('#'+id)},
    querySelector:el,querySelectorAll(){return []},
    addEventListener(k,callback){handlers[k]=callback},
    body:{appendChild(){}},createElement(){return {style:{},click(){},remove(){}}}
  };
  const localStorage={
    getItem(k){return stored[k]||null},
    setItem(k,v){stored[k]=v}
  };
  const window={
    location:{origin},scrollTo(){},
    fetch:async(url,options)=>{
      calls.push({url,body:JSON.parse(options.body)});
      return {ok:true,json:async()=>cloudResult??{
        mode:'real-ai',provider:'deepseek',model:'deepseek-flash',
        topic:'户外跑步',reply:'Great! I can show you a local park.',
        questions:['Do you prefer morning runs?','Do you run by the sea?'],
        share:'I can show you Evergreen Park.',
        references:[{kind:'place',id:'39'}]}};
    }
  };
  vm.runInNewContext(js,{window,document,localStorage,console,URL,Blob,
    setTimeout:()=>1,clearTimeout:()=>{},confirm:()=>true},{timeout:3000});
  const click=dataset=>{
    const target={closest(s){
      const m=s.match(/^\[data-([a-z]+)\]$/);
      return m&&Object.hasOwn(dataset,m[1])?{dataset}:null;
    }};
    handlers.click({target});
  };
  // 产品态入口：主按钮「开始录音」，云端授权是「更多」里的显式勾选（默认不勾）。
  function start({cloud=false}={}){
    click({nav:'chat'});
    el('#liveCloudConsent').checked=cloud;
    click({act:'start-recording'});
  }
  function say(text='I like running outdoors near the sea.'){
    el('#msg').value=text;click({act:'send'});
  }
  return {el,click,start,say,calls,stored,document};
}

test('V1.2.1 retains 51 apps / 204 steps / 115 official places',()=>{
  assert.equal(D.apps.length,51);
  assert.equal(D.places.length,115);
  assert.equal(new Set(D.places.map(x=>x.id)).size,115);
  assert.equal(D.apps.reduce((sum,x)=>sum+x.steps.length,0),204);
  assert.equal(payload(source).places.length,23);
});
test('source and official HTML both use content-first and user display settings',()=>{
  for(const file of [source,html]){
    assert.match(file,/function head\(\)\{return ''\}/);
    assert.match(file,/id="displaySettings"/);
    assert.match(file,/function openSettings\(\)/);
    assert.match(file,/storyTags\(/);
    assert.match(file,/--reading-body:16px/);
    assert.match(file,/--reading-en:18px/);
    assert.match(file,/requestRealAI\(/);
  }
});
test('5 tabs have no first-screen green hero',()=>{
  const h=createHarness();
  for(const tab of ['software','hainan','chat','self','people']){
    h.click({nav:tab});
    assert.doesNotMatch(h.el('#content').innerHTML,/class="hero"/);
  }
});
test('display settings: font, English reading and density saved independently',()=>{
  const h=createHarness();
  h.el('#displaySettings').onclick();
  assert.match(h.el('#modalcontent').innerHTML,/显示与阅读设置/);
  h.click({display:'font',value:'huge'});
  h.click({display:'english',value:'extra'});
  h.click({display:'density',value:'compact'});
  assert.equal(h.document.documentElement.dataset.font,'huge');
  assert.equal(h.document.documentElement.dataset.english,'extra');
  assert.equal(h.document.documentElement.dataset.density,'compact');
  const data=JSON.parse(h.stored['alw-preview-v1']);
  assert.equal(data.display.font,'huge');
  assert.equal(data.display.english,'extra');
  assert.equal(data.display.density,'compact');
});
test('about me: custom tags are saved and filter matching content',()=>{
  const h=createHarness();h.click({nav:'self'});
  assert.match(h.el('#content').innerHTML,/data-filter="storyTag"/);
  h.el('#storyTitle').value='周末跑步';
  h.el('#storyCn').value='我喜欢跑步。';
  h.el('#storyEn').value='I enjoy running outdoors.';
  h.el('#storyCategory').value='兴趣';
  h.el('#storyTags').value='户外, 跑步';
  h.click({action:'savestory',id:'new'});
  h.click({filter:'storyTag',value:'户外'});
  assert.match(h.el('#results').innerHTML,/周末跑步/);
  assert.match(h.el('#results').innerHTML,/I enjoy running outdoors/);
  assert.match(h.el('#results').innerHTML,/lang="en"/);
});
test('without cloud consent, never call any paid API',()=>{
  const h=createHarness({origin:'http://127.0.0.1:8791'});
  h.start({cloud:false});
  h.say();
  assert.equal(h.calls.length,0);
  assert.match(h.el('#coachresults').innerHTML,/本地建议/);
});
test('cloud consent on file:// still never calls paid API',()=>{
  const h=createHarness({origin:'null'});
  h.start({cloud:true});h.say();
  assert.equal(h.calls.length,0);
  assert.match(h.el('#coachresults').innerHTML,/仅本地建议/);
});
test('cloud consent from private gateway sends API request and renders cited result',async()=>{
  const h=createHarness({origin:'http://127.0.0.1:8791'});
  h.start({cloud:true});
  h.say();
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].url,'/api/ai/analyze');
  assert.equal(h.calls[0].body.provider,'deepseek');
  assert.equal(h.calls[0].body.includePersonal,false);
  assert.equal(h.calls[0].body.consent,true);
  assert.match(h.el('#coachresults').innerHTML,/智能建议 ·/);
  assert.doesNotMatch(h.el('#coachresults').innerHTML,/本地建议/);
  assert.match(h.el('#coachresults').innerHTML,/Do you prefer morning runs/);
  assert.match(h.el('#recresults').innerHTML,/万绿园/);
});
