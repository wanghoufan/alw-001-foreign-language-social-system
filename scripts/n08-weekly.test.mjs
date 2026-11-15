/**
 * N08「每周综合复习」纯逻辑单测
 * 运行：node --test scripts/n08-weekly.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import n08 from '../socialmate-v1.2/source/n08-weekly.js';

const { buildWeeklyPack, parseResults, updatePriority, stampSubmit, emptyState, RESULT_LITERALS } = n08;

/** 30 条真实形态的候选知识点（词组 + 完整句；部分带情境/词组字段） */
const ITEMS = [
  { key: 'c01', zh: '叙旧，聊聊近况', en: 'catch up', phraseZh: '叙旧，聊聊近况', phraseEn: 'catch up', sceneZh: '你想约很久没见的外国朋友这周末聊聊近况', courseId: 'C-09', recordId: 'EX-008' },
  { key: 'c02', zh: '我很喜欢傍晚在湖边散步。', en: 'I love taking a walk by the lake in the evening.', phraseZh: '在湖边散步', phraseEn: 'take a walk by the lake', sceneZh: '你想告诉朋友，傍晚在湖边散步让你很放松', courseId: 'C-09', recordId: 'EX-001' },
  { key: 'c03', zh: '我先慢跑一会儿。', en: 'I start with a short jog.', sceneZh: '你想告诉朋友你今天先慢跑热身', courseId: 'C-43' },
  { key: 'c04', zh: '顺其自然就好，看心情吧。', en: "Let's just go with the flow and see how we feel.", phraseZh: '顺其自然', phraseEn: 'go with the flow', recordId: 'EX-003' },
  { key: 'c05', zh: '我有点紧张，但我会努力试试。', en: "I'm a little nervous, but I'll give it a try.", phraseZh: '试试看', phraseEn: 'give it a try', recordId: 'EX-004' },
  { key: 'c06', zh: '今天练得有点累，不过感觉很充实。', en: "I'm a bit worn out from my workout, but it feels good.", phraseZh: '累坏了', phraseEn: 'worn out', recordId: 'EX-006' },
  { key: 'c07', zh: '我想下次跟你一起去试试。', en: "I'd love to give it a try with you sometime.", recordId: 'EX-007' },
  { key: 'c08', zh: '你能再说一遍吗？', en: 'Could you say that again?' },
  { key: 'c09', zh: '请问最近的地铁站怎么走？', en: 'Excuse me, how do I get to the nearest subway station?', courseId: 'C-29' },
  { key: 'c10', zh: '我想点一杯不加糖的咖啡。', en: "I'd like a coffee without sugar.", courseId: 'C-29' },
  { key: 'c11', zh: '这家店的味道很不错。', en: 'The food here tastes really good.' },
  { key: 'c12', zh: '我每周去三次健身房。', en: 'I go to the gym three times a week.', courseId: 'C-43' },
  { key: 'c13', zh: '我对这个安排没有意见。', en: "I'm fine with the plan." },
  { key: 'c14', zh: '不好意思，我迟到了。', en: "Sorry, I'm late." },
  { key: 'c15', zh: '这个周末你有什么安排？', en: 'What are your plans for the weekend?' },
  { key: 'c16', zh: '我想把这件事推迟到明天。', en: "I'd like to put this off until tomorrow." },
  { key: 'c17', zh: '他说话有点快，我跟不上。', en: "He speaks a bit fast, so I can't keep up." },
  { key: 'c18', zh: '我们可以一起分担费用。', en: 'We can split the cost.' },
  { key: 'c19', zh: '我不太确定这样对不对。', en: "I'm not sure if that's right." },
  { key: 'c20', zh: '今天天气很适合出门走走。', en: 'The weather is great for a walk today.' },
  { key: 'c21', zh: '提前预订会便宜一些。', en: "It's cheaper if you book in advance." },
  { key: 'c22', zh: '我可以帮你拿行李。', en: 'I can help you with your luggage.' },
  { key: 'c23', zh: '我已经习惯早起。', en: "I'm used to getting up early." },
  { key: 'c24', zh: '别担心，慢慢来。', en: 'Take your time.' },
  { key: 'c25', zh: '这个价格对我来说有点高。', en: "It's a bit expensive for me." },
  { key: 'c26', zh: '我想换个靠窗的位置。', en: "I'd like a seat by the window." },
  { key: 'c27', zh: '我们改天再约吧。', en: "Let's meet another day." },
  { key: 'c28', zh: '他正在准备面试。', en: "He's preparing for an interview." },
  { key: 'c29', zh: '我对这份工作很感兴趣。', en: "I'm really interested in this job." },
  { key: 'c30', zh: '你能帮我拍张照吗？', en: 'Could you take a picture for me?' }
];

const NOW = new Date(2026, 10, 15, 9, 30, 0); // 本地时间 2026-11-15 09:30
const DAY = '20261115';

const build = (over = {}) => buildWeeklyPack({ items: ITEMS, size: 10, seed: 'week-46', now: NOW, ...over });
const countModes = (qs) => qs.reduce((acc, q) => { acc[q.mode] = (acc[q.mode] || 0) + 1; return acc; }, {});

/* ---------------------------- 组题 ---------------------------- */

test('buildWeeklyPack: size 只允许 5/10/15，其它值抛错', () => {
  for (const bad of [0, 1, 7, 12, 20, 100]) {
    assert.throws(() => buildWeeklyPack({ items: ITEMS, size: bad, now: NOW }), /size 只允许 5 \/ 10 \/ 15/, `size=${bad} 应抛错`);
  }
  for (const good of [5, 10, 15]) {
    assert.equal(build({ size: good }).questions.length, good, `size=${good} 应产出 ${good} 题`);
  }
  assert.throws(() => buildWeeklyPack({ items: ITEMS, size: 3, now: NOW }), /size 只允许 5 \/ 10 \/ 15/);
  assert.throws(() => buildWeeklyPack({ items: ITEMS, size: '七', now: NOW }), /size 只允许 5 \/ 10 \/ 15/);
});

test('buildWeeklyPack: 默认模式配比 20/40/40', () => {
  assert.deepEqual(countModes(build({ size: 10 }).questions), { 1: 2, 2: 4, 3: 4 });
  assert.deepEqual(countModes(build({ size: 5 }).questions), { 1: 1, 2: 2, 3: 2 });
  assert.deepEqual(countModes(build({ size: 15 }).questions), { 1: 3, 2: 6, 3: 6 });
});

test('buildWeeklyPack: 输出结构齐全且 promptZh ≤ 120 字', () => {
  const pack = build();
  assert.match(pack.packId, /^n08w-\d{8}-(5|10|15)-[0-9a-f]{8}$/);
  assert.equal(pack.day, DAY);
  assert.equal(pack.questions.length, 10);
  for (const q of pack.questions) {
    assert.match(q.id, /^w\d{8}-\d+$/);
    assert.equal(q.id.slice(1, 9), DAY, '题号日期必须等于 now 的本地日期');
    assert.ok([1, 2, 3].includes(q.mode));
    assert.ok(q.promptZh.length > 0 && Array.from(q.promptZh).length <= 120);
    assert.ok(q.answerEn.length > 0);
    assert.ok(q.refZh.length > 0);
    assert.equal(typeof q.source.key, 'string');
  }
  assert.equal(new Set(pack.questions.map((q) => q.id)).size, 10, '题号必须唯一');
});

test('buildWeeklyPack: 过长的中文原文被截断，不把整段课程原文塞进题目', () => {
  const longZh = '这段话是为了验证题目长度上限而写的很长的中文内容。'.repeat(12);
  const pack = buildWeeklyPack({ items: [{ key: 'long1', zh: longZh, en: 'This is a deliberately long sentence used only for truncation testing.' }], size: 5, seed: 's1', now: NOW });
  const q = pack.questions[0];
  assert.equal(Array.from(q.promptZh).length, 120);
  assert.ok(q.promptZh.endsWith('…'), '截断后应以省略号结尾');
  assert.ok(Array.from(q.refZh).length <= 120);
});

test('buildWeeklyPack: 同输入同 seed 同 now 完全可复现', () => {
  const a = build();
  const b = build();
  assert.equal(a.packId, b.packId);
  assert.equal(a.createdAt, b.createdAt);
  assert.deepEqual(a.questions.map((q) => q.id), b.questions.map((q) => q.id));
  assert.deepEqual(a.questions, b.questions);
  const c = build({ seed: 'week-47' });
  assert.notEqual(a.packId, c.packId, '不同 seed 应是不同的包');
});

test('buildWeeklyPack: 同一 key 在同一天重复生成得到同一个 id', () => {
  const full = build({ size: 15 });
  const idByKey = new Map(full.questions.map((q) => [q.source.key, q.id]));
  // 用同一批 key 换一个更小的包（只取 5 条），同一天同一 key 的题号必须不变
  const picked = [...new Set(full.questions.map((q) => q.source.key))].slice(0, 5);
  const subsetItems = picked.map((k) => ITEMS.find((it) => it.key === k));
  const subset = build({ items: subsetItems, size: 5 });
  assert.equal(subset.questions.length, 5);
  for (const q of subset.questions) {
    assert.equal(q.id, idByKey.get(q.source.key), `key=${q.source.key} 的题号应保持稳定`);
  }
  // 明确模式固定的条目也一样：单独出题与混在别的条目里出题，题号不变
  const c01 = ITEMS[0];
  const alone = buildWeeklyPack({ items: [c01], size: 5, seed: 'week-46', now: NOW });
  const mixed = buildWeeklyPack({ items: [c01, ITEMS[1]], size: 5, seed: 'week-46', now: NOW });
  const mixedC01 = mixed.questions.find((q) => q.source.key === 'c01');
  assert.equal(alone.questions[0].id, mixedC01.id);
  assert.match(alone.questions[0].id, new RegExp('^w' + DAY + '-\\d+$'));
});

test('模式 2 的 promptZh 绝不含答案英文（硬回归线：不得退化成英文题干）', () => {
  const pack = build({ size: 15 });
  const m2 = pack.questions.filter((q) => q.mode === 2);
  assert.equal(m2.length, 6);
  for (const q of m2) {
    assert.ok(!/[A-Za-z0-9]/.test(q.promptZh), `模式 2 题干出现拉丁字母/数字：${q.promptZh}`);
    assert.ok(!/[\u00C0-\u024F]/.test(q.promptZh), '模式 2 题干不得含拉丁扩展字母');
    assert.ok(/[\u4e00-\u9fff]/.test(q.promptZh), '模式 2 题干必须是中文');
    const words = (q.answerEn.toLowerCase().match(/[a-z][a-z'-]{1,}/g) || []).filter((w) => w.length >= 2);
    for (const w of words) {
      assert.ok(!q.promptZh.toLowerCase().includes(w), `模式 2 题干泄露答案词「${w}」：${q.promptZh}`);
    }
  }
});

test('模式 2 防回退：中文里混着答案英文时也会被剥离', () => {
  const hostile = [{
    key: 'x1',
    zh: 'capoeira 是一种巴西战舞，我想问朋友练了多久。',
    en: 'Capoeira is a Brazilian martial art that combines movement, music, and dance.',
    mode: 2
  }];
  const pack = buildWeeklyPack({ items: hostile, size: 5, seed: 'x', now: NOW });
  assert.equal(pack.questions.length, 1);
  const q = pack.questions[0];
  assert.equal(q.mode, 2);
  assert.ok(!/capoeira/i.test(q.promptZh), `答案词 capoeira 泄进题干：${q.promptZh}`);
  assert.ok(!/[A-Za-z]/.test(q.promptZh));
  assert.ok(/巴西战舞/.test(q.promptZh), '中文情境本体应保留');
});

test('不存在「英文题干 + 中文作答」的题', () => {
  const pack = build({ size: 15 });
  for (const q of pack.questions) {
    // 题干必须以中文模式标签开头，且不含大段英文
    assert.ok(q.promptZh.startsWith('中文'), `题干未以中文模式标签开头：${q.promptZh}`);
    const latinWords = (q.promptZh.match(/[A-Za-z]{2,}/g) || []).length;
    assert.ok(latinWords <= 1, `题干英文词过多，疑似英文出题：${q.promptZh}`);
  }
});

test('buildWeeklyPack: 条目不足 size 时不补假题；固定模式超额不串模式', () => {
  const small = build({ items: ITEMS.slice(0, 4), size: 10 });
  assert.equal(small.questions.length, 4);
  const pinnedM1 = ITEMS.map((it) => ({ ...it, key: 'p_' + it.key, mode: 1 })).slice(0, 3);
  const pack = buildWeeklyPack({ items: pinnedM1, size: 5, seed: 's', now: NOW });
  assert.ok(pack.questions.every((q) => q.mode === 1), '固定模式条目不得被塞进其它模式');
});

test('buildWeeklyPack: 脏数据被过滤且不改入参', () => {
  const items = [
    { key: 'ok1', zh: '你好', en: 'Hello.' },
    { key: '', zh: '没有主键', en: 'No key.' },
    { key: 'noj', zh: '', en: 'No Chinese.' },
    { key: 'noen', zh: '没有英文', en: '' },
    { key: 'english', zh: 'english only', en: 'English only.' },
    { key: 'ok1', zh: '重复主键', en: 'Duplicate key.' }
  ];
  const snapshot = JSON.stringify(items);
  const pack = buildWeeklyPack({ items, size: 5, seed: 'd', now: NOW });
  assert.deepEqual(pack.questions.map((q) => q.source.key), ['ok1']);
  assert.equal(JSON.stringify(items), snapshot, '入参不得被修改');
});

/* ---------------------------- 回填解析 ---------------------------- */

const lineFor = (q, results) => `${q.id} | ${results[0]} | ${results[1]} | ${results[2]}`;

test('parseResults: 正常回贴按三种模式分别计分', () => {
  const pack = build();
  const qs = pack.questions;
  const text = [
    '[训练复盘]',
    lineFor(qs[0], ['独立答对', '提示后答对', '不会']),
    lineFor(qs[1], ['独立答对', '独立答对', '独立答对']),
    '[/训练复盘]'
  ].join('\n');
  const r = parseResults(text, pack.packId, pack);
  assert.equal(r.ok, true);
  assert.equal(r.rejected.length, 0);
  assert.equal(r.applied.length, 6, '每行三模式 → 3 条 applied');
  assert.deepEqual(r.applied[0], { id: qs[0].id, mode: 1, result: '独立答对', key: qs[0].source.key, source: qs[0].source });
  assert.deepEqual(r.scores, {
    m1: { pass: 2, hint: 0, fail: 0 },
    m2: { pass: 1, hint: 1, fail: 0 },
    m3: { pass: 1, hint: 0, fail: 1 }
  });
  for (const a of r.applied) assert.ok(RESULT_LITERALS.includes(a.result));
});

test('parseResults: 未知题号 / 重复题号 / 列数不对 / 未知结果字面值 逐条拒绝', () => {
  const pack = build();
  const q = pack.questions[0];
  const cases = [
    ['w20261115-99999 | 独立答对 | 独立答对 | 独立答对', 'UNKNOWN_ID', 0],
    [lineFor(q, ['独立答对', '独立答对', '独立答对']) + '\n' + lineFor(q, ['不会', '不会', '不会']), 'DUPLICATE_ID', 3],
    [`${q.id} | 独立答对 | 独立答对`, 'BAD_COLUMNS', 0],
    [`${q.id} | 独立答对 | 答对 | 独立答对`, 'BAD_RESULT', 0],
    [`${q.id} | 独立答对 | 提示后答对 | 独立答对/提示后答对/不会`, 'BAD_RESULT', 0]
  ];
  for (const [text, reason, expectApplied] of cases) {
    const r = parseResults(text, pack.packId, pack);
    assert.equal(r.ok, false, `${reason} 场景不应 ok`);
    assert.ok(r.rejected.some((x) => x.reason === reason), `${reason} 应出现在 rejected：${JSON.stringify(r.rejected)}`);
    assert.equal(r.applied.length, expectApplied, `${reason} 场景 applied 条数不符`);
  }
});

test('parseResults: packId 不匹配的行被拒绝（行内标记 + 包对象不一致两路）', () => {
  const pack = build();
  const q = pack.questions[0];
  const good = `[${pack.packId}] ${lineFor(q, ['独立答对', '独立答对', '独立答对'])}`;
  const okR = parseResults(good, pack.packId, pack);
  assert.equal(okR.ok, true);
  assert.equal(okR.applied.length, 3);

  const badR = parseResults(`[n08w-20261110-10-deadbeef] ${lineFor(q, ['独立答对', '独立答对', '独立答对'])}`, pack.packId, pack);
  assert.equal(badR.ok, false);
  assert.equal(badR.rejected[0].reason, 'PACK_MISMATCH');

  const stalePack = { ...pack, packId: 'n08w-20261101-10-00000000' };
  const staleR = parseResults(lineFor(q, ['独立答对', '独立答对', '独立答对']), pack.packId, stalePack);
  assert.equal(staleR.ok, false);
  assert.equal(staleR.rejected[0].reason, 'PACK_MISMATCH');
});

test('parseResults: 同一 packId 同一天重复回贴是幂等的', () => {
  const pack = build();
  const text = lineFor(pack.questions[0], ['独立答对', '独立答对', '独立答对']);
  const first = parseResults(text, pack.packId, pack);
  assert.equal(first.ok, true);

  const stamped = stampSubmit(pack, first, { today: '2026-11-15' });
  assert.equal(stamped.submits.length, 1);
  assert.equal(pack.submits, undefined, 'stampSubmit 不得改入参');

  const second = parseResults(text, pack.packId, stamped);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'DUPLICATE_SUBMIT');
  assert.deepEqual(second.applied, [], '第二遍 applied 必须为空');
  assert.deepEqual(second.scores, { m1: { pass: 0, hint: 0, fail: 0 }, m2: { pass: 0, hint: 0, fail: 0 }, m3: { pass: 0, hint: 0, fail: 0 } });
});

test('parseResults: 部分行被拒时 ok=false，且不静默吞掉合法行以外的内容', () => {
  const pack = build();
  const text = [
    lineFor(pack.questions[0], ['独立答对', '独立答对', '独立答对']),
    'w20261115-99999 | 独立答对 | 独立答对 | 独立答对',
    '纯说明文字，不含题号也没有竖线，应被跳过'
  ].join('\n');
  const r = parseResults(text, pack.packId, pack);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'PARTIAL_REJECTED');
  assert.equal(r.applied.length, 3);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].reason, 'UNKNOWN_ID');
});

test('parseResults: 空回贴与缺包号有明确返回', () => {
  const pack = build();
  const empty = parseResults('', pack.packId, pack);
  assert.equal(empty.ok, false);
  assert.equal(empty.reason, 'EMPTY_SUBMIT');
  const noPack = parseResults('x', '', { questions: [] });
  assert.equal(noPack.ok, false);
  assert.equal(noPack.reason, 'NO_PACK');
});

/* ---------------------------- 优先级 ---------------------------- */

const fullPackParsed = (pack, results, qIndexes = [0, 1]) => {
  const lines = qIndexes.map((i) => lineFor(pack.questions[i], results));
  return parseResults(lines.join('\n'), pack.packId, pack);
};

test('updatePriority: 不改入参、不删条目', () => {
  const pack = build();
  const parsed = fullPackParsed(pack, ['不会', '不会', '不会']);
  const state0 = { version: 1, appliedDays: [], items: { keepme: { key: 'keepme', priority: 70, status: 'weak' } } };
  const snapshot = JSON.stringify(state0);
  const next = updatePriority(state0, parsed, { today: '2026-11-15' });
  assert.equal(JSON.stringify(state0), snapshot, 'state 入参不得被修改');
  assert.ok(next !== state0);
  assert.ok(next.items.keepme, '未参与本次回填的条目不得被删除');
  assert.equal(next.items.keepme.priority, 70);
  assert.equal(next.appliedDays.at(-1), '2026-11-15');
  assert.equal(next.items[pack.questions[0].source.key].priority, 56, '「不会」应 +6');
  assert.equal(next.items[pack.questions[0].source.key].status, 'weak');
});

test('updatePriority: 「不会」+6、「提示后答对」+4 提升优先级', () => {
  const pack = build();
  const fail = updatePriority(emptyState(), fullPackParsed(pack, ['不会', '不会', '不会']), { today: '2026-11-15' });
  const hint = updatePriority(emptyState(), fullPackParsed(pack, ['提示后答对', '提示后答对', '提示后答对']), { today: '2026-11-15' });
  const key = pack.questions[0].source.key;
  assert.equal(fail.items[key].priority, 56);
  assert.equal(hint.items[key].priority, 54);
  assert.equal(fail.items[key].lastResult, '不会');
});

test('updatePriority: 连续 2 次全模式独立答对才降优先级', () => {
  const pack = build();
  const pass = ['独立答对', '独立答对', '独立答对'];
  const d1 = updatePriority(emptyState(), fullPackParsed(pack, pass), { today: '2026-11-15' });
  const key = pack.questions[0].source.key;
  assert.equal(d1.items[key].priority, 50, '首次独立答对不应立刻降优先级');
  assert.equal(d1.items[key].cleanPass, 1);
  const d2 = updatePriority(d1, fullPackParsed(pack, pass), { today: '2026-11-16' });
  assert.equal(d2.items[key].priority, 45, '连续第 2 次独立答对应 -5');
  assert.equal(d2.items[key].cleanPass, 2);
});

test('updatePriority: 同一天重复计分被忽略', () => {
  const pack = build();
  const fail = ['不会', '不会', '不会'];
  const once = updatePriority(emptyState(), fullPackParsed(pack, fail), { today: '2026-11-15' });
  const twice = updatePriority(once, fullPackParsed(pack, fail), { today: '2026-11-15' });
  assert.deepEqual(twice, once, '同一天第二次回填不得再计分');
  const nextDay = updatePriority(once, fullPackParsed(pack, fail), { today: '2026-11-16' });
  const key = pack.questions[0].source.key;
  assert.equal(nextDay.items[key].priority, 62, '换天应继续累计');
});

test('updatePriority: 只做词组题（模式 1）答对不得把模式 2/3 标成已掌握', () => {
  const pack = build();
  const q = pack.questions.find((x) => x.mode === 1);
  const m1Only = { ok: true, applied: [{ id: q.id, mode: 1, result: '独立答对', key: q.source.key, source: q.source }] };
  const s1 = updatePriority(emptyState(), m1Only, { today: '2026-11-15' });
  const s2 = updatePriority(s1, m1Only, { today: '2026-11-16' });
  const item = s2.items[q.source.key];
  assert.equal(item.mastered.m1, true, '模式 1 连续两次独立答对可标记该模式已掌握');
  assert.equal(item.mastered.m2, false, '模式 2 不得因词组题答对而掌握');
  assert.equal(item.mastered.m3, false, '模式 3 不得因词组题答对而掌握');
  assert.notEqual(item.status, 'mastered');
  assert.equal(item.priority, 50, '不完整的回填不触发降级');
});

test('updatePriority: 三种模式都连续独立答对才标记 mastered', () => {
  const pack = build();
  const pass = ['独立答对', '独立答对', '独立答对'];
  let s = updatePriority(emptyState(), fullPackParsed(pack, pass), { today: '2026-11-15' });
  s = updatePriority(s, fullPackParsed(pack, pass), { today: '2026-11-16' });
  const key = pack.questions[0].source.key;
  assert.deepEqual(s.items[key].mastered, { m1: true, m2: true, m3: true });
  assert.equal(s.items[key].status, 'mastered');
});

test('updatePriority: 未通过的回填不落库（parsed.ok=false 直接返回克隆）', () => {
  const state0 = emptyState();
  const rejected = { ok: false, reason: 'PARTIAL_REJECTED', applied: [{ id: 'w20261115-1', mode: 1, result: '不会', key: 'c01' }] };
  const next = updatePriority(state0, rejected, { today: '2026-11-15' });
  assert.deepEqual(next, state0);
  assert.notEqual(next, state0);
});

/* ---------------------------- 端到端串联 ---------------------------- */

test('端到端：组包 → 回贴 → 计分 → 下一次生成仍稳定', () => {
  const pack = build();
  const lines = pack.questions.map((q, i) => lineFor(q, i === 0 ? ['不会', '提示后答对', '独立答对'] : ['独立答对', '独立答对', '独立答对']));
  const parsed = parseResults(`[训练复盘]\n${lines.join('\n')}\n[/训练复盘]`, pack.packId, pack);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.applied.length, 30);
  assert.deepEqual(parsed.scores.m1, { pass: 9, hint: 0, fail: 1 });

  const state = updatePriority(emptyState(), parsed, { today: '2026-11-15' });
  assert.equal(Object.keys(state.items).length, 10);
  const failKey = pack.questions[0].source.key;
  assert.ok(state.items[failKey].priority > 50);

  // 下周同一 seed 换 now：题号日期变、结构不变
  const nextWeek = buildWeeklyPack({ items: ITEMS, size: 10, seed: 'week-47', now: new Date(2026, 10, 22, 9, 30, 0) });
  assert.equal(nextWeek.questions.length, 10);
  assert.ok(nextWeek.questions.every((q) => q.id.startsWith('w20261122-')));
  assert.notEqual(nextWeek.packId, pack.packId);
});
