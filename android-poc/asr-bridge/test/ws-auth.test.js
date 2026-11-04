import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAsrBridgeServer } from '../src/server.js';
import {
  closeWebSocket,
  silentLogger,
  waitForEvent,
} from '../test-support/helpers.js';
import { mintToken, verifyToken } from '../../../socialmate-prototype/ai-gateway/pairing.mjs';

const VALID_TOKEN = 'v1.dev_abcdef01.1760000000.1791536000.fake-mac-for-tests';

function captureLogger() {
  const lines = [];
  return {
    lines,
    info: (message) => lines.push(`info ${message}`),
    warn: (message) => lines.push(`warn ${message}`),
    error: (message) => lines.push(`error ${message}`),
  };
}

function startServer(overrides = {}) {
  return createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    forceMock: true,
    logger: silentLogger,
    ...overrides,
  });
}

function rejectHandshake(url, { headers, origin, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const options = {};
    if (headers) options.headers = headers;
    if (origin) options.origin = origin;
    const ws = new WebSocket(url, options);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { ws.terminate(); } catch { /* 忽略 */ }
      reject(new Error('等待握手拒绝超时'));
    }, timeoutMs);
    ws.once('unexpected-response', (req, res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        });
        try { ws.terminate(); } catch { /* 忽略 */ }
      });
    });
    ws.once('open', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.terminate(); } catch { /* 忽略 */ }
      reject(new Error('期望握手被拒绝，但连接已建立'));
    });
    ws.once('error', () => {});
  });
}

function connectAndCollect(server, { headers, origin, query = '?track=A&rate=48000&channels=1', timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const options = {};
    if (headers) options.headers = headers;
    if (origin) options.origin = origin;
    const ws = new WebSocket(server.url + query, options);
    const events = [];
    ws.on('message', (data) => {
      try {
        events.push(JSON.parse(data.toString('utf8')));
      } catch {
        // 只接受 JSON 文本事件。
      }
    });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch { /* 忽略 */ }
      reject(new Error('连接超时'));
    }, timeoutMs);
    ws.once('open', () => {
      clearTimeout(timer);
      resolve({ ws, events });
    });
    ws.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test('mock + ASR_WS_AUTH=required + 无令牌：401，且未建立会话', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async () => ({ ok: true }),
  });
  try {
    const rejected = await rejectHandshake(`${server.url}?track=A&rate=48000&channels=1`);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'AUTH_TOKEN_REQUIRED');
    assert.equal(server.activeSessions(), 0);

    const health = await fetch(`http://127.0.0.1:${server.port}/health`).then((res) => res.json());
    assert.equal(health.authRequired, true);
    assert.equal(health.authMode, 'required');
    assert.equal(Object.keys(health).some((key) => /token|secret/i.test(key)), false);
  } finally {
    await server.close();
  }
});

test('authVerify 返回 TOKEN_EXPIRED：401 且错误码可读、日志脱敏', { timeout: 10_000 }, async () => {
  const logger = captureLogger();
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    logger,
    authVerify: async () => ({ ok: false, code: 'TOKEN_EXPIRED', deviceId: 'dev_abcdef123456' }),
  });
  try {
    const rejected = await rejectHandshake(server.url, {
      headers: { 'x-asr-token': 'v1.dev_abcdef123456.1.2.secret-mac-value' },
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'TOKEN_EXPIRED');
    assert.match(rejected.body, /TOKEN_EXPIRED/);
    assert.equal(server.activeSessions(), 0);

    const audit = logger.lines.join('\n');
    assert.match(audit, /\[asr-auth\] denied code=TOKEN_EXPIRED ip=127\.0\.0\.1/);
    assert.match(audit, /device=dev_abcd/);
    assert.doesNotMatch(audit, /secret-mac-value/);
    assert.doesNotMatch(audit, /dev_abcdef123456/);
  } finally {
    await server.close();
  }
});

test('错误 Origin 直接 403，即使令牌有效', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async (token) => ({ ok: token === VALID_TOKEN }),
  });
  try {
    const rejected = await rejectHandshake(server.url, {
      origin: 'https://evil.example',
      headers: { 'x-asr-token': VALID_TOKEN },
    });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers['x-asr-auth-error'], 'ORIGIN_NOT_ALLOWED');
    assert.equal(server.activeSessions(), 0);
  } finally {
    await server.close();
  }
});

test('Origin 为本机且 Host 同 host（端口不同）+ 有效令牌：连接成功并收到 mock 事件', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async (token) => ({ ok: token === VALID_TOKEN, deviceId: 'dev_abcdef01' }),
  });
  let ws;
  try {
    const opened = await connectAndCollect(server, {
      origin: 'http://127.0.0.1:8791',
      headers: { 'x-asr-token': VALID_TOKEN },
    });
    ws = opened.ws;
    assert.equal(server.activeSessions(), 1);
    const ready = await waitForEvent(
      opened.events,
      (event) => event.type === 'session' && event.status === 'ready',
      3000,
    );
    assert.equal(ready.mock, true);
    assert.equal(ready.track, 'A');
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});

test('无 Origin（原生客户端）+ 有效令牌：连接成功', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async (token) => ({ ok: token === VALID_TOKEN }),
  });
  let ws;
  try {
    const opened = await connectAndCollect(server, {
      headers: { authorization: `Bearer ${VALID_TOKEN}` },
    });
    ws = opened.ws;
    const ready = await waitForEvent(
      opened.events,
      (event) => event.type === 'session' && event.status === 'ready',
      3000,
    );
    assert.equal(ready.mock, true);
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});

test('伪造令牌 401 TOKEN_INVALID，撤销/未知设备码原样透传', { timeout: 10_000 }, async () => {
  let code = 'TOKEN_INVALID';
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async () => ({ ok: false, code }),
  });
  try {
    let rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'forged-token' } });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'TOKEN_INVALID');

    code = 'DEVICE_REVOKED';
    rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'revoked-token' } });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'DEVICE_REVOKED');

    code = 'DEVICE_UNKNOWN';
    rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'unknown-device-token' } });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'DEVICE_UNKNOWN');

    assert.equal(server.activeSessions(), 0);
  } finally {
    await server.close();
  }
});

test('同一 IP upgrade 超限返回 429，窗口滑过后恢复', { timeout: 10_000 }, async () => {
  let clock = 1_000_000;
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async () => ({ ok: false, code: 'TOKEN_INVALID' }),
    now: () => clock,
    authLimits: { maxUpgradeAttempts: 3, maxInvalidTokens: 5, windowMs: 60_000 },
  });
  try {
    for (let i = 0; i < 3; i += 1) {
      const rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': `bad-${i}` } });
      assert.equal(rejected.status, 401);
      assert.equal(rejected.headers['x-asr-auth-error'], 'TOKEN_INVALID');
    }

    const limited = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'bad-final' } });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['x-asr-auth-error'], 'UPGRADE_RATE_LIMITED');

    clock += 60_001;
    const recovered = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'bad-recovered' } });
    assert.equal(recovered.status, 401);
    assert.equal(recovered.headers['x-asr-auth-error'], 'TOKEN_INVALID');
  } finally {
    await server.close();
  }
});

test('同一 IP 连续无效令牌超限返回 429', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async () => ({ ok: false, code: 'TOKEN_INVALID' }),
    authLimits: { maxUpgradeAttempts: 20, maxInvalidTokens: 2, windowMs: 60_000 },
  });
  try {
    let rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'bad-1' } });
    assert.equal(rejected.status, 401);

    rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'bad-2' } });
    assert.equal(rejected.status, 401);

    rejected = await rejectHandshake(server.url, { headers: { 'x-asr-token': 'bad-3' } });
    assert.equal(rejected.status, 429);
    assert.equal(rejected.headers['x-asr-auth-error'], 'TOO_MANY_INVALID_TOKENS');
  } finally {
    await server.close();
  }
});

function b64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

test('真实 pairing.verifyToken：有效/过期/篡改/撤销，并可用于桥接正例', { timeout: 15_000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'alw-ws-auth-'));
  const storeFile = path.join(dir, 'pairings.json');
  const previousFile = process.env.SM_PAIRING_FILE;
  const previousSecret = process.env.SM_TOKEN_SECRET;
  process.env.SM_PAIRING_FILE = storeFile;
  process.env.SM_TOKEN_SECRET = `ws-auth-test-${crypto.randomBytes(8).toString('hex')}`;

  const deviceId = 'dev_test00000001';
  const baseStore = () => ({
    schema: 1,
    devices: {
      [deviceId]: {
        deviceId,
        name: 'ws-auth-test',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: null,
        revokedAt: null,
      },
    },
  });

  let server = null;
  let ws = null;
  try {
    await fs.writeFile(storeFile, JSON.stringify(baseStore(), null, 2));
    const minted = await mintToken(deviceId);
    const verified = await verifyToken(minted.token);
    assert.equal(verified.ok, true);
    assert.equal(verified.deviceId, deviceId);

    const nowSec = Math.floor(Date.now() / 1000);
    const iat = nowSec - 7200;
    const exp = nowSec - 3600;
    const mac = b64url(
      crypto
        .createHmac('sha256', Buffer.from(process.env.SM_TOKEN_SECRET))
        .update(`v1|${deviceId}|${iat}|${exp}`)
        .digest(),
    );
    const expired = await verifyToken(`v1.${deviceId}.${iat}.${exp}.${mac}`);
    assert.equal(expired.ok, false);
    assert.equal(expired.code, 'TOKEN_EXPIRED');

    const tampered = `${minted.token.slice(0, -2)}${minted.token.endsWith('aa') ? 'bb' : 'aa'}`;
    const tamperedResult = await verifyToken(tampered);
    assert.equal(tamperedResult.ok, false);
    assert.equal(tamperedResult.code, 'TOKEN_INVALID');

    server = await startServer({
      env: { ASR_WS_AUTH: 'required' },
      authVerify: async (token) => await verifyToken(token),
    });
    const opened = await connectAndCollect(server, {
      origin: 'http://127.0.0.1:8791',
      headers: { 'x-asr-token': minted.token },
    });
    ws = opened.ws;
    const ready = await waitForEvent(
      opened.events,
      (event) => event.type === 'session' && event.status === 'ready',
      3000,
    );
    assert.equal(ready.mock, true);

    const revokedStore = baseStore();
    revokedStore.devices[deviceId].revokedAt = new Date().toISOString();
    await fs.writeFile(storeFile, JSON.stringify(revokedStore, null, 2));
    const revoked = await verifyToken(minted.token);
    assert.equal(revoked.ok, false);
    assert.equal(revoked.code, 'DEVICE_REVOKED');

    const rejected = await rejectHandshake(server.url, {
      headers: { 'x-asr-token': minted.token },
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'DEVICE_REVOKED');
  } finally {
    if (ws) await closeWebSocket(ws);
    if (server) await server.close();
    if (previousFile === undefined) delete process.env.SM_PAIRING_FILE;
    else process.env.SM_PAIRING_FILE = previousFile;
    if (previousSecret === undefined) delete process.env.SM_TOKEN_SECRET;
    else process.env.SM_TOKEN_SECRET = previousSecret;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('ASR_WS_AUTH=off：mock 不强制鉴权（开发逃生口）', { timeout: 10_000 }, async () => {
  const server = await startServer({ env: { ASR_WS_AUTH: 'off' } });
  let ws;
  try {
    const opened = await connectAndCollect(server);
    ws = opened.ws;
    const ready = await waitForEvent(
      opened.events,
      (event) => event.type === 'session' && event.status === 'ready',
      3000,
    );
    assert.equal(ready.mock, true);
    const health = await fetch(`http://127.0.0.1:${server.port}/health`).then((res) => res.json());
    assert.equal(health.authRequired, false);
    assert.equal(health.authMode, 'off');
  } finally {
    if (ws) await closeWebSocket(ws);
    await server.close();
  }
});

test('真实模式且未注入 authVerify：默认 fail-closed 401 AUTH_NOT_CONFIGURED', { timeout: 10_000 }, async () => {
  const server = await createAsrBridgeServer({
    port: 0,
    host: '127.0.0.1',
    logger: silentLogger,
    modeInfo: {
      mode: 'tencent',
      credentials: { appId: '1250000000', secretId: 'fake', secretKey: 'fake', voiceId: 'fake' },
      reason: 'test',
    },
  });
  try {
    const rejected = await rejectHandshake(server.url);
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers['x-asr-auth-error'], 'AUTH_NOT_CONFIGURED');
    assert.equal(server.activeSessions(), 0);
    const health = await fetch(`http://127.0.0.1:${server.port}/health`).then((res) => res.json());
    assert.equal(health.authRequired, true);
    assert.equal(health.authMode, 'required');
  } finally {
    await server.close();
  }
});

test('并发会话上限：超出的连接以 1013 关闭且不计入活动会话', { timeout: 10_000 }, async () => {
  const server = await startServer({
    env: { ASR_WS_AUTH: 'required' },
    authVerify: async () => ({ ok: true }),
    authLimits: {
      maxConcurrentSessions: 1,
      maxUpgradeAttempts: 20,
      maxInvalidTokens: 5,
      windowMs: 60_000,
    },
  });
  let first = null;
  let second = null;
  try {
    const opened = await connectAndCollect(server, { headers: { 'x-asr-token': 'ok' } });
    first = opened.ws;
    assert.equal(server.activeSessions(), 1);

    const extra = await connectAndCollect(server, { headers: { 'x-asr-token': 'ok' } });
    second = extra.ws;
    const closeCode = await new Promise((resolve) => second.once('close', resolve));
    assert.equal(closeCode, 1013);

    const limitEvent = await waitForEvent(
      extra.events,
      (event) => event.type === 'error' && event.code === 'SESSION_LIMIT',
      2000,
    );
    assert.equal(limitEvent.code, 'SESSION_LIMIT');
    assert.equal(server.activeSessions(), 1);
  } finally {
    if (second) await closeWebSocket(second);
    if (first) await closeWebSocket(first);
    await server.close();
  }
});
