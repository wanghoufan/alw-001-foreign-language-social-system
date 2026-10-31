/**
 * 本地 mock ASR：仅用于没有腾讯云密钥时跑通协议、重采样、分轨和端到端链路。
 *
 * 它不会识别任何真实语音，只按音频能量做“有人说话”的分段，输出形如
 * “[mock] speech detected 640 ms”的占位文本。
 *
 * 每条事件都带 mock:true；服务端日志会明确打印 MOCK MODE。
 * 绝不能把这里的输出当作真实腾讯云 ASR 结果。
 */

import { makeEvent } from './protocol.js';
import { pcm16leToFloat32 } from './resample.js';
import { normalizeTrack } from './split.js';

const SAMPLE_RATE = 16_000;
const FRAME_MS = 20;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000; // 320

export class MockAsrSession {
  constructor(options = {}) {
    this.track = normalizeTrack(options.track ?? 'mix');
    this.sessionId = options.sessionId || null;
    this.onEvent = options.onEvent || (() => {});
    this.speaker = this.track === 'mix' ? 'spk_0' : this.track;

    this.threshold = options.threshold ?? 0.008;
    this.startFrames = options.startFrames ?? 2;
    this.endSilenceMs = options.endSilenceMs ?? 400;
    this.minSpeechMs = options.minSpeechMs ?? 120;
    this.maxSpeechMs = options.maxSpeechMs ?? 10_000;
    this.interimIntervalMs = options.interimIntervalMs ?? 300;

    this.pending = new Float32Array(0);
    this.totalSamples = 0;

    this.active = false;
    this.startMs = 0;
    this.lastVoiceEndMs = 0;
    this.lastInterimMs = 0;
    this.silenceMs = 0;
    this.voiceRun = 0;
    this.voiceRunStartMs = 0;

    this.interimCount = 0;
    this.finalCount = 0;
  }

  /** 输入 16k PCM16LE mono。 */
  write(pcm16Buffer) {
    if (!Buffer.isBuffer(pcm16Buffer) || pcm16Buffer.length === 0) return;

    const samples = pcm16leToFloat32(pcm16Buffer);
    const merged = new Float32Array(this.pending.length + samples.length);
    merged.set(this.pending, 0);
    merged.set(samples, this.pending.length);
    this.pending = merged;

    while (this.pending.length >= FRAME_SAMPLES) {
      const frame = this.pending.subarray(0, FRAME_SAMPLES);
      this._processFrame(frame);
      this.pending = this.pending.subarray(FRAME_SAMPLES);
    }
  }

  /** 输入结束：处理残余样本，并把正在进行的语音收尾。 */
  end() {
    if (this.pending.length > 0) {
      this._processFrame(this.pending);
      this.pending = new Float32Array(0);
    }
    if (this.active) {
      this._finalize(Math.max(this.lastVoiceEndMs, this.startMs));
    }
  }

  _processFrame(frame) {
    if (frame.length === 0) return;

    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      sum += frame[i] * frame[i];
    }
    const rms = Math.sqrt(sum / frame.length);

    const frameStartMs = Math.round((this.totalSamples * 1000) / SAMPLE_RATE);
    this.totalSamples += frame.length;
    const frameEndMs = Math.round((this.totalSamples * 1000) / SAMPLE_RATE);

    if (!this.active) {
      if (rms >= this.threshold) {
        if (this.voiceRun === 0) this.voiceRunStartMs = frameStartMs;
        this.voiceRun += 1;
        if (this.voiceRun >= this.startFrames) {
          this.active = true;
          this.startMs = this.voiceRunStartMs;
          this.lastVoiceEndMs = frameEndMs;
          this.lastInterimMs = frameEndMs;
          this.silenceMs = 0;
          this._emitInterim(frameEndMs);
        }
      } else {
        this.voiceRun = 0;
      }
      return;
    }

    if (rms >= this.threshold) {
      this.lastVoiceEndMs = frameEndMs;
      this.silenceMs = 0;
    } else {
      this.silenceMs += (frame.length * 1000) / SAMPLE_RATE;
    }

    if (frameEndMs - this.startMs >= this.maxSpeechMs) {
      this._finalize(frameEndMs);
      return;
    }
    if (this.silenceMs >= this.endSilenceMs) {
      this._finalize(this.lastVoiceEndMs);
      return;
    }
    if (frameEndMs - this.lastInterimMs >= this.interimIntervalMs) {
      this._emitInterim(frameEndMs);
    }
  }

  _emitInterim(endMs) {
    const duration = Math.max(0, Math.round(endMs - this.startMs));
    this.lastInterimMs = endMs;
    this.interimCount += 1;
    this.onEvent(
      makeEvent({
        type: 'interim',
        track: this.track,
        text: `[mock] speech detected ${duration} ms`,
        startMs: this.startMs,
        endMs,
        speaker: this.speaker,
        confidence: null,
        final: false,
        mock: true,
        provider: 'mock',
        engine: 'mock',
        sessionId: this.sessionId,
      }),
    );
  }

  _finalize(endMs) {
    const duration = Math.max(0, Math.round(endMs - this.startMs));
    if (duration < this.minSpeechMs) {
      this._reset();
      return;
    }

    this.finalCount += 1;
    this.onEvent(
      makeEvent({
        type: 'final',
        track: this.track,
        text: `[mock] speech detected ${duration} ms`,
        startMs: this.startMs,
        endMs,
        speaker: this.speaker,
        confidence: null,
        final: true,
        mock: true,
        provider: 'mock',
        engine: 'mock',
        sessionId: this.sessionId,
      }),
    );
    this._reset();
  }

  _reset() {
    this.active = false;
    this.startMs = 0;
    this.lastVoiceEndMs = 0;
    this.lastInterimMs = 0;
    this.silenceMs = 0;
    this.voiceRun = 0;
    this.voiceRunStartMs = 0;
  }
}
