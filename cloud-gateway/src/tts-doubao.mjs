/**
 * 豆包语音合成 2.0（Seed-TTS 2.0）适配器。
 *
 * 协议沿用本机 ai-gateway/tts-adapter-doubao.mjs：
 *   POST https://openspeech.bytedance.com/api/v3/tts/unidirectional
 *   headers: X-Api-Key / X-Api-Resource-Id / X-Api-Request-Id
 *   body:   {user, req_params:{text, speaker, model, audio_params}}
 *   响应:   逐行 JSON，data 字段为 base64 音频片段
 *
 * 与 Mac 版的差异：
 * - 不落盘原文与音频，只返回字节和元数据；
 * - 文本上限 2000 字符，超限直接 400，不截断；
 * - 必须显式 consent，避免把学习文本静默外发；
 * - 密钥只从环境变量读，不进入响应、日志或异常信息。
 */
import crypto from "node:crypto";
import {fail} from "./errors.mjs";
import {sha256Hex} from "./state-store.mjs";

export const DOUBAO_DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
export const DOUBAO_DEFAULT_RESOURCE = "seed-tts-2.0";
export const DOUBAO_MODEL_VERSION = "doubao-seed-tts-2.0-v1";
export const DOUBAO_MIME = "audio/mpeg";
export const MAX_TTS_CHARS = 2000;
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

export const DOUBAO_VOICES = [
  {voiceId: "zh_female_xiaohe_uranus_bigtts", locale: "zh-CN", label: "豆包·小何 2.0（中文）"},
  {voiceId: "zh_male_m191_uranus_bigtts", locale: "zh-CN", label: "豆包·云舟 2.0（中文男声）"},
  {voiceId: "zh_female_yingyujiaoxue_uranus_bigtts", locale: "zh-CN", label: "豆包·Tina老师 2.0（中英混）"},
  {voiceId: "en_male_tim_uranus_bigtts", locale: "en-US", label: "豆包·Tim（美式英语）"},
  {voiceId: "en_female_dacey_uranus_bigtts", locale: "en-US", label: "豆包·Dacey（美式英语）"},
  {voiceId: "en_female_stokie_uranus_bigtts", locale: "en-US", label: "豆包·Stokie（美式英语）"},
];

export function resolveDoubaoVoice({voiceId, locale} = {}) {
  const byId = DOUBAO_VOICES.find((voice) => voice.voiceId === String(voiceId || ""));
  if (byId) return byId;
  if (voiceId) throw fail(400, "UNKNOWN_VOICE", "voiceId 不在豆包 2.0 允许清单内");
  const byLocale = DOUBAO_VOICES.find((voice) => voice.locale === String(locale || ""));
  return byLocale || DOUBAO_VOICES[0];
}

/** 文本只做长度与类型校验，不改写、不 trim、不补标点。 */
export function assertTtsText(text) {
  if (typeof text !== "string") throw fail(400, "TEXT_REQUIRED", "text 必须是字符串");
  if (text.length === 0) throw fail(400, "TEXT_REQUIRED", "text 不能为空");
  if (text.length > MAX_TTS_CHARS) {
    throw fail(400, "TEXT_TOO_LARGE", `text 超过 ${MAX_TTS_CHARS} 字符上限`);
  }
  return text;
}

export function requireTtsConsent(consent) {
  if (consent !== true) {
    throw fail(403, "CONSENT_REQUIRED", "把学习文本发送给第三方 TTS 需要本次显式同意（consent:true）");
  }
}

function parseAudioChunks(rawText) {
  const chunks = [];
  let usage = null;
  let lastCode = null;
  for (const line of rawText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const code = Number(obj?.code);
    if (Number.isFinite(code)) lastCode = code;
    if (obj?.data) chunks.push(Buffer.from(String(obj.data), "base64"));
    if (obj?.usage) usage = obj.usage;
  }
  return {bytes: Buffer.concat(chunks), usage, lastCode};
}

/**
 * @param {{env?: object, fetchImpl?: Function, timeoutMs?: number, endpoint?: string}} options
 */
export function createDoubaoService({env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 30000, endpoint} = {}) {
  const key = String(env.SM_DOUBAO_API_KEY || env.DOUBAO_API_KEY || "").trim();
  const url = String(endpoint || env.SM_DOUBAO_ENDPOINT || DOUBAO_DEFAULT_ENDPOINT);
  const resource = String(env.SM_DOUBAO_RESOURCE_ID || DOUBAO_DEFAULT_RESOURCE);

  function probe() {
    return key
      ? {configured: true, reason: null, resource, voicesVerified: false}
      : {configured: false, reason: "CREDENTIALS_NOT_FOUND", resource, voicesVerified: false};
  }

  /**
   * @returns {{bytes: Buffer, mimeType: string, voiceId: string, modelVersion: string,
   *            textSha256: string, audioSha256: string, usage: object|null, warnings: string[]}}
   */
  async function synthesize({text, voiceId, locale, rate = 1, consent} = {}) {
    requireTtsConsent(consent);
    const source = assertTtsText(text);
    if (!probe().configured) {
      throw fail(501, "PROVIDER_NOT_CONFIGURED", "豆包语音未配置：缺少 SM_DOUBAO_API_KEY");
    }
    if (typeof fetchImpl !== "function") throw fail(500, "FETCH_UNAVAILABLE", "运行环境缺少 fetch");

    const voice = resolveDoubaoVoice({voiceId, locale});
    const rateNumber = Number(rate);
    if (!Number.isFinite(rateNumber) || rateNumber < 0.5 || rateNumber > 2) {
      throw fail(400, "INVALID_RATE", "rate 只允许 0.5–2.0");
    }
    const speechRate = Math.max(-50, Math.min(100, Math.round(rateNumber * 100 - 100)));

    const payload = {
      user: {uid: "alw001"},
      req_params: {
        text: source,
        speaker: voice.voiceId,
        model: "seed-tts-2.0-standard",
        audio_params: {format: "mp3", sample_rate: 24000, speech_rate: speechRate},
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": key,
          "X-Api-Resource-Id": resource,
          "X-Api-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        if (response.status === 429) throw fail(503, "PROVIDER_LIMIT", "豆包语音限流，请稍后再试");
        if (response.status === 401 || response.status === 403) {
          throw fail(502, "PROVIDER_AUTH", "豆包语音鉴权失败");
        }
        throw fail(502, "PROVIDER_ERROR", `豆包语音返回 HTTP ${response.status}`);
      }

      const rawText = Buffer.from(await response.arrayBuffer()).toString("utf8");
      const {bytes, usage, lastCode} = parseAudioChunks(rawText);
      if (bytes.length === 0) throw fail(502, "PROVIDER_EMPTY_AUDIO", "豆包语音没有返回音频数据");
      if (bytes.length > MAX_AUDIO_BYTES) throw fail(502, "PROVIDER_AUDIO_TOO_LARGE", "豆包语音返回音频超过 2MB");
      if (lastCode !== null && lastCode !== 0 && lastCode !== 20000000) {
        throw fail(502, "PROVIDER_ERROR", `豆包语音返回错误码 ${lastCode}`);
      }

      return {
        bytes,
        mimeType: DOUBAO_MIME,
        voiceId: voice.voiceId,
        modelVersion: DOUBAO_MODEL_VERSION,
        textSha256: sha256Hex(source),
        audioSha256: sha256Hex(bytes),
        usage,
        warnings: ["DOUBAO_REAL"],
      };
    } catch (error) {
      if (error?.status) throw error;
      if (error?.name === "AbortError") throw fail(504, "PROVIDER_TIMEOUT", "豆包语音合成超时");
      throw fail(502, "PROVIDER_NETWORK", "豆包语音合成失败");
    } finally {
      clearTimeout(timer);
    }
  }

  return {probe, synthesize, voices: DOUBAO_VOICES, resource, endpoint: url};
}