#!/usr/bin/env node
/**
 * N06 阶段 3 · 字幕主动点词查询验证（无头 Chrome + CDP）
 * 只读验证 8791 的 /v12/ 页面；AI 用页面内 mock，不产生费用。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'n06-s3-result.json');
const SHOTS = path.join(HERE, 'qa', 'n06-s3');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = `http://127.0.0.1:8791/v12/?v=${Date.now()}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

fs.mkdirSync(SHOTS, { recursive: true });
if (!fs.existsSync(CHROME)) { console.error('找不到 Chrome'); process.exit(2); }

const result = { startedAt: new Date().toISOString(), target: URL, chromeVersion: '', checks: [], shots: [], jsErrors: [], widths: [] };
function check(name, ok, detail) {
  result.checks.push({ name, ok: !!ok, detail: detail ?? '' });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'n06-s3-'));
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
  result.chromeVersion = (await cdp.send('Browser.getVersion')).product;

  cdp.on('Runtime.exceptionThrown', e => result.jsErrors.push(e.exceptionDetails?.exception?.description || e.exceptionDetails?.text || ''));
  cdp.on('Log.entryAdded', e => { if (e.entry.level !== 'error') return; const u = String(e.entry.url || ''); if (/favicon/i.test(u)) { result.favicon404 = true; return; } result.jsErrors.push(e.entry.text); });

  const js = async expr => {
    const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const shot = async name => {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(SHOTS, name), Buffer.from(data, 'base64'));
    result.shots.push(name);
  };
  const clickAt = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await sleep(500);
  };

  await cdp.send('Page.navigate', { url: URL });
  await sleep(1800);
  await js(`localStorage.removeItem('alw-preview-v1'); sessionStorage.clear();`).catch(() => {});
  await cdp.send('Page.reload');
  await sleep(1800);

  await js(`(() => {
    window.__termCalls = 0;
    window.__translateCalls = 0;
    window.__analyzeCalls = 0;
    window.__termPayloads = [];
    const orig = window.fetch.bind(window);
    window.fetch = function (u, o) {
      if (String(u) === '/api/ai/analyze') {
        window.__analyzeCalls++;
        return Promise.resolve(new Response(JSON.stringify({ ok: true, mode: 'real-ai', reply: { topic: '卡波耶拉', reply: 'That sounds like a great mix of movement and music!', questions: ['How long have you been practicing?'], share: 'Capoeira combines dance and music.' }, references: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (String(u) === '/api/ai/translate') {
        window.__translateCalls++;
        return Promise.resolve(new Response(JSON.stringify({ ok: true, zh: '我正在练卡波耶拉。' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      if (String(u) === '/api/ai/term') {
        window.__termCalls++;
        try { window.__termPayloads.push(JSON.parse((o && o.body) || '{}')); } catch {}
        const term = (JSON.parse((o && o.body) || '{}').term) || 'word';
        return Promise.resolve(new Response(JSON.stringify({
          ok: true, term,
          zh: term === 'capoeira' ? '卡波耶拉，一种融合武术、舞蹈和音乐的巴西运动。' : ('这是 ' + term + ' 的中文解释。'),
          en: term === 'capoeira' ? 'Capoeira is a Brazilian martial art that mixes dance, music and acrobatics.' : ('This is a plain English explanation of ' + term + '.'),
          asks: [
            { kind: 'like', zh: '你最喜欢它哪一点？', en: 'What do you like most about it?' },
            { kind: 'compare', zh: '它和你练过的其他运动有什么不同？', en: "How is it different from other sports you've tried?" },
            { kind: 'experience', zh: '练起来是什么感觉？', en: "What's it like to actually do it?" },
            { kind: 'benefit', zh: '练它最大的收获是什么？', en: 'What do you get out of it?' }
          ],
          askZh: '你最喜欢它哪一点？',
          askEn: 'What do you like most about it?'
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return orig(u, o);
    };
  })()`);

  await js(`setTab('chat')`);
  await sleep(400);
  await js(`S.session={messages:[{who:'friend',text:"I've started doing capoeira. It's a Brazilian martial art with dance and music!",id:'mterm1'}],cloudConsent:true};render();`);
  await sleep(500);

  check('聊天页渲染出可点英文字幕', await js(`!!document.querySelector('#messages .v152en[data-term-src]')`));
  check('默认不出现解释卡', await js(`!document.getElementById('termCard')`));
  const markInfo = await js(`({ marks: document.querySelectorAll('.v152en mark, .v152en .term, .termbadge, .termhint').length, underline: getComputedStyle(document.querySelector('.v152en')).textDecorationLine })`);
  check('默认不给字幕逐词标注或下划线', markInfo.marks === 0 && markInfo.underline === 'none', JSON.stringify(markInfo));
  await shot('s3-01-chat-clean.png');

  const pos = await js(`(() => {
    const p = document.querySelector('#messages .v152en'); if (!p || !p.firstChild) return null;
    const t = p.textContent.indexOf('capoeira'); if (t < 0) return null;
    const r = document.createRange();
    r.setStart(p.firstChild, t + 3); r.setEnd(p.firstChild, t + 5);
    const rect = r.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  check('能定位到字幕里的英文词坐标', !!pos, JSON.stringify(pos));

  if (pos) await clickAt(pos.x, pos.y);
  const opened = await js(`(() => { const c = document.getElementById('termCard'); if (!c) return null; return { text: c.innerText, calls: window.__termCalls, payload: window.__termPayloads[0] || null, subtitles: document.querySelectorAll('#messages .v152en').length, subText: (document.querySelector('#messages .v152en') || {}).textContent || '', asr: S.asrState }; })()`);
  check('点英文词后出现解释卡', !!opened, opened ? String(opened.calls) : 'no card');
  check('解释卡显示中文解释与英文解释', !!opened && opened.text.includes('卡波耶拉') && opened.text.includes('Capoeira is a Brazilian martial art'));
  const askCount = await js(`document.querySelectorAll('#termCard [data-term="copyask"]').length`);
  check('解释卡给出四条顺势问，且不问“你听过吗”', !!opened && askCount === 4 && ['What do you like most about it?', "How is it different from other sports you've tried?", "What's it like to actually do it?", 'What do you get out of it?'].every(x => opened.text.includes(x)) && !opened.text.includes('你听过'));
  check('点词只发一次查询，且只送被点的词与原句', !!opened && opened.calls === 1 && opened.payload && opened.payload.term === 'capoeira' && String(opened.payload.context).includes('Brazilian martial art'), JSON.stringify(opened && opened.payload));
  check('查询不改变字幕原文、条数与识别状态', !!opened && opened.subtitles === 1 && opened.subText.startsWith("I've started doing capoeira") && opened.asr === 'off');
  await shot('s3-02-term-card.png');

  await js(`document.querySelector('#termCard [data-term="close"]').click()`);
  await sleep(300);
  check('解释卡可关闭', await js(`!document.getElementById('termCard')`));

  if (pos) await clickAt(pos.x, pos.y);
  check('相同词再点命中本地缓存，不重复计费调用', (await js(`window.__termCalls`)) === 1 && await js(`!!document.getElementById('termCard')`));
  await js(`document.querySelector('#termCard [data-term="close"]').click()`);
  await sleep(200);

  await js(`S.v152.termCache={}; SAV.termCache={}; S.session.cloudConsent=false; S.v152.term=null;`);
  if (pos) await clickAt(pos.x, pos.y);
  const consentText = await js(`(() => { const c = document.getElementById('termCard'); return c ? c.innerText : ''; })()`);
  check('无需任何勾选：旧会话态为 false 时点词也直接查询', (await js(`window.__termCalls`)) === 2 && consentText.includes('卡波耶拉'), `calls=${await js(`window.__termCalls`)}`);
  const consentUi = await js(`({ inputs: document.querySelectorAll('input[type="checkbox"][id*="onsent"],input[type="checkbox"][id*="Consent"],#n05AiConsent,#n05RecAi,#liveCloudConsent').length, confirmTts: document.documentElement.innerHTML.includes("用豆包语音朗读这段文字"), confirmTranslate: document.documentElement.innerHTML.includes("将这一句英文发送给云端翻译") })`);
  check('页面不再有任何 AI 同意复选框或费用确认弹窗', consentUi.inputs === 0 && !consentUi.confirmTts && !consentUi.confirmTranslate, JSON.stringify(consentUi));
  await shot('s3-03-no-consent.png');
  await js(`document.querySelector('#termCard [data-term="close"]').click()`);
  await sleep(200);

  await js(`S.session.messages[0].zh=null; S.session.messages[0].zhState=null; vsTranslateMessage('mterm1');`);
  await sleep(500);
  const tr = await js(`({ calls: window.__translateCalls, zh: (S.session.messages[0]||{}).zh || '', state: (S.session.messages[0]||{}).zhState || '' })`);
  check('点翻译按钮不再弹确认，直接请求并显示中文', tr.calls === 1 && !!tr.zh && tr.state === 'ready', JSON.stringify(tr));
  await shot('s3-08-translate-direct.png');

  await js(`S.session.cloudConsent=true; termQuery('berimbau',"She plays the berimbau when they practise.",true);`);
  await sleep(500);
  const inputCard = await js(`(() => { const c = document.getElementById('termCard'); return c ? { title: (c.querySelector('.termtitle') || {}).textContent || '', text: c.innerText } : null; })()`);
  check('可在卡内改查另一个词', !!inputCard && inputCard.title === 'berimbau' && inputCard.text.includes('berimbau'));
  await js(`document.querySelector('#termCard [data-term="close"]').click()`);
  await sleep(200);

  /* 话题内容包 */
  await js(`setTab('topics'); S.topic='works'; render();`);
  await sleep(400);
  for (const [key, expect] of [['daily', 20], ['culture', 20], ['fitness', 46], ['more', 84]]) {
    await js(`S.topic=${JSON.stringify(key)};render();`);
    await sleep(350);
    const n = await js(`document.querySelectorAll('#content .fest-card').length`);
    const btns = await js(`document.querySelectorAll('#content [data-n06copy]').length`);
    check(`话题「${key}」有 ${expect} 条可聊卡片与复制问句`, n === expect && btns > 0, JSON.stringify({ n, btns }));
  }
  await js(`setTab('chat');S.ai=null;S.aiState='demo';requestRealAI();`);
  await sleep(900);
  const rec = await js(`({ calls: window.__analyzeCalls, state: S.aiState, text: (document.getElementById('coachresults')||{}).innerText||'' })`);
  check('自动接话无需同意，直接请求且不出现 [object Object]', rec.calls === 1 && rec.state === 'ready' && rec.text.includes('That sounds like a great mix') && !rec.text.includes('[object Object]'), JSON.stringify({ calls: rec.calls, state: rec.state, obj: rec.text.includes('[object Object]'), text: rec.text.slice(0, 160) }));
  await js(`setTab('topics');`);
  await sleep(250);

  await js(`S.topic='fitness';render();`);
  await sleep(350);
  const fitGroups = await js(`Array.from(document.querySelectorAll('#content .sectiontitle strong')).map(x=>x.textContent.trim())`);
  check('健身页按「球类 / 板类与户外 / 体能与日常 / 观赛与赛事」分组', ['球类', '板类与户外', '体能与日常', '观赛与赛事'].every(k => fitGroups.includes(k)), fitGroups.join('｜'));
  const ballTitles = await js(`Array.from(document.querySelectorAll('#content .fest-card h3')).map(x=>x.textContent)`);
  check('球类含乒乓球、匹克球、网球、羽毛球', ['乒乓球', '匹克球', '网球', '羽毛球'].every(k => ballTitles.some(t => t.includes(k))));
  await shot('s3-06-fitness-balls.png');
  await js(`S.topic='more';render();`);
  await sleep(350);
  const moreGroups = await js(`Array.from(document.querySelectorAll('#content .sectiontitle strong')).map(x=>x.textContent.trim())`);
  check('更多页按工作学习/家庭与关系/金钱健康科技等分组', ['工作学习', '家庭与关系', '金钱健康科技', '旅行与美食'].every(k => moreGroups.includes(k)), moreGroups.join('｜'));
  await shot('s3-07-more-groups.png');
  await js(`S.topic='daily';render();`);
  await sleep(300);
  await shot('s3-04-topics-daily.png');
  await js(`S.topic='festival';S.festWin='all';render();`);
  await sleep(400);
  const festCounts = await js(`({ all: document.querySelectorAll('#content .fest-card').length, pending: document.querySelectorAll('#content .tag.warn').length, ok: document.querySelectorAll('#content .tag.ok').length })`);
  check('节日仍为 47 条，待确认只剩 3 条', festCounts.all === 47 && festCounts.pending === 3, JSON.stringify(festCounts));
  await shot('s3-05-festival-verified.png');

  for (const w of [375, 393, 430, 520]) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: 852, deviceScaleFactor: 2, mobile: true });
    await sleep(250);
    const ov = await js(`({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    result.widths.push({ w, ...ov });
    check(`${w}px 无横向溢出`, ov.sw <= ov.iw + 1, JSON.stringify(ov));
  }

  check('本次验证无 JS 异常', result.jsErrors.length === 0, result.jsErrors.slice(0, 3).join(' | '));

  result.finishedAt = new Date().toISOString();
  result.pass = result.checks.filter(c => c.ok).length;
  result.total = result.checks.length;
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`\nRESULT ${result.pass}/${result.total} checks passed · shots=${result.shots.length}`);
  process.exit(result.pass === result.total ? 0 : 1);
} catch (e) {
  console.error('FATAL', e);
  fs.writeFileSync(OUT, JSON.stringify({ ...result, fatal: String(e) }, null, 2));
  process.exit(2);
} finally {
  try { cdp && cdp.close(); } catch {}
  try { chrome.kill('SIGTERM'); } catch {}
}