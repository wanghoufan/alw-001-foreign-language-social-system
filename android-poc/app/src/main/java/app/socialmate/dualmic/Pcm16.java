package app.socialmate.dualmic;

/**
 * PCM16 LE 音频转换：手机直连腾讯 ASR 需要 16k / mono。
 *
 * AudioRecord 可能是 48k/44.1k、单声道或立体声；这里统一：
 * 1. 立体声取左右平均；
 * 2. 线性插值重采样到 16000 Hz；
 * 3. 输出 PCM16 LE。
 *
 * 只做直连路径，不改变 Mac 中继的原始帧。
 */
final class Pcm16 {
    private Pcm16() {}

    static byte[] to16kMono(byte[] pcm, int sampleRate, int channels) {
        if (pcm == null || pcm.length < 2) return new byte[0];
        int frameBytes = Math.max(1, channels) * 2;
        int frames = pcm.length / frameBytes;
        if (frames == 0) return new byte[0];
        short[] mono = new short[frames];
        for (int i = 0; i < frames; i++) {
            int base = i * frameBytes;
            int sum = 0;
            for (int c = 0; c < channels; c++) {
                int lo = pcm[base + c * 2] & 0xFF;
                int hi = pcm[base + c * 2 + 1];
                sum += (short) ((hi << 8) | lo);
            }
            mono[i] = (short) (sum / channels);
        }
        if (sampleRate == 16000) return toBytes(mono);
        if (sampleRate <= 0) return new byte[0];
        int outCount = (int) Math.round(frames * 16000.0 / sampleRate);
        if (outCount <= 0) return new byte[0];
        short[] out = new short[outCount];
        double step = (double) sampleRate / 16000.0;
        for (int i = 0; i < outCount; i++) {
            double pos = i * step;
            int i0 = (int) Math.floor(pos);
            int i1 = Math.min(i0 + 1, frames - 1);
            double frac = pos - i0;
            double value = mono[Math.min(i0, frames - 1)] * (1 - frac) + mono[i1] * frac;
            out[i] = (short) Math.max(Short.MIN_VALUE, Math.min(Short.MAX_VALUE, Math.round(value)));
        }
        return toBytes(out);
    }

    private static byte[] toBytes(short[] samples) {
        byte[] out = new byte[samples.length * 2];
        for (int i = 0; i < samples.length; i++) {
            out[i * 2] = (byte) (samples[i] & 0xFF);
            out[i * 2 + 1] = (byte) ((samples[i] >> 8) & 0xFF);
        }
        return out;
    }
}