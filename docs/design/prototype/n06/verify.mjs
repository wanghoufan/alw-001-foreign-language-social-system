#!/usr/bin/env node
/**
 * N06 原型无头验证 + 截图
 * 使用系统 Chrome 的 headless 模式，独立临时 profile，不占用用户浏览器 profile。
 * 不启动常驻服务；全部通过 file:// 打开本地原型。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const INDEX = path.join(ROOT, 'index.html');
const SHOTS = path.join(ROOT, 'screenshots');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FILE_URL = pathToFileURL(INDEX).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(CHROME)) {
  console.error('找不到 Chrome：' + CHROME);
  process.exit(2);
}
fs.mkdirSync(SHOTS, { recursive: true });

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n06-chrome-'));
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
  '--allow-file-access-from-files',
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
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 15000);
    });
  }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  close() { try { this.ws.close(); } catch (e) {} }
}

const report = { startedAt: new Date().toISOString(), checks: [], shots: [], errors: [], failedRequests: [], console: [] };
function check(name, ok, detail) { report.checks.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); }
function shotPath(name) { return path.join(SHOTS, name); }

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

  const js = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  const waitImages = async () => {
    try {
      await js(`Promise.all(Array.from(document.images).map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; setTimeout(r, 2500); })))`);
    } catch (e) {}
    await sleep(300);
  };
  const nav = async (hash, wait = 450) => {
    await cdp.send('Page.navigate', { url: FILE_URL + hash });
    await sleep(wait);
    await waitImages();
  };
  const setHash = async (hash, wait = 350) => {
    await js(`location.hash = ${JSON.stringify(hash)}`);
    await sleep(wait);
    await waitImages();
  };
  const shot = async (name, opts = {}) => {
    if (opts.top !== false) await js(`window.scrollTo(0, 0)`);
    await sleep(opts.wait || 160);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(shotPath(name), Buffer.from(data, 'base64'));
    report.shots.push(name);
    console.log('SHOT ' + name);
  };

  /* 每个 slide 的真实状态：提示是否 hidden、计算样式是否 display:none、
   * 图片是否可见、命中测试（elementFromPoint）落在图片还是提示上。 */
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
      imgShown: !!img && ics.display !== 'none' && ics.visibility !== 'hidden' && Number(ics.opacity) === 1,
      fbHidden: fb ? fb.hidden : null,
      fbDisplay: fcs ? fcs.display : null,
      hitTag: hit ? hit.tagName : null,
      hitIsImg: !!hit && hit.tagName === 'IMG' && hit === img
    };
  }))()`);

  /* 像素证据：截取元素区域后在页面内用 canvas 解码，
   * 统计亮度标准差、量化颜色数与“缺图板底色”占比。
   * 纯色缺图板 sd≈0、颜色≈1；真实照片 sd 明显更大且颜色丰富。 */
  const pixelProof = async (name, selector) => {
    await js(`window.scrollTo(0, 0)`);
    await sleep(150);
    const box = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }; })()`);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false });
    fs.writeFileSync(shotPath(name), Buffer.from(data, 'base64'));
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

  /* 0. 初始加载 */
  await cdp.send('Page.navigate', { url: FILE_URL + '#topics/festival' });
  await sleep(700);
  await waitImages();
  try { await js(`localStorage.removeItem('n06.theme')`); } catch (e) {}
  await cdp.send('Page.reload');
  await sleep(700);
  await waitImages();

  /* 0b. 默认主题：清持久化后必须跟随系统（SYSTEM），不能写死浅色 */
  await js(`document.querySelector('[data-act="more"]').click()`);
  await sleep(300);
  const defaultMode = await js(`(() => { const el = document.querySelector('[data-theme-mode].on'); return el ? el.dataset.themeMode : ''; })()`);
  check('默认主题为跟随系统（SYSTEM）', defaultMode === 'system', defaultMode);
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 1. 底部五个 Tab */
  const tabs = await js(`Array.from(document.querySelectorAll('.tabbtn')).map(b => b.querySelector('span').textContent)`);
  check('底部恰好五个 Tab 且顺序正确', JSON.stringify(tabs) === JSON.stringify(['话题', '海南', '聊天', '关于我', '人物']), tabs.join('｜'));

  /* 1b. file:// 独立打开（不依赖任何本地服务） */
  const standalone = await js(`({ proto: location.protocol, sheets: document.styleSheets.length, scripts: Array.from(document.scripts).map(s => (s.src || '').split('/').pop()) })`);
  check('file:// 独立打开：样式与本地数据脚本均已加载', standalone.proto === 'file:' && standalone.sheets > 0 && standalone.scripts.includes('data.js') && standalone.scripts.includes('app.js'), JSON.stringify(standalone));

  /* 1c. 数据一致性：待确认不得与已确认事实重复；每人必须有独立固定聊天示例；
   * 作品分类必须有 B/C 示范，且必须标注为示范补充。 */
  const dataAudit = await js(`(() => {
    const people = window.N06.people.map(p => ({
      slug: p.slug,
      pendingInConfirmed: p.confirmed.some(c => c.text.trim() === p.pending.text.trim()),
      topics: (p.chatDemo && p.chatDemo.topics || []).length,
      staticNote: !!(p.chatDemo && p.chatDemo.note && p.chatDemo.note.includes('不调用云端 AI'))
    }));
    const works = window.N06.works;
    return {
      people,
      b: works.filter(w => w.cat === 'B').map(w => ({ id: w.id, demoAdded: !!w.demoAdded })),
      c: works.filter(w => w.cat === 'C').map(w => ({ id: w.id, demoAdded: !!w.demoAdded })),
      aCount: works.filter(w => w.cat === 'A').length,
      total: works.length
    };
  })()`);
  check('三个虚构人物的待确认事项都不在已确认事实里', dataAudit.people.length === 3 && dataAudit.people.every(p => !p.pendingInConfirmed), JSON.stringify(dataAudit.people));
  check('每个虚构人物都有至少 2 个固定聊天示例并标注不调用云端 AI', dataAudit.people.every(p => p.topics >= 2 && p.staticNote), JSON.stringify(dataAudit.people.map(p => ({ slug: p.slug, topics: p.topics, staticNote: p.staticNote }))));
  check('作品含 A 类现有样本与 B/C 分类示范补充', dataAudit.aCount === 9 && dataAudit.b.length === 1 && dataAudit.c.length === 1 && dataAudit.b[0].demoAdded && dataAudit.c[0].demoAdded && dataAudit.total === 11, JSON.stringify({ a: dataAudit.aCount, b: dataAudit.b, c: dataAudit.c, total: dataAudit.total }));

  /* 2. 节日筛选与空态 */
  const festCount14 = await js(`document.querySelectorAll('#festivalList .festival-card').length`);
  check('节日默认「未来 14 天」有候选卡片', festCount14 === 4, `卡片 ${festCount14} 个`);
  await js(`document.querySelector('[data-window="today"]').click()`);
  await sleep(250);
  const todayEmpty = await js(`(document.querySelector('#festivalList .empty')||{}).textContent||''`);
  check('「今天」无匹配时显示空态而不是假倒计时', todayEmpty.includes('这个范围没有匹配的节日'));
  await js(`document.querySelector('[data-window="all"]').click()`);
  await sleep(250);
  const festAll = await js(`document.querySelectorAll('#festivalList .festival-card').length`);
  check('「全部」展示全部 47 个候选节日', festAll === 47, `卡片 ${festAll} 个`);

  /* 截图 1：节日页 */
  await js(`document.querySelector('[data-window="14d"]').click()`);
  await sleep(300);
  await shot('01_topics_festival_393.png');

  /* 3. 海南列表封面：有可用图的出图，无可用图的显示待核实 */
  await setHash('#hainan');
  const cover = await js(`Array.from(document.querySelectorAll('.place-card')).map(c => {
    const img = c.querySelector('.place-cover img');
    const fb = c.querySelector('.place-cover .fallback');
    return { id: c.dataset.place, hasImg: !!img, ok: !!img && img.complete && img.naturalWidth > 0, fbVisible: !!fb && getComputedStyle(fb).display !== 'none', fbText: fb ? fb.textContent.replace(/\\s+/g, ' ').trim() : '' };
  })`);
  const coverImg = cover.filter(c => c.hasImg);
  const coverNone = cover.filter(c => !c.hasImg);
  check('海南列表 9 个封面出图且全部加载成功', cover.length === 13 && coverImg.length === 9 && coverImg.every(c => c.ok), `${coverImg.filter(c => c.ok).length}/${coverImg.length}`);
  check('4 个无可用照片地点显示待核实提示', coverNone.length === 4 && coverNone.every(c => c.fbVisible && c.fbText.includes('待核实')), coverNone.map(c => `#${c.id}`).join(' '));

  /* 3b. 海南详情与图片 */
  await setHash('#hainan/3');
  const gallery = await slideStates();
  check('骑楼老街详情加载 3 张真实图片', gallery.length === 3 && gallery.every(x => x.loaded), gallery.map(x => x.naturalW + 'px').join(' | '));
  const pathCheck = gallery.map(x => { const u = new URL(x.src); return { proto: u.protocol, exists: fs.existsSync(decodeURIComponent(u.pathname)) }; });
  check('图片路径为 file:// 下真实存在的归档 webp', pathCheck.every(x => x.proto === 'file:' && x.exists), gallery.map(x => decodeURIComponent(new URL(x.src).pathname).split('/').slice(-3).join('/')).join(' | '));
  check('详情缺图提示全部隐藏（不遮挡照片）', gallery.every(x => x.fbHidden === true && x.fbDisplay === 'none'), gallery.map(x => `#${x.i}:${x.fbDisplay}`).join(' '));
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
  check('页面上没有任何可见缺图提示压在照片上方', overlays.length === 0, overlays.join(' | ') || '0 处');
  const cjk = await js(`document.querySelector('.textbox p').textContent.length`);
  const enWords = await js(`document.querySelectorAll('.textbox p')[1].textContent.trim().split(/\\s+/).length`);
  check('地点中文介绍达到 90–150 字量级', cjk >= 90 && cjk <= 160, `${cjk} 字`);
  check('地点英文介绍达到 60–95 词量级', enWords >= 55 && enWords <= 105, `${enWords} 词`);

  /* 截图 2 之前先做像素证据：缺图板是纯色，照片必然有灰度方差与丰富颜色 */
  const proof02 = await pixelProof('02b_hainan_detail_photo_proof_393.png', '#gallery .slide');
  check('详情首图实际绘制出照片像素（非纯色缺图板）', proof02.sd >= 18 && proof02.colors >= 200 && proof02.bg <= 0.6, JSON.stringify(proof02));

  /* 截图 2：详情首屏 */
  await sleep(900);
  await shot('02_hainan_detail_393.png');

  /* 4. 全屏 */
  await js(`document.querySelector('#gallery .slide').click()`);
  await sleep(350);
  const lb1 = await js(`({ on: document.querySelector('#lightbox').classList.contains('on'), count: document.querySelector('#lbCount').textContent, img: !!document.querySelector('#lbStage img') && document.querySelector('#lbStage img').naturalWidth > 0 })`);
  check('点击大图进入全屏并显示 1 / 3', lb1.on && lb1.count.trim() === '1 / 3' && lb1.img, JSON.stringify(lb1));
  const lbState = await js(`(() => { const img = document.querySelector('#lbStage img'); const fb = document.querySelector('#lbStage .fallback'); const r = img.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { nw: img.naturalWidth, shown: getComputedStyle(img).display !== 'none', fbHidden: fb ? fb.hidden : null, fbDisplay: fb ? getComputedStyle(fb).display : null, hit: hit ? hit.tagName : null }; })()`);
  check('全屏照片可见且缺图提示隐藏/不在最上层', lbState.nw > 0 && lbState.shown && lbState.fbHidden === true && lbState.fbDisplay === 'none' && lbState.hit === 'IMG', JSON.stringify(lbState));
  await js(`document.querySelector('[data-act="lb-next"]').click()`);
  await sleep(250);
  const lb2 = await js(`document.querySelector('#lbCount').textContent`);
  check('全屏下一张切到 2 / 3', lb2.trim() === '2 / 3', lb2);
  await shot('03_fullscreen_393.png');
  await js(`document.querySelector('[data-act="lb-close"]').click()`);
  await sleep(250);
  check('全屏可退出', !(await js(`document.querySelector('#lightbox').classList.contains('on')`)));

  /* 4b. 画廊按钮：下一张/上一张必须改变计数并实际滚动 */
  await js(`document.querySelector('#gallery').scrollLeft = 0`);
  await sleep(250);
  await js(`document.querySelector('[data-act="gallery-next"]').click()`);
  await sleep(700);
  const gNext1 = await js(`({ count: document.querySelector('#galleryCount').textContent.trim(), left: Math.round(document.querySelector('#gallery').scrollLeft), active: (document.querySelector('#galleryDots i.on')||{}).nextElementSibling ? Array.from(document.querySelectorAll('#galleryDots i')).findIndex(d => d.classList.contains('on')) : -1 })`);
  check('画廊「下一张」切到 2 / 3 且确实滚动', gNext1.count === '2 / 3' && gNext1.left > 40 && gNext1.active === 1, JSON.stringify(gNext1));
  await shot('11_gallery_next_393.png');
  await js(`document.querySelector('[data-act="gallery-next"]').click()`);
  await sleep(700);
  const gNext2 = await js(`({ count: document.querySelector('#galleryCount').textContent.trim(), left: Math.round(document.querySelector('#gallery').scrollLeft) })`);
  check('画廊连续「下一张」切到 3 / 3', gNext2.count === '3 / 3' && gNext2.left > gNext1.left, JSON.stringify(gNext2));
  await js(`document.querySelector('[data-act="gallery-prev"]').click()`);
  await sleep(700);
  const gPrev = await js(`({ count: document.querySelector('#galleryCount').textContent.trim(), left: Math.round(document.querySelector('#gallery').scrollLeft) })`);
  check('画廊「上一张」退回 2 / 3', gPrev.count === '2 / 3', JSON.stringify(gPrev));
  await js(`document.querySelector('#gallery').scrollLeft = 0`);
  await sleep(400);

  /* 4c. 更多按钮：顶栏 ··· 打开原型设置与范围说明 */
  await js(`document.querySelector('[data-act="more"]').click()`);
  await sleep(300);
  const moreSheet = await js(`document.querySelector('#modalBody').textContent`);
  check('更多按钮打开原型设置与范围说明', moreSheet.includes('更多 · 原型设置') && moreSheet.includes('范围与边界') && moreSheet.includes('N06-PROTOTYPE-0.2'), moreSheet.replace(/\\s+/g, ' ').slice(0, 90));
  await shot('12_more_sheet_393.png');
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 4d. 段落切换：第 2 段被选中时，标题与内容必须同步换成第 2 段 */
  const segBefore = await js(`({ active: (document.querySelector('.seg.on')||{}).textContent||'', title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'' })`);
  await js(`document.querySelectorAll('.seg')[1].click()`);
  await sleep(320);
  const seg2 = await js(`({ active: (document.querySelector('.seg.on')||{}).textContent||'', title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'', exps: document.querySelectorAll('#recordHost .exp').length })`);
  check('段落切换：点第 2 段后选中态与标题同步', segBefore.active.includes('第 1 段') && seg2.active.includes('第 2 段') && seg2.title.includes('傍晚再走一次'), JSON.stringify({ before: segBefore, after: seg2 }));
  await shot('13_segments_393.png');
  await js(`document.querySelectorAll('.seg')[0].click()`);
  await sleep(280);
  const segBack = await js(`({ active: (document.querySelector('.seg.on')||{}).textContent||'', title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'' })`);
  check('段落切换：可退回第 1 段', segBack.active.includes('第 1 段') && segBack.title.includes('第一次带朋友走骑楼'), JSON.stringify(segBack));

  /* 4e. 单段粘贴：只换当前段，不新增段、不删除旧段 */
  await js(`document.querySelector('[data-act="import-open"][data-mode="single"]').click()`);
  await sleep(300);
  await js(`(() => { const t = document.querySelector('#importText'); t.value = '这条街的灯在傍晚很好看。 The street lights look lovely in the evening.\\n我们慢慢走回钟楼。 We walked slowly back to the clock tower.\\n傍晚又走了一遍，店铺陆续亮灯，我们顺着骑楼慢慢走回钟楼，没有赶时间。\\nWe walked the same arcade again in the evening as the shops lit up, and we took our time going back to the clock tower.'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  const singlePreview = await js(`document.querySelector('#importPreview').textContent`);
  const singleDisabled = await js(`document.querySelector('#importConfirm').disabled`);
  const segBeforePaste = await js(`document.querySelectorAll('.seg').length`);
  const expBeforePaste = await js(`(document.querySelector('#recordHost .linkbtn')||{}).textContent||''`);
  check('单段粘贴识别为 1 段 / 2 条表达且可确认', singlePreview.includes('1 段') && singlePreview.includes('2 条表达') && singleDisabled === false, singlePreview.replace(/\\s+/g, ' ').slice(0, 80));
  await shot('14_single_paste_preview_393.png');
  await js(`document.querySelector('#importConfirm').click()`);
  await sleep(550);
  const singleAfter = await js(`({ segs: document.querySelectorAll('.seg').length, exps: document.querySelectorAll('#recordHost .exp').length, more: (document.querySelector('#recordHost .linkbtn')||{}).textContent||'', html: document.querySelector('#recordHost').textContent, modal: document.querySelector('#modal').classList.contains('on'), title: (document.querySelector('#recordHost .record-body > .row .pill')||{}).textContent||'' })`);
  check('单段确认后段数不变、当前段表达 4 → 6 且写入历史', singleAfter.segs === segBeforePaste && expBeforePaste.includes('展开全部 4 条表达') && singleAfter.more.includes('展开全部 6 条表达') && singleAfter.html.includes('粘贴合并到本段') && singleAfter.modal === false && singleAfter.title.includes('第一次带朋友走骑楼'), JSON.stringify({ segs: singleAfter.segs, more: singleAfter.more, title: singleAfter.title, modal: singleAfter.modal }));
  await js(`document.querySelector('#recordHost .linkbtn').click()`);
  await sleep(320);
  check('展开全部后当前段显示 6 条表达', (await js(`document.querySelectorAll('#recordHost .exp').length`)) === 6, `6 条`);
  await js(`document.querySelector('#recordHost .linkbtn').click()`);
  await sleep(260);

  /* 5. 下滚到问题与记录 */
  const sy04 = await js(`(() => { const el = Array.from(document.querySelectorAll('.section-head h2')).find(h => h.textContent.includes('可以这样接着聊')); const y = el.getBoundingClientRect().top + window.scrollY - 100; window.scrollTo(0, y); return { y: Math.round(y), after: Math.round(window.scrollY), top: Math.round(el.getBoundingClientRect().top) }; })()`);
  console.log('SCROLL04 ' + JSON.stringify(sy04));
  await sleep(400);
  await shot('04_hainan_questions_393.png', { top: false });

  /* 6. 整篇导入预览 */
  await js(`window.scrollTo(0,0)`);
  await js(`document.querySelector('[data-act="import-open"][data-mode="all"]').click()`);
  await sleep(250);
  await js(`document.querySelector('[data-act="import-sample"]').click()`);
  await sleep(350);
  const preview = await js(`document.querySelector('#importPreview').textContent`);
  const confirmDisabled = await js(`document.querySelector('#importConfirm').disabled`);
  check('整篇粘贴识别为 2 段 / 6 条表达', preview.includes('2 段') && preview.includes('6 条表达') && confirmDisabled === false, preview.slice(0, 80));
  await shot('05_import_preview_393.png');
  const beforeSeg = await js(`document.querySelectorAll('.seg').length`);
  await js(`document.querySelector('#importConfirm').click()`);
  await sleep(450);
  const afterSeg = await js(`document.querySelectorAll('.seg').length`);
  check('确认导入后新增 2 段（原 2 段 → 4 段）', afterSeg === beforeSeg + 2, `${beforeSeg} → ${afterSeg}`);
  check('导入后弹窗关闭', !(await js(`document.querySelector('#modal').classList.contains('on')`)));

  /* 7. 模糊格式拒绝 */
  await js(`document.querySelector('[data-act="import-open"][data-mode="all"]').click()`);
  await sleep(250);
  await js(`(() => { const t = document.querySelector('#importText'); t.value = '今天天气很好 It is nice today.\\n我们去了骑楼老街。 We went to Qilou.'; t.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(350);
  const errText = await js(`(document.querySelector('#importPreview .err')||{}).textContent||''`);
  const disabled2 = await js(`document.querySelector('#importConfirm').disabled`);
  check('格式模糊时拒绝猜测并禁用导入', errText.includes('没有识别到足够的中文整理段') && disabled2 === true, errText.slice(0, 60));
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 8. 错配排除与缺图地点 */
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
  check('龙兴路：0 张可用图 + 3 处可见提示', miss.imgs === 0 && miss.loadedImgs === 0 && miss.missingSlides === 3 && miss.visibleFallbacks === 3 && miss.hiddenFallbacks === 0, JSON.stringify(miss));
  check('龙兴路第 1 张标“已排除待核实”，其余标“待补图”', miss.texts.length === 3 && miss.texts[0].includes('已排除') && miss.texts.slice(1).every(t => t.includes('待补图') && t.includes('不用其他地点图片冒充')), miss.texts.join(' | '));
  for (const id of [62, 71, 115]) {
    await setHash('#hainan/' + id);
    const st = await js(`(() => {
      const slides = Array.from(document.querySelectorAll('#gallery .slide'));
      const imgs = Array.from(document.querySelectorAll('#gallery img'));
      const fbs = Array.from(document.querySelectorAll('#gallery .fallback')).filter(f => getComputedStyle(f).display !== 'none');
      return { slides: slides.length, imgs: imgs.length, prompts: fbs.length, texts: fbs.map(f => f.textContent.replace(/\\s+/g, ' ').trim()) };
    })()`);
    check(`地点 ${id} 的 3 张错配图全部排除并出提示`, st.slides === 3 && st.imgs === 0 && st.prompts === 3 && st.texts.every(t => t.includes('已排除') && t.includes('待核实')), JSON.stringify({ imgs: st.imgs, prompts: st.prompts }));
  }
  await setHash('#hainan/97');
  const x97 = await js(`(() => { const imgs = Array.from(document.querySelectorAll('#gallery img')); const fbs = Array.from(document.querySelectorAll('#gallery .fallback')).filter(f => getComputedStyle(f).display !== 'none'); return { imgs: imgs.filter(i => i.complete && i.naturalWidth > 0).length, prompts: fbs.length, texts: fbs.map(f => f.textContent.replace(/\\s+/g, ' ').trim()), source: (document.querySelector('.detail-body p.meta')||{}).textContent||'' }; })()`);
  check('西岛（97）保留 2 张可用图 + 1 张已排除提示', x97.imgs === 2 && x97.prompts === 1 && x97.texts[0].includes('澳大利亚'), JSON.stringify({ imgs: x97.imgs, prompts: x97.prompts }));
  check('西岛来源按实际槽位写：02、03 可用，第 1 张已排除', x97.source.includes('现有归档 02.webp、03.webp') && x97.source.includes('第 1 张按清单记录排除') && !x97.source.includes('01–03'), x97.source.replace(/\\s+/g, ' '));

  /* 8b. 来源文案按实际槽位：不再统一写 01–03 */
  const src1 = await (async () => { await setHash('#hainan/1'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('龙兴路来源写明第 1 张排除、第 2–3 张无归档', src1.includes('第 1 张按清单记录排除') && src1.includes('第 2–3 张无归档') && src1.includes('本页没有可用照片'), src1.replace(/\\s+/g, ' '));
  const src62 = await (async () => { await setHash('#hainan/62'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('石头公园来源写明 3 张全部排除、无可用照片', src62.includes('第 1–3 张按清单记录排除') && src62.includes('本页没有可用照片'), src62.replace(/\\s+/g, ' '));
  const src99 = await (async () => { await setHash('#hainan/99'); return js(`(document.querySelector('.detail-body p.meta')||{}).textContent||''`); })();
  check('亚龙湾来源列出实际 01–03 并单列第 3 张主题待核实', src99.includes('现有归档 01.webp、02.webp、03.webp') && src99.includes('第 3 张主题待核实'), src99.replace(/\\s+/g, ' '));

  /* 8c. 慢图不得误报缺图：状态函数与 3 秒超时路径都必须保持 pending */
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
  await setHash('#hainan/3');
  const qilou = await js(`({ imgs: Array.from(document.querySelectorAll('#gallery img')).filter(i => i.complete && i.naturalWidth > 0).length, prompts: Array.from(document.querySelectorAll('#gallery .fallback')).filter(f => getComputedStyle(f).display !== 'none').length })`);
  check('骑楼老街图库 3 张仍完整可见', qilou.imgs === 3 && qilou.prompts === 0, JSON.stringify(qilou));
  await setHash('#hainan/1');
  await js(`document.querySelector('#toast').classList.remove('on')`);
  await js(`(() => { const g = document.querySelector('#gallery'); const s = g && g.children[1]; if (s) g.scrollLeft = s.offsetLeft - 14; })()`);
  await sleep(400);
  await shot('10_missing_photo_393.png');

  /* 9. 聊天：按人物切换固定示例，明确不是 AI 实时理解 */
  await setHash('#chat');
  const chatOliver = await js(`({ text: document.querySelector('.content').textContent, tags: Array.from(document.querySelectorAll('.tagbtn')).map(b => b.textContent), follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', probe: (document.querySelectorAll('.coach-card .en')[1]||{}).textContent||'', basis: Array.from(document.querySelectorAll('.coach-card .basis')).map(x => x.textContent), topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'' })`);
  check('聊天页明确标注固定示例，不声称 AI 实时理解', chatOliver.text.includes('固定示例') && chatOliver.text.includes('不会根据你的输入实时理解') && chatOliver.text.includes('不调用云端 AI'), chatOliver.topic);
  check('Oliver 页不出现美国感恩节固定建议', !chatOliver.text.includes('感恩节') && !chatOliver.text.includes('Thanksgiving'), '0 处');
  check('接话与追问和当前对话一致并各自给出依据', chatOliver.follow.includes('How did the last set feel') && chatOliver.probe.includes('pull-up') && chatOliver.basis.length === 2 && chatOliver.basis.every(x => x.includes('依据：')), chatOliver.basis.join(' | '));
  check('聊天底部有地点、节日、人物小标签', chatOliver.tags.length === 3 && chatOliver.tags.some(x => x.includes('地点')) && chatOliver.tags.some(x => x.includes('节日')) && chatOliver.tags.some(x => x.includes('人物')), chatOliver.tags.join(' | '));
  await shot('06_chat_393.png');
  await js(`document.querySelector('.chat-tags').scrollIntoView({block:'center'})`);
  await sleep(300);
  await shot('06b_chat_tags_393.png', { top: false });

  /* 9b. 节日标签是选择器，不把某个国家节日固定套在人物身上 */
  await js(`document.querySelector('.tagbtn[data-tag="festival"]').click()`);
  await sleep(320);
  const tagSheet = await js(`({ text: document.querySelector('#modalBody').textContent, cards: document.querySelectorAll('#modalBody .qcard').length })`);
  check('节日标签给出可选话题并声明不推断对方是否庆祝', tagSheet.text.includes('不推断') && tagSheet.cards >= 1 && !tagSheet.text.includes('感恩节'), JSON.stringify({ cards: tagSheet.cards }));
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(220);

  /* 9c. 分享 / 换题：切换后对话、接话、话题标签同步换，且仍是固定样本 */
  await js(`(() => { const s = document.querySelector('#chatPerson'); s.value = 'maya'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  const chatMaya = await js(`({ text: document.querySelector('.content').textContent, topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'', follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', thread: (document.querySelector('#chatThread')||{}).textContent||'' })`);
  check('切换人物后对话、话题与接话都换成该人物样本', chatMaya.thread.includes('poster') && chatMaya.topic.includes('海报与演出') && chatMaya.follow.includes('Hand-drawn'), JSON.stringify({ topic: chatMaya.topic }));
  check('切换人物后不再残留 Oliver 的训练建议', !chatMaya.text.includes('pull-up') && !chatMaya.text.includes('引体向上'), '0 处残留');
  await shot('06c_chat_maya_393.png');
  await js(`document.querySelector('[data-act="chat-share"]').click()`);
  await sleep(320);
  const chatShare = await js(`({ text: document.querySelector('#modalBody').textContent, topics: document.querySelectorAll('[data-chat-topic]').length })`);
  check('聊天页有「分享 / 换题」控件和至少 2 个固定话题', chatShare.text.includes('分享 / 换题') && chatShare.text.includes('固定示例') && chatShare.topics >= 2, JSON.stringify({ topics: chatShare.topics }));
  await shot('17_chat_share_393.png');
  await js(`document.querySelector('[data-chat-topic="maya-haikou"]').click()`);
  await sleep(450);
  const chatSwitched = await js(`({ topic: (document.querySelector('.chat-topicbar .pill')||{}).textContent||'', follow: (document.querySelectorAll('.coach-card .en')[0]||{}).textContent||'', thread: (document.querySelector('#chatThread')||{}).textContent||'', sheet: document.querySelector('#modal').classList.contains('on') })`);
  check('换题后话题、对话与接话同步切换且弹层关闭', chatSwitched.topic.includes('海口行程') && chatSwitched.follow.includes('Four or five days') && chatSwitched.thread.includes('comparing dates') && chatSwitched.sheet === false, JSON.stringify({ topic: chatSwitched.topic, sheet: chatSwitched.sheet }));

  /* 10. 我的作品：搜索、B/C 分类、分享 */
  await setHash('#topics/works');
  const worksAll = await js(`document.querySelectorAll('#workList .work-card').length`);
  await js(`(() => { const i = document.querySelector('#workSearch'); i.value = '提词器'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(250);
  const worksFiltered = await js(`document.querySelectorAll('#workList .work-card').length`);
  check('我的作品搜索可过滤', worksAll === 11 && worksFiltered === 1, `${worksAll} → ${worksFiltered}`);
  await js(`(() => { const i = document.querySelector('#workSearch'); i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(200);
  await js(`document.querySelector('[data-workcat="B"]').click()`);
  await sleep(280);
  const catB = await js(`({ n: document.querySelectorAll('#workList .work-card').length, label: (document.querySelector('#workList .work-card .en')||{}).textContent||'' })`);
  check('B 类筛选不是死路：至少 1 条并标为分类示范补充', catB.n === 1 && catB.label.includes('B 类') && catB.label.includes('分类示范补充'), JSON.stringify(catB));
  await shot('15_works_cat_b_393.png');
  await js(`document.querySelector('[data-workcat="C"]').click()`);
  await sleep(280);
  const catC = await js(`({ n: document.querySelectorAll('#workList .work-card').length, label: (document.querySelector('#workList .work-card .en')||{}).textContent||'' })`);
  check('C 类筛选不是死路：至少 1 条并标为分类示范补充', catC.n === 1 && catC.label.includes('C 类') && catC.label.includes('分类示范补充'), JSON.stringify(catC));
  await js(`document.querySelector('[data-workcat="A"]').click()`);
  await sleep(280);
  const catA = await js(`document.querySelectorAll('#workList .work-card').length`);
  check('A 类仍保留 9 条现有演示样本', catA === 9, `${catA} 条`);
  await js(`document.querySelector('[data-workcat="全部"]').click()`);
  await sleep(280);
  check('「全部」恢复 11 条作品', (await js(`document.querySelectorAll('#workList .work-card').length`)) === 11);
  await shot('07_works_393.png');

  /* 10b. 作品分享：系统分享可用时调用，带作品中英介绍 */
  await setHash('#topics/works/P002');
  await js(`document.querySelector('[data-act="work-share"]').click()`);
  await sleep(300);
  const workShareSheet = await js(`document.querySelector('#modalBody').textContent`);
  check('作品详情有分享作品入口', workShareSheet.includes('分享作品') && workShareSheet.includes('调起系统分享') && workShareSheet.includes('复制中英介绍'), workShareSheet.replace(/\\s+/g, ' ').slice(0, 80));
  await shot('16_work_share_393.png');
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
  check('作品分享调用系统分享并带中英介绍', workShared.stubbed && workShared.captured && workShared.captured.text.includes('人生物种测试') && workShared.captured.text.includes('personality quiz'), JSON.stringify({ stubbed: workShared.stubbed, title: workShared.captured && workShared.captured.title }));
  await js(`try { delete navigator.share } catch (e) {}`);
  await js(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(200);

  /* 11. 关于我搜索、标签与整页截图 */
  await setHash('#self');
  const selfAll = await js(`document.querySelectorAll('#storyList .story-card').length`);
  await js(`(() => { const i = document.querySelector('#selfSearch'); i.value = '海口'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(250);
  const selfFiltered = await js(`document.querySelectorAll('#storyList .story-card').length`);
  check('关于我搜索保留且可用', selfAll === 5 && selfFiltered === 1, `${selfAll} → ${selfFiltered}`);
  check('关于我中英同时可见', await js(`document.querySelectorAll('#storyList .story-card .cn').length > 0 && document.querySelectorAll('#storyList .story-card .en').length > 0`));
  await js(`(() => { const i = document.querySelector('#selfSearch'); i.value = ''; i.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(250);
  const selfReset = await js(`({ n: document.querySelectorAll('#storyList .story-card').length, cats: document.querySelectorAll('.chip[data-selfcat]').length, kicker: (document.querySelector('.kicker')||{}).textContent||'' })`);
  check('关于我清空搜索后恢复 5 条并保留分类标签', selfReset.n === 5 && selfReset.cats >= 3 && selfReset.kicker.includes('关于我'), JSON.stringify(selfReset));
  await shot('18_self_393.png');

  /* 12. 人物详情：事实与待确认分离，示范问句不再写 AI */
  await setHash('#people/oliver');
  const person = await js(`({ facts: document.querySelectorAll('.fact:not(.pending)').length, pending: document.querySelectorAll('.fact.pending').length, q: document.querySelectorAll('.qcard').length, sessions: document.querySelectorAll('.session').length, text: document.querySelector('.content').textContent, pendingText: (document.querySelector('.fact.pending .en')||{}).textContent||'', factTexts: Array.from(document.querySelectorAll('.fact:not(.pending) .en')).map(x => x.textContent) })`);
  check('人物页确认事实与待确认分开', person.facts === 3 && person.pending === 1, JSON.stringify({ facts: person.facts, pending: person.pending }));
  check('人物页有中英续聊问句与历史', person.q >= 4 && person.sessions === 3, JSON.stringify({ q: person.q, sessions: person.sessions }));
  check('人物页待确认内容没有重复已确认事实', !person.factTexts.some(t => t.trim() === person.pendingText.trim()), person.pendingText.slice(0, 40));
  check('人物页示范问句明确为静态样本，不再写 AI 话题建议', !person.text.includes('AI 话题建议') && person.text.includes('静态示范') && person.text.includes('非 AI 生成'), '已改标');
  await shot('08_people_393.png');
  await js(`Array.from(document.querySelectorAll('.section-head h2')).find(h => h.textContent.includes('可以接续的问句')).scrollIntoView({block:'start'})`);
  await sleep(300);
  await shot('08b_people_questions_393.png', { top: false });

  /* 13. 深色主题 + 持久化 */
  await setHash('#hainan/4');
  await js(`document.querySelector('[data-act="theme"]').click()`);
  await sleep(300);
  const dark = await js(`document.documentElement.dataset.theme`);
  check('主题可切到深色', dark === 'dark');
  await sleep(900);
  await shot('09_dark_place_393.png');
  await cdp.send('Page.reload');
  await sleep(650);
  await waitImages();
  const darkPersist = await js(`document.documentElement.dataset.theme`);
  check('深色主题刷新后保持', darkPersist === 'dark', darkPersist);

  /* 14. 字号与横向溢出（多宽度） */
  const widths = [375, 393, 430, 520];
  const routes = ['#topics/festival', '#hainan/3', '#chat', '#self', '#people/oliver', '#topics/works'];
  const overflow = [];
  for (const w of widths) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 852, deviceScaleFactor: 2, mobile: true });
    for (const r of routes) {
      await setHash(r, 220);
      const o = await js(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, app: document.querySelector('#app').scrollWidth })`);
      if (o.sw > o.iw + 1 || o.app > o.iw + 1) overflow.push({ w, r, ...o });
    }
  }
  check('375/393/430/520 六个页面无横向溢出', overflow.length === 0, overflow.length ? JSON.stringify(overflow.slice(0, 3)) : '6 页 × 4 宽度');

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  await setHash('#topics/festival', 300);
  const fonts = await js(`(() => {
    const els = Array.from(document.querySelectorAll('body *')).filter(el => el.childElementCount === 0 && el.textContent.trim() && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden');
    const items = els.map(el => ({ tag: el.tagName, cls: el.className || '', size: parseFloat(getComputedStyle(el).fontSize), text: el.textContent.trim().slice(0, 12) }));
    const min = Math.min(...items.map(x => x.size));
    const body = parseFloat(getComputedStyle(document.body).fontSize);
    const h1 = parseFloat(getComputedStyle(document.querySelector('h1')).fontSize);
    return { min, body, h1, small: items.filter(x => x.size < 14).slice(0, 5) };
  })()`);
  check('正文字号 ≥19px，页面标题 ≥23px', fonts.body >= 19 && fonts.h1 >= 23, JSON.stringify({ body: fonts.body, h1: fonts.h1 }));
  check('没有小于 14px 的可见文本', fonts.min >= 14 && fonts.small.length === 0, JSON.stringify(fonts));

  /* 15. 控制台与资源 */
  check('无 JS 异常', report.errors.length === 0, report.errors.slice(0, 3).join(' | '));
  check('无图片/资源加载失败', report.failedRequests.length === 0, report.failedRequests.slice(0, 3).join(' | '));

  report.finishedAt = new Date().toISOString();
  report.result = report.checks.every(c => c.ok) ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(ROOT, 'verify-result.json'), JSON.stringify(report, null, 2));
  console.log('\nRESULT ' + report.result + ' · ' + report.checks.filter(c => c.ok).length + '/' + report.checks.length + ' checks · ' + report.shots.length + ' screenshots');
  process.exitCode = report.result === 'PASS' ? 0 : 1;
} catch (e) {
  console.error('VERIFY ERROR', e);
  report.errors.push(String(e && e.stack || e));
  report.finishedAt = new Date().toISOString();
  report.result = 'ERROR';
  fs.writeFileSync(path.join(ROOT, 'verify-result.json'), JSON.stringify(report, null, 2));
  process.exitCode = 2;
} finally {
  if (cdp) cdp.close();
  chrome.kill('SIGTERM');
  await sleep(400);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
}
