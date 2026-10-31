const HEADING = /^(P\d{3}(?:\s*\/\s*P\d{3})*)\s*[｜|]\s*(.+)$/;

function section(lines, marker) {
  const index = lines.findIndex((line) => marker.test(line));
  if (index < 0) return { text: '', index: -1 };
  const inline = lines[index].replace(marker, '').trim();
  const collected = [];
  for (let i = index + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\*\*/.test(line) || /^###/.test(line) || /^##/.test(line)) break;
    collected.push(line);
  }
  return { text: [inline, collected.join('\n').trim()].filter(Boolean).join('\n'), index };
}

function parseSteps(demoText) {
  const steps = [];
  let current = null;
  for (const rawLine of demoText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+\.\s+\*\*(.+?)\*\*(.*)$/);
    if (numbered) {
      current = { title: numbered[1].trim(), cn: '', en: '' };
      steps.push(current);
      const rest = numbered[2].trim();
      if (rest) {
        const cn = rest.match(/中文[｜|：:]\s*(.+?)(?:\*\*|$)/);
        const en = rest.match(/English[｜|：:]\s*(.+)$/);
        if (cn) current.cn = cn[1].trim();
        if (en) current.en = en[1].replace(/\*\*/g, '').trim();
      }
      continue;
    }
    if (!current) continue;
    const cn = line.match(/^-\s*中文[：:]\s*(.*)$/);
    if (cn) {
      current.cn = cn[1].trim();
      continue;
    }
    const en = line.match(/^-\s*English[：:]\s*(.*)$/i);
    if (en) current.en = en[1].trim();
  }
  return steps;
}

/** Parse the official V1.4 bilingual demo guide. Never reads temp drafts. */
export function parseV14(markdown, { sourcePath = '' } = {}) {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  const blocks = text.split(/^### /m).slice(1);
  const entries = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const heading = lines[0].trim();
    const match = heading.match(HEADING);
    if (!match) continue;

    const ids = match[1].split('/').map((part) => part.trim()).filter(Boolean);
    const fullTitle = match[2].trim();
    const titleParts = fullTitle.split(/\s+·\s+/);
    const titleCn = titleParts[0]?.trim() || fullTitle;
    const titleEn = titleParts.length > 1 ? titleParts.slice(1).join(' · ').trim() : fullTitle;

    const zh = section(lines, /^\*\*中文\*\*\s*/);
    const en = section(lines, /^\*\*English\*\*\s*/i);
    const demoMarker = lines.findIndex((line) => /^\*\*功能演示/.test(line));
    const demo = demoMarker >= 0 ? lines.slice(demoMarker).join('\n').trim() : '';
    const steps = parseSteps(demo);

    const searchable = [titleCn, titleEn, zh.text, en.text, demo].filter(Boolean).join('\n');
    if (!searchable.trim()) continue;

    entries.push({
      kind: 'software',
      source: 'v1.4',
      ref: ids.join('/'),
      id: ids[0],
      ids,
      title: titleCn,
      titleCn,
      titleEn,
      cn: zh.text,
      en: en.text,
      demo,
      steps,
      text: searchable,
      sourcePath,
    });
  }

  return entries;
}
