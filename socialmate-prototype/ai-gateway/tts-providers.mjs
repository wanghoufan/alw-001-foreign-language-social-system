/**
 * N05 · TTS 提供商适配层（内部协议 + 注册表 + 路由服务）。
 *
 * 产品决策（TTS-PROVIDER-ADAPTER-DECISION-V1.0）：神经 TTS 为主，Android 系统 TTS 只作
 * FALLBACK_ONLY；本轮**不接任何真实厂商**，也不花任何钱。
 *
 * 这里定义的是「内部协议」，不是任何厂商 API：
 *   SpeakRequest{requestId,recordId,blockId,revision,segmentType,text,locale,accent,
 *                providerId,voiceProfileId,rate,style}
 *   SpeakResult {audioId,mimeType,durationMs,providerId,voiceId,modelVersion,cacheHit,
 *                textSha256,audioSha256,status,warnings}
 *
 * 三条硬约束：
 * 1. 服务端不改写 text（不 trim、不替换、不补标点），原文只用于计算 sha 与送进适配器；
 * 2. 响应与日志里不出现厂商 Key、不出现 Mac 绝对路径；
 * 3. 计费请求在进入适配器之前就被 402 拦下（limitCny 硬编码 0），第三方文本传输默认 OFF。
 */
import crypto from "node:crypto";
import {createTtsCache, sha256Hex, TTS_BUDGET_LIMIT_CNY, AWS_POLLY_BUDGET_LIMIT_CNY, DOUBAO_BUDGET_LIMIT_CNY} from "./tts-cache.mjs";
import {createFakeAdapter} from "./tts-adapter-fake.mjs";
import {DOUBAO_VOICES, createDoubaoAdapter} from "./tts-adapter-doubao.mjs";
import {createSkeletonAdapter} from "./tts-adapter-skeleton.mjs";
import {
  POLLY_VOICES, FAKE_POLLY_MODEL_VERSION, POLLY_RUNTIME_STATS,
  createPollyAdapter, createFakePollyAdapter,
} from "./tts-adapter-polly.mjs";
import {listPeople} from "./people-store.mjs";

export const SEGMENT_TYPES = ["cn", "enA", "enB", "phrase"];
export const LOCALES = ["zh-CN", "en-US", "en-GB"];
export const MAX_TEXT_CHARS = 2000;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/;
const SEGMENT_LOCALE = {cn: "zh-CN", enA: "en-US", enB: "en-GB", phrase: "en-US"};

/** 请求体里一旦出现这些字段，说明调用方想让我们处理人物档案 → 直接拒绝。 */
const FORBIDDEN_FIELDS = new Set([
  "person", "personname", "people", "personslug", "slug", "profile", "persona",
  "contact", "contacts", "phone", "wechat", "weixin", "email", "address",
  "realname", "fullname", "languages", "country", "occupation",
]);

function fail(status, code, message, extra = {}) {
  return Object.assign(new Error(message), {status, code, ...extra});
}

const VOICES = {
  doubao: DOUBAO_VOICES.map((voice) => ({...voice})),
  /* Amazon Polly：真实云与本地替身共用同一组 voiceId / engine（Android 端按此实现）。 */
  "aws-polly": POLLY_VOICES.map((voice) => ({...voice})),
  "aws-polly-fake": POLLY_VOICES.map((voice) => ({...voice})),
  fake: [
    {voiceId: "fake-zh-cn-01", locale: "zh-CN", label: "本地预置·普通话（非人声）", accent: "mandarin"},
    {voiceId: "fake-en-us-01", locale: "en-US", label: "本地预置·美式英语（非人声）", accent: "us"},
    {voiceId: "fake-en-gb-01", locale: "en-GB", label: "本地预置·英式英语（非人声）", accent: "uk"},
  ],
  "system-fallback": [
    {voiceId: "android-system-tts", locale: "*", label: "Android 系统朗读（仅后备）", accent: "device"},
  ],
  azure: [
    {voiceId: "en-US-AvaMultilingualNeural", locale: "en-US", label: "Azure Ava Multilingual", accent: "us"},
    {voiceId: "en-GB-SoniaNeural", locale: "en-GB", label: "Azure Sonia", accent: "uk"},
    {voiceId: "zh-CN-XiaoxiaoNeural", locale: "zh-CN", label: "Azure 晓晓", accent: "mandarin"},
  ],
  elevenlabs: [
    {voiceId: "eleven-multilingual-v2-en", locale: "en-US", label: "ElevenLabs Multilingual v2（候选）", accent: "us"},
    {voiceId: "eleven-multilingual-v2-gb", locale: "en-GB", label: "ElevenLabs Multilingual v2（英式候选）", accent: "uk"},
  ],
  google: [
    {voiceId: "en-US-Chirp3-HD-Aoede", locale: "en-US", label: "Google Chirp 3 HD（候选）", accent: "us"},
    {voiceId: "en-GB-Chirp3-HD-Charon", locale: "en-GB", label: "Google Chirp 3 HD（英式候选）", accent: "uk"},
  ],
};

/**
 * 注册表。enabled=是否可被调用；fallbackOnly=只能作为用户手动选择的备选；
 * billingEnabled=会产生费用（本轮一律 402）；requiresConsent=要外发文本给第三方。
 */
const REGISTRY = new Map([
  /* Amazon Polly（用户选定主供应商，2026-11-03）。configured 由 adapter.probe() 决定，
     绝不在注册表里硬编码 true：无凭据/无 SDK 时 501，之后还有 0 元预算闸 402。 */
  ["aws-polly", {
    providerId: "aws-polly", label: "Amazon Polly（真实云，需显式同意与预算）", kind: "cloud",
    enabled: true, fallbackOnly: false, requiresConsent: true, billingEnabled: true,
    synthesizesOnServer: true, modelVersion: "polly-real-v1",
    ratePer1kCharsCny: 0.15, keyEnv: "AWS_ACCESS_KEY_ID",
    /* Polly 的 rate 只影响客户端播放速度，不改变合成音频字节 → 缓存键排除 rate。 */
    rateAffectsAudio: false,
  }],
  ["doubao", {
    providerId: "doubao", label: "豆包语音合成 2.0（Seed-TTS，需显式同意与预算）", kind: "cloud",
    enabled: true, fallbackOnly: false, requiresConsent: true, billingEnabled: true,
    synthesizesOnServer: true, modelVersion: "doubao-seed-tts-2.0-v1",
    ratePer1kCharsCny: 0.3, keyEnv: "SM_DOUBAO_API_KEY",
    rateAffectsAudio: true,
  }],
  ["aws-polly-fake", {
    providerId: "aws-polly-fake", label: "Amazon Polly 本地替身（预置音频，真机验收用）", kind: "local-preset",
    enabled: true, fallbackOnly: false, requiresConsent: false, billingEnabled: false,
    synthesizesOnServer: true, modelVersion: FAKE_POLLY_MODEL_VERSION,
    /* 本地预置字节与 rate 无关：0.75×/1.5× 共用同一份音频，rate 只影响播放。 */
    ratePer1kCharsCny: 0, rateAffectsAudio: false,
  }],
  ["fake", {
    providerId: "fake", label: "本地预置音频（测试用，无需 Key）", kind: "local-preset",
    enabled: true, fallbackOnly: false, requiresConsent: false, billingEnabled: false,
    synthesizesOnServer: true, modelVersion: "fake-preset-v1", ratePer1kCharsCny: 0,
  }],
  ["system-fallback", {
    providerId: "system-fallback", label: "Android 系统 TTS（FALLBACK_ONLY）", kind: "client-side",
    enabled: true, fallbackOnly: true, requiresConsent: false, billingEnabled: false,
    synthesizesOnServer: false, modelVersion: "android-texttospeech", ratePer1kCharsCny: 0,
  }],
  ["azure", {
    providerId: "azure", label: "Azure Speech 神经语音（仅骨架，未配置）", kind: "cloud",
    enabled: false, fallbackOnly: false, requiresConsent: true, billingEnabled: true,
    synthesizesOnServer: true, modelVersion: "azure-rest-v1(unconfigured)",
    ratePer1kCharsCny: 0.11, keyEnv: "AZURE_SPEECH_KEY",
  }],
  ["elevenlabs", {
    providerId: "elevenlabs", label: "ElevenLabs（仅骨架，未配置）", kind: "cloud",
    enabled: false, fallbackOnly: false, requiresConsent: true, billingEnabled: true,
    synthesizesOnServer: true, modelVersion: "elevenlabs-v1(unconfigured)",
    ratePer1kCharsCny: 0.9, keyEnv: "ELEVENLABS_API_KEY",
  }],
  ["google", {
    providerId: "google", label: "Google Cloud TTS（仅骨架，未配置）", kind: "cloud",
    enabled: false, fallbackOnly: false, requiresConsent: true, billingEnabled: true,
    synthesizesOnServer: true, modelVersion: "google-chirp3(unconfigured)",
    ratePer1kCharsCny: 0.11, keyEnv: "GOOGLE_TTS_KEY",
  }],
]);

export function listProviderIds() {
  return [...REGISTRY.keys()];
}

function providerOf(providerId) {
  const provider = REGISTRY.get(String(providerId || ""));
  if (!provider) throw fail(400, "UNKNOWN_PROVIDER", "没有这个 TTS 提供商");
  return provider;
}

function publicProvider(provider, {probe, budget} = {}) {
  const voices = VOICES[provider.providerId] || [];
  const probed = typeof probe === "function" ? probe() : null;
  const engines = [...new Set(voices.map((voice) => voice.engine).filter(Boolean))];
  const isPolly = provider.providerId === "aws-polly" || provider.providerId === "aws-polly-fake";
  const hasEngines = engines.length > 0;
  return {
    providerId: provider.providerId,
    label: provider.label,
    kind: provider.kind,
    enabled: provider.enabled,
    fallbackOnly: provider.fallbackOnly,
    requiresConsent: provider.requiresConsent,
    billingEnabled: provider.billingEnabled,
    synthesizesOnServer: provider.synthesizesOnServer,
    /* configured 只信适配器探测结果，云 provider 绝不硬编码 true。 */
    configured: provider.kind === "cloud" ? Boolean(probed?.configured) : true,
    ...(provider.kind === "cloud" ? {configuredReason: probed?.reason || null} : {}),
    ...(hasEngines ? {
      engine: engines[0] || null,
      engines,
      rateAffectsAudio: provider.rateAffectsAudio !== false,
    } : {}),
    ...(provider.providerId === "aws-polly" ? {region: probed?.region || null} : {}),
    ...(budget ? {budget} : {}),
    modelVersion: provider.modelVersion,
    estimatedCostCnyPer1000Chars: provider.ratePer1kCharsCny,
    rateIsPlaceholder: provider.billingEnabled,
    voices: voices.map((voice) => ({...voice})),
  };
}

/* ------------------------------ 请求校验 ------------------------------ */

function readId(value, code, label) {
  if (value === undefined || value === null || value === "") return "";
  const text = String(value);
  if (!ID_PATTERN.test(text)) throw fail(400, code, `${label} 不合法`);
  return text;
}

/**
 * 归一化 + 校验。text 一个字都不能改：这里只做类型/长度检查，不做任何 trim/替换。
 */
export function normalizeSpeakRequest(input = {}) {
  const segmentType = String(input.segmentType || "");
  if (!SEGMENT_TYPES.includes(segmentType)) {
    throw fail(400, "INVALID_SEGMENT_TYPE", "segmentType 只能是 cn/enA/enB/phrase");
  }
  const locale = String(input.locale || SEGMENT_LOCALE[segmentType]);
  if (!LOCALES.includes(locale)) throw fail(400, "INVALID_LOCALE", "locale 只能是 zh-CN/en-US/en-GB");

  if (typeof input.text !== "string") throw fail(400, "TEXT_REQUIRED", "text 必须是字符串");
  if (input.text.length === 0) throw fail(400, "TEXT_REQUIRED", "text 不能为空");
  if (input.text.length > MAX_TEXT_CHARS) {
    throw fail(413, "TEXT_TOO_LARGE", `text 超过 ${MAX_TEXT_CHARS} 字符上限`);
  }

  const revisionRaw = input.revision === undefined || input.revision === null ? 1 : Number(input.revision);
  if (!Number.isInteger(revisionRaw) || revisionRaw < 0 || revisionRaw > 1_000_000) {
    throw fail(400, "INVALID_REVISION", "revision 不合法");
  }

  const rateRaw = input.rate === undefined || input.rate === null ? 1 : Number(input.rate);
  if (!Number.isFinite(rateRaw) || rateRaw < 0.5 || rateRaw > 2) {
    throw fail(400, "INVALID_RATE", "rate 只允许 0.5–2.0");
  }

  const providerId = String(input.providerId || "fake");
  const provider = providerOf(providerId);

  const accent = input.accent === undefined || input.accent === null ? "" : String(input.accent);
  if (accent.length > 32 || /[\u0000-\u001f]/.test(accent)) throw fail(400, "INVALID_ACCENT", "accent 不合法");
  const style = input.style === undefined || input.style === null ? "" : String(input.style);
  if (style.length > 32 || /[\u0000-\u001f]/.test(style)) throw fail(400, "INVALID_STYLE", "style 不合法");
  /* Polly 本轮只发纯文本：不开放 SSML/style，避免客户端借 style 注入任意标签。 */
  if (style && (providerId === "aws-polly" || providerId === "aws-polly-fake")) {
    throw fail(400, "SSML_NOT_ENABLED",
      "Amazon Polly 本轮只发纯文本：style/SSML 未启用，请把 style 留空");
  }

  const voices = VOICES[provider.providerId] || [];
  const candidates = voices.filter((voice) => voice.locale === locale || voice.locale === "*");
  if (candidates.length === 0) {
    throw fail(400, "LOCALE_NOT_SUPPORTED", "该提供商没有这个 locale 的语音");
  }
  const voiceProfileId = String(input.voiceProfileId || candidates[0].voiceId);
  /* 豆包 2.0 的中文/中英混音色可读英文；英文音色读中文会被上游拒绝。
     因此豆包只校验 voiceProfileId 是否存在，不强制 locale 匹配。 */
  const voice = providerId === "doubao"
    ? voices.find((item) => item.voiceId === voiceProfileId)
    : candidates.find((item) => item.voiceId === voiceProfileId);
  if (!voice) throw fail(400, "UNKNOWN_VOICE", "该提供商没有这个 voiceProfileId（或与 locale 不匹配）");

  return {
    requestId: readId(input.requestId, "INVALID_REQUEST_ID", "requestId") || `req-${Date.now().toString(36)}`,
    recordId: readId(input.recordId, "INVALID_RECORD_ID", "recordId"),
    blockId: readId(input.blockId, "INVALID_BLOCK_ID", "blockId"),
    revision: revisionRaw,
    segmentType,
    text: input.text, // 原样保留
    locale,
    accent: accent || voice.accent || "",
    providerId,
    voiceProfileId,
    rate: rateRaw,
    style,
  };
}

/**
 * 隐私闸：
 * - 请求体带任何人物档案字段 → 拒绝（不做「尽量剔除」，避免半份档案被外发）；
 * - 文本里出现已建档的他人姓名 → 拒绝（音频可能被公开播放，姓名不能顺手带走）。
 */
export async function assertPrivacy(body, speak) {
  const scan = (object) => {
    if (!object || typeof object !== "object") return;
    for (const key of Object.keys(object)) {
      if (FORBIDDEN_FIELDS.has(String(key).toLowerCase())) {
        throw fail(403, "PRIVACY_PROFILE_FIELD",
          "朗读请求不能携带人物档案字段；请只发学习句本身");
      }
      const value = object[key];
      if (value && typeof value === "object" && !Array.isArray(value)) scan(value);
    }
  };
  scan(body);

  let people = [];
  try {
    people = await listPeople();
  } catch {
    people = [];
  }
  const names = [...new Set(people.map((person) => String(person?.name || "").trim()))]
    .filter((name) => name.length >= 2);
  const hit = names.find((name) => speak.text.includes(name));
  if (hit) {
    // 不回显命中的姓名本身，避免错误信息二次泄露。
    throw fail(403, "PRIVACY_PERSON_NAME",
      "文本里出现已建档的他人姓名，已拒绝合成为音频");
  }
  return true;
}

/* ------------------------------ 缓存键 ------------------------------ */

/**
 * 缓存键：原文 sha + 业务来源 + locale/provider/model/voice + rate（仅当 rate 会改变音频）
 * + style + engine/region（仅 Polly 有）。rate 不影响音频的 provider（Polly）排除 rate，
 * 这样 0.75×/1.0×/1.5× 播放共用同一份音频，不会再合成一遍。
 */
export function cacheKeyOf(speak, modelVersion, identity = {}) {
  const parts = [
    sha256Hex(speak.text),
    speak.recordId, speak.blockId, speak.revision,
    speak.locale, speak.providerId, String(modelVersion || ""),
    speak.voiceProfileId,
  ];
  if (identity.rateAffectsAudio !== false) parts.push(speak.rate);
  parts.push(speak.style);
  if (identity.engine) parts.push(`engine:${identity.engine}`);
  if (identity.region) parts.push(`region:${identity.region}`);
  return sha256Hex(JSON.stringify(parts));
}

function audioIdOf(key) {
  return `tts-${key.slice(0, 32)}`;
}

function excerptOf(text) {
  const value = String(text);
  return value.length <= 40 ? value : `${value.slice(0, 40)}…`;
}

/* ------------------------------ 服务 ------------------------------ */

export function createTtsService(options = {}) {
  const cache = options.cache || createTtsCache({root: options.root});
  const stats = {syntheses: 0, cacheHits: 0, estimates: 0};
  const inflight = new Map();

  const adapters = {
    fake: createFakeAdapter({cache}),
    doubao: createDoubaoAdapter({}),
    "aws-polly": createPollyAdapter({}),
    "aws-polly-fake": createFakePollyAdapter({cache}),
    azure: createSkeletonAdapter({providerId: "azure", label: "Azure Speech", keyEnv: "AZURE_SPEECH_KEY", modelVersion: "azure-rest-v1(unconfigured)"}),
    elevenlabs: createSkeletonAdapter({providerId: "elevenlabs", label: "ElevenLabs", keyEnv: "ELEVENLABS_API_KEY", modelVersion: "elevenlabs-v1(unconfigured)"}),
    google: createSkeletonAdapter({providerId: "google", label: "Google Cloud TTS", keyEnv: "GOOGLE_TTS_KEY", modelVersion: "google-chirp3(unconfigured)"}),
  };

  /** Polly 的 Region 一律取自适配器（SM_POLLY_REGION → AWS_REGION → 默认），其他 provider 无 Region。 */
  function regionOf(providerId) {
    return providerId === "aws-polly" ? (adapters["aws-polly"]?.region || null) : null;
  }

  /** 缓存/合成所需的声音身份：engine、region、rate 是否影响音频。 */
  function identityOf(provider, speak) {
    const voice = (VOICES[provider.providerId] || [])
      .find((item) => item.voiceId === speak.voiceProfileId);
    return {
      engine: voice?.engine || "",
      region: regionOf(provider.providerId) || "",
      rateAffectsAudio: provider.rateAffectsAudio !== false,
    };
  }

  async function listProviders() {
    const ledger = await cache.ledger();
    const pollyLedger = await cache.providerLedger("aws-polly");
    const doubaoLedger = await cache.providerLedger("doubao");
    const pollyBudget = {
      providerId: "aws-polly", currency: "CNY",
      limitCny: AWS_POLLY_BUDGET_LIMIT_CNY,
      spentCny: Number(pollyLedger.spentCny) || 0,
      entries: Array.isArray(pollyLedger.entries) ? pollyLedger.entries.length : 0,
      exists: pollyLedger.exists === true,
      file: "TtsCache/ledger/aws-polly.json",
    };
    const doubaoBudget = {
      providerId: "doubao", currency: "CNY",
      limitCny: DOUBAO_BUDGET_LIMIT_CNY,
      spentCny: Number(doubaoLedger.spentCny) || 0,
      entries: Array.isArray(doubaoLedger.entries) ? doubaoLedger.entries.length : 0,
      exists: doubaoLedger.exists === true,
      file: "TtsCache/ledger/doubao.json",
    };
    return {
      ok: true,
      providers: [...REGISTRY.values()].map((provider) => publicProvider(provider, {
        probe: adapters[provider.providerId]?.probe,
        budget: provider.providerId === "aws-polly" ? pollyBudget : provider.providerId === "doubao" ? doubaoBudget : null,
      })),
      defaults: {providerId: "fake", note: "默认用本地预置音频，避免任何外部请求；真机验收用 aws-polly-fake"},
      budget: {
        currency: "CNY", limitCny: TTS_BUDGET_LIMIT_CNY,
        spentCny: Number(ledger.spentCny) || 0, entries: Array.isArray(ledger.entries) ? ledger.entries.length : 0,
      },
      providerBudgets: {"aws-polly": pollyBudget, doubao: doubaoBudget},
      stats: {...stats},
      policy: {
        neuralFirst: true, systemTtsFallbackOnly: true,
        thirdPartyTransferDefault: "off", requiresExplicitConsent: true,
        realProvidersConfigured: [...REGISTRY.values()]
          .filter((item) => item.kind === "cloud" && adapters[item.providerId]?.probe?.().configured === true).length,
        realCloudCallsThisBuild: POLLY_RUNTIME_STATS.synthesizeAttempts + POLLY_RUNTIME_STATS.describeAttempts,
      },
    };
  }

  function listVoices(locale) {
    const wanted = String(locale || "");
    if (wanted && !LOCALES.includes(wanted)) throw fail(400, "INVALID_LOCALE", "locale 只能是 zh-CN/en-US/en-GB");
    const out = [];
    for (const provider of REGISTRY.values()) {
      for (const voice of VOICES[provider.providerId] || []) {
        if (wanted && voice.locale !== wanted && voice.locale !== "*") continue;
        const probed = adapters[provider.providerId]?.probe;
        out.push({
          ...voice,
          providerId: provider.providerId,
          enabled: provider.enabled,
          configured: provider.kind === "cloud" ? Boolean(probed?.().configured) : true,
          fallbackOnly: provider.fallbackOnly,
          requiresConsent: provider.requiresConsent,
          billingEnabled: provider.billingEnabled,
          ...(provider.providerId === "aws-polly" ? {region: regionOf("aws-polly")} : {}),
        });
      }
    }
    return {ok: true, locale: wanted || null, count: out.length, voices: out};
  }

  /** 报价：只算，不落盘、不计数为合成。 */
  async function quote(speak, {explicitConsent = false} = {}) {
    const provider = providerOf(speak.providerId);
    stats.estimates += 1;
    const identity = identityOf(provider, speak);
    const key = cacheKeyOf(speak, provider.modelVersion, identity);
    const existing = provider.synthesizesOnServer ? await cache.readEntry(key) : null;
    const chars = speak.text.length;
    const cost = provider.billingEnabled
      ? Number(((chars / 1000) * provider.ratePer1kCharsCny).toFixed(6))
      : 0;
    return {
      ok: true,
      estimate: true,
      speakRequest: {...speak},
      textSha256: sha256Hex(speak.text),
      quote: {
        providerId: provider.providerId,
        billingEnabled: provider.billingEnabled,
        requiresConsent: provider.requiresConsent,
        fallbackOnly: provider.fallbackOnly,
        charCount: chars,
        estimatedCostCny: cost,
        currency: "CNY",
        willTransmitExternally: provider.kind === "cloud",
        willTransmitTextExcerpt: provider.kind === "cloud" ? excerptOf(speak.text) : null,
        region: identity.region || null,
        engine: identity.engine || null,
        configured: provider.kind === "cloud"
          ? Boolean(adapters[provider.providerId]?.probe?.().configured) : true,
      },
      consent: {required: provider.requiresConsent, given: explicitConsent === true},
      cache: {hit: Boolean(existing), wouldSynthesize: Boolean(provider.synthesizesOnServer && !existing)},
      cacheKeyHint: key.slice(0, 12),
      warnings: existing ? ["CACHE_HIT_NO_COST"] : [],
    };
  }

  function pendingFallbackResult(speak, key) {
    return {
      audioId: null,
      mimeType: null,
      durationMs: null,
      providerId: speak.providerId,
      voiceId: speak.voiceProfileId,
      modelVersion: "android-texttospeech",
      cacheHit: false,
      textSha256: sha256Hex(speak.text),
      audioSha256: null,
      status: "pending",
      warnings: ["FALLBACK_ONLY", "CLIENT_SIDE_SYNTHESIS", "REQUIRES_USER_CHOICE"],
    };
  }

  /**
   * 真合成：命中缓存直接重放，不新增合成；未命中才调适配器并把字节写进 TtsCache。
   * 计费闸与同意闸由调用方（路由）在进入这里之前判定。
   */
  async function synthesize(speak) {
    const provider = providerOf(speak.providerId);
    const identity = identityOf(provider, speak);
    const key = cacheKeyOf(speak, provider.modelVersion, identity);
    if (provider.billingEnabled) await cache.ensureProviderLedger(provider.providerId);
    await cache.ensureLedger(); // 公共账本骨架 0 元；计费成功才会改写（本轮不可达）

    if (!provider.synthesizesOnServer) {
      return {
        ok: true, estimate: false, speakRequest: {...speak},
        result: pendingFallbackResult(speak, key),
        synthesis: {performed: false, cacheHit: false, totalSyntheses: stats.syntheses, totalCacheHits: stats.cacheHits},
        note: "服务端不合成：该系统朗读只能由用户在手机上手动选择",
      };
    }

    const existing = await cache.readEntry(key);
    if (existing) {
      stats.cacheHits += 1;
      return {
        ok: true, estimate: false, speakRequest: {...speak},
        result: {
          audioId: existing.audioId,
          mimeType: existing.mimeType,
          durationMs: existing.durationMs,
          providerId: existing.providerId,
          voiceId: existing.voiceId,
          modelVersion: existing.modelVersion,
          cacheHit: true,
          textSha256: sha256Hex(speak.text),
          audioSha256: existing.audioSha256,
          status: "ready",
          warnings: Array.isArray(existing.warnings) ? existing.warnings : [],
        },
        synthesis: {performed: false, cacheHit: true, totalSyntheses: stats.syntheses, totalCacheHits: stats.cacheHits},
      };
    }

    // 同一 key 并发请求只合成一次，避免循环播放时打出一串重复合成。
    let job = inflight.get(key);
    if (!job) {
      job = (async () => {
        const adapter = adapters[provider.providerId];
        if (!adapter) throw fail(501, "PROVIDER_NOT_CONFIGURED", "该提供商还没有适配器实现");
        const produced = await adapter.speak({
          speak, voiceId: speak.voiceProfileId, engine: identity.engine,
          locale: speak.locale, textSha256: sha256Hex(speak.text),
        });
        const bytes = produced.bytes;
        if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
          throw fail(502, "PROVIDER_EMPTY_AUDIO", "适配器没有返回音频数据");
        }
        stats.syntheses += 1;
        const audioSha256 = sha256Hex(bytes);
        const meta = {
          schema: 1,
          audioId: audioIdOf(key),
          providerId: provider.providerId,
          voiceId: speak.voiceProfileId,
          modelVersion: produced.modelVersion || provider.modelVersion,
          mimeType: produced.mimeType || "audio/wav",
          durationMs: Number(produced.durationMs) || null,
          textSha256: sha256Hex(speak.text),
          audioSha256,
          bytes: bytes.length,
          locale: speak.locale,
          segmentType: speak.segmentType,
          recordId: speak.recordId,
          blockId: speak.blockId,
          revision: speak.revision,
          rate: speak.rate,
          style: speak.style,
          voiceProfileId: speak.voiceProfileId,
          engine: identity.engine || null,
          region: identity.region || null,
          rateAffectsAudio: identity.rateAffectsAudio,
          warnings: Array.isArray(produced.warnings) ? produced.warnings : [],
          createdAt: new Date().toISOString(),
        };
        await cache.writeEntry({key, meta, bytes});
        /* 计费 provider 记账：limitCny=0 时会 402 且不写文件（本轮在路由层已拦，双保险）。 */
        if (provider.billingEnabled) {
          await cache.recordProviderBilling({
            providerId: provider.providerId,
            chars: speak.text.length,
            costCny: Number(((speak.text.length / 1000) * provider.ratePer1kCharsCny).toFixed(6)),
            requestId: speak.requestId,
          });
        }
        return meta;
      })().finally(() => inflight.delete(key));
      inflight.set(key, job);
    }

    const meta = await job;
    return {
      ok: true, estimate: false, speakRequest: {...speak},
      result: {
        audioId: meta.audioId,
        mimeType: meta.mimeType,
        durationMs: meta.durationMs,
        providerId: meta.providerId,
        voiceId: meta.voiceId,
        modelVersion: meta.modelVersion,
        cacheHit: false,
        textSha256: meta.textSha256,
        audioSha256: meta.audioSha256,
        status: "ready",
        warnings: meta.warnings,
      },
      synthesis: {performed: true, cacheHit: false, totalSyntheses: stats.syntheses, totalCacheHits: stats.cacheHits},
    };
  }

  function policyOf(providerId) {
    const provider = providerOf(providerId);
    const probed = adapters[provider.providerId]?.probe?.() || null;
    const voices = VOICES[provider.providerId] || [];
    const engines = [...new Set(voices.map((voice) => voice.engine).filter(Boolean))];
    return {
      providerId: provider.providerId, kind: provider.kind, enabled: provider.enabled,
      fallbackOnly: provider.fallbackOnly, requiresConsent: provider.requiresConsent,
      billingEnabled: provider.billingEnabled, synthesizesOnServer: provider.synthesizesOnServer,
      estimatedCostCnyPer1000Chars: provider.ratePer1kCharsCny,
      configured: provider.kind === "cloud" ? Boolean(probed?.configured) : true,
      ...(provider.kind === "cloud" ? {configuredReason: probed?.reason || null} : {}),
      ...(engines.length ? {engine: engines[0], engines} : {}),
      ...(provider.providerId === "aws-polly" ? {region: regionOf("aws-polly")} : {}),
      rateAffectsAudio: provider.rateAffectsAudio !== false,
    };
  }

  /** 第三方传输前的回显：会发什么、发给谁、大概多少钱。不含任何 Key。 */
  function consentEcho(speak) {
    const provider = providerOf(speak.providerId);
    const identity = identityOf(provider, speak);
    return {
      explicit: true,
      providerId: provider.providerId,
      providerLabel: provider.label,
      textExcerpt: excerptOf(speak.text),
      charCount: speak.text.length,
      estimatedCostCny: provider.billingEnabled
        ? Number(((speak.text.length / 1000) * provider.ratePer1kCharsCny).toFixed(6))
        : 0,
      currency: "CNY",
      willTransmit: provider.kind === "cloud",
      region: identity.region || null,
      engine: identity.engine || null,
      configured: provider.kind === "cloud"
        ? Boolean(adapters[provider.providerId]?.probe?.().configured) : true,
      storedAs: "TtsCache 音频与元数据（不含原文）",
    };
  }

  async function audio(audioId) {
    return cache.readAudio(audioId);
  }

  function costOf(speak) {
    const provider = providerOf(speak.providerId);
    if (!provider.billingEnabled) return 0;
    return Number(((speak.text.length / 1000) * provider.ratePer1kCharsCny).toFixed(6));
  }

  /** 真实计费合成成功后记账；limit=0 或超限时抛 402，绝不静默记 0。 */
  async function recordBilling(speak) {
    const provider = providerOf(speak.providerId);
    if (!provider.billingEnabled) return null;
    return cache.recordProviderBilling({
      providerId: provider.providerId,
      chars: speak.text.length,
      costCny: costOf(speak),
      requestId: speak.requestId,
    });
  }

  return {
    listProviders, listVoices, quote, synthesize, audio,
    policyOf, consentEcho, costOf, recordBilling,
    ledger: () => cache.ledger(),
    providerLedger: (providerId) => cache.providerLedger(providerId),
    stats, cache, adapterIds: Object.keys(adapters),
  };
}
