#!/usr/bin/env python3
"""Probe Wikimedia Commons coverage for the 115 places."""
import json, sys, time, re
import requests

PROXY = {"http": "http://127.0.0.1:7897", "https": "http://127.0.0.1:7897"}
API = "https://commons.wikimedia.org/w/api.php"
S = requests.Session()
S.proxies.update(PROXY)
S.headers.update({"User-Agent": "HainanGuideResearch/1.0 (personal travel guide; contact: local)"})


def search(q, limit=12):
    p = {
        "action": "query", "format": "json", "generator": "search",
        "gsrsearch": f"{q} filetype:bitmap", "gsrnamespace": 6, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
    }
    r = S.get(API, params=p, timeout=30)
    r.raise_for_status()
    return r.json().get("query", {}).get("pages", {})


def main():
    places = json.load(open("data/places.json"))
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    for pl in places[:limit]:
        qs = [pl["name"], f'{pl["name"]} {pl["city"]}', pl["en_name"]]
        hits = {}
        for q in qs:
            try:
                pages = search(q)
            except Exception as e:
                print("ERR", pl["id"], q, e); continue
            for pid, pg in pages.items():
                t = pg["title"]
                hits.setdefault(t, pg)
            time.sleep(0.2)
        print(f'#{pl["id"]} {pl["name"]} -> {len(hits)} unique')
        for t, pg in list(hits.items())[:4]:
            ii = (pg.get("imageinfo") or [{}])[0]
            lic = (ii.get("extmetadata") or {}).get("LicenseShortName", {}).get("value", "?")
            print("   ", t, ii.get("width"), "x", ii.get("height"), "|", lic)


if __name__ == "__main__":
    main()