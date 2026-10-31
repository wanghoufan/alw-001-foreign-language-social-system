/**
 * 测试工具：合成正弦、Goertzel 幅度、RMS、WebSocket 事件等待。
 * 仅用于 node:test，不进入生产路径。
 */

import { pcm16leToFloat32 } from '../src/resample.js';

export function sineFloat32(frequency, sampleRate, durationMs, amplitude = 0.5) {
  const sampleCount = Math.round((sampleRate * durationMs) / 1000);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

export function monoPcm16(frequency, sampleRate, durationMs, amplitude = 0.5) {
  const samples = sineFloat32(frequency, sampleRate, durationMs, amplitude);
  const pcm = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    pcm.writeInt16LE(Math.round(samples[i] * 32767), i * 2);
  }
  return pcm;
}

export function silencePcm16(sampleRate, durationMs) {
  return Buffer.alloc(Math.round((sampleRate * durationMs * 2) / 1000));
}

/**
 * 生成 L/R 交织立体声 PCM16LE。
 * freq 为 null 时该声道静音。
 */
export function stereoPcm16({
  sampleRate,
  durationMs,
  leftFreq = null,
  rightFreq = null,
  leftAmplitude = 0.5,
  rightAmplitude = 0.5,
}) {
  const sampleCount = Math.round((sampleRate * durationMs) / 1000);
  const out = Buffer.allocUnsafe(sampleCount * 4);
  for (let i = 0; i < sampleCount; i += 1) {
    const left = leftFreq
      ? leftAmplitude * Math.sin((2 * Math.PI * leftFreq * i) / sampleRate)
      : 0;
    const right = rightFreq
      ? rightAmplitude * Math.sin((2 * Math.PI * rightFreq * i) / sampleRate)
      : 0;
    out.writeInt16LE(Math.round(left * 32767), i * 4);
    out.writeInt16LE(Math.round(right * 32767), i * 4 + 2);
  }
  return out;
}

/** 拼接 PCM16LE Buffer 列表。 */
export function concatPcm(chunks) {
  return Buffer.concat(chunks);
}

export function toFloat(samples) {
  return Buffer.isBuffer(samples) ? pcm16leToFloat32(samples) : samples;
}

/** Goertzel 单频幅度；对整数周期正弦返回接近峰值幅度。 */
export function goertzelMagnitude(samples, sampleRate, frequency) {
  const data = toFloat(samples);
  if (data.length === 0) return 0;
  const omega = (2 * Math.PI * frequency) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < data.length; i += 1) {
    const s0 = data[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const real = s1 - s2 * Math.cos(omega);
  const imag = s2 * Math.sin(omega);
  return (2 * Math.sqrt(real * real + imag * imag)) / data.length;
}

export function rms(samples) {
  const data = toFloat(samples);
  if (data.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

/** 过零率估算频率（Hz）。 */
export function zeroCrossingFrequency(samples, sampleRate) {
  const data = toFloat(samples);
  if (data.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < data.length; i += 1) {
    if ((data[i - 1] < 0 && data[i] >= 0) || (data[i - 1] >= 0 && data[i] < 0)) {
      crossings += 1;
    }
  }
  return (crossings / 2) * (sampleRate / data.length);
}

export const silentLogger = {
  info() {},
  warn() {},
  error() {},
};

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 从已收集的事件数组中等待满足条件的事件。 */
export async function waitForEvent(events, predicate, timeoutMs = 3000, intervalMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = events.find(predicate);
    if (found) return found;
    await delay(intervalMs);
  }
  throw new Error(`等待事件超时（${timeoutMs}ms），已收到：${JSON.stringify(events)}`);
}

export function closeWebSocket(ws, timeoutMs = 2000) {
  if (ws.readyState === 3) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // 忽略
      }
      resolve();
    }, timeoutMs);
    ws.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      ws.close();
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}
