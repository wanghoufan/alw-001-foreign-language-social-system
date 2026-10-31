import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StreamingResampler,
  pcm16leToFloat32,
  resamplePcm16,
} from '../src/resample.js';
import {
  goertzelMagnitude,
  monoPcm16,
  rms,
  zeroCrossingFrequency,
} from '../test-support/helpers.js';

test('48k -> 16k：1kHz 正弦长度、频率、幅度正确', () => {
  const input = monoPcm16(1000, 48_000, 1000, 0.5);
  const output = resamplePcm16(input, 48_000, 16_000);

  assert.equal(output.byteLength, 16_000 * 2, '输出应为 16000 个采样（1 秒 @16k）');

  const outputFloat = pcm16leToFloat32(output);
  const inputFloat = pcm16leToFloat32(input);

  assert.ok(
    Math.abs(zeroCrossingFrequency(outputFloat, 16_000) - 1000) < 10,
    `过零率应接近 1kHz，实际 ${zeroCrossingFrequency(outputFloat, 16_000).toFixed(1)}Hz`,
  );

  const magnitude = goertzelMagnitude(outputFloat, 16_000, 1000);
  assert.ok(
    Math.abs(magnitude - 0.5) < 0.01,
    `1kHz 幅度应接近 0.5，实际 ${magnitude.toFixed(4)}`,
  );

  const ratio = rms(outputFloat) / rms(inputFloat);
  assert.ok(Math.abs(ratio - 1) < 0.03, `RMS 比例应接近 1，实际 ${ratio.toFixed(4)}`);
});

test('44.1k -> 16k：1kHz 正弦长度、频率、幅度正确', () => {
  const input = monoPcm16(1000, 44_100, 1000, 0.5);
  const output = resamplePcm16(input, 44_100, 16_000);

  assert.equal(output.byteLength, 16_000 * 2);

  const outputFloat = pcm16leToFloat32(output);
  assert.ok(
    Math.abs(zeroCrossingFrequency(outputFloat, 16_000) - 1000) < 10,
    `过零率应接近 1kHz，实际 ${zeroCrossingFrequency(outputFloat, 16_000).toFixed(1)}Hz`,
  );

  const magnitude = goertzelMagnitude(outputFloat, 16_000, 1000);
  assert.ok(
    Math.abs(magnitude - 0.5) < 0.01,
    `1kHz 幅度应接近 0.5，实际 ${magnitude.toFixed(4)}`,
  );
});

test('抗混叠：48k 的 10kHz 正弦经过 48k->16k 后被显著衰减', () => {
  const input = monoPcm16(10_000, 48_000, 1000, 0.5);
  const output = resamplePcm16(input, 48_000, 16_000);
  const outputFloat = pcm16leToFloat32(output);

  // 对照：如果只是每 3 个点丢 2 个，10kHz 会原样混叠到 6kHz。
  const naive = Buffer.alloc(16_000 * 2);
  for (let i = 0; i < 16_000; i += 1) {
    naive.writeInt16LE(input.readInt16LE(i * 3 * 2), i * 2);
  }
  const naiveRms = rms(naive);
  assert.ok(naiveRms > 0.3, `对照的简单丢点应保留很强能量，实际 ${naiveRms.toFixed(4)}`);

  const outputRms = rms(outputFloat);
  assert.ok(
    outputRms < 0.02,
    `抗混叠后能量应显著衰减（<0.02），实际 ${outputRms.toFixed(6)}`,
  );

  const aliasMagnitude = goertzelMagnitude(outputFloat, 16_000, 6000);
  assert.ok(
    aliasMagnitude < 0.02,
    `10kHz 混叠到 6kHz 的幅度应 <0.02，实际 ${aliasMagnitude.toFixed(6)}`,
  );
});

test('流式重采样：任意分块与一次性结果一致', () => {
  const input = monoPcm16(1000, 48_000, 500, 0.5);
  const inputFloat = pcm16leToFloat32(input);

  const oneShot = resamplePcm16(input, 48_000, 16_000);
  const oneShotFloat = pcm16leToFloat32(oneShot);

  const resampler = new StreamingResampler(48_000, 16_000);
  const chunks = [];
  // 137 不是 3 的倍数，专门测试跨块相位连续性。
  for (let offset = 0; offset < inputFloat.length; offset += 137) {
    chunks.push(resampler.push(inputFloat.subarray(offset, offset + 137)));
  }
  chunks.push(resampler.flush());

  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const streamed = new Float32Array(total);
  let writeOffset = 0;
  for (const chunk of chunks) {
    streamed.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  assert.equal(streamed.length, 8000);
  assert.equal(streamed.length, oneShotFloat.length);

  let squaredDiff = 0;
  for (let i = 0; i < streamed.length; i += 1) {
    const diff = streamed[i] - oneShotFloat[i];
    squaredDiff += diff * diff;
  }
  const diffRms = Math.sqrt(squaredDiff / streamed.length);
  assert.ok(diffRms < 1e-4, `流式与一次性输出的 RMS 差应接近 0，实际 ${diffRms}`);

  const magnitude = goertzelMagnitude(streamed, 16_000, 1000);
  assert.ok(
    Math.abs(magnitude - 0.5) < 0.01,
    `流式输出 1kHz 幅度应接近 0.5，实际 ${magnitude.toFixed(4)}`,
  );
});

test('PCM16LE 转换拒绝奇数字节', () => {
  assert.throws(() => pcm16leToFloat32(Buffer.from([0, 0, 0])), /偶数/);
});
