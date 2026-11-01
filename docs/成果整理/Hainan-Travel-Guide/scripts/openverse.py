#!/usr/bin/env python3
"""Second compliant source: Openverse (Flickr CC / Wikimedia mirrors), only exact place-name matches."""
import csv, hashlib, io, json, os, re, sys, time
import requests
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
ALIASES = json.load(open(os.path.join(ROOT, "data", "aliases.json"), encoding="utf-8"))
MANIFEST = os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv")
IMG = os.path.join(ROOT, "images")
PROXY = os.environ.get("HG_PROXY", "http://127.0.0.1:7897")
UA = "HainanGuideResearch/1.0 (personal offline travel guide)"
API = "https://api.openverse.org/v1/images/"
ALLOWED = {"cc0", "by", "by-sa", "pdm"}
OTHER = ["天津", "上海", "北京", "广东", "深圳", "大连", "青岛", "厦门", "香港", "澳门", "台湾", "广西",
         "福建", "浙江", "江苏", "山东", "辽宁", "河北", "云南", "四川", "湖南", "湖北", "江西", "安徽",
         "河南", "山西", "陕西", "甘肃", "贵州", "新疆", "西藏", "内蒙古", "宁夏", "青海", "吉林",
         "黑龙江", "重庆"]
EN_OTHER = ["shenzhen", "guangdong", "tianjin", "shanghai", "beijing", "qingdao", "xiamen", "dalian",
            "hong kong", "macau", "taiwan", "guangxi", "fujian", "zhejiang", "jiangsu", "shandong",
            "yunnan", "sichuan", "hunan", "hubei", "jiangxi", "anhui", "henan", "shanxi", "shaanxi",
            "gansu", "guizhou", "xinjiang", "tibet", "inner mongolia", "ningxia", "qinghai", "jilin",
            "heilongjiang", "chongqing", "chengdu", "wuhan", "hangzhou", "nanjing", "suzhou", "xi'an"]
BAD = re.compile(r"(map|diagram|logo|chart|plan|drawing|screenshot|poster|seal|地图|示意|标识|海报|截图)", re.I)

session = requests.Session()
session.proxies.update({"http": PROXY, "https": PROXY})
session.headers.update({"User-Agent": UA})

FIELDS = ["place_id", "place_name", "slot", "local_path", "source_page", "original_url", "creator",
          "license_or_permission", "license_url", "attribution", "acquired_at", "status",
          "image_width", "image_height", "sha256", "perceptual_hash", "verification_note", "caption", "file_title"]


def norm(s):
    s = (s or "").lower().replace("（", "").replace("）", "").replace("(", "").replace(")", "")
    return re.sub(r"[\s·—\-_/、,，。.:：;；!！?？'\"“”‘’]+", "", s)


def dhash(im, size=8):
    im = im.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(im.getdata()); bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] < px[r * (size + 1) + c + 1])
    return f"{bits:016x}"


def load_rows():
    if not os.path.exists(MANIFEST):
        return []
    return list(csv.DictReader(open(MANIFEST, encoding="utf-8")))


def save_rows(rows):
    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS); w.writeheader()
        for r in rows: w.writerow({k: r.get(k, "") for k in FIELDS})


def api(q):
    for attempt in range(4):
        try:
            r = session.get(API, params={"q": q, "page_size": 20, "license": ",".join(sorted(ALLOWED))}, timeout=60)
            if r.status_code == 429:
                time.sleep(20 * (attempt + 1)); continue
            r.raise_for_status()
            return r.json().get("results", [])
        except Exception:
            time.sleep(5 * (attempt + 1))
    return []


def main():
    rows = load_rows()
    counts = {}
    for r in rows:
        if r["status"] == "approved":
            counts[r["place_id"]] = counts.get(r["place_id"], 0) + 1
    hashes = [r["perceptual_hash"] for r in rows if r.get("perceptual_hash")]
    for p in PLACES:
        pid = str(p["id"])
        need = 3 - counts.get(pid, 0)
        if need <= 0:
            continue
        queries = [p["en_name"]] + ALIASES.get(pid, [])[:2]
        got = 0
        for q in queries:
            if got >= need:
                break
            res = api(q)
            time.sleep(2.5)
            for x in res:
                if got >= need:
                    break
                title = x.get("title") or ""
                tagtext = " ".join(t.get("name", "") if isinstance(t, dict) else str(t) for t in (x.get("tags") or []))
                raw = (title + " " + tagtext).lower()
                text = norm(title + " " + tagtext)
                if any(r in text for r in OTHER if r != p["city"]):
                    continue
                if any(e in raw for e in EN_OTHER):
                    continue
                if BAD.search(title):
                    continue
                en = p["en_name"]
                phrase = bool(re.search(r"\b" + re.escape(en.lower()) + r"\b", raw))
                city_en = {"海口": "haikou", "文昌": "wenchang", "琼海": "qionghai", "万宁": "wanning",
                           "陵水": "lingshui", "三亚": "sanya", "其他地区": "hainan"}.get(p["city"], "hainan")
                has_region = city_en in raw or "hainan" in raw
                distinctive = len(en.split()) == 1 and len(en) >= 6
                alias_ok = any(re.search(r"\b" + re.escape(a.lower()) + r"\b", raw) for a in ALIASES.get(pid, []))
                okname = (phrase or alias_ok) and (has_region or distinctive)
                if not okname:
                    continue
                w, h = x.get("width") or 0, x.get("height") or 0
                if max(w, h) < 800:
                    continue
                url = x.get("url")
                if not url:
                    continue
                try:
                    rr = session.get(url, timeout=60)
                    rr.raise_for_status()
                    im = Image.open(io.BytesIO(rr.content))
                    im = ImageOps.exif_transpose(im).convert("RGB")
                except Exception as e:
                    print(f"#{pid} dl fail {title[:40]}: {str(e)[:50]}", flush=True); continue
                if max(im.size) > 1600:
                    im.thumbnail((1600, 1600), Image.LANCZOS)
                ph = dhash(im)
                if any(bin(int(ph, 16) ^ int(hh, 16)).count("1") <= 6 for hh in hashes):
                    continue
                counts[pid] = counts.get(pid, 0) + 1
                slot = counts[pid]
                folder = os.path.join(IMG, p["city_folder"], f"{p['id']:03d}")
                os.makedirs(folder, exist_ok=True)
                rel = f"images/{p['city_folder']}/{p['id']:03d}/{slot:02d}.webp"
                im.save(os.path.join(ROOT, rel), "WEBP", quality=82, method=4)
                data = open(os.path.join(ROOT, rel), "rb").read()
                lic = x.get("license", "") + " " + (x.get("license_version") or "")
                rows.append({
                    "place_id": pid, "place_name": p["name"], "slot": slot, "local_path": rel,
                    "source_page": x.get("foreign_landing_url") or "", "original_url": url,
                    "creator": x.get("creator") or "Unknown (see source page)",
                    "license_or_permission": lic.strip().upper().replace("BY-SA", "BY-SA").replace("BY", "BY"),
                    "license_url": x.get("license_url") or "", "attribution": f'{x.get("creator") or "Unknown"} / {lic} / {x.get("source")}',
                    "acquired_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "status": "approved",
                    "image_width": im.width, "image_height": im.height,
                    "sha256": hashlib.sha256(data).hexdigest(), "perceptual_hash": ph,
                    "verification_note": "Openverse: exact place name in title/tags; licence allows redistribution",
                    "caption": title[:140], "file_title": title,
                })
                hashes.append(ph); got += 1
                save_rows(rows)
                print(f"#{pid} {p['name']} slot{slot} {im.width}x{im.height} | {title[:45]} | {lic}", flush=True)
        if got:
            print(f"#{pid} added {got}", flush=True)
    save_rows(rows)
    print("total", sum(1 for r in rows if r["status"] == "approved"))


if __name__ == "__main__":
    main()