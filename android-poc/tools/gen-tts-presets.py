#!/usr/bin/env python3
"""生成 FakeTtsAdapter 用的 res/raw 预置音频（固定公式、可复现、不是人声）。

诚实声明：这两段是纯音（不是神经 TTS、不是任何厂商试听样音），只用于验证
「请求 → 缓存 → 播放 → 循环 → 变速」链路。时长故意做得可测量（900ms / 1250ms），
以便用 0.75x 与 1.0x 的实际播放时长差证明 PlaybackParams 生效。
"""
import math
import struct
import sys
from pathlib import Path

SAMPLE_RATE = 16000
BITS = 16
CHANNELS = 1

PRESETS = [
    # 文件名, 频率 Hz, 时长 ms
    ("tts_preset_cn.wav", 660.0, 900),
    ("tts_preset_en.wav", 440.0, 1250),
]

OUT_DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(
    "app/src/main/res/raw")


def build(freq, duration_ms):
    samples = int(SAMPLE_RATE * duration_ms / 1000)
    data = bytearray()
    fade = max(1, int(SAMPLE_RATE * 0.02))
    for i in range(samples):
        envelope = min(1.0, i / fade, (samples - i) / fade)
        value = math.sin(2 * math.pi * freq * i / SAMPLE_RATE) * 0.28 * envelope
        data += struct.pack("<h", int(round(value * 32767)))
    header = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVE"
    header += b"fmt " + struct.pack("<IHHIIHH", 16, 1, CHANNELS, SAMPLE_RATE,
                                    SAMPLE_RATE * CHANNELS * BITS // 8,
                                    CHANNELS * BITS // 8, BITS)
    header += b"data" + struct.pack("<I", len(data))
    return bytes(header) + bytes(data)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, freq, ms in PRESETS:
        payload = build(freq, ms)
        target = OUT_DIR / name
        target.write_bytes(payload)
        print(f"{target} {len(payload)} bytes {ms}ms {freq}Hz")


if __name__ == "__main__":
    main()
