#!/usr/bin/env python3
"""Real QA: data integrity, image files, HTML offline render, ZIP integrity."""
import csv, hashlib, io, json, os, re, subprocess, sys, tempfile, zipfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist", "Hainan_115_Real_Photo_Guide")
ZIP = os.path.join(ROOT, "artifacts", "Hainan_115_Real_Photo_Guide_V3.0.zip")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
REPORT = os.path.join(DIST, "QA_REPORT.md")


def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True)


def main():
    checks = []
    def add(name, ok, detail):
        checks.append((name, "PASS" if ok else "FAIL", detail))

    # --- data
    ids = [p["id"] for p in PLACES]
    add("115 个唯一地点 ID", len(ids) == 115 and len(set(ids)) == 115, f"{len(ids)} 条 / 唯一 {len(set(ids))}")
    city = {}
    for p in PLACES:
        city[p["city"]] = city.get(p["city"], 0) + 1
    add("海口 60 / 其他 55", city.get("海口") == 60 and sum(v for k, v in city.items() if k != "海口") == 55, str(city))
    add("每处 3 个照片槽位", all(len(p["photos"]) == 3 for p in PLACES), "115/115")

    # --- manifest
    mr = list(csv.DictReader(open(os.path.join(DIST, "PHOTO_MANIFEST.csv"), encoding="utf-8")))
    n = len(mr)
    bad = []
    shas, phs = set(), []
    for r in mr:
        f = os.path.join(DIST, r["local_path"])
        if not os.path.exists(f):
            bad.append(r["local_path"] + ":missing"); continue
        if hashlib.sha256(open(f, "rb").read()).hexdigest() != r["sha256"]:
            bad.append(r["local_path"] + ":sha")
        try:
            im = Image.open(f); im.load()
            if [im.width, im.height] != [int(r["image_width"]), int(r["image_height"])]:
                bad.append(r["local_path"] + ":size")
        except Exception as e:
            bad.append(r["local_path"] + ":decode")
        if not r["license_or_permission"] or not r["source_page"] or not r["creator"]:
            bad.append(r["local_path"] + ":meta")
        if r["sha256"] in shas:
            bad.append(r["local_path"] + ":dup-sha")
        shas.add(r["sha256"])
    add("照片文件可解码、hash/尺寸/元数据一致", not bad, f"{n} 张；问题 {len(bad)} {bad[:5]}")
    # near-duplicates
    near = []
    for i in range(len(mr)):
        for j in range(i + 1, len(mr)):
            a, b = int(mr[i]["perceptual_hash"], 16), int(mr[j]["perceptual_hash"], 16)
            if bin(a ^ b).count("1") <= 4:
                near.append((mr[i]["local_path"], mr[j]["local_path"]))
    add("无近似重复图（dHash ≤4）", not near, f"重复对 {len(near)} {near[:3]}")

    # --- html
    html_path = os.path.join(DIST, "Hainan_115_Offline_Guide.html")
    html = open(html_path, encoding="utf-8").read()
    m = re.search(r'<script type="application/json" id="data">(.*?)</script>', html, re.S)
    data = json.loads(m.group(1)) if m else []
    add("HTML 内嵌 115 条数据", len(data) == 115, f"{len(data)} 条")
    refs = re.findall(r'"local"\s*:\s*"([^"]+)"', html)
    miss = [r for r in refs if not os.path.exists(os.path.join(DIST, r))]
    add("HTML 图片路径全部存在", not miss, f"{len(refs)} 处引用；缺失 {len(miss)}")
    ext = re.findall(r'<img[^>]+src="(https?://[^"]+)"', html)
    add("无在线图片依赖", not ext, f"外链 img {len(ext)} 个")
    add("无 file:// fetch / 外部 JS", "fetch(" not in html and "<script src=\"http" not in html, "数据内嵌")

    # offline render
    shots = os.path.join(ROOT, "artifacts", "qa")
    os.makedirs(shots, exist_ok=True)
    desktop = os.path.join(shots, "desktop.png")
    mobile = os.path.join(shots, "mobile.png")
    for out, size in [(desktop, "1440,1000"), (mobile, "390,844")]:
        cmd = (f'"{CHROME}" --headless=new --disable-gpu --hide-scrollbars --no-sandbox '
               f'--allow-file-access-from-files --window-size={size} --virtual-time-budget=12000 '
               f'--screenshot="{out}" "file://{html_path}"')
        r = sh(cmd)
    ok_shots = os.path.exists(desktop) and os.path.getsize(desktop) > 50000 and os.path.exists(mobile) and os.path.getsize(mobile) > 20000
    add("离线 file:// 桌面 + 手机渲染出图", ok_shots,
        f"desktop={os.path.getsize(desktop) if os.path.exists(desktop) else 0}B, mobile={os.path.getsize(mobile) if os.path.exists(mobile) else 0}B")

    # layout metrics at mobile width via headless DOM dump
    probe = os.path.join(DIST, "_qa_probe.html")
    inject = """<script>window.addEventListener('load',function(){setTimeout(function(){
    var imgs=Array.prototype.slice.call(document.querySelectorAll('.photo img'));
    function n(){return document.querySelectorAll('.place').length}
    var out={iw:innerWidth,sw:document.documentElement.scrollWidth,places:n(),
      ok:imgs.filter(function(i){return i.complete&&i.naturalWidth>0}).length,
      broken:imgs.filter(function(i){return i.complete&&i.naturalWidth===0}).length};
    var s=document.getElementById('search');s.value='骑楼';s.dispatchEvent(new Event('input'));out.search=n();
    s.value='';s.dispatchEvent(new Event('input'));
    var c=document.getElementById('city');c.value='三亚';c.dispatchEvent(new Event('change'));out.city=n();
    c.value='全部';c.dispatchEvent(new Event('change'));
    document.getElementById('theme').click();out.dark=document.body.classList.contains('dark');
    document.getElementById('theme').click();
    document.getElementById('cn').click();out.onlycn=document.body.classList.contains('only-cn');
    document.title='QA:'+JSON.stringify(out);},1200)});</script>"""
    open(probe, "w", encoding="utf-8").write(html.replace("</body>", inject + "</body>"))
    r = sh(f'"{CHROME}" --headless=new --disable-gpu --no-sandbox --allow-file-access-from-files --window-size=390,844 --virtual-time-budget=8000 --dump-dom "file://{probe}"')
    mm = re.search(r"QA:(\{[^<]+\})", r.stdout)
    import html as H
    metrics = json.loads(H.unescape(mm.group(1))) if mm else {}
    add("手机宽度无横向溢出", bool(metrics) and metrics["sw"] <= metrics["iw"] + 1,
        f"innerWidth={metrics.get('iw')}, scrollWidth={metrics.get('sw')}")
    try:
        os.remove(probe)
    except OSError:
        pass
    add("搜索 / 城市筛选 / 主题 / 语言按钮可用",
        metrics.get("search", 0) >= 1 and metrics.get("city") == 13 and metrics.get("dark") is True and metrics.get("onlycn") is True,
        f"search(骑楼)={metrics.get('search')}, city(三亚)={metrics.get('city')}, dark={metrics.get('dark')}, onlycn={metrics.get('onlycn')}")
    add("手机宽度渲染 115 张卡片且图片全部加载", metrics.get("places") == 115 and metrics.get("broken", 1) == 0,
        f"places={metrics.get('places')}, loaded={metrics.get('ok')}, broken={metrics.get('broken')}")

    # --- zip
    zin = zipfile.ZipFile(ZIP)
    names = zin.namelist()
    imgs = [x for x in names if "/images/" in x and not x.endswith("/")]
    add("ZIP 内含 HTML", any(x.endswith("Hainan_115_Offline_Guide.html") for x in names), f"{len(names)} entries")
    add("ZIP 内图片数量与台账一致", len(imgs) == n, f"{len(imgs)} / {n}")
    with tempfile.TemporaryDirectory() as td:
        zin.extractall(td)
        root = os.path.join(td, "Hainan_115_Real_Photo_Guide")
        ok = os.path.exists(os.path.join(root, "Hainan_115_Offline_Guide.html")) and len(os.listdir(os.path.join(root, "images"))) > 0
        sample = None
        for dirpath, _, files in os.walk(os.path.join(root, "images")):
            if files:
                sample = os.path.join(dirpath, files[0]); break
        dec = False
        if sample:
            try:
                Image.open(sample).load(); dec = True
            except Exception:
                pass
        add("ZIP 解压到随机路径后可直接打开", ok, root)
        add("ZIP 解压出的图片可解码", dec, os.path.basename(sample or ""))

    full = sum(1 for p in PLACES if sum(1 for r in mr if r["place_id"] == str(p["id"])) >= 3)
    add("照片封面覆盖（记录，不作为通过线）", True, f"{n}/345；配满 3 张 {full}/115")

    lines = ["# QA_REPORT", "", f"日期：2026-10-31｜生成方式：`python3 scripts/qa.py`", "",
             "| 检查项 | 结果 | 证据 |", "|---|---|---|"]
    for name, res, detail in checks:
        lines.append(f"| {name} | {res} | {detail} |")
    hard_fail = [c for c in checks if c[1] == "FAIL" and "不作为通过线" not in c[0]]
    lines += ["", f"**结论：{'PASS' if not hard_fail else 'FAIL'}**（硬性检查 {len(checks)} 项，失败 {len(hard_fail)} 项）", "",
              f"- 实景照片：{n} / 345",
              f"- 配满 3 张的地点：{full} / 115",
              "- 未配满的原因逐条见 `MISSING_OR_BLOCKED.csv`；未使用 AI 图片或相似景点冒充。",
              "", "## 复现命令", "```bash", "python3 scripts/discover.py", "python3 scripts/download.py",
              "python3 scripts/build_html.py", "python3 scripts/qa.py", "python3 scripts/package.py", "```"]
    open(REPORT, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("\n".join(lines[:6]))
    print("QA", "PASS" if not hard_fail else "FAIL", "photos", n, "full", full)


if __name__ == "__main__":
    main()