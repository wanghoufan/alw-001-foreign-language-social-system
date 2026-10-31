import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  ENGINE_EN,
  ENGINE_SPEAKER,
  buildSignatureString,
  createSignedUrl,
  signAsrParams,
} from '../src/tencent-sign.js';
import {
  AsrConfigError,
  TencentRealtimeSession,
  engineForTrack,
  resolveCredentials,
} from '../src/tencent-asr-client.js';

const FIXED = Object.freeze({
  appId: '1250000000',
  secretId: 'FAKE_SECRET_ID_FOR_TESTS_ONLY_0001',
  secretKey: 'FAKE_SECRET_KEY_FOR_TESTS_ONLY_0001',
  engineModelType: '16k_en',
  voiceId: '0123456789abcdef0123456789abcdef',
  timestamp: 1760000000,
  expired: 1760003600,
  nonce: 123456789,
});

const FIXED_PARAMS = Object.freeze({
  secretid: FIXED.secretId,
  timestamp: FIXED.timestamp,
  expired: FIXED.expired,
  nonce: FIXED.nonce,
  engine_model_type: FIXED.engineModelType,
  voice_id: FIXED.voiceId,
  voice_format: 1,
  needvad: 1,
});

test('签名原文按字典序拼接，且不包含 signature', () => {
  const signString = buildSignatureString({
    appId: FIXED.appId,
    params: { ...FIXED_PARAMS, signature: 'should-not-be-included' },
  });

  assert.equal(
    signString,
    'asr.cloud.tencent.com/asr/v2/1250000000?' +
      'engine_model_type=16k_en&expired=1760003600&needvad=1&nonce=123456789&' +
      'secretid=FAKE_SECRET_ID_FOR_TESTS_ONLY_0001&timestamp=1760000000&voice_format=1&' +
      'voice_id=0123456789abcdef0123456789abcdef',
  );
});

test('固定输入的 HMAC-SHA1 签名输出确定值', () => {
  const result = signAsrParams(FIXED);

  assert.equal(result.signString, buildSignatureString({ appId: FIXED.appId, params: FIXED_PARAMS }));
  assert.equal(result.signature, 'HZrxoXRgluRnlcKfsWDUDvEw5xk=');

  // 独立用 Node crypto 复算，防止实现偷偷改变算法或参数顺序。
  const independent = crypto
    .createHmac('sha1', FIXED.secretKey)
    .update(result.signString, 'utf8')
    .digest('base64');
  assert.equal(result.signature, independent);
});

test('createSignedUrl 生成官方 v2 地址并正确 URL 编码 signature', () => {
  const result = createSignedUrl(FIXED);
  const url = new URL(result.url);

  assert.equal(url.protocol, 'wss:');
  assert.equal(url.host, 'asr.cloud.tencent.com');
  assert.equal(url.pathname, '/asr/v2/1250000000');
  assert.equal(url.searchParams.get('engine_model_type'), '16k_en');
  assert.equal(url.searchParams.get('voice_id'), FIXED.voiceId);
  assert.equal(url.searchParams.get('secretid'), FIXED.secretId);
  assert.equal(url.searchParams.get('voice_format'), '1');
  assert.equal(url.searchParams.get('needvad'), '1');
  assert.equal(url.searchParams.get('signature'), 'HZrxoXRgluRnlcKfsWDUDvEw5xk=');
  assert.match(result.url, /signature=HZrxoXRgluRnlcKfsWDUDvEw5xk%3D$/);
});

test('签名参数校验：过期时间、appid、voiceId、nonce', () => {
  assert.throws(() => createSignedUrl({ ...FIXED, expired: FIXED.timestamp }), /expired/);
  assert.throws(
    () => createSignedUrl({ ...FIXED, expired: FIXED.timestamp + 90 * 24 * 3600 }),
    /90 天/,
  );
  assert.throws(() => createSignedUrl({ ...FIXED, appId: 'abc' }), /appId/);
  assert.throws(() => createSignedUrl({ ...FIXED, voiceId: 'short' }), /voiceId/);
  assert.throws(
    () => createSignedUrl({ ...FIXED, nonce: 12345678901 }),
    /nonce/,
  );
  assert.throws(
    () => signAsrParams({ ...FIXED, extraParams: { signature: 'x' } }),
    /signature/,
  );
});

test('凭证解析：全空 -> mock，缺项 -> 明确报错，齐全 -> real', () => {
  assert.deepEqual(resolveCredentials({}), { configured: false, credentials: null });

  assert.throws(
    () => resolveCredentials({ TENCENT_APP_ID: '1250000000' }),
    (error) =>
      error instanceof AsrConfigError &&
      /TENCENT_SECRET_ID/.test(error.message) &&
      /TENCENT_SECRET_KEY/.test(error.message),
  );

  const resolved = resolveCredentials({
    TENCENT_APP_ID: '1250000000',
    TENCENT_SECRET_ID: 'sid',
    TENCENT_SECRET_KEY: 'skey',
  });
  assert.equal(resolved.configured, true);
  assert.deepEqual(resolved.credentials, {
    appId: '1250000000',
    secretId: 'sid',
    secretKey: 'skey',
  });
});

test('无密钥时 TencentRealtimeSession 明确报错，不静默降级', () => {
  assert.throws(
    () => new TencentRealtimeSession({ track: 'A' }),
    (error) =>
      error instanceof AsrConfigError &&
      /缺少凭证/.test(error.message) &&
      /appId/.test(error.message),
  );

  assert.throws(
    () =>
      new TencentRealtimeSession({
        appId: '1250000000',
        secretId: '',
        secretKey: 'skey',
        track: 'mix',
      }),
    /secretId/,
  );
});

test('双轨用 16k_en，混音用 16k_zh_en_speaker_2.0', () => {
  assert.equal(engineForTrack('A', {}), ENGINE_EN);
  assert.equal(engineForTrack('B', {}), ENGINE_EN);
  assert.equal(engineForTrack('mix', {}), ENGINE_SPEAKER);
  assert.equal(engineForTrack('mix', { TENCENT_ENGINE_SPEAKER: 'custom_engine' }), 'custom_engine');

  const dual = new TencentRealtimeSession({
    appId: FIXED.appId,
    secretId: FIXED.secretId,
    secretKey: FIXED.secretKey,
    track: 'A',
    timestamp: FIXED.timestamp,
    expired: FIXED.expired,
    nonce: FIXED.nonce,
    voiceId: FIXED.voiceId,
  });
  assert.equal(dual.engineModelType, ENGINE_EN);
  assert.equal(dual.speakerDiarization, false);
  const dualUrl = new URL(dual.buildUrl());
  assert.equal(dualUrl.searchParams.get('engine_model_type'), ENGINE_EN);

  const mixed = new TencentRealtimeSession({
    appId: FIXED.appId,
    secretId: FIXED.secretId,
    secretKey: FIXED.secretKey,
    track: 'mix',
    timestamp: FIXED.timestamp,
    expired: FIXED.expired,
    nonce: FIXED.nonce,
    voiceId: FIXED.voiceId,
  });
  assert.equal(mixed.engineModelType, ENGINE_SPEAKER);
  assert.equal(mixed.speakerDiarization, true);
  const mixedUrl = new URL(mixed.buildUrl());
  assert.equal(mixedUrl.searchParams.get('engine_model_type'), ENGINE_SPEAKER);

  dual.close();
  mixed.close();
});
