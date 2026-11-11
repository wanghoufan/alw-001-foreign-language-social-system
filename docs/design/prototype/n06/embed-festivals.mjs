#!/usr/bin/env node
/* 把 assets/festivals-47-seed.json 内联进 assets/data.js 的 festivals 数组。
   可重复执行：每次用种子文件全量重建 festivals，不追加。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, 'assets', 'festivals-47-seed.json');
const dataPath = path.join(here, 'assets', 'data.js');

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
if (!Array.isArray(seed) || seed.length !== 47) {
  throw new Error(`种子条目应为 47，实际 ${Array.isArray(seed) ? seed.length : typeof seed}`);
}
const ids = seed.map(s => s.id);
if (new Set(ids).size !== ids.length) throw new Error('节日 id 有重复');

const needed = ['id', 'cn', 'en', 'country_region', 'theme', 'date_rule', 'dates_2026_2027', 'status', 'holiday_type', 'cn_brief', 'en_brief', 'questions', 'related_place_ids', 'source_urls', 'verified_at'];
for (const s of seed) {
  for (const k of needed) if (!(k in s)) throw new Error(`${s.id} 缺字段 ${k}`);
  if (!['fixed', 'pending'].includes(s.status)) throw new Error(`${s.id} status 非 fixed/pending`);
  if (!['festival_day', 'public_holiday', 'makeup_workday', 'observance'].includes(s.holiday_type)) throw new Error(`${s.id} holiday_type 非法`);
}

const data = fs.readFileSync(dataPath, 'utf8');
const start = data.indexOf('  const festivals = [');
const endMark = '\n  ];\n\n  const people = [';
const end = data.indexOf(endMark, start);
if (start < 0 || end < 0) throw new Error('未找到 festivals 数组边界');

const block = `  const festivals = ${JSON.stringify(seed, null, 2)}.map(s => ({
    id: s.id, cn: s.cn, en: s.en, region: s.country_region, theme: s.theme,
    dateRule: s.date_rule,
    y2026: (s.dates_2026_2027 && s.dates_2026_2027[0]) || null,
    y2027: (s.dates_2026_2027 && s.dates_2026_2027[1]) || null,
    status: s.status, briefCn: s.cn_brief, briefEn: s.en_brief, questions: s.questions,
    source: (s.source_urls && s.source_urls[0]) || '来源待补：未取得可靠出处，原型不当作已核实',
    holidayType: s.holiday_type,
    sourceUrls: s.source_urls || [],
    verifiedAt: s.verified_at || '',
    relatedPlaceIds: s.related_place_ids || []
  }));`;

const next = data.slice(0, start) + block + data.slice(end + '\n  ];'.length);
fs.writeFileSync(dataPath, next);

const verify = fs.readFileSync(dataPath, 'utf8');
if (!verify.includes('festivals-47') && !verify.includes(`"spring-festival"`)) throw new Error('回读失败：未找到种子内容');
console.log(`embedded ${seed.length} festivals -> ${dataPath}`);
console.log(`data.js bytes ${Buffer.byteLength(next)}`);