#!/usr/bin/env node
/**
 * T3｜10 话题接话质量离线评测。
 * 边界：只读 source HTML，Node vm 内用桩执行；不启动浏览器、不联网、不调用任何真实大模型。
 *
 * 用法：
 *   node eval-suggestions.mjs               # 评测当前 socialmate-v1.2/source/V1.1-baseline.html
 *   node eval-suggestions.mjs --baseline    # 评测 git HEAD 的同一文件（改模板前的基线）
 *   node eval-suggestions.mjs --both        # 同时评测基线与当前，输出对比
 *   node eval-suggestions.mjs --json        # 只输出机器指标 JSON
 *   node eval-suggestions.mjs --markdown    # 输出逐组四方向候选表（Markdown）
 *   node eval-suggestions.mjs --ai-stub     # 额外用本地桩验证「AI 第一候选 + 模板补足」
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SOURCE = 'socialmate-v1.2/source/V1.1-baseline.html';
const BASELINE_SNIPPET = path.join(HERE, 'baseline-snippet.js');
const FIXTURES = path.join(HERE, 'fixtures.json');
const PROFILE = path.join(ROOT, 'SocialMate-Data/Profile/current.json');

const argv = new Set(process.argv.slice(2));
const flags = {
  baseline: argv.has('--baseline'),
  both: argv.has('--both'),
  json: argv.has('--json'),
  markdown: argv.has('--markdown'),
  aiStub: argv.has('--ai-stub'),
  empty: argv.has('--empty'),
};

/* ---------------- 代码抽取 ---------------- */

function extractTagged(html) {
  const out = [];
  for (const name of ['SM', 'TOPIC', 'SUGG']) {
    const start = html.indexOf(`T3-EVAL:${name}-START`);
    if (start < 0) throw new Error(`缺少 T3-EVAL:${name}-START 标记；先按 T3 改造 source`);
    const startEnd = html.indexOf('*/', start);
    const end = html.indexOf(`T3-EVAL:${name}-END`, startEnd);
    if (end < 0) throw new Error(`缺少 T3-EVAL:${name}-END 标记`);
    const bodyStart = html.indexOf('\n', startEnd) + 1;
    // END 标记本身是注释：从它的 /* 往前取到上一个换行，避免把 "/* " 截进代码。
    const endCommentStart = html.lastIndexOf('/*', end);
    const bodyEnd = html.lastIndexOf('\n', endCommentStart);
    out.push(html.slice(bodyStart, bodyEnd));
  }
  return out.join('\n');
}

function extractLegacy(html) {
  const smStart = html.indexOf('const SM_LEXICON=');
  const smEnd = html.indexOf('\nfunction sessionMentions()');
  const topicStart = html.indexOf('function currentTopic(){');
  const topicEnd = html.indexOf('\nfunction automaticCards(){');
  const suggStart = html.indexOf('function suggestionsNow(){');
  const suggEnd = html.indexOf('\nfunction planNow(){');
  const need = [smStart, smEnd, topicStart, topicEnd, suggStart, suggEnd];
  if (need.some((n) => n < 0)) throw new Error('无法在基线 HTML 中定位旧函数段');
  return [html.slice(smStart, smEnd), html.slice(topicStart, topicEnd), html.slice(suggStart, suggEnd)].join('\n');
}

function legacyHtml() {
  return execFileSync('git', ['show', `HEAD:${SOURCE}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function currentHtml() {
  return fs.readFileSync(path.join(ROOT, SOURCE), 'utf8');
}

// 基线：优先用改模板前固化的函数快照（git HEAD 仍是很早的 1976 行版本，不含这些函数）。
function baselineCode() {
  if (fs.existsSync(BASELINE_SNIPPET)) return fs.readFileSync(BASELINE_SNIPPET, 'utf8');
  return extractLegacy(legacyHtml());
}

function buildContext(code) {
  const ctx = vm.createContext({
    console,
    S: { session: null, aiState: 'demo', ai: null },
  });
  vm.runInContext(code, ctx, { filename: 't3-extracted.js' });
  for (const fn of ['currentTopic', 'coachPlan', 'suggestionsNow']) {
    if (typeof ctx[fn] !== 'function') throw new Error(`抽取后找不到函数 ${fn}`);
  }
  return ctx;
}

/* ---------------- 规范化与相似度 ---------------- */

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, ' ').trim();
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));
function jaccard(a, b) {
  const A = tokens(a), B = tokens(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 1;
}

/* ---------------- 已确认事实与红线扫描 ---------------- */

function readProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE, 'utf8')); } catch { return null; }
}

function factSources(profile) {
  const selfFacts = ((profile && profile.stories) || [])
    .map((s) => (typeof s === 'string' ? s : s.en || s.text || ''))
    .filter(Boolean);
  const peopleNotes = ((profile && profile.people) || []).flatMap((p) =>
    (p.notes || []).map((n) => ({
      who: p.name || p.slug || '',
      text: typeof n === 'string' ? n : n.text || '',
    })).filter((x) => x.text)
  );
  return { selfFacts, peopleNotes };
}

// 不确定性 / 可用能力表达：不构成对「我」的经历、习惯、身份的断言。
const FIRST_PERSON_ALLOW = [
  /^i (can|could|may|might|would|will|'d|'ll)\b/,
  /\bi (can|could|may|might|would|'d|'ll)\b/,
  /^i (think|guess|believe)\b/,
  /^i get that\b/,
  /^i like that\b/,
  /^i('m| am) not (sure|familiar)\b/,
  /^i don'?t know\b/,
  /^i'?ve heard\b/,
];
// 对个人经历 / 习惯 / 身份的具体断言：必须有已确认事实来源，否则记为编造。
// 注意：断言优先于 allow——"I was born ... so I can suggest ..." 不能因为后半句有 I can 就放行。
const FIRST_PERSON_CLAIM = /\bi (was born|was raised|grew up|lived?|live|am from|come from|usually|often|always|sometimes|enjoy|prefer|stud(y|ied)|built|made|started|spent|moved|explor\w*|like [a-z]+ing|work(s|ed)? (at|as|in)|know (a|the|this|that)\b)|\bi'?ve (been )?\w+ing\b/;

const PRIVACY_MARKERS = /\b(3200|2600|sku|haidian|guoxing|hong chen|certification|cost structure)\b/i;

function scanSentences(cases, profile) {
  const { selfFacts, peopleNotes } = factSources(profile);
  const firstPerson = [];
  const privacy = [];
  for (const c of cases) {
    for (const g of ['respond', 'ask', 'share', 'switch']) {
      (c.groups[g] || []).forEach((item, idx) => {
        const en = item.en || '';
        if (!/\bi\b/i.test(en)) return;
        const low = en.toLowerCase();
        const allowed = FIRST_PERSON_ALLOW.some((re) => re.test(low));
        const claim = FIRST_PERSON_CLAIM.test(low);
        let verdict = 'allowed';
        let reason = '能力/不确定/共情表达';
        if (claim) {
          const backed = selfFacts.some((f) => jaccard(f, en) >= 0.6);
          verdict = backed ? 'backed-by-confirmed-fact' : 'unverified-personal-claim';
          reason = backed ? '与已确认自我事实重合' : '已确认自我事实为空，无法核对';
        } else if (!allowed) {
          verdict = 'first-person-unclassified';
          reason = '第一人称但未命中断言词表，需人工复核';
        }
        if (verdict !== 'allowed') {
          firstPerson.push({ case: c.id, key: c.key, group: g, index: idx, en, verdict, reason });
        }
        if (PRIVACY_MARKERS.test(low) && /^i\b/i.test(low)) {
          privacy.push({ case: c.id, key: c.key, group: g, index: idx, en, reason: '把含人物/隐私标记的内容说成第一人称事实' });
        }
      });
    }
  }
  return { firstPerson, privacy, selfFacts, peopleNotes };
}

/* ---------------- 逐组执行与指标 ---------------- */

const FALLBACK_EN = new Set([
  'that sounds interesting tell me a little more',
  'i can share a local tip if that would help',
  'by the way what are your plans for the rest of the day',
  // 基线里的通用句，供基线对照时正确标注来源
  'i ve been exploring haikou too i can share a local tip',
].map(norm));

function runCase(ctx, fx) {
  ctx.S.session = { messages: fx.messages.map((text) => ({ who: 'friend', text })) };
  ctx.S.aiState = 'demo';
  ctx.S.ai = null;
  const detectedKey = ctx.currentTopic();
  const plan = ctx.coachPlan() || {};
  const sugg = ctx.suggestionsNow();
  const groups = {};
  for (const g of sugg.groups) {
    groups[g.key] = g.items.map((it) => ({
      en: it.en,
      zh: it.zh,
      source: FALLBACK_EN.has(norm(it.en)) ? '兜底' : '模板',
    }));
  }
  const all = ['respond', 'ask', 'share', 'switch'].flatMap((g) => groups[g] || []);
  return {
    id: fx.id,
    topic: fx.topic,
    expectedKey: fx.key,
    detectedKey,
    planName: plan.name || '',
    name: sugg.name,
    groups,
    counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
    nearDupPairs: nearDuplicates(all),
    focusRatio: focusRatio(all, fx.focus || []),
    anomaly: !!fx.anomaly,
  };
}

function nearDuplicates(items) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].en, b = items[j].en;
      const jac = jaccard(a, b);
      if (norm(a) === norm(b) || jac >= 0.8) {
        out.push({ a, b, kind: norm(a) === norm(b) ? 'exact' : 'near', jaccard: Number(jac.toFixed(3)) });
      }
    }
  }
  return out;
}

function focusRatio(items, focus) {
  if (!focus.length || !items.length) return 0;
  const kw = focus.map((k) => k.toLowerCase());
  const hit = items.filter((it) => kw.some((k) => String(it.en || '').toLowerCase().includes(k))).length;
  return Number((hit / items.length).toFixed(3));
}

function crossSwitchRepeats(cases) {
  const where = new Map();
  for (const c of cases) {
    for (const it of c.groups.switch || []) {
      const k = norm(it.en);
      if (!where.has(k)) where.set(k, { en: it.en, cases: [] });
      const rec = where.get(k);
      if (!rec.cases.includes(c.id)) rec.cases.push(c.id);
    }
  }
  return [...where.values()].filter((x) => x.cases.length >= 2);
}

function evaluate(html, mode, aiStub = false, emptyCheck = false) {
  const code = mode === 'baseline' ? baselineCode() : extractTagged(html);
  const ctx = buildContext(code);
  const fixtures = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const cases = fixtures.cases.map((fx) => runCase(ctx, fx));

  if (aiStub) {
    const fx = fixtures.cases.find((c) => c.key === 'coffee') || fixtures.cases[0];
    ctx.S.session = { messages: fx.messages.map((text) => ({ who: 'friend', text })) };
    ctx.S.aiState = 'ready';
    ctx.S.ai = {
      reply: 'AI-STUB reply about a concrete detail the other person just mentioned.',
      questions: ['AI-STUB question one?', 'AI-STUB question two?', 'AI-STUB question three?'],
      share: 'AI-STUB share line.',
      topic: '咖啡',
    };
    const sugg = ctx.suggestionsNow();
    cases.push({
      id: 'ai-stub',
      topic: '真实 AI 桩',
      expectedKey: fx.key,
      detectedKey: ctx.currentTopic(),
      planName: (ctx.coachPlan() || {}).name || '',
      name: sugg.name,
      groups: Object.fromEntries(sugg.groups.map((g) => [g.key, g.items.map((it) => ({
        en: it.en, zh: it.zh, source: it.en.startsWith('AI-STUB') ? 'AI' : (FALLBACK_EN.has(norm(it.en)) ? '兜底' : '模板'),
      }))])),
      counts: Object.fromEntries(sugg.groups.map((g) => [g.key, g.items.length])),
      nearDupPairs: [],
      focusRatio: 0,
      anomaly: false,
      aiFirst: Object.fromEntries(sugg.groups.map((g) => [g.key, (g.items[0]?.en || '').startsWith('AI-STUB')])),
    });
  }

  if (emptyCheck) {
    // 页面刚打开、还没有任何消息时：currentTopic 必须落到 other，四个方向不能为空。
    ctx.S.session = null;
    ctx.S.aiState = 'demo';
    ctx.S.ai = null;
    const sugg = ctx.suggestionsNow();
    cases.push({
      id: 'empty-default',
      topic: '空会话默认',
      expectedKey: 'other',
      detectedKey: ctx.currentTopic(),
      planName: (ctx.coachPlan() || {}).name || '',
      name: sugg.name,
      groups: Object.fromEntries(sugg.groups.map((g) => [g.key, g.items.map((it) => ({
        en: it.en, zh: it.zh, source: FALLBACK_EN.has(norm(it.en)) ? '兜底' : '模板',
      }))])),
      counts: Object.fromEntries(sugg.groups.map((g) => [g.key, g.items.length])),
      nearDupPairs: [],
      focusRatio: 0,
      anomaly: false,
    });
  }

  const profile = readProfile();
  const scored = cases.filter((c) => !['ai-stub', 'empty-default'].includes(c.id)); // 桩/空会话只验证路径，不计入质量指标
  const scan = scanSentences(scored, profile);
  const minPerGroup = {};
  for (const g of ['respond', 'ask', 'share', 'switch']) {
    minPerGroup[g] = Math.min(...scored.map((c) => (c.groups[g] || []).length));
  }
  const nearDupCases = scored.filter((c) => c.nearDupPairs.length > 0);
  const counts = scored.map((c) => c.counts);
  const switchRepeats = crossSwitchRepeats(scored);
  return {
    mode,
    source: mode === 'baseline' ? `快照 ${path.basename(BASELINE_SNIPPET)}` : SOURCE,
    profileConfirmedAt: new Date().toISOString(),
    summary: {
      cases: scored.length,
      topicHits: scored.filter((c) => c.detectedKey === c.expectedKey).length,
      minItemsPerDirection: minPerGroup,
      minItemsOverall: Math.min(...counts.flatMap((c) => Object.values(c))),
      casesWithNearDup: nearDupCases.length,
      nearDupPairTotal: scored.reduce((n, c) => n + c.nearDupPairs.length, 0),
      crossSwitchRepeatSentences: switchRepeats.length,
      fabricatedClaims: scan.firstPerson.filter((x) => x.verdict === 'unverified-personal-claim').length,
      unclassifiedFirstPerson: scan.firstPerson.filter((x) => x.verdict === 'first-person-unclassified').length,
      privacyMisattribution: scan.privacy.length,
      confirmedSelfFacts: scan.selfFacts.length,
      peopleFacts: scan.peopleNotes.length,
    },
    cases,
    crossSwitchRepeats: switchRepeats,
    firstPersonScan: scan.firstPerson,
    privacyHits: scan.privacy,
  };
}

/* ---------------- 输出 ---------------- */

function markdown(result) {
  const lines = [];
  lines.push(`### 运行模式：${result.mode}`);
  lines.push('');
  for (const c of result.cases) {
    lines.push(`#### ${c.id} ${c.topic}（期望 ${c.expectedKey} → 判定 ${c.detectedKey}｜模板 ${c.planName}）`);
    lines.push('');
    lines.push('| 方向 | # | 英文 | 中文 | 来源 |');
    lines.push('|---|---|---|---|---|');
    for (const [g, label] of [['respond', '自然接话'], ['ask', '继续追问'], ['share', '分享自己'], ['switch', '转换话题']]) {
      (c.groups[g] || []).forEach((it, i) => {
        lines.push(`| ${label} | ${i + 1} | ${escCell(it.en)} | ${escCell(it.zh)} | ${it.source} |`);
      });
    }
    lines.push('');
    lines.push(`指标：条数 ${JSON.stringify(c.counts)}；近似重复 ${c.nearDupPairs.length} 对；话题对焦 ${c.focusRatio}${c.anomaly ? '；含异常转写' : ''}`);
    if (c.nearDupPairs.length) {
      for (const p of c.nearDupPairs) lines.push(`- 近似重复（${p.kind}, J=${p.jaccard}）：${p.a} ⇄ ${p.b}`);
    }
    if (c.aiFirst) lines.push(`- AI 第一候选：${JSON.stringify(c.aiFirst)}`);
    lines.push('');
  }
  lines.push('### 汇总');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(result.summary, null, 2));
  lines.push('```');
  if (result.crossSwitchRepeats.length) {
    lines.push('');
    lines.push('跨组完全相同的 switch 句子：');
    for (const x of result.crossSwitchRepeats) lines.push(`- ${x.en}（${x.cases.join(', ')}）`);
  }
  if (result.firstPersonScan.length) {
    lines.push('');
    lines.push('第一人称扫描（非 allowed 项）：');
    for (const x of result.firstPersonScan) lines.push(`- [${x.verdict}] ${x.case}/${x.group}#${x.index}: ${x.en} —— ${x.reason}`);
  }
  if (result.privacyHits.length) {
    lines.push('');
    lines.push('隐私/人物误归属：');
    for (const x of result.privacyHits) lines.push(`- ${x.case}/${x.group}#${x.index}: ${x.en}`);
  }
  return lines.join('\n');
}

function escCell(s) {
  return String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function main() {
  const html = currentHtml();
  const out = {};
  if (flags.both) {
    out.baseline = evaluate(legacyHtml(), 'baseline');
    out.current = evaluate(html, 'current', flags.aiStub, flags.empty);
  } else if (flags.baseline) {
    out.baseline = evaluate(legacyHtml(), 'baseline');
  } else {
    out.current = evaluate(html, 'current', flags.aiStub, flags.empty);
  }

  if (flags.json) {
    const slim = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, {
      mode: v.mode,
      summary: v.summary,
      crossSwitchRepeats: v.crossSwitchRepeats,
      firstPersonScan: v.firstPersonScan,
      privacyHits: v.privacyHits,
      cases: v.cases.map((c) => ({
        id: c.id, expectedKey: c.expectedKey, detectedKey: c.detectedKey, planName: c.planName,
        counts: c.counts, nearDupPairs: c.nearDupPairs, focusRatio: c.focusRatio,
      })),
    }]));
    console.log(JSON.stringify(slim, null, 2));
    return;
  }

  if (flags.markdown) {
    for (const v of Object.values(out)) {
      console.log(markdown(v));
      console.log('\n---\n');
    }
    return;
  }

  for (const [k, v] of Object.entries(out)) console.log(`[${k}] ${JSON.stringify(v.summary)}`);
}

main();