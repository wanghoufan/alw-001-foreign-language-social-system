const EN_STOP = new Set(
  ('a an the and or but if then else for of to in on at by with from as is are was were be been being ' +
    'i you he she it we they me him her us them my your his its our their this that these those ' +
    'do does did have has had can could should would will just very really so not no yes').split(' '),
);
const ZH_STOP = new Set('的了是我你他她在有和就不也很吗呢吧啊嘛着呢么这那一个'.split(''));

/**
 * Mixed Chinese/English tokenizer for a small, deterministic corpus.
 * English words are kept as-is; Chinese runs produce unigrams + bigrams.
 */
export function tokenize(input) {
  const text = String(input ?? '').toLowerCase();
  const tokens = [];

  for (const match of text.matchAll(/[a-z0-9]+(?:'[a-z]+)?/g)) {
    const word = match[0];
    if (word.length < 2 || EN_STOP.has(word)) continue;
    tokens.push(`en:${word}`);
  }

  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i < run.length; i += 1) {
      const char = run[i];
      if (!ZH_STOP.has(char)) tokens.push(`zh:${char}`);
      if (i + 1 < run.length) tokens.push(`zh:${run.slice(i, i + 2)}`);
    }
  }

  return tokens;
}
