#!/usr/bin/env node
/**
 * N05 S4：通过 WebView CDP 验证原生 TTS 桥对网页真实可用。
 *
 * 前置：adb reverse tcp:8791 tcp:8791；App 已打开并加载 http://127.0.0.1:8791/v12；
 *       adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>
 *
 * 用法：node android-poc/tools/verify-n05-tts.mjs [--ws ws://127.0.0.1:9222/devtools/page/...]
 * 输出：每个断言一行 JSON，最后一行 SUMMARY；任一失败时退出码 1。
 */

const DEVTOOLS = process.env.TTS_CDP || 'http://127.0.0.1:9222';

function parseArgs(argv) {
  const out = { ws: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ws' && argv[i + 1]) out.ws = argv[++i];
  }
  return out;
}

async function resolveTarget(explicit) {
  if (explicit) return explicit;
  const list = await fetch(`${DEVTOOLS}/json/list`).then((r) => r.json());
  const page = list.find((p) => p.type === 'page' && /\/v12/.test(p.url || ''));
  if (!page) throw new Error('没有找到 /v12 WebView page，请先启动 App 并加载私有界面');
  return page.webSocketDebuggerUrl;
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.waiting = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve);
      this.ws.addEventListener('error', (e) => reject(new Error(`CDP 连接失败：${e.message || 'error'}`)));
    });
    this.ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      const pending = this.waiting.get(message.id);
      if (!pending) return;
      this.waiting.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result);
    });
  }

  async evaluate(expression) {
    await this.ready;
    const id = ++this.seq;
    const payload = JSON.stringify({
      id,
      method: 'Runtime.evaluate',
      params: { expression, returnByValue: true, awaitPromise: true },
    });
    const result = await new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      this.ws.send(payload);
      setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`CDP evaluate 超时：${expression.slice(0, 60)}`));
      }, 12000);
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'JS 执行异常');
    }
    return result.result && result.result.value;
  }

  close() { try { this.ws.close(); } catch { } }
}

function line(name, ok, detail) {
  console.log(JSON.stringify({ check: name, ok, detail }));
  return ok;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = await resolveTarget(args.ws);
  const cdp = new Cdp(target);
  let failures = 0;

  const bridge = await cdp.evaluate('typeof window.SocialMateTts');
  if (!line('bridge_exposed', bridge === 'object', bridge)) failures++;

  const methods = await cdp.evaluate(
    "['speakText','speakTextWithLoop','stop','setRate','setLoop','status','voices','diagnose','setVoice','setListened','isListened','prefs','setPlaylist','nextSegment','previousSegment','openSelfTest'].map(function(k){return typeof window.SocialMateTts[k]}).filter(function(t){return t!=='function'})"
  );
  if (!line('bridge_methods', Array.isArray(methods) && methods.length === 0,
    Array.isArray(methods) ? methods : String(methods))) failures++;

  const status = JSON.parse(await cdp.evaluate('window.SocialMateTts.status()'));
  if (!line('tts_ready', status.ok === true && status.state === 'ready', status)) failures++;
  if (!line('voices_zh_en_distinct',
    !!status.zhVoice && !!status.enVoice && status.zhVoice !== status.enVoice,
    { zhVoice: status.zhVoice, enVoice: status.enVoice, engine: status.engine })) failures++;

  const ja = JSON.parse(await cdp.evaluate("window.SocialMateTts.speakText('これはテストです。', 'ja-JP')"));
  if (!line('missing_lang_code', ja.ok === false && ja.code === 'TTS_LANG_UNAVAILABLE',
    { code: ja.code, missingLanguage: ja.missingLanguage, message: ja.message })) failures++;

  const badRate = JSON.parse(await cdp.evaluate('window.SocialMateTts.setRate(0.8)'));
  if (!line('bad_rate_rejected', badRate.ok === false && badRate.code === 'TTS_BAD_RATE',
    badRate)) failures++;

  const rate = JSON.parse(await cdp.evaluate('window.SocialMateTts.setRate(0.9)'));
  if (!line('rate_090', rate.ok === true && Math.abs(rate.rate - 0.9) < 0.001, rate)) failures++;

  const listened = JSON.parse(await cdp.evaluate("window.SocialMateTts.setListened('cdp:s4', true)"));
  const readBack = JSON.parse(await cdp.evaluate("window.SocialMateTts.isListened('cdp:s4')"));
  if (!line('listened_persist', listened.ok === true && readBack.listened === true,
    { listened, readBack })) failures++;

  const zh = JSON.parse(await cdp.evaluate(
    "window.SocialMateTts.speakText('我们现在开始中文听读测试。', 'zh-CN')"));
  if (!line('zh_speak_accepted', zh.ok === true && /zh/.test(zh.lang || '') && /zh/i.test(zh.voice || ''),
    zh)) failures++;

  const en = JSON.parse(await cdp.evaluate(
    "window.SocialMateTts.speakText('This is the English reading test.', 'en-US')"));
  if (!line('en_speak_accepted', en.ok === true && /en/.test(en.lang || '') && /en/i.test(en.voice || ''),
    en)) failures++;

  const stopped = JSON.parse(await cdp.evaluate('window.SocialMateTts.stop()'));
  if (!line('stop_ok', stopped.ok === true, stopped)) failures++;

  await cdp.evaluate(
    "window.__smTtsEvents=[];window.SocialMateTts.onState=function(e){window.__smTtsEvents.push(e)}"
  );
  const callbackSpeak = JSON.parse(await cdp.evaluate(
    "window.SocialMateTts.speakTextWithLoop('回调测试。', 'zh-CN', 1)"
  ));
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const events = await cdp.evaluate('window.__smTtsEvents');
  const states = Array.isArray(events) ? events.map((raw) => {
    try { return JSON.parse(raw).state; } catch { return 'unparsed'; }
  }) : [];
  const hasCallback = callbackSpeak.ok === true
    && states.includes('started') && states.includes('finished');
  if (!line('queue_state_callback', hasCallback, { speak: callbackSpeak, states })) failures++;
  await cdp.evaluate('try{delete window.SocialMateTts.onState}catch(e){}window.__smTtsEvents=null');

  console.log(JSON.stringify({
    check: 'SUMMARY',
    ok: failures === 0,
    failures,
    target,
    engine: status.engine,
    engineLabel: status.engineLabel,
    zhVoice: status.zhVoice,
    enVoice: status.enVoice,
  }));
  cdp.close();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.log(JSON.stringify({ check: 'FATAL', ok: false, message: error.message }));
  process.exit(2);
});