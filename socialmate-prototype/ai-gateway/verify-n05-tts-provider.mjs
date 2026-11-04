/**
 * ALW-001 N05 · TTS 提供商适配层后端验收（verify-n05-tts-provider）。
 *
 * 真跑：随机端口起真实 createHandler，注入假归档 + 宽松限流；
 * TtsCache 与 People 全部指向临时工作区，绝不碰真实档案、绝不发任何云 TTS 请求。
 *
 * 运行：node verify-n05-tts-provider.mjs
 * 退出码：0 全通过；1 有 FAIL。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createTtsCache, sha256Hex, AWS_POLLY_BUDGET_LIMIT_CNY} from "./tts-cache.mjs";
import {POLLY_RUNTIME_STATS} from "./tts-adapter-polly.mjs";

/**
 * 出网探针：本轮要求 Amazon Polly 一次都没被调用。
 * 在这里先替换 https.request / fetch（SDK 懒加载，加载时拿到的是替换后的实现），
 * 本地验收自测走 http.request，不计入。
 */
const OUTBOUND = {https: 0, fetch: 0};
const originalHttpsRequest = https.request;
https.request = function patchedHttpsRequest(...args) {
  OUTBOUND.https += 1;
  return originalHttpsRequest.apply(this, args);
};
const originalFetch = globalThis.fetch;
if (typeof originalFetch === "function") {
  globalThis.fetch = function patchedFetch(...args) {
    OUTBOUND.fetch += 1;
    return originalFetch.apply(this, args);
  };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const TOKEN = "sm-n05-tts-verify-token-0123456789";
const REAL_PEOPLE = path.join(REPO_ROOT, "SocialMate-Data", "People");
const PERSON_NAME = "Verify Alpha";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileSha(file) {
  try {
    return sha256(await fs.readFile(file));
  } catch {
    return null;
  }
}

async function listFiles(dir) {
  const out = [];
  async function walk(current, base) {
    let entries = [];
    try {
      entries = await fs.readdir(current, {withFileTypes: true});
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = path.join(base, entry.name);
      if (entry.isDirectory()) await walk(path.join(current, entry.name), rel);
      else out.push(rel);
    }
  }
  await walk(dir, "");
  return out;
}

async function dirDigest(dir) {
  const files = [];
  for (const rel of await listFiles(dir)) {
    files.push(`${rel}\u0000${sha256(await fs.readFile(path.join(dir, rel)))}`);
  }
  return {digest: sha256(files.sort().join("\n")), files: files.length};
}

/** 只数真正的音频文件（audio/*.wav），不含元数据 sidecar 与预置目录。 */
async function audioWavCount(root) {
  return (await listFiles(root)).filter((rel) =>
    rel.startsWith(`audio${path.sep}`) && rel.endsWith(".wav")).length;
}

function call(port, pathname, {method = "GET", headers = {}, body = null} = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body), "utf8");
    const req = http.request({
      host: "127.0.0.1", port, path: pathname, method,
      headers: {
        ...(payload ? {"content-type": "application/json", "content-length": payload.length} : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch {}
        resolve({status: res.statusCode, headers: res.headers, buf, text, json});
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function fakeArchive() {
  return {
    async get(_pathname, token) {
      if (token !== TOKEN) return {status: 401, body: "{}"};
      return {status: 404, body: "{}"};
    },
    async proxy(_req, res) {
      res.writeHead(200, {"Content-Type": "application/json; charset=utf-8"});
      res.end("{}");
    },
  };
}

const PROFILE = (name) => [
  "---", `name: ${name}`, "country: 美国", "city:", "languages: []",
  "status_in_hainan:", "occupation:", "relationship_stage: new_contact",
  "first_met:", "last_contact:", "contact_channels: []", "tags: []", "---", "",
  "# 基本情况", "", "# 兴趣", "", "# 海南生活", "", "# 工作 / 学习", "",
  "# 共同点", "", "# 对方近期计划", "", "# 已确认偏好", "",
  "# 不宜重复询问", "", "# 后续可以继续的话题", "",
].join("\n");

const checks = [];
const responses = [];
function record(name, pass, detail) {
  checks.push({name, pass: Boolean(pass), detail});
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const workspace = path.join(HERE, ".local", "verify-n05-tts", stamp);
  const cacheRoot = path.join(workspace, "TtsCache");
  const peopleRoot = path.join(workspace, "People");
  await fs.mkdir(path.join(peopleRoot, "verify-alpha"), {recursive: true, mode: 0o700});
  await fs.writeFile(path.join(peopleRoot, "verify-alpha", "00-profile.md"),
    PROFILE(PERSON_NAME), {encoding: "utf8", mode: 0o600});

  const realPeopleBefore = await dirDigest(REAL_PEOPLE);

  process.env.SM_AI_NO_LISTEN = "1";
  process.env.SM_PEOPLE_DIR = peopleRoot;
  process.env.SM_TTS_CACHE_DIR = cacheRoot;
  process.env.DEEPSEEK_BUDGET_FILE = path.join(workspace, "ai-budget.json");

  const {createHandler} = await import("./server.mjs");
  const server = http.createServer(createHandler({
    archive: fakeArchive(),
    rateLimit: () => ({ok: true}),
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const origin = `http://127.0.0.1:${port}`;

  async function api(pathname, {method = "GET", body = null, token = TOKEN, ticket = false,
    sendOrigin = true, headers = {}} = {}) {
    const merged = {...headers};
    if (token) merged["x-archive-token"] = token;
    if (sendOrigin) merged.origin = origin;
    if (ticket) {
      const got = await call(port, "/v12/api/demo/write-ticket", {headers: merged});
      if (got.json?.ticket) merged["x-sm-write"] = got.json.ticket;
    }
    const result = await call(port, pathname, {method, headers: merged, body});
    responses.push({pathname, method, ...result});
    return result;
  }

  const TEXT = "I went to Longxing Road today.  光线很好。 ";  // 故意带连续空格与尾空格
  const speakBody = {
    requestId: "req-verify-0001", recordId: "rec-verify-0001", blockId: "blk-1",
    revision: 3, segmentType: "enA", text: TEXT, locale: "en-US",
    providerId: "fake", rate: 1, style: "",
  };

  try {
    /* ---------- ① 无令牌 401 / 跨源 403 ---------- */
    const noToken = await api("/v12/api/tts/providers", {token: null});
    const crossOrigin = await api("/v12/api/tts/providers", {
      sendOrigin: false, headers: {origin: "https://evil.example"},
    });
    record("① 无令牌 → 401 TOKEN_REQUIRED，跨源 → 403 ORIGIN_REJECTED",
      noToken.status === 401 && noToken.json?.code === "TOKEN_REQUIRED"
        && crossOrigin.status === 403 && crossOrigin.json?.code === "ORIGIN_REJECTED",
      `noToken=${noToken.status}/${noToken.json?.code} cross=${crossOrigin.status}/${crossOrigin.json?.code}`);

    /* ---------- ② 仅 fake / system-fallback enabled ---------- */
    const providers = await api("/v12/api/tts/providers");
    const enabled = (providers.json?.providers || []).filter((item) => item.enabled)
      .map((item) => item.providerId).sort();
    const cloud = (providers.json?.providers || []).filter((item) => item.kind === "cloud");
    const fallback = (providers.json?.providers || []).find((item) => item.providerId === "system-fallback");
    /* provider 数从 3 增加到 4 个 cloud（新增 aws-polly），本地替身 aws-polly-fake 也可用；
       但「真实云 provider 未配置时绝不可合成」的语义不变：configured 全为 false。 */
    record("② providers：本地 fake/aws-polly-fake/system-fallback enabled；真实云全部 configured:false 且需同意/计费",
      providers.status === 200
        && enabled.join(",") === "aws-polly,aws-polly-fake,fake,system-fallback"
        && cloud.length === 4
        && cloud.filter((item) => item.enabled === true).map((item) => item.providerId).join(",") === "aws-polly"
        && cloud.every((item) => item.requiresConsent === true
          && item.billingEnabled === true && item.configured === false)
        && fallback?.fallbackOnly === true && fallback?.synthesizesOnServer === false,
      `enabled=${enabled.join(",")} cloud=${cloud.length} configured=${cloud.map((item) => item.configured).join(",")} fallbackOnly=${fallback?.fallbackOnly}`);

    const voicesGb = await api("/v12/api/tts/voices?locale=en-GB");
    record("②-b voices 按 locale 过滤（en-GB 只出英式声线，含本地预置）",
      voicesGb.status === 200 && voicesGb.json.count > 0
        && voicesGb.json.voices.every((voice) => voice.locale === "en-GB" || voice.locale === "*")
        && voicesGb.json.voices.some((voice) => voice.voiceId === "fake-en-gb-01"),
      `count=${voicesGb.json?.count}`);

    /* ---------- ④ estimate 不落盘（此时代码尚未写过任何缓存） ---------- */
    const filesBeforeEstimate = await listFiles(cacheRoot);
    const estimate = await api("/v12/api/tts/synthesize", {
      method: "POST", body: {...speakBody, estimate: true},
    });
    const filesAfterEstimate = await listFiles(cacheRoot);
    record("④ estimate 只报价：不落盘、不建缓存、不计入合成",
      estimate.status === 200 && estimate.json?.estimate === true
        && estimate.json.quote?.estimatedCostCny === 0
        && estimate.json.cache?.wouldSynthesize === true
        && estimate.json.result === undefined
        && filesBeforeEstimate.length === 0 && filesAfterEstimate.length === 0,
      `status=${estimate.status} filesBefore=${filesBeforeEstimate.length} filesAfter=${filesAfterEstimate.length}`);

    /* ---------- ③ fake 合成一次，sha 与本地预置文件一致；重复请求命中缓存 ---------- */
    const first = await api("/v12/api/tts/synthesize", {method: "POST", ticket: true, body: speakBody});
    const presetFile = path.join(cacheRoot, "preset", "fake-en-us-01.wav");
    const presetSha = await fileSha(presetFile);
    const audioCount1 = await audioWavCount(cacheRoot);
    record("③-a fake 合成成功，文本原样回显且 audioSha256 等于本地预置文件",
      first.status === 200 && first.json.result?.status === "ready"
        && first.json.speakRequest?.text === TEXT
        && first.json.result.textSha256 === sha256(TEXT)
        && first.json.result.audioSha256 === presetSha
        && first.json.synthesis.performed === true && first.json.result.cacheHit === false
        && audioCount1 === 1,
      `status=${first.status} shaMatch=${first.json.result?.audioSha256 === presetSha} textIntact=${first.json.speakRequest?.text === TEXT}`);

    const second = await api("/v12/api/tts/synthesize", {method: "POST", ticket: true, body: speakBody});
    const audioCount2 = await audioWavCount(cacheRoot);
    record("③-b 同段重复请求 cacheHit:true 且合成计数不增、音频文件不新增",
      second.status === 200 && second.json.result?.cacheHit === true
        && second.json.synthesis.performed === false
        && second.json.synthesis.totalSyntheses === first.json.synthesis.totalSyntheses
        && second.json.result.audioId === first.json.result.audioId
        && audioCount2 === 1,
      `cacheHit=${second.json.result?.cacheHit} totalSyntheses=${second.json.synthesis?.totalSyntheses} audioFiles=${audioCount2}`);

    const audioId = first.json.result.audioId;
    const audioSha = first.json.result.audioSha256;

    /* ---------- ⑤ skeleton 计费 → 402 且账本 0 变动 ---------- */
    const ledgerFile = path.join(cacheRoot, "ledger.json");
    const ledgerBefore = await fileSha(ledgerFile);
    const ledgerJsonBefore = JSON.parse(await fs.readFile(ledgerFile, "utf8"));
    const billable = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...speakBody, providerId: "azure", voiceProfileId: "en-US-AvaMultilingualNeural",
        explicitConsent: true},
    });
    const ledgerAfter = await fileSha(ledgerFile);
    const ledgerJsonAfter = JSON.parse(await fs.readFile(ledgerFile, "utf8"));
    record("⑤ 计费请求 → 402 TTS_BUDGET_ZERO，账本字节与金额零变动",
      billable.status === 402 && billable.json.code === "TTS_BUDGET_ZERO"
        && billable.json.budget.limitCny === 0
        && ledgerBefore === ledgerAfter
        && ledgerJsonAfter.spentCny === 0 && ledgerJsonAfter.entries.length === 0
        && ledgerJsonBefore.spentCny === 0,
      `status=${billable.status} code=${billable.json?.code} ledgerByteIdentical=${ledgerBefore === ledgerAfter} spent=${ledgerJsonAfter.spentCny}`);

    /* ---------- ⑥ 未 explicitConsent 的第三方请求被拒 ---------- */
    const noConsent = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...speakBody, providerId: "elevenlabs", voiceProfileId: "eleven-multilingual-v2-en"},
    });
    const afterConsentFiles = await audioWavCount(cacheRoot);
    record("⑥ 第三方 TTS 未显式同意 → 403 CONSENT_REQUIRED（回显将发送的摘录/提供商/费用）",
      noConsent.status === 403 && noConsent.json.code === "CONSENT_REQUIRED"
        && noConsent.json.consent?.willTransmit === false
        && typeof noConsent.json.consent?.textExcerpt === "string"
        && noConsent.json.consent?.providerId === "elevenlabs"
        && afterConsentFiles === audioCount2,
      `status=${noConsent.status} code=${noConsent.json?.code} excerpt=${Boolean(noConsent.json?.consent?.textExcerpt)}`);

    /* ---------- ⑦ 篡改 sha → 400；Range → 206 ---------- */
    const audioPath = path.join(cacheRoot, "audio", `${audioId}.wav`);
    const originalBytes = await fs.readFile(audioPath);
    // 同长度篡改：只有内容变了、长度没变，专门触发 audioSha256 校验失败。
    const tamperedBytes = Buffer.from(originalBytes);
    tamperedBytes[100] = tamperedBytes[100] ^ 0xff;
    await fs.writeFile(audioPath, tamperedBytes, {mode: 0o600});
    const tampered = await api(`/v12/api/tts/audio/${audioId}`);
    await fs.writeFile(audioPath, originalBytes, {mode: 0o600});
    const restored = await api(`/v12/api/tts/audio/${audioId}`);
    const ranged = await api(`/v12/api/tts/audio/${audioId}`, {headers: {range: "bytes=0-99"}});
    const badRange = await api(`/v12/api/tts/audio/${audioId}`, {headers: {range: "bytes=999999-"}});
    record("⑦ 篡改音频 → 400 AUDIO_SHA_MISMATCH；还原后完整读取 200、Range 206、越界 416",
      tampered.status === 400 && tampered.json.code === "AUDIO_SHA_MISMATCH"
        && restored.status === 200 && restored.buf.length === originalBytes.length
        && restored.headers["content-length"] === String(originalBytes.length)
        && restored.headers["x-tts-audio-sha256"] === audioSha
        && ranged.status === 206 && ranged.buf.length === 100
        && ranged.headers["content-range"] === `bytes 0-99/${originalBytes.length}`
        && badRange.status === 416,
      `tampered=${tampered.status}/${tampered.json?.code} full=${restored.status} range=${ranged.status} badRange=${badRange.status}`);

    /* ---------- ⑧ 含他人姓名 / 人物档案字段 → 拒绝 ---------- */
    const withName = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...speakBody, text: `${PERSON_NAME} said the coffee here is great.`},
    });
    const withProfile = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...speakBody, personName: PERSON_NAME, text: "Hello there."},
    });
    record("⑧ 文本含他人姓名 → 403 PRIVACY_PERSON_NAME；带人物档案字段 → 403 PRIVACY_PROFILE_FIELD",
      withName.status === 403 && withName.json.code === "PRIVACY_PERSON_NAME"
        && withProfile.status === 403 && withProfile.json.code === "PRIVACY_PROFILE_FIELD"
        && !withName.text.includes(PERSON_NAME),
      `name=${withName.status}/${withName.json?.code} field=${withProfile.status}/${withProfile.json?.code}`);

    /* ---------- 附：skeleton 无 Key 直连 → 501（HTTP 层先被 402 预算闸拦下） ---------- */
    const {createSkeletonAdapter} = await import("./tts-adapter-skeleton.mjs");
    let skeletonError = null;
    try {
      await createSkeletonAdapter({providerId: "azure", label: "Azure Speech",
        keyEnv: "AZURE_SPEECH_KEY", modelVersion: "x"}).speak();
    } catch (error) {
      skeletonError = error;
    }
    record("附 skeleton 适配器无 Key 直调 → 501 PROVIDER_NOT_CONFIGURED（HTTP 层被 402 先行拦截）",
      skeletonError?.status === 501 && skeletonError?.code === "PROVIDER_NOT_CONFIGURED"
        && billable.status === 402,
      `adapter=${skeletonError?.status}/${skeletonError?.code} http=${billable.status}/${billable.json?.code}`);

    /* ---------- 附：system-fallback 服务端不合成 ---------- */    const fallbackResult = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...speakBody, providerId: "system-fallback", voiceProfileId: "android-system-tts"},
    });
    record("附 system-fallback 返回 pending 且不落盘（服务端不合成）",
      fallbackResult.status === 200 && fallbackResult.json.result?.status === "pending"
        && fallbackResult.json.result?.audioId === null
        && fallbackResult.json.result?.warnings?.includes("FALLBACK_ONLY")
        && (await audioWavCount(cacheRoot)) === audioCount2,
      `status=${fallbackResult.json?.result?.status} warnings=${fallbackResult.json?.result?.warnings?.join("+")}`);

    /* ================= Amazon Polly（本轮 0 次真实 AWS 调用） =================
       本地替身 aws-polly-fake 跑通语言路由/缓存/audit；真实 aws-polly 只验证
       「未配置 → 501」「未同意 → 403」「style → 400」「0 元账本」四条安全边界。 */
    const polly = (providers.json.providers || []).find((item) => item.providerId === "aws-polly");
    const pollyFake = (providers.json.providers || []).find((item) => item.providerId === "aws-polly-fake");
    const allowedReasons = ["CREDENTIALS_NOT_FOUND", "SDK_NOT_INSTALLED"];
    record("P1 providers 暴露 aws-polly(configured=false + region) 与 aws-polly-fake(enabled)",
      providers.status === 200
        && polly?.kind === "cloud" && polly?.enabled === true && polly?.configured === false
        && allowedReasons.includes(polly?.configuredReason)
        && polly?.requiresConsent === true && polly?.billingEnabled === true
        && polly?.region === "ap-northeast-1"
        && pollyFake?.kind === "local-preset" && pollyFake?.enabled === true
        && pollyFake?.configured === true && pollyFake?.requiresConsent === false
        && pollyFake?.billingEnabled === false,
      `polly=${JSON.stringify({configured: polly?.configured, reason: polly?.configuredReason, region: polly?.region})} fakeEnabled=${pollyFake?.enabled}`);

    const pollyVoices = polly?.voices || [];
    const voiceEngine = Object.fromEntries(pollyVoices.map((voice) => [voice.voiceId, voice.engine]));
    const voiceLocale = Object.fromEntries(pollyVoices.map((voice) => [voice.voiceId, voice.locale]));
    record("P2 aws-polly 5 个声线 voiceId/locale/engine 与契约逐字一致",
      pollyVoices.length === 5
        && voiceEngine.Zhiyu === "neural" && voiceLocale.Zhiyu === "zh-CN"
        && voiceEngine.Ruth === "generative" && voiceLocale.Ruth === "en-US"
        && voiceEngine.Joanna === "generative" && voiceLocale.Joanna === "en-US"
        && voiceEngine.Amy === "generative" && voiceLocale.Amy === "en-GB"
        && voiceEngine.Brian === "generative" && voiceLocale.Brian === "en-GB"
        && polly?.engine === "neural",
      `voices=${pollyVoices.map((voice) => `${voice.voiceId}/${voice.locale}/${voice.engine}`).join(",")}`);

    const {normalizeSpeakRequest} = await import("./tts-providers.mjs");
    const routeSpeak = (segmentType, extra = {}) => normalizeSpeakRequest({
      providerId: "aws-polly-fake", text: "路由测试", rate: 1, style: "", segmentType, ...extra,
    });
    const routed = {cn: routeSpeak("cn"), enA: routeSpeak("enA"), enB: routeSpeak("enB"), phrase: routeSpeak("phrase")};
    record("P3 默认语言路由 cn→Zhiyu / enA→Ruth / enB→Amy / phrase→Ruth",
      routed.cn.locale === "zh-CN" && routed.cn.voiceProfileId === "Zhiyu"
        && routed.enA.locale === "en-US" && routed.enA.voiceProfileId === "Ruth"
        && routed.enB.locale === "en-GB" && routed.enB.voiceProfileId === "Amy"
        && routed.phrase.locale === "en-US" && routed.phrase.voiceProfileId === "Ruth",
      `cn=${routed.cn.voiceProfileId} enA=${routed.enA.voiceProfileId} enB=${routed.enB.voiceProfileId} phrase=${routed.phrase.voiceProfileId}`);

    const overrideJoanna = routeSpeak("enA", {voiceProfileId: "Joanna"});
    const overrideBrian = routeSpeak("enB", {voiceProfileId: "Brian"});
    let mismatchError = null;
    try { routeSpeak("enA", {voiceProfileId: "Amy"}); } catch (error) { mismatchError = error; }
    record("P4 voiceProfileId 覆盖校验：Joanna/Brian 通过，跨 locale 的 Amy → 400 UNKNOWN_VOICE",
      overrideJoanna.voiceProfileId === "Joanna" && overrideBrian.voiceProfileId === "Brian"
        && mismatchError?.status === 400 && mismatchError?.code === "UNKNOWN_VOICE",
      `joanna=${overrideJoanna.voiceProfileId} brian=${overrideBrian.voiceProfileId} mismatch=${mismatchError?.code}`);

    const pollyCaseBody = (segmentType) => ({
      requestId: `req-polly-${segmentType}`, recordId: "rec-polly-0001", blockId: "blk-polly-1",
      revision: 1, segmentType, text: `Polly ${segmentType} sample.`,
      providerId: "aws-polly-fake", rate: 1, style: "",
    });
    const expectedVoice = {cn: "Zhiyu", enA: "Ruth", enB: "Amy", phrase: "Ruth"};
    const expectedLocale = {cn: "zh-CN", enA: "en-US", enB: "en-GB", phrase: "en-US"};
    const pollyRuns = [];
    for (const segmentType of ["cn", "enA", "enB", "phrase"]) {
      const res = await api("/v12/api/tts/synthesize", {
        method: "POST", ticket: true, body: pollyCaseBody(segmentType),
      });
      pollyRuns.push({segmentType, res});
    }
    const pollyOk = pollyRuns.every(({segmentType, res}) => (
      res.status === 200
      && res.json.result?.status === "ready"
      && res.json.result?.providerId === "aws-polly-fake"
      && res.json.result?.voiceId === expectedVoice[segmentType]
      && res.json.speakRequest?.locale === expectedLocale[segmentType]
      && res.json.result?.mimeType === "audio/wav"
      && res.json.result?.warnings?.includes("FAKE_PRESET_AUDIO")
      && res.json.result?.warnings?.includes("NOT_A_REAL_PROVIDER")
      && res.json.synthesis?.performed === true
    ));
    const pollyAudioIds = new Set(pollyRuns.map(({res}) => res.json.result?.audioId));
    record("P5 aws-polly-fake 合成 4 类 locale 成功（cn/enA/enB/phrase 声线与 locale 正确、音频互不相同）",
      pollyOk && pollyAudioIds.size === 4,
      `runs=${pollyRuns.map(({segmentType, res}) => `${segmentType}:${res.status}/${res.json.result?.voiceId}`).join(",")}`);

    const pollyEnA = pollyCaseBody("enA");
    const pollyEnARun = pollyRuns.find((run) => run.segmentType === "enA").res;
    const pollyLastRun = pollyRuns[pollyRuns.length - 1].res; // 4 类 locale 全部合成后的计数
    const pollyRepeat = await api("/v12/api/tts/synthesize", {method: "POST", ticket: true, body: pollyEnA});
    record("P6 同段重复：cacheHit:true、合成计数不增、audioId 不变",
      pollyRepeat.status === 200 && pollyRepeat.json.result?.cacheHit === true
        && pollyRepeat.json.synthesis?.performed === false
        && pollyRepeat.json.synthesis?.totalSyntheses === pollyLastRun.json.synthesis.totalSyntheses
        && pollyRepeat.json.result?.audioId === pollyEnARun.json.result.audioId,
      `hit=${pollyRepeat.json.result?.cacheHit} total=${pollyRepeat.json.synthesis?.totalSyntheses}（4 类 locale 后）`);

    const pollyRate = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true, body: {...pollyEnA, rate: 1.5},
    });
    record("P7 Polly 的 rate 不影响音频：1.5× 复用同一缓存（rateAffectsAudio:false，键排除 rate）",
      pollyRate.status === 200 && pollyRate.json.result?.cacheHit === true
        && pollyRate.json.result?.audioId === pollyEnARun.json.result.audioId
        && pollyRate.json.synthesis?.performed === false,
      `hit=${pollyRate.json.result?.cacheHit} audioSame=${pollyRate.json.result?.audioId === pollyEnARun.json.result.audioId}`);

    const pollyJoanna = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true, body: {...pollyEnA, voiceProfileId: "Joanna"},
    });
    const pollyBrian = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true, body: {...pollyCaseBody("enB"), voiceProfileId: "Brian"},
    });
    record("P8 换声线（Joanna/Brian）产生新 audioId 且各合成一次",
      pollyJoanna.status === 200 && pollyBrian.status === 200
        && pollyJoanna.json.result?.voiceId === "Joanna" && pollyBrian.json.result?.voiceId === "Brian"
        && pollyJoanna.json.result?.audioId !== pollyEnARun.json.result.audioId
        && pollyBrian.json.result?.audioId !== pollyRuns.find((run) => run.segmentType === "enB").res.json.result.audioId
        && pollyJoanna.json.synthesis?.performed === true && pollyBrian.json.synthesis?.performed === true
        && pollyBrian.json.synthesis?.totalSyntheses === pollyJoanna.json.synthesis.totalSyntheses + 1,
      `joanna=${pollyJoanna.json.result?.audioId} brian=${pollyBrian.json.result?.audioId} total=${pollyBrian.json.synthesis?.totalSyntheses}`);

    const pollyCloudNoConsent = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true, body: {...pollyEnA, providerId: "aws-polly", requestId: "req-polly-cloud-1"},
    });
    record("P9 同意闸先于配置闸：aws-polly 未 explicitConsent → 403 CONSENT_REQUIRED（回显摘录/区域/引擎/未配置）",
      pollyCloudNoConsent.status === 403 && pollyCloudNoConsent.json.code === "CONSENT_REQUIRED"
        && pollyCloudNoConsent.json.consent?.providerId === "aws-polly"
        && pollyCloudNoConsent.json.consent?.textExcerpt?.length > 0
        && pollyCloudNoConsent.json.consent?.willTransmit === false
        && pollyCloudNoConsent.json.consent?.region === "ap-northeast-1"
        && pollyCloudNoConsent.json.consent?.engine === "generative"
        && pollyCloudNoConsent.json.consent?.configured === false,
      `status=${pollyCloudNoConsent.status} code=${pollyCloudNoConsent.json?.code} region=${pollyCloudNoConsent.json?.consent?.region} engine=${pollyCloudNoConsent.json?.consent?.engine}`);

    const pollyLedgerFile = path.join(cacheRoot, "ledger", "aws-polly.json");
    const ledgerExists = async () => {
      try { await fs.stat(pollyLedgerFile); return true; } catch { return false; }
    };
    const audioBeforeQuote = await audioWavCount(cacheRoot);
    const pollyQuote = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...pollyEnA, providerId: "aws-polly", estimate: true, requestId: "req-polly-quote-1"},
    });
    const quote = pollyQuote.json?.quote || {};
    record("P9-b aws-polly estimate 返回 region/engine/configured/字符/估价/摘录，且不落盘不建账本",
      pollyQuote.status === 200 && pollyQuote.json.estimate === true
        && quote.providerId === "aws-polly"
        && quote.region === "ap-northeast-1" && quote.engine === "generative"
        && quote.configured === false && quote.billingEnabled === true
        && quote.charCount === pollyEnA.text.length
        && Number(quote.estimatedCostCny) > 0
        && quote.willTransmitExternally === true
        && typeof quote.willTransmitTextExcerpt === "string" && quote.willTransmitTextExcerpt.length > 0
        && (await audioWavCount(cacheRoot)) === audioBeforeQuote
        && (await ledgerExists()) === false,
      `status=${pollyQuote.status} region=${quote.region} engine=${quote.engine} configured=${quote.configured} chars=${quote.charCount} cost=${quote.estimatedCostCny}`);

    const pollyCloud = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...pollyEnA, providerId: "aws-polly", explicitConsent: true, requestId: "req-polly-cloud-2"},
    });
    record("P10 aws-polly 未配置 → 501 PROVIDER_NOT_CONFIGURED（附 region/reason，无凭据、0 真实调用）",
      pollyCloud.status === 501 && pollyCloud.json.code === "PROVIDER_NOT_CONFIGURED"
        && pollyCloud.json.providerId === "aws-polly"
        && pollyCloud.json.region === "ap-northeast-1"
        && allowedReasons.includes(pollyCloud.json.reason)
        && pollyCloud.json.realCloudCallsThisBuild === 0
        && !/AKIA|ASIA|aws_secret|AWS_SECRET/.test(pollyCloud.text),
      `status=${pollyCloud.status} code=${pollyCloud.json?.code} region=${pollyCloud.json?.region} reason=${pollyCloud.json?.reason}`);

    const pollyStyleCloud = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true,
      body: {...pollyEnA, providerId: "aws-polly", explicitConsent: true, style: "news"},
    });
    const pollyStyleFake = await api("/v12/api/tts/synthesize", {
      method: "POST", ticket: true, body: {...pollyEnA, style: "news"},
    });
    record("P11 style 非空 → 400 SSML_NOT_ENABLED（真实云与本地替身一致，本轮只发纯文本）",
      pollyStyleCloud.status === 400 && pollyStyleCloud.json.code === "SSML_NOT_ENABLED"
        && pollyStyleFake.status === 400 && pollyStyleFake.json.code === "SSML_NOT_ENABLED",
      `cloud=${pollyStyleCloud.status}/${pollyStyleCloud.json?.code} fake=${pollyStyleFake.status}/${pollyStyleFake.json?.code}`);

    const providersAgain = await api("/v12/api/tts/providers");
    const budget = providersAgain.json?.providerBudgets?.["aws-polly"];
    const pollyEntry = (providersAgain.json?.providers || []).find((item) => item.providerId === "aws-polly");
    record("P12 providers 返回 aws-polly 独立账本 limit=0/spent=0，且 501/403 之后账本文件仍未创建",
      budget?.limitCny === 0 && budget?.spentCny === 0 && budget?.entries === 0
        && budget?.exists === false && pollyEntry?.budget?.limitCny === 0
        && AWS_POLLY_BUDGET_LIMIT_CNY === 0 && (await ledgerExists()) === false,
      `budget=${JSON.stringify(budget)} fileExists=${await ledgerExists()}`);

    const ledger = createTtsCache({root: cacheRoot});
    let billingError = null;
    try {
      await ledger.recordProviderBilling({providerId: "aws-polly", chars: 12, costCny: 0.01, requestId: "req-ledger-probe"});
    } catch (error) {
      billingError = error;
    }
    record("P13 记账 API 硬闸：0 元上限下记账直接 402 且不创建账本文件",
      billingError?.status === 402 && billingError?.code === "TTS_BUDGET_ZERO"
        && (await ledgerExists()) === false,
      `error=${billingError?.status}/${billingError?.code} fileExists=${await ledgerExists()}`);

    /* mp3 兼容：直接按 audio/mpeg 写一条缓存条目，验证 .mp3 落盘 + 读取 + stats 统计。 */
    const mp3Bytes = Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000polly-mp3-compat", "utf8");
    const mp3Key = sha256Hex("polly-mp3-compat-entry");
    const mp3AudioId = `tts-${mp3Key.slice(0, 32)}`;
    await ledger.writeEntry({key: mp3Key, bytes: mp3Bytes, meta: {
      schema: 1, audioId: mp3AudioId, providerId: "aws-mp3-format-probe", voiceId: "Ruth",
      modelVersion: "polly-generative-ap-northeast-1-v1", mimeType: "audio/mpeg", durationMs: null,
      textSha256: sha256Hex("format probe"), audioSha256: sha256Hex(mp3Bytes), bytes: mp3Bytes.length,
      locale: "en-US", segmentType: "enA", recordId: "", blockId: "", revision: 1, rate: 1,
      style: "", voiceProfileId: "Ruth", warnings: ["FORMAT_PROBE_ONLY"], createdAt: new Date().toISOString(),
    }});
    const mp3Entry = await ledger.readEntry(mp3Key);
    const mp3Read = await ledger.readAudio(mp3AudioId);
    const mp3Stats = await ledger.stats();
    const wavFilesNow = await audioWavCount(cacheRoot);
    record("P14 缓存扩展名由 mimeType 决定：audio/mpeg→.mp3，readEntry/readAudio/stats 同时兼容 .wav/.mp3",
      mp3Entry?.bytes?.equals(mp3Bytes) === true
        && mp3Read?.meta?.mimeType === "audio/mpeg" && mp3Read.bytes.length === mp3Bytes.length
        && mp3Stats.audioFiles === wavFilesNow + 1
        && (await fs.stat(path.join(cacheRoot, "audio", `${mp3AudioId}.mp3`))).isFile(),
      `wav=${wavFilesNow} totalAudio=${mp3Stats.audioFiles} audioId=${mp3AudioId}`);

    const pollyAudioId = pollyEnARun.json.result.audioId;
    const pollyAudioPath = path.join(cacheRoot, "audio", `${pollyAudioId}.wav`);
    const pollyOriginal = await fs.readFile(pollyAudioPath);
    const pollyTampered = Buffer.from(pollyOriginal);
    pollyTampered[100] = pollyTampered[100] ^ 0xff;
    await fs.writeFile(pollyAudioPath, pollyTampered, {mode: 0o600});
    const pollyTamperedRead = await api(`/v12/api/tts/audio/${pollyAudioId}`);
    await fs.writeFile(pollyAudioPath, pollyOriginal, {mode: 0o600});
    const pollyRestored = await api(`/v12/api/tts/audio/${pollyAudioId}`);
    record("P15 Polly 缓存音频读取仍校验 sha：篡改 → 400 AUDIO_SHA_MISMATCH，还原 → 200",
      pollyTamperedRead.status === 400 && pollyTamperedRead.json.code === "AUDIO_SHA_MISMATCH"
        && pollyRestored.status === 200
        && pollyRestored.headers["x-tts-audio-sha256"] === pollyEnARun.json.result.audioSha256,
      `tampered=${pollyTamperedRead.status}/${pollyTamperedRead.json?.code} restored=${pollyRestored.status}`);

    record("P16 0 次真实 AWS 调用：https/fetch 出网探针为 0、Polly 运行时计数为 0、DescribeVoices 未开启",
      OUTBOUND.https === 0 && OUTBOUND.fetch === 0
        && POLLY_RUNTIME_STATS.synthesizeAttempts === 0 && POLLY_RUNTIME_STATS.describeAttempts === 0
        && String(process.env.SM_POLLY_DESCRIBE || "") !== "1",
      `https=${OUTBOUND.https} fetch=${OUTBOUND.fetch} synth=${POLLY_RUNTIME_STATS.synthesizeAttempts} describe=${POLLY_RUNTIME_STATS.describeAttempts}`);

    /* ---------- ⑨ 日志与响应无 Key / 无绝对路径 ---------- */
    const forbidden = ["/Users/", REPO_ROOT, "TtsCache/audio", "TtsCache/preset",
      "AZURE_SPEECH_KEY", "ELEVENLABS_API_KEY", "GOOGLE_TTS_KEY", "sk-", "Authorization",
      "AWS_SECRET_ACCESS_KEY", "aws_secret_access_key", "AKIA", "ASIA", "X-Amz-Security-Token"];
    const leaked = [];
    for (const response of responses) {
      for (const needle of forbidden) {
        if (response.text.includes(needle)) leaked.push(`${response.pathname}:${needle}`);
      }
    }
    const skeletonSrc = await fs.readFile(path.join(HERE, "tts-adapter-skeleton.mjs"), "utf8");
    const noNetwork = !/node:https?|node:net|fetch\(|axios|undici/.test(skeletonSrc);
    const envKeys = ["AZURE_SPEECH_KEY", "ELEVENLABS_API_KEY", "GOOGLE_TTS_KEY", "TTS_API_KEY"]
      .filter((name) => String(process.env[name] || "").trim().length > 0);
    record("⑨ 全部响应无 Key/无 Mac 绝对路径；骨架适配器源码无网络出口；本进程无厂商 Key",
      leaked.length === 0 && noNetwork && envKeys.length === 0 && responses.length > 0,
      `responses=${responses.length} leaked=${leaked.length === 0 ? "none" : leaked.join(",")} noNetwork=${noNetwork} keys=${envKeys.length}`);

    /* ---------- 真实数据零改动 ---------- */
    const realPeopleAfter = await dirDigest(REAL_PEOPLE);
    record("真实 People 目录 sha 前后一致（未触碰真实档案）",
      realPeopleAfter.digest === realPeopleBefore.digest,
      `files=${realPeopleAfter.files} digest=${realPeopleAfter.digest.slice(0, 16)}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const failed = checks.filter((item) => !item.pass);
  const summary = {
    ok: failed.length === 0,
    task: "ALW001-N05-TTS-PROVIDER-ADAPTER-backend",
    startedAt,
    finishedAt: new Date().toISOString(),
    port,
    providers: {
      realCloudCalls: POLLY_RUNTIME_STATS.synthesizeAttempts + POLLY_RUNTIME_STATS.describeAttempts,
      httpsCalls: OUTBOUND.https, fetchCalls: OUTBOUND.fetch,
      configuredKeys: 0,
      polly: {
        providerId: "aws-polly",
        configured: await (async () => {
          try {
            const mod = await import("./tts-adapter-polly.mjs");
            return mod.createPollyAdapter({}).probe();
          } catch { return null; }
        })(),
        budgetLimitCny: AWS_POLLY_BUDGET_LIMIT_CNY,
        describeEnabled: String(process.env.SM_POLLY_DESCRIBE || "") === "1",
      },
      note: "全程 0 次真实云请求；AWS 凭据只做存在性探测，未读取/未打印任何 Key",
    },
    total: checks.length,
    passed: checks.length - failed.length,
    failed: failed.length,
    checks,
    workspace,
  };
  const outFile = path.join(HERE, ".local", "verify-n05-tts-provider.json");
  await fs.mkdir(path.dirname(outFile), {recursive: true});
  await fs.writeFile(outFile, JSON.stringify(summary, null, 2), "utf8");
  console.log("\n" + JSON.stringify({ok: summary.ok, total: summary.total, passed: summary.passed,
    failed: summary.failed, workspace, json: outFile}, null, 2));
  return summary.ok ? 0 : 1;
}

main().then((code) => { process.exit(code); }).catch((error) => {
  console.error("VERIFY_FATAL", error);
  process.exit(1);
});
