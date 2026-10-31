const K1 = 1.2;
const B = 0.75;

/** Build a tiny in-memory BM25 index. The corpus is small (dozens to hundreds of docs). */
export function buildIndex(docs) {
  const df = new Map();
  let totalLength = 0;

  const prepared = docs.map((doc) => {
    const counts = new Map();
    for (const token of doc.tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    totalLength += doc.tokens.length;
    for (const token of counts.keys()) df.set(token, (df.get(token) ?? 0) + 1);
    return { ...doc, counts, length: doc.tokens.length };
  });

  return {
    docs: prepared,
    df,
    totalLength,
    n: prepared.length,
    avgLength: prepared.length === 0 ? 0 : totalLength / prepared.length,
  };
}

export function search(index, queryTokens, limit = 8, { rawQuery = '' } = {}) {
  if (!index || index.n === 0 || queryTokens.length === 0) return [];
  const queryCounts = new Map();
  for (const token of queryTokens) queryCounts.set(token, (queryCounts.get(token) ?? 0) + 1);
  const normalizedQuery = String(rawQuery).trim().toLowerCase();

  const scored = [];
  for (const doc of index.docs) {
    let score = 0;
    for (const [token, queryFrequency] of queryCounts) {
      const frequency = doc.counts.get(token) ?? 0;
      if (frequency === 0) continue;
      const docsWithToken = index.df.get(token) ?? 0;
      const idf = Math.log(1 + (index.n - docsWithToken + 0.5) / (docsWithToken + 0.5));
      const denominator =
        frequency + K1 * (1 - B + (B * doc.length) / Math.max(index.avgLength, 1));
      score += idf * ((frequency * (K1 + 1)) / denominator) * Math.min(queryFrequency, 2);
    }
    if (score > 0) {
      // An exact title/name mention should beat a neighbour that merely references it in body text.
      const titleHit =
        normalizedQuery.length > 0 &&
        [doc.title, doc.titleEn].some(
          (title) => title && normalizedQuery.includes(String(title).toLowerCase()),
        );
      scored.push({ doc, score, titleHit });
    }
  }

  scored.sort(
    (a, b) =>
      Number(b.titleHit) - Number(a.titleHit) ||
      b.score - a.score ||
      String(a.doc.ref).localeCompare(String(b.doc.ref)),
  );
  return scored.slice(0, limit);
}
