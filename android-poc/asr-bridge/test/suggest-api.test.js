import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createAsrBridgeServer } from '../src/server.js';
import { createContentService } from '../src/content/service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const silent = { info() {}, warn() {}, error() {} };

function fixtureService() {
  return createContentService({
    paths: {
      v14Path: path.join(HERE, 'fixtures/v14.md'),
      hainanPath: path.join(HERE, 'fixtures/hainan.json'),
      storiesPath: path.join(HERE, 'fixtures/stories.json'),
    },
  });
}

async function withServer(fn) {
  const server = await createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    modeInfo: { mode: 'mock', credentials: null, reason: 'forced' },
    logger: silent,
    contentService: fixtureService(),
  });
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

function waitForSuggestion(ws) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for suggestions')), 4000);
    const onMessage = (raw) => {
      const event = JSON.parse(raw.toString());
      if (event.type !== 'suggestions') return;
      clearTimeout(timer);
      ws.off('message', onMessage);
      resolve(event);
    };
    ws.on('message', onMessage);
  });
}

test('GET /suggest returns deterministic suggestions', async () => {
  await withServer(async (server) => {
    const response = await fetch(
      `http://127.0.0.1:${server.port}/suggest?q=personality%20quiz&limit=2`,
    );
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.matched, true);
    assert.equal(body.suggestions.length, 2);
    assert.equal(body.suggestions[0].ref, 'P002');
    assert.equal(body.corpus.software, 3);
  });
});

test('POST /suggest validates input', async () => {
  await withServer(async (server) => {
    const ok = await fetch(`http://127.0.0.1:${server.port}/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'family tree', limit: 2 }),
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.suggestions[0].ref, 'P005');

    const bad = await fetch(`http://127.0.0.1:${server.port}/suggest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: '' }),
    });
    assert.equal(bad.status, 400);
  });
});

test('WebSocket suggest command returns suggestions without polluting ASR events', async () => {
  await withServer(async (server) => {
    const ws = new WebSocket(`${server.url}?track=mix&rate=48000&channels=2`);
    try {
      await new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      });
      const pending = waitForSuggestion(ws);
      ws.send(JSON.stringify({ type: 'suggest', text: '龙兴路', limit: 2 }));
      const event = await pending;
      assert.equal(event.type, 'suggestions');
      assert.equal(event.asrMode, 'mock');
      assert.equal(event.suggestions[0].ref, 'H1');
      assert.match(event.suggestions[0].text, /Longxing Road/);
    } finally {
      ws.close();
    }
  });
});
