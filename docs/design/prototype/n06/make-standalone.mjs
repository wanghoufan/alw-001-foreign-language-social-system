#!/usr/bin/env node
/**
 * N06 单文件构建：把原型 CSS / JS 与 13 个示范地点的现有 webp 图片内联成
 * 一个可独立双击打开的 standalone.html。
 *
 * 约束：
 * - 只读现有仓库素材，不下载、不改素材、不重新编码图片；
 * - 不写正式 APP、数据库或其他目录；
 * - 输出目录 standalone-test/ 只放一个 HTML，用于证明 file:// 下不依赖仓库其他路径；
 * - HTML 内不写构建时间，保证同一输入重复生成字节一致。
 *
 * 用法：node make-standalone.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(ROOT, 'standalone-test');
const OUT_HTML = path.join(OUT_DIR, 'standalone.html');
const OUT_INFO = path.join(ROOT, 'standalone-build.json');
const INDEX = path.join(ROOT, 'index.html');
const CSS = path.join(ROOT, 'assets', 'app.css');
const REPO_DATA = path.join(ROOT, 'assets', 'repo-data.js');
const DATA = path.join(ROOT, 'assets', 'data.js');
const APP = path.join(ROOT, 'assets', 'app.js');
const IMG_ROOT = path.resolve(ROOT, '..', '..', '..', '成果整理', 'Hainan-Travel-Guide', 'images');
const MANIFEST = path.resolve(ROOT, '..', '..', '..', '成果整理', 'Hainan-Travel-Guide', 'data', 'PHOTO_MANIFEST.csv');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');
const posix = p => p.split(path.sep).join('/');

function mustReplace(text, from, to, label) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`内部锚点不唯一或缺失：${label}（出现 ${n} 次）`);
  return text.replace(from, () => to);
}

/* 读取 CSV（支持双引号转义），用于回查图片的来源与许可记录。 */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const indexHtml = read(INDEX);
const css = read(CSS);
const repoData = read(REPO_DATA);
const data = read(DATA);
const app = read(APP);

/* 用 VM 执行现有数据脚本，拿到与页面完全一致的 13 个示范地点。 */
const sandbox = { window: {} };
vm.runInNewContext(repoData + '\n' + data, sandbox, { filename: 'data.js' });
const places = sandbox.window.N06 && sandbox.window.N06.places;
if (!Array.isArray(places) || places.length !== 13) {
  throw new Error('示范地点数量异常：' + (places && places.length));
}

/* 逐张读取现有归档图片，编码成 data URI；找不到就记录缺口，不静默跳过。
 * p.photos 已在数据层剔除“已核实错配 / 来源未登记”的槽位，
 * 这些图不得进入单文件；下面还会对 photoExclusions 再做一次硬断言。 */
const images = [];
const missing = [];
const map = {};
const excluded = [];
for (const p of places) {
  for (const ex of (p.photoExclusions || [])) {
    excluded.push({
      placeId: p.id, place: p.cnName, slot: ex.slot, path: ex.path,
      source: ex.source || '', reason: ex.reason,
      archiveFileStillPresent: fs.existsSync(path.join(IMG_ROOT, ex.path))
    });
  }
  for (const slot of p.photos) {
    const rel = `${p.cityFolder}/${String(p.id).padStart(3, '0')}/0${slot}.webp`;
    const abs = path.join(IMG_ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push({ placeId: p.id, place: p.cnName, slot, path: posix(rel), reason: '磁盘上不存在' });
      continue;
    }
    if (excluded.some(e => e.placeId === p.id && e.slot === slot)) {
      throw new Error(`已排除的图片仍出现在 photos：${rel}`);
    }
    const buf = fs.readFileSync(abs);
    if (buf.length < 1000 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') {
      throw new Error('不是有效 webp：' + rel);
    }
    map[rel] = 'data:image/webp;base64,' + buf.toString('base64');
    images.push({ placeId: p.id, place: p.cnName, slot, path: posix(rel), bytes: buf.length, sha256: sha256(buf) });
  }
  for (let slot = 1; slot <= p.declaredPhotos; slot++) {
    const isExcluded = excluded.some(e => e.placeId === p.id && e.slot === slot);
    if (!p.photos.includes(slot) && !isExcluded) {
      missing.push({ placeId: p.id, place: p.cnName, slot, path: null, reason: p.photos.length ? `现有数据只归档 ${p.photos.length} 张可用图，保留页面缺图提示` : '现有数据没有可用图，保留页面缺图提示' });
    }
  }
}

if (images.length === 0) throw new Error('没有可嵌入的图片，拒绝生成空单文件');
for (const ex of excluded) {
  if (map[ex.path]) throw new Error('单文件仍内嵌已排除图片：' + ex.path);
}

/* 回查 PHOTO_MANIFEST.csv 的来源与许可记录；没有记录就明确写“未核实”。 */
const manifest = parseCsv(fs.readFileSync(MANIFEST, 'utf8'));
const mHead = manifest[0];
const col = name => mHead.indexOf(name);
const mLocal = col('local_path');
const mLicense = col('license_or_permission');
const mCreator = col('creator');
const mSource = col('source_page');
const mStatus = col('status');
const byPath = new Map();
for (const r of manifest.slice(1)) {
  if (r[mLocal]) byPath.set(r[mLocal], r);
}
for (const img of images) {
  const r = byPath.get('images/' + img.path);
  if (r) {
    img.licenseRecord = {
      license: r[mLicense] || '',
      creator: r[mCreator] || '',
      sourcePage: r[mSource] || '',
      status: r[mStatus] || '',
      manifest: 'docs/成果整理/Hainan-Travel-Guide/data/PHOTO_MANIFEST.csv'
    };
  } else {
    img.licenseRecord = {
      license: '未记录',
      creator: '',
      sourcePage: '',
      status: '',
      manifest: null,
      note: '该文件未出现在 PHOTO_MANIFEST.csv，许可未核实；不得表述为已确认'
    };
  }
}

/* 把外部引用换成内联内容；photoUrl 优先使用内嵌图，保持源码行为不变。 */
const photoUrlAnchor = `  function photoUrl(p, slot) {
    return encodeURI(IMG_ROOT + p.cityFolder + '/' + String(p.id).padStart(3, '0') + '/0' + slot + '.webp');
  }`;
const photoUrlPatched = `  function photoUrl(p, slot) {
    var key = p.cityFolder + '/' + String(p.id).padStart(3, '0') + '/0' + slot + '.webp';
    var emb = window.N06_STANDALONE_IMAGES;
    if (emb && emb[key]) return emb[key];
    return encodeURI(IMG_ROOT + key);
  }`;
const appPatched = mustReplace(app, photoUrlAnchor, photoUrlPatched, 'app.js photoUrl');

let html = indexHtml;
html = mustReplace(
  html,
  '<link rel="stylesheet" href="assets/app.css">',
  `<style>\n${css}\n</style>`,
  'index.html app.css'
);
html = mustReplace(
  html,
  '<script src="assets/repo-data.js"></script>',
  `<script>\n${repoData}\n</script>`,
  'index.html repo-data.js'
);
html = mustReplace(
  html,
  '<script src="assets/data.js"></script>',
  `<script>\n${data}\n</script>`,
  'index.html data.js'
);
html = mustReplace(
  html,
  '<script src="assets/app.js"></script>',
  `<script>\n/* 内嵌图片：键与归档相对路径一致，仅来自现有仓库素材 */\nwindow.N06_STANDALONE_IMAGES = ${JSON.stringify(map)};\n</script>\n<script>\n${appPatched}\n</script>`,
  'index.html app.js'
);
html = mustReplace(
  html,
  '<!doctype html>\n',
  '<!doctype html>\n<!-- N06 单文件构建（make-standalone.mjs）：内联 CSS/JS 与现有归档图片，未下载、未改素材。 -->\n',
  'doctype'
);

/* 生成后自检：没有残留外部引用，图片全部以 data URI 出现。 */
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(html)) {
  throw new Error('单文件仍含外部 script/link 引用');
}
if (html.split('data:image/webp;base64,').length - 1 !== images.length) {
  throw new Error('内嵌图片数量与清单不一致');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_HTML, html);
const outBuf = fs.readFileSync(OUT_HTML);
const outHash = sha256(outBuf);
const info = {
  generatedAt: new Date().toISOString(),
  output: posix(path.relative(ROOT, OUT_HTML)),
  outputBytes: outBuf.length,
  outputSha256: outHash,
  source: {
    index: 'index.html',
    css: 'assets/app.css',
    data: ['assets/repo-data.js', 'assets/data.js', 'assets/app.js']
  },
  placeCount: places.length,
  places: places.map(p => ({
    placeId: p.id, place: p.cnName,
    declaredPhotos: p.declaredPhotos,
    usableSlots: p.photos.slice(),
    excludedSlots: (p.photoExclusions || []).map(e => e.slot),
    photoCaveats: p.photoCaveats || null
  })),
  imageCount: images.length,
  totalImageBytes: images.reduce((s, i) => s + i.bytes, 0),
  excludedImageCount: excluded.length,
  images,
  excludedPhotos: excluded,
  missingPhotos: missing,
  note: '图片只复用现有仓库归档，未下载、未重新编码；已核实错配或来源未登记的图片列在 excludedPhotos，不进入单文件，原图仍在仓库。未排除的图片仅有 PHOTO_MANIFEST.csv 记录，未逐张重新核验来源页面，按待核实处理。'
};
fs.writeFileSync(OUT_INFO, JSON.stringify(info, null, 2));

console.log(`OUT   ${info.output}`);
console.log(`SIZE  ${(outBuf.length / 1048576).toFixed(2)} MB · ${outBuf.length} bytes`);
console.log(`SHA   ${outHash}`);
console.log(`IMG   ${images.length} 张 · 原始 ${(info.totalImageBytes / 1048576).toFixed(2)} MB · ${places.length} 个地点`);
console.log(`EXCL  ${excluded.length} 张已排除（不内嵌，原图保留在仓库）`);
if (excluded.length) console.log(excluded.map(e => `      #${e.placeId} ${e.place} 第 ${e.slot} 张：${e.reason}`).join('\n'));
console.log(`MISS  ${missing.length} 个槽位保留缺图提示`);
if (missing.length) console.log(missing.map(m => `      #${m.placeId} ${m.place} 第 ${m.slot} 张：${m.reason}`).join('\n'));
console.log(`INFO  ${posix(path.relative(ROOT, OUT_INFO))}`);
