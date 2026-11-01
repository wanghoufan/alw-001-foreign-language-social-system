#!/usr/bin/env python3
"""Assemble dist folder (data, docs, html, images) and zip it."""
import csv, hashlib, json, os, shutil, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DIST = os.path.join(ROOT, "dist", "Hainan_115_Real_Photo_Guide")
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
MANIFEST = os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv")
ZIP = os.path.join(ROOT, "artifacts", "Hainan_115_Real_Photo_Guide_V3.0.zip")


def rows():
    if not os.path.exists(MANIFEST):
        return []
    with open(MANIFEST, newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r.get("status") == "approved"]


def write_locations():
    path = os.path.join(DIST, "LOCATIONS.csv")
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["id", "city", "name", "en_name", "location_cn", "location_en", "map_query", "map_amap", "map_google", "location_confidence"])
        for p in PLACES:
            w.writerow([p["id"], p["city"], p["name"], p["en_name"], p["location_cn"], p["location_en"],
                        p.get("map_query", ""), p.get("map_amap", ""), p.get("map_google", ""), p.get("location_confidence", "")])


def write_missing():
    have = {}
    for r in rows():
        have[r["place_id"]] = have.get(r["place_id"], 0) + 1
    path = os.path.join(DIST, "MISSING_OR_BLOCKED.csv")
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["place_id", "city", "name", "photos_have", "photos_missing", "reason", "action"])
        for p in PLACES:
            n = have.get(str(p["id"]), 0)
            if n < 3:
                reason = "Wikimedia Commons 无该地点的可再分发实景照片" if n == 0 else "Commons 可用授权照片不足 3 张或构图重复"
                w.writerow([p["id"], p["city"], p["name"], n, 3 - n, reason,
                            "保留空缺并标“待补图”；取得明确授权后补入"])


def write_attributions():
    path = os.path.join(DIST, "ATTRIBUTIONS_AND_LICENSES.md")
    rs = rows()
    lines = ["# 图片来源、作者与许可", "",
             "所有入包照片均来自 Wikimedia Commons，许可允许再分发；下表逐张列出作者、许可和来源页。", "",
             "| 地点 | 槽位 | 文件 | 作者 | 许可 | 来源页 |", "|---|---|---|---|---|---|"]
    for r in rs:
        lines.append(f'| {r["place_name"]} | {r["slot"]} | `{r["local_path"]}` | {r["creator"]} | {r["license_or_permission"]} | {r["source_page"]} |')
    lines += ["", f"共 {len(rs)} 张。", "",
              "署名要求：CC BY / CC BY-SA 图片保留作者与许可标注；CC0 / Public Domain 亦保留来源以便追溯。"]
    open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")


def write_discovery_log():
    import glob
    disc = json.load(open(os.path.join(ROOT, "data", "discovery.json"), encoding="utf-8"))
    path = os.path.join(DIST, "DISCOVERY_LOG.csv")
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["place_id", "place_name", "searched_via", "file_title", "status", "reject_reason", "license", "width", "height"])
        for pid, v in disc.items():
            for c in v.get("candidates", []):
                w.writerow([pid, v["name"], ";".join(c.get("sources", [])), c["title"], c["status"],
                            ";".join(c.get("reasons", [])), c.get("license", ""), c.get("width", ""), c.get("height", "")])


def write_coverage():
    import collections
    rs = rows()
    cnt = collections.Counter(r["place_id"] for r in rs)
    buckets = {"3张": [], "1-2张": [], "0张": []}
    for p in PLACES:
        n = cnt.get(str(p["id"]), 0)
        buckets["3张" if n >= 3 else ("1-2张" if n else "0张")].append(p)
    lines = ["# 照片覆盖说明", "",
             f"- 地点总数：115",
             f"- 实景照片：{len(rs)} / 345",
             f"- 配满 3 张：{len(buckets['3张'])} 处",
             f"- 只有 1–2 张：{len(buckets['1-2张'])} 处",
             f"- 暂无合规照片：{len(buckets['0张'])} 处", "",
             "## 为什么没有 345 张", "",
             "入包条件同时要求「照片确实属于该地点」与「许可允许再分发」。主要图源 Wikimedia Commons 对热门景区覆盖较好，",
             "但对近年的网红小街、独立咖啡馆、夜市摊位、社区商场等地点几乎没有可再分发素材；中文新闻、携程、小红书、大众点评等图片受版权保护，",
             "不能因为公开可见就复制进 ZIP。因此这些地点保留“待补图”，没有用 AI 图、邻近街道或相似景点冒充。", "",
             "## 暂无合规照片的地点（按城市）"]
    by = collections.defaultdict(list)
    for p in buckets["0张"]:
        by[p["city"]].append(p["name"])
    for city, names in by.items():
        lines.append(f"- **{city}**（{len(names)}）：" + "、".join(names))
    lines += ["", "## 只有 1–2 张的地点"]
    for p in buckets["1-2张"]:
        lines.append(f"- {p['city']} {p['name']}：{cnt.get(str(p['id']),0)} 张")
    lines += ["", "## 补图方式", "",
              "1. 你自己拍过或朋友拍过的对应地点照片，确认授权后可放入 `images/<城市>/<编号>/` 并补登记。",
              "2. 找到明确标注 CC BY / CC BY-SA / CC0 的对应地点照片，补进台账后重新打包。",
              "3. 联系店铺/景区取得书面使用许可。", "",
              "任何补图都必须先证明「这张图就是这个地点」，不能只凭名字相似。"]
    open(os.path.join(DIST, "PHOTO_COVERAGE.md"), "w", encoding="utf-8").write("\n".join(lines) + "\n")


def write_readme(count, full):
    txt = f"""# 海南 115 处值得玩的地方 · 中英双语实景指南

直接双击 `Hainan_115_Offline_Guide.html` 即可离线浏览，无需联网、无需服务器。

## 包里有什么

- `Hainan_115_Offline_Guide.html`：完整指南（搜索、城市/分类筛选、中/英切换、深色模式、图片放大）
- `images/`：{count} 张实景照片（WebP，按城市/编号存放）
- `places.json`：115 处地点数据
- `LOCATIONS.csv`：位置与导航记录
- `PHOTO_MANIFEST.csv`：逐张照片的来源、作者、许可、尺寸、SHA-256、感知哈希
- `MISSING_OR_BLOCKED.csv`：未配满 3 张的地点及真实原因
- `ATTRIBUTIONS_AND_LICENSES.md`：署名与许可清单
- `QA_REPORT.md`：真实验收结果

## 当前完成度

- 地点：115 / 115
- 实景照片：{count} / 345
- 配满 3 张的地点：{full} / 115

未配满的地点不是遗漏，而是没有找到同时满足「确实属于该地点」和「许可允许再分发」两个条件的照片。缺图位置在页面中明确标为“待补图”，没有用 AI 图或相似景色顶替。

## 使用提示

- 高德 / Google 导航按钮需要联网，其余内容完全离线。
- 照片点击可看大图、作者与许可。
- 店铺、游船、营地、火箭观礼可能临时调整，出发前请核实。
"""
    open(os.path.join(DIST, "README.md"), "w", encoding="utf-8").write(txt)


def write_changelog(count, full):
    txt = f"""# CHANGELOG

## V3.0 — 2026-10-31

- 基于 V2.0 的 115 处地点数据与页面结构迭代，保留全部 ID 与地点身份。
- 实际下载并核验 {count} 张 Wikimedia Commons 授权实景照片，压缩为 WebP 离线可用。
- 新增逐张来源/作者/许可台账 `PHOTO_MANIFEST.csv`、署名声明的 `ATTRIBUTIONS_AND_LICENSES.md`。
- 新增 `MISSING_OR_BLOCKED.csv`，如实记录未配满 3 张的地点。
- 英文开头统一改为自然表达，移除 “You can find it at …” 句式。
- 离线 HTML 移除一切在线图片依赖，图片走相对路径；数据内嵌，双击即可看。
- 缺图地点显示“待补图”，不使用 AI 图片或相似景点照片冒充。
- 当前：照片 {count}/345，配满 3 张的地点 {full}/115。
"""
    open(os.path.join(DIST, "CHANGELOG.md"), "w", encoding="utf-8").write(txt)


def main():
    rs = rows()
    full = len({r["place_id"] for r in rs if sum(1 for x in rs if x["place_id"] == r["place_id"]) >= 3})
    os.makedirs(DIST, exist_ok=True)
    shutil.copy(os.path.join(ROOT, "data", "places.json"), os.path.join(DIST, "places.json"))
    shutil.copy(os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv"), os.path.join(DIST, "PHOTO_MANIFEST.csv"))
    write_locations(); write_missing(); write_attributions(); write_discovery_log(); write_coverage()
    write_readme(len(rs), full); write_changelog(len(rs), full)
    # zip
    os.makedirs(os.path.dirname(ZIP), exist_ok=True)
    if os.path.exists(ZIP):
        os.remove(ZIP)
    subprocess.run(["zip", "-r", "-X", "-q", ZIP, "Hainan_115_Real_Photo_Guide"], cwd=os.path.join(ROOT, "dist"), check=True)
    h = hashlib.sha256(open(ZIP, "rb").read()).hexdigest()
    print(f"ZIP {ZIP} {os.path.getsize(ZIP)} bytes sha256={h}")


if __name__ == "__main__":
    main()