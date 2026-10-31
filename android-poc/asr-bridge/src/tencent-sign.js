/**
 * 腾讯云实时语音识别 WebSocket v2 鉴权签名。
 *
 * 官方文档（2026-10-29 更新）：
 *   https://cloud.tencent.com/document/product/1093/48982
 *   https://cloud.tencent.com/document/api/1093/131127
 *
 * 结论（以官方文档为准）：
 * - 握手地址：wss://asr.cloud.tencent.com/asr/v2/<appid>?<参数>
 * - 鉴权：HMAC-SHA1（不是 TC3-HMAC-SHA256）；对除 signature 外的参数按字典序
 *   拼接 “host + path + ? + key=value&...” 作为签名原文，再用 SecretKey 做
 *   HMAC-SHA1 并 Base64。
 * - 最终 URL 中的 key/value/signature 都要 URL 编码。
 * - v2 标准引擎：16k_en（英语通用）；说话人分离引擎：16k_zh_en_speaker_2.0。
 *
 * 注意：这里是“生成签名”，不是“验证线上密钥”。没有真实密钥时不会发起连接。
 */

import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';

export const ASR_HOST = 'asr.cloud.tencent.com';
export const ASR_PATH_PREFIX = '/asr/v2';
export const ENGINE_EN = '16k_en';
export const ENGINE_SPEAKER = '16k_zh_en_speaker_2.0';
export const ENGINE_MULTI_LANG = '16k_multi_lang';
export const DEFAULT_EXPIRES_SECONDS = 3600;
export const MAX_EXPIRES_SECONDS = 90 * 24 * 3600;

function requireNonEmpty(value, name) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} 不能为空`);
  }
  return value.trim();
}

function requireInteger(value, name) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${name} 必须是整数，收到 ${value}`);
  }
  return value;
}

/** RFC 3986 编码，确保 +、=、/ 等签名特殊字符被编码。 */
export function rfc3986Encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function generateVoiceId() {
  return randomUUID();
}

export function generateNonce() {
  // 1..9999999999，最多 10 位。
  return crypto.randomInt(1, 10_000_000_000);
}

/**
 * 拼接签名原文。参数值使用原始值（与官方示例和腾讯云 SDK 一致），
 * 最终 URL 才做 URL 编码。
 */
export function buildSignatureString({ appId, params, host = ASR_HOST }) {
  const id = requireNonEmpty(String(appId), 'appId');
  const keys = Object.keys(params)
    .filter((key) => key !== 'signature')
    .sort();

  const query = keys.map((key) => `${key}=${params[key]}`).join('&');
  return `${host}${ASR_PATH_PREFIX}/${id}?${query}`;
}

/** 对参数对象做 HMAC-SHA1 + Base64，返回签名原文与签名值。 */
export function signAsrParams({
  appId,
  secretId,
  secretKey,
  engineModelType,
  voiceId,
  timestamp,
  expired,
  nonce,
  voiceFormat = 1,
  needVad = 1,
  extraParams = {},
  host = ASR_HOST,
}) {
  requireNonEmpty(String(appId), 'appId');
  requireNonEmpty(secretId, 'secretId');
  requireNonEmpty(secretKey, 'secretKey');
  requireNonEmpty(engineModelType, 'engineModelType');
  requireNonEmpty(voiceId, 'voiceId');
  requireInteger(timestamp, 'timestamp');
  requireInteger(expired, 'expired');
  requireInteger(nonce, 'nonce');

  if (Object.prototype.hasOwnProperty.call(extraParams, 'signature')) {
    throw new Error('extraParams 不能包含 signature');
  }

  const params = {
    secretid: secretId,
    timestamp,
    expired,
    nonce,
    engine_model_type: engineModelType,
    voice_id: voiceId,
    voice_format: voiceFormat,
    needvad: needVad,
    ...extraParams,
  };

  const signString = buildSignatureString({ appId, params, host });
  const signature = crypto
    .createHmac('sha1', secretKey)
    .update(signString, 'utf8')
    .digest('base64');

  return { params, signString, signature };
}

/**
 * 生成可直接交给 WebSocket 客户端的 wss URL。
 * 所有 query 参数（含 signature）都会 URL 编码。
 */
export function createSignedUrl(options = {}) {
  const now = Math.floor(Date.now() / 1000);
  const appId = requireNonEmpty(String(options.appId ?? ''), 'appId');
  if (!/^\d+$/.test(appId)) {
    throw new TypeError(`appId 必须是数字字符串，收到 ${appId}`);
  }

  const secretId = requireNonEmpty(options.secretId, 'secretId');
  const secretKey = requireNonEmpty(options.secretKey, 'secretKey');
  const engineModelType = requireNonEmpty(options.engineModelType, 'engineModelType');
  const voiceId = requireNonEmpty(options.voiceId ?? generateVoiceId(), 'voiceId');
  if (voiceId.length < 16 || voiceId.length > 128) {
    throw new RangeError('voiceId 长度必须在 16..128 之间（官方文档要求）');
  }

  const timestamp = requireInteger(options.timestamp ?? now, 'timestamp');
  const expired = requireInteger(options.expired ?? timestamp + DEFAULT_EXPIRES_SECONDS, 'expired');
  if (expired <= timestamp) {
    throw new RangeError('expired 必须大于 timestamp');
  }
  if (expired - timestamp >= MAX_EXPIRES_SECONDS) {
    throw new RangeError('expired - timestamp 必须小于 90 天');
  }

  const nonce = requireInteger(options.nonce ?? generateNonce(), 'nonce');
  if (nonce <= 0 || String(nonce).length > 10) {
    throw new RangeError('nonce 必须是正整数且最多 10 位');
  }

  const { params, signString, signature } = signAsrParams({
    appId,
    secretId,
    secretKey,
    engineModelType,
    voiceId,
    timestamp,
    expired,
    nonce,
    voiceFormat: options.voiceFormat ?? 1,
    needVad: options.needVad ?? 1,
    extraParams: options.extraParams ?? {},
  });

  const query = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(params[key])}`)
    .join('&');

  const url =
    `wss://${ASR_HOST}${ASR_PATH_PREFIX}/${rfc3986Encode(appId)}?` +
    `${query}&signature=${rfc3986Encode(signature)}`;

  return { url, signature, signString, params, voiceId };
}
