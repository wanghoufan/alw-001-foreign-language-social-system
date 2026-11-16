#!/usr/bin/env node
/**
 * N08 复习卡策展（大模型把关版）
 *
 * 输入：一门课的本课总结 + 课程索引里的候选英文句
 * 输出：JSON 卡片数组（原句卡 + 简单泛化卡），并写一份可读 Markdown
 *
 * 用法：
 *   node scripts/n08-curate-cards.mjs --course 1-02 --course 2-17 --out docs/design/n08/pilot-2-lessons.md
 *   node scripts/n08-curate-cards.mjs --course 2-17 --dry-run
 *
 * 依赖：socialmate-prototype/ai-gateway/.env 里的 DEEPSEEK_API_KEY（只读，不打印）
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX = path.join(ROOT, 'socialmate-v1.2/source/n08-course-index.json');
const SRC = '/Volumes/三星/H-DL-OB笔记/003祖成英语90天陪练168节课程/3-场景实战课【105节】';
const ENV = path.join(ROOT, 'socialmate-prototype/ai-gateway/.env');
const API = 'https://api.deepseek.com/chat/completions';

function args(argv) {
  const o = { courses: [], out: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--course') o.courses.push(String(argv[++i]));
    else if (a === '--out') o.out = String(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error('未知参数 ' + a);
  }
  return o;
}

async function readKey() {
  const txt = await fs.readFile(ENV, 'utf8');
  const m = txt.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.+)$/m);
  if (!m) throw new Error('未找到 DEEPSEEK_API_KEY');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

function summaryOf(mdText) {
  const m = mdText.match(/##\s*本课总结\s*\n([\s\S]*?)(?=\n---|\n#{1,2}\s)/);
  if (!m) return '';
  return m[1].split('\n').map((l) => l.replace(/^\s*\d+[.、]\s*/, '').trim()).filter(Boolean).join('\n');
}

function cleanCandidates(items) {
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const t = String(it.text || '').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (!/[A-Za-z]/.test(t)) continue;
    const norm = t.toLowerCase().replace(/[.?!]+$/, '');
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push({ text: t, zhHint: it.zhHint || '', keywords: it.keywords || [], sourceLine: it.sourceLine || 0 });
  }
  return out;
}

function buildPrompt(course, summary, cands) {
  return `你是英语复习卡编辑，给中文母语的零基础学习者做口语复习卡。

课程：${course.courseId} ${course.title}（${course.chapter}）

【本课总结】
${summary}

【本课候选英文原句】（只能从这里面取原句，不许改写）
${cands.map((c, i) => `${i + 1}. ${c.text}${c.zhHint ? '（原文中文：' + c.zhHint + '）' : ''}`).join('\n')}

【任务】
挑 4–6 张卡，覆盖本课的句型骨架与场景词块，每张卡包含两部分：
- 原句（base）：中文提示 → 学习者说出的英文，必须与上面候选原句逐字一致。
- 泛化（generalize）：同一句型只替换 1 个词（如 enjoy reading books → enjoy running），
  必须简单、不超过 8 个词，中文提示要写出具体替换后的意思，答案不提前暴露。

【硬性要求】
1. 原句必须逐字来自候选列表；只允许补句末标点、首字母大写，其余一字不改。
2. 丢弃语法不成立、断句错、明显语音转写串词的句子。
3. 每张卡必须带 2–3 条泛化，泛化不是「换个单词」，而是**同骨架的句式变式**，必须覆盖至少 2 种不同类型：
   - person｜换人称：I enjoy reading → He enjoys reading（注意第三人称单数）
   - form｜换句式：陈述 ↔ 疑问（I am an only child → Are you an only child?）、肯定 ↔ 否定（I have siblings → I don't have any siblings）
   - object｜换对象/地点/物品：for my bag → for my bike；in China → in Canada
   - tense｜换时态（仅当原句简单且时态明确时用）：I went hiking → I will go hiking
   每条泛化只允许一处结构性变化（换人称、改句式、换对象其中之一），换完不超过 10 个词，保持零基础可答。
4. 泛化的中文提示必须写出替换后的具体意思（如「我喜欢打羽毛球」），不许出现答案英文。
5. 每题一模式：1=中文→英文词组；2=中文情境→英文完整句；3=中文整句→英文完整句。
6. 题干中文自足，不许出现「这个」「那样」这类指代。
7. 只输出 JSON 数组，不要代码块、不要解释。

每个对象格式：
{"courseId":"${course.courseId}","topic":"场景短语","mode":3,"base":{"promptZh":"中文提示","answerEn":"原句"},"generalize":[{"kind":"person","promptZh":"改成说他/她之后的中文提示","answerEn":"变式英文"},{"kind":"form","promptZh":"改成疑问句的中文提示","answerEn":"变式英文"},{"kind":"object","promptZh":"换掉对象后的中文提示","answerEn":"变式英文"}],"keywords":["骨架词组"],"sourceLine":22,"why":"为什么选它"}`;
}

async function qaCards(key, cards) {
  const rules = `你是英语教学编辑，负责给复习卡做质检。输入是一批卡片 JSON。
请逐条检查，只保留合格的，并把不合格的改好（改不了就删掉）：
1. 原句必须是完整、语法正确的英文，逐字可用；不是语音转写碎片。
2. 泛化必须与它标注的 kind 相符：
   - person＝只换主语（并保证三单正确）；
   - form＝只改句式（陈述↔疑问、肯定↔否定），不是换同义词；
   - object＝只换宾语/地点/物品；
   - tense＝只改时态。
3. 泛化语义必须通顺、日常可用；像「他真的很冷」这种把天气句硬套到人身上的，删除。
4. 泛化不超过 10 个词，零基础能答。
5. 每张卡至少保留 2 条泛化；不足就从同骨架另造，造不出就删卡。
只输出修正后的 JSON 数组，字段结构不变，不要解释。`;
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.1,
      messages: [
        { role: 'system', content: '你是严格的英语教学质检，只输出合法 JSON 数组。' },
        { role: 'user', content: rules + '\n\n输入：\n' + JSON.stringify(cards) },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('QA ' + r.status);
  const text = d.choices && d.choices[0] ? d.choices[0].message.content : '';
  const a = text.indexOf('['), b = text.lastIndexOf(']');
  if (a < 0 || b < a) return cards;
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { return cards; }
}

async function callDeepSeek(key, prompt) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你是严谨的英语教学编辑，只输出合法 JSON 数组。' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('DeepSeek ' + r.status + ' ' + (d.error && d.error.message ? d.error.message : ''));
  const text = d.choices && d.choices[0] && d.choices[0].message ? d.choices[0].message.content : '';
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end < start) throw new Error('模型没有返回 JSON 数组：' + text.slice(0, 120));
  return JSON.parse(text.slice(start, end + 1));
}

function render(courses, outPath) {
  const lines = [
    '# N08 复习卡试点（大模型策展 · 2 课）',
    '',
    '> 由 `scripts/n08-curate-cards.mjs` 调用 DeepSeek 生成；原句逐字取自课程原文，泛化只换一个词。',
    '',
  ];
  for (const c of courses) {
    lines.push(`## ${c.courseId} 《${c.title}》（${c.chapter}）`, '');
    lines.push('| # | 模式 | 中文提示（原句） | 原句 | 泛化：中文提示 → 英文 |', '|---|---|---|---|---|');
    c.cards.forEach((card, i) => {
      const g = (card.generalize || []).map((x) => `[${x.kind || '—'}] ${x.promptZh} → ${x.answerEn}`).join('<br>');
      lines.push(`| ${i + 1} | ${card.mode} | ${card.base.promptZh} | ${card.base.answerEn} | ${g || '—'} |`);
    });
    lines.push('');
  }
  lines.push('## 示例周包（原句 + 泛化，两段式）', '');
  const demo = [];
  for (const c of courses) for (const card of c.cards.slice(0, 2)) demo.push({ c, card });
  demo.slice(0, 4).forEach(({ card }, i) => {
    lines.push(`**${i + 1}. 模式${card.mode}｜先说课本原句**`);
    lines.push(`中文：${card.base.promptZh}  `);
    lines.push(`答案：${card.base.answerEn}`, '');
    (card.generalize || []).slice(0, 1).forEach((g, j) => {
      lines.push(`**${i + 1}.${j + 1} 换成我自己的情况**`);
      lines.push(`中文：${g.promptZh}  `);
      lines.push(`答案：${g.answerEn}`, '');
    });
  });
  return lines.join('\n');
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.help) { console.log('node scripts/n08-curate-cards.mjs --course 1-02 --course 2-17 [--out file] [--dry-run]'); return 0; }
  if (!o.courses.length) throw new Error('至少给一个 --course <id>');
  const idx = JSON.parse(await fs.readFile(INDEX, 'utf8'));
  const key = await readKey();
  const results = [];
  for (const id of o.courses) {
    const course = idx.courses.find((c) => c.courseId === id);
    if (!course) throw new Error('索引里没有 ' + id);
    const md = await fs.readFile(path.join(SRC, course.file), 'utf8');
    const summary = summaryOf(md);
    const cands = cleanCandidates(course.items).slice(0, 30);
    const prompt = buildPrompt(course, summary, cands);
    if (o.dryRun) { console.log(prompt); continue; }
    const cards = (await callDeepSeek(key, prompt)).map((card) => {
      const fix = (o) => {
        if (!o || !o.answerEn) return o;
        if (/[？?]\s*$/.test(String(o.promptZh || '')) && !/[?？]\s*$/.test(o.answerEn)) o.answerEn = o.answerEn.trim() + '?';
        return o;
      };
      card.base = fix(card.base);
      card.generalize = (card.generalize || []).map(fix);
      return card;
    });
    const checked = await qaCards(key, cards);
    results.push({ courseId: course.courseId, title: course.title, chapter: course.chapter, cards: checked });
    console.log(`✔ ${id} ${course.title} → 生成 ${cards.length} 张，质检后 ${checked.length} 张`);
  }
  if (o.dryRun) return 0;
  if (o.out) {
    await fs.mkdir(path.dirname(path.resolve(o.out)), { recursive: true });
    await fs.writeFile(path.resolve(o.out), render(results) + '\n', 'utf8');
    console.log('写出：' + path.resolve(o.out));
  }
  const jsonOut = path.resolve(o.out || 'docs/design/n08/pilot-2-lessons.md').replace(/\.md$/, '.json');
  await fs.writeFile(jsonOut, JSON.stringify(results, null, 2) + '\n', 'utf8');
  console.log('JSON：' + jsonOut);
  console.log(JSON.stringify(results, null, 2));
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('失败：' + (e && e.message ? e.message : e)); process.exit(2); });
