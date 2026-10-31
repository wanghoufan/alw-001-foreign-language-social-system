/**
 * 双声道 PCM16LE 拆分 / 混音工具。
 *
 * 约定：
 * - PCM16 little-endian。
 * - 立体声按 L,R,L,R... 交织。
 * - A 轨 = 左声道，B 轨 = 右声道（与 Android PoC 的 A_LEFT / B_RIGHT 假设一致）。
 * - 混音默认取 L/R 等权平均，天然防削波；不把两路直接相加。
 */

export const TRACKS = Object.freeze(['A', 'B', 'mix']);

/** 规范化 track 参数；非法值抛错。 */
export function normalizeTrack(track) {
  const value = String(track ?? '').trim();
  const normalized = value.toLowerCase() === 'mix' ? 'mix' : value.toUpperCase();
  if (!TRACKS.includes(normalized)) {
    throw new RangeError(`track 必须是 A、B 或 mix，收到 ${track}`);
  }
  return normalized;
}

/** 校验 PCM 字节数能否被单个采样帧整除。 */
export function assertPcmFrames(pcm, channels) {
  if (!Buffer.isBuffer(pcm)) {
    throw new TypeError('PCM 数据必须是 Buffer');
  }
  if (channels !== 1 && channels !== 2) {
    throw new RangeError(`channels 必须是 1 或 2，收到 ${channels}`);
  }
  const frameBytes = 2 * channels;
  if (pcm.byteLength % frameBytes !== 0) {
    throw new RangeError(
      `PCM 字节数 ${pcm.byteLength} 不是 ${channels} 声道采样帧（${frameBytes} 字节）的整数倍`,
    );
  }
}

/** 立体声交织 PCM16LE -> { left, right } 两路 mono PCM16LE。 */
export function splitStereoPcm16(pcm) {
  assertPcmFrames(pcm, 2);
  const frames = pcm.byteLength / 4;
  const left = Buffer.allocUnsafe(frames * 2);
  const right = Buffer.allocUnsafe(frames * 2);

  for (let i = 0; i < frames; i += 1) {
    left.writeInt16LE(pcm.readInt16LE(i * 4), i * 2);
    right.writeInt16LE(pcm.readInt16LE(i * 4 + 2), i * 2);
  }

  return { left, right };
}

/**
 * 立体声 -> mono。默认 0.5*(L+R)，等价于等权平均并防削波。
 * 不提供直接相加模式，避免 +6dB 溢出。
 */
export function downmixStereoPcm16(pcm, options = {}) {
  assertPcmFrames(pcm, 2);
  const leftWeight = options.leftWeight ?? 0.5;
  const rightWeight = options.rightWeight ?? 0.5;
  if (leftWeight < 0 || rightWeight < 0) {
    throw new RangeError('混音权重不能为负数');
  }

  const frames = pcm.byteLength / 4;
  const mono = Buffer.allocUnsafe(frames * 2);

  for (let i = 0; i < frames; i += 1) {
    const left = pcm.readInt16LE(i * 4);
    const right = pcm.readInt16LE(i * 4 + 2);
    const mixed = Math.round(left * leftWeight + right * rightWeight);
    mono.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), i * 2);
  }

  return mono;
}

/**
 * 从输入 PCM 中取出目标轨道。
 * - 单声道：原样透传（手机端已按轨发送）。
 * - 双声道：A=左、B=右、mix=等权平均。
 */
export function extractTrackPcm16(pcm, channels, track) {
  assertPcmFrames(pcm, channels);
  const normalized = normalizeTrack(track);

  if (channels === 1) return Buffer.from(pcm);

  const { left, right } = splitStereoPcm16(pcm);
  if (normalized === 'A') return left;
  if (normalized === 'B') return right;
  return downmixStereoPcm16(pcm);
}

/** 测试/离线工具：把两路 mono PCM16LE 交织成立体声。 */
export function interleaveStereoPcm16(left, right) {
  assertPcmFrames(left, 1);
  assertPcmFrames(right, 1);
  if (left.byteLength !== right.byteLength) {
    throw new RangeError('左右声道字节数必须一致');
  }

  const frames = left.byteLength / 2;
  const stereo = Buffer.allocUnsafe(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    stereo.writeInt16LE(left.readInt16LE(i * 2), i * 4);
    stereo.writeInt16LE(right.readInt16LE(i * 2), i * 4 + 2);
  }
  return stereo;
}
