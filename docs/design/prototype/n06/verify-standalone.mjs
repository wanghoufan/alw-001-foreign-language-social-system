#!/usr/bin/env node
/**
 * N06 单文件验证 + 截图
 * 目标：standalone-test/standalone.html（目录内只有这一个文件），
 * 普通 file:// 直开（不加 --allow-file-access-from-files），
 * 验证所有交互、13 个地点的可用图片、排除图不内嵌、缺图/待核实提示与零外部请求。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.join(ROOT, 'standalone-test');
const TARGET = path.join(TEST_DIR, 'standalone.html');
const BUILD_INFO = path.join(ROOT, 'standalone-build.json');
const SHOTS = path.join(ROOT, 'screenshots-standalone');
const RESULT = path.join(ROOT, 'verify-standalone-result.json');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE_URL = pathToFileURL(TARGET).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
if (!fs.existsSync(TARGET)) { console.error('找不到单文件，请先运行 node make-standalone.mjs'); process.exit(2); }
const build = JSON.parse(fs.readFileSync(BUILD_INFO, 'utf8'));
fs.mkdirSync(SHOTS, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  target: path.relative(ROOT, TARGET),
  targetBytes: fs.statSync(TARGET).size,
  targetSha256: build.outputSha256,
  checks: [], shots: [], photoMatrix: [],
  errors: [], failedRequests: [], requests: []
};
function check(name, ok, detail) {
  report.checks.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

/* ---------- 静态层：文件自身不引用仓库其他路径 ---------- */
const htmlText = fs.readFileSync(TARGET, 'utf8');
const dirEntries = fs.readdirSync(TEST_DIR);
check('测试目录内只有单文件', dirEntries.length === 1 && dirEntries[0] === 'standalone.html', dirEntries.join(', '));
check('HTML 无外部 script / stylesheet 引用', !/<script[^>]+src=|<link[^>]+rel="stylesheet"/.test(htmlText));
check('HTML 未引用 assets/ 目录', !/["'(]assets\//.test(htmlText));
const dataUriCount = htmlText.split('data:image/webp;base64,').length - 1;
check('内嵌图片数等于构建清单（26 张可用素材）', dataUriCount === build.imageCount && dataUriCount === 26, `${dataUriCount} 张`);
const htmlBuf = fs.readFileSync(TARGET);
const htmlHash = crypto.createHash('sha256').update(htmlBuf).digest('hex');
check('单文件 SHA-256 与构建记录一致', htmlHash === build.outputSha256, htmlHash);
check('单文件字节数与构建记录一致', htmlBuf.length === build.outputBytes, `${report.targetBytes} bytes`);

/* 内嵌图片必须与原归档逐字节一致：证明没有二次编码、没有换图。 */
const mapStart = htmlText.indexOf('window.N06_STANDALONE_IMAGES = {');
const mapEnd = htmlText.indexOf(';\n</script>', mapStart);
const embedded = mapStart > 0 && mapEnd > mapStart ? JSON.parse(htmlText.slice(mapStart + 'window.N06_STANDALONE_IMAGES = '.length, mapEnd)) : null;
const integrity = build.images.map(img => {
  const uri = embedded && embedded[img.path];
  if (!uri || !uri.startsWith('data:image/webp;base64,')) return { path: img.path, ok: false, reason: '缺少内嵌图' };
  const buf = Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64');
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const webp = buf.length > 1000 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  return { path: img.path, ok: webp && buf.length === img.bytes && hash === img.sha256, bytes: buf.length };
});
check('内嵌图片与原归档逐字节一致', integrity.length === build.imageCount && integrity.every(i => i.ok), integrity.filter(i => !i.ok).map(i => i.path).join(' | ') || `${integrity.length}/${integrity.length} SHA-256 相同`);

/* 已排除的图片不得出现在单文件里：按路径、按哈希双查。 */
const excluded = build.excludedPhotos || [];
const embeddedValues = embedded ? Object.values(embedded) : [];
const embeddedHashes = new Set(embeddedValues.map(uri => crypto.createHash('sha256').update(Buffer.from(uri.slice('data:image/webp;base64,'.length), 'base64')).digest('hex')));
const leakedPaths = excluded.filter(e => embedded && embedded[e.path]);
check('11 张已排除图片均未内嵌（路径）', excluded.length === 11 && leakedPaths.length === 0, leakedPaths.map(e => e.path).join(' | ') || `${excluded.length} 张均不在映射中`);
const excludedHashes = excluded.filter(e => fs.existsSync(path.resolve(ROOT, '..', '..', '..', '成果整理', 'Hainan-Travel-Guide', 'images', e.path)))
  .map(e => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(ROOT, '..', '..', '..', '成果整理', 'Hainan-Travel-Guide', 'images', e.path))).digest('hex'));
const leakedHashes = excludedHashes.filter(h => embeddedHashes.has(h));
check('已排除图片哈希不在单文件中', excludedHashes.length === 11 && leakedHashes.length === 0, leakedHashes.join(' | ') || '0 个哈希命中');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n06-standalone-'));
const portFile = path.join(profile, 'DevToolsActivePort');
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  'about:blank'
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 120; i++) {
    if (fs.existsSync(portFile)) {
      const txt = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      if (txt[0]) return Number(txt[0]);
    }
    await sleep(100);
  }
  throw new Error('Chrome DevTools 端口未就绪');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 连接失败')); });
    const c = new CDP(ws);
    ws.onmessage = ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method && c.handlers.has(msg.method)) {
        c.handlers.get(msg.method).forEach(fn => fn(msg.params));
      }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 20000);
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  close() { try { this.ws.close(); } catch (e) {} }
}

let cdp;
try {
  const port = await waitPort();
  const pageInfo = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  cdp = await CDP.connect(pageInfo.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });

  cdp.on('Runtime.exceptionThrown', e => report.errors.push(e.exceptionDetails?.text || 'JS exception'));
  cdp.on('Log.entryAdded', e => { if (e.entry.level === 'error') report.errors.push(e.entry.text); });
  cdp.on('Network.loadingFailed', e => { if (!e.canceled) report.failedRequests.push(e.errorText); });
  cdp.on('Network.requestWillBeSent', e => { if (!e.request.url.startsWith('data:')) report.requests.push(e.request.url); });

  const js = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  const waitImages = async () => {
    try {
      await js(`Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 3000); })))`);
    } catch (e) {}
    await sleep(320);
  };
  const setHash = async (hash, wait = 380) => {
    await js(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(wait);
    await waitImages();
  };
  const shot = async (name, opts = {}) => {
    if (opts.top !== false) await js(`window.scrollTo(0, 0)`);
    await sleep(opts.wait || 180);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    report.shots.push(name);
    console.log('SHOT ' + name);
  };
  const slideStates = async () => js(`(() => Array.from(document.querySelectorAll('#gallery .slide')).map((s, i) => {
    const img = s.querySelector('img');
    const fb = s.querySelector('.fallback');
    const fcs = fb ? getComputedStyle(fb) : null;
    const ics = img ? getComputedStyle(img) : null;
    const r = s.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const inView = x > 0 && x < innerWidth && y > 0 && y < innerHeight;
    const hit = inView ? document.elementFromPoint(x, y) : null;
    return {
      i,
      src: img ? img.currentSrc : null,
      loaded: !!img && img.complete && img.naturalWidth > 0,
      naturalW: img ? img.naturalWidth : 0,
      naturalH: img ? img.naturalHeight : 0,
      imgShown: !!img && ics.display !== 'none' && ics.visibility !== 'hidden' && Number(ics.opacity) === 1,
      fbHidden: fb ? fb.hidden : null,
      fbDisplay: fcs ? fcs.display : null,
      fbText: fb ? fb.textContent.trim().replace(/\\s+/g, ' ') : '',
      hitTag: hit ? hit.tagName : null,
      hitIsImg: !!hit && hit.tagName === 'IMG' && hit === img
    };
  }))()`);

  const pixelProof = async (name, selector) => {
    await js(`window.scrollTo(0, 0)`);
    await sleep(180);
    const box = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    report.shots.push(name);
    await js(`window.__shotData = "data:image/png;base64,${data}"`);
    const stats = await js(`new Promise(function (resolve, reject) {
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        var ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0);
        var d = ctx.getImageData(0, 0, c.width, c.height).data;
        var total = d.length / 4, sum = 0, sum2 = 0, bg = 0;
        var colors = new Set();
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2];
          var l = 0.299 * r + 0.587 * g + 0.114 * b;
          sum += l; sum2 += l * l;
          if (r === 246 && g === 249 && b === 246) bg++;
          if (colors.size < 5000) colors.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3));
        }
        var mean = sum / total;
        resolve({ w: im.width, h: im.height, mean: Math.round(mean), sd: Math.round(Math.sqrt(sum2 / total - mean * mean)), bg: Number((bg / total).toFixed(3)), colors: colors.size });
      };
      im.onerror = function () { reject(new Error('像素证据解码失败')); };
      im.src = window.__shotData;
    })`);
    console.log('SHOT ' + name + ' ' + JSON.stringify(stats));
    return stats;
  };

  /* 0. 打开单文件（第一次导航即产生网络记录，后续对比） */
  await cdp.send('Page.navigate', { url: FILE_URL + '#topics/festival' });
  await sleep(900);
  await waitImages();
  try { await js(`localStorage.removeItem('n06.theme')`); } catch (e) {}
  await cdp.send('Page.reload');
  await sleep(900);
  await waitImages();

  /* 0b. 默认主题：清持久化后必须跟随系统（SYSTEM） */
  await js(`document.querySelector('[data-act="more"]').click()`);
  await sleep(300);
  const defaultMode = await js(`(() => { const el = document.querySelector('[data-theme-mode].on'); return el ? el.dataset.themeMode : ''; })()`);
  check('默认主题为跟随系统（SYSTEM）', defaultMode === 'system', defaultMode);
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 1. 五个 Tab */
  const tabs = await js(`Array.from(document.querySelectorAll('.tabbtn')).map(b => b.querySelector('span').textContent)`);
  check('底部恰好五个 Tab 且顺序正确', JSON.stringify(tabs) === JSON.stringify(['话题', '海南', '聊天', '关于我', '人物']), tabs.join('｜'));

  /* 1b. 数据一致性：待确认不与已确认重复；每人有固定聊天示例；作品有 B/C 示范 */
  const dataAudit = await js(`(() => {
    const people = window.N06.people.map(p => ({
      slug: p.slug,
      pendingInConfirmed: p.confirmed.some(c => c.text.trim() === p.pending.text.trim()),
      topics: (p.chatDemo && p.chatDemo.topics || []).length,
      staticNote: !!(p.chatDemo && p.chatDemo.note && p.chatDemo.note.includes('不调用云端 AI'))
    }));
    const works = window.N06.works;
    const fs = window.N06.festivals;
    return { people, total: works.length, a: works.filter(w => w.cat === 'A').length, b: works.filter(w => w.cat === 'B' && w.demoAdded).length, c: works.filter(w => w.cat === 'C' && w.demoAdded).length,
      festivals: { total: fs.length, fixed: fs.filter(f => f.status === 'fixed').length, pending: fs.filter(f => f.status === 'pending').length,
        hainan: fs.filter(f => String(f.region).includes('海南')).map(f => f.id),
        holidayTypes: Array.from(new Set(fs.map(f => f.holidayType))),
        missing: fs.filter(f => !f.id || !f.cn || !f.en || !f.region || !f.theme || !f.dateRule || !f.briefCn || !f.briefEn || !Array.isArray(f.questions) || !Array.isArray(f.sourceUrls) || !f.holidayType || !('verifiedAt' in f) || !Array.isArray(f.relatedPlaceIds)).map(f => f.id),
        noDate: fs.filter(f => f.status === 'pending' && !f.y2026 && !f.y2027).length,
        noSource: fs.filter(f => f.status === 'fixed' && (!Array.isArray(f.sourceUrls) || f.sourceUrls.length === 0) && !f.sourceNote).map(f => f.id),
        badPlaceIds: fs.filter(f => (f.relatedPlaceIds || []).some(id => ![3,4,9,43,62,63,71,78,88,97,99,115,1].includes(id))).map(f => f.id)
      } };
  })()`);
  check('三个虚构人物的待确认事项都不在已确认事实里', dataAudit.people.length === 3 && dataAudit.people.every(p => !p.pendingInConfirmed), JSON.stringify(dataAudit.people));
  check('每个虚构人物都有至少 2 个固定聊天示例并标注不调用云端 AI', dataAudit.people.every(p => p.topics >= 2 && p.staticNote), JSON.stringify(dataAudit.people.map(p => p.slug + ':' + p.topics)));
  check('作品含 9 条 A 类样本与 B/C 分类示范补充', dataAudit.total === 11 && dataAudit.a === 9 && dataAudit.b === 1 && dataAudit.c === 1, JSON.stringify(dataAudit));
  check('47 个节日候选、字段完整且来源/核实日期/关联地点齐全', dataAudit.festivals.total === 47 && dataAudit.festivals.missing.length === 0 && dataAudit.festivals.badPlaceIds.length === 0 && dataAudit.festivals.noSource.length === 0, JSON.stringify(dataAudit.festivals));
  check('节日区分节日本日与公共假期/纪念日', dataAudit.festivals.holidayTypes.length >= 3 && dataAudit.festivals.holidayTypes.includes('festival_day') && dataAudit.festivals.holidayTypes.includes('public_holiday'), dataAudit.festivals.holidayTypes.join(' / '));
  check('包含至少 3 个海南本地节日', dataAudit.festivals.hainan.length >= 3, dataAudit.festivals.hainan.join(', '));
  check('待确认节日不写精确倒计时（无日期或标 pending）', dataAudit.festivals.pending >= 20 && dataAudit.festivals.fixed >= 15, `fixed ${dataAudit.festivals.fixed} / pending ${dataAudit.festivals.pending}`);

  /* 2. 页面自身完全内联 */
  const inline = await js(`({ proto: location.protocol, sheets: document.styleSheets.length, scripts: Array.from(document.scripts).map(s => s.getAttribute('src')), hasMap: !!window.N06_STANDALONE_IMAGES, keys: Object.keys(window.N06_STANDALONE_IMAGES || {}).length })`);
  check('file:// 直开且 CSS/JS 全部内联', inline.proto === 'file:' && inline.sheets > 0 && inline.scripts.every(s => s === null) && inline.hasMap, JSON.stringify({ proto: inline.proto, sheets: inline.sheets, srcs: inline.scripts }));
  check('内嵌图片映射键数与构建清单一致', inline.keys === build.imageCount, `${inline.keys} 键`);

  /* 3. 节日筛选与空态 */
  const festCount14 = await js(`document.querySelectorAll('#festivalList .festival-card').length`);
  check('节日默认「未来 14 天」有候选卡片', festCount14 === 4, `卡片 ${festCount14} 个`);
  await js(`document.querySelector('[data-window="today"]').click()`);
  await sleep(260);
  const todayEmpty = await js(`(document.querySelector('#festivalList .empty')||{}).textContent||''`);
  check('「今天」无匹配时显示空态', todayEmpty.includes('这个范围没有匹配的节日'));
  await js(`document.querySelector('[data-window="all"]').click()`);
  await sleep(260);
  const festAll = await js(`document.querySelectorAll('#festivalList .festival-card').length`);
  check('「全部」展示全部 47 个候选节日', festAll === 47, `卡片 ${festAll} 个`);
  const festCardMeta = await js(`(() => { const c = document.querySelector('#festivalList .festival-card'); return { pills: Array.from(c.querySelectorAll('.fest-pills .pill')).map(x => x.textContent.trim()), summary: (c.querySelector('details summary')||{}).textContent||'', src: (c.querySelector('.fest-src')||{}).textContent||'' }; })()`);
  check('节日卡片标出节日类型与来源核实信息', festCardMeta.pills.some(t => /节日本日|公共假期|纪念|调休/.test(t)) && festCardMeta.summary.includes('来源') && festCardMeta.src.includes('核实日期'), JSON.stringify(festCardMeta).slice(0, 160));
  await js(`document.querySelector('[data-window="14d"]').click()`);
  await sleep(300);
  await shot('s01_topics_festival_393.png');

  /* 4. 海南列表封面：有可用图的地点出图，无图的地点出“待核实”提示，不借用别处图片 */
  await setHash('#hainan');
  const cover = await js(`Array.from(document.querySelectorAll('.place-card')).map(c => {
    const img = c.querySelector('.place-cover img');
    const fb = c.querySelector('.place-cover .fallback');
    return {
      id: c.dataset.place,
      hasImg: !!img,
      ok: !!img && img.complete && img.naturalWidth > 0,
      src: img ? img.currentSrc.slice(0, 22) : '',
      fbVisible: !!fb && getComputedStyle(fb).display !== 'none',
      fbText: fb ? fb.textContent.replace(/\\s+/g, ' ').trim() : '',
      count: (c.querySelector('.photo-count') || {}).textContent || ''
    };
  })`);
  const coverWithImg = cover.filter(c => c.hasImg);
  const coverNoImg = cover.filter(c => !c.hasImg);
  check('13 个封面中 9 个出图且全部加载成功', cover.length === 13 && coverWithImg.length === 9 && coverWithImg.every(c => c.ok && c.src.startsWith('data:image/webp')), `${coverWithImg.filter(c => c.ok).length}/${coverWithImg.length} 张封面`);
  check('无可用照片的 4 个地点显示待核实提示', coverNoImg.length === 4 && coverNoImg.every(c => c.fbVisible && c.fbText.includes('待核实') && c.count.includes('0 图')), coverNoImg.map(c => `#${c.id}:${c.fbText}`).join(' | '));

  /* 5. 骑楼老街详情：3 图 + 提示隐藏 + 命中 IMG */
  await setHash('#hainan/3');
  const gallery = await slideStates();
  check('骑楼老街详情 3 张可用图片加载', gallery.length === 3 && gallery.every(x => x.loaded && x.naturalW >= 600), gallery.map(x => x.naturalW + '×' + x.naturalH).join(' | '));
  check('详情图片全部为内嵌 data:image/webp', gallery.every(x => x.src.startsWith('data:image/webp')), '3/3');
  check('详情缺图提示全部隐藏', gallery.every(x => x.fbHidden === true && x.fbDisplay === 'none'), gallery.map(x => `#${x.i}:${x.fbDisplay}`).join(' '));
  check('详情图片可见，首图 elementFromPoint 命中 IMG（首屏）', gallery.every(x => x.imgShown) && gallery[0].hitIsImg, JSON.stringify(gallery.map(x => ({ i: x.i, shown: x.imgShown, hit: x.hitTag }))));
  const overlays = await js(`(() => {
    const out = [];
    const imgs = Array.from(document.querySelectorAll('img')).filter(i => getComputedStyle(i).display !== 'none');
    document.querySelectorAll('.fallback').forEach(fb => {
      if (getComputedStyle(fb).display === 'none') return;
      const r = fb.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const coversImg = imgs.some(im => { const q = im.getBoundingClientRect(); return x >= q.left && x <= q.right && y >= q.top && y <= q.bottom; });
      if (coversImg && hit && (hit === fb || fb.contains(hit))) out.push(fb.textContent.trim().slice(0, 16));
    });
    return out;
  })()`);
  check('没有可见缺图提示压在照片上', overlays.length === 0, overlays.join(' | ') || '0 处');
  const cjk = await js(`document.querySelector('.textbox p').textContent.length`);
  const enWords = await js(`document.querySelectorAll('.textbox p')[1].textContent.trim().split(/\\s+/).length`);
  check('中文介绍 90–150 字量级', cjk >= 90 && cjk <= 150, `${cjk} 字`);
  check('英文介绍 60–95 词量级', enWords >= 60 && enWords <= 95, `${enWords} 词`);

  const proof = await pixelProof('s02b_hainan_detail_photo_proof_393.png', '#gallery .slide');
  check('首图绘制出照片像素（非纯色板）', proof.sd >= 18 && proof.colors >= 200 && proof.bg <= 0.6, JSON.stringify(proof));
  await sleep(900);
  await shot('s02_hainan_detail_393.png');

  /* 6. 全屏 */
  await js(`document.querySelector('#gallery .slide').click()`);
  await sleep(400);
  const lb1 = await js(`({ on: document.querySelector('#lightbox').classList.contains('on'), count: document.querySelector('#lbCount').textContent, img: !!document.querySelector('#lbStage img') && document.querySelector('#lbStage img').naturalWidth > 0, src: (document.querySelector('#lbStage img')||{}).currentSrc||'' })`);
  check('全屏进入显示 1 / 3 且为内嵌图', lb1.on && lb1.count.trim() === '1 / 3' && lb1.img && lb1.src.startsWith('data:image/webp'), JSON.stringify({ on: lb1.on, count: lb1.count, img: lb1.img }));
  const lbState = await js(`(() => { const img = document.querySelector('#lbStage img'); const fb = document.querySelector('#lbStage .fallback'); const r = img.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { nw: img.naturalWidth, shown: getComputedStyle(img).display !== 'none', fbHidden: fb ? fb.hidden : null, fbDisplay: fb ? getComputedStyle(fb).display : null, hit: hit ? hit.tagName : null }; })()`);
  check('全屏照片可见、提示隐藏且命中 IMG', lbState.nw > 0 && lbState.shown && lbState.fbHidden === true && lbState.fbDisplay === 'none' && lbState.hit === 'IMG', JSON.stringify(lbState));
  await js(`document.querySelector('[data-act="lb-next"]').click()`);
  await sleep(280);
  const lb2 = await js(`document.querySelector('#lbCount').textContent`);
  check('全屏下一张切到 2 / 3', lb2.trim() === '2 / 3', lb2);
  await shot('s03_fullscreen_393.png');
  await js(`document.querySelector('[data-act="lb-close"]').click()`);
  await sleep(260);
  check('全屏可退出', !(await js(`document.querySelector('#lightbox').classList.contains('on')`)));

  /* 6b. 画廊按钮 */
  await js(`document.querySelector('#gallery').scrollLeft = 0`);
  await sleep(240);
  await js(`document.querySelector('[data-act="gallery-next"]').click()`);
  await sleep(700);
  const gNext1 = await js(`({ count: document.querySelector('#galleryCount').textContent.trim(), left: Math.round(document.querySelector('#gallery').scrollLeft) })`);
  check('画廊「下一张」切到 2 / 3 且确实滚动', gNext1.count === '2 / 3' && gNext1.left > 40, JSON.stringify(gNext1));
  await shot('s11_gallery_next_393.png');
  await js(`document.querySelector('[data-act="gallery-next"]').click()`);
  await sleep(700);
  const gNext2 = await js(`({ count: document.querySelector('#galleryCount').textContent.trim(), left: Math.round(document.querySelector('#gallery').scrollLeft) })`);
  check('画廊连续「下一张」切到 3 / 3', gNext2.count === '3 / 3' && gNext2.left > gNext1.left, JSON.stringify(gNext2));
  await js(`document.querySelector('[data-act="gallery-prev"]').click()`);
  await sleep(700);
  check('画廊「上一张」退回 2 / 3', (await js(`document.querySelector('#galleryCount').textContent.trim()`)) === '2 / 3');
  await js(`document.querySelector('#gallery').scrollLeft = 0`);
  await sleep(380);

  /* 6c. 更多按钮 */
  await js(`document.querySelector('[data-act="more"]').click()`);
  await sleep(300);
  const moreSheet = await js(`document.querySelector('#modalBody').textContent`);
  check('更多按钮打开原型设置与范围说明', moreSheet.includes('更多 · 原型设置') && moreSheet.includes('范围与边界') && moreSheet.includes('N06-PROTOTYPE-0.2'), moreSheet.replace(/\\s+/g, ' ').slice(0, 80));
  await shot('s12_more_sheet_393.png');
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 6d. 段落切换 */
  const segBefore = await js(`({ active: (document.querySelector('.seg.on')||{}).textContent||'', title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'' })`);
  await js(`document.querySelectorAll('.seg')[1].click()`);
  await sleep(320);
  const seg2 = await js(`({ active: (document.querySelector('.seg.on')||{}).textContent||'', title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'' })`);
  check('段落切换：第 2 段选中且标题同步', segBefore.active.includes('第 1 段') && seg2.active.includes('第 2 段') && seg2.title.includes('傍晚再走一次'), JSON.stringify({ before: segBefore, after: seg2 }));
  await shot('s13_segments_393.png');
  await js(`document.querySelectorAll('.seg')[0].click()`);
  await sleep(280);
  check('段落切换：可退回第 1 段', (await js(`(document.querySelector('.seg.on')||{}).textContent||''`)).includes('第 1 段'));

  /* 6d2. 旧格式记录：recordId / sourceSpan / 练习日志 / 隐藏的旧 B 版本 */
  await js(`document.querySelectorAll('.seg')[2].click()`);
  await sleep(320);
  const legacy = await js(`(() => { const host = document.querySelector('#recordHost'); const det = Array.from(host.querySelectorAll('details')).find(d => d.querySelector('summary') && d.querySelector('summary').textContent.includes('旧英文 B 版本')); return { title: (host.querySelector('.row .pill')||{}).textContent||'', meta: (host.querySelector('.row .meta')||{}).textContent||'', text: host.textContent, bOpen: det ? det.open : null, bVisible: det ? getComputedStyle(det.querySelector('p.meta')).display !== 'none' : null }; })()`);
  check('旧格式记录保留 recordId / sourceSpan / 练习日志', legacy.meta.includes('旧格式历史兼容') && legacy.text.includes('rec-qilou-legacy') && legacy.text.includes('旧 sourceSpan') && legacy.text.includes('练习日志 2 条'), JSON.stringify({ title: legacy.title, meta: legacy.meta }));
  check('旧英文 B 版本默认折叠隐藏，不覆盖唯一英文正文', legacy.bOpen === false, JSON.stringify({ bOpen: legacy.bOpen }));
  await js(`(() => { const det = Array.from(document.querySelectorAll('#recordHost details')).find(d => d.querySelector('summary') && d.querySelector('summary').textContent.includes('旧英文 B 版本')); det.open = true; })()`);
  await sleep(200);
  const legacyOpen = await js(`(() => { const det = Array.from(document.querySelectorAll('#recordHost details')).find(d => d.querySelector('summary') && d.querySelector('summary').textContent.includes('旧英文 B 版本')); return { open: det.open, text: det.textContent }; })()`);
  check('展开后才显示旧 B 版本并标明仅历史兼容', legacyOpen.open === true && legacyOpen.text.includes('coming on one after another') && legacyOpen.text.includes('仅历史兼容'), legacyOpen.text.replace(/\s+/g, ' ').slice(0, 100));
  await js(`document.querySelectorAll('.seg')[0].click()`);
  await sleep(260);

  /* 6e. 单段粘贴 */
  await js(`document.querySelector('[data-act="import-open"][data-mode="single"]').click()`);
  await sleep(300);
  await js(`(() => { const t = document.querySelector('#importText'); t.value = '这条街的灯在傍晚很好看。 The street lights look lovely in the evening.\\n我们慢慢走回钟楼。 We walked slowly back to the clock tower.\\n傍晚又走了一遍，店铺陆续亮灯，我们顺着骑楼慢慢走回钟楼，没有赶时间。\\nWe walked the same arcade again in the evening as the shops lit up, and we took our time going back to the clock tower.'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  const singlePreview = await js(`document.querySelector('#importPreview').textContent`);
  const segBeforePaste = await js(`document.querySelectorAll('.seg').length`);
  const expBeforePaste = await js(`(document.querySelector('#recordHost .linkbtn')||{}).textContent||''`);
  check('单段粘贴识别为 1 段 / 2 条表达', singlePreview.includes('1 段') && singlePreview.includes('2 条表达') && (await js(`document.querySelector('#importConfirm').disabled`)) === false, singlePreview.replace(/\\s+/g, ' ').slice(0, 70));
  await shot('s14_single_paste_preview_393.png');
  await js(`document.querySelector('#importConfirm').click()`);
  await sleep(550);
  const singleAfter = await js(`({ segs: document.querySelectorAll('.seg').length, more: (document.querySelector('#recordHost .linkbtn')||{}).textContent||'', text: document.querySelector('#recordHost').textContent })`);
  check('单段确认后段数不变、当前段表达 4 → 6 且写入历史', singleAfter.segs === segBeforePaste && segBeforePaste === 3 && expBeforePaste.includes('展开全部 4 条表达') && singleAfter.more.includes('展开全部 6 条表达') && singleAfter.text.includes('粘贴合并到本段'), JSON.stringify({ segs: singleAfter.segs, more: singleAfter.more }));
  await js(`document.querySelector('#recordHost .linkbtn').click()`);
  await sleep(320);
  check('展开全部后当前段显示 6 条表达', (await js(`document.querySelectorAll('#recordHost .exp').length`)) === 6, '6 条');
  await js(`document.querySelector('#recordHost .linkbtn').click()`);
  await sleep(260);

  /* 7. 整篇导入与模糊拒绝 */
  await js(`window.scrollTo(0,0)`);
  await js(`document.querySelector('[data-act="import-open"][data-mode="all"]').click()`);
  await sleep(280);
  await js(`document.querySelector('[data-act="import-sample"]').click()`);
  await sleep(380);
  const preview = await js(`document.querySelector('#importPreview').textContent`);
  const confirmDisabled = await js(`document.querySelector('#importConfirm').disabled`);
  check('整篇粘贴识别为 2 段 / 6 条表达', preview.includes('2 段') && preview.includes('6 条表达') && confirmDisabled === false, preview.replace(/\s+/g, ' ').slice(0, 80));
  await shot('s04_import_preview_393.png');
  const beforeSeg = await js(`document.querySelectorAll('.seg').length`);
  await js(`document.querySelector('#importConfirm').click()`);
  await sleep(500);
  const afterSeg = await js(`document.querySelectorAll('.seg').length`);
  check('确认导入后新增 2 段', afterSeg === beforeSeg + 2, `${beforeSeg} → ${afterSeg}`);
  check('导入后弹窗关闭', !(await js(`document.querySelector('#modal').classList.contains('on')`)));
  await js(`document.querySelector('[data-act="import-open"][data-mode="all"]').click()`);
  await sleep(280);
  await js(`(() => { const t = document.querySelector('#importText'); t.value = '今天天气很好 It is nice today.\\n我们去了骑楼老街。 We went to Qilou.'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(380);
  const errText = await js(`(document.querySelector('#importPreview .err')||{}).textContent||''`);
  const disabled2 = await js(`document.querySelector('#importConfirm').disabled`);
  check('格式模糊时拒绝猜测并禁用导入', errText.includes('没有识别到足够的中文整理段') && disabled2 === true, errText.slice(0, 60));
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(240);

  /* 8. 13 个地点逐页检查：可用槽位出图，排除/缺失槽位出明确提示 */
  const placeRows = build.places || [];
  for (const p of placeRows) {
    const id = p.placeId;
    await setHash('#hainan/' + id);
    const st = await slideStates();
    const declared = await js(`document.querySelectorAll('#gallery .slide').length`);
    const real = st.filter(x => x.loaded && x.src && x.src.startsWith('data:image/webp'));
    const prompt = st.filter(x => !x.loaded && x.fbText);
    const row = {
      placeId: id,
      name: await js(`document.querySelector('.detail-head h2').textContent`),
      declaredSlides: declared,
      usableSlots: p.usableSlots,
      excludedSlots: p.excludedSlots,
      realPhotos: real.length,
      minWidth: real.length ? Math.min(...real.map(x => x.naturalW)) : 0,
      promptSlides: prompt.length,
      promptTexts: prompt.map(x => x.fbText.slice(0, 40)),
      distinctSrc: new Set(real.map(x => x.src)).size
    };
    report.photoMatrix.push(row);
  }
  const totalReal = report.photoMatrix.reduce((s, r) => s + r.realPhotos, 0);
  check('13 个地点逐页共加载 26 张可用图片', report.photoMatrix.length === 13 && totalReal === 26, `${report.photoMatrix.length} 页 · ${totalReal} 张`);
  check('每页可用槽位数与构建清单一致', report.photoMatrix.every(r => r.realPhotos === r.usableSlots.length && r.declaredSlides === (build.places.find(p => p.placeId === r.placeId) || {}).declaredPhotos), report.photoMatrix.map(r => `${r.placeId}:${r.realPhotos}/${r.declaredSlides}`).join(' '));
  check('每页有图时宽度 ≥600px', report.photoMatrix.every(r => r.realPhotos === 0 || r.minWidth >= 600), report.photoMatrix.filter(r => r.realPhotos).map(r => `${r.placeId}:${r.minWidth}px`).join(' '));
  check('每页图片互不重复（无跨地冒充）', report.photoMatrix.every(r => r.distinctSrc === r.realPhotos), report.photoMatrix.map(r => `${r.placeId}:${r.distinctSrc}/${r.realPhotos}`).join(' '));
  check('排除槽位全部显示“已排除（待核实）”提示', report.photoMatrix.every(r => r.excludedSlots.every(slot => r.promptTexts.some(t => t.includes(`第 ${slot} 张已排除`)))), report.photoMatrix.filter(r => r.excludedSlots.length).map(r => `#${r.placeId}→${r.excludedSlots.join(',')}`).join(' '));
  check('62/71/115/1 四个地点 0 张可用图且全部出提示', [62, 71, 115, 1].every(id => { const r = report.photoMatrix.find(x => x.placeId === id); return r && r.realPhotos === 0 && r.promptSlides === r.declaredSlides; }), [62, 71, 115, 1].map(id => { const r = report.photoMatrix.find(x => x.placeId === id); return `${id}:${r.realPhotos}/${r.promptSlides}`; }).join(' '));
  check('西岛（97）保留 2 张可用图 + 1 张已排除提示', (() => { const r = report.photoMatrix.find(x => x.placeId === 97); return r && r.realPhotos === 2 && r.excludedSlots.length === 1 && r.promptSlides === 1; })(), (() => { const r = report.photoMatrix.find(x => x.placeId === 97); return `${r.realPhotos} 图 / ${r.promptSlides} 提示`; })());
  check('骑楼老街（3）3 张图库仍完整可见', (() => { const r = report.photoMatrix.find(x => x.placeId === 3); return r && r.realPhotos === 3 && r.promptSlides === 0 && r.minWidth >= 600; })(), (() => { const r = report.photoMatrix.find(x => x.placeId === 3); return `${r.realPhotos} 图 · 最小宽 ${r.minWidth}px`; })());

  /* 8b. 来源按实际槽位 */
  const src97 = await (async () => { await setHash('#hainan/97'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('西岛来源按实际槽位写：02、03 可用，第 1 张已排除', src97.includes('现有归档 02.webp、03.webp') && src97.includes('第 1 张按清单记录排除') && !src97.includes('01–03'), src97.replace(/\\s+/g, ' '));
  const src1 = await (async () => { await setHash('#hainan/1'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('龙兴路来源写明第 1 张排除、第 2–3 张无归档', src1.includes('第 1 张按清单记录排除') && src1.includes('第 2–3 张无归档') && src1.includes('本页没有可用照片'), src1.replace(/\\s+/g, ' '));
  const src62 = await (async () => { await setHash('#hainan/62'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('石头公园来源写明 3 张全部排除、无可用照片', src62.includes('第 1–3 张按清单记录排除') && src62.includes('本页没有可用照片'), src62.replace(/\\s+/g, ' '));

  /* 8b-2. 来源明细折叠：证据保留在 DOM，首屏让位给介绍正文 */
  const sourceFold = await (async () => {
    await setHash('#hainan/3');
    return js(`(() => {
      const body = document.querySelector('.detail-body');
      const d = body.querySelector('details.source-details');
      const intro = body.querySelector('.textbox p');
      const meta = body.querySelector('p.meta');
      return {
        has: !!d,
        open: d ? d.open : null,
        summary: d ? d.querySelector('summary').textContent.replace(/\\s+/g, ' ').trim() : '',
        text: d ? d.textContent.replace(/\\s+/g, ' ') : '',
        introBefore: !!(intro && d && (intro.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)),
        firstMetaIsSource: !!meta && meta.textContent.includes('来源：')
      };
    })()`);
  })();
  check('来源明细收进默认折叠的「照片来源说明」', sourceFold.has && sourceFold.open === false && sourceFold.summary.includes('照片来源说明'), JSON.stringify({ open: sourceFold.open, summary: sourceFold.summary }));
  check('折叠内保留 PHOTO_MANIFEST.csv、逐张归档文件名与待核实说明', sourceFold.text.includes('PHOTO_MANIFEST.csv') && sourceFold.text.includes('现有归档 01.webp、02.webp、03.webp') && sourceFold.text.includes('待核实'), sourceFold.text.replace(/\\s+/g, ' ').slice(0, 120));
  check('中文介绍排在照片来源折叠之前（紧随图库与地点信息）', sourceFold.introBefore && sourceFold.firstMetaIsSource, JSON.stringify({ introBefore: sourceFold.introBefore, firstMetaIsSource: sourceFold.firstMetaIsSource }));
  const sourceOpen = await js(`(() => {
    const d = document.querySelector('details.source-details');
    d.open = true;
    d.scrollIntoView({ block: 'center' });
    const r = d.getBoundingClientRect();
    return { open: d.open, h: Math.round(r.height), visible: r.height > 40 && getComputedStyle(d).display !== 'none' };
  })()`);
  await sleep(220);
  await shot('s02b_hainan_source_details_393.png', { top: false });
  check('展开后可看到完整来源明细（证据可查，不是被删除）', sourceOpen.open === true && sourceOpen.visible, JSON.stringify(sourceOpen));

  /* 8c. 慢图不误报缺图 */
  const slowStates = await js(`({ pending: window.__n06ImgState({ complete: false, naturalWidth: 0 }), failed: window.__n06ImgState({ complete: true, naturalWidth: 0 }), ok: window.__n06ImgState({ complete: true, naturalWidth: 800 }) })`);
  check('图片状态分为 pending / failed / ok，加载中不判失败', slowStates.pending === 'pending' && slowStates.failed === 'failed' && slowStates.ok === 'ok', JSON.stringify(slowStates));
  const slowRun = await js(`(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-9999px;top:0;width:200px;height:120px';
    const img = document.createElement('img');
    const fb = document.createElement('span'); fb.className = 'fallback'; fb.hidden = true;
    const sh = document.createElement('span'); sh.className = 'slowhint'; sh.hidden = true;
    host.appendChild(img); host.appendChild(fb); host.appendChild(sh); document.body.appendChild(host);
    const fake = { complete: false, naturalWidth: 0, style: { display: '' }, parentElement: host };
    window.__n06ImgError(fake);
    await new Promise(r => setTimeout(r, 3600));
    const during = { fbHidden: fb.hidden, slowHidden: sh.hidden, display: fake.style.display || '' };
    fake.complete = true;
    await new Promise(r => setTimeout(r, 700));
    const after = { fbHidden: fb.hidden, slowHidden: sh.hidden, display: fake.style.display || '', state: window.__n06ImgState(fake) };
    host.remove();
    return { during, after };
  })()`);
  check('加载 3.6 秒仍在等待：只出“加载较慢”，不隐藏图片、不误报缺图', slowRun.during.fbHidden === true && slowRun.during.slowHidden === false && slowRun.during.display !== 'none', JSON.stringify(slowRun.during));
  check('确认解码失败后才隐藏图片并亮出缺图提示', slowRun.after.fbHidden === false && slowRun.after.slowHidden === true && slowRun.after.display === 'none' && slowRun.after.state === 'failed', JSON.stringify(slowRun.after));

  /* 9. 缺图地点（1 张已排除 + 2 张缺失）：3 处明确提示，无图可借 */
  await setHash('#hainan/1');
  const miss = await js(`(() => {
    const slides = Array.from(document.querySelectorAll('#gallery .slide'));
    const imgs = Array.from(document.querySelectorAll('#gallery img'));
    const fbs = Array.from(document.querySelectorAll('#gallery .fallback'));
    return {
      imgs: imgs.length,
      loadedImgs: imgs.filter(i => i.complete && i.naturalWidth > 0).length,
      missingSlides: slides.filter(s => !s.querySelector('img') && s.querySelector('.fallback:not([hidden])')).length,
      visibleFallbacks: fbs.filter(f => getComputedStyle(f).display !== 'none').length,
      hiddenFallbacks: fbs.filter(f => f.hidden && getComputedStyle(f).display === 'none').length,
      texts: fbs.filter(f => getComputedStyle(f).display !== 'none').map(f => f.textContent.replace(/\\s+/g, ' ').trim())
    };
  })()`);
  check('龙兴路：0 张可用图 + 3 处可见提示', miss.imgs === 0 && miss.loadedImgs === 0 && miss.missingSlides === 3 && miss.visibleFallbacks === 3 && miss.hiddenFallbacks === 0, JSON.stringify({ imgs: miss.imgs, prompts: miss.visibleFallbacks }));
  check('龙兴路第 1 张标“已排除待核实”，其余标“待补图”', miss.texts.length === 3 && miss.texts[0].includes('已排除') && miss.texts[0].includes('来源与许可均未登记') && miss.texts.slice(1).every(t => t.includes('待补图') && t.includes('不用其他地点图片冒充')), miss.texts.join(' | '));
  await js(`document.querySelector('#toast').classList.remove('on')`);
  await js(`(() => { const g = document.querySelector('#gallery'); const s = g && g.children[1]; if (s) g.scrollLeft = s.offsetLeft - 14; })()`);
  await sleep(420);
  await shot('s05_missing_photo_393.png');

  /* 10. 聊天：固定示例、按人物切换、分享换题 */
  await setHash('#chat');
  const chatOliver = await js(`({ text: document.querySelector('.content').textContent, tags: Array.from(document.querySelectorAll('.tagbtn')).map(b => b.textContent), follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', probe: (document.querySelectorAll('.coach-card .en')[1]||{}).textContent||'', basis: Array.from(document.querySelectorAll('.coach-card .basis')).map(x => x.textContent), topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'' })`);
  check('聊天页明确标注固定示例，不声称 AI 实时理解', chatOliver.text.includes('固定示例') && chatOliver.text.includes('不会根据你的输入实时理解') && chatOliver.text.includes('不调用云端 AI'), chatOliver.topic);
  check('Oliver 页不出现美国感恩节固定建议', !chatOliver.text.includes('感恩节') && !chatOliver.text.includes('Thanksgiving'), '0 处');
  check('接话与追问和当前对话一致并各自给出依据', chatOliver.follow.includes('How did the last set feel') && chatOliver.probe.includes('pull-up') && chatOliver.basis.length === 2, chatOliver.basis.join(' | '));
  check('聊天底部有地点、节日、人物三个小标签', chatOliver.tags.length === 3 && chatOliver.tags.some(x => x.includes('地点')) && chatOliver.tags.some(x => x.includes('节日')) && chatOliver.tags.some(x => x.includes('人物')), chatOliver.tags.join(' | '));
  await shot('s06_chat_393.png');
  await js(`document.querySelector('.tagbtn[data-tag="festival"]').click()`);
  await sleep(320);
  const tagSheet = await js(`({ text: document.querySelector('#modalBody').textContent, cards: document.querySelectorAll('#modalBody .qcard').length })`);
  check('节日标签给出可选话题并声明不推断对方是否庆祝', tagSheet.text.includes('不推断') && tagSheet.cards >= 1 && !tagSheet.text.includes('感恩节'), JSON.stringify({ cards: tagSheet.cards }));
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(220);

  await js(`(() => { const s = document.querySelector('#chatPerson'); s.value = 'maya'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  const chatMaya = await js(`({ text: document.querySelector('.content').textContent, topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'', follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', thread: (document.querySelector('#chatThread')||{}).textContent||'' })`);
  check('切换人物后对话、话题与接话都换成该人物样本', chatMaya.thread.includes('poster') && chatMaya.topic.includes('海报与演出') && chatMaya.follow.includes('Hand-drawn'), JSON.stringify({ topic: chatMaya.topic }));
  check('切换人物后不再残留 Oliver 的训练建议', !chatMaya.text.includes('pull-up') && !chatMaya.text.includes('引体向上'), '0 处残留');
  await shot('s06c_chat_maya_393.png');
  await js(`document.querySelector('[data-act="chat-share"]').click()`);
  await sleep(320);
  const chatShare = await js(`({ text: document.querySelector('#modalBody').textContent, topics: document.querySelectorAll('[data-chat-topic]').length })`);
  check('聊天页有「分享 / 换题」控件和至少 2 个固定话题', chatShare.text.includes('分享 / 换题') && chatShare.text.includes('固定示例') && chatShare.topics >= 2, JSON.stringify({ topics: chatShare.topics }));
  await shot('s17_chat_share_393.png');
  await js(`document.querySelector('[data-chat-topic="maya-haikou"]').click()`);
  await sleep(450);
  const chatSwitched = await js(`({ topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'', follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', thread: (document.querySelector('#chatThread')||{}).textContent||'', sheet: document.querySelector('#modal').classList.contains('on') })`);
  check('换题后话题、对话与接话同步切换且弹层关闭', chatSwitched.topic.includes('海口行程') && chatSwitched.follow.includes('Four or five days') && chatSwitched.thread.includes('comparing dates') && chatSwitched.sheet === false, JSON.stringify({ topic: chatSwitched.topic }));

  /* 11. 我的作品：搜索、B/C 分类、分享 */
  await setHash('#topics/works');
  const worksAll = await js(`document.querySelectorAll('#workList .work-card').length`);
  await js(`(() => { const i = document.querySelector('#workSearch'); i.value = '提词器'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(280);
  const worksFiltered = await js(`document.querySelectorAll('#workList .work-card').length`);
  check('我的作品搜索可过滤', worksAll === 11 && worksFiltered === 1, `${worksAll} → ${worksFiltered}`);
  await js(`(() => { const i = document.querySelector('#workSearch'); i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(220);
  await js(`document.querySelector('[data-workcat="B"]').click()`);
  await sleep(280);
  const catB = await js(`({ n: document.querySelectorAll('#workList .work-card').length, label: (document.querySelector('#workList .work-card .en')||{}).textContent||'' })`);
  check('B 类筛选不是死路且标为分类示范补充', catB.n === 1 && catB.label.includes('B 类') && catB.label.includes('分类示范补充'), JSON.stringify(catB));
  await shot('s15_works_cat_b_393.png');
  await js(`document.querySelector('[data-workcat="C"]').click()`);
  await sleep(280);
  const catC = await js(`({ n: document.querySelectorAll('#workList .work-card').length, label: (document.querySelector('#workList .work-card .en')||{}).textContent||'' })`);
  check('C 类筛选不是死路且标为分类示范补充', catC.n === 1 && catC.label.includes('C 类') && catC.label.includes('分类示范补充'), JSON.stringify(catC));
  await js(`document.querySelector('[data-workcat="全部"]').click()`);
  await sleep(280);
  await shot('s07_works_393.png');

  await setHash('#topics/works/P002');
  await js(`document.querySelector('[data-act="work-share"]').click()`);
  await sleep(300);
  const workShareSheet = await js(`document.querySelector('#modalBody').textContent`);
  check('作品详情有分享作品入口', workShareSheet.includes('分享作品') && workShareSheet.includes('调起系统分享') && workShareSheet.includes('复制中英介绍'), workShareSheet.replace(/\\s+/g, ' ').slice(0, 70));
  await shot('s16_work_share_393.png');
  const workShared = await js(`(async () => {
    let captured = null, stubbed = false;
    try {
      Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: (p) => { captured = p; return Promise.resolve(); } });
      stubbed = true;
    } catch (e) {
      try { navigator.share = (p) => { captured = p; return Promise.resolve(); }; stubbed = true; } catch (e2) { stubbed = false; }
    }
    document.querySelector('[data-act="work-share-native"]').click();
    await new Promise(r => setTimeout(r, 200));
    return { captured, stubbed };
  })()`);
  check('作品分享调用系统分享并带中英介绍', workShared.stubbed && workShared.captured && workShared.captured.text.includes('人生物种测试') && workShared.captured.text.includes('personality quiz'), JSON.stringify({ stubbed: workShared.stubbed }));
  await js(`try { delete navigator.share } catch (e) {}`);
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 12. 关于我 / 人物 */
  await setHash('#self');
  const selfAll = await js(`document.querySelectorAll('#storyList .story-card').length`);
  await js(`(() => { const i = document.querySelector('#selfSearch'); i.value = '海口'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(280);
  const selfFiltered = await js(`document.querySelectorAll('#storyList .story-card').length`);
  check('关于我搜索保留且可用', selfAll === 5 && selfFiltered === 1, `${selfAll} → ${selfFiltered}`);
  check('关于我中英同时可见', await js(`document.querySelectorAll('#storyList .story-card .cn').length > 0 && document.querySelectorAll('#storyList .story-card .en').length > 0`));
  await js(`(() => { const i = document.querySelector('#selfSearch'); i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(250);
  check('关于我清空搜索后恢复 5 条', (await js(`document.querySelectorAll('#storyList .story-card').length`)) === 5);
  await shot('s18_self_393.png');

  await setHash('#people/oliver');
  const person = await js(`({ facts: document.querySelectorAll('.fact:not(.pending)').length, pending: document.querySelectorAll('.fact.pending').length, q: document.querySelectorAll('.qcard').length, sessions: document.querySelectorAll('.session').length, text: document.querySelector('.content').textContent, pendingText: (document.querySelector('.fact.pending .en')||{}).textContent||'', factTexts: Array.from(document.querySelectorAll('.fact:not(.pending) .en')).map(x => x.textContent) })`);
  check('人物页确认事实与待确认分开', person.facts === 3 && person.pending === 1, JSON.stringify({ facts: person.facts, pending: person.pending }));
  check('人物页待确认内容没有重复已确认事实', !person.factTexts.some(t => t.trim() === person.pendingText.trim()), person.pendingText.slice(0, 40));
  check('人物页有中英续聊问句与历史', person.q >= 4 && person.sessions === 3, JSON.stringify({ q: person.q }));
  check('人物页示范问句明确为静态样本，不再写 AI 话题建议', !person.text.includes('AI 话题建议') && person.text.includes('静态示范') && person.text.includes('非 AI 生成'), '已改标');
  await shot('s08_people_393.png');

  /* 12. 深色主题与持久化 */
  await setHash('#hainan/4');
  await js(`document.querySelector('[data-act="theme"]').click()`);
  await sleep(320);
  const dark = await js(`document.documentElement.dataset.theme`);
  check('主题可切到深色', dark === 'dark', dark);
  await sleep(900);
  await shot('s09_dark_place_393.png');
  await cdp.send('Page.reload');
  await sleep(800);
  await waitImages();
  check('深色主题刷新后保持', (await js(`document.documentElement.dataset.theme`)) === 'dark');

  /* 13. 多宽度无横向溢出 + 字号 */
  const widths = [375, 393, 430, 520];
  const routes = ['#topics/festival', '#hainan/3', '#chat', '#self', '#people/oliver', '#topics/works'];
  const overflow = [];
  for (const w of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 852, deviceScaleFactor: 2, mobile: true });
    for (const r of routes) {
      await setHash(r, 240);
      const o = await js(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, app: document.querySelector('#app').scrollWidth })`);
      if (o.sw > o.iw + 1 || o.app > o.iw + 1) overflow.push({ w, r, ...o });
    }
  }
  check('375/393/430/520 六页无横向溢出', overflow.length === 0, overflow.length ? JSON.stringify(overflow.slice(0, 3)) : '6 页 × 4 宽度');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  const fontReport = [];
  for (const r of routes) {
    await setHash(r, 300);
    const f = await js(`(() => {
      const els = Array.from(document.querySelectorAll('body *')).filter(el => el.childElementCount === 0 && el.textContent.trim() && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden');
      const items = els.map(el => ({ size: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 12) }));
      const h1 = document.querySelector('h1');
      return { min: items.length ? Math.min(...items.map(x => x.size)) : 0, body: parseFloat(getComputedStyle(document.body).fontSize), h1: h1 ? parseFloat(getComputedStyle(h1).fontSize) : 0, small: items.filter(x => x.size < 14).slice(0, 5) };
    })()`);
    fontReport.push({ r, ...f });
  }
  check('六页正文字号 ≥19px，标题 ≥23px', fontReport.every(f => f.body >= 19 && f.h1 >= 23), JSON.stringify(fontReport.map(f => `${f.r}:${f.body}/${f.h1}`)));
  check('六页没有小于 14px 的可见文本', fontReport.every(f => f.min >= 14 && f.small.length === 0), JSON.stringify(fontReport.filter(f => f.small.length).map(f => `${f.r}:${JSON.stringify(f.small)}`).slice(0, 3)));

  /* 14. 网络与运行质量 */
  const external = report.requests.filter(u => /^https?:/i.test(u));
  const otherFiles = report.requests.filter(u => u.startsWith('file:') && !u.split('#')[0].endsWith('/standalone.html'));
  check('运行期没有任何外部网络请求', external.length === 0, external.slice(0, 3).join(' | ') || '0 个');
  check('运行期没有读取仓库其他文件', otherFiles.length === 0, otherFiles.slice(0, 3).join(' | ') || '0 个');
  check('无 JS 异常', report.errors.length === 0, report.errors.slice(0, 3).join(' | '));
  check('无图片/资源加载失败', report.failedRequests.length === 0, report.failedRequests.slice(0, 3).join(' | '));

  report.finishedAt = new Date().toISOString();
  report.result = report.checks.every(c => c.ok) ? 'PASS' : 'FAIL';
  fs.writeFileSync(RESULT, JSON.stringify(report, null, 2));
  console.log('\nRESULT ' + report.result + ' · ' + report.checks.filter(c => c.ok).length + '/' + report.checks.length + ' checks · ' + report.shots.length + ' screenshots');
  console.log('RESULT ' + path.relative(ROOT, RESULT));
  process.exitCode = report.result === 'PASS' ? 0 : 1;
} catch (e) {
  console.error('VERIFY ERROR', e);
  report.errors.push(String(e && e.stack || e));
  report.finishedAt = new Date().toISOString();
  report.result = 'ERROR';
  fs.writeFileSync(RESULT, JSON.stringify(report, null, 2));
  process.exitCode = 2;
} finally {
  if (cdp) cdp.close();
  chrome.kill('SIGTERM');
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
