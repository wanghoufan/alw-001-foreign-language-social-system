/**
 * 腾讯云实时语音识别 WebSocket v2 鉴权签名（精简版）。
 *
 * 仅保留云端网关实际需要的部分：
 * - HMAC-SHA1 + Base64；
 * - 参数按字典序拼接 `host + path + ? + key=value&...`；
 * - 最终 URL 中 key/value/signature 全部 RFC3986 编码。
 *
 * 没有真实密钥时不会生成 URL；调用方必须先判定 configured。
 */
import crypto from "node:crypto";

export const ASR_HOST = "asr.cloud.tencent.com";
export const ASR_PATH_PREFIX = "/asr/v2";
export const ENGINE_EN = "16k_en";
export const ENGINE_SPEAKER = "16k_zh_en_speaker_2.0";
export const DEFAULT_EXPIRES_SECONDS = 3600;

export function rfc3986Encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function generateVoiceId() {
  return crypto.randomUUID();
}

export function buildSignatureString({appId, params, host = ASR_HOST}) {
  const keys = Object.keys(params).filter((key) => key !== "signature").sort();
  const query = keys.map((key) => `${key}=${params[key]}`).join("&");
  return `${host}${ASR_PATH_PREFIX}/${appId}?${query}`;
}

/**
 * @returns {{url: string, voiceId: string, engineModelType: string}}
 */
export function createTencentSignedUrl({
  appId,
  secretId,
  secretKey,
  engineModelType,
  voiceId,
  timestamp = Math.floor(Date.now() / 1000),
  expired = timestamp + DEFAULT_EXPIRES_SECONDS,
  nonce = crypto.randomInt(1, 10_000_000_000),
  voiceFormat = 1,
  needVad = 1,
  extraParams = {},
}) {
  if (!/^\d+$/.test(String(appId || ""))) throw new TypeError("appId 必须是数字字符串");
  if (!secretId || !secretKey) throw new TypeError("腾讯云 ASR 凭证不完整");
  if (!engineModelType) throw new TypeError("engineModelType 不能为空");
  if (!voiceId || String(voiceId).length < 16 || String(voiceId).length > 128) {
    throw new RangeError("voiceId 长度必须在 16–128 之间");
  }
  if (!Number.isInteger(timestamp) || !Number.isInteger(expired) || expired <= timestamp) {
    throw new RangeError("expired 必须大于 timestamp");
  }
  if (!Number.isInteger(nonce) || nonce <= 0 || String(nonce).length > 10) {
    throw new RangeError("nonce 必须是正整数且最多 10 位");
  }
  if (Object.prototype.hasOwnProperty.call(extraParams, "signature")) {
    throw new Error("extraParams 不能包含 signature");
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
  const signString = buildSignatureString({appId: String(appId), params});
  const signature = crypto.createHmac("sha1", secretKey).update(signString, "utf8").digest("base64");
  const query = Object.keys(params).sort()
    .map((key) => `${rfc3986Encode(key)}=${rfc3986Encode(params[key])}`).join("&");
  const url = `wss://${ASR_HOST}${ASR_PATH_PREFIX}/${rfc3986Encode(appId)}?${query}&signature=${rfc3986Encode(signature)}`;
  return {url, voiceId: String(voiceId), engineModelType};
}