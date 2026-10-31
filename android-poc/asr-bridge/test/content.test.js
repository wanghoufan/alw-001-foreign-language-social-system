import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContent, DEFAULT_PATHS } from '../src/content/index.js';
import { suggestFor } from '../src/content/suggest.js';
import { search } from '../src/content/bm25.js';
import { tokenize } from '../src/content/tokenize.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = {
  v14Path: path.join(HERE, 'fixtures/v14.md'),
  hainanPath: path.join(HERE, 'fixtures/hainan.json'),
  storiesPath: path.join(HERE, 'fixtures/stories.json'),
};
const store = loadContent(FIXTURES);

test('corpus loads V1.4, Hainan and confirmed stories only', () => {
  assert.equal(store.counts.software, 3);
  assert.equal(store.counts.hainan, 2);
  assert.equal(store.counts.stories, 0, 'no unconfirmed personal stories may be loaded');
  assert.ok(store.docs.every((doc) => !String(doc.sourcePath).includes('temp/intros')));
  assert.ok(store.docs.every((doc) => !String(doc.text).includes('temp/intros')));
});

test('V1.4 parses key entries and keeps provenance', () => {
  const p002 = store.docs.find((doc) => doc.ref === 'P002');
  assert.ok(p002);
  assert.match(p002.titleEn, /Personality Quiz/);
  assert.match(p002.en, /I made this fun personality quiz/);
  assert.equal(p002.source, 'v1.4');
  assert.match(p002.sourcePath, /v14\.md$/);

  const p027 = store.docs.find((doc) => doc.ref === 'P027/P062');
  assert.ok(p027);
  assert.deepEqual(p027.ids, ['P027', 'P062']);
});

test('Hainan dataset keeps English names', () => {
  const first = store.docs.find((doc) => doc.ref === 'H1');
  assert.ok(first);
  assert.equal(first.title, '龙兴路');
  assert.equal(first.titleEn, 'Longxing Road');
  assert.equal(first.cityEn, 'Haikou');
});

test('tokenizer handles Chinese bigrams and English words', () => {
  const en = tokenize('Personality Quiz');
  assert.ok(en.includes('en:personality'));
  assert.ok(en.includes('en:quiz'));
  const zh = tokenize('性格测试');
  assert.ok(zh.includes('zh:性格'));
  assert.ok(zh.includes('zh:测试'));
});

test('BM25 ranks the expected topic first', () => {
  const personality = search(store.index, tokenize('personality quiz'), 5, {
    rawQuery: 'personality quiz',
  });
  assert.equal(personality[0].doc.ref, 'P002');

  const family = search(store.index, tokenize('family tree'), 5, { rawQuery: 'family tree' });
  assert.equal(family[0].doc.ref, 'P005');

  const hainan = search(store.index, tokenize('龙兴路'), 5, { rawQuery: '龙兴路' });
  assert.equal(hainan[0].doc.ref, 'H1');
});

test('suggestions are English templates plus source excerpts', () => {
  const result = suggestFor('personality quiz', store, { limit: 3 });
  assert.equal(result.matched, true);
  assert.ok(result.suggestions.length >= 2 && result.suggestions.length <= 3);
  assert.ok(result.suggestions.every((item) => ['question', 'share'].includes(item.kind)));
  assert.ok(result.suggestions.every((item) => item.ref && item.source && item.text));
  assert.ok(result.suggestions.some((item) => item.text.includes('Personality Quiz')));
  assert.ok(result.suggestions.every((item) => !item.text.includes('temp/intros')));

  const hainan = suggestFor('龙兴路', store);
  assert.equal(hainan.matched, true);
  assert.equal(hainan.suggestions[0].ref, 'H1');
  assert.match(hainan.suggestions[0].text, /Longxing Road/);

  const none = suggestFor('qqqqzzzz', store);
  assert.equal(none.matched, false);
  assert.equal(none.suggestions.length, 0);
});

const realCorpusAvailable =
  fs.existsSync(DEFAULT_PATHS.v14) && fs.existsSync(DEFAULT_PATHS.hainan);

test('real corpus is available on this machine', { skip: !realCorpusAvailable }, () => {
  const real = loadContent();
  assert.ok(real.counts.software >= 50, `software=${real.counts.software}`);
  assert.equal(real.counts.hainan, 115);
});
