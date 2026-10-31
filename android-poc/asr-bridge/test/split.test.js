import test from 'node:test';
import assert from 'node:assert/strict';
import {
  downmixStereoPcm16,
  extractTrackPcm16,
  interleaveStereoPcm16,
  splitStereoPcm16,
} from '../src/split.js';
import { goertzelMagnitude, monoPcm16, stereoPcm16 } from '../test-support/helpers.js';

test('分轨：L=440Hz、R=880Hz 拆分后互不串音', () => {
  const stereo = stereoPcm16({
    sampleRate: 48_000,
    durationMs: 1000,
    leftFreq: 440,
    rightFreq: 880,
    leftAmplitude: 0.5,
    rightAmplitude: 0.5,
  });

  const { left, right } = splitStereoPcm16(stereo);

  assert.equal(left.byteLength, 48_000 * 2);
  assert.equal(right.byteLength, 48_000 * 2);

  const left440 = goertzelMagnitude(left, 48_000, 440);
  const left880 = goertzelMagnitude(left, 48_000, 880);
  const right880 = goertzelMagnitude(right, 48_000, 880);
  const right440 = goertzelMagnitude(right, 48_000, 440);

  assert.ok(left440 > 0.48, `左轨应有 440Hz，实际 ${left440.toFixed(4)}`);
  assert.ok(left880 < 0.01, `左轨不应有 880Hz 串音，实际 ${left880.toFixed(6)}`);
  assert.ok(right880 > 0.48, `右轨应有 880Hz，实际 ${right880.toFixed(4)}`);
  assert.ok(right440 < 0.01, `右轨不应有 440Hz 串音，实际 ${right440.toFixed(6)}`);
});

test('混音：L/R 等权平均后两个频率都保留', () => {
  const stereo = stereoPcm16({
    sampleRate: 48_000,
    durationMs: 1000,
    leftFreq: 440,
    rightFreq: 880,
    leftAmplitude: 0.5,
    rightAmplitude: 0.5,
  });

  const mono = downmixStereoPcm16(stereo);
  assert.equal(mono.byteLength, 48_000 * 2);

  const at440 = goertzelMagnitude(mono, 48_000, 440);
  const at880 = goertzelMagnitude(mono, 48_000, 880);

  assert.ok(at440 > 0.2, `混音应保留 440Hz，实际 ${at440.toFixed(4)}`);
  assert.ok(at880 > 0.2, `混音应保留 880Hz，实际 ${at880.toFixed(4)}`);
});

test('extractTrackPcm16：双声道按 A=左、B=右、mix=平均', () => {
  const stereo = stereoPcm16({
    sampleRate: 48_000,
    durationMs: 200,
    leftFreq: 440,
    rightFreq: 880,
  });
  const { left, right } = splitStereoPcm16(stereo);
  const mixed = downmixStereoPcm16(stereo);

  assert.ok(extractTrackPcm16(stereo, 2, 'A').equals(left));
  assert.ok(extractTrackPcm16(stereo, 2, 'B').equals(right));
  assert.ok(extractTrackPcm16(stereo, 2, 'mix').equals(mixed));
  assert.ok(extractTrackPcm16(stereo, 2, 'mix').equals(extractTrackPcm16(stereo, 2, 'MIX')));
});

test('extractTrackPcm16：单声道直接透传', () => {
  const mono = monoPcm16(440, 48_000, 200, 0.5);
  assert.ok(extractTrackPcm16(mono, 1, 'A').equals(mono));
  assert.ok(extractTrackPcm16(mono, 1, 'B').equals(mono));
  assert.ok(extractTrackPcm16(mono, 1, 'mix').equals(mono));
});

test('混音不会削波：L=R=满幅时仍为满幅', () => {
  const frames = 100;
  const left = Buffer.alloc(frames * 2);
  const right = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    left.writeInt16LE(32767, i * 2);
    right.writeInt16LE(32767, i * 2);
  }
  const stereo = interleaveStereoPcm16(left, right);
  const mono = downmixStereoPcm16(stereo);
  assert.equal(mono.readInt16LE(0), 32767);
  assert.equal(mono.readInt16LE((frames - 1) * 2), 32767);
});

test('非法字节数或声道数会明确报错', () => {
  assert.throws(() => splitStereoPcm16(Buffer.alloc(3)), /整数倍/);
  assert.throws(() => extractTrackPcm16(Buffer.alloc(4), 3, 'A'), /channels/);
  assert.throws(() => extractTrackPcm16(Buffer.alloc(4), 1, 'C'), /track/);
});
