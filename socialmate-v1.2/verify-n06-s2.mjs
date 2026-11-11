#!/usr/bin/env node
/**
 * N06 阶段 2 · 正式 APP 页面接入验证（无头 Chrome + CDP）
 * 只读验证 8791 服务的 /v12/ 页面；不装机、不改配置、不写业务数据。
 * 交互顺序：点 Tab → 回读 DOM → 断言；每一步都等页面渲染完成。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'n06-s2-result.json');
const SHOTS = path.join(HERE, 'qa', 'n06-s2');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.N06_URL || 'http://127.0.0.1:8791/v12/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome'); process.exit(2); }

const result = {
  startedAt: new Date().toISOString(), target: URL, chromeVersion: '',
  checks: [], observations: [], shots: [], jsErrors: [], logErrors: [], netFailures: [], widths: []
};
function check(name, ok, detail) {
  result.checks.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n06-s2-'));
const portFile = path.join(profile, 'DevToolsActivePort');
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--disable-background-networking', '--disable-default-apps', '--disable-sync',
  '--disable-extensions', 'about:blank'
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
  close() { try { this.ws.close(); } catch {} }
}

let cdp = null;
try {
  const port = await waitPort();
  const page = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
  cdp = await CDP.connect(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  result.chromeVersion = (await cdp.send('Browser.getVersion')).product;

  cdp.on('Runtime.exceptionThrown', e => result.jsErrors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text || ''));
  cdp.on('Log.entryAdded', e => { if (e.entry.level === 'error') result.logErrors.push(e.entry.text); });
  cdp.on('Network.loadingFailed', e => { if (!e.canceled) result.netFailures.push(e.errorText + ' ' + (e.requestId || '')); });

  const js = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const click = async (sel, wait = 300) => {
    const ok = await js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    await sleep(wait);
    return ok;
  };
  const shot = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    result.shots.push(name);
  };

  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await js(`localStorage.removeItem('alw-preview-v1')`).catch(() => {});
  await cdp.send('Page.reload');
  await sleep(1800);

  /* 1. 五 Tab */
  const tabs = await js(`Array.from(document.querySelectorAll('.mobilebar [data-nav]')).map(b => b.textContent.trim().replace(/^[^\\u4e00-\\u9fa5A-Za-z]+/, ''))`);
  check('底部恰好五个 Tab：话题｜海南｜聊天｜关于我｜人物', JSON.stringify(tabs) === JSON.stringify(['话题', '海南', '聊天', '关于我', '人物']), tabs.join('｜'));

  /* 1b. 顶栏不再重复页名，标签密度对齐原型 */
  const topInfo = await js(`(() => { const top = document.querySelector('.top'); const first = document.querySelector('#topicbar .chip, #topicbar [data-topic]'); const cs = first ? getComputedStyle(first) : null; const bar = document.querySelector('#topicbar'); const bcs = bar ? getComputedStyle(bar) : null; return { hasPageTitle: !!document.querySelector('#pageTitle'), topText: (top && top.innerText || '').trim(), chipH: first ? Math.round(first.getBoundingClientRect().height) : 0, chipFont: cs ? cs.fontSize : '', gap: bcs ? bcs.columnGap : '' }; })()`);
  check('顶栏不重复显示「话题」页名', !topInfo.hasPageTitle && !topInfo.topText.includes('话题'), JSON.stringify(topInfo));
  check('子标签高度 ≤ 36px 且间距 ≤ 8px', topInfo.chipH > 0 && topInfo.chipH <= 36 && parseFloat(topInfo.gap) <= 8, `h=${topInfo.chipH} gap=${topInfo.gap} font=${topInfo.chipFont}`);

  /* 2. 默认话题页与子标签 */
  const topicBar = await js(`Array.from(document.querySelectorAll('#topicbar [data-topic]')).map(b => b.textContent.trim())`);
  check('默认进入话题页且 6 个子标签齐全', JSON.stringify(topicBar) === JSON.stringify(['节日', '日常生活', '文化习俗', '健身运动', '我的作品', '更多']), topicBar.join('｜'));
  check('默认子页为我的作品且作品入口可用', await js(`!!document.querySelector('#topicbar [data-topic="works"].on') && !!document.querySelector('[data-act="card-new"][data-kind="app"]') && !!document.querySelector('[data-act="card-trash"][data-kind="app"]')`));
  await shot('s2-01-topics-works.png');

  /* 3. 节日页 */
  await click('[data-topic="festival"]');
  const fest14 = await js(`document.querySelectorAll('.fest-card').length`);
  check('节日默认未来 14 天有候选卡片', fest14 > 0, String(fest14));
  await click('[data-festwin="all"]');
  const festAll = await js(`document.querySelectorAll('.fest-card').length`);
  check('「全部」展示 47 个候选节日', festAll === 47, String(festAll));
  const pending = await js(`document.querySelectorAll('.fest-card .tag.warn').length`);
  check('未核实日期标「日期待确认」而不是倒计时', pending > 0, String(pending));
  check('每条话题提供可复制的英文问句', await js(`document.querySelectorAll('[data-n06copy]').length > 0`));
  await shot('s2-02-festival-all.png');

  /* 4. 我的作品搜索 */
  await click('[data-topic="works"]');
  const worksBefore = await js(`document.querySelectorAll('#results .card').length`);
  await js(`(() => { const i = document.querySelector('#search'); i.value = 'Personality'; i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(350);
  const worksAfter = await js(`document.querySelectorAll('#results .card').length`);
  check('我的作品搜索可用且结果收窄', worksBefore > 0 && worksAfter > 0 && worksAfter < worksBefore, `${worksBefore} → ${worksAfter}`);

  await click('.mobilebar [data-nav="self"]', 600);
  check('关于我搜索与新建/回收站已上移到顶栏', await js(`!!document.querySelector('#topActions .searchrow') && !!document.querySelector('#topActions [data-act="card-new"]') && !!document.querySelector('#topActions [data-act="card-trash"]')`));
  await shot('s2-03b-self-list.png');
  await click('.mobilebar [data-nav="people"]', 600);
  check('人物页搜索已上移到顶栏', await js(`!!document.querySelector('#topActions .searchrow')`));

  /* 5. 默认主题 SYSTEM */
  await click('#displaySettings', 500);
  const theme = await js(`(() => { const el = document.querySelector('[data-theme-set].on'); return el ? el.dataset.themeSet : ''; })()`);
  check('默认主题为跟随系统（SYSTEM）', theme === 'system', theme);
  await click('[data-action="close"]', 300);

  /* 6. 海南列表与多图 */
  await click('.mobilebar [data-nav="hainan"]', 600);
  const hainanTop = await js(`({ search: !!document.querySelector('#topActions .searchrow'), lang: !!document.querySelector('#topActions .langbar'), fresh: !!document.querySelector('#topActions [data-act="card-new"]'), trash: !!document.querySelector('#topActions [data-act="card-trash"]') })`);
  check('海南页搜索/新建/回收站/介绍语言已上移到顶栏', hainanTop.search && hainanTop.lang && hainanTop.fresh && hainanTop.trash, JSON.stringify(hainanTop));
  await shot('s2-03a-hainan-list.png');
  const placeCount = await js(`document.querySelectorAll('#results .placecard').length`);
  check('海南列表展示 115 个公开地点', placeCount === 115, String(placeCount));
  await js(`document.querySelector('[data-open="place"][data-id="3"]').click()`);
  await sleep(700);
  const gal = await js(`({ imgs: document.querySelectorAll('.n06gal-track img').length, count: (document.querySelector('.n06gal-count')||{}).textContent||'' })`);
  check('骑楼老街详情显示 3 张可用图片与 1 / 3 计数', gal.imgs === 3 && gal.count.trim() === '1 / 3', JSON.stringify(gal));
  await shot('s2-03-hainan-gallery.png');
  await click('.n06gal-item', 400);
  const lb = await js(`({ open: !document.querySelector('#n06lightbox').hidden, count: (document.querySelector('#n06lbcount')||{}).textContent||'' })`);
  check('点图进入全屏并显示 1 / 3', lb.open && lb.count.trim() === '1 / 3', JSON.stringify(lb));
  await click('[data-n06lbnext]', 350);
  check('全屏「下一张」切到 2 / 3', (await js(`document.querySelector('#n06lbcount').textContent.trim()`)) === '2 / 3');
  await shot('s2-04-lightbox.png');
  await click('[data-n06lbclose]', 300);
  check('全屏可关闭', await js(`document.querySelector('#n06lightbox').hidden`));
  await click('#closeDrawer', 300);

  /* 7. 缺图地点 */
  await js(`document.querySelector('[data-open="place"][data-id="1"]').click()`);
  await sleep(600);
  check('龙兴路显示真实缺图提示，不用其他地点图片替代', await js(`!!document.querySelector('.n06-noimg') && document.querySelectorAll('.n06gal-track img').length === 0`));
  await click('#closeDrawer', 250);

  /* 9. 聊天节日小标签 */
  await click('.mobilebar [data-nav="chat"]', 700);
  const festChip = await js(`(() => { const el = document.querySelector('[data-v152share="festival"]'); return el ? el.textContent.trim() : ''; })()`);
  check('聊天底部出现节日关联小标签', !!festChip, festChip);
  if (festChip) {
    await click('[data-v152share="festival"]', 450);
    const card = await js(`({ title: (document.querySelector('#v152share h3')||{}).textContent||'', text: (document.querySelector('#v152share')||{}).textContent||'', copy: !!document.querySelector('[data-v152="copy-share"]') })`);
    check('点节日标签给出中英问句与复制入口', card.title.includes(festChip) && /[A-Za-z]{4,}/.test(card.text) && /[\u4e00-\u9fa5]{2,}/.test(card.text) && card.copy, card.title);
    await shot('s2-05-chat-festival.png');
    await click('[data-v152="close-share"]', 300);
  }

  /* 10. 游玩记录解析器（不写库；UI 入口需真机 UI token，标 BLOCKED） */
  const html = await fetch(URL).then(r => r.text());
  check('游玩记录编辑器含「识别预览」入口', html.includes('data-n05="rec-preview"') && html.includes('n05RecPreview'));
  const sample = '这条街的灯在傍晚很好看。 The street lights look lovely in the evening.\n我们慢慢走回钟楼。 We walked slowly back to the clock tower.\n傍晚又走了一遍，店铺陆续亮灯，我们顺着骑楼慢慢走回钟楼，没有赶时间。\nWe walked the same arcade again in the evening as the shops lit up, and we took our time going back to the clock tower.\n---\n早上人少，骑楼下面很凉快。 The arcade is cool and quiet in the morning.\n我们买了两杯咖啡，坐在街边看人来人往。\nWe bought two coffees and sat by the street watching people go by.';
  const parsed = await js(`window.__n06ParseImport(${JSON.stringify(sample)})`);
  check('整篇粘贴解析为 2 段 / 3 条表达', parsed && parsed.blocks && parsed.blocks.length === 2 && parsed.expressionCount === 3, JSON.stringify({ blocks: parsed && parsed.blocks && parsed.blocks.length, expressions: parsed && parsed.expressionCount }));
  const mixed = await js(`window.__n06ParseImport('只有一行中文没有英文段落，无法识别成完整记录。')`);
  check('格式不完整时拒绝猜测并给出错误', !!mixed && !!mixed.error, mixed && mixed.error);
  result.observations.push({ id: 'record-ui', note: '浏览器直连 8791 时 /v12/api/places/:id 返回 401（无 UI token），记录编辑入口需真机 LocalServer 鉴权；本轮只验证解析器与模板入口。' });
  console.log('OBSERVE record-ui — 浏览器环境无 UI token，记录编辑 UI 未点开；解析器已验');

  /* 11. 软件内版本号与构建配置一致 */
  const gradle = fs.readFileSync(path.join(HERE, '../android-poc/app/build.gradle'), 'utf8');
  const vc = (gradle.match(/versionCode\s+(\d+)/) || [])[1];
  const vn = (gradle.match(/versionName\s+'([^']+)'/) || [])[1];
  check('软件内版本号与构建配置一致', !!vn && html.includes(`版本 ${vn}（构建 ${vc}）`), `${vn} / vc${vc}`);

  /* 8. 宽度 */
  for (const w of [375, 393, 430, 520]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 852, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const v = await js(`({ w: innerWidth, sw: document.documentElement.scrollWidth, body: document.body.scrollWidth })`);
    result.widths.push({ width: w, ...v });
    check(`${w}px 无横向溢出`, v.sw <= v.w + 1 && v.body <= v.w + 1, JSON.stringify(v));
  }

  check('页面运行无 JS 异常', result.jsErrors.length === 0, result.jsErrors.slice(0, 3).join(' | '));
  const ok = result.checks.every(c => c.ok);
  console.log(`RESULT ${ok ? 'PASS' : 'FAIL'} · ${result.checks.filter(c => c.ok).length}/${result.checks.length} checks · ${result.shots.length} screenshots`);
} catch (e) {
  console.error('VERIFY ERROR', e);
  result.error = String(e);
} finally {
  try { cdp && cdp.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  result.finishedAt = new Date().toISOString();
  result.totals = { pass: result.checks.filter(c => c.ok).length, fail: result.checks.filter(c => !c.ok).length, shots: result.shots.length };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log('RESULT ' + path.relative(HERE, OUT));
}