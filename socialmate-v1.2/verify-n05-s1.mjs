/**
 * N05 V1.1 · S1 验收：People 首页去开发化（只读前端产物，不改真实 People）。
 *
 * 断言：
 * 1) People 首屏 DOM 不含「演示人物/清空演示/恢复演示/合成 final/测试令牌」等开发控件；
 * 2) 设置 → 高级 → 演示与测试入口存在，并能触发恢复/清空；
 * 3) 演示默认关闭时，真实 People 列表不含三名演示人物；
 * 4) 三名演示可恢复（3 人 / 9 段 / 54 句，API + UI 双向回读）；
 * 5) 详情四区块（基础信息/兴趣与习惯/记忆时间线/下次聊天）可渲染，编辑态与批量态可进入，
 *    变更记录标题 + 列表容器 + 计数/空态可渲染；本项不触发演示写，撤回真实写入留 S2。
 *
 * 用法：node socialmate-v1.2/verify-n05-s1.mjs [--base http://127.0.0.1:8791/v12]
 * 退出码 0 = 全部 PASS。
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import WebSocket from './vendor/ws/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://127.0.0.1:8791/v12');
const PORT = Number(arg('--port', '9337'));
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(HERE, 'screenshots');
const PROFILE = `/tmp/sm-n05-s1-${process.pid}`;
const DEMO_NAMES = ['Oliver Reed', 'Maya Torres', 'Ji-eun Park'];
const DEV_WORDS = ['演示人物', '清空演示', '恢复演示', '合成 final', '合成final', '测试令牌', 'QA 统计', 'mock 回放'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const skipped = [];
function record(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => checks.push({name, ok: true}))
    .catch((error) => {
      checks.push({name, ok: false, error: error.message});
      throw error;
    });
}
function assert(ok, msg) {
  if (!ok) throw new Error(msg);
}

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=390,844', BASE,
], {stdio: 'ignore'});

let ws;
let msgId = 0;
const pending = new Map();
async function connect() {
  let target = null;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((x) => x.type === 'page' && String(x.url || '').startsWith(BASE));
      if (target) break;
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error('CDP 页面未就绪');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
  ws.on('message', (data) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const {resolve, reject} = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });
}
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, {resolve, reject});
    ws.send(JSON.stringify({id, method, params}));
  });
}
async function ev(expression) {
  const result = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || '页面脚本异常');
  }
  return result.result ? result.result.value : undefined;
}
async function waitFor(expression, timeout = 8000, label = expression) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await ev(expression).catch(() => false)) return true;
    await sleep(120);
  }
  throw new Error('等待超时：' + label);
}
async function shot(name) {
  const data = await send('Page.captureScreenshot', {format: 'png'});
  fs.mkdirSync(SHOTS, {recursive: true});
  const file = path.join(SHOTS, name + '.png');
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
  return file;
}
async function openDemoPanel() {
  await ev(`(()=>{const b=document.querySelector('#displaySettings');if(b)b.click();return true})()`);
  await waitFor(`!!document.querySelector('.advbox')`, 4000, '设置高级入口');
  await ev(`(()=>{const a=document.querySelector('.advbox');if(a&&!a.open){const s=a.querySelector('summary');if(s)s.click()}const d=document.querySelector('#demoAdv');if(d&&!d.open){const s=d.querySelector('summary');if(s)s.click()}return true})()`);
  await waitFor(`!!document.querySelector('#demometa') && document.querySelector('#demometa').textContent.includes('演示数据')`, 9000, '演示面板');
}
async function closeSettings() {
  await ev(`(()=>{const b=document.querySelector('[data-action="close"]');if(b)b.click();return true})()`);
  await sleep(150);
}
async function demoStatus() {
  const r = await fetch(`${BASE}/api/demo/people`, {cache: 'no-store'});
  assert(r.ok, '演示状态接口不可读');
  const d = await r.json();
  return d.status || {};
}
async function demoWrite(kind) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ticket = await (await fetch(`${BASE}/api/demo/write-ticket`, {cache: 'no-store'})).json();
      const r = await fetch(`${BASE}/api/demo/${kind}`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Origin: new URL(BASE).origin, 'x-sm-write': ticket.ticket},
        body: JSON.stringify({confirm: true}),
      });
      if (r.ok) return true;
      const d = await r.json().catch(() => ({}));
      if (d && d.code === 'RATE_LIMITED') { await sleep(1400); continue; }
    } catch {}
    await sleep(1400);
  }
  return false;
}
async function ensureDemoRestored() {
  const st = await demoStatus().catch(() => ({}));
  if (!(st.personas === 3 && st.sessions === 9 && st.segments === 54)) {
    await sleep(300);
    return demoWrite('restore');
  }
  return true;
}

let shotPeople = '';
let shotDemo = '';
try {
  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
  await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 12000, '页面加载');
  await ensureDemoRestored();

  await record('① People 首屏无开发控件', async () => {
    await ev(`document.querySelector('[data-nav="people"]').click()`);
    await waitFor(`document.querySelector('#content').textContent.includes('我的人物')`, 5000, 'People 首屏');
    const boot = await ev(`(()=>{const c=document.querySelector('#content');return {text:c.textContent,html:c.innerHTML}})()`);
    const hits = DEV_WORDS.filter((w) => boot.text.includes(w) || boot.html.includes(w));
    assert(!hits.length, '首屏仍含开发控件字样：' + hits.join('、'));
    assert(boot.text.includes('我的人物') && boot.html.includes('搜索人物'), '首屏缺少「我的人物」或搜索');
    assert(!!(await ev(`!!document.querySelector('[data-act="addperson"]')`)), '首屏缺少新建联系人');
    shotPeople = await shot('n05-s1-people-first');
  });

  await record('③ 演示默认关闭，真实列表不含演示人物', async () => {
    const blocked = await ev(`(()=>{const t=(document.querySelector('#results')||{}).textContent||'';return ${JSON.stringify(DEMO_NAMES)}.filter(n=>t.includes(n))})()`);
    assert(!blocked.length, '首屏列表混入演示人物：' + blocked.join('、'));
    const demoNodes = await ev(`document.querySelectorAll('#content [data-dperson], #content #demolist').length`);
    assert(demoNodes === 0, '首屏仍渲染演示人物节点');
    const open = await ev(`(()=>{const d=document.querySelector('#demoAdv');return d?d.open:null})()`);
    assert(open === null, '演示面板不应预置在首屏');
  });

  await record('② 设置→高级→演示与测试入口与恢复/清空', async () => {
    await ev(`document.querySelector('#displaySettings').click()`);
    await waitFor(`!!document.querySelector('.advbox')`, 4000, '设置高级入口');
    const entry = await ev(`(()=>{const a=document.querySelector('.advbox');const d=document.querySelector('#demoAdv');return {adv:!!a,demo:!!d,label:(d&&(d.querySelector('summary').textContent||'').trim())||''}})()`);
    assert(entry.adv && entry.demo, '缺少设置→高级→演示与测试入口');
    assert(entry.label.includes('演示与测试'), '入口标题不对：' + entry.label);
    await ev(`(()=>{const a=document.querySelector('.advbox');if(a&&!a.open){const s=a.querySelector('summary');if(s)s.click()}const d=document.querySelector('#demoAdv');if(d&&!d.open){const s=d.querySelector('summary');if(s)s.click()}return true})()`);
    await waitFor(`document.querySelector('#demometa') && /3 人/.test(document.querySelector('#demometa').textContent)`, 9000, '演示面板计数');
    shotDemo = await shot('n05-s1-settings-demo');
    const acts = await ev(`(()=>{const q=k=>!!document.querySelector('[data-demo-act="'+k+'"]');return {r:q('restore'),c:q('clear')}})()`);
    assert(acts.r && acts.c, '演示面板缺少恢复/清空按钮');

    await ev(`document.querySelector('[data-demo-act="clear"]').click()`);
    await waitFor(`!!document.querySelector('[data-demo-go="clear"]')`, 4000, '清空确认弹层');
    await ev(`document.querySelector('[data-demo-go="clear"]').click()`);
    try {
      await waitFor(`(async()=>{const r=await fetch('/v12/api/demo/people',{cache:'no-store'});const d=await r.json();return d.status&&d.status.personas===0})()`, 15000, '清空后 0 人');
    } catch (e) {
      const dbg = await ev(`(async()=>{let api='ERR';try{const r=await fetch('/v12/api/demo/people',{cache:'no-store'});const d=await r.json();api=d.status&&d.status.personas}catch(x){api=String(x)}return JSON.stringify({tip:(document.querySelector('#toast')||{}).textContent,n:S.demo.people.length,state:S.demo.state,meta:(document.querySelector('#demometa')||{}).textContent,api})})()`);
      throw new Error(e.message + ' | ' + dbg);
    }
    const cleared = await demoStatus();
    assert(cleared.personas === 0, '清空后演示人物仍为 ' + cleared.personas);
    await sleep(700); // 服务端写限流要求两次写间隔 ≥400ms（既有配额，不提高）

    await openDemoPanel();
    await waitFor(`/0 人/.test(document.querySelector('#demometa').textContent)`, 5000, '清空后 UI 显示 0 位');
    await ev(`document.querySelector('[data-demo-act="restore"]').click()`);
    await waitFor(`!!document.querySelector('[data-demo-go="restore"]')`, 4000, '恢复确认弹层');
    await ev(`document.querySelector('[data-demo-go="restore"]').click()`);
    try {
      await waitFor(`(async()=>{const r=await fetch('/v12/api/demo/people',{cache:'no-store'});const d=await r.json();const s=d.status||{};return s.personas===3&&s.sessions===9&&s.segments===54})()`, 15000, '恢复后 3 人/9 段/54 句');
    } catch (e) {
      const dbg = await ev(`(async()=>{let api='ERR';try{const r=await fetch('/v12/api/demo/people',{cache:'no-store'});const d=await r.json();api=[d.status.personas,d.status.sessions,d.status.segments,d.status.cleared]}catch(x){api=String(x)}return JSON.stringify({tip:(document.querySelector('#toast')||{}).textContent,state:S.demo.state,meta:(document.querySelector('#demometa')||{}).textContent,api})})()`);
      throw new Error(e.message + ' | ' + dbg);
    }
    const restored = await demoStatus();
    assert(restored.personas === 3 && restored.sessions === 9 && restored.segments === 54,
      `恢复计数不对：${restored.personas}/${restored.sessions}/${restored.segments}`);
  });

  await record('④ 三名演示可恢复且 UI 计数回读', async () => {
    await openDemoPanel();
    try {
      await waitFor(`/3 人/.test(document.querySelector('#demometa').textContent)&&/9 段/.test(document.querySelector('#demometa').textContent)&&/54 句/.test(document.querySelector('#demometa').textContent)`, 8000, 'UI 计数 3/9/54');
    } catch (e) {
      const dbg = await ev(`JSON.stringify({state:S.demo.state,err:S.demo.err,n:S.demo.people.length,meta:(document.querySelector('#demometa')||{}).textContent,adv:(document.querySelector('.advbox')||{}).open,demo:(document.querySelector('#demoAdv')||{}).open,list:(document.querySelector('#demolist')||{}).textContent})`);
      throw new Error(e.message + ' | ' + dbg);
    }
    const names = await ev(`Array.from(document.querySelectorAll('#demolist [data-dperson]')).map(x=>x.textContent).join(' ')`);
    for (const n of DEMO_NAMES) assert(names.includes(n), '演示列表缺少 ' + n);
    const st = await demoStatus();
    assert(st.personas === 3 && st.sessions === 9 && st.segments === 54, 'API 计数回读不一致');
  });

  await record('⑤ 详情四区块 / 编辑态 / 批量态 / 变更记录渲染', async () => {
    await ev(`document.querySelector('#demolist [data-dperson]').click()`);
    await waitFor(`!!document.querySelector('#drawerbody .pfhead')`, 6000, '演示详情');
    const txt = await ev(`document.querySelector('#drawerbody').textContent`);
    for (const sec of ['基础信息', '兴趣与习惯', '记忆时间线', '下次聊天']) assert(txt.includes(sec), '详情缺少区块：' + sec);
    const ui = await ev(`(()=>{const d=document.querySelector('#drawerbody');return {
      edit:!!d.querySelector('[data-pf-edit]'),bulk:!!d.querySelector('[data-pf-bulk]'),lang:!!d.querySelector('[data-pf-lang]'),
      undo:!!d.querySelector('[data-pf-undo]'),
      minBtn:Math.min.apply(null,Array.from(d.querySelectorAll('.pfgroup .btn')).map(b=>b.getBoundingClientRect().height)),
      bodyFont:parseFloat(getComputedStyle(d.querySelector('.pfrow')).fontSize)}})()`);
    assert(ui.edit && ui.bulk && ui.lang, '详情缺少编辑/批量/语言入口');
    assert(ui.minBtn >= 44, '详情按钮点按高度不足 44：' + ui.minBtn);
    assert(ui.bodyFont >= 15, '详情正文字号不足 15：' + ui.bodyFont);

    await shot('n05-s1-detail');

    /* S1 只验证前端入口与交互态。演示写操作需要归档令牌（配对后才有），
       验收脚本不绕过该门槛；真实写入与撤回留到 S2 验证。 */
    const editState = await ev(`(()=>{const d=document.querySelector('#drawerbody');d.querySelector('[data-pf-edit]').click();return {input:!!d.querySelector('#pfEditInput'),save:!!d.querySelector('[data-pf-saveedit]'),cancel:!!d.querySelector('[data-pf-canceledit]')}})()`);
    assert(editState.input && editState.save && editState.cancel, '编辑态未正确进入');
    await ev(`document.querySelector('#drawerbody [data-pf-canceledit]').click()`);
    await sleep(150);
    const bulkState = await ev(`(()=>{const d=document.querySelector('#drawerbody');d.querySelector('[data-pf-bulk]').click();return {all:!!d.querySelector('[data-pf-selectall]'),move:!!d.querySelector('[data-pf-move]'),del:!!d.querySelector('[data-pf-bulkdel]'),done:!!d.querySelector('[data-pf-bulk]')}})()`);
    assert(bulkState.all && bulkState.move && bulkState.del && bulkState.done, '批量态控件不完整');
    await ev(`document.querySelector('#drawerbody [data-pf-bulk]').click()`);
    await sleep(150);
    const changeArea = await ev(`(()=>{const d=document.querySelector('#drawerbody');
      const titles=Array.from(d.querySelectorAll('.sectiontitle'));
      const box=titles.find(x=>((x.querySelector('strong')||{}).textContent||'').trim()==='变更记录');
      const list=box?box.nextElementSibling:null;
      return {title:!!box,list:!!(list&&list.classList.contains('pftimeline')),
        count:box?((box.querySelector('small')||{}).textContent||''):'',
        empty:!!(list&&list.querySelector('.pfempty'))}})()`);
    assert(changeArea.title, '缺少变更记录标题');
    assert(changeArea.list, '变更记录列表容器未渲染');
    assert(/条 · 倒序/.test(changeArea.count) || changeArea.empty, '变更记录计数或空态未渲染：' + changeArea.count);
    const hasUndo = await ev(`!!document.querySelector('#drawerbody [data-pf-undo]')`);
    skipped.push(hasUndo
      ? '详情「撤回」按钮已渲染，但演示写入需归档令牌，S1 未实际点击（留 S2）'
      : '详情「撤回」入口需至少一条历史变更才会渲染；演示写入需归档令牌，S1 未实际点击（留 S2）');
    await ev(`document.querySelector('#closeDrawer').click()`);
  });

  await record('⑥ 主题：浅色默认、深色与跟随系统跨刷新保持', async () => {
    await ev(`(()=>{localStorage.removeItem('alw-preview-v1');location.reload();return true})()`);
    await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 12000, '刷新加载');
    const t0 = await ev(`document.documentElement.dataset.theme`);
    assert(t0 === 'light', '初始不是浅色：' + t0);
    await ev(`document.querySelector('#displaySettings').click()`);
    await waitFor(`!!document.querySelector('[data-theme-set="dark"]')`, 4000, '主题选项');
    const opts = await ev(`Array.from(document.querySelectorAll('[data-theme-set]')).map(b=>b.dataset.themeSet).join(',')`);
    assert(opts === 'light,dark,system', '主题选项不完整：' + opts);
    await ev(`document.querySelector('[data-theme-set="dark"]').click()`);
    await sleep(220);
    assert((await ev(`document.documentElement.dataset.theme`)) === 'dark', '深色未生效');
    await ev(`location.reload()`);
    await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 12000, '深色刷新');
    assert((await ev(`document.documentElement.dataset.theme`)) === 'dark', '刷新后深色未保持');
    await send('Emulation.setEmulatedMedia', {features: [{name: 'prefers-color-scheme', value: 'dark'}]});
    await ev(`document.querySelector('#displaySettings').click()`);
    await waitFor(`!!document.querySelector('[data-theme-set="system"]')`, 4000, '跟随系统选项');
    await ev(`document.querySelector('[data-theme-set="system"]').click()`);
    await sleep(250);
    assert((await ev(`document.documentElement.dataset.theme`)) === 'dark', '跟随系统未响应深色偏好');
    await ev(`document.querySelector('[data-theme-set="light"]').click()`);
    await sleep(220);
    assert((await ev(`document.documentElement.dataset.theme`)) === 'light', '恢复浅色失败');
    await send('Emulation.setEmulatedMedia', {features: []});
  });
} catch (error) {
  if (!checks.length || checks[checks.length - 1].ok) {
    checks.push({name: '执行中断', ok: false, error: error.message});
  }
} finally {
  // 收尾：无论成败都让演示副本回到 3 人 / 9 段 / 54 句，真实 People 不参与。
  try {
    await ensureDemoRestored();
    const st = await demoStatus();
    console.log('收尾演示状态：' + [st.personas, st.sessions, st.segments].join('/'));
  } catch (e) {
    console.error('收尾恢复演示失败：' + e.message);
  }
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ' — ' + c.error}`);
console.log(JSON.stringify({
  summary: failed.length ? 'FAIL' : 'PASS',
  total: checks.length,
  failed: failed.length,
  skipped,
  shots: {people: shotPeople, demoPanel: shotDemo},
}, null, 2));
process.exit(failed.length ? 1 : 0);