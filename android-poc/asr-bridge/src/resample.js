/**
 * PCM16LE 重采样与格式转换。
 *
 * 设计要点：
 * - 使用窗函数 sinc 低通（Blackman 窗）做带限重采样，而不是丢点/线性插值。
 * - 截止频率取 min(输入, 输出) 奈奎斯特的 94%，保证 48k -> 16k 时
 *   10kHz 等高于是输出奈奎斯特的频率被显著衰减。
 * - StreamingResampler 保留跨块历史与输出相位，适合 WebSocket 连续音频流。
 */

const DEFAULT_TAPS = 96;
const DEFAULT_CUTOFF_RATIO = 0.94;

function assertPositiveNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} 必须是正数，收到 ${value}`);
  }
}

/** PCM16LE Buffer -> [-1, 1) Float32Array。字节数必须为偶数。 */
export function pcm16leToFloat32(pcm) {
  if (!Buffer.isBuffer(pcm)) {
    throw new TypeError('pcm16leToFloat32 需要 Buffer');
  }
  if (pcm.byteLength % 2 !== 0) {
    throw new RangeError(`PCM16LE 字节数必须为偶数，收到 ${pcm.byteLength}`);
  }
  const sampleCount = pcm.byteLength / 2;
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    out[i] = view.getInt16(i * 2, true) / 32768;
  }
  return out;
}

/** [-1, 1] Float32Array -> PCM16LE Buffer，超出范围会削波。 */
export function float32ToPcm16le(samples) {
  const out = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  return out;
}

/** 拼接多个 Float32Array。 */
export function concatFloat32(chunks) {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * 流式窗函数 sinc 重采样器。
 *
 * push() 可接收任意长度的 mono Float32 块；返回当前已能确定的输出样本。
 * flush() 用零填充右侧上下文，输出剩余样本。
 */
export class StreamingResampler {
  constructor(inputRate, outputRate, options = {}) {
    assertPositiveNumber(inputRate, 'inputRate');
    assertPositiveNumber(outputRate, 'outputRate');

    const taps = options.taps ?? DEFAULT_TAPS;
    if (!Number.isInteger(taps) || taps < 16 || taps % 2 !== 0) {
      throw new RangeError('taps 必须是 >= 16 的偶数');
    }

    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.ratio = outputRate / inputRate;
    this.taps = taps;
    this.half = taps / 2;

    const cutoffRatio = options.cutoffRatio ?? DEFAULT_CUTOFF_RATIO;
    if (!(cutoffRatio > 0 && cutoffRatio <= 1)) {
      throw new RangeError('cutoffRatio 必须在 (0, 1] 内');
    }
    // 归一化到输入采样率的 cycles/sample。
    this.cutoffHz = Math.min(inputRate, outputRate) * 0.5 * cutoffRatio;
    this.fc = this.cutoffHz / inputRate;

    this.buffer = new Float32Array(0);
    this.bufferStart = 0; // buffer[0] 对应的绝对输入样本下标
    this.totalInputSamples = 0;
    this.nextOutputIndex = 0;
  }

  /** 输入一块 mono 音频，返回已经可以确定的输出。 */
  push(input) {
    if (!(input instanceof Float32Array) && !Array.isArray(input)) {
      throw new TypeError('push 需要 Float32Array 或 number[]');
    }
    if (input.length === 0) return new Float32Array(0);

    // 同采样率直接透传，避免无意义的滤波。
    if (this.inputRate === this.outputRate) {
      this.totalInputSamples += input.length;
      return Float32Array.from(input);
    }

    const merged = new Float32Array(this.buffer.length + input.length);
    merged.set(this.buffer, 0);
    merged.set(input, this.buffer.length);
    this.buffer = merged;
    this.totalInputSamples += input.length;

    return this._process(false);
  }

  /** 通知输入结束，输出剩余样本（右侧以 0 补齐）。 */
  flush() {
    if (this.inputRate === this.outputRate) return new Float32Array(0);
    return this._process(true);
  }

  _process(final) {
    const expectedOutput = Math.floor(this.totalInputSamples * this.ratio);
    const limit = final ? expectedOutput : Number.POSITIVE_INFINITY;
    const output = [];

    while (this.nextOutputIndex < limit) {
      const position = this.nextOutputIndex / this.ratio;
      const center = Math.floor(position);
      const frac = position - center;
      const left = center - this.half + 1;
      const right = center + this.half;

      if (!final && right >= this.bufferStart + this.buffer.length) {
        break; // 右侧上下文还没到
      }

      let sum = 0;
      let weightSum = 0;

      for (let k = left; k <= right; k += 1) {
        const bufferIndex = k - this.bufferStart;
        const sample =
          bufferIndex >= 0 && bufferIndex < this.buffer.length
            ? this.buffer[bufferIndex]
            : 0;

        const x = k - position;
        const normalized = x / this.half;
        if (normalized <= -1 || normalized >= 1) continue;

        // Blackman 窗，降低旁瓣，提升抗混叠阻带衰减。
        const window =
          0.42 +
          0.5 * Math.cos(Math.PI * normalized) +
          0.08 * Math.cos(2 * Math.PI * normalized);

        const sincArg = 2 * this.fc * x;
        const sinc =
          sincArg === 0
            ? 1
            : Math.sin(Math.PI * sincArg) / (Math.PI * sincArg);
        const coefficient = 2 * this.fc * sinc * window;

        sum += sample * coefficient;
        weightSum += coefficient;
      }

      // 用 DC 增益归一化，补偿有限长窗与分数相位造成的微小起伏。
      output.push(weightSum !== 0 ? sum / weightSum : 0);
      this.nextOutputIndex += 1;
    }

    this._trimBuffer();

    return Float32Array.from(output);
  }

  _trimBuffer() {
    if (this.buffer.length === 0 || this.nextOutputIndex === 0) return;

    const center = Math.floor(this.nextOutputIndex / this.ratio);
    const keepFrom = Math.max(0, center - this.half);
    if (keepFrom <= this.bufferStart) return;

    const drop = Math.min(this.buffer.length, keepFrom - this.bufferStart);
    if (drop <= 0) return;

    this.buffer = this.buffer.subarray(drop);
    this.bufferStart += drop;
  }
}

/** 一次性重采样 PCM16LE mono。 */
export function resamplePcm16(pcm, inputRate, outputRate) {
  if (!Buffer.isBuffer(pcm)) {
    throw new TypeError('resamplePcm16 需要 Buffer');
  }
  if (inputRate === outputRate) return Buffer.from(pcm);
  const input = pcm16leToFloat32(pcm);
  const resampler = new StreamingResampler(inputRate, outputRate);
  const output = concatFloat32([resampler.push(input), resampler.flush()]);
  return float32ToPcm16le(output);
}

/** 一次性重采样 Float32 mono，主要供测试使用。 */
export function resampleFloat32(samples, inputRate, outputRate) {
  const resampler = new StreamingResampler(inputRate, outputRate);
  return concatFloat32([resampler.push(samples), resampler.flush()]);
}
