(function(){
'use strict';
var data=window.SOCIALMATE_PUBLIC_PLACES||{places:[]};
var places=Array.isArray(data.places)?data.places:[];
var byId=new Map(places.map(function(p){return [String(p.id),p];}));
var language='en',category='',city='',query='',selected='';
var $=function(s){return document.querySelector(s);};
var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');};
function copy(value){
  if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(value).then(function(){notify('Copied');}).catch(function(){fallbackCopy(value);});return;}
  fallbackCopy(value);
}
function fallbackCopy(value){
  var el=document.createElement('textarea');el.value=value;el.style.position='fixed';el.style.opacity='0';document.body.appendChild(el);el.select();
  try{notify(document.execCommand('copy')?'Copied':'Select the text and copy');}catch(e){notify('Select the text and copy');}el.remove();
}
function notify(message){var tip=$('#publicToast');tip.textContent=message;tip.hidden=false;setTimeout(function(){tip.hidden=true;},2600);}
function card(p){
  return '<button class="public-item" type="button" data-place="'+p.id+'"><div class="card-meta"><span class="mini-tag">'+String(p.id).padStart(3,'0')+'</span><span>'+esc(p.city)+' · '+esc(p.category)+'</span></div><strong>'+esc(language==='en'?p.enName:p.name)+'</strong><small>'+esc(language==='en'?p.name:p.enName)+'</small><p class="muted">'+esc((language==='en'?p.en:p.cn).slice(0,113))+'…</p></button>';
}
function filter(){
  var q=query.trim().toLowerCase();
  var set=places.filter(function(p){return (!category||p.category===category)&&(!city||p.city===city)&&(!q||[p.name,p.enName,p.cn,p.en,p.location,p.category].join(' ').toLowerCase().includes(q));});
  $('#publicResults').innerHTML=set.length?set.map(card).join(''):'<div class="empty">No matching places. Try another keyword.</div>';
  $('#publicCount').textContent=set.length+' / '+places.length+' places';
}
function initFilters(){
  var cities=Array.from(new Set(places.map(function(x){return x.city;})));
  $('#publicCity').innerHTML='<option value="">All cities</option>'+cities.map(function(c){return '<option value="'+esc(c)+'">'+esc(c)+'</option>';}).join('');
  var types=Array.from(new Set(places.map(function(x){return x.category;})));
  $('#categoryFilters').innerHTML='<button class="pill active" data-category="">All</button>'+types.map(function(c){return '<button class="pill" data-category="'+esc(c)+'">'+esc(c)+'</button>';}).join('');
}
function detail(p){
  if(!p)return showList();
  selected=String(p.id);
  $('#overview').hidden=true;$('#publicDetail').hidden=false;
  $('#publicDetail').innerHTML='<div class="public-card">'+
    '<div class="card-meta"><span class="mini-tag">NO. '+String(p.id).padStart(3,'0')+'</span><span>'+esc(p.city)+' · '+esc(p.category)+'</span></div>'+
    '<h1>'+esc(language==='en'?p.enName:p.name)+'</h1><div class="public-sub">'+esc(language==='en'?p.name:p.enName)+'</div>'+
    '<div class="public-sub">'+esc(p.location)+'</div>'+
    '<p class="public-text">'+esc(language==='en'?p.en:p.cn)+'</p>'+
    '<div class="public-cn">'+esc(language==='en'?p.cn:p.en)+'</div>'+
    '<div class="public-row"><a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="'+esc(p.mapGoogle)+'">Google Maps ↗</a><a class="btn" target="_blank" rel="noopener noreferrer" href="'+esc(p.mapAmap)+'">Amap 高德 ↗</a></div>'+
    '<div class="public-row"><button class="btn btn-soft" type="button" id="sharePlace">Share place</button><button class="btn" type="button" id="copyDescription">Copy English</button><button class="btn" type="button" id="viewAll">Browse all 115</button></div>'+
    '</div>';
  document.title=(p.enName||p.name)+' · Hainan Local Guide';
}
function showList(){
  selected='';
  $('#overview').hidden=false;$('#publicDetail').hidden=true;
  document.title='Hainan Local Guide · SocialMate';filter();
}
function selectPlace(id,replace){
  var p=byId.get(String(id));if(!p)return showList();
  detail(p);
  var url=location.pathname+'?place='+encodeURIComponent(p.id);
  if(replace)history.replaceState({place:p.id},'',url);
  else history.pushState({place:p.id},'',url);
  window.scrollTo(0,0);
}
function all(){
  history.pushState({},'',location.pathname);showList();window.scrollTo(0,0);
}
function currentShare(){
  var p=byId.get(selected);if(!p)return;
  var url=location.href,text=p.en+'\n'+url;
  if(navigator.share&&window.isSecureContext){
    navigator.share({title:p.enName,text:p.en,url:url}).catch(function(err){if(err&&err.name!=='AbortError')copy(text);});
  }else copy(text);
}
$('#publicSearch').addEventListener('input',function(e){query=e.target.value;filter();});
$('#publicCity').addEventListener('change',function(e){city=e.target.value;filter();});
$('#categoryFilters').addEventListener('click',function(e){
  var btn=e.target.closest('[data-category]');if(!btn)return;category=btn.dataset.category;$('#categoryFilters').querySelectorAll('[data-category]').forEach(function(x){x.classList.toggle('active',x===btn);});filter();
});
$('#publicResults').addEventListener('click',function(e){
  var item=e.target.closest('[data-place]');if(item)selectPlace(item.dataset.place,false);
});
$('#publicDetail').addEventListener('click',function(e){
  if(e.target.closest('#viewAll'))all();
  else if(e.target.closest('#copyDescription')){var p=byId.get(selected);if(p)copy(p.en+'\n'+p.mapGoogle);}
  else if(e.target.closest('#sharePlace'))currentShare();
});
$('#language').addEventListener('click',function(){
  language=language==='en'?'cn':'en';$('#language').textContent=language==='en'?'中文':'English';
  if(selected)detail(byId.get(selected));else filter();
});
window.addEventListener('popstate',function(){
  var id=new URLSearchParams(location.search).get('place');if(id&&byId.has(id))detail(byId.get(id));else showList();
});
initFilters();
var initial=new URLSearchParams(location.search).get('place');
if(initial&&byId.has(initial))detail(byId.get(initial));else showList();
})();
