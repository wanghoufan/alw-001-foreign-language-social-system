#!/usr/bin/env python3
"""Second pass for places with zero approved candidates: shorter core names + city context."""
import json, os, re, sys, time
sys.path.insert(0, os.path.dirname(__file__))
import commons_client as cc

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
ALIASES = json.load(open(os.path.join(ROOT, "data", "aliases.json"), encoding="utf-8"))
PATH = os.path.join(ROOT, "data", "discovery.json")
SUFFIX = re.compile(r"(国家森林公园|文化旅游区|旅游区|度假区|风景区|地质公园|植物园|文化街|夜市|广场|街区|公园|渔港|老街|村|街|路|镇|岛|湾|港)$")
CITY_EN = {"海口": "Haikou", "文昌": "Wenchang", "琼海": "Qionghai", "万宁": "Wanning",
           "陵水": "Lingshui", "三亚": "Sanya", "其他地区": "Hainan"}
OTHER_REGIONS = ["天津", "上海", "北京", "广东", "深圳", "大连", "青岛", "厦门", "香港", "澳门", "台湾",
                 "广西", "福建", "浙江", "江苏", "山东", "辽宁", "河北", "云南", "四川", "湖南", "湖北",
                 "江西", "安徽", "河南", "山西", "陕西", "甘肃", "贵州", "新疆", "西藏", "内蒙古",
                 "宁夏", "青海", "吉林", "黑龙江", "重庆", "苏州", "杭州", "南京", "武汉", "成都", "西安"]


def main():
    d = json.load(open(PATH, encoding="utf-8"))
    todo = [p for p in PLACES if d.get(str(p["id"]), {}).get("approved_count", 0) == 0]
    print("second pass places:", len(todo), flush=True)
    for p in todo:
        pid = str(p["id"])
        entry = d.get(pid) or {"id": p["id"], "name": p["name"], "en_name": p["en_name"],
                               "city": p["city"], "candidates": [], "errors": [],
                               "approved_count": 0}
        have = {c["title"] for c in entry["candidates"]}
        core = SUFFIX.sub("", p["name"]) or p["name"]
        qs = [core, f"{core} {p['city']}"]
        for q in qs:
            try:
                pages = cc.commons_search(q, limit=15)
            except Exception as e:
                entry["errors"].append("pass2:" + str(e)[:70]); continue
            for pg in pages:
                t = pg.get("title")
                if not t or t in have:
                    continue
                have.add(t)
                ok, reason, lic, ii = cc.usable(pg)
                ti = cc.norm_raw(t + " " + lic["desc"])
                cn_core = cc.norm(core)
                foreign = any(r in ti for r in OTHER_REGIONS if r != p["city"])
                rel = (not foreign) and ((len(cn_core) >= 3 and cn_core in ti) or \
                      (len(cn_core) >= 2 and cn_core in ti and
                       (cc.norm(p["city"]) in ti or "海南" in ti or "hainan" in ti)) or \
                      any(cc.norm(a) and len(cc.norm(a)) >= 4 and cc.norm(a) in ti for a in ALIASES.get(pid, []))
                reasons = ([] if ok else reason) + ([] if rel else ["no-core-match"])
                entry["candidates"].append({
                    "title": t, "ok": ok, "relevant": rel,
                    "status": "approved" if ok and rel else "rejected", "reasons": reasons,
                    "license": lic["short"], "license_url": lic["url"], "artist": lic["artist"],
                    "desc": lic["desc"], "width": ii.get("width"), "height": ii.get("height"),
                    "mime": ii.get("mime"), "url": ii.get("url"),
                    "thumburl": ii.get("thumburl") or ii.get("url"),
                    "page_url": "https://commons.wikimedia.org/wiki/" + t.replace(" ", "_"),
                    "sources": ["pass2:" + q],
                })
        entry["candidates"].sort(key=lambda c: (c["status"] != "approved", -(c["width"] or 0)))
        entry["approved_count"] = sum(1 for c in entry["candidates"] if c["status"] == "approved")
        d[pid] = entry
        json.dump(d, open(PATH, "w"), ensure_ascii=False, indent=1)
        print(f'#{pid} {p["name"]}: {entry["approved_count"]} approved', flush=True)
        time.sleep(0.3)


if __name__ == "__main__":
    main()