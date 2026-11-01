(function () {
  "use strict";
  var DATA = window.SOCIALMATE_DATA || {apps:[],places:[],storyExamples:[],phrases:[],holidayPhrases:[]};
  var KEY = "socialmate-prototype-v1";
  var TABS = [
    {id:"software",label:"软件",icon:"i-grid",title:"我的软件",sub:"SOFTWARE COLLECTION"},
    {id:"hainan",label:"海南",icon:"i-map",title:"海南分享",sub:"DISCOVER HAINAN"},
    {id:"chat",label:"聊天",icon:"i-mic",title:"实时聊天",sub:"CONVERSATION COMPANION"},
    {id:"self",label:"关于我",icon:"i-user",title:"关于我",sub:"MY STORIES & INTERESTS"},
    {id:"people",label:"人物",icon:"i-users",title:"人物档案",sub:"PEOPLE & CONVERSATIONS"}
  ];
  var store;
  try {store=JSON.parse(localStorage.getItem(KEY)||"{}");}catch(e){store={};}
  if(!store || typeof store!=="object")store={};
  if(!Array.isArray(store.stories))store.stories=DATA.storyExamples.slice();
  if(!Array.isArray(store.people))store.people=[{id:"demo-anna",name:"Anna（演示）",about:"虚构示例人物，非真实聊天记录",interests:["outdoors","travel"],demo:true,notes:[]}];
  if(!Array.isArray(store.sessions))store.sessions=[];
  if(!Array.isArray(store.saved))store.saved=[];
  if(!store.theme)store.theme="light";
  if(!store.display || typeof store.display!=="object")store.display={};
  if(!["normal","large","extra","huge"].includes(store.display.font))store.display.font="normal";
  if(!["normal","large","extra"].includes(store.display.english))store.display.english="normal";
  if(!["compact","comfortable","relaxed"].includes(store.display.density))store.display.density="comfortable";
  var state={tab:"software",query:"",group:"A",category:"全部",city:"全部",storyTopic:"全部",drawer:null,person:"",session:null,review:null,toastTimeout:0,suggestions:[],aiResult:null,aiState:"local",aiError:"",aiSeq:0,aiProvider:"deepseek",aiModel:"deepseek-flash"};
  var $=function(sel){return document.querySelector(sel);};
  var root=$("#workspace");
  var esc=function(x){return String(x==null?"":x).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");};
  var icon=function(id,cls){return '<svg class="icon '+(cls||"")+'" aria-hidden="true"><use href="#'+id+'"></use></svg>';};
  var persist=function(){try{localStorage.setItem(KEY,JSON.stringify(store));return true;}catch(e){toast("本机存储不可用，请及时导出资料");return false;}};
  var toast=function(message){var t=$("#toast");t.textContent=message;t.hidden=false;clearTimeout(state.toastTimeout);state.toastTimeout=setTimeout(function(){t.hidden=true;},2600);};
  var uid=function(){return Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);};
  var now=function(){return new Date().toLocaleString("zh-CN",{hour12:false});};
  var cnTime=function(){return new Date().toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"});};
  function copyText(text){
    if(navigator.clipboard&&window.isSecureContext)return navigator.clipboard.writeText(text).then(function(){toast("已复制到剪贴板");}).catch(function(){fallbackCopy(text);});
    fallbackCopy(text);
  }
  function fallbackCopy(value){
    var field=document.createElement("textarea");field.value=value;field.style.position="fixed";field.style.opacity="0";document.body.appendChild(field);field.select();
    try {var ok=document.execCommand("copy");toast(ok?"已复制到剪贴板":"无法自动复制，请选中文字复制");}catch(e){toast("无法自动复制，请选中文字复制");}
    field.remove();
  }
  function saveText(name,text,type){
    var blob=new Blob([text],{type:type||"text/plain;charset=utf-8"});var url=URL.createObjectURL(blob);
    var link=document.createElement("a");link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
    toast("已生成本地文件");
  }
  function theme(){
    applyDisplay();
    $("#themeMobile").innerHTML=icon(store.theme==="light"?"i-moon":"i-sun");
    $("#themeDesktop").textContent=store.theme==="light"?"切换深色主题":"切换浅色主题";
  }

  function applyDisplay(){
    var el=document.documentElement;
    el.dataset.theme=store.theme;
    el.dataset.font=store.display.font;
    el.dataset.english=store.display.english;
    el.dataset.density=store.display.density;
  }
  function settingOptions(group,items,current){
    return '<div class="settings-options" role="group" aria-label="'+
    (group==="font"?"整体字号":group==="english"?"英文字号":"内容密度")+'">'+items.map(function(item){
      return '<button type="button" class="setting-choice '+(current===item.id?"active":"")+
       '" aria-pressed="'+(current===item.id?"true":"false")+
       '" data-action="display-option" data-group="'+group+'" data-id="'+item.id+'">'+esc(item.label)+'</button>';
    }).join("")+'</div>';
  }
  function openDisplaySettings(){
    openModal('<div class="settings-modal"><div class="settings-heading"><h2>显示与阅读设置</h2>'+
      '<button type="button" class="icon-btn" data-action="close-modal" aria-label="关闭设置">'+icon("i-close")+'</button></div>'+
      '<p>设置立即生效，所有页面共用；下次打开也会记住。</p>'+
      '<div class="field-group"><label class="field-label">整体文字大小</label>'+
      settingOptions("font",[{id:"normal",label:"标准"},{id:"large",label:"较大"},{id:"extra",label:"大字"},{id:"huge",label:"超大"}],store.display.font)+'</div>'+
      '<div class="field-group"><label class="field-label">英文阅读字号</label>'+
      settingOptions("english",[{id:"normal",label:"标准"},{id:"large",label:"加大"},{id:"extra",label:"特大"}],store.display.english)+'</div>'+
      '<div class="field-group"><label class="field-label">页面与卡片间距</label>'+
      settingOptions("density",[{id:"compact",label:"紧凑"},{id:"comfortable",label:"舒适"},{id:"relaxed",label:"宽松"}],store.display.density)+'</div>'+
      '<div class="field-group"><label class="field-label">主题</label>'+
      '<div class="settings-options">'+
      '<button type="button" class="setting-choice '+(store.theme==="light"?"active":"")+'" data-action="set-theme" data-id="light" aria-pressed="'+(store.theme==="light")+'">浅色</button>'+
      '<button type="button" class="setting-choice '+(store.theme==="dark"?"active":"")+'" data-action="set-theme" data-id="dark" aria-pressed="'+(store.theme==="dark")+'">深色</button></div></div>'+
      '<div class="settings-preview"><strong>实时阅读预览</strong><p>海口有很多适合散步和放松的地方。</p>'+
      '<p class="english-reading" lang="en">Do you prefer running by the sea or walking in a park?</p></div>'+
      '<div class="button-row">'+button("reset-display","","恢复默认","")+button("close-modal","","完成","btn-primary")+'</div></div>');
  }
  function nav(){
    $("#desktopNav").innerHTML=TABS.map(function(t){return '<button type="button" class="nav-item '+(state.tab===t.id?"active":"")+'" data-tab="'+t.id+'" aria-current="'+(state.tab===t.id?"page":"false")+'">'+icon(t.icon,"nav-icon")+esc(t.label)+'</button>';}).join("");
    $("#mobileNav").innerHTML=TABS.map(function(t){return '<button type="button" class="'+(state.tab===t.id?"active":"")+'" data-tab="'+t.id+'" aria-label="'+esc(t.label)+'" aria-current="'+(state.tab===t.id?"page":"false")+'">'+icon(t.icon,"nav-icon")+'<span>'+esc(t.label)+'</span></button>';}).join("");
    var t=TABS.find(function(t){return t.id===state.tab;});
    $("#pageTitle").textContent=t.title;$("#pageEyebrow").textContent=t.sub;
  }
  function switchTab(id){
    if(!TABS.some(function(t){return t.id===id;}))return;
    state.tab=id;state.query="";state.category="全部";state.city="全部";state.storyTopic="全部";state.group="A";
    closeDrawer();nav();render();window.scrollTo(0,0);
  }
  function searchbar(placeholder){
    return '<label class="searchfield">'+icon("i-search")+'<input id="pageSearch" data-input="search" type="search" autocomplete="off" value="'+esc(state.query)+'" placeholder="'+esc(placeholder)+'" aria-label="'+esc(placeholder)+'"></label>';
  }
  function pills(items,selected,kind){
    return '<div class="pill-group" role="group">'+items.map(function(v){return '<button type="button" class="pill '+(v===selected?"active":"")+'" data-filter="'+kind+'" data-value="'+esc(v)+'">'+esc(v)+'</button>';}).join("")+'</div>';
  }
  function button(action,id,label,kind){
    return '<button type="button" class="btn '+(kind||"")+'" data-action="'+esc(action)+'" data-id="'+esc(id)+'">'+label+'</button>';
  }
  function empty(title,body){return '<div class="empty"><strong>'+esc(title)+'</strong><p>'+esc(body)+'</p></div>';}
  function trimmed(s,len){s=String(s||"").replace(/\s+/g," ").trim();return s.length>len?s.slice(0,len-1)+"…":s;}
  function appCard(a){
    return '<article class="info-card"><div class="card-meta"><span class="mini-tag">'+esc(a.id)+'</span><span>'+esc(a.category==="A"?"手机优先":a.category==="B"?"需特定条件":"电脑／管理工具")+'</span></div>'+
    '<h3>'+esc(a.name)+'</h3><p>'+esc(a.en)+'</p><div class="card-actions">'+
    '<span class="muted">'+a.steps.length+' 个演示步骤'+(a.needVerify?" · 待核实":"")+'</span>'+
    button("detail-app",a.id,"查看双语演示 "+icon("i-arrow","small"),"btn-ghost")+'</div></article>';
  }
  function software(){
    var groups=[{id:"A",text:"APP / PWA"},{id:"B",text:"手机／特定环境"},{id:"C",text:"桌面／其他"}];
    var q=state.query.trim().toLowerCase();
    var apps=DATA.apps.filter(function(a){return a.category===state.group && (!q || [a.id,a.name,a.cn,a.en].join(" ").toLowerCase().includes(q));});
    return     '<div class="toolbar">'+searchbar("搜索 P 编号、软件名称、功能……")+'</div>'+
    '<div class="pill-group" role="group">'+groups.map(function(g){return '<button type="button" class="pill '+(state.group===g.id?"active":"")+'" data-filter="group" data-value="'+g.id+'">'+g.text+' · '+DATA.apps.filter(function(a){return a.category===g.id;}).length+'</button>';}).join("")+'</div>'+
    '<div class="section-heading"><h2>'+esc(groups.find(function(x){return x.id===state.group;}).text)+'</h2><span id="searchCount">找到 '+apps.length+' 项</span></div>'+
    '<div id="searchResults">'+(apps.length?'<div class="card-grid">'+apps.map(appCard).join("")+'</div>':empty("没有找到匹配软件","换个关键词，或切换类别"))+'</div>'+
    '<p class="information-note">资料规则：原 P 编号和四项功能演示编号保持不变。「资料有限 / 待真机核实」不冒充已经验收的按钮操作。此原型没有修改 V1.4 原稿。</p>';
  }
  function placeArt(x){
    var mode=/夜|酒|夜市|美食/.test(x.category)?"night":/海|滩|日落/.test(x.category)?"sand":"leaf";
    return '<div class="place-art '+mode+'"><span class="art-word">'+esc(String(x.enName||"H").slice(0,1))+'</span><span class="art-label">'+esc(x.category||"海南")+'</span></div>';
  }
  function placeCard(x){
    return '<article class="info-card place-card">'+placeArt(x)+'<div class="place-content"><div class="card-meta"><span class="mini-tag">NO. '+String(x.id).padStart(3,"0")+'</span><span>'+esc(x.city)+'</span></div><h3>'+esc(x.name)+'</h3><span class="english-name">'+esc(x.enName)+'</span><p>'+esc(trimmed(x.en,160))+'</p><div class="card-actions">'+button("detail-place",x.id,"查看分享卡 "+icon("i-chevron","small"),"btn-ghost")+'</div></div></article>';
  }
  function hainan(){
    var categories=["全部"].concat(Array.from(new Set(DATA.places.map(function(x){return x.category;}))));
    var cities=["全部"].concat(Array.from(new Set(DATA.places.map(function(x){return x.city;}))));
    var q=state.query.trim().toLowerCase();
    var items=DATA.places.filter(function(x){return (state.category==="全部"||x.category===state.category)&&(state.city==="全部"||x.city===state.city)&&(!q||[x.name,x.enName,x.cn,x.en,x.location].join(" ").toLowerCase().includes(q));});
    return     '<div class="toolbar">'+searchbar("搜地点、英文地名、海滩、咖啡、徒步……")+'<select class="slim-select" data-select="city" aria-label="选择城市">'+cities.map(function(c){return '<option '+(state.city===c?"selected":"")+' value="'+esc(c)+'">'+esc(c==="全部"?"所有城市":c)+'</option>';}).join("")+'</select></div>'+
    pills(categories,state.category,"category")+
    '<div class="section-heading"><h2>值得分享的地方</h2><span id="searchCount">显示 '+items.length+' / 115</span></div>'+
    '<div id="searchResults">'+(items.length?'<div class="card-grid">'+items.map(placeCard).join("")+'</div>':empty("未找到地点","可以尝试换个关键词或取消筛选"))+'</div>'+
    '<p class="information-note">地点介绍与地图链接来自原 115 地点资料。当前是交互演示，地图打开需要联网；图片版权状态及来源未核实的照片不作为本原型的公开配图。</p>';
  }
  function storyTags(x){return Array.from(new Set([x.topic].concat(Array.isArray(x.tags)?x.tags:[]).filter(Boolean)));}
  function selfCard(x){
    var status=x.status==="confirmed"?"已确认":"待核对";
    return '<article class="note-card"><div class="card-meta">'+storyTags(x).slice(0,4).map(function(t){return '<span class="mini-tag">'+esc(t)+'</span>';}).join("")+'<span>'+status+'</span></div><h3>'+esc(x.title)+'</h3><p>'+esc(x.cn)+'</p><p class="note-english">'+esc(x.en)+'</p><div class="button-row">'+button("detail-story",x.id,"查看 / 修改","btn-soft")+button("use-story",x.id,"放进聊天参考","")+'</div></article>';
  }
  function self(){
    var topics=["全部"].concat(Array.from(new Set(store.stories.flatMap(storyTags))));
    var q=state.query.toLowerCase().trim();
    var items=store.stories.filter(function(x){return (state.storyTopic==="全部"||storyTags(x).includes(state.storyTopic))&&(!q||[x.title,x.cn,x.en,storyTags(x).join(" ")].join(" ").toLowerCase().includes(q));});
    return     '<div class="toolbar">'+searchbar("搜索经历、健身、咖啡、工作……")+button("new-story","","新增话题 "+icon("i-plus","small"),"btn-primary")+'</div>'+
    pills(topics,state.storyTopic,"storyTopic")+
    '<div class="section-heading"><h2>我的故事与兴趣</h2><span id="searchCount">显示 '+items.length+' 项</span></div>'+
    '<div id="searchResults">'+(items.length?'<div class="card-grid">'+items.map(selfCard).join("")+'</div>':empty("还没有此类话题","点击新增，建立你自己的聊天卡片"))+'</div>'+
    '<p class="information-note">此页面属于私人资料区。示例语料来自已知信息或标记待核对的草稿，允许直接修改；本 HTML 的编辑结果只保存在当前浏览器，不会自动上传或写回正式 Markdown。不要将私人版本公开部署。</p>';
  }
  function personCard(x){
    var sessions=store.sessions.filter(function(s){return s.personId===x.id;}).length;
    return '<article class="person-card"><div class="avatar">'+esc(x.name.slice(0,1))+'</div><div class="person-copy"><h3>'+esc(x.name)+'</h3><p>'+esc(x.about||"尚无简介")+' · '+sessions+' 次记录'+(x.demo?" · 虚构示例":"")+'</p></div><button class="icon-btn" data-action="detail-person" data-id="'+esc(x.id)+'" type="button" aria-label="打开人物">'+icon("i-chevron")+'</button></article>';
  }
  function people(){
    var q=state.query.toLowerCase().trim();
    var people=store.people.filter(function(x){return [x.name,x.about,(x.interests||[]).join(" ")].join(" ").toLowerCase().includes(q);});
    return     '<div class="toolbar">'+searchbar("搜索人物或兴趣……")+button("new-person","","新建人物 "+icon("i-plus","small"),"btn-primary")+'</div>'+
    '<div class="section-heading"><h2>人物列表</h2><span id="searchCount">显示 '+people.length+' 人</span></div>'+
    '<div id="searchResults">'+(people.length?'<div class="list-rows">'+people.map(personCard).join("")+'</div>':empty("没有找到人物","新建一个人物档案，再整理你们的谈话"))+'</div>'+
    '<div class="section-heading"><h2>最近的会话</h2><span>'+store.sessions.length+' 条</span></div>'+
    (store.sessions.length?'<div class="list-rows">'+store.sessions.slice().reverse().slice(0,8).map(function(s){return '<div class="person-card"><div class="avatar">'+icon("i-clock")+'</div><div class="person-copy"><h3>'+esc(s.personName||"未关联人物")+'</h3><p>'+esc(s.date)+' · '+s.messages.length+' 句话 · '+(s.confirmed?"已确认归档":"未确认记录")+'</p></div>'+button("detail-session",s.id,"查看记录","btn-soft")+'</div>';}).join("")+'</div>':empty("还没有真实会话","可以先去聊天页，用手动输入模拟一轮交流"))+
    '<p class="information-note">演示人物 Anna 是虚构的。正式系统人物主档写入应通过既有 /api/preview → /api/apply 人工确认；单次会话不可覆盖历史原文。</p>';
  }
  // A transparent rule-based preview of the intended ASR -> AI -> corpus flow.
  // Not a claim that Tencent or a generative model has already run.
  function currentContext(){
    var last=state.session&&state.session.messages?state.session.messages.slice(-4):[];
    var text=last.map(function(m){return m.text;}).join(" ").toLowerCase();
    if(/跑步|慢跑|夜跑|晨跑|马拉松|户外|徒步|散步|running|jogging|jog|runner|outdoor|hiking|walking|go for a run|go running|park|trail/.test(text))return "running";
    if(/咖啡|拿铁|coffee|latte|café|cafe|espresso/.test(text))return "coffee";
    if(/海边|海滩|沙滩|日落|beach|sunset|ocean|seaside|sea view/.test(text))return "beach";
    if(/软件|编程|项目|app|software|coding|developer|project|build an app/.test(text))return "software";
    if(/美食|吃饭|夜市|food|snack|night market|restaurant/.test(text))return "food";
    return last.length?"other":"none";
  }
  function conversationCoach(){
    var topic=currentContext();
    var options={
      running:{
        label:"户外运动 · 跑步",
        reply:"That sounds great! Running outdoors is a nice way to explore a city.",
        questions:[
          "Do you prefer running along the coast or through a park?",
          "Do you usually run in the morning or in the evening?",
          "Have you explored any of Haikou's waterfront parks yet?"
        ],
        share:"If you'd like to explore, there's Evergreen Park and the Haikou Bay waterfront walk. We could check the locations together.",
        why:"对话提到了户外跑步，自动关联海口公园与滨海步道。"
      },
      coffee:{
        label:"咖啡与日常",
        reply:"Nice! Coffee spots can be a fun way to get to know a city.",
        questions:["Do you prefer espresso or a milk-based coffee?","Have you found a café you like in Haikou?","Would you rather try a small café or a lively neighborhood?"],
        share:"I enjoy medium-roast coffee and often make lattes at home.",
        why:"对话提到咖啡，关联个人咖啡话题和海南已有街区资料。"
      },
      beach:{
        label:"海边与日落",
        reply:"Haikou has some beautiful places to enjoy the coast.",
        questions:["Do you like quiet beaches or busy waterfronts?","Would you rather go for a sunset walk or take photos?","Have you visited the coast near Haikou Bay?"],
        share:"I can show you a few seaside spots from my Hainan guide.",
        why:"对话涉及海边和日落，关联可核对的海滨地点。"
      },
      software:{
        label:"软件与个人兴趣",
        reply:"I enjoy seeing how people use technology in everyday life.",
        questions:["What kind of apps do you use most often?","Have you ever had an idea for an app yourself?","Would you like to see a small project I made?"],
        share:"I like building little apps that solve everyday problems.",
        why:"对话提到了软件，关联正式 V1.4 软件演示资料。"
      },
      food:{
        label:"吃饭与夜市",
        reply:"Trying local food is one of the nicest ways to explore Haikou.",
        questions:["Have you tried Hainanese noodles yet?","Do you like street food or quieter restaurants?","Would you be up for checking out a local night market?"],
        share:"I can show you some local food spots and their locations.",
        why:"对话提到吃饭，关联海南夜市与当地小吃地点。"
      },
      other:{
        label:"日常交流",
        reply:"Oh, that's interesting!",
        questions:["How did you get into that?","What do you enjoy most about it?","What's been your favorite part of living or traveling here?"],
        share:"I was born and raised in Haikou. It's nice getting to know people from different places.",
        why:"当前话题还不明确，先用自然追问延续交流，不强行推荐无关地点。"
      }
    };
    return options[topic]||null;
  }
  function autoLinks(){
    var topic=currentContext(),result=[],known={};
    function add(kind,id,label){
      var data=kind==="place"?DATA.places:kind==="app"?DATA.apps:store.stories;
      var x=data.find(function(o){return String(o.id)===String(id);});
      if(!x||known[kind+":"+id])return;
      known[kind+":"+id]=true;
      result.push({kind:kind,id:x.id,title:kind==="story"?x.title:x.name,en:x.en,domain:kind==="place"?"海南地点":kind==="app"?"软件作品":"关于我",label:label||"资料库原文"});
    }
    if(topic==="running"){
      add("place",39,"海口 · 公园");add("place",41,"海口 · 海湾步道");add("place",45,"海口 · 公园");
      add("story","self-fitness","我可以聊的兴趣");
    } else if(topic==="coffee"){
      add("story","self-coffee","我可以分享");
      add("place",1,"海口 · 街区与咖啡");
      add("place",2,"海口 · 街区与咖啡");
    } else if(topic==="beach"){
      add("place",41,"海口 · 海边散步");add("place",42,"海口 · 海滩");add("place",43,"海口 · 海滩");
    } else if(topic==="software"){
      add("story","self-apps","我可以分享");
      DATA.apps.filter(function(x){return x.category==="A";}).slice(0,2).forEach(function(x){add("app",x.id,"V1.4 · 正式演示");});
    } else if(topic==="food"){
      add("place",6,"海口 · 夜市");add("place",18,"海口 · 小吃");add("place",16,"海口 · 街区");
    } else if(topic==="other"&&state.session&&state.session.messages.length){
      searchCorpus(state.session.messages.slice(-3).map(function(m){return m.text;}).join(" ")).slice(0,3).forEach(function(x){if(!known[x.kind+":"+x.id]){known[x.kind+":"+x.id]=true;result.push(x);}});
    }
    return result;
  }
  function recSources(){
    var pinned=store.saved.slice(0,2).map(function(s){return {kind:s.kind,id:s.id,title:s.title,en:s.en,domain:s.kind==="place"?"海南地点":s.kind==="app"?"软件作品":"关于我",label:"我的收藏"};});
    var cards=state.suggestions.concat(pinned.filter(function(p){return !state.suggestions.some(function(s){return s.kind===p.kind&&String(s.id)===String(p.id);});})).slice(0,4);
    if(!cards.length)return '<div class="empty"><strong>聊天时这里会自动出现相关卡片</strong><p>例如谈到户外跑步，系统会关联万绿园、海口湾滨海步道等真实地点。无需主动搜索。</p></div>';
    return cards.map(function(c){
      var source=c.kind==="place"?"海南地点库 · NO."+String(c.id).padStart(3,"0"):c.kind==="app"?"正式软件作品集 · "+c.id:"已确认/待核对的个人话题";
      return '<article class="rec-card auto-rec-card"><button type="button" class="rec-card-open" data-action="open-related" data-id="'+esc(c.id)+'" data-kind="'+esc(c.kind)+'" aria-label="查看'+esc(c.title)+'的中英文原始资料">'+
        '<span class="card-meta"><span class="mini-tag">'+esc(c.domain)+'</span><span>'+esc(c.label)+'</span></span>'+
        '<h3>'+esc(c.title)+'</h3><p>'+esc(trimmed(c.en,160))+'</p><span class="rec-link">点击查看完整双语介绍、地图与分享 ›</span><span class="rec-source">'+esc(source)+'</span></button></article>';
    }).join("");
  }
  function messageCard(m){
    return '<div class="chat-message '+(m.speaker==="self"?"self":"")+'"><div class="message-meta">'+(m.speaker==="self"?"我":"朋友（待确认）")+' · '+esc(m.time)+'</div><div class="bubble">'+esc(m.text)+(m.demo?'<small>手动模拟输入 · 非 ASR</small>':"")+'</div></div>';
  }
  function modelSelector(){
    return '<div class="ai-model-selector"><label class="field-label" for="aiProviderSelect">模型接口</label>'+
      '<select id="aiProviderSelect" class="slim-select" data-select="aiModel">'+
      '<option value="deepseek/deepseek-flash" '+(state.aiProvider==="deepseek"&&state.aiModel==="deepseek-flash"?"selected":"")+'>DeepSeek 官方 · Flash（默认）</option>'+
      '<option value="deepseek/deepseek-v4-pro" '+(state.aiProvider==="deepseek"&&state.aiModel==="deepseek-v4-pro"?"selected":"")+'>DeepSeek 官方 · V4 Pro</option>'+
      '<option value="opencode-go/deepseek-v4.1-flash" '+(state.aiProvider==="opencode-go"?"selected":"")+'>OpenCode Go · V4.1 Flash</option></select></div>';
  }
  function aiStatusText(){
    if(state.aiState==="ready")return "真实 AI · "+(state.aiProvider==="deepseek"?"DeepSeek 官方":"OpenCode Go");
    if(state.aiState==="loading")return "正在请求已选择的真实 AI 模型…";
    if(state.aiState==="offline")return "未授权云端请求 · 本地规则演示";
    if(state.aiState==="unavailable")return "模型未连接 · 本地规则回退";
    return "本地规则模拟 · 非真实 AI";
  }
  function triggerRealAi(){
    var current=state.session,seq=++state.aiSeq;
    state.aiResult=null;state.aiError="";
    if(!current||!current.messages.length)return;
    if(!current.cloudConsent){state.aiState="offline";render();return;}
    if(!window.fetch || location.protocol==="file:"){
      state.aiState="unavailable";state.aiError="请从 Mac mini 的 127.0.0.1:8791 私人网关打开页面";render();return;
    }
    state.aiState="loading";render();
    var body={provider:state.aiProvider,model:state.aiModel,consent:true,includePersonal:current.includePersonal===true,
      messages:current.messages.slice(-6).map(function(m){return {speaker:m.speaker,text:m.text};})};
    window.fetch("/api/ai/analyze",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
    .then(function(resp){return resp.json().then(function(data){if(!resp.ok)throw Error(data.error||data.code||"AI 服务不可用");return data;});})
    .then(function(data){
      if(seq!==state.aiSeq||state.session!==current)return;
      if(data.mode!=="real-ai"||!data.reply)throw Error("未获得真实 AI 响应");
      state.aiResult=data;state.aiState="ready";
      state.suggestions=(data.references||[]).map(function(c){
        var catalog=c.kind==="place"?DATA.places:c.kind==="app"?DATA.apps:store.stories;
        var src=catalog.find(function(x){return String(x.id)===String(c.id);});
        if(!src)return null;
        return {kind:c.kind,id:c.id,title:c.kind==="story"?src.title:src.name,en:src.en,
          domain:c.kind==="place"?"海南地点":c.kind==="app"?"软件作品":"关于我",label:"真实 AI 引用"};
      }).filter(Boolean);
      render();
    }).catch(function(err){
      if(seq!==state.aiSeq||state.session!==current)return;
      state.aiResult=null;state.aiState="unavailable";state.aiError=err.message||"AI 连接失败";render();
    });
  }
  function coachCards(){
    var real=state.aiState==="ready"&&state.aiResult;
    var model=real?{label:state.aiResult.topic,reply:state.aiResult.reply,
      questions:state.aiResult.questions,share:state.aiResult.share}:conversationCoach();
    var bar='<div class="ai-status-bar"><span class="mini-tag">'+esc(aiStatusText())+'</span>'+
      (state.aiError?'<span class="muted">'+esc(state.aiError)+'</span>':"")+'</div>';
    if(!state.session||!state.session.messages.length||!model){
      return bar+'<div class="coach-placeholder"><strong>自动接话与追问</strong><p>收到对话后主动提供自然接话、连续追问和有来源的资料卡。</p></div>';
    }
    return bar+'<div class="coach-content"><div class="coach-topic"><span class="mini-tag">'+esc(model.label)+'</span> '+(real?"真实 AI 生成":"本地规则回退")+'</div>'+
      '<div class="coach-line"><span class="coach-label">先接一句</span><p lang="en">'+esc(model.reply)+'</p>'+button("copy-coach","reply","复制","btn-ghost")+'</div>'+
      '<div class="coach-line"><span class="coach-label">自然追问 · 按需选一句</span>'+model.questions.map(function(q,i){return '<div class="coach-question"><span lang="en">'+esc(q)+'</span>'+button("copy-coach","q"+i,"复制","btn-ghost")+'</div>';}).join("")+'</div>'+
      '<div class="coach-line"><span class="coach-label">我也可以分享</span><p lang="en">'+esc(model.share)+'</p>'+button("copy-coach","share","复制","btn-ghost")+'</div></div>';
  }
  function chat(){
    var on=!!state.session;var messages=on?state.session.messages:[];
    var personOpts='<option value="">暂不关联人物</option>'+store.people.map(function(p){return '<option value="'+esc(p.id)+'" '+(state.person===p.id?"selected":"")+'>'+esc(p.name)+'</option>';}).join("");
    return '<div class="chat-layout"><section class="panel chat-primary"><div class="panel-header"><div><h2>实时对话</h2><small>演示时手动输入；正式版由 ASR 自动触发推荐</small></div><span class="chat-status"><span class="dot '+(on?"demo":"")+'"></span>'+(on?"演示对话中":"等待开始")+'</span></div>'+
      '<div class="panel-pad"><div class="pair"><label class="field-label" for="personSelect">当前聊天对象</label><select id="personSelect" class="slim-select" data-select="person">'+personOpts+'</select></div>'+modelSelector()+'<div class="quick-prompts"><button type="button" data-action="sample" data-id="running">示例：户外跑步</button><button type="button" data-action="sample" data-id="software">示例：我的软件</button><button type="button" data-action="sample" data-id="coffee">示例：咖啡</button></div></div>'+
      '<div class="chat-messages" id="messages">'+(messages.length?messages.map(messageCard).join(""):empty("还没有对话","点击开始演示，然后试试「户外跑步」的真实聊天场景"))+'</div>'+
      '<div class="chat-compose">'+(!on?button("start-session","","开始演示会话 "+icon("i-arrow","small"),"btn-primary"):
        '<label class="field-label" for="messageInput">手动输入原话（仅演示，非真实 ASR）</label><textarea id="messageInput" placeholder="例如：I like running outdoors." aria-label="手动输入英文对话"></textarea>'+
        '<div class="compose-actions"><select id="speakerSelect" aria-label="选择说话人"><option value="friend">外国朋友</option><option value="self">我自己</option></select>'+button("add-message","","模拟识别完成 "+icon("i-arrow","small"),"btn-primary")+'</div>'+
        '<div class="button-row">'+button("end-session","","结束并检查归档","btn-soft")+button("reset-session","","放弃本轮","")+'</div>')+'</div></section>'+
      '<aside class="panel chat-assistant"><div class="panel-header"><div><h2>AI 对话助手 · 自动接话</h2><small>跟随对话更新 · 无需手动查资料</small></div>'+icon("i-spark")+'</div>'+
      '<div id="coachResults" class="coach-results">'+coachCards()+'</div>'+
      '<div class="panel-header auto-source-header"><div><h2>自动关联的资料</h2><small>'+(conversationCoach()?esc(conversationCoach().why):"识别话题后自动从现有资料库推荐")+'</small></div><span class="mini-tag">有来源</span></div>'+
      '<div class="rec-list" id="recommended">'+recSources()+'</div>'+
      '<details class="manual-fallback"><summary>需要时手动查找其他资料</summary><div class="panel-pad"><div class="searchfield"><input id="refSearch" type="search" placeholder="搜索全部资料库……" aria-label="备用搜索资料库"></div><div class="button-row">'+button("search-refs","","搜索","btn-soft")+button("clear-refs","","恢复自动推荐","")+'</div></div></details></aside></div>'+
      '<p class="information-note">模型 API 已预置 DeepSeek 官方及 OpenCode Go；仅在本轮明确同意将对话发送至云端、且 Mac mini 服务端配置 API Key 后调用。模型故障则明确显示规则回退，不冒充真实 AI。录音 ASR 与手机集成需另行验收。</p>';
  }
  function questionFor(){
    var text=state.session&&state.session.messages.length?state.session.messages[state.session.messages.length-1].text.toLowerCase():"";
    if(/beach|sea|ocean|sunset|island|coast/.test(text))return "Do you prefer relaxing at the beach or exploring new places?";
    if(/hike|outdoor|nature|park|walk|exercise|sport/.test(text))return "Do you usually go hiking, or do you prefer an easy walk by the sea?";
    if(/software|app|coding|tech|work|project/.test(text))return "What kind of apps do you find useful in everyday life?";
    if(/coffee|cafe|latte/.test(text))return "Do you have a favorite café here in Haikou?";
    return DATA.phrases[1] || "What brought you to Haikou?";
  }
  function rank(query,txt){
    var full=String(txt).toLowerCase();var source=String(query).toLowerCase();
    var terms=source.match(/[a-z]{3,}|[\u4e00-\u9fff]{2,}/g)||[];
    var score=0;var distinct=Array.from(new Set(terms)).slice(0,30);
    distinct.forEach(function(t){if(full.includes(t))score+=t.length>5?3:2;});
    return score;
  }
  function searchCorpus(query){
    var q=String(query||"").trim().slice(0,400);if(!q)return [];
    var low=q.toLowerCase(),scores=[];
    function add(x,kind,domain,title,en,cn,label,boost){
      var s=rank(q,[title,en,cn].join(" "))+ (boost||0);
      if(s>0)scores.push({score:s,kind:kind,id:x.id,title:title,en:en,domain:domain,label:label});
    }
    DATA.places.forEach(function(x){
      var boost=/outdoor|nature|park|hike|walk/.test(low)&&/自然|海滨|公园|森林|万绿园/.test(x.category+" "+x.name)?4:0;
      if(/outdoor|park|walk/.test(low)&&x.name==="万绿园")boost+=9;
      if(/coffee|cafe/.test(low)&&/咖啡|城市街拍/.test(x.name+" "+x.category+" "+x.cn))boost+=3;
      if(/beach|sea|ocean|sunset/.test(low)&&/海滨|海滩|日落|沙滩/.test(x.category+" "+x.name+" "+x.cn))boost+=4;
      add(x,"place","海南地点",x.name,x.en,x.cn,x.city,boost);
    });
    DATA.apps.forEach(function(x){add(x,"app","软件作品",x.name,x.en,x.cn,x.id,0);});
    store.stories.forEach(function(x){
      var bonus=(x.keywords||[]).some(function(w){return low.includes(w.toLowerCase());})?6:0;
      add(x,"story","关于我",x.title,x.en,x.cn,x.topic,bonus);
    });
    scores.sort(function(a,b){return b.score-a.score||String(a.id).localeCompare(String(b.id));});
    var selected=[],counts={};
    scores.forEach(function(x){
      if(selected.length>=7||((counts[x.kind]||0)>=3))return;
      selected.push(x);counts[x.kind]=(counts[x.kind]||0)+1;
    });
    return selected;
  }
  function recommendations(){
    state.suggestions=autoLinks().slice(0,4);
  }
  function render(){
    if(state.tab==="software")root.innerHTML=software();
    else if(state.tab==="hainan")root.innerHTML=hainan();
    else if(state.tab==="chat")root.innerHTML=chat();
    else if(state.tab==="self")root.innerHTML=self();
    else root.innerHTML=people();
    if(state.tab==="chat"){
      var msg=$("#messages");if(msg)msg.scrollTop=msg.scrollHeight;
    }
  }
  function startSession(){
    openModal('<h2>开始对话演示</h2><p>这是一套可交互的页面原型，<strong>不会访问麦克风或调用腾讯云</strong>。你输入的句子是手动模拟字幕；默认仅存当前浏览器，但若另外同意云端发送，将把本轮对话文字提交给你选择的 DeepSeek 或 OpenCode Go。</p><label class="checkbox-line"><input id="demoConsent" type="checkbox"><span>我知道本页是演示模式；如以后启动真实录音，会先告知同行朋友并取得同意。</span></label><label class="checkbox-line"><input id="cloudConsent" type="checkbox"><span>同意本轮将我输入的对话文字发送给所选模型服务商用于生成建议；未勾选只使用本地规则。涉及他人的私人信息需先征得同意。</span></label><label class="checkbox-line"><input id="personalConsent" type="checkbox"><span>可选：允许同时发送已确认的「关于我」话题卡，帮助 AI 自然介绍我的经历；默认不发送。</span></label><div class="button-row">'+button("close-modal","","取消","")+button("confirm-start","","进入演示","btn-primary")+'</div>');
  }
  function doStart(){
    if(!$("#demoConsent")||!$("#demoConsent").checked){toast("请先确认演示说明");return;}
    state.session={id:uid(),personId:state.person,messages:[],date:now(),source:"manual-demo",cloudConsent:Boolean($("#cloudConsent")&&$("#cloudConsent").checked),includePersonal:Boolean($("#personalConsent")&&$("#personalConsent").checked)};
    state.aiResult=null;state.aiError="";state.aiState="local";state.aiSeq++;
    state.suggestions=[];closeModal();render();toast("演示会话已开始（无录音）");
  }
  function addMessage(text,speaker){
    if(!state.session){toast("请先开始会话");return;}
    text=String(text||"").trim();
    if(!text){toast("请输入英文对话内容");return;}
    if(text.length>2000){toast("句子太长，请分段输入");return;}
    state.session.messages.push({speaker:speaker==="self"?"self":"friend",text:text,time:cnTime(),demo:true});
    recommendations();render();triggerRealAi();
  }
  var SAMPLES={
    running:"I love running outdoors, especially near the sea. Are there good places to run in Haikou?",
    outdoors:"I love running outdoors, especially near the sea. Are there good places to run in Haikou?",
    software:"So, what kind of software do you build? Can you show me one of your apps?",
    coffee:"I'm really into coffee. Are there any good cafés around here?"
  };
  function reviewSession(){
    if(!state.session||!state.session.messages.length){toast("先输入几句对话再整理");return;}
    var person=store.people.find(function(x){return x.id===state.person;});
    var lines=state.session.messages.map(function(m){return (m.speaker==="self"?"我":"朋友（身份待确认）")+": "+m.text;});
    var draft="# Conversation · "+state.session.date+"\n\n"+
      "来源：手动演示输入（非 ASR、非真实录音）\n\n"+
      "交流对象："+(person?person.name:"未关联")+"\n\n"+
      "## 原始对话（请核对）\n\n"+lines.join("\n\n")+
      "\n\n## 可能值得下次继续聊的话题\n\n"+questionFor()+
      "\n\n## 确认提醒\n\n- 核对这句话是谁说的\n- 不自动推断国籍、职业、偏好等事实\n- 仅保存已确认的资料\n";
    state.review={text:draft,personId:state.person};
    openModal('<h2>会后复核 · 先确认，再归档</h2><p>原始英文不自动改写；说话人身份需人工检查。这里生成的只是本地演示记录，不会修改正式人物 Markdown。</p><div class="field-group"><label class="field-label" for="reviewText">可编辑归档文本</label><textarea id="reviewText" style="min-height:230px">'+esc(draft)+'</textarea></div>'+
      (state.person?'<div class="field-group"><label class="field-label" for="personFacts">对方明确说过、想记住的事实（可留空）</label><textarea id="personFacts" placeholder="例如：对方说自己喜欢在海口散步。"></textarea></div>':'<p class="subtle-note">未关联人物，本次仅保存原始会话。</p>')+
      '<label class="checkbox-line"><input type="checkbox" id="reviewCheck"><span>我已经核对文本、说话人和事实，允许仅保存到此浏览器的演示档案。</span></label>'+
      '<div class="button-row">'+button("download-review","","导出 Markdown","")+button("save-review","","确认归档","btn-primary")+'</div>');
  }
  function finishSession(){
    var textarea=$("#reviewText");var check=$("#reviewCheck");
    if(!check||!check.checked){toast("请先核对并确认");return;}
    var s=state.session;
    if(!s){toast("会话已经结束");return;}
    var person=store.people.find(function(x){return x.id===state.person;});
    s.personId=state.person;s.personName=person?person.name:"未关联人物";
    s.confirmed=true;s.review=textarea?textarea.value:state.review.text;
    var factField=$("#personFacts");var confirmedFacts=factField?factField.value.trim():"";
    if(confirmedFacts&&person){
      if(confirmedFacts.length>3000){toast("人物信息过长，请精简后再保存");return;}
      if(!Array.isArray(person.notes))person.notes=[];
      person.notes.push({date:s.date,text:confirmedFacts,sessionId:s.id,confirmed:true});
    }
    store.sessions.push(s);persist();
    state.session=null;state.suggestions=[];state.review=null;
    closeModal();switchTab("people");toast("已保存到本机演示档案（正式数据未修改）");
  }
  function discardSession(){
    if(!state.session)return;
    if(!window.confirm("放弃这一轮演示对话？未归档的文本会丢失。"))return;
    state.aiSeq++;state.aiResult=null;state.aiState="local";state.session=null;state.suggestions=[];render();toast("本轮演示已清空");
  }
  function openDrawer(type,html){
    state.drawer=type;$("#drawerType").textContent=type;$("#drawerBody").innerHTML=html;
    $("#detailDrawer").classList.add("open");$("#detailDrawer").setAttribute("aria-hidden","false");$("#drawerBackdrop").hidden=false;
    document.body.style.overflow="hidden";
    $("#drawerClose").focus();
  }
  function closeDrawer(){
    state.drawer=null;$("#detailDrawer").classList.remove("open");$("#detailDrawer").setAttribute("aria-hidden","true");
    $("#drawerBackdrop").hidden=true;document.body.style.overflow="";
  }
  function openModal(html){$("#modalRoot").innerHTML='<div class="modal-layer" role="dialog" aria-modal="true"><div class="modal">'+html+'</div></div>';var el=$("#modalRoot input, #modalRoot button");if(el)el.focus();}
  function closeModal(){$("#modalRoot").innerHTML="";}
  function appDetail(id){
    var a=DATA.apps.find(function(x){return x.id===id;});if(!a)return;
    var steps=a.steps.map(function(s){return '<div class="step"><h5><span class="step-number">'+s.no+'</span>'+esc(s.cn)+'</h5>'+(s.note?'<p>'+esc(s.note)+'</p>':"")+'<p lang="en">'+esc(s.en)+'</p></div>';}).join("");
    openDrawer("软件作品 · "+a.id,'<div class="drawer-title">'+esc(a.name)+'</div><p class="drawer-subtitle">'+esc(a.group)+' · '+a.id+'</p>'+
      '<div class="card-meta"><span class="mini-tag">'+esc(a.category==="A"?"手机优先":"其他")+'</span><span>'+esc(a.mode)+'</span></div>'+
      '<section class="prose-panel"><h4>中文介绍</h4><p>'+esc(a.cn)+'</p></section>'+
      '<section class="prose-panel"><h4>现场自然英语</h4><p lang="en">'+esc(a.en)+'</p></section>'+
      '<div class="button-row">'+button("copy-app",a.id,"复制英文介绍 "+icon("i-copy","small"),"btn-soft")+button("use-app",a.id,"引用到聊天","btn-primary")+'</div>'+
      '<div class="section-heading"><h2>按编号一步步演示</h2><span>'+a.steps.length+' 个步骤</span></div>'+steps+
      '<p class="subtle-note">来源：正式 V1.4；没有逐键实测的操作请使用「示例介绍」，不要暗示功能已经发布。</p>');
  }
  function placeDetail(id){
    var p=DATA.places.find(function(x){return String(x.id)===String(id);});if(!p)return;
    var mapA=esc(p.mapAmap),mapG=esc(p.mapGoogle);
    var photoUrl="../docs/成果整理/Hainan-Travel-Guide/"+p.img;
    var photo=p.img?'<img src="'+esc(photoUrl)+'" alt="'+esc(p.name)+'原始资料候选图片" style="width:100%;max-height:220px;object-fit:cover;border-radius:12px;margin:13px 0" onerror="this.hidden=true" loading="lazy">':"";
    openDrawer("海南地点 · NO."+String(p.id).padStart(3,"0"),'<div class="drawer-title">'+esc(p.name)+'</div><p class="drawer-subtitle">'+esc(p.enName)+' · '+esc(p.city)+'</p>'+placeArt(p)+
      '<div class="card-meta"><span class="mini-tag">'+esc(p.category)+'</span><span>'+esc(p.location)+'</span></div>'+photo+
      '<section class="prose-panel"><h4>中文怎么介绍</h4><p>'+esc(p.cn)+'</p></section>'+
      '<section class="prose-panel"><h4>给外国朋友说的英语</h4><p lang="en">'+esc(p.en)+'</p></section>'+
      '<div class="button-row">'+button("copy-place",p.id,"复制英文 "+icon("i-copy","small"),"btn-soft")+button("share-place",p.id,"分享给朋友 "+icon("i-share","small"),"")+button("use-place",p.id,"放进聊天参考","btn-primary")+'</div>'+
      '<div class="button-row"><a class="btn" href="./public-share.html?place='+encodeURIComponent(p.id)+'" target="_blank" rel="noopener noreferrer">查看只读分享页 '+icon("i-share","small")+'</a></div>'+
      '<div class="button-row"><a class="btn" href="'+mapA+'" target="_blank" rel="noopener noreferrer">高德地图 '+icon("i-arrow","small")+'</a><a class="btn" href="'+mapG+'" target="_blank" rel="noopener noreferrer">Google Maps '+icon("i-arrow","small")+'</a></div>'+
      '<p class="subtle-note">图片如显示，来自项目已有本地文件；不自动从第三方盗链。对外分享图片前须确认授权。此原型中的地图为原始地点库提供的查询链接。</p>');
  }
  function storyDetail(id){
    var s=store.stories.find(function(x){return x.id===id;});if(!s)return;
    openDrawer("关于我 · 个人话题",'<div class="drawer-title">'+esc(s.title)+'</div><p class="drawer-subtitle">'+esc(s.topic)+' · '+esc(s.status==="confirmed"?"已确认":"待核对")+'</p>'+
      '<section class="prose-panel"><h4>中文事实</h4><p>'+esc(s.cn)+'</p></section>'+
      '<section class="prose-panel"><h4>自然英语</h4><p lang="en">'+esc(s.en)+'</p></section>'+
      '<div class="button-row">'+button("copy-story",s.id,"复制英文介绍","btn-soft")+button("edit-story",s.id,"编辑话题","")+button("use-story",s.id,"引用到聊天","btn-primary")+'</div>'+
      '<p class="subtle-note">修改只写浏览器本地演示数据，不会改动 SocialMate-Data 中的真实主档。</p>');
  }
  function personDetail(id){
    var p=store.people.find(function(x){return x.id===id;});if(!p)return;
    var records=store.sessions.filter(function(s){return s.personId===id;}).slice().reverse();
    openDrawer("人物档案",'<div class="drawer-title">'+esc(p.name)+'</div><p class="drawer-subtitle">'+(p.demo?"虚构示例 · ":"")+'本机演示档案</p>'+
      '<section class="prose-panel"><h4>已确认资料 / 备注</h4><p>'+esc(p.about||"尚未填写")+'</p></section>'+
      ((p.notes||[]).length?'<section class="prose-panel"><h4>会话确认后保存的信息</h4>'+(p.notes||[]).map(function(n){return '<p>• '+esc(n.text)+' <small>('+esc(n.date)+')</small></p>';}).join("")+'</section>':"")+
      '<div class="button-row">'+button("select-person",p.id,"设为当前聊天对象","btn-primary")+button("edit-person",p.id,"编辑人物","")+'</div>'+
      '<div class="section-heading"><h2>确认归档的会话</h2><span>'+records.length+' 条</span></div>'+
      (records.length?records.map(function(r){return '<div class="step"><h5>'+esc(r.date)+'</h5><p>'+r.messages.length+' 句英文 · '+esc(r.source)+'</p>'+button("detail-session",r.id,"查看会话记录","btn-soft")+'</div>';}).join(""):empty("暂无会话","去聊天页进行演示，结束后确认归档。"))+
      '<p class="subtle-note">不从英文对话自动推断对方国籍、性格、感情状态或身份。真实写入必须先走人物档案预览和确认。</p>');
  }
  function sessionDetail(id){
    var s=store.sessions.find(function(x){return x.id===id;});if(!s)return;
    openDrawer("历史会话",'<div class="drawer-title">'+esc(s.personName||"未关联人物")+'</div><p class="drawer-subtitle">'+esc(s.date)+' · '+esc(s.source)+'</p>'+
      '<div class="prose-panel"><h4>已确认归档文本</h4><p>'+esc(s.review||"无")+'</p></div>'+
      '<div class="button-row">'+button("export-session",id,"下载 Markdown","btn-primary")+'</div>'+
      '<p class="subtle-note">历史会话保留原始内容；不得由新会话覆盖。演示数据存于本机浏览器。</p>');
  }
  function editStory(id){
    var s=store.stories.find(function(x){return x.id===id;});
    openModal('<h2>'+(s?"编辑个人话题":"新增个人话题")+'</h2><p>先写中文事实，再写日常口语英文，别编造经历。</p>'+
      '<div class="field-group"><label class="field-label">标题</label><input class="field" id="storyTitle" maxlength="70" value="'+esc(s?s.title:"")+'"></div>'+
      '<div class="field-group"><label class="field-label">分类</label><select class="field" id="storyTopic"><option>生活</option><option>经历</option><option>兴趣</option><option>工作</option><option>其他</option></select></div>'+
      '<div class="field-group"><label class="field-label">标签（逗号分隔）</label><input class="field" id="storyTags" placeholder="例如：跑步,咖啡,英语角" value="'+esc(s&&Array.isArray(s.tags)?s.tags.join(", "):"")+'"></div>'+ '<div class="field-group"><label class="field-label">中文内容</label><textarea id="storyCn">'+esc(s?s.cn:"")+'</textarea></div>'+
      '<div class="field-group"><label class="field-label">英语口语</label><textarea id="storyEn">'+esc(s?s.en:"")+'</textarea></div>'+
      '<div class="button-row">'+button("close-modal","","取消","")+button("save-story",id||"new","保存本机演示","btn-primary")+'</div>');
    $("#storyTopic").value=s?s.topic:"生活";
  }
  function saveStory(id){
    var title=$("#storyTitle").value.trim(),cn=$("#storyCn").value.trim(),en=$("#storyEn").value.trim(),topic=$("#storyTopic").value;
    var tags=($("#storyTags").value||"").split(/[,，、]/).map(function(t){return t.trim().slice(0,24);}).filter(Boolean).slice(0,8);
    if(!title||!cn||!en){toast("标题、中英内容都需要填写");return;}
    if(title.length>70||cn.length>4000||en.length>4000){toast("内容太长，请精简");return;}
    var s=store.stories.find(function(x){return x.id===id;});
    if(s){s.title=title;s.cn=cn;s.en=en;s.topic=topic;s.tags=tags;s.status="review";}
    else store.stories.push({id:uid(),title,cn,en,topic,tags,status:"review",keywords:[]});
    persist();closeModal();closeDrawer();render();toast("已保存本机话题草稿，仍需核对");
  }
  function editPerson(id){
    var p=store.people.find(function(x){return x.id===id;});
    openModal('<h2>'+(p?"编辑人物":"新建人物档案")+'</h2><p>用你愿意记录的信息即可，不必填写敏感资料。</p>'+
      '<div class="field-group"><label class="field-label">称呼</label><input class="field" id="personName" maxlength="60" value="'+esc(p?p.name:"")+'" placeholder="例如：英国朋友"></div>'+
      '<div class="field-group"><label class="field-label">你确认知道的事实</label><textarea id="personAbout" placeholder="不要把 AI 猜测写成事实">'+esc(p?p.about:"")+'</textarea></div>'+
      '<div class="button-row">'+button("close-modal","","取消","")+button("save-person",id||"new","保存本机演示","btn-primary")+'</div>');
  }
  function savePerson(id){
    var name=$("#personName").value.trim(),about=$("#personAbout").value.trim();
    if(!name||name.length>60||about.length>4000){toast("请填写合理的称呼与介绍");return;}
    var p=store.people.find(function(x){return x.id===id;});
    if(p){p.name=name;p.about=about;}else{store.people.push({id:uid(),name,about,interests:[],demo:false,notes:[]});}
    persist();closeModal();closeDrawer();render();toast("人物已保存到演示浏览器");
  }
  function useRef(kind,id){
    var x=null;
    if(kind==="app")x=DATA.apps.find(function(z){return z.id===id;});
    if(kind==="place")x=DATA.places.find(function(z){return String(z.id)===String(id);});
    if(kind==="story")x=store.stories.find(function(z){return z.id===id;});
    if(!x){toast("没有找到引用资料");return;}
    var ref={kind,id:String(id),title:kind==="place"?x.name:kind==="story"?x.title:x.name,en:x.en};
    store.saved=store.saved.filter(function(z){return z.kind!==kind||z.id!==String(id);});
    store.saved.unshift(ref);store.saved=store.saved.slice(0,20);persist();
    if(state.tab==="chat"){
      state.suggestions=[{kind:kind,id:id,title:ref.title,en:ref.en,domain:kind==="app"?"软件":kind==="place"?"海南地点":"关于我",label:"已加入参考"}].concat(state.suggestions.filter(function(z){return z.kind!==kind||String(z.id)!==String(id);}));
      render();
    }
    toast("已加入聊天参考资料 · 可直接复制英文");
  }
  function onAction(action,id){
    if(action==="open-related"){
      // Navigate to the real source area while retaining the ongoing conversation.
      var el=document.querySelector('[data-action="open-related"][data-id="'+id+'"]');
      var kind=el?el.dataset.kind:"";
      if(kind==="place"){switchTab("hainan");placeDetail(id);}
      else if(kind==="app"){switchTab("software");appDetail(id);}
      else if(kind==="story"){switchTab("self");storyDetail(id);}
      if(kind){
        var drawer=$("#drawerBody");
        if(drawer)drawer.insertAdjacentHTML("afterbegin",'<div class="button-row">'+button("return-chat","","← 返回聊天（对话仍保留）","btn-soft")+'</div>');
      }
      return;
    }
    if(action==="return-chat"){closeDrawer();return switchTab("chat");}
    if(action==="copy-coach"){
      var model=state.aiState==="ready"&&state.aiResult?{reply:state.aiResult.reply,questions:state.aiResult.questions,share:state.aiResult.share}:conversationCoach();if(!model)return;
      var txt=id==="reply"?model.reply:id==="share"?model.share:model.questions[Number(id.slice(1))];
      if(txt)copyText(txt);return;
    }
    if(action==="detail-app")return appDetail(id);
    if(action==="detail-place")return placeDetail(id);
    if(action==="detail-story")return storyDetail(id);
    if(action==="detail-person")return personDetail(id);
    if(action==="detail-session")return sessionDetail(id);
    if(action==="copy-app"){var x=DATA.apps.find(function(z){return z.id===id;});if(x)copyText(x.en);return;}
    if(action==="copy-place"){var p=DATA.places.find(function(z){return String(z.id)===String(id);});if(p)copyText(p.en+"\n"+p.mapGoogle);return;}
    if(action==="share-place"){
      var target=DATA.places.find(function(z){return String(z.id)===String(id);});
      if(!target)return;
      var text=target.en+"\n"+target.mapGoogle;
      if(navigator.share&&window.isSecureContext){navigator.share({title:target.enName,text:text}).catch(function(){copyText(text);});}
      else copyText(text);
      return;
    }
    if(action==="copy-story"){var s=store.stories.find(function(z){return z.id===id;});if(s)copyText(s.en);return;}
    if(action==="use-app"||action==="use-place"||action==="use-story")return useRef(action.slice(4),id);
    if(action==="start-session")return startSession();
    if(action==="confirm-start")return doStart();
    if(action==="close-modal")return closeModal();
    if(action==="sample"){if(!state.session) return startSession();return addMessage(SAMPLES[id]||SAMPLES.outdoors,"friend");}
    if(action==="add-message"){var m=$("#messageInput"),sp=$("#speakerSelect");return addMessage(m?m.value:"",sp?sp.value:"friend");}
    if(action==="end-session")return reviewSession();
    if(action==="reset-session")return discardSession();
    if(action==="search-refs"){var query=$("#refSearch"),q=query?query.value.trim():"";if(!q){toast("输入关键词再查找");return;}state.suggestions=searchCorpus(q).slice(0,4);render();return toast("已筛选其他资料");}
    if(action==="clear-refs"){recommendations();render();return toast("已恢复自动关联");}
    if(action==="copy-question")return copyText(questionFor());
    if(action==="download-review"){var txt=$("#reviewText");return saveText("SocialMate-Conversation-Draft.md",txt?txt.value:state.review.text,"text/markdown;charset=utf-8");}
    if(action==="save-review")return finishSession();
    if(action==="set-theme"){if(id==="light"||id==="dark"){store.theme=id;persist();theme();openDisplaySettings();}return;}
    if(action==="reset-display"){store.display={font:"normal",english:"normal",density:"comfortable"};persist();applyDisplay();openDisplaySettings();return;}
    if(action==="new-story")return editStory("");
    if(action==="edit-story")return editStory(id);
    if(action==="save-story")return saveStory(id);
    if(action==="new-person")return editPerson("");
    if(action==="edit-person")return editPerson(id);
    if(action==="save-person")return savePerson(id);
    if(action==="select-person"){state.person=id;closeDrawer();switchTab("chat");return toast("已切换聊天对象");}
    if(action==="export-session"){var ss=store.sessions.find(function(z){return z.id===id;});if(ss)return saveText("SocialMate-Session-"+id+".md",ss.review,"text/markdown;charset=utf-8");}
  }
  document.addEventListener("click",function(e){
    var tab=e.target.closest("[data-tab]");if(tab)return switchTab(tab.dataset.tab);
    var filter=e.target.closest("[data-filter]");if(filter){var k=filter.dataset.filter;if(k==="group")state.group=filter.dataset.value;if(k==="category")state.category=filter.dataset.value;if(k==="storyTopic")state.storyTopic=filter.dataset.value;render();return;}
    var action=e.target.closest("[data-action]");if(action){e.preventDefault();
      if(action.dataset.action==="display-option"){
        var group=action.dataset.group,id=action.dataset.id;
        if(group==="font"&&["normal","large","extra","huge"].includes(id))store.display.font=id;
        if(group==="english"&&["normal","large","extra"].includes(id))store.display.english=id;
        if(group==="density"&&["compact","comfortable","relaxed"].includes(id))store.display.density=id;
        persist();applyDisplay();openDisplaySettings();return;
      }if(action.dataset.action==="open-related"){var kind=action.dataset.kind,id=action.dataset.id;if(kind==="place"){switchTab("hainan");placeDetail(id);}else if(kind==="app"){switchTab("software");appDetail(id);}else if(kind==="story"){switchTab("self");storyDetail(id);}var drawer=$("#drawerBody");if(drawer&&kind)drawer.insertAdjacentHTML("afterbegin",'<div class="button-row">'+button("return-chat","","← 返回聊天（对话仍保留）","btn-soft")+'</div>');return;}onAction(action.dataset.action,action.dataset.id||"");}
  });
  function updateSearchResults(){
    var search=$("#searchResults"),count=$("#searchCount");
    if(!search||!count)return;
    var q=state.query.toLowerCase().trim(),entries=[];
    if(state.tab==="software"){
      entries=DATA.apps.filter(function(a){return a.category===state.group && (!q||[a.id,a.name,a.cn,a.en].join(" ").toLowerCase().includes(q));});
      search.innerHTML=entries.length?'<div class="card-grid">'+entries.map(appCard).join("")+'</div>':empty("没有找到匹配软件","换个关键词，或切换类别");
      count.textContent="找到 "+entries.length+" 项";
    }else if(state.tab==="hainan"){
      entries=DATA.places.filter(function(x){return (state.category==="全部"||x.category===state.category)&&(state.city==="全部"||x.city===state.city)&&(!q||[x.name,x.enName,x.cn,x.en,x.location].join(" ").toLowerCase().includes(q));});
      search.innerHTML=entries.length?'<div class="card-grid">'+entries.map(placeCard).join("")+'</div>':empty("未找到地点","可以尝试换个关键词或取消筛选");
      count.textContent="显示 "+entries.length+" / 115";
    }else if(state.tab==="self"){
      entries=store.stories.filter(function(x){return (state.storyTopic==="全部"||storyTags(x).includes(state.storyTopic))&&(!q||[x.title,x.cn,x.en,storyTags(x).join(" ")].join(" ").toLowerCase().includes(q));});
      search.innerHTML=entries.length?'<div class="card-grid">'+entries.map(selfCard).join("")+'</div>':empty("还没有此类话题","点击新增，建立你自己的聊天卡片");
      count.textContent="显示 "+entries.length+" 项";
    }else if(state.tab==="people"){
      entries=store.people.filter(function(x){return [x.name,x.about,(x.interests||[]).join(" ")].join(" ").toLowerCase().includes(q);});
      search.innerHTML=entries.length?'<div class="list-rows">'+entries.map(personCard).join("")+'</div>':empty("没有找到人物","新建一个人物档案，再整理你们的谈话");
      count.textContent="显示 "+entries.length+" 人";
    }
  }
  document.addEventListener("input",function(e){
    if(e.target.dataset.input==="search"){
      // Preserve the same input node while updating results: avoids keyboard collapse in
      // Xiaomi/OPPO in-app and stock browsers where a full rerender loses text focus.
      state.query=e.target.value;
      updateSearchResults();
    }
  });
  document.addEventListener("change",function(e){
    var k=e.target.dataset.select;
    if(k==="city"){state.city=e.target.value;render();}
    if(k==="person"){state.person=e.target.value;if(state.session)state.session.personId=state.person;}
    if(k==="aiModel"){var picked=e.target.value.split("/");if(state.session&&state.session.cloudConsent&&picked[0]!==state.aiProvider&&!window.confirm("将当前对话文字发送给另一家 AI 服务商，是否同意切换？")){render();return;}state.aiProvider=picked[0];state.aiModel=picked[1];if(state.session&&state.session.messages.length)triggerRealAi();}
  });
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){closeModal();closeDrawer();}
    if(e.key==="Enter"&&e.target.id==="refSearch"){e.preventDefault();onAction("search-refs","");}
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter"&&e.target.id==="messageInput"){e.preventDefault();onAction("add-message","");}
  });
  $("#drawerBackdrop").addEventListener("click",closeDrawer);
  $("#drawerClose").addEventListener("click",closeDrawer);
  $("#themeMobile").addEventListener("click",openDisplaySettings);
  $("#settingsButton").addEventListener("click",openDisplaySettings);
  $("#themeDesktop").addEventListener("click",function(){store.theme=store.theme==="light"?"dark":"light";persist();theme();});
  window.addEventListener("hashchange",function(){
    var tab=location.hash.replace(/^#\/?/,"");if(tab&&TABS.some(function(x){return x.id===tab;}))switchTab(tab);
  });
  function init(){
    var t=location.hash.replace(/^#\/?/,"");
    if(t&&TABS.some(function(x){return x.id===t;}))state.tab=t;
    theme();nav();render();
  }
  init();
})();
