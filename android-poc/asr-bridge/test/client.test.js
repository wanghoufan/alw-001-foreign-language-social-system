import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket, { WebSocketServer } from 'ws';
import { TencentRealtimeSession } from '../src/tencent-asr-client.js';
import { waitForEvent } from '../test-support/helpers.js';

const CREDS = {
  appId: '1250000000',
  secretId: 'FAKE_SECRET_ID_FOR_TESTS_ONLY_0001',
  secretKey: 'FAKE_SECRET_KEY_FOR_TESTS_ONLY_0001',
  voiceId: '0123456789abcdef0123456789abcdef',
  timestamp: 1760000000,
  expired: 1760003600,
  nonce: 123456789,
};

async function startFakeUpstream(onConnection) {
  const wss = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((resolve) => wss.once('listening', resolve));
  const port = wss.address().port;
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    onConnection(ws, url);
  });
  return {
    port,
    close: () =>
      new Promise((resolve) => {
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
}

function localWsFactory(port) {
  return (signedUrl) => {
    const url = new URL(signedUrl);
    url.protocol = 'ws:';
    url.host = `127.0.0.1:${port}`;
    return new WebSocket(url);
  };
}

test('客户端映射：A 轨标准结果 -> interim/final，mock:false，speaker=A', { timeout: 10_000 }, async () => {
  let upstreamQuery = null;
  let audioBytes = 0;
  let gotEnd = false;

  const upstream = await startFakeUpstream((ws, url) => {
    upstreamQuery = url.searchParams;
    ws.send(
      JSON.stringify({
        code: 0,
        message: 'success',
        voice_id: url.searchParams.get('voice_id'),
      }),
    );

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        audioBytes += data.length;
        if (audioBytes >= 6400) {
          ws.send(
            JSON.stringify({
              code: 0,
              message: 'success',
              result: {
                slice_type: 1,
                index: 0,
                start_time: 0,
                end_time: 500,
                voice_text_str: 'Hello',
              },
            }),
          );
          ws.send(
            JSON.stringify({
              code: 0,
              message: 'success',
              result: {
                slice_type: 2,
                index: 0,
                start_time: 0,
                end_time: 800,
                voice_text_str: 'Hello world',
              },
            }),
          );
        }
        return;
      }

      const message = JSON.parse(data.toString('utf8'));
      if (message.type === 'end') {
        gotEnd = true;
        ws.send(JSON.stringify({ code: 0, message: 'success', final: 1 }));
      }
    });
  });

  const events = [];
  const session = new TencentRealtimeSession({
    ...CREDS,
    track: 'A',
    wsFactory: localWsFactory(upstream.port),
    handshakeTimeoutMs: 3000,
    endTimeoutMs: 3000,
  });
  session.on('event', (event) => events.push(event));

  try {
    const readyPromise = new Promise((resolve) => session.once('ready', resolve));
    await session.connect();
    const ready = await readyPromise;
    assert.equal(ready.track, 'A');
    assert.equal(ready.engine, '16k_en');

    assert.equal(upstreamQuery.get('engine_model_type'), '16k_en');
    assert.equal(upstreamQuery.get('secretid'), CREDS.secretId);
    assert.ok(upstreamQuery.get('signature'));

    session.write(Buffer.alloc(6400));
    const final = await waitForEvent(events, (event) => event.type === 'final', 3000);
    const interim = await waitForEvent(events, (event) => event.type === 'interim', 3000);

    assert.equal(interim.text, 'Hello');
    assert.equal(interim.mock, false);
    assert.equal(interim.speaker, 'A');
    assert.equal(interim.confidence, null);
    assert.equal(interim.startMs, 0);
    assert.equal(interim.endMs, 500);

    assert.equal(final.text, 'Hello world');
    assert.equal(final.final, true);
    assert.equal(final.mock, false);
    assert.equal(final.track, 'A');
    assert.equal(final.speaker, 'A');
    assert.equal(final.confidence, null);
    assert.equal(final.engine, '16k_en');

    await session.end();
    assert.equal(gotEnd, true);
  } finally {
    session.close();
    await upstream.close();
  }
});

test('客户端映射：mix 轨说话人分离 -> speaker_id 转 spk_N，未确定转 unknown', { timeout: 10_000 }, async () => {
  let upstreamQuery = null;

  const upstream = await startFakeUpstream((ws, url) => {
    upstreamQuery = url.searchParams;
    ws.send(
      JSON.stringify({
        code: 0,
        message: 'success',
        voice_id: url.searchParams.get('voice_id'),
      }),
    );

    let sent = false;
    ws.on('message', (data, isBinary) => {
      if (isBinary && !sent) {
        sent = true;
        ws.send(
          JSON.stringify({
            code: 0,
            message: 'success',
            sentences: {
              sentence: 'Hi there',
              sentence_type: 0,
              sentence_id: 0,
              speaker_id: -1,
              start_time: 0,
              end_time: 400,
            },
          }),
        );
        ws.send(
          JSON.stringify({
            code: 0,
            message: 'success',
            sentences: {
              sentence: 'Hi there',
              sentence_type: 1,
              sentence_id: 0,
              speaker_id: 0,
              start_time: 0,
              end_time: 600,
            },
          }),
        );
        return;
      }

      if (!isBinary) {
        const message = JSON.parse(data.toString('utf8'));
        if (message.type === 'end') {
          ws.send(JSON.stringify({ code: 0, message: 'success', final: 1 }));
        }
      }
    });
  });

  const events = [];
  const session = new TencentRealtimeSession({
    ...CREDS,
    track: 'mix',
    wsFactory: localWsFactory(upstream.port),
    handshakeTimeoutMs: 3000,
    endTimeoutMs: 3000,
  });
  session.on('event', (event) => events.push(event));

  try {
    const readyPromise = new Promise((resolve) => session.once('ready', resolve));
    await session.connect();
    const ready = await readyPromise;
    assert.equal(ready.engine, '16k_zh_en_speaker_2.0');

    assert.equal(upstreamQuery.get('engine_model_type'), '16k_zh_en_speaker_2.0');

    session.write(Buffer.alloc(6400));
    const final = await waitForEvent(events, (event) => event.type === 'final', 3000);
    const interim = await waitForEvent(events, (event) => event.type === 'interim', 3000);

    assert.equal(interim.speaker, 'unknown');
    assert.equal(interim.final, false);
    assert.equal(interim.track, 'mix');

    assert.equal(final.speaker, 'spk_0');
    assert.equal(final.final, true);
    assert.equal(final.track, 'mix');
    assert.equal(final.text, 'Hi there');
    assert.equal(final.mock, false);

    await session.end();
  } finally {
    session.close();
    await upstream.close();
  }
});
