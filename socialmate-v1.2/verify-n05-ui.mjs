/**
 * N05 V1.1 · S5 UI 联调验收（CDP 驱动真实 8791 页面）
 *
 * 覆盖：
 * ① 旧友补记：3 段 → 候选 → 勾掉 1 条 → 确认写入；未确认 0 写入；另一人物 sha 不变
 * ② 地点活档案：10 段 → ≥3 段、逐字回溯、英 A/B；115 源 sha 不变；记录可重开
 * ③ 分段听读：无原生桥不假成功；中文/英A/英B 触发桥调用且语言正确；切段停止旧队列
 * ④ GPT 练习：Prompt 含段 ID/版本、不含他人姓名/token；两份报告并存且旧文件字节不变
 * ⑤ 错匹配：从错误地点进入，手选 placeId=1（龙兴路）后记录只落到该地点
 * ⑥ 失败路径：aiConsent=false → AI_UNAVAILABLE 降级 + 手工切句，输入不丢
 * ⑦ 合并/拆分/编辑：仍逐字回原文，句数守恒
 * ⑧ 主题（附加）：浅色默认，深色跨刷新保持，跟随系统选项存在
 *
 * 用法：node socialmate-v1.2/verify-n05-ui.mjs [--base http://127.0.0.1:8791/v12]
 * 退出码 0 = 全部 PASS。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import WebSocket from './vendor/ws/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg('--base', 'http://127.0.0.1:8791/v12');
const ORIGIN = new URL(BASE).origin;
const PORT = Number(arg('--port', '9338'));
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOTS = path.join(HERE, 'screenshots');
const PROFILE = `/tmp/sm-n05-ui-${process.pid}`;
const TOKEN = fs.readFileSync(path.join(HERE, '.local/archive-token'), 'utf8').trim();
const PEOPLE = path.join(ROOT, 'SocialMate-Data/People');
const PLACES115 = path.join(HERE, 'source/places-115.json');
const NOTES = path.join(ROOT, 'SocialMate-Data/PlaceNotes');
const PERSON_A = 'n05ui-a';
const PERSON_B = 'n05ui-b';
const NAME_A = 'N05 UI 测试甲';
const NAME_B = 'N05 UI 测试乙';
const OWN_NAMES = [NAME_A, NAME_B, 'n05ui-a', 'n05ui-b'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const skipped = [];
const info = {};

function assert(ok, msg) { if (!ok) throw new Error(msg); }
function shaFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
async function shaFileIf(file) {
  try { return shaFile(file); } catch { return null; }
}
function profileFile(slug) { return path.join(PEOPLE, slug, '00-profile.md'); }

async function api(pathname, {method = 'GET', body, token = TOKEN, write = false} = {}) {
  const headers = {Accept: 'application/json', Origin: ORIGIN};
  if (token) headers['x-archive-token'] = token;
  if (body) headers['Content-Type'] = 'application/json';
  if (write) {
    const t = await (await fetch(`${ORIGIN}/v12/api/demo/write-ticket`, {cache: 'no-store'})).json();
    headers['x-sm-write'] = t.ticket;
  }
  const r = await fetch(ORIGIN + pathname, {method, headers, cache: 'no-store', body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`${d.code || 'HTTP ' + r.status} ${d.error || ''}`.trim());
    e.status = r.status; e.code = d.code; e.data = d;
    throw e;
  }
  return d;
}
async function ensurePerson(slug, name) {
  const d = await api('/v12/api/people', {method: 'POST', token: TOKEN, body: {slug, name, confirm: true}});
  return d.person || {slug, name};
}
async function getPerson(slug) {
  const d = await api('/v12/api/people/' + encodeURIComponent(slug));
  return d.person || {};
}
async function getPlace(id) {
  return api('/v12/api/places/' + encodeURIComponent(String(id)));
}
function practiceFiles(placeId, blockId) {
  const dir = path.join(NOTES, String(placeId), 'practice', String(blockId));
  try {
    return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort().map((n) => path.join(dir, n));
  } catch { return []; }
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
  for (let i = 0; i < 80; i++) {
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
async function waitFor(expression, timeout = 10000, label = expression) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < timeout) {
    try {
      const v = await ev(expression);
      if (v) return v;
      last = v;
    } catch (e) { last = e.message; }
    await sleep(140);
  }
  throw new Error('等待超时：' + label + (last ? ' | ' + String(last).slice(0, 180) : ''));
}
async function shot(name) {
  const data = await send('Page.captureScreenshot', {format: 'png'});
  fs.mkdirSync(SHOTS, {recursive: true});
  const file = path.join(SHOTS, name + '.png');
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
  return file;
}
async function record(name, fn) {
  try {
    const value = await fn();
    checks.push({name, ok: true});
    return value;
  } catch (e) {
    checks.push({name, ok: false, error: e.message});
    throw e;
  }
}
async function pageSetText(selector, value) {
  return ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
}
async function click(selector) {
  const ok = await ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)return false;el.click();return true})()`);
  if (!ok) throw new Error('找不到可点击元素：' + selector);
  await sleep(120);
}
async function pageToken() {
  await ev(`(()=>{sessionStorage.setItem('sm-archive-token',${JSON.stringify(TOKEN)});return true})()`);
  await ev(`location.reload()`);
  await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 15000, '带令牌刷新');
  assert((await ev(`String(sessionStorage.getItem('sm-archive-token')||'')`)) === TOKEN, '页面令牌注入失败');
}

let shotA = '', shotB = '', shotC = '', shotD = '';
async function step(name, fn) {
  try { await record(name, fn); return true; } catch { return false; }
}
try {
  // 服务端写限流 60s/12 次且跨运行共享：先等一个完整窗口，避免上一轮尾巴把本轮打成 RATE_LIMITED。
  await sleep(62000);
  await ensurePerson(PERSON_A, NAME_A);
  await sleep(700);
  await ensurePerson(PERSON_B, NAME_B);
  await sleep(700);
  info.persons = [PERSON_A, PERSON_B];

  await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 2, mobile: true});
  await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 15000, '页面加载');
  await pageToken();

  /* ① 旧友补记 */
  await step('① 补记：候选 → 勾掉 1 条 → 确认写入；未确认 0 写；另一人物 sha 不变', async () => {
    await click('[data-nav="people"]');
    await waitFor(`(document.querySelector('#results')||{}).textContent.includes(${JSON.stringify(NAME_A)})`, 12000, 'People 列表含测试甲');
    await click(`[data-rperson="${PERSON_A}"]`);
    await waitFor(`!!document.querySelector('[data-n05="mem-open"]')`, 10000, '人员详情补记入口');
    shotA = await shot('n05-ui-people-detail');
    await click('[data-n05="mem-open"]');
    await waitFor(`!!document.querySelector('#n05MemRaw')`, 6000, '补记原文框');
    const stamp = Date.now().toString(36);
    const raw = [
      '测试甲最近迷上了 ' + stamp + ' 号独立乐队。',
      '他计划下个月去三亚参加 ' + stamp + ' 号音乐节。',
      '他刚学会做 ' + stamp + ' 号版本的海南鸡饭。',
    ].join('\n');
    await pageSetText('#n05MemRaw', raw);
    const shaBefore = shaFile(profileFile(PERSON_A));
    const bBefore = shaFile(profileFile(PERSON_B));
    await click('[data-n05="mem-draft"]');
    await waitFor(`!!document.querySelector('[data-n05="mem-confirm"]') || !!document.querySelector('.n05warn[data-degraded="1"]')`, 32000, '候选卡或降级');
    const warn = await ev(`(()=>{const w=document.querySelector('.n05warn[data-degraded="1"]');return w?w.textContent:''})()`);
    assert(!warn, 'AI 整理未返回候选：' + warn);
    const cands = await ev(`document.querySelectorAll('[data-n05="mem-pick"]').length`);
    assert(cands >= 3, '候选不足 3 条，实际 ' + cands);
    const shaDraft = shaFile(profileFile(PERSON_A));
    assert(shaDraft === shaBefore, '未确认时人物主档已被写入');
    const beforeSelected = await ev(`document.querySelectorAll('[data-n05="mem-pick"]:checked').length`);
    assert(beforeSelected >= 1, '没有默认可勾选的候选（全部被标重复/矛盾），无法验证勾掉一条');
    const firstFactId = await ev(`document.querySelector('[data-n05="mem-pick"]:checked').dataset.id`);
    const c0 = ((await getPerson(PERSON_A)).confirmed || []).length;
    await click('[data-n05="mem-pick"]:checked');
    await sleep(200);
    const selected = await ev(`document.querySelectorAll('[data-n05="mem-pick"]:checked').length`);
    assert(selected === beforeSelected - 1, `勾掉一条后选中数不对：${selected} / 原 ${beforeSelected}`);
    await click('[data-n05="mem-confirm"]');
    await waitFor(`(()=>{const t=(document.querySelector('#toast')||{}).textContent||'';return /已写入\\s*\\d+\\s*条/.test(t)})()`, 15000, '确认写入回执');
    const toast = await ev(`(document.querySelector('#toast')||{}).textContent||''`);
    const written = Number((toast.match(/已写入\s*(\d+)\s*条/) || [])[1] || 0);
    info.toastWritten = written;
    const shaAfter = shaFile(profileFile(PERSON_A));
    const bAfter = shaFile(profileFile(PERSON_B));
    assert(shaAfter !== shaBefore, '确认后人物主档没有变化');
    assert(bAfter === bBefore, '另一人物主档 sha 被改动');
    const person = await getPerson(PERSON_A);
    const confirmed = (person.confirmed || []).length;
    assert(confirmed - c0 === selected, `人物事实增加 ${confirmed - c0}，应为勾选数 ${selected}`);
    assert(firstFactId && !fs.readFileSync(profileFile(PERSON_A), 'utf8').includes(firstFactId), '被勾掉的第一条仍被写入');
    info.personAConfirmed = confirmed;
    info.personBsha = bAfter.slice(0, 16);
    await waitFor(`!!document.querySelector('#drawerbody .onlinebar')`, 10000, '返回人物详情');
  });

  /* ② 地点活档案 */
  let recordId = '';
  let blockId = '';
  let place115Before = '';
  await step('② 地点：10 段粘贴 → ≥3 段、逐字回溯、英 A/B；115 源 sha 不变；可重开', async () => {
    await click('[data-nav="hainan"]');
    await waitFor(`!!document.querySelector('[data-open="place"][data-id="1"]')`, 10000, '海南地点卡');
    place115Before = shaFile(PLACES115);
    await click('[data-open="place"][data-id="1"]');
    await waitFor(`!!document.querySelector('#n05PlaceHost') && !/正在读取/.test(document.querySelector('#n05PlaceHost').textContent)`, 12000, '地点私有档案加载');
    await click('[data-n05="rec-new"]');
    await waitFor(`!!document.querySelector('#n05RecRaw')`, 6000, '记录新想法面板');
    const paras = [
      '今天早上我从国贸走到龙兴路，街边的咖啡店刚开门。',
      '我在路口拍了一张照片，绿色的门头很上镜。',
      '店主推荐了一杯冰美式，味道比想象中清爽。',
      '街角有一家复古小店，橱窗里摆着旧相机。',
      '下午四点光线最好，很多人在墙边拍照。',
      '我沿着小街走到底，发现一家卖椰子水的小摊。',
      '傍晚时外摆桌椅坐满了人，气氛很放松。',
      '我在这里给朋友买了一张明信片。',
      '这条街不到五百米，慢慢走二十分钟就逛完了。',
      '下次想带朋友来试试另一家咖啡馆的拿铁。',
    ];
    await pageSetText('#n05RecRaw', paras.join('\n\n'));
    await click('[data-n05="rec-use-current"]');
    await click('[data-n05="rec-save"]');
    await waitFor(`!!document.querySelector('#drawerbody .n05blk')`, 15000, '保存后进入记录详情');
    const state = await ev(`(()=>{const n=window.__n05;const rec=window.__n05&&window.__n05.place.detail.records.find(x=>x.recordId===n.view.recordId);return {recordId:n.view.recordId,placeId:n.view.placeId,blocks:rec?rec.blocks.length:0,revision:rec?Number(rec.revision||1):1,raw:rec?rec.rawInput:''}})()`);
    assert(state.blocks >= 3, '分段数不足 3：' + state.blocks);
    recordId = state.recordId;
    blockId = await ev(`window.__n05.place.detail.records.find(x=>x.recordId===${JSON.stringify(recordId)}).blocks[0].blockId`);
    const spanCheck = await ev(`(()=>{const n=window.__n05;const rec=n.place.detail.records.find(x=>x.recordId===n.view.recordId);return rec.blocks.every(b=>rec.rawInput.slice(b.sourceSpan.start,b.sourceSpan.end)===b.sourceText)})()`);
    assert(spanCheck === true, '存在分段无法逐字回溯原文');
    assert(shaFile(PLACES115) === place115Before, 'places-115.json sha 被改动');
    await sleep(900);
    await click('[data-n05="bulk-en"]');
    await waitFor(`!!document.querySelector('#n05BulkEn')`, 4000, '批量英文面板');
    const lines = paras.map((_, i) => `${i + 1}|English A ${i + 1}|English B ${i + 1}`).join('\n');
    await pageSetText('#n05BulkEn', lines);
    await click('[data-n05="save-bulk-en"]');
    try {
      await waitFor(`(()=>{const t=document.querySelector('#drawerbody').textContent;return !t.includes('英 A：（待补充）')&&!t.includes('英 B：（待补充）')})()`, 12000, '英 A/B 显示');
    } catch (e) {
      const dbg = await ev(`JSON.stringify({err:window.__n05.view.err,busy:window.__n05.view.busy,toast:(document.querySelector('#toast')||{}).textContent,blocks:(window.__n05.place.detail.records.find(x=>x.recordId===window.__n05.view.recordId)||{}).blocks,modal:document.querySelector('#modalbg').className})`);
      throw new Error(e.message + ' | ' + dbg);
    }
    const enOk = await ev(`(()=>{const n=window.__n05;const rec=n.place.detail.records.find(x=>x.recordId===n.view.recordId);return rec.blocks.every(b=>Array.isArray(b.enVariants)&&b.enVariants.length===2&&b.enVariants[0]&&b.enVariants[1])})()`);
    assert(enOk === true, '仍有分段缺英 A/B');
    await click('[data-n05="rec-back"]');
    await waitFor(`!!document.querySelector('#n05PlaceHost') && !/正在读取/.test(document.querySelector('#n05PlaceHost').textContent)`, 10000, '返回地点档案');
    await click(`[data-n05="rec-open"][data-record="${recordId}"]`);
    await waitFor(`!!document.querySelector('#drawerbody .n05blk')`, 10000, '重开记录');
    const reopened = await ev(`document.querySelectorAll('#drawerbody .n05blk').length`);
    assert(reopened === state.blocks, '重开后分段数不一致：' + reopened);
    shotB = await shot('n05-ui-place-record');
    info.recordId = recordId;
    info.blockId = blockId;
    info.blocks = state.blocks;
    info.recordRevision = state.revision;
    info.places115Sha = shaFile(PLACES115).slice(0, 16);
  });

  /* ③ 分段听读 */
  if (!recordId) { skipped.push('③ 听读（② 未产出记录，无法进入听读）', '④ GPT（依赖③同段记录）'); }
  else await step('③ 听读：无原生桥不假成功；中文/英 A/英 B 各触发桥调用且语言正确；切段停止旧队列', async () => {
    // 浏览器预览没有原生 TTS：先确认记录面板已打开（② 的保存流程会回到地点列表），再看降级提示。
    if(!(await ev(`!!document.querySelector('#drawerbody .n05warn')`))){
      const opened=await ev(`(()=>{const b=document.querySelector('[data-n05="rec-open"]');if(!b)return false;b.click();return true})()`);
      if(opened) await waitFor(`!!document.querySelector('#drawerbody .n05warn')`, 8000, '记录面板降级提示');
    }
    const noBridgeWarn = await ev(`(()=>{const w=Array.from(document.querySelectorAll('#drawerbody .n05warn')).map(x=>x.textContent).join('|');return w})()`);
    const dbgWarn = await ev(`JSON.stringify({drawer:!!document.querySelector('#drawerbody'),bodyLen:(document.querySelector('#drawerbody')||{}).innerText?document.querySelector('#drawerbody').innerText.slice(0,80):'',opens:document.querySelectorAll('[data-n05="rec-open"]').length,cls:Array.from(document.querySelectorAll('#drawerbody [class]')).map(x=>x.className).slice(0,8)})`);
    assert(String(noBridgeWarn).includes('无原生语音'), '无桥环境没有降级提示：[' + noBridgeWarn + '] state=' + dbgWarn);
    assert((await ev(`typeof window.SocialMateTts`)) === 'undefined', '浏览器不应自带原生 TTS 桥');
    await click('[data-i="0"][data-n05="tts"][data-lang="zh"]');
    await sleep(200);
    const noBridgeToast = await ev(`(document.querySelector('#toast')||{}).textContent||''`);
    assert(/无原生语音/.test(noBridgeToast), '无桥点击没有真实降级提示（疑似假成功）：' + noBridgeToast);
    assert((await ev(`typeof window.SocialMateTts`)) === 'undefined', '无桥点击后凭空出现了桥对象');
    // 再用桥桩验证参数与切段停读（真机由 App 内真实桥跑同一路径）。
    await ev(`window.SocialMateTts={calls:[],stops:0,rates:[],setRate(r){this.rates.push(r);return JSON.stringify({ok:true})},speakText(t,l){this.calls.push({t:String(t).slice(0,40),l:l,loop:0});return JSON.stringify({ok:true})},speakTextWithLoop(t,l,n){this.calls.push({t:String(t).slice(0,40),l:l,loop:n});return JSON.stringify({ok:true})},speakTextWithIds(t,l,n,rid,bid,rev){this.calls.push({t:String(t).slice(0,40),l:l,loop:n,rid:rid,bid:bid,rev:rev});return JSON.stringify({ok:true})},stop(){this.stops++;return JSON.stringify({ok:true})}}`);
    await ev(`window.__n05.tts.loop=20`);
    await click('[data-i="0"][data-n05="tts"][data-lang="zh"]');
    await click('[data-i="0"][data-n05="tts"][data-lang="enA"]');
    await click('[data-i="0"][data-n05="tts"][data-lang="enB"]');
    const calls = await ev(`window.SocialMateTts.calls`);
    assert(calls.length >= 3, '桥调用次数不足：' + calls.length);
    assert(calls[0].l === 'zh', '中文调用语言不是 zh：' + calls[0].l);
    // 英 A / 英 B 必须分别带 enA / enB，真机据此选 en-US(Ruth) 与 en-GB(Brian) 声线。
    assert(calls[1].l === 'enA' && calls[2].l === 'enB', '英 A/B 分段类型不是 enA/enB：' + calls[1].l + '/' + calls[2].l);
    assert(calls[0].t && calls[1].t && calls[2].t, '桥调用文本为空');
    assert(calls[0].loop === 20, '循环档位没有传到原生桥（期望 20，实际 ' + calls[0].loop + '）');
    assert(calls[0].rid === recordId && calls[0].bid === blockId && Number.isInteger(calls[0].rev) && calls[0].rev > 0,
      '朗读请求没有带真实 recordId/blockId/revision：' + JSON.stringify(calls[0]));
    await ev(`window.__n05.tts.loop=1`);
    await click('[data-i="0"][data-n05="seg"][data-dir="next"]');
    const stops = await ev(`window.SocialMateTts.stops`);
    assert(stops >= 1, '切段没有停止旧朗读队列');
    const cur = await ev(`window.__n05.tts.cur`);
    assert(cur === 1, '切段后当前段不是第 2 段：' + cur);
    info.ttsCalls = calls.map((c) => c.l);
    info.ttsDegraded = noBridgeToast.slice(0, 60);
    shotC = await shot('n05-ui-listening');
  });

  /* ④ GPT 练习 */
  if (recordId) await step('④ GPT：Prompt 含段 ID/版本、不含他人姓名/token；复制回读校验；两份报告并存，旧文件字节不变', async () => {
    const clipReady = await ev(`(()=>{try{window.__clip='';Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>{window.__clip=t},readText:async()=>window.__clip}});return true}catch(e){return false}})()`);
    await click('[data-i="0"][data-n05="prompt-copy"]');
    await sleep(300);
    const prompt = await ev(`window.__n05LastPrompt||''`);
    assert(prompt.includes('recordId=' + recordId), 'Prompt 缺 recordId');
    assert(prompt.includes('blockId=' + blockId), 'Prompt 缺 blockId');
    assert(prompt.includes('contentRevision='), 'Prompt 缺 contentRevision');
    assert(/placeId=\d+/.test(prompt) && !prompt.includes('placeId=undefined'), 'Prompt 的 placeId 无效：' + prompt.split('\n')[1]);
    for (const n of OWN_NAMES) assert(!prompt.includes(n), 'Prompt 泄漏他人姓名：' + n);
    assert(!prompt.includes(TOKEN.slice(0, 8)), 'Prompt 泄漏 token');
    if (clipReady) {
      const readback = await ev(`(()=>{const m=window.__n05.promptMeta[${JSON.stringify(recordId + '|' + blockId)}];return m?m.verified:null})()`);
      assert(readback === true, '复制后没有从剪贴板回读校验 recordId/blockId/revision');
    }
    info.prompt = prompt.split('\n').slice(0, 6).join(' | ');
    info.clipboardReadback = clipReady ? 'verified' : 'unsupported';
    await sleep(900);
    await click('[data-i="0"][data-n05="practice-open"]');
    await waitFor(`!!document.querySelector('#n05PrReport')`, 4000, '回贴复盘表单');
    await ev(`(()=>{document.querySelector('#n05PrResult').value='review';document.querySelector('#n05PrWeak').value='have been to, go for a run';document.querySelector('#n05PrNext').value='把 have been to 说顺';document.querySelector('#n05PrReport').value='第一次练习：需要复习 have been to 和 go for a run。';document.querySelector('#n05PrConfirm').checked=true;return true})()`);
    await click('[data-n05="practice-save"]');
    await waitFor(`document.querySelectorAll('#drawerbody .n05report').length>=1`, 12000, '第一份复盘');
    const files1 = practiceFiles('1', blockId);
    assert(files1.length >= 1, '后端没有保存第一份复盘');
    const firstSha = shaFile(files1[0]);
    await sleep(600);
    await click('[data-i="0"][data-n05="practice-open"]');
    await waitFor(`!!document.querySelector('#n05PrReport')`, 4000, '第二次回贴表单');
    await ev(`(()=>{document.querySelector('#n05PrResult').value='pass';document.querySelector('#n05PrWeak').value='go for a run';document.querySelector('#n05PrNext').value='下次练连读';document.querySelector('#n05PrReport').value='第二次练习：通过，连读还需要注意。';document.querySelector('#n05PrConfirm').checked=true;return true})()`);
    await click('[data-n05="practice-save"]');
    await waitFor(`document.querySelectorAll('#drawerbody .n05report').length>=2`, 12000, '两份复盘并列');
    const files2 = practiceFiles('1', blockId);
    assert(files2.length === files1.length + 1, `复盘文件数不对：${files1.length} → ${files2.length}`);
    assert(shaFile(files1[0]) === firstSha, '旧复盘文件字节被改动');
    const texts = await ev(`Array.from(document.querySelectorAll('#drawerbody .n05report')).map(x=>x.textContent)`);
    assert(texts.some((x) => x.includes('第一次练习')), '两份报告里缺少第一份正文：' + JSON.stringify(texts));
    assert(texts.some((x) => x.includes('第二次练习')), '两份报告里缺少第二份正文：' + JSON.stringify(texts));
    assert(texts.some((x) => x.includes('需复习')), '第一份报告未显示“需复习”结果：' + JSON.stringify(texts));
    assert(texts.some((x) => x.includes('通过')), '第二份报告未显示“通过”结果：' + JSON.stringify(texts));
    info.practiceReports = files2.length;
    shotD = await shot('n05-ui-practice');
  });

  /* ⑤ 错匹配 */
  await step('⑤ 错匹配：从错误地点 2 进入，手选 placeId=1 → 记录只落到龙兴路', async () => {
    await click('[data-nav="hainan"]');
    await waitFor(`!!document.querySelector('[data-open="place"][data-id="2"]')`, 10000, '海南地点卡');
    await click('[data-open="place"][data-id="2"]');
    await waitFor(`!!document.querySelector('#n05PlaceHost') && !/正在读取/.test(document.querySelector('#n05PlaceHost').textContent)`, 12000, '地点 2 私有档案');
    await click('[data-n05="rec-new"]');
    await waitFor(`!!document.querySelector('#n05RecRaw')`, 4000, '记录面板');
    await pageSetText('#n05RecRaw', '这是一段错匹配测试：我其实想把记录放到龙兴路。');
    await pageSetText('#n05ManualPlace', '1');
    await click('[data-n05="rec-manual-place"]');
    await waitFor(`(document.querySelector('[data-n05-msg]')||{}).textContent.includes('已手选 placeId 1')`, 4000, '手选 placeId 1');
    await sleep(900);
    await click('[data-n05="rec-save"]');
    await waitFor(`window.__n05.view.placeId==='1'`, 15000, '记录落到 placeId 1');
    const rid = await ev(`window.__n05.view.recordId`);
    const p1 = await getPlace(1);
    const p2 = await getPlace(2);
    assert((p1.records || []).some((r) => r.recordId === rid), '记录没有落到 placeId 1（龙兴路）');
    assert(!(p2.records || []).some((r) => r.recordId === rid), '记录仍落在错误地点 placeId 2');
    info.wrongMatch = {from: 2, to: 1, recordId: rid, place1Name: p1.place && p1.place.name};
  });

  /* ⑥ 失败路径 */
  // 服务端写限流为 60s/12 次，前面 ①–⑤ 已占满窗口；先等窗口清空，确保拿到的是 AI 降级而非 RATE_LIMITED。
  await sleep(62000);
  await step('⑥ 失败：aiConsent=false → AI_UNAVAILABLE 降级 + 手工切句，输入不丢', async () => {
    await ev(`openRemotePerson(${JSON.stringify(PERSON_A)})`);
    await waitFor(`!!document.querySelector('[data-n05="mem-open"]')`, 10000, '测试甲详情');
    await click('[data-n05="mem-open"]');
    await waitFor(`!!document.querySelector('#n05MemRaw')`, 4000, '补记面板');
    const raw = '测试甲说他下周末想去文昌看海。';
    await pageSetText('#n05MemRaw', raw);
    await ev(`(()=>{const c=document.querySelector('#n05AiConsent');if(c)c.checked=false;return true})()`);
    await click('[data-n05="mem-draft"]');
    await waitFor(`!!document.querySelector('.n05warn[data-degraded="1"]')`, 12000, 'AI 降级提示');
    const box = await ev(`(()=>{const w=document.querySelector('.n05warn[data-degraded="1"]');return {code:w?w.dataset.code:'',warn:w?w.textContent:'',raw:(document.querySelector('#n05MemRaw')||{}).value||'',manual:document.querySelector('#drawerbody').textContent.includes('手工切句'),items:document.querySelectorAll('#drawerbody .n05cn').length}})()`);
    assert(box.warn, '没有降级提示');
    assert(box.code, '降级提示缺错误码');
    assert(box.code !== 'RATE_LIMITED', '降级原因是限流而非 AI 不可用，不能作为降级验收证据');
    assert(box.manual, '降级后没有手工切句入口');
    assert(box.items >= 1, '手工切句没有产出句子');
    assert(box.raw === raw, '降级后原文丢失');
    info.degraded = {code: box.code, items: box.items, warn: box.warn.split('\n').slice(0, 2).join(' / ')};
  });

  /* ⑦ 合并 / 拆分 / 编辑 */
  if (recordId) await step('⑦ 合并/拆分/编辑：仍逐字回原文，句数守恒', async () => {
    const recState = () => ev(`(()=>{const n=window.__n05;const r=n.place.detail&&n.place.detail.records.find(x=>x.recordId===n.view.recordId);if(!r)return null;return {blocks:r.blocks.length,sent:r.blocks.reduce((a,b)=>a+(b.cnSentences||[]).length,0),rev:Number(r.revision||1),raw:r.rawInput,ids:r.blocks.map(b=>b.blockId),en0:((r.blocks[0]||{}).enVariants||[])[0]||'',back:r.blocks.every(b=>r.rawInput.slice(b.sourceSpan.start,b.sourceSpan.end)===b.sourceText&&(b.cnSentences||[]).join('')===b.sourceText),spans:r.blocks.map(b=>[b.sourceSpan.start,b.sourceSpan.end])}})()`);
    await click('[data-nav="hainan"]');
    await waitFor(`!!document.querySelector('[data-open="place"][data-id="1"]')`, 10000, '海南地点卡');
    await click('[data-open="place"][data-id="1"]');
    await waitFor(`!!document.querySelector('#n05PlaceHost') && !/正在读取/.test(document.querySelector('#n05PlaceHost').textContent)`, 12000, '地点档案');
    await click(`[data-n05="rec-open"][data-record="${recordId}"]`);
    await waitFor(`!!document.querySelector('#drawerbody .n05blk')`, 10000, '打开记录');
    const before = await recState();
    assert(before && before.back, '初始分段不能逐字回原文');
    assert(before.blocks >= 3, '初始段数不足 3：' + before.blocks);

    await click('[data-n05="rec-merge"][data-i="0"]');
    await waitFor(`(()=>{const n=window.__n05;const r=n.place.detail.records.find(x=>x.recordId===n.view.recordId);return r&&!n.view.busy&&r.blocks.length===${before.blocks - 1}})()`, 15000, '合并后段数 -1');
    const merged = await recState();
    assert(merged.back, '合并后不能逐字回原文');
    assert(merged.sent === before.sent, `合并后句数不守恒：${before.sent} → ${merged.sent}`);
    assert(merged.rev > before.rev, '合并后版本号没增加');
    assert(merged.raw === before.raw, '合并后原文被改动');
    assert(merged.spans[0][1] === before.spans[1][1], '合并后的 span 没有连续覆盖两段');

    // 服务端写限流要求相邻写入间隔 ≥400ms，这里固定等 900ms 再拆。
    await sleep(900);
    await click('[data-n05="rec-split"][data-i="0"]');
    await waitFor(`(()=>{const n=window.__n05;const r=n.place.detail.records.find(x=>x.recordId===n.view.recordId);return r&&!n.view.busy&&r.blocks.length===${before.blocks}})()`, 15000, '拆分后段数恢复');
    const split = await recState();
    assert(split.back, '拆分后不能逐字回原文');
    assert(split.sent === before.sent, `拆分后句数不守恒：${before.sent} → ${split.sent}`);
    assert(split.spans[0][1] === split.spans[1][0], '拆分后两段 span 不连续');
    assert(split.spans[0][0] === merged.spans[0][0] && split.spans[1][1] === merged.spans[0][1], '拆分后没有覆盖原合并段');

    await click('[data-n05="rec-edit-en"][data-i="0"]');
    await waitFor(`!!document.querySelector('#n05EnA')`, 4000, '编辑英文弹层');
    const mark = 'Edited A ' + Date.now().toString(36);
    await pageSetText('#n05EnA', mark);
    await pageSetText('#n05EnB', 'Edited B ' + Date.now().toString(36));
    await sleep(900);
    await click('[data-n05="save-en"]');
    await waitFor(`(()=>{const t=document.querySelector('#drawerbody').textContent;return t.includes(${JSON.stringify(mark)})})()`, 15000, '编辑后的英文 A');
    const edited = await recState();
    assert(edited.back, '编辑后不能逐字回原文');
    assert(edited.blocks === split.blocks, '编辑改了段数');
    assert(edited.sent === before.sent, '编辑后句数不守恒');
    assert(edited.raw === before.raw, '编辑后原文被改动');
    assert(edited.rev > split.rev, '编辑后版本号没增加');
    assert(JSON.stringify(edited.ids) === JSON.stringify(split.ids), '编辑后 blockId 变了');
    info.mergeSplit = {before: before.blocks, merged: merged.blocks, split: split.blocks, sentences: before.sent, revision: edited.rev};
  });

  /* ⑧ 主题（附加，不计入 ①–⑦） */
  await step('⑧ 主题：浅色默认、深色跨刷新保持、跟随系统选项存在', async () => {
    await ev(`(()=>{localStorage.removeItem('alw-preview-v1');location.reload();return true})()`);
    await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 12000, '刷新');
    assert((await ev(`document.documentElement.dataset.theme`)) === 'light', '默认不是浅色');
    await click('#displaySettings');
    await waitFor(`!!document.querySelector('[data-theme-set="dark"]')`, 4000, '主题选项');
    const opts = await ev(`Array.from(document.querySelectorAll('[data-theme-set]')).map(b=>b.dataset.themeSet).join(',')`);
    assert(opts.includes('light') && opts.includes('dark') && opts.includes('system'), '主题选项不完整：' + opts);
    await click('[data-theme-set="dark"]');
    await sleep(250);
    assert((await ev(`document.documentElement.dataset.theme`)) === 'dark', '深色未生效');
    await ev(`location.reload()`);
    await waitFor(`document.readyState==='complete' && !!document.querySelector('#content')`, 12000, '深色刷新');
    assert((await ev(`document.documentElement.dataset.theme`)) === 'dark', '刷新后深色未保持');
    await click('#displaySettings');
    await waitFor(`!!document.querySelector('[data-theme-set="light"]')`, 4000, '恢复浅色');
    await click('[data-theme-set="light"]');
    await shot('n05-ui-theme');
  });
} catch (e) {
  if (!checks.length || checks[checks.length - 1].ok) checks.push({name: '执行中断', ok: false, error: e.message});
} finally {
  try { ws && ws.close(); } catch {}
  try { chrome.kill(); } catch {}
  try { await fsp.rm(PROFILE, {recursive: true, force: true}); } catch {}
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : ' — ' + c.error}`);
console.log(JSON.stringify({
  summary: failed.length ? 'FAIL' : 'PASS',
  total: checks.length,
  failed: failed.length,
  skipped,
  info,
  shots: {people: shotA, place: shotB, listening: shotC, practice: shotD},
}, null, 2));
process.exit(failed.length ? 1 : 0);