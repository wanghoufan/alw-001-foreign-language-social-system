import assert from 'node:assert/strict';
import test from 'node:test';
import {WebSocketServer} from 'ws';
import {P066RealtimeSession, resolveP066Config} from '../src/p066-asr-client.js';

test('P066 客户端：头鉴权、interim/final、结束与预算事件', async (t) => {
  const wss = new WebSocketServer({port: 0});
  await new Promise((r) => wss.once('listening', r));
  const port = wss.address().port;

  wss.on('connection', (ws, req) => {
    assert.equal(req.headers['x-asr-token'], 'test-token');
    ws.send(JSON.stringify({type: 'session', status: 'ready', sessionId: 's1', track: 'mix', engine: '16k_zh_en_speaker_2.0'}));
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        ws.send(JSON.stringify({type: 'interim', text: '你好', startMs: 0, endMs: 500, speaker: 'spk_0', final: false}));
        ws.send(JSON.stringify({type: 'final', text: '你好。', startMs: 0, endMs: 800, speaker: 'spk_0', final: true}));
        ws.send(JSON.stringify({type: 'budget', remainingCny: 2.99, spentCny: 0.001, costCny: 0.001, seconds: 1}));
        return;
      }
      if (JSON.parse(String(data)).type === 'end') {
        ws.send(JSON.stringify({type: 'session', status: 'end', sessionId: 's1', seconds: 1, costCny: 0.0003}));
        setTimeout(() => { try { ws.close(); } catch {} }, 10);
      }
    });
  });

  t.after(() => new Promise((resolve) => wss.close(resolve)));
  const session = new P066RealtimeSession({
    url: `ws://127.0.0.1:${port}/api/asr/stream`,
    token: 'test-token',
    track: 'mix',
    engineModelType: '16k_zh_en_speaker_2.0',
  });
  const events = [];
  const budgets = [];
  session.on('event', (e) => events.push(e));
  session.on('budget', (b) => budgets.push(b));
  await session.connect();
  assert.equal(session.ready, true);
  assert.ok(session.buildUrl().includes('engine=16k_zh_en_speaker_2.0'));
  assert.ok(!session.buildUrl().includes('test-token'), '令牌不得进 URL');
  session.write(Buffer.alloc(3200));
  await new Promise((r) => setTimeout(r, 150));
  await session.end();
  session.close();
  assert.deepEqual(events.map((e) => e.type), ['interim', 'final']);
  assert.equal(events[1].speaker, 'spk_0');
  assert.equal(events[1].provider, 'p066');
  assert.equal(budgets[0].remainingCny, 2.99);
});

test('P066 配置：缺令牌时 fail closed', () => {
  assert.throws(() => resolveP066Config({}), /P066_ASR_TOKEN/);
  assert.throws(() => resolveP066Config({P066_ASR_TOKEN: 'x', P066_ASR_URL: 'http://x'}), /ws:\/\//);
});
