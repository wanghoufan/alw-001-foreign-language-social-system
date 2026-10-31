/** Parse the approved 115-place Hainan dataset (places.json). */
export function parseHainan(places, { sourcePath = '' } = {}) {
  if (!Array.isArray(places)) throw new TypeError('Hainan places.json 必须是数组');
  const entries = [];
  for (const place of places) {
    const id = Number(place?.id);
    const title = String(place?.name ?? '').trim();
    const titleEn = String(place?.en_name ?? '').trim();
    const city = String(place?.city ?? '').trim();
    const cityEn = String(place?.city_folder ?? '').trim();
    const cn = String(place?.cn ?? '').trim();
    const en = String(place?.en ?? '').trim();
    if (!Number.isFinite(id) || !title || !titleEn) continue;
    entries.push({
      kind: 'hainan',
      source: 'hainan',
      ref: `H${id}`,
      id: `H${id}`,
      title,
      titleCn: title,
      titleEn,
      city,
      cityEn,
      cn,
      en,
      text: [title, titleEn, city, cityEn, cn, en].filter(Boolean).join('\n'),
      sourcePath,
    });
  }
  return entries;
}
