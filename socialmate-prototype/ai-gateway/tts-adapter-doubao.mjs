/**
 * 豆包语音合成 2.0（Seed-TTS 2.0）适配器。
 *
 * 只做协议：HTTP Chunked 请求 → 逐行 JSON → 拼接 base64 音频。
 * 密钥只从进程环境读取，不写入日志、错误信息或返回值。
 */
import crypto from "node:crypto";

export const DOUBAO_DEFAULT_ENDPOINT = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
export const DOUBAO_DEFAULT_RESOURCE = "seed-tts-2.0";
export const DOUBAO_MODEL_VERSION = "doubao-seed-tts-2.0-v1";
export const DOUBAO_MIME = "audio/mpeg";

export const DOUBAO_VOICES = [
  {voiceId: "zh_female_xiaohe_uranus_bigtts", locale: "zh-CN", engine: "seed-tts-2.0", accent: "mandarin", label: "豆包·小何 2.0（中文）"},
  {voiceId: "zh_male_m191_uranus_bigtts", locale: "zh-CN", engine: "seed-tts-2.0", accent: "mandarin", label: "豆包·云舟 2.0（中文男声）"},
  {voiceId: "zh_female_yingyujiaoxue_uranus_bigtts", locale: "zh-CN", engine: "seed-tts-2.0", accent: "mandarin", label: "豆包·Tina老师 2.0（中英混）"},
  {voiceId: "en_male_tim_uranus_bigtts", locale: "en-US", engine: "seed-tts-2.0", accent: "us", label: "豆包·Tim（美式英语）"},
  {voiceId: "en_female_dacey_uranus_bigtts", locale: "en-US", engine: "seed-tts-2.0", accent: "us", label: "豆包·Dacey（美式英语）"},
  {voiceId: "en_female_stokie_uranus_bigtts", locale: "en-US", engine: "seed-tts-2.0", accent: "us", label: "豆包·Stokie（美式英语）"},
];

function fail(status, code, message, extra = {}) {
  return Object.assign(new Error(message), {status, code, ...extra});
}

function apiKeyOf(env) {
  return String(env.SM_DOUBAO_API_KEY || env.SM_DOUBAO_ACCESS_TOKEN || "").trim();
}

export function createDoubaoAdapter({env = process.env, fetchImpl = globalThis.fetch, endpoint} = {}) {
  const key = apiKeyOf(env);
  const resolvedEndpoint = String(endpoint || env.SM_DOUBAO_ENDPOINT || DOUBAO_DEFAULT_ENDPOINT);
  const resource = String(env.SM_DOUBAO_RESOURCE_ID || DOUBAO_DEFAULT_RESOURCE);

  function probe() {
    if (!key) return {configured: false, reason: "CREDENTIALS_NOT_FOUND", resource, voicesVerified: false};
    return {configured: true, reason: null, resource, voicesVerified: false};
  }

  async function speak({speak, voiceId, locale} = {}) {
    if (!key) {
      throw fail(501, "PROVIDER_NOT_CONFIGURED", "豆包语音未配置：缺少 SM_DOUBAO_API_KEY", {providerId: "doubao"});
    }
    const body = speak || {};
    const text = typeof body.text === "string" ? body.text : "";
    if (!text) throw fail(400, "TEXT_REQUIRED", "text 不能为空", {providerId: "doubao"});
    const voice = DOUBAO_VOICES.find((item) => item.voiceId === String(voiceId || body.voiceProfileId || ""))
      || DOUBAO_VOICES.find((item) => item.locale === String(locale || body.locale || ""))
      || DOUBAO_VOICES[0];
    const rate = Number(body.rate);
    const speechRate = Math.max(-50, Math.min(100, Math.round((Number.isFinite(rate) ? rate : 1) * 100 - 100)));

    const payload = {
      user: {uid: "alw001"},
      req_params: {
        text,
        speaker: voice.voiceId,
        model: "seed-tts-2.0-standard",
        audio_params: {format: "mp3", sample_rate: 24000, speech_rate: speechRate},
      },
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetchImpl(resolvedEndpoint, {
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
        let upstreamCode = "";
        try {
          const data = await response.json();
          upstreamCode = String(data?.header?.code || data?.code || "");
        } catch {
          upstreamCode = "";
        }
        throw fail(502, "PROVIDER_ERROR",
          `豆包语音返回 HTTP ${response.status}${upstreamCode ? " · code " + upstreamCode : ""}`,
          {providerId: "doubao", status: response.status, upstreamCode});
      }
      const raw = Buffer.from(await response.arrayBuffer());
      const chunks = [];
      let usage = null;
      let lastCode = null;
      for (const line of raw.toString("utf-8").split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj = null;
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
      const bytes = Buffer.concat(chunks);
      if (bytes.length === 0) {
        throw fail(502, "PROVIDER_EMPTY_AUDIO", "豆包语音没有返回音频数据", {providerId: "doubao"});
      }
      if (lastCode !== null && lastCode !== 0 && lastCode !== 20000000) {
        throw fail(502, "PROVIDER_ERROR", `豆包语音返回错误码 ${lastCode}`, {providerId: "doubao", upstreamCode: lastCode});
      }
      return {
        bytes,
        mimeType: DOUBAO_MIME,
        durationMs: null,
        voiceId: voice.voiceId,
        modelVersion: DOUBAO_MODEL_VERSION,
        warnings: ["DOUBAO_REAL"],
        usage,
      };
    } catch (error) {
      if (error?.code) throw error;
      if (error?.name === "AbortError") {
        throw fail(504, "PROVIDER_TIMEOUT", "豆包语音合成超时", {providerId: "doubao"});
      }
      throw fail(502, "PROVIDER_ERROR", "豆包语音合成失败", {providerId: "doubao"});
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    providerId: "doubao",
    network: "https",
    endpoint: resolvedEndpoint,
    resource,
    probe,
    speak,
  };
}