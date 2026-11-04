/**
 * P066 流式 ASR 客户端（透明 WS 中继）。
 *
 * 与 TencentRealtimeSession 保持同一事件接口：
 * - connect() → ready
 * - write(pcm16) / end()
 * - 'event' interim/final、'error'、'done'、'budget'
 *
 * 不在此处计算签名、不持有腾讯密钥；令牌只放握手头，不进 URL/日志。
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { makeEvent, makeErrorEvent } from './protocol.js';
import { normalizeTrack } from './split.js';

const WS_OPEN = 1;
const MAX_AUDIO_CHUNK_BYTES = 6400; // 16k PCM16 200ms
const DEFAULT_MAX_QUEUE_BYTES = 16000 * 2 * 30;
const DEFAULT_URL = 'ws://127.0.0.1:8078/api/asr/stream';

export function resolveP066Config(env = process.env) {
  const token = String(env.P066_ASR_TOKEN || '').trim();
  const url = String(env.P066_ASR_URL || '').trim() || DEFAULT_URL;
  if (!token) {
    throw new Error('P066_ASR_TOKEN 未配置：拒绝启动，避免静默降级到 mock 或直连腾讯。');
  }
  if (!/^wss?:\/\//i.test(url)) {
    throw new Error(`P066_ASR_URL 必须是 ws:// 或 wss://，收到 ${url}`);
  }
  return { url, token };
}

export class P066RealtimeSession extends EventEmitter {
  constructor(options = {}) {
    super();
    const config = options.url && options.token
      ? { url: options.url, token: options.token }
      : resolveP066Config(options.env || process.env);
    this.url = config.url;
    this.token = config.token;
    this.track = normalizeTrack(options.track ?? 'mix');
    this.engineModelType = options.engineModelType || '16k_zh_en_speaker_2.0';
    this.sessionId = options.sessionId || randomUUID();
    this.wsFactory = options.wsFactory || ((url, opts) => new WebSocket(url, opts));
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
    this.endTimeoutMs = options.endTimeoutMs ?? 10_000;
    this.maxQueueBytes = options.maxQueueBytes ?? DEFAULT_MAX_QUEUE_BYTES;

    this.ws = null;
    this.ready = false;
    this.ended = false;
    this.closed = false;
    this._queue = [];
    this._queuedBytes = 0;
    this._doneEmitted = false;
    this._connectTimer = null;
    this._endTimer = null;
    this._connectResolve = null;
    this._connectReject = null;
  }

  buildUrl() {
    const url = new URL(this.url);
    url.searchParams.set('engine', this.engineModelType);
    url.searchParams.set('rate', '16000');
    url.searchParams.set('channels', '1');
    url.searchParams.set('track', this.track);
    url.searchParams.set('sessionId', this.sessionId);
    return url.toString();
  }

  connect() {
    if (this.ready && this.ws && this.ws.readyState === WS_OPEN) return Promise.resolve(this);
    if (this.closed) return Promise.reject(new Error('P066 会话已关闭'));

    const url = this.buildUrl();
    const connectPromise = new Promise((resolve, reject) => {
      this._connectResolve = resolve;
      this._connectReject = reject;
    });

    let ws;
    try {
      ws = this.wsFactory(url, {
        headers: {'x-asr-token': this.token},
        handshakeTimeout: this.handshakeTimeoutMs,
      });
    } catch (error) {
      return Promise.reject(new Error(`创建 P066 WebSocket 失败：${error.message}`));
    }
    this.ws = ws;

    const fail = (message, code) => {
      this._clearConnectTimer();
      if (this._connectReject) {
        const reject = this._connectReject;
        this._connectReject = null;
        this._connectResolve = null;
        reject(new Error(message));
      }
      this._emitError(code || 'ASR_UPSTREAM_ERROR', message);
    };

    this._connectTimer = setTimeout(() => {
      fail(`P066 流式 ASR 握手超时（${this.handshakeTimeoutMs}ms）`, 'ASR_HANDSHAKE_TIMEOUT');
      this.close();
    }, this.handshakeTimeoutMs);
    this._connectTimer.unref?.();

    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      this._handleMessage(String(data), fail);
    });
    ws.on('error', (error) => fail(`P066 WebSocket 错误：${error.message}`, 'ASR_WS_ERROR'));
    ws.on('close', (code, reasonBuffer) => {
      this.closed = true;
      const reason = reasonBuffer ? reasonBuffer.toString() : '';
      if (!this.ready) {
        fail(`P066 连接在握手前关闭（code=${code}${reason ? `, ${reason}` : ''}）`, 'ASR_CLOSED_BEFORE_READY');
      }
      if (!this.ended) {
        this.ended = true;
        this._markDone({reason: `p066-closed:${code}`});
      }
    });

    return connectPromise;
  }

  _handleMessage(text, fail) {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      fail('P066 返回了非 JSON 消息', 'ASR_BAD_UPSTREAM_JSON');
      return;
    }
    const type = String(message?.type || '');
    if (type === 'session') {
      const status = String(message.status || '');
      if (status === 'ready' || status === 'connecting') {
        if (!this.ready) {
          this.ready = true;
          this._clearConnectTimer();
          if (this._connectResolve) {
            const resolve = this._connectResolve;
            this._connectResolve = null;
            this._connectReject = null;
            resolve(this);
          }
          this.emit('ready', {
            engine: message.engine || this.engineModelType,
            track: message.track || this.track,
            sessionId: message.sessionId || this.sessionId,
            provider: 'p066',
          });
          this._flushQueue();
        }
      } else if (status === 'end' || status === 'ended') {
        this.ended = true;
        this._markDone({
          reason: 'p066-end',
          seconds: message.seconds,
          costCny: message.costCny,
        });
      }
      return;
    }
    if (type === 'interim' || type === 'final') {
      const final = type === 'final' || message.final === true;
      const speaker = String(message.speaker || 'unknown');
      this.emit('event', makeEvent({
        type: final ? 'final' : 'interim',
        track: this.track,
        text: message.text,
        startMs: message.startMs,
        endMs: message.endMs,
        speaker: speaker === 'spk_-1' ? 'unknown' : speaker,
        final,
        mock: false,
        provider: 'p066',
        engine: this.engineModelType,
      }));
      return;
    }
    if (type === 'budget') {
      this.emit('budget', {
        remainingCny: message.remainingCny,
        spentCny: message.spentCny,
        costCny: message.costCny,
        seconds: message.seconds,
      });
      return;
    }
    if (type === 'error') {
      this._emitError(message.code || 'ASR_UPSTREAM_ERROR', message.message || 'P066 ASR 上游错误', {
        upstreamCode: message.code,
      });
      this.ended = true;
      this._markDone({reason: `p066-error:${message.code || 'unknown'}`});
      return;
    }
  }

  write(pcm16Buffer) {
    if (!Buffer.isBuffer(pcm16Buffer)) throw new TypeError('write 需要 Buffer');
    if (this.ended || this.closed) return false;
    if (pcm16Buffer.length === 0) return true;
    if (!this.ready) {
      if (this._queuedBytes + pcm16Buffer.length > this.maxQueueBytes) {
        this._emitError('ASR_QUEUE_OVERFLOW', 'P066 握手前音频排队超过上限');
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

  _flushQueue() {
    const queue = this._queue;
    this._queue = [];
    this._queuedBytes = 0;
    for (const chunk of queue) this._sendAudio(chunk);
  }

  _sendAudio(buffer) {
    if (!this.ws || this.ws.readyState !== WS_OPEN) return;
    for (let offset = 0; offset < buffer.length; offset += MAX_AUDIO_CHUNK_BYTES) {
      const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + MAX_AUDIO_CHUNK_BYTES));
      try {
        this.ws.send(chunk, {binary: true});
      } catch {
        return;
      }
    }
  }

  end() {
    if (this.ended || this.closed) return Promise.resolve();
    return new Promise((resolve) => {
      const finish = () => {
        if (this._endTimer) clearTimeout(this._endTimer);
        this._endTimer = null;
        resolve();
      };
      this._endTimer = setTimeout(() => {
        this._emitError('ASR_END_TIMEOUT', `等待 P066 结束事件超时（${this.endTimeoutMs}ms）`);
        this.close();
        finish();
      }, this.endTimeoutMs);
      this._endTimer.unref?.();
      this.once('done', finish);
      if (this.ws && this.ws.readyState === WS_OPEN) {
        try {
          this.ws.send(JSON.stringify({type: 'end'}));
        } catch {
          this.close();
          finish();
        }
      } else {
        this.close();
        finish();
      }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.ended = true;
    this._clearConnectTimer();
    if (this._endTimer) clearTimeout(this._endTimer);
    this._endTimer = null;
    if (this.ws) {
      try { this.ws.close(); } catch {}
    }
    this._markDone({reason: 'client-close'});
  }

  _markDone(info) {
    if (this._doneEmitted) return;
    this._doneEmitted = true;
    this.emit('done', info || {});
  }

  _emitError(code, message, extra = {}) {
    if (this.listenerCount('error') === 0) return;
    this.emit('error', makeErrorEvent({
      track: this.track,
      message,
      mock: false,
      code,
      provider: 'p066',
      ...extra,
    }));
  }

  _clearConnectTimer() {
    if (this._connectTimer) {
      clearTimeout(this._connectTimer);
      this._connectTimer = null;
    }
  }
}