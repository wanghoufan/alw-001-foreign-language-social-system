#!/usr/bin/env node
/**
 * 受控真实 ASR 复测：必须显式批准，且按音频时长硬截断。
 * 用法：ASR_TEST_APPROVED=1 node scripts/asr-test-run.mjs <wav> <track> [--max-seconds=180]
 * 未设置 ASR_TEST_APPROVED=1 时拒绝运行；超过上限只发送上限时长并明确告知。
 */
import fs from 'fs';
import path from 'path';
import WebSocket from 'ws';

const [, , file, trackArg = 'mix', ...rest] = process.argv;
if (!file) { console.error('用法: ASR_TEST_APPROVED=1 node scripts/asr-test-run.mjs <wav> <mix|A|B> [--max-seconds=180]'); process.exit(2); }
if (process.env.ASR_TEST_APPROVED !== '1') {
  console.error('拒绝运行：需用户批准并设置 ASR_TEST_APPROVED=1。');
  process.exit(3);
}
const capArg = rest.find((x) => x.startsWith('--max-seconds='));
const cap = Math.min(Number(capArg?.split('=')[1] || 180), 600);

const buf = fs.readFileSync(file);
let off = 12, dataOff = -1, dataLen = 0, rate = 48000, channels = 2;
while (off + 8 <= buf.length) {
  const id = buf.toString('ascii', off, off + 4);
  const size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') { channels = buf.readUInt16LE(off + 10); rate = buf.readUInt32LE(off + 12); }
  if (id === 'data') { dataOff = off + 8; dataLen = Math.min(size, buf.length - dataOff); break; }
  off += 8 + size + (size % 2);
}
const bytesPerSec = rate * channels * 2;
const fullSec = dataLen / bytesPerSec;
const sendSec = Math.min(fullSec, cap);
const pcm = buf.subarray(dataOff, dataOff + Math.floor(sendSec * bytesPerSec));

console.error(`[asr-test] file=${path.basename(file)} audio=${fullSec.toFixed(1)}s 发送=${sendSec.toFixed(1)}s 上限=${cap}s track=${trackArg}`);
const ws = new WebSocket(`ws://127.0.0.1:8790/asr?track=${trackArg}&rate=${rate}&channels=${channels}`);
const events = [];
ws.on('open', () => {
  const chunk = bytesPerSec * 0.1;
  let i = 0;
  const timer = setInterval(() => {
    if (i >= pcm.length) { clearInterval(timer); ws.send(JSON.stringify({ type: 'end' })); setTimeout(() => ws.close(), 8000); return; }
    ws.send(pcm.subarray(i, i + chunk)); i += chunk;
  }, 100);
});
ws.on('message', (d) => { const e = JSON.parse(d.toString()); events.push(e); console.log(JSON.stringify(e)); });
ws.on('close', () => {
  const finals = events.filter((e) => e.type === 'final' && e.text).map((e) => e.text);
  const ledger = path.resolve(process.cwd(), '../.local/asr-test-usage.jsonl');
  fs.mkdirSync(path.dirname(ledger), { recursive: true });
  fs.appendFileSync(ledger, JSON.stringify({ ts: new Date().toISOString(), file: path.basename(file), track: trackArg, seconds: Number(sendSec.toFixed(1)), ended: true }) + '\n');
  console.error(`DONE ${sendSec.toFixed(1)}s | ${finals.join(' | ')}`);
  process.exit(0);
});
ws.on('error', (e) => { console.error('ERR', e.message); process.exit(1); });
setTimeout(() => { console.error('TIMEOUT'); process.exit(2); }, Math.max(30000, sendSec * 4000));
