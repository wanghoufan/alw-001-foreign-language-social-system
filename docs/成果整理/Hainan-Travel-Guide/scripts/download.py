#!/usr/bin/env python3
"""Download approved Commons candidates, dedupe, optimize to WebP, write PHOTO_MANIFEST.csv."""
import csv, hashlib, io, json, os, sys, time
import requests
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DISCOVERY = os.path.join(ROOT, "data", "discovery.json")
PLACES = json.load(open(os.path.join(ROOT, "data", "places.json"), encoding="utf-8"))
MANIFEST = os.path.join(ROOT, "data", "PHOTO_MANIFEST.csv")
CAND = os.path.join(ROOT, "candidates")
IMG = os.path.join(ROOT, "images")
LOGS = os.path.join(ROOT, "logs")
PROXY = os.environ.get("HG_PROXY", "http://127.0.0.1:7897")
UA = "HainanGuideResearch/1.0 (personal offline travel guide; contact: local user)"

os.makedirs(CAND, exist_ok=True); os.makedirs(IMG, exist_ok=True); os.makedirs(LOGS, exist_ok=True)
session = requests.Session()
session.proxies.update({"http": PROXY, "https": PROXY})
session.headers.update({"User-Agent": UA, "Referer": "https://commons.wikimedia.org/"})

FIELDS = ["place_id", "place_name", "slot", "local_path", "source_page", "original_url",
          "creator", "license_or_permission", "license_url", "attribution", "acquired_at",
          "status", "image_width", "image_height", "sha256", "perceptual_hash",
          "verification_note", "caption", "file_title"]


def dhash(im, size=8):
    im = im.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(im.getdata())
    bits = 0
    for r in range(size):
        for c in range(size):
            bits = (bits << 1) | (px[r * (size + 1) + c] < px[r * (size + 1) + c + 1])
    return f"{bits:016x}"


def hamming(a, b):
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def load_manifest():
    if not os.path.exists(MANIFEST):
        return []
    with open(MANIFEST, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save_manifest(rows):
    with open(MANIFEST, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def clean_caption(c):
    t = (c.get("desc") or "").strip()
    t = t.replace("\n", " ")
    if len(t) < 6:
        t = c["title"].replace("File:", "").rsplit(".", 1)[0]
        t = t.replace("_", " ")
    return t[:140]


def pick(cands, n=3):
    ok = [c for c in cands if c["status"] == "approved" and c.get("thumburl")]
    # prefer lead/category sources, then resolution, then aspect variety
    def prio(c):
        s = " ".join(c["sources"])
        score = 0
        if "zhwiki-lead" in s: score += 5
        if "category:" in s: score += 3
        if "zh-name" in s: score += 2
        return (-score, -(c.get("width") or 0))
    ok.sort(key=prio)
    chosen, ratios = [], []
    for c in ok:
        w, h = c.get("width") or 1, c.get("height") or 1
        r = w / h
        if r < 0.45 or r > 2.8:
            continue
        if any(abs(r - x) < 0.12 for x in ratios) and len(ok) > n * 2:
            continue
        chosen.append(c); ratios.append(r)
        if len(chosen) == n:
            break
    if len(chosen) < n:
        for c in ok:
            if c not in chosen:
                chosen.append(c)
            if len(chosen) == n:
                break
    return chosen


def main():
    only = set(sys.argv[1:])
    disc = json.load(open(DISCOVERY, encoding="utf-8"))
    rows = load_manifest()
    done = {(r["place_id"], r["slot"]) for r in rows}
    hashes = [r["perceptual_hash"] for r in rows if r.get("perceptual_hash")]
    for p in PLACES:
        pid = str(p["id"])
        if only and pid not in only:
            continue
        d = disc.get(pid)
        if not d:
            continue
        picks = pick(d["candidates"], 12)
        if not picks:
            print(f"#{pid} {p['name']}: no approved candidate", flush=True)
            continue
        folder = os.path.join(IMG, p["city_folder"], f"{p['id']:03d}")
        os.makedirs(folder, exist_ok=True)
        slot = 0
        for c in picks:
            if slot >= 3:
                break
            slot += 1
            if (pid, str(slot)) in done:
                continue
            try:
                r = session.get(c["thumburl"], timeout=90)
                r.raise_for_status()
                im = Image.open(io.BytesIO(r.content))
                im = ImageOps.exif_transpose(im).convert("RGB")
            except Exception as e:
                print(f"#{pid} slot{slot} download failed: {e}", flush=True)
                slot -= 1
                continue
            if max(im.size) > 1600:
                im.thumbnail((1600, 1600), Image.LANCZOS)
            ph = dhash(im)
            if any(hamming(ph, h) <= 6 for h in hashes):
                print(f"#{pid} slot{slot} duplicate skipped: {c['title'][:50]}", flush=True)
                slot -= 1
                continue
            rel = f"images/{p['city_folder']}/{p['id']:03d}/{slot:02d}.webp"
            out = os.path.join(ROOT, rel)
            im.save(out, "WEBP", quality=82, method=4)
            data = open(out, "rb").read()
            row = {
                "place_id": pid, "place_name": p["name"], "slot": slot, "local_path": rel,
                "source_page": c["page_url"], "original_url": c["url"],
                "creator": c["artist"], "license_or_permission": c["license"],
                "license_url": c.get("license_url", ""),
                "attribution": f"{c['artist']} / {c['license']} / Wikimedia Commons",
                "acquired_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "status": "approved", "image_width": im.width, "image_height": im.height,
                "sha256": hashlib.sha256(data).hexdigest(), "perceptual_hash": ph,
                "verification_note": "name-matched Commons title/description; licence allows redistribution",
                "caption": clean_caption(c), "file_title": c["title"],
            }
            rows.append(row); hashes.append(ph)
            print(f"#{pid} slot{slot} OK {im.width}x{im.height} {rel}", flush=True)
            save_manifest(rows)
        save_manifest(rows)
    print("MANIFEST rows:", sum(1 for r in rows if r["status"] == "approved"))


if __name__ == "__main__":
    main()