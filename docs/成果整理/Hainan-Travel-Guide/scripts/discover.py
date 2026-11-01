#!/usr/bin/env python3
"""Discover licensed Commons images for each of the 115 places.

Writes data/discovery.json. Rejected candidates keep a reason for the audit trail.
"""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import commons_client as cc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
ALIASES = json.load(open(os.path.join(ROOT, "data", "aliases.json"), encoding="utf-8"))
OUT = os.path.join(ROOT, "data", "discovery.json")


def en_tokens(s):
    return [t for t in re.findall(r"[a-z]{3,}", (s or "").lower()) if t not in
            {"the", "and", "of", "bay", "park", "beach", "road", "street", "village", "area", "island", "town", "city"}]


OTHER_REGIONS = ["天津", "上海", "北京", "广东", "深圳", "大连", "青岛", "厦门", "香港", "澳门", "台湾",
                 "广西", "福建", "浙江", "江苏", "山东", "辽宁", "河北", "云南", "四川", "湖南", "湖北",
                 "江西", "安徽", "河南", "山西", "陕西", "甘肃", "贵州", "新疆", "西藏", "内蒙古",
                 "宁夏", "青海", "吉林", "黑龙江", "重庆", "苏州", "杭州", "南京", "武汉", "成都", "西安"]


def relevance(pg, place, trusted=False, aliases=()):
    """Strict: exact Chinese name / exact English phrase, or a name-matched category."""
    title = pg.get("title", "")
    ii = (pg.get("imageinfo") or [{}])[0]
    desc = cc.parse_license(ii.get("extmetadata"))["desc"]
    text = cc.norm_raw(title + " " + desc)
    if any(r in text for r in OTHER_REGIONS if r != place["city"]):
        return False, "other-region"
    if trusted:
        return True, "trusted-category-or-wikipedia"
    zh = cc.norm(place["name"])
    en = cc.norm(place["en_name"])
    if zh and zh in text:
        return True, "zh-name"
    if en and len(en) >= 6 and en in text:
        return True, "en-phrase"
    for a in aliases:
        an = cc.norm(a)
        if an and len(an) >= 4 and an in text:
            return True, "alias:" + a
    return False, "no-match"


def add(bucket, pg, source, trusted=False):
    t = pg.get("title")
    if not t:
        return
    if t in bucket:
        bucket[t]["sources"].append(source)
        bucket[t]["trusted"] = bucket[t]["trusted"] or trusted
        return
    bucket[t] = {"page": pg, "sources": [source], "trusted": trusted}


def main():
    only = set(int(x) for x in sys.argv[1:]) if len(sys.argv) > 1 else None
    results = {}
    if os.path.exists(OUT):
        results = json.load(open(OUT, encoding="utf-8"))
    for place in PLACES:
        pid = str(place["id"])
        if only and place["id"] not in only:
            continue
        if pid in results and results[pid].get("candidates"):
            continue
        bucket = {}
        errs = []
        # 2) Commons category by name
        try:
            zh, en = cc.norm(place["name"]), cc.norm(place["en_name"])
            for cat in cc.search_categories(place["name"], limit=5)[:2]:
                cn = cc.norm(cat.replace("Category:", ""))
                if zh in cn or (en and len(en) >= 6 and en in cn):
                    for pg in cc.commons_category(cat, limit=40):
                        add(bucket, pg, "category:" + cat, trusted=True)
        except Exception as e:
            errs.append("cat:" + str(e)[:80])
        # 3) Commons file search
        alias_qs = ALIASES.get(pid, [])
        for q in [place["name"], place["en_name"]] + alias_qs:
            try:
                for pg in cc.commons_search(q, limit=20):
                    add(bucket, pg, "search:" + q)
            except Exception as e:
                errs.append("search:" + str(e)[:80])

        cands = []
        for t, b in bucket.items():
            ok, reason, lic, ii = cc.usable(b["page"])
            rel, why = relevance(b["page"], place, trusted=b["trusted"], aliases=alias_qs)
            status = "approved" if (ok and rel) else "rejected"
            reasons = []
            if not ok:
                reasons.extend(reason)
            if not rel:
                reasons.append(why)
            cands.append({
                "title": t, "ok": ok, "relevant": rel, "status": status,
                "reasons": reasons, "license": lic["short"], "license_url": lic["url"],
                "artist": lic["artist"], "desc": lic["desc"],
                "width": ii.get("width"), "height": ii.get("height"),
                "mime": ii.get("mime"), "url": ii.get("url"),
                "thumburl": ii.get("thumburl") or ii.get("url"),
                "page_url": "https://commons.wikimedia.org/wiki/" + t.replace(" ", "_"),
                "sources": b["sources"],
            })
        cands.sort(key=lambda c: (c["status"] != "approved", -(c["width"] or 0)))
        results[pid] = {"id": place["id"], "name": place["name"], "en_name": place["en_name"],
                        "city": place["city"], "candidates": cands, "errors": errs,
                        "approved_count": sum(1 for c in cands if c["status"] == "approved")}
        print(f'#{pid} {place["name"]}: {results[pid]["approved_count"]} approved / {len(cands)} seen'
              + (f' errors={errs}' if errs else ""), flush=True)
        json.dump(results, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(0.4)
    total = sum(v["approved_count"] for v in results.values())
    print("DONE places", len(results), "approved candidates", total)


if __name__ == "__main__":
    main()