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
3. 每张卡必须带 1–2 条泛化，泛化的目的是「把课本句换成我自己的情况」，做法固定：
   - 优先换动词宾语/活动：enjoy reading books → enjoy running / enjoy swimming；
   - 其次换物品、地点、人：for my backpack → for my bike；in China → in Canada；
   - 每次只换 1 个成分，换完仍不超过 8 个词。
4. 泛化的中文提示必须写出替换后的具体意思（如「我喜欢打羽毛球」），不许出现答案英文。
5. 每题一模式：1=中文→英文词组；2=中文情境→英文完整句；3=中文整句→英文完整句。
6. 题干中文自足，不许出现「这个」「那样」这类指代。
7. 只输出 JSON 数组，不要代码块、不要解释。

每个对象格式：
{"courseId":"${course.courseId}","topic":"场景短语","mode":3,"base":{"promptZh":"中文提示","answerEn":"原句"},"generalize":[{"promptZh":"换成我自己的情况后的中文提示","answerEn":"替换后的英文","swap":"换了哪个词"}],"keywords":["骨架词组"],"sourceLine":22,"why":"为什么选它"}`;
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
      const g = (card.generalize || []).map((x) => `${x.promptZh} → ${x.answerEn}`).join('<br>');
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
    results.push({ courseId: course.courseId, title: course.title, chapter: course.chapter, cards });
    console.log(`✔ ${id} ${course.title} → ${cards.length} 张卡`);
  }
  if (o.dryRun) return 0;
  if (o.out) {
    await fs.mkdir(path.dirname(path.resolve(o.out)), { recursive: true });
    await fs.writeFile(path.resolve(o.out), render(results) + '\n', 'utf8');
    console.log('写出：' + path.resolve(o.out));
  }
  console.log(JSON.stringify(results, null, 2));
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('失败：' + (e && e.message ? e.message : e)); process.exit(2); });
