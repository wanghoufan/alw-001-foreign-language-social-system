/**
 * N05 TTS · Amazon Polly 适配器（真实云 + 本地预置双实现）。
 *
 * 本文件只做两件事：
 *   1. createPollyAdapter()     → 真实 Amazon Polly（懒加载 @aws-sdk/client-polly）；
 *   2. createFakePollyAdapter() → 复用 fake 适配器的本地预置 WAV，提供 `aws-polly-fake`
 *      给真机验收用（不联网、不收费、不需要同意）。
 *
 * 硬约束（TTS-AMAZON-POLLY-APPROVED-SELECTION-V1.0 §2/§5）：
 * - 本轮**绝不调用真实 AWS**：没有凭据或没有 SDK 时 probe().configured=false，
 *   上层先 501 PROVIDER_NOT_CONFIGURED / 再 402 预算闸，speak() 根本进不来；
 * - 凭据探测只看「存不存在」，绝不读取 ~/.aws/credentials 内容、绝不打印任何 Key；
 * - 错误统一 502 PROVIDER_ERROR，不带请求文本、不带凭据、不带绝对路径；
 * - 本轮只发纯文本（TextType 默认 text），不支持任意 SSML。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {createRequire} from "node:module";
import {createFakeAdapter} from "./tts-adapter-fake.mjs";

const require = createRequire(import.meta.url);

export const POLLY_DEFAULT_REGION = "ap-northeast-1";
export const FAKE_POLLY_MODEL_VERSION = "polly-fake-preset-v1";
export const REAL_POLLY_MODEL_PREFIX = "polly";
export const POLLY_MIME = "audio/mpeg";

/** 本轮允许的 Engine（Polly 官方枚举的小写形式）。 */
const POLLY_ENGINES = new Set(["standard", "neural", "generative", "long-form"]);

/**
 * 声音表：两个 provider（aws-polly / aws-polly-fake）共用同一组 voiceId。
 * 顺序即默认：zh-CN→Zhiyu；en-US→Ruth；en-GB→Amy。
 */
export const POLLY_VOICES = [
  {voiceId: "Zhiyu", locale: "zh-CN", engine: "neural", accent: "mandarin", label: "Amazon Polly Zhiyu（普通话·Neural）"},
  {voiceId: "Ruth", locale: "en-US", engine: "generative", accent: "us", label: "Amazon Polly Ruth（美式·Generative）"},
  {voiceId: "Joanna", locale: "en-US", engine: "generative", accent: "us", label: "Amazon Polly Joanna（美式·Generative）"},
  {voiceId: "Amy", locale: "en-GB", engine: "generative", accent: "uk", label: "Amazon Polly Amy（英式·Generative）"},
  {voiceId: "Brian", locale: "en-GB", engine: "generative", accent: "uk", label: "Amazon Polly Brian（英式·Generative）"},
];

/** 内部 locale（zh-CN/en-US/en-GB）→ Polly LanguageCode；中文官方代码是 cmn-CN。 */
const POLLY_LANGUAGE_CODE = {"zh-CN": "cmn-CN", "en-US": "en-US", "en-GB": "en-GB"};

/** 进程内真实云调用计数：本轮验收要求恒为 0，供 verify 直接断言。 */
export const POLLY_RUNTIME_STATS = {synthesizeAttempts: 0, describeAttempts: 0};

function fail(status, code, message, extra = {}) {
  return Object.assign(new Error(message), {status, code, ...extra});
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** Region 优先级：SM_POLLY_REGION → AWS_REGION → ap-northeast-1。 */
export function resolvePollyRegion(env = process.env) {
  const candidate = String(env.SM_POLLY_REGION || env.AWS_REGION || "").trim();
  return /^[a-z]{2}(-[a-z0-9]+)+-\d{1,2}$/.test(candidate) ? candidate : POLLY_DEFAULT_REGION;
}

/**
 * 凭据「存在性」探测：只看有没有，不读内容、不打印值。
 * 支持 env 静态密钥对、AWS_ROLE_ARN / AWS_PROFILE、以及 ~/.aws/credentials 文件存在。
 */
export function hasAwsCredentials(env = process.env, home = os.homedir()) {
  try {
    if (nonEmpty(env.AWS_ACCESS_KEY_ID) && nonEmpty(env.AWS_SECRET_ACCESS_KEY)) return true;
    if (nonEmpty(env.AWS_ROLE_ARN) || nonEmpty(env.AWS_PROFILE)) return true;
    return fs.existsSync(path.join(home, ".aws", "credentials"));
  } catch {
    return false;
  }
}

function sdkInstalled() {
  try {
    // 只做「能否解析包」的检查，不加载模块、不产生任何副作用。
    require.resolve("@aws-sdk/client-polly");
    return true;
  } catch {
    return false;
  }
}

let sdkPromise = null;
async function loadSdk() {
  if (!sdkPromise) {
    sdkPromise = import("@aws-sdk/client-polly").catch(() => {
      sdkPromise = null;
      throw fail(501, "PROVIDER_NOT_CONFIGURED",
        "Amazon Polly SDK 未安装：本轮不发起任何真实云请求",
        {providerId: "aws-polly", reason: "SDK_NOT_INSTALLED"});
    });
  }
  return sdkPromise;
}

async function toBuffer(stream) {
  if (!stream) return null;
  if (typeof stream.transformToByteArray === "function") {
    return Buffer.from(await stream.transformToByteArray());
  }
  if (typeof stream[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
  }
  throw fail(502, "PROVIDER_ERROR", "Amazon Polly 返回了无法读取的音频数据", {providerId: "aws-polly"});
}

function voiceOf(voiceId) {
  return POLLY_VOICES.find((voice) => voice.voiceId === String(voiceId || "")) || null;
}

function engineOf(voiceId, requested) {
  const wanted = String(requested || voiceOf(voiceId)?.engine || "").toLowerCase();
  if (!POLLY_ENGINES.has(wanted)) {
    throw fail(400, "INVALID_ENGINE", "engine 必须是 standard/neural/generative/long-form", {providerId: "aws-polly"});
  }
  return wanted;
}

/**
 * 真实 Amazon Polly 适配器。
 *
 * probe() 纯本地、同步、零网络；refreshVoices() 默认不会被调用，
 * 只有 SM_POLLY_DESCRIBE=1 且 configured 时才可能发 DescribeVoicesCommand。
 */
export function createPollyAdapter({region} = {}) {
  const resolvedRegion = region ? String(region) : resolvePollyRegion();
  const credentialPresent = hasAwsCredentials();
  const sdkPresent = sdkInstalled();
  let client = null;

  function probe() {
    if (!credentialPresent) {
      return {configured: false, region: resolvedRegion, voicesVerified: false, reason: "CREDENTIALS_NOT_FOUND"};
    }
    if (!sdkPresent) {
      return {configured: false, region: resolvedRegion, voicesVerified: false, reason: "SDK_NOT_INSTALLED"};
    }
    return {configured: true, region: resolvedRegion, voicesVerified: false, reason: null};
  }

  function clientOf(sdk) {
    if (!client) client = new sdk.PollyClient({region: resolvedRegion});
    return client;
  }

  /** 只有显式打开 SM_POLLY_DESCRIBE=1 且已配置时才允许现场核查声线；本轮测试禁止设置。 */
  async function refreshVoices() {
    if (process.env.SM_POLLY_DESCRIBE !== "1") {
      throw fail(400, "DESCRIBE_DISABLED",
        "DescribeVoices 默认关闭：本轮不发起任何真实 AWS 请求（如需核查请显式设置 SM_POLLY_DESCRIBE=1）",
        {providerId: "aws-polly"});
    }
    if (!probe().configured) {
      throw fail(501, "PROVIDER_NOT_CONFIGURED", "Amazon Polly 未配置，无法核查声线", {
        providerId: "aws-polly", reason: probe().reason,
      });
    }
    const sdk = await loadSdk();
    POLLY_RUNTIME_STATS.describeAttempts += 1;
    try {
      const out = await clientOf(sdk).send(new sdk.DescribeVoicesCommand({
        Engine: "neural", LanguageCode: "cmn-CN",
      }));
      return {
        voicesVerified: true,
        voices: (out?.Voices || []).map((voice) => ({
          voiceId: voice.Id, gender: voice.Gender, languageCode: voice.LanguageCode,
          engines: voice.SupportedEngines || [],
        })),
      };
    } catch {
      throw fail(502, "PROVIDER_ERROR", "DescribeVoices 失败（不重试、不回显账号信息）", {providerId: "aws-polly"});
    }
  }

  /**
   * 真合成：Text 原文、OutputFormat mp3、Engine 小写、LanguageCode。
   * 任何异常都归一成 502 PROVIDER_ERROR，绝不把请求文本或凭据放进错误信息。
   */
  async function speak({speak, voiceId, engine, locale, text} = {}) {
    const probed = probe();
    if (!probed.configured) {
      throw fail(501, "PROVIDER_NOT_CONFIGURED", "Amazon Polly 未配置：本轮不发起任何真实云请求",
        {providerId: "aws-polly", reason: probed.reason, region: resolvedRegion});
    }
    const body = speak || {};
    const plainText = typeof body.text === "string" ? body.text : (typeof text === "string" ? text : "");
    if (plainText.length === 0) throw fail(400, "TEXT_REQUIRED", "text 不能为空");
    const voice = String(voiceId || body.voiceProfileId || "");
    if (!voiceOf(voice)) throw fail(400, "UNKNOWN_VOICE", "该提供商没有这个 voiceProfileId");
    const engineName = engineOf(voice, engine);
    const languageCode = POLLY_LANGUAGE_CODE[String(locale || body.locale || "")]
      || POLLY_LANGUAGE_CODE[voiceOf(voice).locale];

    const sdk = await loadSdk();
    try {
      const command = new sdk.SynthesizeSpeechCommand({
        Text: plainText,              // 纯文本原样发送，不做 SSML
        OutputFormat: "mp3",
        VoiceId: voice,
        Engine: engineName,           // 显式填写，避免静默降级为 standard
        LanguageCode: languageCode,
      });
      POLLY_RUNTIME_STATS.synthesizeAttempts += 1;
      const out = await clientOf(sdk).send(command);
      const bytes = await toBuffer(out?.AudioStream);
      if (!bytes || bytes.length === 0) {
        throw fail(502, "PROVIDER_ERROR", "Amazon Polly 没有返回音频数据", {providerId: "aws-polly"});
      }
      return {
        bytes,
        mimeType: POLLY_MIME,
        durationMs: null,             // Polly 不返回时长，客户端按播放器实际时长计算
        voiceId: voice,
        engine: engineName,
        region: resolvedRegion,
        modelVersion: `${REAL_POLLY_MODEL_PREFIX}-${engineName}-${resolvedRegion}-v1`,
        warnings: ["AWS_POLLY_REAL"],
      };
    } catch (error) {
      if (error?.code === "PROVIDER_ERROR") throw error;
      // 不透传 SDK 错误对象：其中可能含 endpoint/账号线索。
      throw fail(502, "PROVIDER_ERROR", "Amazon Polly 合成失败（不重试、不回显请求内容）", {providerId: "aws-polly"});
    }
  }

  return {
    providerId: "aws-polly",
    network: "aws-sdk",
    region: resolvedRegion,
    probe,
    refreshVoices,
    speak,
  };
}

/**
 * 本地预置 Polly 替身：同一组 voiceId、同一套 engine 字段，但只读本地 WAV。
 * 不联网、不收费、不需要同意；结果必然带 FAKE_PRESET_AUDIO / NOT_A_REAL_PROVIDER。
 */
export function createFakePollyAdapter({cache} = {}) {
  const inner = createFakeAdapter({cache});
  return {
    providerId: "aws-polly-fake",
    network: "none",
    probe: () => ({configured: true, region: null, voicesVerified: false, reason: null}),
    async speak(input = {}) {
      const produced = await inner.speak({voiceId: input.voiceId || input.speak?.voiceProfileId});
      return {
        ...produced,
        providerId: "aws-polly-fake",
        modelVersion: FAKE_POLLY_MODEL_VERSION,
        warnings: ["FAKE_PRESET_AUDIO", "NOT_A_REAL_PROVIDER"],
      };
    },
  };
}