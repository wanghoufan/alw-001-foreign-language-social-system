#!/usr/bin/env python3
"""Build official V1.2 UI from the approved V1.1 interactive baseline + real 115 places."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'source/V1.1-baseline.html'
PLACES = ROOT / 'source/places-115.json'

html = SRC.read_text(encoding='utf-8')
m = re.search(r'(<script type="application/json" id="dataset">)(.*?)(</script>)', html, re.S)
data = json.loads(m.group(2))
real = json.loads(PLACES.read_text(encoding='utf-8'))
data['places'] = [{
    'id': p['id'], 'cnName': p['name'], 'enName': p['en_name'], 'city': p['city'],
    'category': p['category'], 'cn': p['cn'], 'en': p['en'],
    'locationCn': p.get('location_cn', ''), 'locationEn': p.get('location_en', ''),
    'mapAmap': p.get('map_amap', ''), 'mapGoogle': p.get('map_google', ''),
} for p in real]
payload = json.dumps(data, ensure_ascii=False).replace('</', '<\\/')
html = html[:m.start(2)] + payload + html[m.end(2):]

# Data-count and map-query corrections (no layout changes)
html = html.replace('51 款正式 V1.4 软件 · 23 个海南地点预览', '51 条 V1.4 软件记录 · 115 个海南地点')
html = html.replace('内嵌了原 115 地点库中的 23 个实例；Mac mini 的完整正式原型仍包含全部 115 个地点。本文件没有虚构其余 95 项。',
                    '已接入完整 115 个正式地点（ID 与中英原文保留）。')
html = html.replace("encodeURIComponent(a.cnName+' 海口')", "encodeURIComponent(a.cnName+' '+a.city)")
# 从聊天自动卡片进入详情时不要切走当前 Tab，否则会话视图丢失
html = html.replace(
    "if(related){let kind=related.dataset.related,id=related.dataset.id;\n   setTab(kind==='place'?'hainan':kind==='app'?'software':'self');",
    "if(related){let kind=related.dataset.related,id=related.dataset.id;\n   if(S.tab!=='chat')setTab(kind==='place'?'hainan':kind==='app'?'software':'self');")

# 本机档案同步：仅在 8791 服务下加载，file:// 打开时静默失效
if 'profile-sync.js' not in html:
    html = html.replace('</body>', '<script src="/profile-sync.js" defer></script></body>', 1)

# 归档历史 / 会后复盘入口：由 8791 同源提供（/v12/history）。基线里没有这一句，
# 之前是直接手改 index.html 的，重建会丢；这里固化成构建规则保证可复现。
HISTORY_ENTRY = ('<p class="info" style="margin:0 0 8px"><a href="/v12/history" target="_self">'
                 '录音结束后：查看原文与会后复盘 →</a></p>\n   ')
if '/v12/history' not in html:
    html = html.replace('<div class="chatsetup">', HISTORY_ENTRY + '<div class="chatsetup">', 1)

out = ROOT / 'index.html'
out.write_text(html, encoding='utf-8')
print('built', out, 'apps', len(data['apps']), 'steps', sum(len(a['steps']) for a in data['apps']),
      'places', len(data['places']), 'stories', len(data['stories']))
