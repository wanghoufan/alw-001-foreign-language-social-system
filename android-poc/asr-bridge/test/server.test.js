import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createAsrBridgeServer } from '../src/server.js';
import { AsrConfigError } from '../src/tencent-asr-client.js';
import {
  closeWebSocket,
  silentLogger,
  stereoPcm16,
  waitForEvent,
} from '../test-support/helpers.js';

function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const events = [];
    // 必须在 open 之前挂 message 监听，否则可能漏掉服务端握手后立刻发送的 session 事件。
    ws.on('message', (data) => {
      try {
        events.push(JSON.parse(data.toString('utf8')));
      } catch {
        // 测试只接受 JSON 文本事件。
      }
    });
    ws.once('open', () => resolve({ ws, events }));
    ws.once('error', reject);
  });
}

function sendPcmInChunks(ws, pcm, chunkBytes = 19_200) {
  for (let offset = 0; offset < pcm.length; offset += chunkBytes) {
    ws.send(pcm.subarray(offset, Math.min(pcm.length, offset + chunkBytes)));
  }
}

test('mock 端到端：A 轨立体声 -> 重采样 -> 能量分段 -> mock 事件', { timeout: 15_000 }, async () => {
  const server = await createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    forceMock: true,
    logger: silentLogger,
  });

  let ws;
  try {
    const health = await fetch(`http://127.0.0.1:${server.port}/health`).then((res) => res.json());
    assert.equal(health.ok, true);
    assert.equal(health.mock, true);
    assert.equal(health.mode, 'mock');

    const opened = await openSocket(`${server.url}?track=A&rate=48000&channels=2`);
    ws = opened.ws;
    const { events } = opened;

    const pcm = Buffer.concat([
      Buffer.alloc(Math.round(48_000 * 0.2) * 4), // 200ms 静音
      stereoPcm16({
        sampleRate: 48_000,
        durationMs: 800,
        leftFreq: 440,
        rightFreq: null,
        leftAmplitude: 0.3,
      }),
      Buffer.alloc(Math.round(48_000 * 0.5) * 4), // 500ms 静音
    ]);

    sendPcmInChunks(ws, pcm);
    ws.send(JSON.stringify({ type: 'end' }));

    const final = await waitForEvent(events, (event) => event.type === 'final', 5000);
    const interim = await waitForEvent(events, (event) => event.type === 'interim', 2000);
    const ready = await waitForEvent(
      events,
      (event) => event.type === 'session' && event.status === 'ready',
      2000,
    );
    const ended = await waitForEvent(
      events,
      (event) => event.type === 'session' && event.status === 'ended',
      3000,
    );

    // 所有事件必须明确标记 mock，不能伪装成真实 ASR。
    assert.ok(events.length > 0);
    for (const event of events) {
      assert.equal(event.mock, true, `事件缺少 mock:true：${JSON.stringify(event)}`);
      assert.equal(event.track, 'A');
      assert.equal(typeof event.startMs, 'number');
      assert.equal(typeof event.endMs, 'number');
      assert.equal(event.confidence, null);
    }

    assert.equal(ready.engine, 'mock');
    assert.equal(ready.sessionId.length > 0, true);
    assert.equal(ready.inputRate, 48_000);
    assert.equal(ready.channels, 2);
    assert.equal(ready.outputRate, 16_000);

    assert.match(interim.text, /^\[mock\] speech detected \d+ ms$/);
    assert.equal(interim.speaker, 'A');
    assert.equal(interim.final, false);

    assert.match(final.text, /^\[mock\] speech detected \d+ ms$/);
    assert.equal(final.speaker, 'A');
    assert.equal(final.final, true);
    assert.ok(final.startMs >= 150, `startMs 应晚于前 200ms 静音，实际 ${final.startMs}`);
    assert.ok(final.endMs > final.startMs, `endMs 应大于 startMs：${final.startMs}..${final.endMs}`);
    assert.equal(final.engine, 'mock');

    assert.equal(ended.final, true);
    assert.equal(ended.status, 'ended');
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});

test('mock 端到端：mix 路由把 L/R 平均后仍能检测到语音，speaker=spk_0', { timeout: 15_000 }, async () => {
  const server = await createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    forceMock: true,
    logger: silentLogger,
  });

  let ws;
  try {
    const opened = await openSocket(`${server.url}?track=mix&rate=48000&channels=2`);
    ws = opened.ws;
    const { events } = opened;

    const pcm = Buffer.concat([
      Buffer.alloc(Math.round(48_000 * 0.2) * 4),
      stereoPcm16({
        sampleRate: 48_000,
        durationMs: 600,
        leftFreq: 440,
        rightFreq: 880,
        leftAmplitude: 0.3,
        rightAmplitude: 0.3,
      }),
      Buffer.alloc(Math.round(48_000 * 0.5) * 4),
    ]);

    sendPcmInChunks(ws, pcm);
    ws.send(JSON.stringify({ type: 'end' }));

    const final = await waitForEvent(events, (event) => event.type === 'final', 5000);

    assert.equal(final.track, 'mix');
    assert.equal(final.speaker, 'spk_0');
    assert.equal(final.mock, true);
    assert.equal(final.confidence, null);
    assert.match(final.text, /^\[mock\] speech detected \d+ ms$/);
    assert.ok(final.endMs > final.startMs);
    assert.ok(events.every((event) => event.mock === true));
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});

test('只配置部分腾讯云凭证时启动失败，不静默降级到 mock', async () => {
  await assert.rejects(
    createAsrBridgeServer({
      port: 0,
      host: '127.0.0.1',
      env: { TENCENT_APP_ID: '1250000000' },
      logger: silentLogger,
    }),
    (error) =>
      error instanceof AsrConfigError &&
      /TENCENT_SECRET_ID/.test(error.message) &&
      /TENCENT_SECRET_KEY/.test(error.message),
  );
});

test('非法 track 返回 error 事件并关闭连接', { timeout: 8000 }, async () => {
  const server = await createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    forceMock: true,
    logger: silentLogger,
  });

  let ws;
  try {
    const opened = await openSocket(`${server.url}?track=X&rate=48000&channels=2`);
    ws = opened.ws;
    const { events } = opened;
    const error = await waitForEvent(events, (event) => event.type === 'error', 3000);
    assert.equal(error.mock, true);
    assert.match(error.text, /track/);
    assert.equal(error.track, 'mix');
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});
