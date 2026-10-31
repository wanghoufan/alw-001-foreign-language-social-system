import { loadContent } from './index.js';
import { suggestFor } from './suggest.js';

let cached = null;

export function createContentService(options = {}) {
  const store = loadContent(options.paths ?? {});
  return {
    store,
    info() {
      return {
        counts: store.counts,
        paths: store.paths,
        note: 'V1.4 is the only software-intro source; no temp/intros-* drafts are read.',
      };
    },
    suggest(query, limit) {
      return suggestFor(query, store, { limit });
    },
  };
}

/** Lazy singleton so the ASR bridge still starts if content files are temporarily missing. */
export function getContentService(options = {}) {
  if (!cached || options.reload) cached = createContentService(options);
  return cached;
}

export function resetContentService() {
  cached = null;
}
