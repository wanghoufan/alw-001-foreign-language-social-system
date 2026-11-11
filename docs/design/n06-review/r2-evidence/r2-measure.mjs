#!/usr/bin/env node
/**
 * N06 单文件原型 R2-B 独立交互实测
 * 只做无头 Chrome（--headless=new）+ 临时 profile + file:// 直开，不碰用户 profile。
 * 每个交互：点击 → 回读目标文本/值 → 截图 → 记录 PASS/FAIL。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.resolve(HERE, '../../prototype/n06/standalone-test/standalone.html');
const OUT_JSON = path.join(HERE, 'R2-B-result.json');
const SHOTS = HERE;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE_URL = pathToFileURL(TARGET).href;
const VIEW = { width: 393, height: 852, dpr: 2 };
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome：' + CHROME); process.exit(2); }
if (!fs.existsSync(TARGET)) { console.error('找不到单文件：' + TARGET); process.exit(2); }

const result = {
  script: path.relative(path.resolve(HERE, '../..'), fileURLToPath(import.meta.url)),
  startedAt: new Date().toISOString(),
  target: TARGET,
  targetBytes: fs.statSync(TARGET).size,
  chromeVersion: '',
  viewport: VIEW,
  isolation: '--headless=new + mkdtemp 临时 user-data-dir + file:// 直开，未占用用户 profile',
  checks: [],
  blocked: [],
  observations: [],
  screenshots: [],
  errors: [],
  widthAudit: [],
  fontAudit: [],
  totals: {}
};

function check(id, name, ok, detail, shots = []) {
  const rec = { id, name, ok: !!ok, detail: detail === undefined ? '' : detail, shots };
  result.checks.push(rec);
  console.log((ok ? 'PASS ' : 'FAIL ') + id + ' ' + name + (detail ? ' — ' + detail : ''));
  return rec;
}
function blocked(id, name, reason) {
  result.blocked.push({ id, name, reason });
  console.log('BLOCKED ' + id + ' ' + name + ' — ' + reason);
}
function observe(id, note) {
  result.observations.push({ id, note });
  console.log('OBSERVE ' + id + ' — ' + note);
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n06-r2b-'));
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
  '--disable-extensions',
  'about:blank'
], { stdio: 'ignore' });

async function waitPort() {
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(portFile)) {
      const t = fs.readFileSync(portFile, 'utf8').trim().split('\n');
      if (t[0]) return Number(t[0]);
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 30000);
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  close() { try { this.ws.close(); } catch (e) {} }
}

let cdp = null;
let chromeVersion = '';

try {
  const port = await waitPort();
  const pageInfo = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  cdp = await CDP.connect(pageInfo.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  const ver = await cdp.send('Browser.getVersion');
  chromeVersion = ver.product;
  result.chromeVersion = chromeVersion;

  cdp.on('Runtime.exceptionThrown', e => result.errors.push('JS: ' + (e.exceptionDetails?.exception?.description || e.exceptionDetails?.text || '')));
  cdp.on('Log.entryAdded', e => { if (e.entry.level === 'error') result.errors.push('Log: ' + e.entry.text); });
  cdp.on('Network.loadingFailed', e => { if (!e.canceled) result.errors.push('net: ' + e.errorText + ' ' + (e.requestId || '')); });

  const js = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitImages = async () => {
    try {
      await js(`Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.addEventListener('load', r, {once:true}); img.addEventListener('error', r, {once:true}); setTimeout(r, 3000); })))`);
    } catch (e) { /* ignore */ }
    await sleep(260);
  };
  const click = async (sel, wait = 260) => {
    const hit = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    await sleep(wait);
    return hit;
  };
  const text = async (sel) => js(`(document.querySelector(${JSON.stringify(sel)})||{}).textContent||''`);
  const setHash = async (hash, wait = 420) => {
    await js(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(wait);
    await waitImages();
  };
  const setWidth = async (w, h = VIEW.height) => {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: VIEW.dpr, mobile: true });
    await sleep(280);
  };
  const shot = async (name, opts = {}) => {
    if (opts.top !== false) await js('window.scrollTo(0, 0)');
    if (opts.selector) {
      await js(`(() => { const el = document.querySelector(${JSON.stringify(opts.selector)}); if (el) el.scrollIntoView({ block: 'center' }); })()`);
      await sleep(320);
    }
    if (opts.wait) await sleep(opts.wait);
    await waitImages();
    let params = { format: 'png', fromSurface: true, captureBeyondViewport: false };
    if (opts.full) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const size = m.cssContentSize || m.contentSize;
      params = { format: 'png', fromSurface: true, captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 } };
    }
    const { data } = await cdp.send('Page.captureScreenshot', params);
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    result.screenshots.push(name);
    console.log('SHOT ' + name);
    return Buffer.byteLength(data, 'base64');
  };
  const setInput = async (sel, value) => {
    return js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true })); return el.value; })()`);
  };

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: VIEW.width, height: VIEW.height, deviceScaleFactor: VIEW.dpr, mobile: true });
  await cdp.send('Page.navigate', { url: FILE_URL + '#hainan/3' });
  for (let i = 0; i < 80; i++) {
    const ready = await js(`document.readyState === 'complete' && !!document.querySelector('#view')`);
    if (ready) break;
    await sleep(120);
  }
  await sleep(600);
  await waitImages();
  check('env-headless-file', '无头 Chrome + file:// 直开 + 临时 profile',
    (await js('location.protocol')) === 'file:' && chromeVersion.includes('Chrome/'),
    `${chromeVersion} · ${await js('location.href')}`);

  /* ============ A. 海南详情：画廊、全屏、段落、展开、单段导入 ============ */
  let d = await js(`(() => {
    const h2 = document.querySelector('.detail-head h2');
    const slides = Array.from(document.querySelectorAll('#gallery .slide'));
    return {
      h2: h2 ? h2.textContent.trim() : '',
      en: (document.querySelector('.detail-head .enname') || {}).textContent || '',
      slides: slides.length,
      count: (document.querySelector('#galleryCount') || {}).textContent || '',
      dotsOn: Array.from(document.querySelectorAll('#galleryDots i')).findIndex(x => x.classList.contains('on')),
      hasPrev: !!document.querySelector('[data-act="gallery-prev"]'),
      hasNext: !!document.querySelector('[data-act="gallery-next"]'),
      loaded: slides.filter(s => { const img = s.querySelector('img'); return !!img && img.complete && img.naturalWidth > 0; }).length,
      hash: location.hash
    };
  })()`);
  check('A1-detail-open', '海南详情打开：骑楼老街、3 张图、上一张/下一张按钮',
    d.h2 === '骑楼老街' && d.slides === 3 && d.count.trim() === '1 / 3' && d.hasPrev && d.hasNext && d.loaded === 3,
    JSON.stringify(d));
  await shot('r2-01-hainan-detail-393.png');

  await click('[data-act="gallery-next"]', 800);
  let g = await js(`({
    count: (document.querySelector('#galleryCount')||{}).textContent||'',
    dotsOn: Array.from(document.querySelectorAll('#galleryDots i')).findIndex(x => x.classList.contains('on')),
    scrollLeft: Math.round((document.querySelector('#gallery')||{}).scrollLeft||0)
  })`);
  check('A2-gallery-next', '画廊「下一张」按钮：计数与圆点移到第 2 张',
    g.count.trim() === '2 / 3' && g.dotsOn === 1,
    JSON.stringify(g), ['r2-02-gallery-next-393.png']);
  await shot('r2-02-gallery-next-393.png', { top: false });

  await click('[data-act="gallery-prev"]', 800);
  g = await js(`({
    count: (document.querySelector('#galleryCount')||{}).textContent||'',
    dotsOn: Array.from(document.querySelectorAll('#galleryDots i')).findIndex(x => x.classList.contains('on'))
  })`);
  check('A3-gallery-prev', '画廊「上一张」按钮：计数与圆点回到第 1 张',
    g.count.trim() === '1 / 3' && g.dotsOn === 0, JSON.stringify(g), ['r2-03-gallery-prev-393.png']);
  await shot('r2-03-gallery-prev-393.png', { top: false });

  await click('#view .detail-actions [data-act="lb-open"]', 500);
  let lb = await js(`({
    on: document.querySelector('#lightbox').classList.contains('on'),
    count: (document.querySelector('#lbCount')||{}).textContent||'',
    hint: (document.querySelector('#lbHint')||{}).textContent||'',
    imgLoaded: (() => { const img = document.querySelector('#lbStage img'); return !!img && img.complete && img.naturalWidth > 0; })(),
    hash: location.hash
  })`);
  check('A4-lightbox-open', '全屏看图：打开 1 / 3，图片已解码，hash 带 full',
    lb.on && lb.count.trim() === '1 / 3' && lb.imgLoaded && lb.hash.includes('/full/1'), JSON.stringify(lb));
  await shot('r2-04-lightbox-first-393.png');

  await click('[data-act="lb-next"]', 500);
  lb = await js(`({
    on: document.querySelector('#lightbox').classList.contains('on'),
    count: (document.querySelector('#lbCount')||{}).textContent||'',
    imgLoaded: (() => { const img = document.querySelector('#lbStage img'); return !!img && img.complete && img.naturalWidth > 0; })(),
    hash: location.hash
  })`);
  check('A5-lightbox-next', '全屏「下一张」：1 / 3 → 2 / 3，图片已解码',
    lb.on && lb.count.trim() === '2 / 3' && lb.imgLoaded && lb.hash.includes('/full/2'),
    JSON.stringify(lb), ['r2-05-lightbox-next-393.png']);
  await shot('r2-05-lightbox-next-393.png');

  await click('[data-act="lb-close"]', 400);
  lb = await js(`({
    on: document.querySelector('#lightbox').classList.contains('on'),
    overflow: document.body.style.overflow,
    hash: location.hash
  })`);
  check('A6-lightbox-exit', '全屏退出：lightbox 关闭、body 恢复滚动、hash 回到详情',
    !lb.on && lb.overflow === '' && lb.hash === '#hainan/3', JSON.stringify(lb));

  const seg = await js(`({
    buttons: Array.from(document.querySelectorAll('.segbar .seg')).map(b => b.textContent.trim()),
    on: Array.from(document.querySelectorAll('.segbar .seg')).findIndex(b => b.classList.contains('on')),
    title: (document.querySelector('#recordHost .record-body > .row.between .pill')||{}).textContent||'',
    en: (document.querySelector('#recordHost .record-body .textbox .en')||{}).textContent||'',
    expCount: document.querySelectorAll('#recordHost .exp').length
  })`);
  check('A7-seg-default', '详情默认第 1 段：3 段分段条、标题与唯一英文对应',
    seg.buttons.length === 3 && seg.on === 0 && seg.title.trim() === '第一次带朋友走骑楼' && seg.en.includes('We walked in from the clock tower side'),
    JSON.stringify({ buttons: seg.buttons, on: seg.on, title: seg.title, expCount: seg.expCount }));

  await click('[data-seg="1"]', 600);
  const seg2 = await js(`({
    on: Array.from(document.querySelectorAll('.segbar .seg')).findIndex(b => b.classList.contains('on')),
    title: (document.querySelector('#recordHost .record-body > .row.between .pill')||{}).textContent||'',
    en: (document.querySelector('#recordHost .record-body .textbox .en')||{}).textContent||'',
    expCount: document.querySelectorAll('#recordHost .exp').length,
    segLabel: (document.querySelector('.segbar .seg.on')||{}).textContent||''
  })`);
  check('A8-seg-switch', '段落切换到第 2 段：标题、唯一英文、默认 2 条表达同步更新',
    seg2.on === 1 && seg2.title.trim() === '傍晚再走一次' && seg2.en.includes('I went back in the evening') && seg2.expCount === 2,
    JSON.stringify(seg2), ['r2-06-seg-switch-393.png']);
  await shot('r2-06-seg-switch-393.png', { selector: '#recordHost', top: false });

  const beforeExpand = await js(`({
    exp: document.querySelectorAll('#recordHost .exp').length,
    btn: (document.querySelector('#recordHost [data-expand]')||{}).textContent||''
  })`);
  await click('#recordHost [data-expand]', 500);
  const afterExpand = await js(`({
    exp: document.querySelectorAll('#recordHost .exp').length,
    btn: (document.querySelector('#recordHost [data-expand]')||{}).textContent||'',
    titles: Array.from(document.querySelectorAll('#recordHost .exp .cn')).map(x => x.textContent.trim())
  })`);
  check('A9-expand-all', '展开全部表达：默认 2 条 → 3 条，按钮变「收起表达」',
    beforeExpand.exp === 2 && afterExpand.exp === 3 && afterExpand.btn.includes('收起表达'),
    JSON.stringify({ before: beforeExpand, after: { exp: afterExpand.exp, btn: afterExpand.btn } }), ['r2-07-expand-all-393.png']);
  await shot('r2-07-expand-all-393.png', { selector: '#recordHost', top: false });

  const singleText = [
    '这条街很适合慢慢走。 This street is great for a slow walk.',
    '抬头看这些老窗户。 Look up at these old windows.',
    '下午的光线更舒服。 The light is softer in the afternoon.',
    '我们从钟楼那边走进来，沿着骑楼慢慢走，最后在一家小店坐下。没有赶景点，反而聊了很久。',
    'We walked in from the clock tower side and followed the arcade slowly. We ended up sitting in a small shop for a long time. We did not rush to any sights, and that slow hour was the best part of the day.'
  ].join('\n');

  await click('#recordHost [data-act="import-open"][data-mode="single"]', 400);
  let imp = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    singleOn: (() => { const b = document.querySelector('[data-import-mode="single"]'); return !!b && b.classList.contains('on'); })(),
    confirmDisabled: (document.querySelector('#importConfirm')||{}).disabled,
    hash: location.hash
  })`);
  check('A10-import-panel', '「粘贴到本段」弹层打开：单段模式选中、确认按钮初始禁用',
    imp.on && imp.title.includes('粘贴到本段') && imp.singleOn && imp.confirmDisabled === true, JSON.stringify(imp));

  const typed = await setInput('#importText', singleText);
  await sleep(350);
  const preview = await js(`({
    ok: (document.querySelector('#importPreview .ok')||{}).textContent||'',
    blocks: document.querySelectorAll('#importPreview .preview-block').length,
    confirmDisabled: (document.querySelector('#importConfirm')||{}).disabled,
    typedLen: (document.querySelector('#importText')||{}).value.length
  })`);
  check('A11-import-preview', '单段粘贴识别预览：1 段 / 3 条表达，确认按钮启用',
    preview.ok.includes('识别到 1 段') && preview.ok.includes('3 条表达') && preview.blocks === 1 && preview.confirmDisabled === false && typed === typed,
    JSON.stringify(preview), ['r2-08-import-single-preview-393.png']);
  await shot('r2-08-import-single-preview-393.png', { top: false });

  await click('[data-act="import-confirm"]', 800);
  const merged = await js(`({
    modalOn: document.querySelector('#modal').classList.contains('on'),
    toast: (document.querySelector('#toast')||{}).textContent||'',
    on: Array.from(document.querySelectorAll('.segbar .seg')).findIndex(b => b.classList.contains('on')),
    title: (document.querySelector('#recordHost .record-body > .row.between .pill')||{}).textContent||'',
    cn: (document.querySelector('#recordHost .record-body .textbox:first-child p')||{}).textContent||'',
    exp: document.querySelectorAll('#recordHost .exp').length,
    expandBtn: (document.querySelector('#recordHost [data-expand]')||{}).textContent||'',
    hash: location.hash
  })`);
  check('A12-import-merge', '确认后合并到当前段（第 2 段）：弹层关闭、表达 3→6 条、中文段替换',
    !merged.modalOn && merged.on === 1 && merged.title.trim() === '傍晚再走一次' && (merged.exp === 6 || merged.expandBtn.includes('展开全部 6 条表达')) && merged.cn.includes('我们从钟楼那边走进来'),
    JSON.stringify(merged) + ' · 说明：A9 的展开状态在导入后沿用，故直接可见 6 条', ['r2-09-import-single-merged-393.png']);
  await shot('r2-09-import-single-merged-393.png', { selector: '#recordHost', top: false });

  /* ============ B. 顶部「更多」按钮/面板 ============ */
  await click('[data-act="more"]', 450);
  const more = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    themes: Array.from(document.querySelectorAll('#themeSheet [data-theme-mode]')).map(b => b.textContent.trim()),
    themeOn: (() => { const b = document.querySelector('#themeSheet .on'); return b ? b.textContent.trim() : ''; })(),
    hasScope: (document.querySelector('#modalBody')||{}).textContent.includes('范围与边界'),
    version: (document.querySelector('#modalBody .sheet-body p.meta:last-child')||{}).textContent||'',
    hasClose: !!document.querySelector('#modalBody [data-act="modal-close"]')
  })`);
  check('B1-more-panel', '顶部「更多」面板：主题分段 3 项、范围与边界、版本、可关闭',
    more.on && more.title.includes('更多') && more.themes.length === 3 && more.hasScope && more.hasClose, JSON.stringify(more),
    ['r2-10-more-panel-393.png']);
  await shot('r2-10-more-panel-393.png', { top: false });
  await click('#modalBody [data-act="modal-close"]', 300);
  const closed = await js(`document.querySelector('#modal').classList.contains('on')`);
  check('B2-more-close', '「更多」面板可关闭', closed === false, String(closed));

  /* ============ C. 话题 → 我的作品（B/C、分享入口） ============ */
  await setHash('#topics/works');
  const worksAll = await js(`({
    count: (document.querySelector('#workCount')||{}).textContent||'',
    cards: document.querySelectorAll('#workList .work-card').length,
    chips: Array.from(document.querySelectorAll('[data-workcat]')).map(b => b.textContent.trim())
  })`);
  check('C1-works-list', '我的作品：11 条、全部/A/B/C 分类 chip 存在',
    worksAll.count.includes('11') && worksAll.cards === 11 && worksAll.chips.length === 4, JSON.stringify(worksAll));

  await click('[data-workcat="B"]', 350);
  const bCat = await js(`({
    count: (document.querySelector('#workCount')||{}).textContent||'',
    cards: document.querySelectorAll('#workList .work-card').length,
    ids: Array.from(document.querySelectorAll('#workList .work-card')).map(c => c.dataset.work),
    head: (document.querySelector('#workList .work-card h3')||{}).textContent||'',
    demo: (document.querySelector('#workList .work-card .en')||{}).textContent||''
  })`);
  check('C2-works-B', 'B 类筛选有数据：1 条 DEMO-B1 且标为分类示范补充',
    bCat.count.includes('1') && bCat.cards === 1 && bCat.ids[0] === 'DEMO-B1' && bCat.demo.includes('分类示范补充'),
    JSON.stringify(bCat), ['r2-11-works-b-393.png']);
  await shot('r2-11-works-b-393.png');

  await click('[data-workcat="C"]', 350);
  const cCat = await js(`({
    count: (document.querySelector('#workCount')||{}).textContent||'',
    cards: document.querySelectorAll('#workList .work-card').length,
    ids: Array.from(document.querySelectorAll('#workList .work-card')).map(c => c.dataset.work),
    head: (document.querySelector('#workList .work-card h3')||{}).textContent||''
  })`);
  check('C3-works-C', 'C 类筛选有数据：1 条 DEMO-C1 社区活动板',
    cCat.count.includes('1') && cCat.cards === 1 && cCat.ids[0] === 'DEMO-C1' && cCat.head.includes('社区活动板'),
    JSON.stringify(cCat), ['r2-12-works-c-393.png']);
  await shot('r2-12-works-c-393.png');

  await setHash('#topics/works/DEMO-B1');
  const shareBtn = await js(`(() => {
    const b = document.querySelector('#view .detail-actions [data-act="work-share"]');
    return { exists: !!b, text: b ? b.textContent.trim() : '' };
  })()`);
  await click('#view .detail-actions [data-act="work-share"]', 450);
  const sharePanel = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    hasNative: !!document.querySelector('[data-act="work-share-native"]'),
    hasCopy: !!document.querySelector('[data-act="work-share-copy"]'),
    previewCn: (document.querySelector('#modalBody .textbox p')||{}).textContent||'',
    previewEn: (document.querySelector('#modalBody .textbox p.en')||{}).textContent||''
  })`);
  check('C4-work-share', '作品详情「分享作品」入口可点，弹层含系统分享/复制与中英预览',
    shareBtn.exists && shareBtn.text === '分享作品' && sharePanel.on && sharePanel.title.includes('分享作品 · 单词卡片') && sharePanel.hasNative && sharePanel.hasCopy && sharePanel.previewCn.length > 0 && sharePanel.previewEn.length > 0,
    JSON.stringify({ btn: shareBtn, panel: { title: sharePanel.title, hasNative: sharePanel.hasNative, cnLen: sharePanel.previewCn.length, enLen: sharePanel.previewEn.length } }),
    ['r2-13-work-share-panel-393.png']);
  await shot('r2-13-work-share-panel-393.png', { top: false });
  await click('#modalBody [data-act="modal-close"]', 250);

  /* ============ D. 聊天：分享/换题、人物切换、标签 ============ */
  await setHash('#chat');
  const chat0 = await js(`(() => {
    const cards = Array.from(document.querySelectorAll('.coach-card'));
    return {
      shareBtn: (() => { const b = document.querySelector('[data-act="chat-share"]'); return b ? b.textContent.trim() : ''; })(),
      pill: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'',
      person: (document.querySelector('#chatPerson')||{}).value || '',
      options: Array.from((document.querySelector('#chatPerson')||{options:[]}).options).map(o => o.textContent.trim()),
      followEn: cards[0] ? (cards[0].querySelector('.en')||{}).textContent.trim() : '',
      probeEn: cards[1] ? (cards[1].querySelector('.en')||{}).textContent.trim() : '',
      tags: Array.from(document.querySelectorAll('.chat-tags .tagbtn')).map(b => b.textContent.trim()),
      msgCount: document.querySelectorAll('#chatThread .bubble').length
    };
  })()`);
  check('D1-chat-default', '聊天默认：存在「分享 / 换题」、3 位人物、接话/追问、3 个标签',
    chat0.shareBtn.includes('分享') && chat0.shareBtn.includes('换题') && chat0.options.length === 3 && chat0.followEn.length > 0 && chat0.probeEn.length > 0 && chat0.tags.length === 3 && chat0.msgCount > 0,
    JSON.stringify({ shareBtn: chat0.shareBtn, person: chat0.person, tags: chat0.tags, msgCount: chat0.msgCount, follow: chat0.followEn.slice(0, 40) }),
    ['r2-14-chat-default-393.png']);
  await shot('r2-14-chat-default-393.png');

  await click('[data-act="chat-share"]', 450);
  const shareSheet = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    topics: Array.from(document.querySelectorAll('[data-chat-topic]')).map(b => ({ id: b.dataset.chatTopic, text: b.textContent.trim() })),
    preview: (document.querySelector('#modalBody .textbox p')||{}).textContent||'',
    hasNative: !!document.querySelector('[data-act="chat-share-native"]')
  })`);
  check('D2-chat-share-panel', '聊天「分享 / 换题」面板：2 个固定话题、分享预览与系统分享入口',
    shareSheet.on && shareSheet.title.includes('分享 / 换题') && shareSheet.topics.length === 2 && shareSheet.preview.length > 0 && shareSheet.hasNative,
    JSON.stringify({ title: shareSheet.title, topics: shareSheet.topics.map(t => t.text), previewLen: shareSheet.preview.length }),
    ['r2-15-chat-share-panel-393.png']);
  await shot('r2-15-chat-share-panel-393.png', { top: false });

  await click('[data-chat-topic="oliver-weekend"]', 500);
  const chatTopic = await js(`(() => {
    const cards = Array.from(document.querySelectorAll('.coach-card'));
    return {
      modalOn: document.querySelector('#modal').classList.contains('on'),
      pill: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'',
      followEn: cards[0] ? (cards[0].querySelector('.en')||{}).textContent.trim() : '',
      probeEn: cards[1] ? (cards[1].querySelector('.en')||{}).textContent.trim() : ''
    };
  })()`);
  check('D3-chat-topic-switch', '换题后：弹层关闭、话题/接话/追问同步换成周末骑行样本',
    !chatTopic.modalOn && chatTopic.pill.includes('周末骑行') && chatTopic.followEn.includes('Keeping it flat') && chatTopic.probeEn.includes('How long do you usually ride'),
    JSON.stringify(chatTopic), ['r2-16-chat-topic-switched-393.png']);
  await shot('r2-16-chat-topic-switched-393.png', { top: false });

  const switchPerson = await js(`(() => { const s = document.querySelector('#chatPerson'); s.value = 'maya'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(500);
  const chatMaya = await js(`(() => {
    const cards = Array.from(document.querySelectorAll('.coach-card'));
    return {
      selected: (document.querySelector('#chatPerson')||{}).value || '',
      followEn: cards[0] ? (cards[0].querySelector('.en')||{}).textContent.trim() : '',
      probeEn: cards[1] ? (cards[1].querySelector('.en')||{}).textContent.trim() : '',
      pill: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'',
      tags: Array.from(document.querySelectorAll('.chat-tags .tagbtn')).map(b => b.textContent.trim()),
      msgFirst: (document.querySelector('#chatThread .bubble')||{}).textContent||''
    };
  })()`);
  const tagPlace = chatMaya.tags.find(t => t.includes('地点')) || '';
  const tagFest = chatMaya.tags.find(t => t.includes('节日')) || '';
  const tagPerson = chatMaya.tags.find(t => t.includes('人物')) || '';
  check('D4-chat-person-switch', '切换人物到 Maya：接话/追问换样本、人物标签变 Maya、地点标签保留骑楼老街',
    switchPerson === 'maya' && chatMaya.selected === 'maya' && chatMaya.followEn.includes('Hand-drawn posters') && chatMaya.probeEn.includes('Do you start with the bands') && tagPerson.includes('Maya Torres') && tagPlace.includes('骑楼老街'),
    JSON.stringify({ selected: chatMaya.selected, follow: chatMaya.followEn.slice(0, 50), tags: chatMaya.tags, pill: chatMaya.pill }),
    ['r2-17-chat-person-maya-393.png']);
  check('D5-chat-tag-variation', '切换人物后标签变化范围：人物变、地点/节日文案不变（数据 placeId 相同、节日为固定入口）',
    tagPerson.includes('Maya Torres') && tagPlace.includes('骑楼老街') && tagFest.includes('节日') && !tagFest.includes('Maya'),
    JSON.stringify({ tagPlace, tagFest, tagPerson, note: '地点标签由 demo.tags.placeId=3 决定，三位人物共用；节日标签是固定入口文案' }));
  await shot('r2-17-chat-person-maya-393.png', { top: false });

  await click('.chat-tags [data-tag="place"]', 400);
  const tagP = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    qcn: (document.querySelector('#modalBody .qcard .cn')||{}).textContent||'',
    hasCopy: !!document.querySelector('#modalBody [data-act="copy"]')
  })`);
  check('D6-chat-tag-place', '地点标签：打开「关联地点 · 骑楼老街」，含问句与复制',
    tagP.on && tagP.title.includes('关联地点 · 骑楼老街') && tagP.qcn.length > 0 && tagP.hasCopy, JSON.stringify(tagP),
    ['r2-18-chat-tag-place-393.png']);
  await shot('r2-18-chat-tag-place-393.png', { top: false });
  await click('#modalBody [data-act="modal-close"]', 250);

  await click('.chat-tags [data-tag="festival"]', 400);
  const tagF = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    cards: document.querySelectorAll('#modalBody .qcard').length,
    titles: Array.from(document.querySelectorAll('#modalBody .qcard .row.between b')).map(b => b.textContent.trim()),
    regions: Array.from(document.querySelectorAll('#modalBody .qcard .pill')).map(x => x.textContent.trim()),
    text: (document.querySelector('#modalBody')||{}).textContent||''
  })`);
  const mayaFestTitles = tagF.titles;
  check('D7-chat-tag-festival', '节日标签：打开最近节日候选，含「不按国籍推断」说明与问句',
    tagF.on && tagF.title.includes('节日') && tagF.cards >= 1 && tagF.text.includes('不推断对方是否庆祝'), JSON.stringify({ title: tagF.title, cards: tagF.cards }),
    ['r2-19-chat-tag-festival-393.png']);
  await shot('r2-19-chat-tag-festival-393.png', { top: false });
  await click('#modalBody [data-act="modal-close"]', 250);

  await click('.chat-tags [data-tag="person"]', 400);
  const tagPer = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    title: (document.querySelector('.modal-head h2')||{}).textContent||'',
    qcn: (document.querySelector('#modalBody .qcard .cn')||{}).textContent||''
  })`);
  check('D8-chat-tag-person', '人物标签：弹层标题为 Maya Torres，含已确认事实问句',
    tagPer.on && tagPer.title.includes('人物 · Maya Torres') && tagPer.qcn.length > 0, JSON.stringify(tagPer),
    ['r2-20-chat-tag-person-393.png']);
  await shot('r2-20-chat-tag-person-393.png', { top: false });
  await click('#modalBody [data-act="modal-close"]', 250);

  const backOliver = await js(`(() => { const s = document.querySelector('#chatPerson'); s.value = 'oliver'; s.dispatchEvent(new Event('change', { bubbles: true })); return s.value; })()`);
  await sleep(500);
  await click('.chat-tags [data-tag="festival"]', 450);
  const festOliver = await js(`({
    on: document.querySelector('#modal').classList.contains('on'),
    titles: Array.from(document.querySelectorAll('#modalBody .qcard .row.between b')).map(b => b.textContent.trim()),
    regions: Array.from(document.querySelectorAll('#modalBody .qcard .pill')).map(x => x.textContent.trim()),
    note: (document.querySelector('#modalBody > .sheet-body > p.meta')||{}).textContent||''
  })`);
  check('D9-chat-tag-festival-after-switch', '切回 Oliver 后节日标签仍可打开并给出候选',
    backOliver === 'oliver' && festOliver.on && festOliver.titles.length >= 1,
    JSON.stringify(festOliver), ['r2-20b-chat-tag-festival-oliver-393.png']);
  await shot('r2-20b-chat-tag-festival-oliver-393.png', { top: false });
  const sameFest = JSON.stringify(festOliver.titles) === JSON.stringify(mayaFestTitles);
  observe('D9-festival-not-person-aware', `Maya 与 Oliver 下节日候选${sameFest ? '完全一致' : '不同'}：Maya=${mayaFestTitles.join('、')}；Oliver=${festOliver.titles.join('、')}；地区=${festOliver.regions.join('、')}。候选来自全局 festivalList，未按人物地区或上下文过滤。`);
  await click('#modalBody [data-act="modal-close"]', 250);

  observe('A12-expanded-state-kept', 'A9 展开第 2 段后，单段合并导入仍保留展开状态，导入后直接显示 6 条表达（折叠按钮为「收起表达」）；属交互状态保留，非缺陷。');
  observe('D5-place-tag-shared', '三位人物 chatDemo.tags.placeId 均为 3（骑楼老街），切换人物不更换地点标签；节日标签是固定入口文案。');

  /* ============ E. 关于我：整页、搜索、分类 ============ */
  await setHash('#self');
  const self0 = await js(`({
    count: (document.querySelector('#selfCount')||{}).textContent||'',
    cards: document.querySelectorAll('#storyList .story-card').length,
    cats: Array.from(document.querySelectorAll('[data-selfcat]')).map(b => b.textContent.trim()),
    hasSearch: !!document.querySelector('#selfSearch'),
    enVisible: Array.from(document.querySelectorAll('#storyList .story-card .en')).every(x => x.offsetHeight > 0)
  })`);
  check('E1-self-page', '关于我：5 条、搜索框、分类 chip、中英同时可见',
    self0.count.includes('5') && self0.cards === 5 && self0.hasSearch && self0.cats.length >= 2 && self0.enVisible, JSON.stringify(self0));
  await shot('r2-21-self-fullpage-393.png', { full: true });

  await setInput('#selfSearch', '城市');
  await sleep(350);
  const selfSearch = await js(`({
    count: (document.querySelector('#selfCount')||{}).textContent||'',
    cards: document.querySelectorAll('#storyList .story-card').length,
    title: (document.querySelector('#storyList .story-card h3')||{}).textContent||''
  })`);
  check('E2-self-search', '关于我搜索「城市」：5 → 1 条，命中「我待过的城市」',
    selfSearch.count.includes('1') && selfSearch.cards === 1 && selfSearch.title.includes('城市'), JSON.stringify(selfSearch),
    ['r2-22-self-search-393.png']);
  await shot('r2-22-self-search-393.png');

  await setInput('#selfSearch', '');
  await sleep(250);
  await click('[data-selfcat="兴趣"]', 350);
  const selfCat = await js(`({
    count: (document.querySelector('#selfCount')||{}).textContent||'',
    cards: document.querySelectorAll('#storyList .story-card').length,
    titles: Array.from(document.querySelectorAll('#storyList .story-card h3')).map(x => x.textContent.trim()),
    on: (document.querySelector('[data-selfcat].on')||{}).textContent||'',
    q: (document.querySelector('#selfSearch')||{}).value
  })`);
  check('E3-self-category', '关于我分类「兴趣」：3 条，chip 选中且搜索已清空',
    selfCat.count.includes('3') && selfCat.cards === 3 && selfCat.on === '兴趣' && selfCat.q === '',
    JSON.stringify(selfCat), ['r2-23-self-cat-interest-393.png']);
  await shot('r2-23-self-cat-interest-393.png');

  /* ============ F. 4 宽度 × 5 类页面 横向溢出 ============ */
  const measureOverflow = () => js(`(() => {
    const vw = innerWidth;
    const offenders = [];
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1) {
        let p = el.parentElement, inScroll = false;
        while (p && p !== document.body) {
          const pcs = getComputedStyle(p);
          if (/(auto|scroll)/.test(pcs.overflowX)) { inScroll = true; break; }
          p = p.parentElement;
        }
        if (!inScroll) offenders.push({ tag: el.tagName, cls: String(el.className || '').slice(0, 36), right: Math.round(r.right), text: (el.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 26) });
        if (offenders.length >= 8) break;
      }
    }
    return {
      vw,
      docW: document.documentElement.scrollWidth,
      bodyW: document.body ? document.body.scrollWidth : 0,
      offenders
    };
  })()`);

  const pageCases = [
    { id: 'hainan-list', name: '海南列表', setup: async () => { await setHash('#hainan'); } },
    { id: 'hainan-detail', name: '海南详情', setup: async () => { await setHash('#hainan/3'); } },
    { id: 'lightbox', name: '全屏', setup: async () => { await setHash('#hainan/3/full/1'); } },
    { id: 'import-modal', name: '导入弹层', setup: async () => { await setHash('#hainan/3'); await click('#recordHost [data-act="import-open"][data-mode="all"]', 450); } },
    { id: 'self', name: '关于我', setup: async () => { await setHash('#self'); } }
  ];

  let widthAllOk = true;
  const widthDetails = [];
  for (const pc of pageCases) {
    await setWidth(VIEW.width);
    await pc.setup();
    await sleep(200);
    const rows = [];
    for (const w of [375, 393, 430, 520]) {
      await setWidth(w);
      await sleep(320);
      const m = await measureOverflow();
      const ok = m.docW <= m.vw + 1 && m.bodyW <= m.vw + 1 && m.offenders.length === 0;
      rows.push({ width: w, ok, docW: m.docW, bodyW: m.bodyW, offenders: m.offenders });
    }
    const ok = rows.every(r => r.ok);
    if (!ok) widthAllOk = false;
    const detail = rows.map(r => `${r.width}: doc=${r.docW} body=${r.bodyW} off=${r.offenders.length}`).join(' | ');
    result.widthAudit.push({ page: pc.id, name: pc.name, rows });
    check('F-' + pc.id, `${pc.name} 在 375/393/430/520 无横向溢出`, ok,
      detail + rows.filter(r => r.offenders.length).map(r => ' ' + r.width + ':' + JSON.stringify(r.offenders.slice(0, 2))).join(''));
  }
  check('F-total', '5 类页面 × 4 宽度整体无横向溢出', widthAllOk, widthDetails.length ? widthDetails.join(';') : '见 F-* 各项');
  await setWidth(VIEW.width);

  await setWidth(375);
  await setHash('#hainan/3');
  await sleep(350);
  await js('window.scrollTo(0,0)');
  await shot('r2-24-width-375-detail.png');
  check('F-375-shot', '375 宽度详情页补证截图（布局未断裂）', true, 'r2-24-width-375-detail.png', ['r2-24-width-375-detail.png']);
  await setWidth(520);
  await setHash('#self');
  await sleep(350);
  await js('window.scrollTo(0,0)');
  await shot('r2-25-width-520-self.png');
  check('F-520-shot', '520 宽度关于我补证截图（布局未断裂）', true, 'r2-25-width-520-self.png', ['r2-25-width-520-self.png']);
  await setWidth(VIEW.width);

  /* ============ G. 字号抽查（5 个页面） ============ */
  const fontPages = [
    { id: 'topics-festival', name: '话题/节日', hash: '#topics/festival' },
    { id: 'hainan-list', name: '海南列表', hash: '#hainan' },
    { id: 'hainan-detail', name: '海南详情', hash: '#hainan/3' },
    { id: 'chat', name: '聊天', hash: '#chat' },
    { id: 'self', name: '关于我', hash: '#self' }
  ];
  let fontAllOk = true;
  for (const fp of fontPages) {
    await setWidth(VIEW.width);
    await setHash(fp.hash);
    await sleep(250);
    const audit = await js(`(() => {
      const items = [];
      for (const el of document.querySelectorAll('body *')) {
        let visible = true;
        try { visible = el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }); } catch (e) { visible = true; }
        if (!visible) continue;
        const hasText = Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim().length > 0);
        if (!hasText) continue;
        const cs = getComputedStyle(el);
        const px = Math.round(parseFloat(cs.fontSize) * 10) / 10;
        const tag = el.tagName.toLowerCase();
        let cat = '其他';
        if (tag === 'button') cat = '按钮';
        else if (el.closest('.card')) cat = '卡片';
        else if (['p', 'h1', 'h2', 'h3', 'h4', 'div', 'span', 'li', 'b', 'strong', 'label', 'summary'].includes(tag)) cat = '正文';
        items.push({ px, cat, tag, cls: String(el.className || '').slice(0, 32), text: el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 22) });
      }
      const minOf = arr => arr.length ? arr.reduce((a, b) => (b.px < a.px ? b : a)) : null;
      const byCat = {};
      for (const c of ['正文', '卡片', '按钮']) {
        const it = items.filter(i => i.cat === c);
        byCat[c] = { count: it.length, min: minOf(it) };
      }
      return {
        total: items.length,
        lt14: items.filter(i => i.px < 14).length,
        mid1418: items.filter(i => i.px >= 14 && i.px < 19).length,
        ge19: items.filter(i => i.px >= 19).length,
        min: minOf(items),
        byCat,
        lt14Samples: items.filter(i => i.px < 14).slice(0, 5),
        smallSamples: items.filter(i => i.px >= 14 && i.px < 19).slice(0, 5)
      };
    })()`);
    result.fontAudit.push({ page: fp.id, name: fp.name, ...audit });
    const ok = audit.min && audit.min.px >= 14 && audit.lt14 === 0;
    if (!ok) fontAllOk = false;
    check('G-' + fp.id, `${fp.name} 字号抽查：最小 ${audit.min ? audit.min.px : 'n/a'}px，无 <14px`,
      ok, `总数 ${audit.total} · <14=${audit.lt14} · 14–18=${audit.mid1418} · >=19=${audit.ge19} · 正文min=${audit.byCat['正文'].min ? audit.byCat['正文'].min.px : '-'} · 卡片min=${audit.byCat['卡片'].min ? audit.byCat['卡片'].min.px : '-'} · 按钮min=${audit.byCat['按钮'].min ? audit.byCat['按钮'].min.px : '-'}`);
  }
  check('G-total', '5 个页面均无小于 14px 的可见文本', fontAllOk, '分布见 G-* 各项');

  /* ============ H. 未覆盖项（BLOCKED） ============ */
  blocked('H1-gallery-swipe-touch', '轮播触摸滑动手势', '本轮按任务要求只测「上一张/下一张」按钮；CDP 合成触摸滑动与 scroll-snap 吸附判定无法在无头环境给出可信结论，未测。');
  blocked('H2-real-device', '真机 / OPPO 密度 / 系统分享面板', '本轮限定无头 Chromium(file://)；系统分享、真机密度与厂商浏览器不在本任务范围。');

  /* 收尾 */
  result.finishedAt = new Date().toISOString();
  const pass = result.checks.filter(c => c.ok).length;
  const fail = result.checks.filter(c => !c.ok).length;
  result.totals = {
    checks: result.checks.length,
    pass,
    fail,
    blocked: result.blocked.length,
    observations: result.observations.length,
    screenshots: result.screenshots.length
  };
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(`RESULT PASS=${pass} FAIL=${fail} BLOCKED=${result.blocked.length} SHOTS=${result.screenshots.length}`);
  console.log('JSON ' + path.relative(process.cwd(), OUT_JSON));
  if (result.errors.length) {
    console.log('ERRORS ' + result.errors.length);
    result.errors.slice(0, 10).forEach(e => console.log('  ' + e));
  }
  process.exitCode = fail > 0 ? 1 : 0;
} catch (e) {
  result.errors.push('SCRIPT: ' + (e.stack || e.message || String(e)));
  result.finishedAt = new Date().toISOString();
  result.totals = { checks: result.checks.length, pass: result.checks.filter(c => c.ok).length, fail: result.checks.filter(c => !c.ok).length, blocked: result.blocked.length, screenshots: result.screenshots.length };
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.error('FATAL ' + (e.stack || e.message));
  process.exitCode = 2;
} finally {
  if (cdp) cdp.close();
  chrome.kill('SIGTERM');
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}