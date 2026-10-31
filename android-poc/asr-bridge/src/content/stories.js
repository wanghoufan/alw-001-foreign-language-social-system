import fs from 'node:fs';

/**
 * Confirmed personal stories only. Entries must be explicitly confirmed by the user;
 * this loader never invents or imports unverified private content.
 */
export function parseStories(raw, { sourcePath = '' } = {}) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.stories) ? raw.stories : [];
  return list
    .filter((story) => story && story.confirmed === true)
    .map((story) => {
      const id = String(story.id ?? '').trim();
      const title = String(story.title ?? story.titleCn ?? '').trim();
      const titleEn = String(story.titleEn ?? '').trim();
      const cn = String(story.textCn ?? story.cn ?? '').trim();
      const en = String(story.textEn ?? story.en ?? '').trim();
      return {
        kind: 'story',
        source: 'story',
        ref: id || title || 'story',
        id: id || undefined,
        title: title || titleEn,
        titleCn: title,
        titleEn,
        cn,
        en,
        questionEn: String(story.questionEn ?? '').trim(),
        text: [title, titleEn, cn, en].filter(Boolean).join('\n'),
        sourcePath,
      };
    })
    .filter((story) => story.text.trim().length > 0);
}

export function loadStories(filePath, options = {}) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parseStories(raw, options);
}
