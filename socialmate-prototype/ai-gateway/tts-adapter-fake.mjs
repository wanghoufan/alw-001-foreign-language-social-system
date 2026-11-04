/**
 * N05 TTS · fake 适配器（默认，无需 Key、绝不联网）。
 *
 * 用途：在没有任何厂商 Key 的情况下，把「朗读协议」跑通并让真机/浏览器能播放真实音频字节。
 * 做法：本地预置音频 = 本模块用固定公式生成的一段单声道 PCM WAV，
 *       第一次使用时物化到 SocialMate-Data/TtsCache/preset/<voiceId>.wav（0600），
 *       之后每次合成都是「读这个本地预置文件」，不请求任何网络。
 *
 * 诚实声明：这段音频不是人声、不是神经 TTS、也不是任何厂商的试听样音，
 * 只用来验证协议/缓存/校验/播放链路。因此结果里必然带 FAKE_PRESET_AUDIO 警告，
 * UI 不得把它当成「音质通过」。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const FAKE_MODEL_VERSION = "fake-preset-v1";
export const FAKE_DURATION_MS = 600;
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS = 16;

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function voiceSeed(voiceId) {
  return crypto.createHash("sha256").update(String(voiceId)).digest();
}

/** 固定公式生成 WAV：同一 voiceId 永远得到同一份字节（可复现、可校验 sha）。 */
function buildWav(voiceId) {
  const seed = voiceSeed(voiceId);
  const freq = 220 + (seed[0] % 10) * 30; // 220–490Hz，只为区分声线，不追求音质
  const samples = Math.round(SAMPLE_RATE * (FAKE_DURATION_MS / 1000));
  const data = Buffer.alloc(samples * CHANNELS * (BITS / 8));
  const fade = Math.max(1, Math.round(SAMPLE_RATE * 0.02));
  for (let i = 0; i < samples; i += 1) {
    const envelope = Math.min(1, i / fade, (samples - i) / fade);
    const value = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.12 * envelope;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS / 8), 32);
  header.writeUInt16LE(BITS, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function createFakeAdapter({cache} = {}) {
  if (!cache || typeof cache.presetDir !== "function") {
    throw new Error("fake 适配器需要缓存实例来存放本地预置音频");
  }

  async function presetFile(voiceId) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(String(voiceId || ""))) {
      throw fail(400, "INVALID_VOICE_ID", "voiceProfileId 不合法");
    }
    const dir = cache.presetDir();
    await fs.mkdir(dir, {recursive: true, mode: 0o700});
    const file = path.join(dir, `${voiceId}.wav`);
    try {
      await fs.stat(file);
    } catch {
      const temp = `${file}.${process.pid}.tmp`;
      await fs.writeFile(temp, buildWav(voiceId), {mode: 0o600});
      await fs.rename(temp, file);
      await fs.chmod(file, 0o600).catch(() => {});
    }
    return file;
  }

  return {
    providerId: "fake",
    network: "none",
    /** 只读本地预置文件；其中不含任何厂商凭据，也不存在任何请求出口。 */
    async speak({voiceId}) {
      const file = await presetFile(voiceId);
      const bytes = await fs.readFile(file);
      if (bytes.length <= 44) throw fail(500, "FAKE_PRESET_BROKEN", "本地预置音频损坏，请删除 TtsCache/preset 后重试");
      return {
        bytes,
        mimeType: "audio/wav",
        durationMs: FAKE_DURATION_MS,
        voiceId,
        modelVersion: FAKE_MODEL_VERSION,
        warnings: ["FAKE_PRESET_AUDIO", "NOT_A_REAL_PROVIDER"],
      };
    },
  };
}
