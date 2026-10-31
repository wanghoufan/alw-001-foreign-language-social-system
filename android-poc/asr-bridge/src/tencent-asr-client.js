/**
 * 腾讯云实时语音识别 WebSocket v2 客户端封装。
 *
 * 关键约束：
 * - 没有完整密钥时在构造函数直接抛 AsrConfigError，绝不静默降级。
 * - 每条输出事件都带 mock:false，表示来自真实云端；服务端只有在未配置密钥时
 *   才会改用 MockAsrSession，且那条路径带 mock:true。
 * - 腾讯云 v2 结果没有 confidence 字段，因此 confidence 固定为 null。
 * - 文本原样透传，不做润色、不改写。
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { makeEvent, makeErrorEvent } from './protocol.js';
import { normalizeTrack } from './split.js';
import {
  ENGINE_EN,
  ENGINE_SPEAKER,
  createSignedUrl,
  generateNonce,
  generateVoiceId,
} from './tencent-sign.js';

const WS_OPEN = 1;
const MAX_AUDIO_CHUNK_BYTES = 6400; // 16k PCM16 的 200ms
const DEFAULT_MAX_QUEUE_BYTES = 16000 * 2 * 30; // 30 秒

export class AsrConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AsrConfigError';
    this.code = 'ASR_CONFIG_MISSING';
  }
}

export class AsrUpstreamError extends Error {
  constructor(message, code = 'ASR_UPSTREAM_ERROR') {
    super(message);
    this.name = 'AsrUpstreamError';
    this.code = code;
  }
}

function readEnv(env, name) {
  return String(env[name] ?? '').trim();
}

/**
 * 读取并校验腾讯云凭证。
 * - 三项都没有：{ configured:false, credentials:null }
 * - 缺任意一项：抛 AsrConfigError
 * - 三项齐全：{ configured:true, credentials:{...} }
 */
export function resolveCredentials(env = process.env) {
  const appId = readEnv(env, 'TENCENT_APP_ID');
  const secretId = readEnv(env, 'TENCENT_SECRET_ID');
  const secretKey = readEnv(env, 'TENCENT_SECRET_KEY');
  const values = { TENCENT_APP_ID: appId, TENCENT_SECRET_ID: secretId, TENCENT_SECRET_KEY: secretKey };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length === 3) {
    return { configured: false, credentials: null };
  }
  if (missing.length > 0) {
    throw new AsrConfigError(
      `腾讯云 ASR 凭证不完整，缺少：${missing.join('、')}。` +
        '请同时填写 TENCENT_APP_ID、TENCENT_SECRET_ID、TENCENT_SECRET_KEY，' +
        '或三项全部留空以使用 mock 模式。',
    );
  }
  if (!/^\d+$/.test(appId)) {
    throw new AsrConfigError(`TENCENT_APP_ID 必须是数字字符串，收到 ${appId}`);
  }

  return {
    configured: true,
    credentials: { appId, secretId, secretKey },
  };
}

/** 双轨 A/B 用英文引擎；混音用支持说话人分离的中英引擎。 */
export function engineForTrack(track, env = process.env) {
  const normalized = normalizeTrack(track);
  if (normalized === 'mix') {
    return readEnv(env, 'TENCENT_ENGINE_SPEAKER') || ENGINE_SPEAKER;
  }
  return readEnv(env, 'TENCENT_ENGINE_EN') || ENGINE_EN;
}

function normalizeSpeakerId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id >= 0 ? `spk_${id}` : 'unknown';
}

/**
 * 一条腾讯云 ASR 会话。
 *
 * 事件：
 * - 'ready'  { voiceId, engine, track, sessionId }
 * - 'event'  统一协议事件（interim/final，mock:false）
 * - 'error'  统一协议 error 事件（仅在存在监听器时 emit）
 * - 'done'   { reason }
 */
export class TencentRealtimeSession extends EventEmitter {
  constructor(options = {}) {
    super();

    if (!options.appId || !options.secretId || !options.secretKey) {
      const missing = ['appId', 'secretId', 'secretKey'].filter((key) => !options[key]);
      throw new AsrConfigError(
        `TencentRealtimeSession 缺少凭证：${missing.join('、')}。` +
          '无密钥时必须显式使用 mock，不允许静默降级。',
      );
    }

    this.track = normalizeTrack(options.track ?? 'mix');
    this.appId = String(options.appId);
    this.secretId = String(options.secretId);
    this.secretKey = String(options.secretKey);
    this.engineModelType =
      options.engineModelType || (this.track === 'mix' ? ENGINE_SPEAKER : ENGINE_EN);
    this.speakerDiarization = this.track === 'mix';
    this.sessionId = options.sessionId || randomUUID();
    this.voiceId = options.voiceId || generateVoiceId();

    this.timestamp = options.timestamp;
    this.expired = options.expired;
    this.nonce = options.nonce ?? generateNonce();

    this.wsFactory = options.wsFactory || ((url) => new WebSocket(url));
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
    this.endTimeoutMs = options.endTimeoutMs ?? 10_000;
    this.maxQueueBytes = options.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;

    this.ws = null;
    this.ready = false;
    this.ended = false;
    this.closed = false;
    this.endRequested = false;

    this._queue = [];
    this._queuedBytes = 0;
    this._doneEmitted = false;
    this._endResolver = null;
    this._endPromise = null;
    this._connectResolver = null;
    this._connectRejecter = null;
    this._connectTimer = null;
    this._lastInterim = new Map();
    this._lastFinal = new Map();
  }

  /** 生成签名 URL（含 secretid/signature，禁止打日志）。 */
  buildUrl() {
    return createSignedUrl({
      appId: this.appId,
      secretId: this.secretId,
      secretKey: this.secretKey,
      engineModelType: this.engineModelType,
      voiceId: this.voiceId,
      timestamp: this.timestamp,
      expired: this.expired,
      nonce: this.nonce,
      voiceFormat: 1,
      needVad: 1,
    }).url;
  }

  /** 建立连接并等待握手 code=0。 */
  connect() {
    if (this.ready && this.ws && this.ws.readyState === WS_OPEN) {
      return Promise.resolve(this);
    }
    if (this.closed) {
      return Promise.reject(new AsrUpstreamError('会话已关闭', 'ASR_SESSION_CLOSED'));
    }

    let url;
    try {
      url = this.buildUrl();
    } catch (error) {
      return Promise.reject(
        new AsrUpstreamError(`生成签名 URL 失败：${error.message}`, 'ASR_SIGN_FAILED'),
      );
    }

    let ws;
    try {
      ws = this.wsFactory(url);
    } catch (error) {
      return Promise.reject(
        new AsrUpstreamError(`创建 WebSocket 失败：${error.message}`, 'ASR_WS_CREATE_FAILED'),
      );
    }
    this.ws = ws;

    const connectPromise = new Promise((resolve, reject) => {
      this._connectResolver = resolve;
      this._connectRejecter = reject;
    });

    const failConnect = (error) => {
      if (this._connectTimer) {
        clearTimeout(this._connectTimer);
        this._connectTimer = null;
      }
      if (this._connectRejecter) {
        const rejecter = this._connectRejecter;
        this._connectRejecter = null;
        this._connectResolver = null;
        rejecter(error);
      }
    };

    this._connectTimer = setTimeout(() => {
      const error = new AsrUpstreamError(
        `腾讯云 ASR 握手超时（${this.handshakeTimeoutMs}ms）`,
        'ASR_HANDSHAKE_TIMEOUT',
      );
      failConnect(error);
      this._emitError(error.code, error.message);
      this.close();
    }, this.handshakeTimeoutMs);
    this._connectTimer.unref?.();

    ws.on('message', (data, isBinary) => {
      this._handleRawMessage(data, isBinary, failConnect);
    });

    ws.on('error', (error) => {
      this._emitError('ASR_WS_ERROR', `WebSocket 错误：${error.message}`);
      failConnect(
        new AsrUpstreamError(`WebSocket 错误：${error.message}`, 'ASR_WS_ERROR'),
      );
    });

    ws.on('close', (code, reasonBuffer) => {
      this.closed = true;
      const reason = reasonBuffer ? reasonBuffer.toString() : '';
      if (!this.ready) {
        failConnect(
          new AsrUpstreamError(
            `腾讯云 ASR 连接在握手前关闭（code=${code}${reason ? `, ${reason}` : ''}）`,
            'ASR_CLOSED_BEFORE_READY',
          ),
        );
      }
      if (!this.ended) {
        this.ended = true;
        this._markDone({ reason: `upstream-closed:${code}` });
      }
      if (this._endResolver) {
        const resolve = this._endResolver;
        this._endResolver = null;
        resolve();
      }
    });

    return connectPromise;
  }

  /**
   * 写入 16k PCM16LE mono。未握手时排队；握手后按 6400 字节分片发送。
   * 返回 false 表示会话已结束。
   */
  write(pcm16Buffer) {
    if (!Buffer.isBuffer(pcm16Buffer)) {
      throw new TypeError('write 需要 Buffer');
    }
    if (this.ended || this.closed) return false;
    if (pcm16Buffer.length === 0) return true;

    if (!this.ready) {
      if (this._queuedBytes + pcm16Buffer.length > this.maxQueueBytes) {
        const error = new AsrUpstreamError(
          '握手前音频排队超过上限，已丢弃并关闭会话',
          'ASR_QUEUE_OVERFLOW',
        );
        this._emitError(error.code, error.message);
        this.close();
        return false;
      }
      const copy = Buffer.from(pcm16Buffer);
      this._queue.push(copy);
      this._queuedBytes += copy.length;
      return true;
    }

    this._sendAudio(pcm16Buffer);
    return true;
  }

  /** 通知云端音频结束，等待 final=1 或连接关闭。 */
  end() {
    if (this.ended || this.closed) return Promise.resolve();
    if (this._endPromise) return this._endPromise;
    this.endRequested = true;

    const promise = new Promise((resolve) => {
      this._endResolver = resolve;
      const timer = setTimeout(() => {
        this._endResolver = null;
        this._emitError('ASR_END_TIMEOUT', `等待腾讯云 final 超时（${this.endTimeoutMs}ms）`);
        this.close();
        resolve();
      }, this.endTimeoutMs);
      timer.unref?.();
      const originalResolve = this._endResolver;
      this._endResolver = () => {
        clearTimeout(timer);
        if (originalResolve) originalResolve();
      };
    });

    this._endPromise = promise;
    if (this.ready) this._sendEnd();
    return promise;
  }

  close() {
    this.closed = true;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === WS_OPEN)) {
      try {
        this.ws.close(1000, 'bridge-close');
      } catch {
        try {
          this.ws.terminate();
        } catch {
          // 忽略关闭异常
        }
      }
    }
  }

  _sendAudio(buffer) {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    for (let offset = 0; offset < buffer.length; offset += MAX_AUDIO_CHUNK_BYTES) {
      const end = Math.min(buffer.length, offset + MAX_AUDIO_CHUNK_BYTES);
      this.ws.send(buffer.subarray(offset, end));
    }
  }

  _sendEnd() {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify({ type: 'end' }));
  }

  _flushQueue() {
    if (!this.ready) return;
    const queued = this._queue;
    this._queue = [];
    this._queuedBytes = 0;
    for (const buffer of queued) {
      this._sendAudio(buffer);
    }
    if (this.endRequested) this._sendEnd();
  }

  _handleReady() {
    if (this.ready) return;
    this.ready = true;
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
    this.emit('ready', {
      voiceId: this.voiceId,
      engine: this.engineModelType,
      track: this.track,
      sessionId: this.sessionId,
      speakerDiarization: this.speakerDiarization,
    });
    if (this._connectResolver) {
      const resolve = this._connectResolver;
      this._connectResolver = null;
      this._connectRejecter = null;
      resolve(this);
    }
    this._flushQueue();
  }

  _handleRawMessage(data, isBinary, failConnect) {
    if (isBinary) {
      this._emitError('ASR_UNEXPECTED_BINARY', '腾讯云 ASR 返回了意外的二进制消息');
      return;
    }

    let message;
    try {
      message = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
    } catch (error) {
      this._emitError('ASR_BAD_JSON', `无法解析腾讯云消息：${error.message}`);
      return;
    }

    if (message.code !== undefined && message.code !== 0) {
      const error = new AsrUpstreamError(
        `腾讯云 ASR 错误 ${message.code}：${message.message || 'unknown'}`,
        `ASR_UPSTREAM_${message.code}`,
      );
      this._emitError(error.code, error.message);
      failConnect(error);
      this.ended = true;
      this._markDone({ reason: 'upstream-error' });
      this.close();
      return;
    }

    if (!this.ready) {
      this._handleReady();
    }

    if (message.final === 1) {
      this.ended = true;
      this._markDone({ reason: 'upstream-final' });
      return;
    }

    if (message.sentences) {
      this._handleSpeakerSentences(message.sentences);
      return;
    }

    if (message.result) {
      this._handleStandardResult(message.result);
    }
  }

  _handleStandardResult(result) {
    const text = String(result.voice_text_str ?? '').trim();
    if (!text) return;

    const isFinal = result.slice_type === 2;
    const key = result.index ?? `${result.start_time}-${result.end_time}`;
    const lastMap = isFinal ? this._lastFinal : this._lastInterim;
    if (lastMap.get(key) === text) return;
    lastMap.set(key, text);

    let speaker = 'unknown';
    if (this.track === 'A' || this.track === 'B') {
      speaker = this.track;
    } else if (result.speaker_id !== undefined) {
      speaker = normalizeSpeakerId(result.speaker_id);
    }

    this.emit(
      'event',
      makeEvent({
        type: isFinal ? 'final' : 'interim',
        track: this.track,
        text,
        startMs: result.start_time,
        endMs: result.end_time,
        speaker,
        confidence: null,
        final: isFinal,
        mock: false,
        engine: this.engineModelType,
        provider: 'tencent',
        sessionId: this.sessionId,
        index: result.index,
      }),
    );
  }

  _handleSpeakerSentences(sentences) {
    const list = Array.isArray(sentences) ? sentences : [sentences];
    for (const sentence of list) {
      if (!sentence) continue;
      const text = String(sentence.sentence ?? '').trim();
      if (!text) continue;

      const isFinal = sentence.sentence_type === 1;
      const key = sentence.sentence_id ?? `${sentence.start_time}-${sentence.end_time}`;
      const lastMap = isFinal ? this._lastFinal : this._lastInterim;
      if (lastMap.get(key) === text) continue;
      lastMap.set(key, text);

      this.emit(
        'event',
        makeEvent({
          type: isFinal ? 'final' : 'interim',
          track: this.track,
          text,
          startMs: sentence.start_time,
          endMs: sentence.end_time,
          speaker: normalizeSpeakerId(sentence.speaker_id),
          confidence: null,
          final: isFinal,
          mock: false,
          engine: this.engineModelType,
          provider: 'tencent',
          sessionId: this.sessionId,
          index: sentence.sentence_id,
        }),
      );
    }
  }

  _emitError(code, message) {
    if (this.listenerCount('error') === 0) return;
    this.emit(
      'error',
      makeErrorEvent({
        track: this.track,
        message,
        mock: false,
        code,
        provider: 'tencent',
        sessionId: this.sessionId,
        engine: this.engineModelType,
      }),
    );
  }

  _markDone(info) {
    if (this._doneEmitted) return;
    this._doneEmitted = true;
    this.emit('done', info);
    if (this._endResolver) {
      const resolve = this._endResolver;
      this._endResolver = null;
      resolve();
    }
  }
}
