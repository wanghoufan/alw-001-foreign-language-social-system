#!/usr/bin/env node
/**
 * ASR → AI sidecar: 消费腾讯云 ASR final 事件，经 asr-final-adapter 调用真实 AI。
 * 不改动 android-poc/asr-bridge 任何现有文件。
 * 用法：node asr-ai-sidecar.mjs <wav> <track> [--max-seconds=15]
 * 前置：ASR bridge 运行在 8790；本目录 .env 有 AI Key；--max-seconds 硬上限。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from '../../socialmate-v1.2/vendor/ws/index.js';
import { createAsrFinalAdapter } from './asr-final-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const wav = process.argv[2];
const track = process.argv[3] || 'mix';
const capArg = process.argv.find(x => x.startsWith('--max-seconds='));
const cap = Math.min(Number(capArg?.split('=')[1] || 15), 120);
if (!wav) { console.error('用法: node asr-ai-sidecar.mjs <wav> <mix|A|B> [--max-seconds=15]'); process.exit(2); }

// 正式资料库
const dataText = fs.readFileSync(path.resolve(here, '../data.js'), 'utf8');
const data = JSON.parse(dataText.match(/window\.SOCIALMATE_DATA\s*=\s*(\{[\s\S]*\});\s*$/)[1]);
const adapter = createAsrFinalAdapter({ data, env: process.env });

const buf = fs.readFileSync(wav);
let off = 12, dataOff = -1, len = 0, rate = 48000, ch = 2;
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4), size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') { ch = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); }
  if (id === 'data') { dataOff = off + 8; len = Math.min(size, buf.length - dataOff); break; }
  off += 8 + size + (size % 2);
}
const bytesPerSec = rate * ch * 2;
const seconds = Math.min(len / bytesPerSec, cap);
const pcm = buf.subarray(dataOff, dataOff + Math.floor(seconds * bytesPerSec));
const sid = `asr-ai-${Date.now()}`;
const ws = new WebSocket(`ws://127.0.0.1:8790/asr?track=${track}&rate=${rate}&channels=${ch}`);
const finals = [];
let task = null;
ws.on('open', () => {
  console.error(`[sidecar] ${path.basename(wav)} ${seconds.toFixed(1)}s track=${track} session=${sid}`);
  let i = 0; const chunk = bytesPerSec * 0.1;
  const timer = setInterval(() => {
    if (i >= pcm.length) { clearInterval(timer); ws.send(JSON.stringify({ type: 'end' })); setTimeout(() => ws.close(), 12000); return; }
    ws.send(pcm.subarray(i, i + chunk)); i += chunk;
  }, 100);
});
ws.on('message', async (d) => {
  const e = JSON.parse(d.toString());
  if (e.type !== 'final' || !e.text) return;
  finals.push({ track: e.track, speaker: e.speaker, text: e.text, startMs: e.startMs, endMs: e.endMs, mock: e.mock });
  console.log('[asr-final]', JSON.stringify({ text: e.text, speaker: e.speaker, mock: e.mock }));
  task = (async () => {
    try {
      const out = await adapter.accept(e, { sessionId: sid, consent: true, provider: 'deepseek', model: 'deepseek-flash', includePersonal: false });
      console.log('[ai]', JSON.stringify(out));
      fs.writeFileSync(path.resolve(here, 'asr-ai-result.json'), JSON.stringify({ finals, ai: out }, null, 2));
    } catch (err) {
      console.error('[ai-error]', err.code || err.name, err.message);
    }
  })();
});
ws.on('close', async () => {
  if (task) await task;
  console.error('[sidecar] done finals=' + finals.length + ' ai=' + (task ? 'yes' : 'no'));
  process.exit(finals.length && task ? 0 : 1);
});
ws.on('error', (e) => { console.error('[ws-error]', e.message); process.exit(1); });
setTimeout(() => { console.error('[sidecar] timeout'); process.exit(2); }, 120000);
