#!/usr/bin/env node
/**
 * N08 周包草稿生成（自动化 A2 的入口，也可手工跑）
 *
 * 数据来源：手机本地 SQLite 的 meta 表 n08.state（只读），
 *           或 --state <json> 指定的本地快照。
 * 输出：docs/qa/n08-weekly/n08-pack-YYYYMMDD.md，含题库、参考答案与可直接复制的教练提示词。
 *
 * 用法：
 *   node scripts/n08-weekly-pack.mjs                 # 从 adb 读，尺寸 10
 *   node scripts/n08-weekly-pack.mjs --size 5
 *   node scripts/n08-weekly-pack.mjs --serial 3B15CW00KND00000
 *   node scripts/n08-weekly-pack.mjs --state /tmp/n08-state.json --size 15
 *   node scripts/n08-weekly-pack.mjs --dry-run       # 只打印，不写文件
 *
 * 退出码：0 成功 / 3 取不到数据 / 2 参数或环境错误
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const W = require('../socialmate-v1.2/source/n08-weekly.js');

const PKG = 'app.socialmate.dualmic';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUTDIR = path.join(ROOT, 'docs/qa/n08-weekly');

function parseArgs(argv) {
  const o = { size: 10, serial: '', state: '', out: '', dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--size') o.size = Number(argv[++i]);
    else if (a === '--serial') o.serial = String(argv[++i] || '');
    else if (a === '--state') o.state = String(argv[++i] || '');
    else if (a === '--out') o.out = String(argv[++i] || '');
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (![5, 10, 15].includes(o.size)) throw new Error('--size 只允许 5 / 10 / 15');
  return o;
}

function adb(serial, args, opts = {}) {
  const base = serial ? ['-s', serial] : [];
  return execFileSync('adb', [...base, ...args], { encoding: opts.bin ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function readStateFromDevice(serial) {
  const devices = adb(serial, ['devices']).split('\n').slice(1).filter((l) => /\tdevice$/.test(l));
  if (!devices.length) throw new Error('没有在线设备（adb devices 为空）');
  const tmp = path.join(ROOT, '.local', `n08-state-${process.pid}.db`);
  const dbBytes = adb(serial, ['exec-out', 'run-as', PKG, 'cat', 'databases/socialmate_local.db'], { bin: true });
  if (!dbBytes || dbBytes.length < 1024) throw new Error('读不到本地库（run-as 被拒或库为空）');
  return fs.mkdir(path.dirname(tmp), { recursive: true }).then(async () => {
    await fs.writeFile(tmp, dbBytes);
    try {
      const raw = execFileSync('sqlite3', [tmp, "SELECT v FROM meta WHERE k='n08.state'"], { encoding: 'utf8' }).trim();
      if (!raw) throw new Error("meta 表里没有 n08.state（这台设备还没用过表达页）");
      return JSON.parse(raw);
    } finally {
      await fs.rm(tmp, { force: true });
    }
  });
}

function coachPrompt(pack) {
  const qs = pack.questions || [];
  const ask = qs.map((q) => `${q.id} | 模式${q.mode} | ${q.promptZh}`).join('\n');
  const key = qs.map((q) => `${q.id} | ${q.answerEn || ''}${q.refZh ? ` | 参考中文：${q.refZh}` : ''}`).join('\n');
  // 与页面 n08PackPrompt 同源：改这里必须同批改 socialmate-v1.2/index.html 的同名函数
  return `你是我的英语口语教练。一次只问一题，只用下面的题库，不要加题、改题或加难度。
提问顺序按题号，每题先用中文提问；我口头用英文回答。

【评分标准】
- 模式1（中文→英文词组）：说对目标词组即「独立答对」；给了中文提示才说对记「提示后答对」。
- 模式2（中文情境→英文完整句）：只要意思覆盖情境、语法基本正确、口语自然就算对，接受多种自然说法，不要求和参考答案逐字一致。
- 模式3（中文整句→英文完整句）：看意思是否覆盖、语法、自然度，同样接受多种自然表达。

【纪律】
- 参考答案只在评分时使用，提问前不要朗读、不要透露、不要给英文首词。
- 我说「提示」才给中文情境或英文首词；说「不会」就直接给答案并带我读一遍；说「暂停」「继续」「重考错题」按我说的做。

【过程中不要做的事】
- 不要逐题报结果，全程不要出现「独立答对」「提示后答对」「不会」这些字样，也不要说「这题对了」「满分」「不错」。
- 我答对了就直接问下一题，最多回一个字「好」；不要复述我的答案、不要夸我、不要点评发音或用词。
- 只有我答错、或用过提示时，才用一句话给我更自然的说法，然后继续下一题，仍然不要贴结果标签。

【题库】
${ask}

【参考答案（仅供你评分，不要提前朗读）】
${key}

【最后必须输出的回填块】（最重要，请严格照做）
全部问完后，先用一句话总结我的错题，然后单独输出一个代码块。
代码块里只允许下面这种行，一行一题，题号顺序不变，不要写解释、不要编号、不要加括号或表情：

${qs.map((q) => `${q.id} | 待填`).join('\n')}

规则：
- 每行三部分：题号、竖线、结果；竖线两侧各一个空格。
- 结果只能是：独立答对 / 提示后答对 / 不会。
- 上面写「待填」的地方必须换成三档之一，不许原样保留。
- 这个代码块会被整段复制回学习软件做统计，格式错一行就会被打回。`;
}

function itemsFromState(state) {
  const list = Array.isArray(state.items) ? state.items : [];
  const prio = (state.state && state.state.items) || {};
  return list.map((x) => {
    const p = prio[x.id] || prio[x.key] || {};
    return {
      key: x.id,
      zh: x.zh,
      en: x.en,
      phraseZh: x.phraseZh,
      phraseEn: x.phraseEn,
      courseId: x.courseId,
      recordId: x.id,
      weight: p.priority ? Math.max(1, Math.round(p.priority / 20)) : (x.fav ? 3 : 1),
    };
  });
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log('node scripts/n08-weekly-pack.mjs [--size 5|10|15] [--serial S] [--state file] [--out file] [--dry-run]');
    return 0;
  }
  const state = o.state ? JSON.parse(await fs.readFile(o.state, 'utf8')) : await readStateFromDevice(o.serial);
  const items = itemsFromState(state).filter((x) => x.zh && x.en);
  if (items.length < o.size) {
    console.error(`知识点不足：只有 ${items.length} 条，需要 ${o.size} 条。先去表达页多说多查几句。`);
    return 3;
  }
  const pack = W.buildWeeklyPack({ items, size: o.size, seed: 'weekly', now: new Date() });
  const day = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}`;
  const out = o.out || path.join(OUTDIR, `n08-pack-${stamp}.md`);
  const md = [
    `# N08 周包草稿 · ${stamp}`,
    '',
    `- 题库：\`${pack.packId}\``,
    `- 题数：${pack.questions.length}（模式分布 ${JSON.stringify(pack.questions.reduce((a, q) => (a['m' + q.mode] = (a['m' + q.mode] || 0) + 1, a), {}))}）`,
    `- 数据来源：${o.state ? `快照 ${o.state}` : '设备 SQLite meta.n08.state（只读）'}`,
    `- 知识点：${items.length} 条候选`,
    '',
    '## 教练提示词（整段复制给 GPT / 豆包）',
    '',
    '```text',
    coachPrompt(pack),
    '```',
    '',
    '## 回填',
    '',
    '训练结束后把教练输出的代码块整段粘回 App「表达 → 本周巩固 → 回填成绩」。',
  ].join('\n');
  if (o.dryRun) {
    console.log(md);
    return 0;
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, md + '\n', 'utf8');
  console.log(JSON.stringify({ ok: true, pack: pack.packId, questions: pack.questions.length, out }));
  return 0;
}

main().then((c) => process.exit(c)).catch((e) => {
  console.error('失败：' + (e && e.message ? e.message : e));
  process.exit(e && /知识点不足|没有在线设备|读不到|没有 n08/.test(e.message || '') ? 3 : 2);
});
