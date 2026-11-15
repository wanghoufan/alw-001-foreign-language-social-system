/*!
 * N08「表达」每周综合复习 · 纯逻辑模块
 * ---------------------------------------------------------------
 * 依据：docs/plan/P001-N08-Expression-CourseWeeklyPractice-V1.2-Approved-20261115.md 第 2、5 节
 *
 * 三种题型（全部中文出题、英文口头作答；严禁英文→中文）：
 *   模式 1 中文→英文词组
 *   模式 2 中文情境→英文完整句（promptZh 里绝不出现答案英文，由代码强制剥离拉丁字母）
 *   模式 3 中文完整句→英文完整句
 *
 * 设计约束：
 *   - 无 DOM、无网络、无存储副作用：全部是纯函数，输入不被改写。
 *   - 同时支持浏览器（window.N08W）与 node（module.exports）。
 *   - 题目与包 ID 可复现：同样的 items + seed + now（到日）生成完全相同的 ID。
 *
 * 输入条目（items）字段：
 *   必填  key    稳定主键（课程句号/记录 ID/词组 key），用于跨天去重与 ID 复用
 *         zh     中文原句或中文词组（必须含中文，否则该条不出题）
 *         en     英文参考答案（完整句优先；必须含英文字母）
 *   可选  mode   1|2|3 固定该条只用某种模式；不填则由默认配比分配
 *         phraseZh / phraseEn  模式 1 词组题专用的中文词组 / 英文词组
 *         sceneZh   模式 2 情境题的显式中文情境（含拉丁字母时会被剥离）
 *         courseId / recordId   来源追踪（写入 source）
 *         weight    权重，默认 1，越大越优先入选
 *
 * 回填协议（教练回贴，一行一题）：
 *   [<packId>] ID | 模式一结果 | 模式二结果 | 模式三结果
 *   结果字面值只允许：独立答对 / 提示后答对 / 不会
 *   [训练复盘] / [/训练复盘] / # 开头的行会被跳过
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && typeof module.exports === 'object') {
    module.exports = api;
  }
  if (typeof window !== 'undefined' && window) {
    window.N08W = api;
  }
  if (typeof globalThis !== 'undefined' && globalThis && !globalThis.N08W) {
    globalThis.N08W = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================ 常量 ============================ */

  var PACK_SIZES = [5, 10, 15];
  // 默认配比 20% / 40% / 40%
  var MODE_RATIO = { 1: 0.2, 2: 0.4, 3: 0.4 };
  var MODES = [1, 2, 3];

  var RESULT_LITERALS = ['独立答对', '提示后答对', '不会'];
  var RESULT_FIELD = { '独立答对': 'pass', '提示后答对': 'hint', '不会': 'fail' };

  var REASON = {
    UNKNOWN_ID: '题号不属于当前练习包',
    DUPLICATE_ID: '同一题号在本次回贴里重复出现',
    BAD_COLUMNS: '列数不正确，应为「题号 | 模式一结果 | 模式二结果 | 模式三结果」',
    BAD_RESULT: '结果只能是「独立答对 / 提示后答对 / 不会」',
    PACK_MISMATCH: '练习包编号与当前练习包不一致',
    EMPTY_SUBMIT: '没有可识别的有效回填行',
    DUPLICATE_SUBMIT: '该练习包今天已经回贴过，不重复计分',
    NO_PACK: '缺少练习包编号'
  };

  var MODE_TITLE = { 1: '中文→英文词组', 2: '中文情境→英文完整句', 3: '中文整句→英文完整句' };

  var MAX_PROMPT_CHARS = 120; // promptZh 上限：不把整段课程原文塞进题目
  var MAX_ANSWER_CHARS = 200;
  var MAX_REF_CHARS = 120;
  var PRIORITY_MIN = 0;
  var PRIORITY_MAX = 100;
  var PRIORITY_DEFAULT = 50;

  /* ============================ 小工具 ============================ */

  function hash32(str) {
    var h = 0x811c9dc5;
    var s = String(str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    var seed = a >>> 0;
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clean(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim();
  }

  function truncate(str, max) {
    var chars = Array.from(String(str));
    if (chars.length <= max) return chars.join('');
    return chars.slice(0, max - 1).join('') + '…';
  }

  function intOr(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** 把 now（Date / ms / ISO 字符串 / yyyy-mm-dd）统一成本地 Date。 */
  function toDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
    if (typeof value === 'string') {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
      if (m) {
        // yyyy-mm-dd 按本地零点解析，避免 UTC 解析在东八区/西五区把日期平移一天
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      var d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
  }

  /** 题目 ID 用的日期戳：yyyyMMdd（本地时区）。 */
  function dayStamp(value) {
    var d = toDate(value);
    return String(d.getFullYear()) + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  /** 计分用的日期键：yyyy-mm-dd（本地时区）。 */
  function dayKey(value) {
    var d = toDate(value);
    return String(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 本地时区的 ISO8601（带 +08:00 这类偏移），不用 toISOString 的 UTC。 */
  function toLocalIso(value) {
    var d = toDate(value);
    var off = -d.getTimezoneOffset();
    var sign = off >= 0 ? '+' : '-';
    var abs = Math.abs(off);
    return (
      String(d.getFullYear()) + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds()) +
      sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60)
    );
  }

  function hasCjk(str) {
    return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(String(str));
  }

  function hasLatinLetter(str) {
    return /[A-Za-z]/.test(String(str));
  }

  /** 剥离所有拉丁字母/数字（含全角），用于模式 2 的中文情境。 */
  function stripLatin(str) {
    return clean(
      String(str)
        .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A\uFF10-\uFF19]+/g, ' ')
        .replace(/[A-Za-z0-9]+/g, ' ')
        .replace(/["'`~^<>{}[\]\\/@#$%&*+=_|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s:：,，、;；.。\-—]+/, '')
    );
  }

  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 兜底：把答案里的英文词从中文题干中抹掉（正常路径已由 stripLatin 保证）。 */
  function stripAnswerLeak(prompt, answer) {
    var words = String(answer || '').toLowerCase().match(/[a-z][a-z'-]{1,}/g) || [];
    var out = String(prompt);
    for (var i = 0; i < words.length; i++) {
      var re = new RegExp('\\b' + escapeRegExp(words[i]) + '\\b', 'gi');
      out = out.replace(re, '□');
    }
    return out;
  }

  function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (typeof structuredClone === 'function') {
      try { return structuredClone(v); } catch (e) { /* 退回 JSON */ }
    }
    return JSON.parse(JSON.stringify(v));
  }

  /* ============================ 组题 ============================ */

  function quotaFor(size) {
    var m1 = Math.round(size * MODE_RATIO[1]);
    var m2 = Math.round(size * MODE_RATIO[2]);
    var m3 = size - m1 - m2;
    if (m3 < 0) { m3 = 0; }
    return { 1: m1, 2: m2, 3: m3 };
  }

  function normalizeItems(items) {
    var seen = Object.create(null);
    var out = [];
    var list = Array.isArray(items) ? items : [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      var key = clean(raw.key);
      var zh = clean(raw.zh);
      var en = clean(raw.en);
      if (!key || !zh || !en) continue;
      // 中文出题：无中文、无英文答案的条目不出题（防止出现英文题干）
      if (!hasCjk(zh)) continue;
      if (!hasLatinLetter(en)) continue;
      if (seen[key]) continue;
      seen[key] = true;
      var pinned = Number(raw.mode);
      out.push({
        key: key,
        zh: zh,
        en: en,
        phraseZh: clean(raw.phraseZh),
        phraseEn: clean(raw.phraseEn),
        sceneZh: clean(raw.sceneZh),
        mode: MODES.indexOf(pinned) >= 0 ? pinned : 0,
        weight: intOr(raw.weight, 1),
        courseId: raw.courseId === undefined ? null : raw.courseId,
        recordId: raw.recordId === undefined ? null : raw.recordId
      });
    }
    // 输入顺序不影响结果：按 key 排序后再按权重 + 种子抖动排序
    out.sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
    return out;
  }

  function orderCandidates(items, seedToken) {
    var rand = mulberry32(hash32('n08.order|' + seedToken));
    var jitter = Object.create(null);
    for (var i = 0; i < items.length; i++) jitter[items[i].key] = rand();
    return items.slice().sort(function (a, b) {
      if (b.weight !== a.weight) return b.weight - a.weight;      // 权重高的先选
      var ja = jitter[a.key], jb = jitter[b.key];
      if (ja !== jb) return ja - jb;                              // 同权重按种子抖动
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    });
  }

  function phraseZhOf(it) { return clean(it.phraseZh) || it.zh; }
  function phraseEnOf(it) { return clean(it.phraseEn) || it.en; }

  function wordCount(str) {
    var m = String(str).match(/[A-Za-z][A-Za-z'-]*/g);
    return m ? m.length : 0;
  }

  /** 词组素材的契合度分级：0 显式词组 > 1 极短（≤3 词）> 2 短（≤4 词）> 3 整句。 */
  function phraseTier(it) {
    if (clean(it.phraseEn)) return 0;
    var n = wordCount(it.en);
    if (n <= 3) return 1;
    if (n <= 4) return 2;
    return 3;
  }

  function pickBestPhraseIndex(list) {
    var best = -1;
    var bestTier = 99;
    for (var i = 0; i < list.length; i++) {
      var t = phraseTier(list[i]);
      if (t < bestTier) { bestTier = t; best = i; }
    }
    return best;
  }

  function sceneOf(it) {
    var explicit = clean(it.sceneZh);
    var base = explicit || ('你在跟朋友聊天，想把这件事说出来：' + it.zh);
    var stripped = stripLatin(base);
    if (!hasCjk(stripped)) stripped = '你在跟朋友聊天，想用一句自然的英文把当前情境说出来';
    return stripped;
  }

  function buildPromptZh(mode, it) {
    var prompt;
    if (mode === 1) prompt = '中文→英文词组：' + phraseZhOf(it);
    else if (mode === 2) prompt = '中文情境→英文完整句：' + sceneOf(it);
    else prompt = '中文整句→英文完整句：' + it.zh;
    prompt = clean(prompt);
    // 模式 2 绝不允许把答案英文泄进题干（先剥离拉丁字母，再按答案词做兜底抹除）
    if (mode === 2) prompt = stripLatin(stripAnswerLeak(prompt, it.en));
    return truncate(prompt, MAX_PROMPT_CHARS);
  }

  function buildAnswerEn(mode, it) {
    var ans = mode === 1 ? phraseEnOf(it) : it.en;
    return truncate(clean(ans), MAX_ANSWER_CHARS);
  }

  /**
   * 生成每周固定练习包。
   * @param {{items:Array, size?:number, seed?:string|number, now?:Date|number|string}} input
   * @returns {{packId:string, createdAt:string, day:string, size:number, seed:string, modeQuota:object, questions:Array}}
   */
  function buildWeeklyPack(input) {
    var opts = input && typeof input === 'object' ? input : {};
    var size = opts.size === undefined || opts.size === null ? 10 : Number(opts.size);
    if (PACK_SIZES.indexOf(size) < 0) {
      throw new Error('buildWeeklyPack: size 只允许 5 / 10 / 15，收到 ' + JSON.stringify(opts.size));
    }

    var now = toDate(opts.now);
    var day = dayStamp(now);
    var seed = String(opts.seed === undefined || opts.seed === null || opts.seed === '' ? day : opts.seed);
    var seedToken = seed + '|' + day;

    var candidates = normalizeItems(opts.items);
    var ordered = orderCandidates(candidates, seedToken);
    var quota = quotaFor(size);
    var buckets = { 1: [], 2: [], 3: [] };

    // ① 显式指定模式的条目先占位（按权重/抖动顺序）
    var flexible = [];
    for (var i = 0; i < ordered.length; i++) {
      var it = ordered[i];
      if (it.mode && buckets[it.mode].length < quota[it.mode]) buckets[it.mode].push(it);
      else if (it.mode) continue; // 超额的固定模式条目不强塞给别的模式
      else flexible.push(it);
    }

    // ② 剩余名额用未指定模式的条目补齐；模式 1 优先挑真正是词组的素材
    for (var m = 0; m < MODES.length; m++) {
      var mode = MODES[m];
      while (buckets[mode].length < quota[mode] && flexible.length) {
        var pick = mode === 1 ? pickBestPhraseIndex(flexible) : 0;
        if (pick < 0) pick = 0;
        buckets[mode].push(flexible[pick]);
        flexible.splice(pick, 1);
      }
    }

    // ③ 某模式条目不足时，余额按「缺口最大」顺序转给其他模式
    while (flexible.length) {
      var total = buckets[1].length + buckets[2].length + buckets[3].length;
      if (total >= size) break;
      var best = 0;
      var bestGap = -1;
      for (var k = 0; k < MODES.length; k++) {
        var mm = MODES[k];
        var gap = quota[mm] - buckets[mm].length;
        if (gap > bestGap) { bestGap = gap; best = mm; }
      }
      if (!best) break;
      var take = best === 1 ? pickBestPhraseIndex(flexible) : 0;
      if (take < 0) take = 0;
      buckets[best].push(flexible[take]);
      flexible.splice(take, 1);
    }

    // ④ 稳定 ID：同一天同一 key 永远同一个序号（序号只由 key + 日期决定）
    var allKeys = [];
    for (var b in buckets) {
      for (var q = 0; q < buckets[b].length; q++) allKeys.push(buckets[b][q].key);
    }
    allKeys.sort();
    var slotOf = Object.create(null);
    var slotUsed = Object.create(null);
    for (var s = 0; s < allKeys.length; s++) {
      var k2 = allKeys[s];
      if (slotOf[k2]) continue;
      var slot = (hash32('n08.slot|' + day + '|' + k2) % 90000) + 10000;
      var guard = 0;
      // 极少数哈希撞序号时按字典序线性避让，保证包内 ID 唯一
      while (slotUsed[slot] && guard < 100000) {
        slot = slot >= 99999 ? 10000 : slot + 1;
        guard++;
      }
      slotUsed[slot] = k2;
      slotOf[k2] = slot;
    }

    var questions = [];
    for (var mi = 0; mi < MODES.length; mi++) {
      var md = MODES[mi];
      for (var qi = 0; qi < buckets[md].length; qi++) {
        var item = buckets[md][qi];
        questions.push({
          id: 'w' + day + '-' + slotOf[item.key],
          mode: md,
          modeTitle: MODE_TITLE[md],
          promptZh: buildPromptZh(md, item),
          answerEn: buildAnswerEn(md, item),
          refZh: truncate(item.zh, MAX_REF_CHARS),
          source: { key: item.key, courseId: item.courseId, recordId: item.recordId }
        });
      }
    }

    var packHash = hash32('n08.pack|' + day + '|' + size + '|' + seed + '|' + allKeys.join(','));
    var packId = 'n08w-' + day + '-' + size + '-' + ('00000000' + packHash.toString(16)).slice(-8);

    return {
      packId: packId,
      createdAt: toLocalIso(now),
      day: day,
      size: size,
      seed: seed,
      modeQuota: quota,
      questions: questions
    };
  }

  /* ============================ 回填解析 ============================ */

  var ID_RE = /w\d{8}-\d+/;

  function emptyScores() {
    return {
      m1: { pass: 0, hint: 0, fail: 0 },
      m2: { pass: 0, hint: 0, fail: 0 },
      m3: { pass: 0, hint: 0, fail: 0 }
    };
  }

  function dayFromPackId(packId) {
    var m = /n08w-(\d{8})-/.exec(String(packId || ''));
    return m ? m[1] : '';
  }

  /**
   * 解析教练回贴。
   * @param {string} text
   * @param {string} packIdArg 当前练习包编号
   * @param {object} pack 当前练习包（{packId, questions, submits?}）
   */
  function parseResults(text, packIdArg, pack) {
    var packObj = pack && typeof pack === 'object' ? pack : {};
    var packId = clean(packIdArg) || clean(packObj.packId);
    var scores = emptyScores();
    var applied = [];
    var rejected = [];

    var questions = Array.isArray(packObj.questions) ? packObj.questions : [];
    var byId = Object.create(null);
    for (var i = 0; i < questions.length; i++) {
      if (questions[i] && questions[i].id) byId[clean(questions[i].id)] = questions[i];
    }

    if (!packId) {
      return { ok: false, reason: 'NO_PACK', message: REASON.NO_PACK, packId: '', applied: applied, rejected: rejected, scores: scores };
    }

    // 幂等：同一 packId 已经回贴过（packId 内含日期，同包即同一天）
    var submits = Array.isArray(packObj.submits) ? packObj.submits : [];
    var duplicated = false;
    for (var si = 0; si < submits.length; si++) {
      var sub = submits[si];
      if (!sub) continue;
      if (clean(sub.packId) === packId) { duplicated = true; break; }
    }
    if (!duplicated && clean(packObj.submittedPackId) === packId) duplicated = true;
    if (duplicated) {
      return {
        ok: false,
        reason: 'DUPLICATE_SUBMIT',
        message: REASON.DUPLICATE_SUBMIT,
        packId: packId,
        applied: applied,
        rejected: rejected,
        scores: scores
      };
    }

    var packMismatch = !!clean(packObj.packId) && clean(packObj.packId) !== packId;
    var seenId = Object.create(null);
    var lines = String(text === null || text === undefined ? '' : text).split(/\r?\n/);

    for (var li = 0; li < lines.length; li++) {
      var line = lines[li].replace(/\u3000/g, ' ').trim();
      if (!line) continue;
      if (/^\[\/?训练复盘\]$/.test(line)) continue;
      if (/^#{1,6}\s/.test(line)) continue;
      if (!line.includes('|') && !ID_RE.test(line)) continue; // 纯说明文字直接跳过

      if (packMismatch) {
        rejected.push({ line: line, reason: 'PACK_MISMATCH', message: REASON.PACK_MISMATCH });
        continue;
      }

      var parts = line.split('|');
      for (var pi = 0; pi < parts.length; pi++) parts[pi] = parts[pi].replace(/\u3000/g, ' ').trim();

      // 行首的 [packId] / @packId 标记（可与题号同格，也可单独占一格）
      var first = parts.length ? parts[0] : '';
      var tagMatch = /^\[([^\]]*)\]\s*(.*)$/.exec(first);
      if (!tagMatch) tagMatch = /^@(\S+?)(?:\s+(.*))?$/.exec(first);
      if (tagMatch) {
        var tag = clean(tagMatch[1]);
        if (tag !== packId) {
          rejected.push({ line: line, reason: 'PACK_MISMATCH', message: REASON.PACK_MISMATCH });
          continue;
        }
        if (tagMatch[2] && clean(tagMatch[2])) parts[0] = clean(tagMatch[2]);
        else parts.shift();
      }

      var id = parts.length ? clean(parts[0]) : '';
      var q = byId[id];
      if (!q) {
        rejected.push({ line: line, reason: 'UNKNOWN_ID', message: REASON.UNKNOWN_ID });
        continue;
      }
      if (seenId[id]) {
        rejected.push({ line: line, reason: 'DUPLICATE_ID', message: REASON.DUPLICATE_ID });
        continue;
      }
      if (parts.length !== 4) {
        rejected.push({ line: line, reason: 'BAD_COLUMNS', message: REASON.BAD_COLUMNS });
        continue;
      }
      var bad = '';
      var badFound = false;
      for (var ri = 1; ri < 4; ri++) {
        if (RESULT_LITERALS.indexOf(parts[ri]) < 0) { bad = parts[ri]; badFound = true; break; }
      }
      if (badFound) {
        rejected.push({ line: line, reason: 'BAD_RESULT', message: REASON.BAD_RESULT + '（收到：' + bad + '）' });
        continue;
      }

      seenId[id] = true;
      var source = q.source && typeof q.source === 'object' ? q.source : { key: q.id };
      for (var mi2 = 0; mi2 < MODES.length; mi2++) {
        var mode = MODES[mi2];
        var result = parts[mode];
        applied.push({ id: id, mode: mode, result: result, key: source.key || id, source: source });
        scores['m' + mode][RESULT_FIELD[result]] += 1;
      }
    }

    if (!applied.length) {
      return {
        ok: false,
        reason: rejected.length ? 'ALL_REJECTED' : 'EMPTY_SUBMIT',
        message: rejected.length ? '回贴的每一行都被拒绝' : REASON.EMPTY_SUBMIT,
        packId: packId,
        applied: applied,
        rejected: rejected,
        scores: scores
      };
    }

    return {
      ok: rejected.length === 0,
      reason: rejected.length ? 'PARTIAL_REJECTED' : '',
      message: rejected.length ? '存在被拒绝的行，请修正后整包重贴' : '',
      packId: packId,
      applied: applied,
      rejected: rejected,
      scores: scores
    };
  }

  /** 把一次成功回贴登记到练习包（返回新包，不改入参），供下一轮幂等判定。 */
  function stampSubmit(pack, parsed, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var next = deepClone(pack && typeof pack === 'object' ? pack : {});
    if (!Array.isArray(next.submits)) next.submits = [];
    if (!parsed || parsed.ok !== true) return next;
    var packId = clean(o.packId) || clean(parsed.packId) || clean(next.packId);
    var day = clean(o.today) ? dayKey(o.today) : (dayFromPackId(packId) || dayStamp(new Date()));
    next.submits.push({
      packId: packId,
      day: day,
      appliedAt: toLocalIso(o.now === undefined ? new Date() : o.now),
      count: Array.isArray(parsed.applied) ? parsed.applied.length : 0
    });
    next.submittedPackId = packId;
    return next;
  }

  /* ============================ 复习优先级 ============================ */

  function emptyState() {
    return { version: 1, appliedDays: [], items: {} };
  }

  function newItem(key, source) {
    return {
      key: key,
      priority: PRIORITY_DEFAULT,
      status: 'new',
      cleanPass: 0,
      modeStreak: { m1: 0, m2: 0, m3: 0 },
      mastered: { m1: false, m2: false, m3: false },
      seen: 0,
      lastResult: '',
      lastDay: '',
      source: source && typeof source === 'object' ? deepClone(source) : null,
      history: []
    };
  }

  function worstResult(results) {
    if (results.indexOf('不会') >= 0) return '不会';
    if (results.indexOf('提示后答对') >= 0) return '提示后答对';
    return '独立答对';
  }

  /**
   * 按回填结果更新复习优先级（返回新 state，不改入参）。
   * - 「不会」+6、「提示后答对」+4，优先级越高越先复习
   * - 连续 2 次全模式「独立答对」才 -5；首次独立答对不动
   * - 同一天重复计分被忽略（appliedDays 去重）
   * - 优先级只调不删；条目永不从 items 里消失
   * - 只有该模式自己连续 2 次独立答对才算该模式已掌握，模式 1 答对不会把 2/3 标成已掌握
   * @param {object} state
   * @param {object} parsed parseResults 的返回
   * @param {{today?:Date|number|string}} opts
   */
  function updatePriority(state, parsed, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var today = dayKey(o.today === undefined ? new Date() : o.today);
    var next = deepClone(state && typeof state === 'object' ? state : emptyState());
    if (!next.version) next.version = 1;
    if (!Array.isArray(next.appliedDays)) next.appliedDays = [];
    if (!next.items || typeof next.items !== 'object' || Array.isArray(next.items)) next.items = {};

    if (!parsed || parsed.ok !== true || !Array.isArray(parsed.applied) || !parsed.applied.length) {
      return next;
    }
    if (next.appliedDays.indexOf(today) >= 0) return next; // 同一天已计分，直接忽略

    var grouped = Object.create(null);
    var order = [];
    for (var i = 0; i < parsed.applied.length; i++) {
      var e = parsed.applied[i];
      if (!e || typeof e !== 'object') continue;
      var key = clean(e.key);
      var mode = Number(e.mode);
      if (!key || MODES.indexOf(mode) < 0) continue;
      if (RESULT_LITERALS.indexOf(e.result) < 0) continue;
      if (!grouped[key]) {
        grouped[key] = { m1: '', m2: '', m3: '', source: e.source || null };
        order.push(key);
      }
      grouped[key]['m' + mode] = e.result;
    }

    for (var oi = 0; oi < order.length; oi++) {
      var k = order[oi];
      var res = grouped[k];
      if (!next.items[k]) next.items[k] = newItem(k, res.source);
      var item = next.items[k];
      if (!item.modeStreak) item.modeStreak = { m1: 0, m2: 0, m3: 0 };
      if (!item.mastered) item.mastered = { m1: false, m2: false, m3: false };
      if (!Array.isArray(item.history)) item.history = [];
      if (typeof item.priority !== 'number' || !Number.isFinite(item.priority)) item.priority = PRIORITY_DEFAULT;
      if (typeof item.cleanPass !== 'number') item.cleanPass = 0;

      var results = [];
      for (var mi = 0; mi < MODES.length; mi++) {
        var r = res['m' + MODES[mi]];
        if (r) results.push(r);
      }
      if (!results.length) continue;

      var delta = 0;
      // 只有三种模式都回填且全部独立答对，才算一次「完整独立答对」
      var allPass = results.length === MODES.length && results.every(function (x) { return x === '独立答对'; });
      if (allPass) {
        item.cleanPass += 1;
        if (item.cleanPass >= 2) delta -= 5; // 连续 2 次以上独立答对才降
      } else if (results.length === MODES.length) {
        item.cleanPass = 0;
      }
      if (results.indexOf('不会') >= 0) delta += 6;
      else if (results.indexOf('提示后答对') >= 0) delta += 4;

      // 分模式连续答对：只影响该模式，模式 1 答对绝不给 2/3 记掌握
      for (var mj = 0; mj < MODES.length; mj++) {
        var mode = MODES[mj];
        var mr = res['m' + mode];
        if (!mr) continue;
        if (mr === '独立答对') item.modeStreak['m' + mode] = (item.modeStreak['m' + mode] || 0) + 1;
        else item.modeStreak['m' + mode] = 0;
        item.mastered['m' + mode] = item.modeStreak['m' + mode] >= 2;
      }

      item.priority = clamp(Math.round(item.priority + delta), PRIORITY_MIN, PRIORITY_MAX);
      item.seen += 1;
      item.lastResult = worstResult(results);
      item.lastDay = today;
      if (res.source && (!item.source || !item.source.key)) item.source = deepClone(res.source);
      var allMastered = item.mastered.m1 && item.mastered.m2 && item.mastered.m3;
      item.status = allMastered ? 'mastered' : delta > 0 ? 'weak' : 'learning';
      item.history.push({ day: today, m1: res.m1 || '', m2: res.m2 || '', m3: res.m3 || '', delta: delta, priority: item.priority });
      if (item.history.length > 20) item.history = item.history.slice(-20);
    }

    next.appliedDays.push(today);
    next.lastUpdate = { day: today, packId: parsed.packId || '', applied: parsed.applied.length };
    return next;
  }

  /* ============================ 导出 ============================ */

  var api = {
    buildWeeklyPack: buildWeeklyPack,
    parseResults: parseResults,
    updatePriority: updatePriority,
    stampSubmit: stampSubmit,
    emptyState: emptyState,
    // 常量（供 UI / 测试复用，避免各处重复字面量）
    PACK_SIZES: PACK_SIZES,
    MODES: MODES,
    MODE_RATIO: MODE_RATIO,
    MODE_TITLE: MODE_TITLE,
    RESULT_LITERALS: RESULT_LITERALS,
    REASON: REASON,
    MAX_PROMPT_CHARS: MAX_PROMPT_CHARS,
    // 工具
    dayStamp: dayStamp,
    dayKey: dayKey,
    toLocalIso: toLocalIso,
    quotaFor: quotaFor
  };

  return api;
});
