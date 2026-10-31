import { tokenize } from './tokenize.js';
import { search } from './bm25.js';

function firstSentences(text, maxSentences = 2, maxChars = 320) {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  const sentences = clean.split(/(?<=[.!?])\s+/).slice(0, maxSentences).join(' ');
  return sentences.length > maxChars ? `${sentences.slice(0, maxChars - 1).trimEnd()}…` : sentences;
}

function firstEnglishStep(doc) {
  for (const step of doc.steps ?? []) {
    if (step.en) return step.en;
  }
  return '';
}

function englishExcerpt(doc) {
  return firstSentences(doc.en) || firstSentences(firstEnglishStep(doc));
}

function makeSuggestion({ kind, text, doc, basis }) {
  return {
    kind,
    text,
    source: doc.source,
    ref: doc.ref,
    title: doc.titleEn || doc.title,
    basis: basis || '',
  };
}

function suggestionsFor(doc) {
  const out = [];
  const title = doc.titleEn || doc.title;

  if (doc.kind === 'software') {
    out.push(
      makeSuggestion({
        kind: 'question',
        text: `Ask your friend: "Have you tried anything like ${title}?"`,
        doc,
        basis: title,
      }),
    );
    const excerpt = englishExcerpt(doc);
    if (excerpt) {
      out.push(
        makeSuggestion({
          kind: 'share',
          text: `You could say: "${excerpt}"`,
          doc,
          basis: excerpt,
        }),
      );
    }
    const demoStep = (doc.steps ?? []).find(
      (step) => step.en && !excerpt.includes(step.en),
    );
    if (demoStep) {
      out.push(
        makeSuggestion({
          kind: 'share',
          text: `Then you can show them: "${demoStep.en}"`,
          doc,
          basis: demoStep.en,
        }),
      );
    }
    return out;
  }

  if (doc.kind === 'hainan') {
    out.push(
      makeSuggestion({
        kind: 'question',
        text: `Ask your friend: "Have you been to ${title} in ${doc.cityEn || 'Hainan'}?"`,
        doc,
        basis: title,
      }),
    );
    const excerpt = englishExcerpt(doc);
    if (excerpt) {
      out.push(
        makeSuggestion({
          kind: 'share',
          text: `You could say: "${excerpt}"`,
          doc,
          basis: excerpt,
        }),
      );
    }
    return out;
  }

  if (doc.kind === 'story') {
    out.push(
      makeSuggestion({
        kind: 'question',
        text: doc.questionEn
          ? doc.questionEn
          : `Ask your friend: "Can I tell you about ${title}?"`,
        doc,
        basis: doc.questionEn || title,
      }),
    );
    const excerpt = firstSentences(doc.en);
    if (excerpt) {
      out.push(
        makeSuggestion({
          kind: 'share',
          text: `You could say: "${excerpt}"`,
          doc,
          basis: excerpt,
        }),
      );
    }
  }

  return out;
}

/**
 * Deterministic retrieval from the official V1.4 guide, Hainan dataset and confirmed stories.
 * No LLM: questions are templates, shares quote source text verbatim.
 */
export function suggestFor(query, store, { limit = 3 } = {}) {
  const safeLimit = Math.max(1, Math.min(3, Number(limit) || 3));
  const text = String(query ?? '').trim();
  if (!text || !store) {
    return {
      query: text,
      matched: false,
      suggestions: [],
      corpus: store?.counts ?? null,
    };
  }

  const hits = search(store.index, tokenize(text), 12, { rawQuery: text });
  // Keep the dominant domain: a "personality quiz" query should not drift into a Hainan bar.
  const primary = hits[0] ? hits.filter((hit) => hit.doc.kind === hits[0].doc.kind) : [];
  const ordered = primary.length > 0 ? primary : hits;
  const suggestions = [];
  const seen = new Set();

  for (const { doc } of ordered) {
    for (const suggestion of suggestionsFor(doc)) {
      const key = suggestion.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push(suggestion);
      if (suggestions.length >= safeLimit) break;
    }
    if (suggestions.length >= safeLimit) break;
  }

  return {
    query: text,
    matched: suggestions.length > 0,
    suggestions,
    corpus: store.counts,
    note:
      'Deterministic retrieval from the official V1.4 guide and approved datasets; ' +
      'questions are templates, shares quote source text. No LLM generation.',
  };
}
