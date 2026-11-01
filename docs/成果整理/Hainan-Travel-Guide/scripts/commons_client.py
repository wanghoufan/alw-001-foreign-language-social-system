#!/usr/bin/env python3
"""Wikimedia Commons / Wikipedia client with polite pacing, caching and license parsing."""
import json, os, re, time, hashlib
import requests

PROXY = os.environ.get("HG_PROXY", "http://127.0.0.1:7897")
API = "https://commons.wikimedia.org/w/api.php"
ZHWIKI = "https://zh.wikipedia.org/w/api.php"
UA = "HainanGuideResearch/1.0 (personal offline travel guide; contact: local user)"
CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "candidates", "_cache")
os.makedirs(CACHE_DIR, exist_ok=True)

session = requests.Session()
session.proxies.update({"http": PROXY, "https": PROXY})
session.headers.update({"User-Agent": UA, "Accept": "application/json"})

_last = [0.0]


def _get(url, params, tag):
    key = hashlib.sha1((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    path = os.path.join(CACHE_DIR, key + ".json")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    delay = float(os.environ.get("HG_DELAY", "1.4"))
    wait = delay - (time.time() - _last[0])
    if wait > 0:
        time.sleep(wait)
    for attempt in range(5):
        try:
            r = session.get(url, params=params, timeout=45)
            _last[0] = time.time()
            if r.status_code == 429:
                time.sleep(10 * (attempt + 1)); continue
            if r.status_code >= 500:
                time.sleep(5 * (attempt + 1)); continue
            r.raise_for_status()
            data = r.json()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            return data
        except Exception as e:
            if attempt == 4:
                raise
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(f"failed {tag}")


def commons_search(q, limit=20):
    p = {"action": "query", "format": "json", "formatversion": 2,
         "generator": "search", "gsrsearch": f"{q} filetype:bitmap",
         "gsrnamespace": 6, "gsrlimit": limit, "prop": "imageinfo",
         "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600, "maxlag": 5}
    return _get(API, p, "search:" + q).get("query", {}).get("pages", []) or []


def commons_category(cat, limit=50):
    p = {"action": "query", "format": "json", "formatversion": 2,
         "generator": "categorymembers", "gcmtitle": cat, "gcmtype": "file",
         "gcmlimit": limit, "prop": "imageinfo",
         "iiprop": "url|size|mime|extmetadata", "iiurlwidth": 1600, "maxlag": 5}
    return _get(API, p, "cat:" + cat).get("query", {}).get("pages", []) or []


def search_categories(q, limit=8):
    p = {"action": "query", "format": "json", "formatversion": 2,
         "list": "search", "srsearch": q, "srnamespace": 14, "srlimit": limit, "maxlag": 5}
    return [x["title"] for x in _get(API, p, "cats:" + q).get("query", {}).get("search", [])]


def zhwiki_page(title):
    p = {"action": "query", "format": "json", "formatversion": 2, "titles": title,
         "prop": "pageimages|pageprops", "piprop": "original|thumbnail",
         "pithumbsize": 1600, "redirects": 1, "maxlag": 5}
    pages = _get(ZHWIKI, p, "wiki:" + title).get("query", {}).get("pages", [])
    return pages[0] if pages else None


BAD_WORDS = re.compile(r"(map|maps|diagram|logo|icon|seal|poster|chart|sign|banner|"
                       r"plan|drawing|screenshot|render|model|stamp|banknote|coin|"
                       r"地图|示意|标识|标志|海报|截图|平面图|线路图|logo)", re.I)
LICENSE_OK = re.compile(r"(cc0|public domain|pd-|cc[- ]by([- ]sa)?[- ]?\d|"
                        r"no restrictions|attribution)", re.I)
LICENSE_BAD = re.compile(r"(\bnc\b|non[- ]?commercial|\bnd\b|no[- ]?deriv|fair use)", re.I)


def parse_license(meta):
    m = meta or {}
    short = (m.get("LicenseShortName") or {}).get("value", "") or ""
    licurl = (m.get("LicenseUrl") or {}).get("value", "") or ""
    artist = re.sub(r"<[^>]+>", "", (m.get("Artist") or {}).get("value", "") or "").strip()
    credit = re.sub(r"<[^>]+>", "", (m.get("Credit") or {}).get("value", "") or "").strip()
    desc = re.sub(r"<[^>]+>", "", (m.get("ImageDescription") or {}).get("value", "") or "").strip()
    text = " ".join([short, licurl])
    ok = bool(LICENSE_OK.search(text)) and not LICENSE_BAD.search(text)
    if short.lower().startswith("pd") or "public domain" in text.lower():
        ok = not LICENSE_BAD.search(text)
    return {"short": short, "url": licurl, "artist": artist or credit or "Unknown (see source page)",
            "desc": desc, "ok": ok}


def norm_raw(s):
    """Normalise but KEEP parenthetical content (photo titles often put the place there)."""
    s = (s or "").lower()
    s = s.replace("（", "").replace("）", "").replace("(", "").replace(")", "")
    return re.sub(r"[\s\u3000·—\-_/、,，。.:：;；!！?？'\"“”‘’]+", "", s)


def norm(s):
    s = (s or "").lower()
    s = re.sub(r"[（(].*?[)）]", "", s)
    return re.sub(r"[\s\u3000·—\-_/、,，。.:：;；!！?？'\"“”‘’]+", "", s)


def usable(pg, min_width=800):
    ii = (pg.get("imageinfo") or [{}])[0]
    lic = parse_license(ii.get("extmetadata"))
    w, h = ii.get("width") or 0, ii.get("height") or 0
    title = pg.get("title", "")
    reasons = []
    if not lic["ok"]:
        reasons.append("license:" + (lic["short"] or "unknown"))
    if w < min_width:
        reasons.append(f"small:{w}")
    if (ii.get("mime") or "") not in ("image/jpeg", "image/png", "image/webp"):
        reasons.append("mime:" + (ii.get("mime") or ""))
    if BAD_WORDS.search(title):
        reasons.append("subject")
    return (not reasons), reasons, lic, ii

def file_info(title):
    p = {"action": "query", "format": "json", "formatversion": 2, "titles": title,
         "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
         "iiurlwidth": 1600, "maxlag": 5}
    pages = _get(API, p, "file:" + title).get("query", {}).get("pages", [])
    return pages[0] if pages else None
