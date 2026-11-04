/**
 * 本地 WebSocket 服务：手机 -> 本机 ASR 桥接。
 *
 * 路由：
 *   /asr?track=A|B|mix&rate=48000&channels=2
 *
 * - 手机发送 PCM16LE 二进制帧；文本帧 {"type":"end"} 表示音频结束。
 * - 服务端负责拆分/混音、重采样到 16k，再交给腾讯云 ASR 或本地 mock。
 * - 未配置完整腾讯云密钥时自动进入 mock；只配置一部分会在启动时明确报错。
 * - SecretId/SecretKey 只存在于服务端进程环境，不写入事件、日志或手机。
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { makeEvent, makeErrorEvent } from './protocol.js';
import { extractTrackPcm16, normalizeTrack } from './split.js';
import {
  StreamingResampler,
  float32ToPcm16le,
  pcm16leToFloat32,
} from './resample.js';
import { MockAsrSession } from './mock-asr.js';
import {
  AsrConfigError,
  TencentRealtimeSession,
  engineForTrack,
  resolveCredentials,
} from './tencent-asr-client.js';
import {P066RealtimeSession, resolveP066Config} from './p066-asr-client.js';
import { getContentService } from './content/service.js';

function isPrivateIp(addr) {
  const ip = String(addr || '').replace(/^::ffff:/i, '').split('%')[0];
  if (ip === '127.0.0.1' || ip === '::1') return true;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}
import { RESERVE_CNY, asrBudgetStatus, canStartAsr, recordAsrUsage } from './asr-budget.js';

const OUTPUT_RATE = 16_000;
const VALID_INPUT_RATES = new Set([16_000, 44_100, 48_000]);
const MAX_ASR_QUEUE_BYTES = OUTPUT_RATE * 2 * 30; // 30 秒
const BRIDGE_VERSION = '0.1.0';

function isForceMock(env) {
  return String(env.ASR_FORCE_MOCK ?? '').trim() === '1';
}

/** 根据环境变量决定 mock 或真实腾讯云；部分凭证会抛错。 */
export function resolveMode({ env = process.env, forceMock = false } = {}) {
  if (forceMock || isForceMock(env)) {
    return { mode: 'mock', credentials: null, reason: 'forced' };
  }
  const upstream = String(env.ASR_UPSTREAM || 'tencent').trim().toLowerCase();
  if (upstream === 'p066') {
    const p066 = resolveP066Config(env); // 缺令牌直接抛错，绝不静默降级
    return { mode: 'p066', credentials: null, p066, reason: 'p066-upstream' };
  }
  const result = resolveCredentials(env);
  if (!result.configured) {
    return { mode: 'mock', credentials: null, reason: 'no-credentials' };
  }
  return { mode: 'tencent', credentials: result.credentials, reason: 'configured' };
}

function makeLogger(logger) {
  return {
    info: typeof logger?.info === 'function' ? logger.info.bind(logger) : () => {},
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : () => {},
    error: typeof logger?.error === 'function' ? logger.error.bind(logger) : () => {},
  };
}

const AUTH_OFF_VALUES = new Set(['off', 'disabled', 'none', '0', 'false']);
const AUTH_REQUIRED_VALUES = new Set(['required', 'on', '1', 'true']);

/**
 * 握手鉴权策略：真实上游默认必须鉴权；mock 默认不强制，便于本地零费用测试。
 * ASR_WS_AUTH=off 只作为开发逃生口，真实上游使用时会打警告。
 */
export function resolveAuthPolicy({ mode, env = process.env, logger } = {}) {
  const log = logger || { warn() {} };
  const raw = String(env.ASR_WS_AUTH ?? '').trim().toLowerCase();
  if (AUTH_OFF_VALUES.has(raw)) {
    if (mode !== 'mock') {
      log.warn(
        '[asr-auth] WARNING: ASR_WS_AUTH=off with real upstream; WebSocket handshakes are unauthenticated (development only).',
      );
    }
    return { mode: 'off', authRequired: false, reason: 'ASR_WS_AUTH=off' };
  }
  if (AUTH_REQUIRED_VALUES.has(raw)) {
    return { mode: 'required', authRequired: true, reason: 'ASR_WS_AUTH=required' };
  }
  if (raw) {
    log.warn(`[asr-auth] unknown ASR_WS_AUTH="${raw}"; treating as required (fail closed).`);
    return { mode: 'required', authRequired: true, reason: 'unknown-env-fail-closed' };
  }
  if (mode === 'mock') {
    return { mode: 'optional', authRequired: false, reason: 'mock-default' };
  }
  return { mode: 'required', authRequired: true, reason: 'real-default' };
}

function normalizeHostname(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '');
}

function isLoopbackOrPrivateHost(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return false;
  if (host === 'localhost' || host === '::1') return true;
  if (host.endsWith('.ts.net') && host.length > '.ts.net'.length) return true;
  return isPrivateIp(host);
}

function hostnameFromHostHeader(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return normalizeHostname(new URL(`http://${raw}`).hostname);
  } catch {
    return '';
  }
}

/**
 * Origin 不是身份凭证，只用于来源收敛：无 Origin（原生客户端）放行到令牌校验；
 * 有 Origin 必须是本机/私网/Tailnet，且与请求 Host 同 host（端口可不同）。
 */
export function checkUpgradeOrigin(headers = {}) {
  const rawOrigin = headers.origin;
  if (rawOrigin === undefined || rawOrigin === null || String(rawOrigin).trim() === '') {
    return { ok: true };
  }
  let origin;
  try {
    origin = new URL(String(rawOrigin).trim());
  } catch {
    return { ok: false, code: 'ORIGIN_INVALID' };
  }
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    return { ok: false, code: 'ORIGIN_NOT_ALLOWED' };
  }
  const originHost = normalizeHostname(origin.hostname);
  if (!isLoopbackOrPrivateHost(originHost)) {
    return { ok: false, code: 'ORIGIN_NOT_ALLOWED' };
  }
  const requestHost = hostnameFromHostHeader(headers.host);
  if (!requestHost || originHost !== requestHost) {
    return { ok: false, code: 'ORIGIN_HOST_MISMATCH' };
  }
  return { ok: true, originHost };
}

function headerValue(headers, name) {
  const raw = headers?.[name];
  return String(Array.isArray(raw) ? raw[0] : raw ?? '').trim();
}

/** 主来源 x-asr-token；兼容 authorization: Bearer。绝不回显或记录原文。 */
function extractHandshakeToken(headers = {}) {
  const direct = headerValue(headers, 'x-asr-token');
  if (direct) return direct;
  const auth = headerValue(headers, 'authorization');
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  return match ? match[1] : '';
}

function sanitizeAuthCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z0-9_]{1,48}$/.test(code) ? code : 'TOKEN_INVALID';
}

function maskIp(value) {
  const ip = String(value || '').replace(/^::ffff:/i, '').split('%')[0];
  if (!ip) return 'unknown';
  if (ip === '127.0.0.1' || ip === '::1') return ip;
  if (!ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    return 'unknown';
  }
  return `${ip.split(':').slice(0, 3).join(':')}:***`;
}

function verifyHandshakeToken(verify, token, timeoutMs = 5000) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, code: 'AUTH_VERIFY_TIMEOUT' }), timeoutMs);
    timer.unref?.();
  });
  const call = Promise.resolve()
    .then(() => verify(token))
    .catch(() => ({ ok: false, code: 'AUTH_VERIFY_FAILED' }));
  return Promise.race([call, timeout]).finally(() => clearTimeout(timer));
}

function sendJson(ws, event) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(event));
  } catch {
    // 连接可能刚好断开，忽略发送失败。
  }
}

function httpJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(payload);
}

const MAX_SUGGEST_BODY = 16 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > MAX_SUGGEST_BODY) {
        settled = true;
        const error = new Error('请求体超过 16KB');
        error.status = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        resolve(text ? JSON.parse(text) : {});
      } catch {
        const error = new Error('请求体必须是 JSON');
        error.status = 400;
        reject(error);
      }
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function clampSuggestLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.max(1, Math.min(3, Math.trunc(n)));
}

/**
 * 启动 ASR 桥接服务。
 * 返回 { port, host, mode, httpServer, wss, close }。
 * port 传 0 时由系统分配，测试用。
 */
export async function createAsrBridgeServer(options = {}) {
  const env = options.env || process.env;
  const logger = makeLogger(options.logger || console);
  const modeInfo = options.modeInfo || resolveMode({ env, forceMock: options.forceMock });
  const contentService = options.contentService || null;
  const host = options.host ?? (String(env.HOST ?? '').trim() || '127.0.0.1');
  const requestedPort = options.port ?? Number(String(env.PORT ?? '').trim() || 8790);
  const authVerify = typeof options.authVerify === 'function' ? options.authVerify : null;
  const authPolicy = resolveAuthPolicy({ mode: modeInfo.mode, env, logger });
  const authLimits = {
    windowMs:
      Number(options.authLimits?.windowMs) > 0 ? Number(options.authLimits.windowMs) : 60_000,
    maxUpgradeAttempts: Number.isInteger(options.authLimits?.maxUpgradeAttempts)
      ? options.authLimits.maxUpgradeAttempts
      : 20,
    maxInvalidTokens: Number.isInteger(options.authLimits?.maxInvalidTokens)
      ? options.authLimits.maxInvalidTokens
      : 5,
    maxConcurrentSessions: Number.isInteger(options.authLimits?.maxConcurrentSessions)
      ? options.authLimits.maxConcurrentSessions
      : 8,
  };
  const now = typeof options.now === 'function' ? options.now : Date.now;

  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
    throw new RangeError(`PORT 必须是 0..65535 的整数，收到 ${requestedPort}`);
  }

  if (modeInfo.mode === 'mock') {
    logger.warn(
      `[asr-bridge] MOCK MODE (${modeInfo.reason})：未配置腾讯云密钥，` +
        '所有事件都带 mock:true，输出不是真实 ASR。',
    );
  } else {
    logger.info('[asr-bridge] Tencent ASR mode：密钥只在本进程内存中使用，不写入日志。');
  }

  if (authPolicy.mode === 'required' && !authVerify) {
    logger.error(
      '[asr-auth] authVerify is not configured; all WebSocket handshakes will be rejected (fail-closed).',
    );
  }

  const clients = new Set();
  // Optional in-process callback for private live UI. Never forward to public network here.
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const startedAt = Date.now();

  const runSuggest = (query, limit) => {
    try {
      const service = contentService || getContentService();
      return { ok: true, ...service.suggest(query, clampSuggestLimit(limit)) };
    } catch (error) {
      logger.error(`[asr-bridge] content unavailable: ${error.message}`);
      return {
        ok: false,
        error: 'content unavailable',
        matched: false,
        suggestions: [],
      };
    }
  };

  const httpServer = http.createServer((req, res) => {
    if (!isPrivateIp(req.socket.remoteAddress)) {
      httpJson(res, 403, { ok: false, error: 'lan only' });
      return;
    }
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      httpJson(res, 400, { ok: false, error: 'bad url' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      httpJson(res, 200, {
        ok: true,
        mode: modeInfo.mode,
        mock: modeInfo.mode === 'mock',
        activeSessions: clients.size,
        uptimeMs: Date.now() - startedAt,
        version: BRIDGE_VERSION,
        outputSampleRate: OUTPUT_RATE,
        authRequired: authPolicy.authRequired,
        authMode: authPolicy.mode,
        budget: asrBudgetStatus({ env }),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      httpJson(res, 200, {
        ok: true,
        name: 'alw001-asr-bridge',
        version: BRIDGE_VERSION,
        mode: modeInfo.mode,
        mock: modeInfo.mode === 'mock',
        websocket: '/asr?track=A|B|mix&rate=48000&channels=2',
        health: '/health',
        suggest: '/suggest?q=<topic>&limit=1..3 (GET or POST)',
        suggestWebSocket: '{"type":"suggest","text":"<topic>","limit":3}',
        note:
          modeInfo.mode === 'mock'
            ? 'MOCK MODE: 事件带 mock:true，不是真实腾讯云 ASR'
            : 'Tencent ASR mode（真实云端，未在无密钥环境验证）',
      });
      return;
    }

    if (url.pathname === '/suggest') {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        res.end();
        return;
      }
      if (req.method === 'GET') {
        const query = String(url.searchParams.get('q') || '').trim();
        if (!query) {
          httpJson(res, 400, { ok: false, error: 'q 不能为空' });
          return;
        }
        httpJson(res, 200, runSuggest(query, url.searchParams.get('limit')));
        return;
      }
      if (req.method === 'POST') {
        readJsonBody(req)
          .then((body) => {
            const query = String(body?.q ?? body?.text ?? '').trim();
            if (!query) {
              httpJson(res, 400, { ok: false, error: 'q 不能为空' });
              return;
            }
            httpJson(res, 200, runSuggest(query, body?.limit));
          })
          .catch((error) => {
            httpJson(res, error.status || 400, { ok: false, error: error.message });
          });
        return;
      }
      httpJson(res, 405, { ok: false, error: 'method not allowed' });
      return;
    }

    httpJson(res, 404, { ok: false, error: 'not found' });
  });

  const wss = new WebSocketServer({ noServer: true });

  const rateBuckets = new Map();

  function bucketFor(ip) {
    const t = now();
    let entry = rateBuckets.get(ip);
    if (!entry) {
      entry = { attempts: [], invalid: [] };
      rateBuckets.set(ip, entry);
    }
    entry.attempts = entry.attempts.filter((at) => t - at < authLimits.windowMs);
    entry.invalid = entry.invalid.filter((at) => t - at < authLimits.windowMs);
    if (rateBuckets.size > 256) {
      for (const [key, value] of rateBuckets) {
        if (!value.attempts.length && !value.invalid.length) rateBuckets.delete(key);
      }
    }
    return entry;
  }

  function rejectUpgrade(socket, status, code) {
    const text =
      { 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests' }[
        status
      ] || 'Rejected';
    const body = `${code}\n`;
    const lines = [
      `HTTP/1.1 ${status} ${text}`,
      'connection: close',
      'content-type: text/plain; charset=utf-8',
      `content-length: ${Buffer.byteLength(body)}`,
      'cache-control: no-store',
    ];
    if (code && (status === 401 || status === 403 || status === 429)) {
      lines.push(`x-asr-auth-error: ${code}`);
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n${body}`);
    socket.end();
    setTimeout(() => {
      try {
        socket.destroy();
      } catch {
        // 已断开
      }
    }, 500).unref?.();
  }

  function auditDenied(code, ip, deviceId) {
    const hint = deviceId ? ` device=${String(deviceId).slice(0, 8)}` : '';
    logger.warn(`[asr-auth] denied code=${code} ip=${maskIp(ip)}${hint}`);
  }

  async function handleUpgrade(req, socket, head) {
    const remoteIp = String(req.socket.remoteAddress || '');
    if (!isPrivateIp(remoteIp)) {
      rejectUpgrade(socket, 403, 'PRIVATE_NETWORK_ONLY');
      return;
    }

    const bucket = bucketFor(remoteIp);
    bucket.attempts.push(now());
    if (bucket.attempts.length > authLimits.maxUpgradeAttempts) {
      auditDenied('UPGRADE_RATE_LIMITED', remoteIp);
      rejectUpgrade(socket, 429, 'UPGRADE_RATE_LIMITED');
      return;
    }

    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      rejectUpgrade(socket, 400, 'BAD_REQUEST');
      return;
    }

    if (url.pathname !== '/asr') {
      rejectUpgrade(socket, 404, 'NOT_FOUND');
      return;
    }

    const originCheck = checkUpgradeOrigin(req.headers);
    if (!originCheck.ok) {
      auditDenied(originCheck.code, remoteIp);
      rejectUpgrade(socket, 403, originCheck.code);
      return;
    }

    if (authPolicy.mode !== 'off') {
      if (authPolicy.authRequired && !authVerify) {
        auditDenied('AUTH_NOT_CONFIGURED', remoteIp);
        rejectUpgrade(socket, 401, 'AUTH_NOT_CONFIGURED');
        return;
      }
      const token = extractHandshakeToken(req.headers);
      if (!token) {
        if (authPolicy.authRequired) {
          auditDenied('AUTH_TOKEN_REQUIRED', remoteIp);
          rejectUpgrade(socket, 401, 'AUTH_TOKEN_REQUIRED');
          return;
        }
      } else if (!authVerify) {
        logger.warn('[asr-auth] token supplied but authVerify is not configured; ignored in optional mode.');
      } else {
        if (bucket.invalid.length >= authLimits.maxInvalidTokens) {
          auditDenied('TOO_MANY_INVALID_TOKENS', remoteIp);
          rejectUpgrade(socket, 429, 'TOO_MANY_INVALID_TOKENS');
          return;
        }
        const result = await verifyHandshakeToken(authVerify, token);
        if (socket.destroyed) return;
        if (!result || result.ok !== true) {
          const code = sanitizeAuthCode(result?.code);
          bucket.invalid.push(now());
          auditDenied(code, remoteIp, result?.deviceId);
          if (bucket.invalid.length > authLimits.maxInvalidTokens) {
            rejectUpgrade(socket, 429, 'TOO_MANY_INVALID_TOKENS');
            return;
          }
          rejectUpgrade(socket, 401, code);
          return;
        }
      }
    }

    if (clients.size >= authLimits.maxConcurrentSessions) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        sendJson(
          ws,
          makeErrorEvent({
            track: 'mix',
            message: '并发会话已达上限，请稍后重试',
            mock: modeInfo.mode === 'mock',
            code: 'SESSION_LIMIT',
          }),
        );
        ws.close(1013, 'session-limit');
      });
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleClient(ws, url);
    });
  }

  httpServer.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    handleUpgrade(req, socket, head).catch((error) => {
      logger.warn(`[asr-auth] upgrade failed: ${error.message}`);
      try {
        socket.destroy();
      } catch {
        // 已断开
      }
    });
  });

  function handleClient(ws, url) {
    const rawTrack = url.searchParams.get('track') ?? 'mix';
    let track;
    try {
      track = normalizeTrack(rawTrack);
    } catch {
      const event = makeErrorEvent({
        track: 'mix',
        message: `track 参数非法：${rawTrack}，应为 A、B 或 mix`,
        mock: modeInfo.mode === 'mock',
      });
      sendJson(ws, event);
      ws.close(1008, 'invalid track');
      return;
    }

    const rate = Number(url.searchParams.get('rate') ?? 48_000);
    if (!VALID_INPUT_RATES.has(rate)) {
      const event = makeErrorEvent({
        track,
        message: `rate 参数非法：${url.searchParams.get('rate')}，支持 16000、44100、48000`,
        mock: modeInfo.mode === 'mock',
      });
      sendJson(ws, event);
      ws.close(1008, 'invalid rate');
      return;
    }

    const channels = Number(url.searchParams.get('channels') ?? 1);
    if (channels !== 1 && channels !== 2) {
      const event = makeErrorEvent({
        track,
        message: `channels 参数非法：${url.searchParams.get('channels')}，支持 1 或 2`,
        mock: modeInfo.mode === 'mock',
      });
      sendJson(ws, event);
      ws.close(1008, 'invalid channels');
      return;
    }

    const mock = modeInfo.mode === 'mock';
    const p066 = modeInfo.mode === 'p066';
    if (!mock && !p066 && !canStartAsr({env})) {
      const budget = asrBudgetStatus({env});
      sendJson(
        ws,
        makeErrorEvent({
          track,
          message:
            `腾讯云 ASR 预算已用尽（上限 ${budget.limitCny} 元，剩余 ${budget.remainingCny} 元），` +
            '已拒绝新建会话。',
          mock: false,
          code: 'ASR_BUDGET_EXHAUSTED',
          provider: 'tencent',
        }),
      );
      ws.close(1013, 'asr-budget-exhausted');
      return;
    }
    const sessionId = randomUUID();
    const engine = mock ? 'mock' : engineForTrack(track, env);
    const initialSpeaker = track === 'mix' ? 'unknown' : track;
    const route = track === 'mix' ? 'mix-diarization' : 'dual-track';

    const client = {
      ws,
      track,
      rate,
      channels,
      sessionId,
      mock,
      engine,
      inputBytes: 0,
      unbudgetedBytes: 0,
      budgetTimer: null,
      maxTimer: null,
      outputSamples: 0,
      eventCount: 0,
      ended: false,
      finalized: false,
      budgetRecorded: false,
      asrSession: null,
      mockSession: null,
    };
    clients.add(client);

    const sendEvent = (event) => {
      client.eventCount += 1;
      const output = {
        ...event,
        sessionId,
        inputRate: rate,
        channels,
        outputRate: OUTPUT_RATE,
      };
      sendJson(ws, output);
      if (onEvent) {
        try { onEvent(output); }
        catch (error) { logger.warn('[asr-bridge] optional live callback failed: ' + error.message); }
      }
    };

    const sendSession = (status, text, extra = {}) =>
      sendEvent(
        makeEvent({
          type: 'session',
          track,
          text,
          startMs: client.outputSamples > 0 ? Math.round((client.outputSamples * 1000) / OUTPUT_RATE) : 0,
          endMs: client.outputSamples > 0 ? Math.round((client.outputSamples * 1000) / OUTPUT_RATE) : 0,
          speaker: initialSpeaker,
          confidence: null,
          final: status === 'ended' || status === 'error',
          mock,
          engine,
          provider: mock ? 'mock' : 'tencent',
          status,
          route,
          ...extra,
        }),
      );

    logger.info(
      `[asr-bridge] open session=${sessionId} track=${track} rate=${rate} ` +
        `channels=${channels} mode=${modeInfo.mode} engine=${engine}`,
    );

    sendSession(
      mock ? 'ready' : 'connecting',
      mock
        ? '[mock] 未配置腾讯云密钥，使用本地能量模拟器；输出不是真实 ASR'
        : (p066 ? '正在连接 P066 流式 ASR' : '正在连接腾讯云实时 ASR'),
      {
        upstream: mock ? 'mock' : 'connecting',
        note: mock ? 'mock:true 表示本地模拟，不是腾讯云识别结果' : '真实云端连接尚未验证',
      },
    );

    const resampler = new StreamingResampler(rate, OUTPUT_RATE);
    let pending = Buffer.alloc(0);
    let asrReady = false;
    let asrQueue = [];
    let asrQueueBytes = 0;
    let upstreamErrorSent = false;

    const feedAsr = (pcm16) => {
      if (!pcm16 || pcm16.length === 0) return;
      if (mock) {
        client.mockSession.write(pcm16);
        return;
      }
      if (asrReady && client.asrSession) {
        client.asrSession.write(pcm16);
        return;
      }

      if (asrQueueBytes + pcm16.length > MAX_ASR_QUEUE_BYTES) {
        if (!upstreamErrorSent) {
          upstreamErrorSent = true;
          sendEvent(
            makeErrorEvent({
              track,
              message: '腾讯云握手前音频排队超过 30 秒，已终止会话',
              mock: false,
              code: 'ASR_QUEUE_OVERFLOW',
              provider: 'tencent',
            }),
          );
        }
        finalize('error');
        return;
      }
      const copy = Buffer.from(pcm16);
      asrQueue.push(copy);
      asrQueueBytes += copy.length;
    };

    const flushAsrQueue = () => {
      if (!asrReady || !client.asrSession) return;
      const queued = asrQueue;
      asrQueue = [];
      asrQueueBytes = 0;
      for (const chunk of queued) client.asrSession.write(chunk);
    };

    function finalize(status, extra = {}) {
      if (client.finalized) return;
      client.finalized = true;
      client.ended = true;
      if (client.budgetTimer) clearInterval(client.budgetTimer);
      if (client.maxTimer) clearTimeout(client.maxTimer);
      let asrBudget = null;
      if (!mock && !p066 && !client.budgetRecorded) {
        client.budgetRecorded = true;
        const seconds = client.unbudgetedBytes / (rate * channels * 2);
        client.unbudgetedBytes = 0;
        try {
          asrBudget = recordAsrUsage(seconds, { env });
        } catch (error) {
          logger.warn(`[asr-bridge] ASR budget ledger write failed: ${error.message}`);
        }
      }
      sendSession(
        status,
        status === 'error' ? '会话因错误结束' : '会话结束',
        { ...extra, ...(asrBudget ? { asrBudget } : {}) },
      );
      logger.info(
        `[asr-bridge] close session=${sessionId} status=${status} ` +
          `inputBytes=${client.inputBytes} events=${client.eventCount}`,
      );
      const code = status === 'error' ? 1011 : 1000;
      setTimeout(() => {
        if (ws.readyState === 1) ws.close(code, `session-${status}`);
      }, 20).unref?.();
    }

    function endSession() {
      if (client.ended) return;
      client.ended = true;

      // 丢掉不足一个采样帧的尾部字节；正常客户端应按帧对齐。
      if (pending.length > 0) {
        logger.warn(
          `[asr-bridge] session=${sessionId} 丢弃 ${pending.length} 字节不完整 PCM 尾部`,
        );
        pending = Buffer.alloc(0);
      }

      const tail = resampler.flush();
      if (tail.length > 0) {
        client.outputSamples += tail.length;
        feedAsr(float32ToPcm16le(tail));
      }

      if (mock) {
        client.mockSession.end();
        finalize('ended');
        return;
      }

      if (client.asrSession) {
        client.asrSession
          .end()
          .then(() => finalize('ended'))
          .catch((error) => {
            if (!upstreamErrorSent) {
              upstreamErrorSent = true;
              sendEvent(
                makeErrorEvent({
                  track,
                  message: `结束腾讯云 ASR 失败：${error.message}`,
                  mock: false,
                  code: error.code || 'ASR_END_FAILED',
                  provider: 'tencent',
                }),
              );
            }
            finalize('error');
          });
      } else {
        finalize('ended');
      }
    }

    if (!mock) {
      const maxSeconds = Math.max(0, Number(env.ASR_MAX_SESSION_SECONDS || 300));
      if (maxSeconds > 0) {
        client.maxTimer = setTimeout(() => {
          if (client.ended) return;
          sendEvent(
            makeErrorEvent({
              track,
              message: `已到单次录音上限 ${maxSeconds} 秒，自动结束`,
              mock: false,
              code: 'ASR_SESSION_LIMIT',
              provider: 'tencent',
            }),
          );
          endSession();
        }, maxSeconds * 1000);
        client.maxTimer.unref?.();
      }
      client.budgetTimer = setInterval(() => {
        if (client.ended || p066) return;
        const bytes = client.unbudgetedBytes;
        if (bytes <= 0) return;
        client.unbudgetedBytes = 0;
        const seconds = bytes / (rate * channels * 2);
        let status = null;
        try {
          status = recordAsrUsage(seconds, { env });
        } catch (error) {
          logger.warn(`[asr-bridge] ASR budget ledger write failed: ${error.message}`);
          return;
        }
        if (status && status.remainingCny <= RESERVE_CNY) {
          sendEvent(
            makeErrorEvent({
              track,
              message: `腾讯云 ASR 预算已用尽（上限 ${status.limitCny} 元），自动结束本轮`,
              mock: false,
              code: 'ASR_BUDGET_EXHAUSTED',
              provider: 'tencent',
            }),
          );
          endSession();
        }
      }, 5000);
      client.budgetTimer.unref?.();
    }

    if (mock) {
      client.mockSession = new MockAsrSession({
        track,
        sessionId,
        onEvent: sendEvent,
      });
    } else {
      if (p066) {
        client.asrSession = new P066RealtimeSession({
          url: modeInfo.p066.url,
          token: modeInfo.p066.token,
          track,
          engineModelType: engine,
          sessionId,
        });
      } else {
        client.asrSession = new TencentRealtimeSession({
          ...modeInfo.credentials,
          track,
          engineModelType: engine,
          sessionId,
        });
      }

      client.asrSession.on('ready', (info) => {
        asrReady = true;
        logger.info(
          `[asr-bridge] upstream ready session=${sessionId} voiceId=${info.voiceId || '-'} engine=${info.engine}`,
        );
        sendSession('ready', p066 ? 'P066 流式 ASR 已连接' : '腾讯云实时 ASR 已连接', {
          upstream: 'connected',
          voiceId: info.voiceId,
          provider: p066 ? 'p066' : 'tencent',
          note: p066 ? '经 P066 网关统一记账' : '真实云端连接；仍需用真实密钥与音频复验',
        });
        flushAsrQueue();
      });

      client.asrSession.on('event', sendEvent);

      client.asrSession.on('error', (event) => {
        if (!upstreamErrorSent) {
          upstreamErrorSent = true;
          sendEvent(event);
        }
        finalize('error');
      });

      client.asrSession.on('done', (info) => {
        logger.info(`[asr-bridge] upstream done session=${sessionId} reason=${info.reason}`);
        finalize('ended');
      });

      client.asrSession.connect().catch((error) => {
        if (!upstreamErrorSent) {
          upstreamErrorSent = true;
          sendEvent(
            makeErrorEvent({
              track,
              message: `${p066 ? 'P066 流式 ASR' : '腾讯云 ASR'} 连接失败：${error.message}`,
              mock: false,
              code: error.code || 'ASR_CONNECT_FAILED',
              provider: p066 ? 'p066' : 'tencent',
            }),
          );
        }
        finalize('error');
      });
    }

    ws.on('message', (data, isBinary) => {
      if (client.ended) return;

      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        client.inputBytes += buffer.length;
        client.unbudgetedBytes += buffer.length;
        pending = Buffer.concat([pending, buffer]);

        const frameBytes = 2 * channels;
        const usable = pending.length - (pending.length % frameBytes);
        if (usable === 0) return;

        const chunk = pending.subarray(0, usable);
        pending = pending.subarray(usable);

        const mono = extractTrackPcm16(chunk, channels, track);
        const resampled = resampler.push(pcm16leToFloat32(mono));
        if (resampled.length > 0) {
          client.outputSamples += resampled.length;
          feedAsr(float32ToPcm16le(resampled));
        }
        return;
      }

      const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        sendEvent(
          makeErrorEvent({
            track,
            message: '文本消息必须是 JSON，例如 {"type":"end"}',
            mock,
            code: 'BAD_CLIENT_JSON',
          }),
        );
        return;
      }

      if (message?.type === 'end') {
        endSession();
      } else if (message?.type === 'ping') {
        sendSession('pong', 'pong');
      } else if (message?.type === 'suggest') {
        const query = String(
          typeof message.text === 'string' ? message.text : message.q ?? '',
        ).trim();
        if (!query || query.length > 2000) {
          sendEvent(
            makeErrorEvent({
              track,
              message: 'suggest 需要 text（1–2000 字符）',
              mock,
              code: 'BAD_SUGGEST_QUERY',
            }),
          );
          return;
        }
        sendJson(ws, {
          type: 'suggestions',
          track,
          query,
          ...runSuggest(query, message.limit),
          asrMode: modeInfo.mode,
          asrMock: mock,
          generatedBy: 'deterministic-retrieval',
        });
      } else {
        sendEvent(
          makeErrorEvent({
            track,
            message: `未知客户端消息 type：${message?.type ?? 'undefined'}`,
            mock,
            code: 'UNKNOWN_CLIENT_MESSAGE',
          }),
        );
      }
    });

    ws.on('close', (code) => {
      clients.delete(client);
      client.ended = true;
      if (client.mockSession) {
        client.mockSession.end();
      }
      if (client.asrSession) {
        client.asrSession.close();
      }
      logger.info(
        `[asr-bridge] ws closed session=${sessionId} code=${code} events=${client.eventCount}`,
      );
    });

    ws.on('error', (error) => {
      logger.warn(`[asr-bridge] ws error session=${sessionId}: ${error.message}`);
    });
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      httpServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      httpServer.off('error', onError);
      resolve();
    };
    httpServer.once('error', onError);
    httpServer.once('listening', onListening);
    httpServer.listen(requestedPort, host);
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  logger.info(
    `[asr-bridge] listening ws://${host}:${port}/asr ` +
      `(mode=${modeInfo.mode}${modeInfo.mode === 'mock' ? ', MOCK' : ''})`,
  );

  let closing = false;
  async function close() {
    if (closing) return;
    closing = true;

    for (const client of clients) {
      try {
        client.ws.terminate();
      } catch {
        // 忽略
      }
      if (client.asrSession) client.asrSession.close();
      if (client.mockSession) client.mockSession.end();
    }
    clients.clear();

    await new Promise((resolve) => {
      wss.close(() => resolve());
    });
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections?.();
    });
    logger.info('[asr-bridge] stopped');
  }

  return {
    port,
    host,
    mode: modeInfo.mode,
    mock: modeInfo.mode === 'mock',
    httpServer,
    wss,
    close,
    url: `ws://${host}:${port}/asr`,
    authMode: authPolicy.mode,
    authRequired: authPolicy.authRequired,
    activeSessions: () => clients.size,
    budget: () => asrBudgetStatus({ env }),
  };
}
