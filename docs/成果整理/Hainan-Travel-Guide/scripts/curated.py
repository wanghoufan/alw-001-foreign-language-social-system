#!/usr/bin/env python3
import json,os,sys
sys.path.insert(0,os.path.dirname(__file__))
import commons_client as cc
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
D=os.path.join(ROOT,'data','discovery.json'); C=json.load(open(os.path.join(ROOT,'data','curated.json')))
d=json.load(open(D))
for pid,titles in C.items():
    v=d.get(pid) or {"id":int(pid),"name":"","en_name":"","city":"","candidates":[],"errors":[],"approved_count":0}
    for t in titles:
        v['candidates']=[c for c in v['candidates'] if c['title']!=t]
        pg=cc.file_info(t)
        if not pg: print('missing',t); continue
        ok,reason,lic,ii=cc.usable(pg)
        v['candidates'].append({"title":t,"ok":ok,"relevant":True,"status":"approved" if ok else "rejected",
          "reasons":[] if ok else reason,"license":lic['short'],"license_url":lic['url'],"artist":lic['artist'],
          "desc":lic['desc'],"width":ii.get('width'),"height":ii.get('height'),"mime":ii.get('mime'),
          "url":ii.get('url'),"thumburl":ii.get('thumburl') or ii.get('url'),
          "page_url":"https://commons.wikimedia.org/wiki/"+t.replace(' ','_'),"sources":["curated"]})
        print(pid,t,'ok' if ok else reason)
    v['approved_count']=sum(1 for c in v['candidates'] if c['status']=='approved')
    d[pid]=v
json.dump(d,open(D,'w'),ensure_ascii=False,indent=1)
print('done')
