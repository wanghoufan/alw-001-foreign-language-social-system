#!/usr/bin/env python3
"""Build the offline HTML guide from places.json + PHOTO_MANIFEST.csv."""
import csv, json, os, shutil, sys, html

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
DIST = os.path.join(ROOT, "dist", "Hainan_115_Real_Photo_Guide")
IMG_SRC = os.path.join(ROOT, "images")

CITY_ORDER = ["海口", "文昌", "琼海", "万宁", "陵水", "三亚", "其他地区"]


def load_manifest():
    p = os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv")
    if not os.path.exists(p):
        return []
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


CSS = r"""
:root{--bg:#f7f6f2;--paper:#fffefb;--ink:#22201d;--sub:#6b6660;--line:#ddd8cf;--ac:#7a5c3e;--soft:#efebe3;--shadow:0 2px 10px rgba(60,45,30,.06)}
body.dark{--bg:#141414;--paper:#1d1d1d;--ink:#e8e5df;--sub:#a09a90;--line:#35322d;--ac:#c9a77f;--soft:#262421;--shadow:none}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif;font-size:19px;line-height:1.75;-webkit-font-smoothing:antialiased}
a{color:var(--ac)}
.wrap{max-width:1180px;margin:0 auto;padding:0 22px}
header{padding:38px 0 18px;border-bottom:1px solid var(--line)}
.hero-title{font-size:34px;line-height:1.25;margin:0 0 8px;font-weight:800;letter-spacing:.01em}
.hero-sub{color:var(--sub);font-size:17px;margin:0}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 0}
.stat{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:6px 12px;font-size:15px;color:var(--sub)}
.stat b{color:var(--ink);font-size:18px}
.toolbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);padding:12px 0}
.toolrow{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
input[type=search],select,button{font:inherit;font-size:16px;color:var(--ink);background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:8px 12px;min-height:44px}
input[type=search]{flex:1 1 260px}
select{min-width:132px}
button{cursor:pointer}
button.active{border-color:var(--ac);color:var(--ac);font-weight:700}
main{padding:26px 0 70px}
.city-head{display:flex;align-items:baseline;gap:12px;margin:34px 0 14px;border-bottom:1px solid var(--line);padding-bottom:10px}
.city-head h2{font-size:25px;margin:0}
.city-head span{font-size:15px;color:var(--sub)}
.place{display:grid;grid-template-columns:230px minmax(0,1fr);background:var(--paper);border:1px solid var(--line);border-radius:16px;margin:18px 0;overflow:hidden;box-shadow:var(--shadow)}
.aside{border-right:1px solid var(--line);padding:18px;display:flex;flex-direction:column;gap:9px}
.idx{font-size:14px;color:var(--sub)}
.name{font-size:23px;font-weight:750;line-height:1.45}
.enname{font-size:15px;color:var(--sub);overflow-wrap:anywhere}
.loc{padding:8px 10px;background:var(--soft);border-radius:9px;font-size:15px;margin-top:4px}
.maplinks{display:flex;gap:10px;font-size:15px;flex-wrap:wrap;margin-top:6px}
.entry{padding:16px 20px 22px;min-width:0}
.photos{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.photo{position:relative;border-radius:10px;aspect-ratio:4/3;overflow:hidden;background:var(--bg);border:1px solid var(--line);min-width:0}
.photo img{height:100%;width:100%;object-fit:cover;display:block;cursor:zoom-in}
.photo .cap{position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.85));color:#fff;font-size:14px;padding:24px 9px 8px;line-height:1.35}
.photo .picnum{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.65);border-radius:6px;color:#fff;font-size:13px;padding:2px 7px}
.placeholder{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:6px;padding:8px;color:var(--sub);font-size:15px}
.placeholder b{font-weight:700;font-size:16px;color:var(--ink)}
.textpanel{margin-top:14px}
.paragraph{margin:8px 0;color:var(--ink);font-size:19px}
.language-label{font-weight:750;font-size:14px;letter-spacing:.05em;color:var(--ac);margin-top:4px}
.enparagraph{color:var(--sub)}
.enparagraph .paragraph{font-size:18px}
body.only-cn .enparagraph{display:none}
.tag{font-size:14px;color:var(--sub);border:1px solid var(--line);border-radius:20px;padding:2px 8px}
.warn{color:#a8741f}
footer{padding:30px 0;color:var(--sub);font-size:15px;border-top:1px solid var(--line)}
#lightbox{position:fixed;inset:0;background:rgba(12,10,8,.94);display:none;z-index:99;align-items:center;justify-content:center;padding:24px}
#lightbox.on{display:flex}
#lightbox img{max-width:92vw;max-height:78vh;object-fit:contain;border-radius:8px}
#lbmeta{position:absolute;left:0;right:0;bottom:0;padding:16px 24px;color:#eee;font-size:15px;background:linear-gradient(transparent,rgba(0,0,0,.8))}
#lbmeta a{color:#ffd9a8}
#lbclose{position:absolute;top:14px;right:18px;font-size:34px;color:#fff;background:none;border:none;cursor:pointer}
@media(max-width:820px){body{font-size:19px}.place{grid-template-columns:1fr}.aside{border-right:none;border-bottom:1px solid var(--line);padding:15px}.entry{padding:13px 14px 20px}.photos{gap:6px}.photo .cap{font-size:13px}.hero-title{font-size:29px}}
@media(max-width:520px){.photos{grid-template-columns:repeat(3,minmax(0,1fr))}.paragraph{font-size:19px}.enparagraph .paragraph{font-size:18px}}
"""


def main():
    rows = load_manifest()
    by_place = {}
    for r in rows:
        if r.get("status") == "approved":
            by_place.setdefault(r["place_id"], []).append(r)
    os.makedirs(DIST, exist_ok=True)
    # copy images
    if os.path.exists(os.path.join(DIST, "images")):
        shutil.rmtree(os.path.join(DIST, "images"))
    os.makedirs(os.path.join(DIST, "images"))
    for cf in os.listdir(IMG_SRC):
        src = os.path.join(IMG_SRC, cf)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(DIST, "images", cf))

    shutil.copy(os.path.join(ROOT, "data", "places.json"), os.path.join(DIST, "places.json"))
    shutil.copy(os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv"), os.path.join(DIST, "PHOTO_MANIFEST.csv"))
    data = []
    for p in PLACES:
        photos = []
        for r in sorted(by_place.get(str(p["id"]), []), key=lambda x: int(x["slot"])):
            photos.append({"slot": int(r["slot"]), "local": r["local_path"], "caption": r["caption"],
                           "creator": r["creator"], "license": r["license_or_permission"],
                           "license_url": r.get("license_url", ""), "source": r["source_page"],
                           "original": r["original_url"], "w": int(r["image_width"]), "h": int(r["image_height"])})
        data.append({**{k: p[k] for k in ("id", "city", "city_folder", "name", "en_name", "cn", "en",
                                           "location_cn", "location_en", "special_cn", "special_en",
                                           "map_amap", "map_google", "category", "warning")},
                     "photos": photos})

    payload = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    total_photos = len(rows)
    full_places = sum(1 for d in data if len(d["photos"]) == 3)
    tpl = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>海南115处值得玩的地方 · 中英双语实景指南</title>
<meta name="description" content="海南115处景点中英双语图文指南，含真实授权照片，可离线浏览。">
<style>__CSS__</style></head>
<body>
<header><div class="wrap">
<h1 class="hero-title">海南 115 处值得玩的地方</h1>
<p class="hero-sub">Hainan · 115 Places Worth Visiting｜中英双语 · 实景照片 · 离线可看</p>
<div class="stats">
  <span class="stat"><b>115</b> 处地点</span>
  <span class="stat"><b id="photocount">__PHOTOS__</b> 张实景照片</span>
  <span class="stat"><b id="fullcount">__FULL__</b> 处配满 3 张</span>
  <span class="stat">照片均为 Wikimedia Commons 授权素材</span>
</div>
</div></header>
<div class="toolbar"><div class="wrap toolrow">
  <input type="search" id="search" placeholder="搜索地点 / 城市 / 关键词">
  <select id="city"><option value="全部">全部城市</option>__CITYOPTS__</select>
  <select id="cat"><option value="全部">全部分类</option>__CATOPTS__</select>
  <button id="cn">只看中文</button><button id="theme">深色模式</button>
  <span class="stat">显示 <b id="shown">115</b> 处</span>
</div></div>
<main class="wrap" id="list"></main>
<footer><div class="wrap">
<p>整理于 2026-10-31。店铺、游船、火箭观礼和营地可能临时调整，出发前请核实开放信息。位置以地名导航为准。</p>
<p>照片来自 Wikimedia Commons，均标注作者与许可；点击图片可查看署名和来源。缺图地点如实标为“待补图”，没有使用 AI 图片或相似景点的照片冒充。</p>
</div></footer>
<div id="lightbox"><button id="lbclose" aria-label="关闭">×</button><img id="lbimg" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><div id="lbmeta"></div></div>
<script type="application/json" id="data">__DATA__</script>
<script>
const places=JSON.parse(document.getElementById('data').textContent);
let city='全部',cat='全部',q='',onlycn=false;
const order=__ORDER__;
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function tile(p,ph){
 if(!ph){return `<div class="photo"><div class="placeholder"><b>待补图</b><span>暂无可合法再分发的实景照片</span></div></div>`}
 return `<div class="photo"><span class="picnum">${ph.slot}/3</span><img loading="lazy" src="${esc(ph.local)}" alt="${esc(p.name+'：'+ph.caption)}" data-idx="${p.id}-${ph.slot}"><div class="cap">${esc(ph.caption)}</div></div>`}
function card(p){
 const slots=[1,2,3].map(n=>p.photos.find(x=>x.slot===n));
 return `<article class="place" id="p${p.id}"><aside class="aside"><div class="idx">NO. ${String(p.id).padStart(3,'0')} <span class="tag">${esc(p.category)}</span></div><div class="name">${esc(p.name)}</div><div class="enname">${esc(p.en_name)}</div><div class="loc">📍 ${esc(p.location_cn)}</div><div class="maplinks"><a href="${esc(p.map_amap)}" target="_blank" rel="noopener">高德导航</a><a href="${esc(p.map_google)}" target="_blank" rel="noopener">Google Maps</a></div>${p.warning?'<span class="tag warn">注意预约 / 天气 / 安全</span>':''}</aside><div class="entry"><div class="photos">${slots.map(ph=>tile(p,ph)).join('')}</div><div class="textpanel"><div class="language-label">中文</div><p class="paragraph">${esc(p.cn)}</p><div class="enparagraph"><div class="language-label">ENGLISH</div><p class="paragraph">${esc(p.en)}</p></div></div></div></article>`}
function render(){
 const f=places.filter(p=>(city==='全部'||p.city===city)&&(cat==='全部'||p.category===cat)&&(!q||[p.name,p.en_name,p.cn,p.en,p.location_cn,p.location_en].join(' ').toLowerCase().includes(q)));
 document.getElementById('list').innerHTML=order.map(c=>{const sub=f.filter(p=>p.city===c);return sub.length?`<section><div class="city-head"><h2>${c==='其他地区'?'海南其他市县':c}</h2><span>${sub.length}处</span></div>${sub.map(card).join('')}</section>`:''}).join('')||'<p>没有找到符合条件的地点。</p>';
 document.getElementById('shown').textContent=f.length;window.__visible=f}
document.getElementById('search').addEventListener('input',e=>{q=e.target.value.trim().toLowerCase();render()});
document.getElementById('city').addEventListener('change',e=>{city=e.target.value;render()});
document.getElementById('cat').addEventListener('change',e=>{cat=e.target.value;render()});
document.getElementById('cn').onclick=()=>{onlycn=!onlycn;document.body.classList.toggle('only-cn',onlycn);document.getElementById('cn').textContent=onlycn?'显示英文':'只看中文'};
document.getElementById('theme').onclick=()=>{const d=document.body.classList.toggle('dark');document.getElementById('theme').textContent=d?'浅色模式':'深色模式';localStorage.setItem('hg-theme',d?'dark':'light')};
if(localStorage.getItem('hg-theme')==='dark'){document.body.classList.add('dark');document.getElementById('theme').textContent='浅色模式'}
document.getElementById('list').addEventListener('click',e=>{const im=e.target.closest('img[data-idx]');if(!im)return;const [pid,slot]=im.dataset.idx.split('-');const p=places.find(x=>String(x.id)===pid);const ph=p.photos.find(x=>String(x.slot)===slot);const lb=document.getElementById('lightbox');document.getElementById('lbimg').src=ph.local;document.getElementById('lbmeta').innerHTML=`${esc(p.name)} · ${esc(ph.caption)}<br>作者：${esc(ph.creator)}｜许可：${esc(ph.license)}｜<a href="${esc(ph.source)}" target="_blank" rel="noopener">来源页</a>`;lb.classList.add('on')});
document.getElementById('lbclose').onclick=()=>document.getElementById('lightbox').classList.remove('on');
document.getElementById('lightbox').addEventListener('click',e=>{if(e.target.id==='lightbox')e.currentTarget.classList.remove('on')});
render();
</script></body></html>"""
    cats = sorted({p["category"] for p in data})
    out = (tpl.replace("__CSS__", CSS)
              .replace("__DATA__", payload)
              .replace("__ORDER__", json.dumps(CITY_ORDER, ensure_ascii=False))
              .replace("__CITYOPTS__", "".join(f'<option value="{c}">{c}</option>' for c in CITY_ORDER))
              .replace("__CATOPTS__", "".join(f'<option value="{c}">{c}</option>' for c in cats))
              .replace("__PHOTOS__", str(total_photos))
              .replace("__FULL__", str(full_places)))
    path = os.path.join(DIST, "Hainan_115_Offline_Guide.html")
    open(path, "w", encoding="utf-8").write(out)
    print("built", path, os.path.getsize(path), "bytes; photos", total_photos, "full places", full_places)


if __name__ == "__main__":
    main()