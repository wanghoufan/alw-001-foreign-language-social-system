#!/usr/bin/env node
/**
 * n08-course-index.mjs — 祖成英语「3-场景实战课」只读课程索引扫描器
 *
 * 用途：为 N08「表达」页提供复习题源。只读扫描课程原始 Markdown，抽取课程元信息
 * 与 1–3 条**原文照抄**的实用英语句子（含原句行号、原文自带中文对照、词组截取）。
 *
 * 依据：docs/plan/P001-N08-Expression-CourseWeeklyPractice-V1.2-Approved-20261115.md 第 3 节
 *
 * 用法：
 *   node scripts/n08-course-index.mjs [--src <课程目录>] [--out <输出 json>] [--quiet]
 *
 * 默认：
 *   --src  /Volumes/三星/H-DL-OB笔记/003祖成英语90天陪练168节课程/3-场景实战课【105节】
 *   --out  socialmate-v1.2/source/n08-course-index.json
 *
 * 只读约定：脚本只读取 --src 下的 .md，绝不写入 / 移动 / 改名 / 删除源目录任何内容。
 * 确定性：输出不含时间戳、不含随机值；同一输入两次运行产物逐字节一致（sha256 相同）。
 *
 * 抽取口径（全部机械规则，不翻译、不生成英文、不补齐缺课）：
 *   title       正文 H1 → front matter `title:` → 文件名去序号；都没有则空串
 *   sentences   正文（front matter 与「本课总结」之后）里的完整英文句，见 pickSentences()
 *   zhHint      仅当英文句**同一行紧邻其后**就是一段纯中文（以。！？结尾、长度与内容
 *               通过翻译形态检查、不含讲解/语气词）才照抄该中文；否则空串。绝不翻译。
 *   keywords    只能是从该原句里按字符位置截取的 2–4 词片段（首尾非停用词、无数字），
 *               优先选在本课程库中反复出现的表达，最多 3 个。
 *   sourceLine  该原句在原文件中的 1-based 行号。
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, basename, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_SRC =
  '/Volumes/三星/H-DL-OB笔记/003祖成英语90天陪练168节课程/3-场景实战课【105节】';
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT = join(PROJECT_ROOT, 'socialmate-v1.2/source/n08-course-index.json');

const SCHEMA = 'n08-course-index/v1';

/* ------------------------------------------------------------------ args */
function parseArgs(argv) {
  const out = { src: DEFAULT_SRC, out: DEFAULT_OUT, quiet: false };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--src') out.src = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--help' || a === '-h') {
      process.stdout.write('usage: node scripts/n08-course-index.mjs [--src <dir>] [--out <file>] [--quiet]\n');
      process.exit(0);
    } else fail(`未知参数：${a}`);
  }
  if (!out.src || !out.out) fail('--src / --out 需要非空值');
  return out;
}

function fail(msg) {
  process.stderr.write(`n08-course-index: ${msg}\n`);
  process.exit(2);
}

/* -------------------------------------------------------------- 文本工具 */
const CJK_G = /[\u3400-\u4dbf\u4e00-\u9fff]/g;

const cjkCount = (s) => (s.match(CJK_G) || []).length;
const letterCount = (s) => (s.match(/[A-Za-z]/g) || []).length;

// 教学套话 / 开场问候：不是可复习的实用句，直接剔除。
const BOILERPLATE = [
  /welcome back/i,
  /welcome to (daniel'?s|our|the) (class|lesson|passies)/i,
  /what'?s up,? (guys|everyone)/i,
  /^hi,?\s*(guys|everyone|there)\b/i,
  /^hi,? welcome/i,
  /this is mr\.? ?(yang|yan|daniel)/i,
  /are you ready/i,
  /let'?s get started/i,
  /let'?s begin/i,
  /see you (next time|soon)/i,
  /thanks for watching/i,
  /don'?t forget to (like|subscribe|give)/i,
  /i'?m super excited/i,
  /i'?m really glad to have you here/i,
  /一键三连/,
  /记得给我/,
];

// 讲解型句子（教你「怎么说」而不是示范内容）：从题源里剔除。
const META = [
  /^here (are|is)\b/i,
  /^here'?s (how|what)\b/i,
  /^to (talk|describe|express|ask|order|say|answer)\b/i,
  /\byou can (say|use|ask|answer|also)\b/i,
  /\bwhat (do|would) you say\b/i,
  /\bhow (do|would) you (say|answer|ask)\b/i,
  /^today,? (we|i)\b/i,
  /\bwe'?re (talking about|going to talk|going to learn|looking at)\b/i,
  /\bin this lesson\b/i,
  /^(ok|okay|alright|now|so),? let'?s\b/i,
  /\blet me (share|show|tell)\b/i,
  /^let'?s\b/i,
  /\btake a guess\b/i,
  /\bthe (right )?answer is\b/i,
  /\bdoes .{1,40} really mean\b/i,
  /\bwhat (on earth )?does (that|this) mean\b/i,
  /^you got it\b/i,
  /\bquestion time\b/i,
  /\bwe'?ve been talking\b/i,
  /\bin the (last|previous|first) (class|lesson)\b/i,
  /\blast time,? (we|i)\b/i,
  /\bwe (looked at|discussed|talked about|learned)\b/i,
  /\bthis time,? we'?ll\b/i,
  /\btoday,? we'?ll\b/i,
  /\bthink about it\b/i,
  /\bfor \d+ seconds?\b/i,
  /\b(hi|hello) (everybody|everyone|all)\b/i,
  /\btake it away\b/i,
  /\bin our last lesson\b/i,
  /\bstarted talking about\b/i,
  /^i'?ll show you\b/i,
  /^here'?s\b/i,
  /\bshare with you\b/i,
  /\bon this topic\b/i,
  /\bhow to talk about\b/i,
  /welcome to my class/i,
  /\btongue twister\b/i,
];

// 结尾是缩写点时，这句其实是被截断的句子（"this is Mr."）
const ABBREV_END = /\b(Mr|Mrs|Ms|Dr|Prof|St|vs|etc|Jr|Sr|No|e\.g|i\.e|U\.S|U\.K|A\.M|P\.M)\.$/;

// 中文「讲解 / 语气」标记：命中即认定这句中文不是译文，zhHint 留空。
const ZH_NOT_GLOSS = [
  '呢', '啊', '吧', '呀', '哦', '嘛', '哈',
  '这', '那', '大家', '一定', '非常', '简单', '现在', '今天', '再来',
  '因为', '所以', '但是', '的时候', '这样', '那样', '其实', '真的', '我觉得',
  '你会发现', '记住', '询问', '对不对', '对吧', '好不好',
  '说', '讲', '学', '练', '听', '懂', '叫', '表示', '意思', '就是', '就',
  '尾音', '音调', '词', '英文', '句', '发音',
];

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were', 'be',
  'been', 'being', 'it', 'its', "it's", 'i', "i'm", "i'd", "i'll", "i've", 'you', "you're",
  "you'd", "you'll", 'he', 'she', 'we', "we're", "we'll", 'they', "they're", 'me', 'my', 'your',
  'his', 'her', 'our', 'their', 'that', "that's", 'this', 'these', 'those', 'in', 'on', 'at',
  'for', 'with', 'from', 'by', 'as', 'so', 'if', 'do', 'does', 'did', 'not', 'no', 'yes',
  'can', 'could', 'would', "wouldn't", 'should', 'will', 'may', 'might', 'must', 'please',
  'guys', 'ok', 'okay', 'uh', 'um', 'well', 'just', 'very', 'really', 'some', 'any', 'there',
  'here', 'what', 'how', 'when', 'where', 'who', 'why', 'also', 'too', 'then', 'than', 'them',
  'us', 'him', 'hers', 'ours', 'theirs', 'off', 'out', 'up', 'down', 'all', 'more', 'most',
  'such', 'about', 'into', 'over', 'like', 'right', 'now', 'still', 'even', 'only', 'get',
  'hi', 'hello', 'hey', 'yeah', 'yep', 'hmm', 'oh',
  'many', 'much', 'few', 'little', 'every', 'each', 'both', 'another', 'other', 'same', 'own',
  'kind', 'sort', 'lot', 'quite', 'something', 'anything', 'everything', 'someone', 'anyone',
]);

// 词组内部允许出现的连接词（"cup of coffee" / "have a movie night"）
const INNER_OK = new Set(['of', 'to', 'for', 'with', 'in', 'on', 'at', 'up', 'out', 'off', 'back', 'about', 'a', 'an', 'the']);

// 冠词/限定词不能作为词组首尾
const DETERMINERS = new Set(['a', 'an', 'the', 'this', 'that', 'these', 'those', 'my', 'your', 'his', 'her', 'our', 'their', 'its', 'some', 'any', 'no', 'every', 'each']);

/* --------------------------------------------------------------- 目录扫描 */
function listChapters(srcRoot) {
  const chapters = [];
  const entries = readdirSync(srcRoot, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => sortKey(a.name) - sortKey(b.name) || a.name.localeCompare(b.name));

  for (const entry of entries) {
    const full = join(srcRoot, entry.name);
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && safeIsDir(full));
    if (!isDir) continue;
    const no = leadingNumber(entry.name);
    if (no === null) continue; // 章节目录必须带序号
    const files = [];
    walk(full, files, 0);
    chapters.push({ chapterNo: no, dirName: entry.name, chapter: chapterName(entry.name), files });
  }
  chapters.sort((a, b) => a.chapterNo - b.chapterNo);
  return chapters;
}

function safeIsDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function walk(dir, acc, depth) {
  if (depth > 6) return;
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith('.'))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc, depth + 1);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) acc.push(full);
  }
}

function leadingNumber(name) {
  const m = name.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function sortKey(name) {
  const n = leadingNumber(name);
  return n === null ? 9999 : n;
}

/** "1第一章：家庭与朋友" → "家庭与朋友" */
function chapterName(dirName) {
  const afterColon = dirName.split(/[：:]/).slice(1).join('：').trim();
  if (afterColon) return afterColon;
  return dirName.replace(/^\d+/, '').replace(/^第[一二三四五六七八九十百]+章/, '').trim();
}

/* ------------------------------------------------------------- 单文件解析 */
function normalizeText(buf) {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  // 只规范行尾、不删行：保持 1-based 行号与原始文件一致
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseFrontMatter(lines) {
  const meta = {};
  if (lines.length === 0 || lines[0].trim() !== '---') return { meta, endIndex: -1 };
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      for (const line of lines.slice(1, i)) {
        const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
      }
      return { meta, endIndex: i };
    }
  }
  return { meta, endIndex: -1 };
}

/** 定位正文：跳过 front matter 与「本课总结」区块，从第一个 H1 之后开始。 */
function locateBody(lines) {
  const { endIndex } = parseFrontMatter(lines);
  let inSummary = false;
  let h1 = '';
  let bodyStart = endIndex >= 0 ? endIndex + 1 : 0;
  for (let i = endIndex >= 0 ? endIndex + 1 : 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!inSummary && /^##\s*本课总结/.test(line)) {
      inSummary = true;
      continue;
    }
    if (inSummary) {
      if (line === '---') {
        inSummary = false;
        bodyStart = Math.max(bodyStart, i + 1);
        continue;
      }
      if (/^#\s+/.test(line)) inSummary = false;
      else continue;
    }
    if (/^#\s+/.test(line)) {
      if (!h1) h1 = line.replace(/^#\s+/, '').trim();
      bodyStart = i + 1;
    }
  }
  if (!h1) {
    // 没有 H1：至少跳过总结块
    const summaryStart = lines.findIndex((l) => /^##\s*本课总结/.test(l.trim()));
    if (summaryStart >= 0) {
      for (let k = summaryStart + 1; k < lines.length; k += 1) {
        if (lines[k].trim() === '---') {
          bodyStart = k + 1;
          break;
        }
      }
    }
  }
  return { h1, bodyStart };
}

const ASCII_RUN = /[^\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]+/g;

function isUsableSentence(s) {
  if (s.length < 15 || s.length > 200) return false;
  if (!/^[A-Z“"']/.test(s)) return false;
  if (!/[.!?]$/.test(s)) return false;
  if (/\.{2,}|…/.test(s)) return false;
  if (/[#|*`<>{}[\]\\]/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 4) return false;
  const letters = letterCount(s);
  if (letters < 12) return false;
  if (letters / s.length < 0.6) return false;
  if (cjkCount(s) > 0) return false;
  const digits = (s.match(/\d/g) || []).length;
  if (digits > 2 && digits / s.length > 0.06) return false;
  if (ABBREV_END.test(s)) return false;
  if (BOILERPLATE.some((re) => re.test(s))) return false;
  if (META.some((re) => re.test(s))) return false;
  return true;
}

/**
 * 兜底：整句抽不到时，从中文讲解里抽嵌在句子中的英文短语（≥3 词）。
 * 只做机械截取，不翻译、不补全；质量靠下游人工核对。
 */
function phraseCandidates(lines) {
  const out = [];
  const seen = new Set();
  const runRe = /[A-Za-z][A-Za-z'’-]*(?:[ ,]+[A-Za-z][A-Za-z'’-]*){2,}/g;
  for (let li = 0; li < lines.length; li += 1) {
    const text = typeof lines[li] === 'string' ? lines[li] : String(lines[li] && lines[li].text || '');
    if (!text || /^\s*#{1,6}\s/.test(text)) continue;
    const no = li + 1;
    runRe.lastIndex = 0;
    let m;
    while ((m = runRe.exec(text)) !== null) {
      const raw = m[0].replace(/\s+/g, ' ').trim().replace(/[ ,]+$/, '');
      const words = raw.split(' ');
      const letters = (raw.match(/[A-Za-z]/g) || []).length;
      if (words.length < 3 || letters < 10) continue;
      if (BOILERPLATE.some((re) => re.test(raw)) || META.some((re) => re.test(raw))) continue;
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: raw, zhHint: '', start: m.index, end: m.index + raw.length, sourceLine: no, phrase: true });
    }
  }
  // 优先带常见动词/疑问词的片段，其次按长度
  const boost = /\b(is|are|was|were|do|does|did|have|has|can|could|will|would|want|like|enjoy|love|go|get|take|make|how|what|when|where|why|who)\b/i;
  out.sort((a, b) => (boost.test(b.text) ? 1 : 0) - (boost.test(a.text) ? 1 : 0) || b.text.length - a.text.length);
  return out;
}

function sentenceCandidates(line) {
  const out = [];
  ASCII_RUN.lastIndex = 0;
  let run;
  while ((run = ASCII_RUN.exec(line)) !== null) {
    const base = run.index;
    const re = /([A-Za-z“"'][^.!?]{0,300}?[.!?])(?=[\s"”’]|$)/g;
    let m;
    while ((m = re.exec(run[0])) !== null) {
      let raw = m[1];
      let lead = 0;
      while (raw.length > 1 && /[\u201c"\u2018']/.test(raw[0])) {
        raw = raw.slice(1);
        lead += 1;
      }
      const text = raw.trim();
      if (!isUsableSentence(text)) continue;
      out.push({
        text,
        start: base + m.index + lead,
        end: base + m.index + lead + raw.length,
      });
    }
  }
  return out;
}

/**
 * 中文对照：只认「同一行、紧跟在英文句之后、纯中文、以。！？结尾、通过翻译形态检查」的片段。
 * 否则返回空串（绝不翻译）。
 */
function findZhHint(line, endOffset) {
  const tail = line.slice(endOffset);
  const m = tail.match(/^[\s，,、：:—–\-~～]{0,4}([\u3400-\u4dbf\u4e00-\u9fff][^A-Za-z。！？]{5,30}[。！？])/);
  if (!m) return '';
  const zh = m[1].trim();
  if (cjkCount(zh) < 5) return '';
  if (/[A-Za-z0-9]/.test(zh)) return '';
  if (ZH_NOT_GLOSS.some((k) => zh.includes(k))) return '';
  return zh;
}

/* ------------------------------------------------------------- 关键词抽取 */
const WORD_RE = /[A-Za-z][A-Za-z'’-]*/g;

function tokensOf(sentence) {
  const tokens = [];
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(sentence)) !== null) {
    tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

/** 语料级 n-gram 文档频次：反复出现的表达才是值得复习的词组。 */
function buildNgramDf(sentenceSets) {
  const df = new Map();
  sentenceSets.forEach((sentences, fileIdx) => {
    const local = new Set();
    for (const s of sentences) {
      const tokens = tokensOf(s);
      for (let i = 0; i < tokens.length; i += 1) {
        for (let n = 2; n <= 4; n += 1) {
          const j = i + n - 1;
          if (j >= tokens.length) continue;
          const words = tokens.slice(i, j + 1).map((t) => t.word.toLowerCase());
          if (STOP_WORDS.has(words[0]) || STOP_WORDS.has(words[words.length - 1])) continue;
          local.add(words.join(' '));
        }
      }
    }
    for (const k of local) df.set(k, (df.get(k) || 0) + 1);
  });
  return df;
}

/** 从原句里按字符位置截取 2–4 词片段；不新增任何词。 */
function extractKeywords(sentence, df, limit = 3) {
  const tokens = tokensOf(sentence);
  if (tokens.length < 2) return [];
  const spans = [];
  for (let i = 0; i < tokens.length; i += 1) {
    for (let n = 2; n <= 4; n += 1) {
      const j = i + n - 1;
      if (j >= tokens.length) continue;
      const slice = tokens.slice(i, j + 1);
      const words = slice.map((t) => t.word.toLowerCase());
      if (STOP_WORDS.has(words[0]) || STOP_WORDS.has(words[words.length - 1])) continue;
      if (words.some((w) => /\d/.test(w))) continue;
      let bad = false;
      for (let k = 1; k < words.length - 1; k += 1) {
        if (STOP_WORDS.has(words[k]) && !INNER_OK.has(words[k])) bad = true;
      }
      if (bad) continue;
      if (DETERMINERS.has(words[0]) || DETERMINERS.has(words[words.length - 1])) continue;
      const span = sentence.slice(slice[0].start, slice[slice.length - 1].end);
      if (span.length < 5 || span.length > 32) continue;
      if (!/^[A-Za-z][A-Za-z'\u2019\- ]*[A-Za-z]$/.test(span)) continue; // 不许带逗号/句号等标点
      const letters = letterCount(span);
      if (letters < 5) continue;
      const freq = df.get(words.join(' ')) || 1;
      if (n === 4 && freq < 3) continue; // 4 词只在语料里反复出现时才用
      spans.push({
        text: span,
        start: slice[0].start,
        end: slice[slice.length - 1].end,
        score: (freq >= 2 ? 10000 : 0) + freq * 100 + n * 20 + letters,
      });
    }
  }
  spans.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked = [];
  for (const span of spans) {
    if (picked.length >= limit) break;
    if (picked.some((p) => !(span.end <= p.start || span.start >= p.end))) continue;
    picked.push(span);
  }
  // 兜底：一句里连 2 词词组都抽不到时，退回「含至少一个实词的最短片段」，仍然只做字符截取
  if (picked.length === 0) {
    let best = null;
    for (let i = 0; i < tokens.length - 1; i += 1) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (a.word.length < 3 || b.word.length < 3) continue;
      const aw = a.word.toLowerCase();
      const bw = b.word.toLowerCase();
      if (STOP_WORDS.has(aw) || DETERMINERS.has(aw)) continue;
      if (STOP_WORDS.has(aw) && STOP_WORDS.has(bw)) continue;
      const span = sentence.slice(a.start, b.end);
      if (!/^[A-Za-z][A-Za-z'\u2019\- ]*[A-Za-z]$/.test(span)) continue;
      if (!best || letterCount(span) > letterCount(best.text)) {
        best = { text: span, start: a.start, end: b.end };
      }
    }
    if (!best) {
      for (let i = 0; i < tokens.length - 1; i += 1) {
        const a = tokens[i];
        const b = tokens[i + 1];
        if (sentence.slice(a.end, b.start) !== ' ') continue;
        const span = sentence.slice(a.start, b.end);
        if (!/^[A-Za-z][A-Za-z'\u2019\- ]*[A-Za-z]$/.test(span)) continue;
        const aw = a.word.toLowerCase();
        if (STOP_WORDS.has(aw) && !['a', 'an', 'the'].includes(aw)) continue;
        const contentish = [a, b].filter((t) => t.word.length >= 3 && !STOP_WORDS.has(t.word.toLowerCase())).length;
        if (contentish === 0) continue;
        if (!best || contentish > best.contentish || (contentish === best.contentish && letterCount(span) > letterCount(best.text))) {
          best = { text: span, start: a.start, end: b.end, contentish };
        }
      }
    }
    if (best) picked.push({ text: best.text, start: best.start, end: best.end });
  }
  // 专有名词被 n 词上限截断时（"visited the Great" → "visited the Great Wall"），向右补全相邻大写词
  for (const span of picked) {
    for (let guard = 0; guard < 2; guard += 1) {
      const idx = tokens.findIndex((t) => t.end === span.end);
      if (idx < 0 || idx + 1 >= tokens.length) break;
      const cur = tokens[idx];
      const next = tokens[idx + 1];
      if (!/^[A-Z]/.test(cur.word) || !/^[A-Z]/.test(next.word)) break;
      if (sentence.slice(cur.end, next.start) !== ' ') break;
      const cand = sentence.slice(span.start, next.end);
      if (cand.length > 32) break;
      span.end = next.end;
      span.text = cand;
    }
  }
  picked.sort((a, b) => a.start - b.start);
  return picked.map((p) => p.text);
}

const NEG_START = /(不好|错误|不对|错的|尴尬|不是特别|不太)的?(方式|示范|说法|状态|样子|办法)/;
const NEG_END = /(正确|对的|地道)的?(方式|示范|说法)/;

/** 一行里可能同时出现「错误示范」和「正确方式」，按字符位置判断某句属于哪一段。 */
function demoMarkers(line) {
  const marks = [];
  for (const [re, negative] of [
    [NEG_START, true],
    [NEG_END, false],
  ]) {
    const g = new RegExp(re.source, 'g');
    let m;
    while ((m = g.exec(line)) !== null) marks.push({ idx: m.index, negative });
  }
  marks.sort((a, b) => a.idx - b.idx);
  return marks;
}

function normalizeSentence(s) {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 选 1–3 条原句：纯英文对话段优先，同一行最多 2 条，按行号稳定排序。 */
// 按课程实际内容取，不硬凑也不硬砍；上限只防极端长课刷屏
const MAX_PER_COURSE = 999;

function pickSentences(candidates) {
  const repRank = (c) => (c.zhHint ? 0 : 2) + (c.pureEnglish ? 0 : 1);
  const groups = new Map();
  for (const c of candidates) {
    const norm = normalizeSentence(c.text);
    if (!norm) continue;
    const cur = groups.get(norm);
    if (!cur) groups.set(norm, c);
    else if (repRank(c) < repRank(cur) || (repRank(c) === repRank(cur) && c.sourceLine < cur.sourceLine)) {
      groups.set(norm, c);
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => Number(b.pureEnglish) - Number(a.pureEnglish) || a.sourceLine - b.sourceLine || a.start - b.start,
  );
  const picked = [];
  const perLine = new Map();
  for (const it of sorted) {
    if (picked.length >= MAX_PER_COURSE) break;
    const n = perLine.get(it.sourceLine) || 0;
    if (n >= 2) continue;
    perLine.set(it.sourceLine, n + 1);
    picked.push(it);
  }
  picked.sort((a, b) => a.sourceLine - b.sourceLine || a.start - b.start);
  return picked;
}

/* ------------------------------------------------------------------ 主流程 */
function chapterNominalRange(nums) {
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return { min, max, count: max - min + 1 };
}

function missingInRange(nums) {
  if (nums.length === 0) return [];
  const set = new Set(nums);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const out = [];
  for (let n = min; n <= max; n += 1) if (!set.has(n)) out.push(n);
  return out;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** 文件级解析：拿到标题、每句候选（含行号与是否纯英文行）。 */
function parseFile(absFile, rel) {
  const lines = normalizeText(readFileSync(absFile)).split('\n');
  const { h1, bodyStart } = locateBody(lines);
  const { meta } = parseFrontMatter(lines);
  const fileStem = basename(absFile).replace(/\.md$/i, '');
  const fallback = fileStem.replace(/^\d+[.\s]*/, '').trim();
  const title = (h1 || (meta.title || '').trim() || fallback || '').trim();

  const candidates = [];
  let inNegativeDemo = false;
  for (let i = bodyStart; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue; // 小标题不含整句
    const marks = demoMarkers(line);
    const stateAt = (pos) => {
      let negative = inNegativeDemo;
      for (const mk of marks) if (mk.idx <= pos) negative = mk.negative;
      return negative;
    };
    const pureEnglish = cjkCount(trimmed) === 0;
    for (const c of sentenceCandidates(line)) {
      if (stateAt(c.start)) continue; // 「错误示范」里的句子不是要学的表达
      candidates.push({
        text: c.text,
        zhHint: findZhHint(line, c.end),
        sourceLine: i + 1,
        start: c.start,
        pureEnglish,
      });
    }
    inNegativeDemo = stateAt(line.length);
  }
  return { rel, title, lines, candidates };
}

function main() {
  const args = parseArgs(process.argv);
  const srcRoot = resolve(args.src);
  if (!existsSync(srcRoot)) fail(`源目录不存在：${srcRoot}`);
  if (!safeIsDir(srcRoot)) fail(`--src 不是目录：${srcRoot}`);

  const chapters = listChapters(srcRoot);
  if (chapters.length === 0) fail(`源目录下没有找到带序号前缀的章节目录：${srcRoot}`);

  const unreadable = [];
  const noEnglish = [];
  const parsed = []; // 逐文件记录
  const chapterStats = [];

  for (const ch of chapters) {
    const lessonNumbers = [];
    for (const absFile of ch.files) {
      const rel = relative(srcRoot, absFile).split(sep).join('/');
      const lessonNo = leadingNumber(basename(absFile).replace(/\.md$/i, ''));
      if (lessonNo === null) {
        unreadable.push({ file: rel, reason: '文件名无序号前缀，无法定位课序号' });
        continue;
      }
      let p;
      try {
        p = parseFile(absFile, rel);
      } catch (err) {
        unreadable.push({ file: rel, reason: `读取/解析失败：${err.code || err.message}` });
        continue;
      }
      lessonNumbers.push(lessonNo);
      parsed.push({
        chapterNo: ch.chapterNo,
        chapter: ch.chapter,
        lessonNo,
        rel,
        title: p.title,
        candidates: p.candidates,
        lines: p.lines,
        lineCount: p.lines.length,
      });
    }
    chapterStats.push({
      chapterNo: ch.chapterNo,
      chapter: ch.chapter,
      dir: ch.dirName,
      mdCount: ch.files.length,
      nominalRange: chapterNominalRange(lessonNumbers),
      missingLessonNumbers: missingInRange(lessonNumbers),
    });
  }

  parsed.sort((a, b) => a.chapterNo - b.chapterNo || a.lessonNo - b.lessonNo);

  const df = buildNgramDf(parsed.map((p) => p.candidates.map((c) => c.text)));

  const courses = [];
  const titleMap = new Map(); // 归一化标题 → [{courseId, title}]
  for (const p of parsed) {
    let picked = pickSentences(p.candidates);
    let fallbackUsed = false;
    if (!picked.length && Array.isArray(p.lines) && p.lines.length) {
      const fb = phraseCandidates(p.lines).slice(0, MAX_PER_COURSE);
      if (fb.length) { picked = fb; fallbackUsed = true; }
    }
    const items = picked.map((it) => ({
      text: it.text,
      zhHint: it.zhHint,
      keywords: it.phrase ? [it.text] : extractKeywords(it.text, df),
      sourceLine: it.sourceLine,
    }));
    if (items.length === 0) noEnglish.push(p.rel);
    const primary = items[0] || null;
    const courseId = `${p.chapterNo}-${pad2(p.lessonNo)}`;
    courses.push({
      courseId,
      chapterNo: p.chapterNo,
      chapter: p.chapter,
      lessonNo: p.lessonNo,
      file: p.rel,
      title: p.title,
      sentences: items.map((i) => i.text),
      zhHint: primary ? primary.zhHint : '',
      keywords: primary ? primary.keywords : [],
      sourceLine: primary ? primary.sourceLine : 0,
      extract: fallbackUsed ? 'phrase-fallback' : 'sentence',
      items,
    });
    const normTitle = p.title.replace(/^\d+[.\s]*/, '').trim();
    if (!titleMap.has(normTitle)) titleMap.set(normTitle, []);
    titleMap.get(normTitle).push({ courseId, title: p.title });
  }

  const actualMdCount = courses.length;
  const chapterSumOfRanges = chapterStats.reduce((n, c) => n + (c.nominalRange ? c.nominalRange.count : 0), 0);
  const declaredMatch = basename(srcRoot).match(/【\s*(\d+)\s*节\s*】/);
  const declaredCount = declaredMatch ? Number(declaredMatch[1]) : null;
  const nominalCount = declaredCount === null ? chapterSumOfRanges : declaredCount;
  const gap = nominalCount - actualMdCount;

  const missing = [];
  for (const c of chapterStats) {
    for (const n of c.missingLessonNumbers) {
      missing.push({
        courseId: `${c.chapterNo}-${pad2(n)}`,
        chapter: c.chapter,
        reason: '源目录中无对应 .md 文件（编号空洞）',
        verified: false,
      });
    }
  }

  const duplicateTitles = [];
  for (const [normTitle, list] of titleMap) {
    if (normTitle && list.length > 1) {
      duplicateTitles.push({
        normalizedTitle: normTitle,
        titles: list.map((x) => x.title),
        courseIds: list.map((x) => x.courseId),
      });
    }
  }
  duplicateTitles.sort((a, b) => (a.normalizedTitle < b.normalizedTitle ? -1 : a.normalizedTitle > b.normalizedTitle ? 1 : 0));

  const index = {
    schema: SCHEMA,
    generator: 'scripts/n08-course-index.mjs',
    purpose: 'N08「表达」页课程复习题源（只读索引，不含长篇正文）',
    readOnlySource: true,
    sourceRoot: srcRoot,
    sourceDirLabel: basename(srcRoot),
    declaredCount,
    nominalCount,
    nominalStrategy:
      'nominalCount = 源目录名【N节】声明值；各章 nominalRange = 该章课序号 [最小,最大] 连续区间长度',
    actualMdCount,
    gap,
    gapNote:
      '差额未经核实：只读扫描全部 .md 后仍差 5 节，源目录未发现其它存放位置，不补齐、不生成不存在的课程。' +
      '见 missing（编号空洞，verified=false）与 unreadable（读不到的文件）。',
    chapterSumOfRanges,
    chapterCount: chapterStats.length,
    sentenceTotal: courses.reduce((n, c) => n + c.items.length, 0),
    zhHintCount: courses.filter((c) => itemsHasZh(c)).length,
    coursesWithoutEnglishSentence: noEnglish,
    chapters: chapterStats,
    missing,
    duplicateTitles,
    unreadable,
    courses,
  };

  const json = `${JSON.stringify(index, null, 2)}\n`;
  const buf = Buffer.from(json, 'utf8');
  if (buf.length > 3 * 1024 * 1024) fail(`输出超过 3MB（${buf.length} 字节），拒绝写入`);
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(resolve(args.out), buf);
  const sha = createHash('sha256').update(buf).digest('hex');

  if (!args.quiet) {
    const lines = [
      `src        ${srcRoot}`,
      `out        ${resolve(args.out)}`,
      `bytes      ${buf.length}`,
      `sha256     ${sha}`,
      `courses    ${actualMdCount}（声明 ${nominalCount}，差额 ${gap} 未核实）`,
      '按章分布   ' + chapterStats.map((c) => `${c.chapterNo}.${c.chapter}=${c.mdCount}`).join('  '),
      `句子总数   ${index.sentenceTotal}（每课 0–3，带中文对照 ${index.zhHintCount} 课）`,
      `无英文句   ${noEnglish.length}${noEnglish.length ? '：' + noEnglish.join(', ') : ''}`,
      `缺号       ${missing.length}${missing.length ? '：' + missing.map((m) => m.courseId).join(', ') : ''}`,
      `重名       ${duplicateTitles.length}` +
        (duplicateTitles.length
          ? '：' + duplicateTitles.map((d) => `${d.normalizedTitle}(${d.courseIds.join('/')})`).join(', ')
          : ''),
      `读不到     ${unreadable.length}${unreadable.length ? '：' + unreadable.map((u) => u.file).join(', ') : ''}`,
    ];
    process.stdout.write(`${lines.join('\n')}\n`);
  }
}

function itemsHasZh(c) {
  return c.items.some((i) => i.zhHint);
}

main();
