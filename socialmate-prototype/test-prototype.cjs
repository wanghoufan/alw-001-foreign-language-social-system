/**
 * Source-backed HTML prototype tests. Runs with Node.js >= 20; no npm install.
 * The small DOM fixture tests key user flows without pretending to be real-browser QA.
 * Execute from repository root: node --test socialmate-prototype/test-prototype.cjs
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=__dirname;
const js=fs.readFileSync(path.join(root,'app.js'),'utf8');
const dataSource=fs.readFileSync(path.join(root,'data.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
function createHarness(){
  const nodes=new Map(),listeners={},storage={};
  function el(selector){
    if(!nodes.has(selector)){
      nodes.set(selector,{
        innerHTML:'',textContent:'',value:'',dataset:{},style:{},hidden:false,checked:false,
        classList:{add(){},remove(){}},focus(){},setAttribute(){},getAttribute(){return null;},
        addEventListener(type,handler){this['on'+type]=handler;},scrollTop:0,scrollHeight:600,
        select(){},remove(){}
      });
    }
    return nodes.get(selector);
  }
  const document={
    documentElement:{dataset:{}},
    body:{style:{},appendChild(){},removeChild(){}},
    querySelector:el,
    createElement(){return {style:{},value:'',select(){},remove(){},click(){}};},
    execCommand(){return true;},
    addEventListener(type,callback){listeners[type]=callback;}
  };
  const window={
    isSecureContext:false,
    addEventListener(type,callback){listeners['window-'+type]=callback;},
    scrollTo(){},confirm(){return true;}
  };
  const localStorage={
    getItem(k){return storage[k]||null;},
    setItem(k,v){storage[k]=v;}
  };
  const ctx={window,document,localStorage,location:{hash:''},
    navigator:{clipboard:{writeText:async()=>{}}},console,
    setTimeout:()=>1,clearTimeout:()=>{},URL,Blob,Date};
  vm.runInNewContext(dataSource,ctx,{filename:'data.js'});
  vm.runInNewContext(js,ctx,{filename:'app.js'});
  function click(dataset){
    listeners.click({preventDefault(){},target:{
      closest(selector){
        const key=selector.slice(6,-1);
        return Object.prototype.hasOwnProperty.call(dataset,key)?{dataset}:null;
      }
    }});
  }
  return {nodes,el,click,data:window.SOCIALMATE_DATA,storage,document};
}
test('sources: V1.4 51 products, fixed P-IDs, 204 demo steps; Hainan 115',()=>{
  const {data}=createHarness();
  assert.equal(data.apps.length,51);
  assert.equal(data.places.length,115);
  assert.equal(new Set(data.apps.map(x=>x.id)).size,51);
  assert.equal(new Set(data.places.map(x=>x.id)).size,115);
  assert.equal(data.apps.reduce((sum,x)=>sum+x.steps.length,0),204);
  assert.ok(data.apps[0].id.startsWith('P'));
  assert.equal(data.meta.portfolio,'Bilingual Software Portfolio-Demo Guide V1.4');
});
test('responsive accessible shell, light and dark theme, 5 nav tabs',()=>{
  assert.match(html,/lang="zh-CN"/);
  assert.match(html,/id="mobileNav"/);
  assert.match(html,/id="desktopNav"/);
  assert.match(html,/name="viewport"/);
  assert.match(css,/max-width:\s*760px/);
  assert.match(css,/data-theme="dark"/);
  const h=createHarness();
  assert.match(h.el('#mobileNav').innerHTML,/data-tab="people"/);
  assert.equal((h.el('#mobileNav').innerHTML.match(/data-tab="/g)||[]).length,5);
  assert.equal(h.el('#pageTitle').textContent,'我的软件');
});
test('mobile software presentation includes intact English steps',()=>{
  const h=createHarness();
  assert.match(h.el('#workspace').innerHTML,/P002/);
  h.click({action:'detail-app',id:'P005'});
  assert.match(h.el('#drawerBody').innerHTML,/Family Tree/);
  assert.match(h.el('#drawerBody').innerHTML,/First, I add family members/);
});
test('Hainan maps and bilingual cards, later pinned reference in chat',()=>{
  const h=createHarness();
  h.click({tab:'hainan'});
  assert.match(h.el('#workspace').innerHTML,/龙兴路/);
  h.click({action:'detail-place',id:'3'});
  assert.match(h.el('#drawerBody').innerHTML,/Qilou Old Street/);
  assert.match(h.el('#drawerBody').innerHTML,/Google Maps/);
  h.click({action:'use-place',id:'3'});
  h.click({tab:'chat'});
  assert.match(h.el('#workspace').innerHTML,/骑楼老街/);
});
test('Manual search across all corpora is usable even before chat',()=>{
  const h=createHarness();
  h.click({tab:'chat'});
  h.el('#refSearch').value='万绿园';
  h.click({action:'search-refs',id:''});
  assert.match(h.el('#workspace').innerHTML,/万绿园/);
});
test('about-me draft and people are visibly separate; Anna demo is labeled',()=>{
  const h=createHarness();
  h.click({tab:'self'});
  assert.match(h.el('#workspace').innerHTML,/我来自海口/);
  h.click({tab:'people'});
  assert.match(h.el('#workspace').innerHTML,/Anna（演示）/);
});
test('manual conversation requires consent, retrieves Wanlv Park, reviews before storing',()=>{
  const h=createHarness();
  h.click({tab:'chat'});
  h.click({action:'start-session',id:''});
  assert.match(h.el('#modalRoot').innerHTML,/不会访问麦克风/);
  h.click({action:'confirm-start',id:''});
  assert.doesNotMatch(h.el('#workspace').innerHTML,/模拟识别完成/);
  h.el('#demoConsent').checked=true;
  h.click({action:'confirm-start',id:''});
  assert.match(h.el('#workspace').innerHTML,/模拟识别完成/);
  h.click({action:'sample',id:'outdoors'});
  assert.match(h.el('#workspace').innerHTML,/I love running outdoors/);
  assert.match(h.el('#workspace').innerHTML,/万绿园/);
  h.click({action:'end-session',id:''});
  assert.match(h.el('#modalRoot').innerHTML,/会后复核/);
  h.el('#reviewCheck').checked=true;
  h.el('#reviewText').value='Manually confirmed source text';
  h.click({action:'save-review',id:''});
  assert.match(h.el('#workspace').innerHTML,/最近的会话/);
  assert.match(h.el('#workspace').innerHTML,/1 句话/);
  assert.equal(JSON.parse(h.storage['socialmate-prototype-v1']).sessions.length,1);
});
test('independent Hainan public share page contains 115 places and no personal data',()=>{
  const pubHtml=fs.readFileSync(path.join(root,'public-share.html'),'utf8');
  const pubJs=fs.readFileSync(path.join(root,'public-places.js'),'utf8');
  const publicController=fs.readFileSync(path.join(root,'public-share.js'),'utf8');
  const window={};
  vm.runInNewContext(pubJs,{window},{filename:'public-places.js'});
  new vm.Script(publicController,{filename:'public-share.js'});
  assert.equal(window.SOCIALMATE_PUBLIC_PLACES.places.length,115);
  assert.match(pubHtml,/src="public-places.js"/);
  assert.match(pubHtml,/src="public-share.js"/);
  assert.doesNotMatch(pubHtml,/src="data.js"/);
  assert.doesNotMatch(pubJs,/"(?:storyExamples|personId|sessionId|SecretKey|notes|rawTranscript)"\s*:/i);
});
test('automatic conversation coaching links running to Hainan places without searching',()=>{
  const h=createHarness();
  h.click({tab:'chat'});
  assert.match(h.el('#workspace').innerHTML,/AI 对话助手 · 自动接话/);
  assert.doesNotMatch(h.el('#workspace').innerHTML,/全库查找/);
  h.click({action:'start-session',id:''});
  h.el('#demoConsent').checked=true;
  h.click({action:'confirm-start',id:''});
  h.click({action:'sample',id:'running'});
  const html=h.el('#workspace').innerHTML;
  assert.match(html,/Do you prefer running along the coast or through a park/);
  assert.match(html,/万绿园/);
  assert.match(html,/海口湾滨海步道/);
  assert.match(html,/白沙门公园/);
  assert.match(html,/data-action="open-related"/);
  assert.match(html,/海南地点库 · NO.039/);
  assert.match(html,/需要时手动查找其他资料/);
});
test('source card click navigates to Hainan detail and returns with conversation intact',()=>{
  const h=createHarness();
  h.click({tab:'chat'});
  h.click({action:'start-session',id:''});
  h.el('#demoConsent').checked=true;
  h.click({action:'confirm-start',id:''});
  h.click({action:'sample',id:'running'});
  // Exercise the same delegated click path as the original HTML.
  h.el('#drawerBody').insertAdjacentHTML=function(_where,markup){this.innerHTML=markup+this.innerHTML;};
  const listeners={};
  // Data element is dispatched by the generic synthetic click harness.
  h.click({action:'open-related',id:'39',kind:'place'});
  assert.equal(h.el('#pageTitle').textContent,'海南分享');
  assert.match(h.el('#drawerBody').innerHTML,/万绿园/);
  assert.match(h.el('#drawerBody').innerHTML,/返回聊天/);
  h.click({action:'return-chat',id:''});
  assert.match(h.el('#workspace').innerHTML,/I love running outdoors/);
});

test('all five first-level pages prioritize content without top promotional hero',()=>{
  const h=createHarness();
  for(const tab of ['software','hainan','chat','self','people']){
    h.click({tab});
    assert.doesNotMatch(h.el('#workspace').innerHTML,/class="hero"/);
  }
});
test('display settings change font, English size, density and persist without clearing data',()=>{
  const h=createHarness();
  h.el('#settingsButton').onclick();
  assert.match(h.el('#modalRoot').innerHTML,/显示与阅读设置/);
  h.click({action:'display-option',group:'font',id:'huge'});
  h.click({action:'display-option',group:'english',id:'extra'});
  h.click({action:'display-option',group:'density',id:'compact'});
  assert.equal(h.document.documentElement.dataset.font,'huge');
  assert.equal(h.document.documentElement.dataset.english,'extra');
  assert.equal(h.document.documentElement.dataset.density,'compact');
  const saved=JSON.parse(h.storage['socialmate-prototype-v1']);
  assert.equal(saved.display.font,'huge');
  assert.equal(saved.display.english,'extra');
  assert.equal(saved.display.density,'compact');
  assert.equal(saved.stories.length,h.data.storyExamples.length);
});
test('about me is multi-tagged, editable and filterable without removing original categories',()=>{
  const h=createHarness();
  h.click({tab:'self'});
  h.click({action:'new-story',id:''});
  h.el('#storyTitle').value='周末跑步';
  h.el('#storyCn').value='我喜欢周末跑步。';
  h.el('#storyEn').value='I like running outdoors on weekends.';
  h.el('#storyTopic').value='兴趣';
  h.el('#storyTags').value='户外, 跑步';
  h.click({action:'save-story',id:'new'});
  assert.match(h.el('#workspace').innerHTML,/周末跑步/);
  assert.match(h.el('#workspace').innerHTML,/data-value="户外"/);
  h.click({filter:'storyTopic',value:'户外'});
  assert.match(h.el('#workspace').innerHTML,/周末跑步/);
  assert.match(h.el('#workspace').innerHTML,/I like running outdoors on weekends/);
});
test('production constraints: no microphone or ASR API or external JavaScript SDK',()=>{
  assert.doesNotMatch(js,/getUserMedia\s*\(/);
  assert.doesNotMatch(js,/new\s+WebSocket\s*\(/);
  assert.doesNotMatch(js,/TENCENT_SECRET/i);
  assert.doesNotMatch(html,/<script\s+src="https?:/);
  assert.match(html,/<script src="data.js"><\/script>/);
  assert.match(html,/<script src="app.js"><\/script>/);
});
