/**
 * ALW-001 V1.7 R2 C4 · 云端薄网关 HTTP 入口。
 *
 * 定位：无状态、可水平扩容的薄网关。它不持有学习数据、不落盘原文、不管理 Mac 进程，
 * 只做四件事：设备授权、跨实例预算硬闸、厂商协议适配、ASR WebSocket 中继。
 *
 * 端点（全部 JSON，除 ASR 为 WebSocket）：
 *   GET  /health                    健康与配置探测（无需令牌）
 *   POST /auth/token                管理令牌 → 签发设备短期令牌
 *   POST /auth/revoke               撤销令牌（管理令牌或设备本人）
 *   GET  /v1/status                 预算 / 限流 / ASR 状态（需 status scope）
 *   POST /v1/ai/translate           DeepSeek 单句翻译（≤700 字）
 *   POST /v1/ai/draft-en            DeepSeek 中文 → 英文草稿（≤1200 字）
 *   POST /v1/ai/analyze             DeepSeek 对话接话分析（1–12 句，每句 ≤700 字）
 *   GET  /v1/tts/voices             豆包 2.0 音色清单
 *   POST /v1/tts/synthesize         豆包 TTS（≤2000 字符，返回音频字节 + 元数据）
 *   GET  /v1/asr/status             ASR 中继状态
 *   WS   /v1/asr/stream             腾讯 / P066 实时 ASR 中继（逐帧）
 *
 * 错误码：400 参数、401 令牌、403 同意/权限/设备、402 预算、429 限流、5xx 上游。
 */
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createStateStore, sha256Hex} from "./state-store.mjs";
import {createAuthService, extractAdminToken, extractBearerToken, extractFingerprint} from "./auth.mjs";
import {BUDGET_KEYS, createBudgetService} from "./budget.mjs";
import {assertNoProfileFields, createDeepSeekService, MAX_DRAFT_CHARS, MAX_SENTENCE_CHARS, requireConsent} from "./ai-deepseek.mjs";
import {assertTtsText, createDoubaoService, MAX_TTS_CHARS, requireTtsConsent} from "./tts-doubao.mjs";
import {createAsrRelay, resolveAsrConfig} from "./asr-relay.mjs";
import {fail, toGatewayError} from "./errors.mjs";

export const GATEWAY_VERSION = "1.7.0-r2-c4.0";
export const MAX_BODY_BYTES = 128 * 1024;
const ENDPOINTS = [
  ["GET", "/health", "健康与配置探测（无需令牌）"],
  ["POST", "/auth/token", "管理令牌签发设备短期令牌"],
  ["POST", "/auth/revoke", "撤销设备令牌"],
  ["GET", "/v1/status", "预算 / 限流 / ASR 状态"],
  ["POST", "/v1/ai/translate", "DeepSeek 单句翻译（≤700 字）"],
  ["POST", "/v1/ai/draft-en", "DeepSeek 中文 → 英文草稿（≤1200 字）"],
  ["POST", "/v1/ai/analyze", "DeepSeek 对话接话分析（1–12 句）"],
  ["GET", "/v1/tts/voices", "豆包 2.0 音色清单"],
  ["POST", "/v1/tts/synthesize", "豆包 TTS（≤2000 字符）"],
  ["GET", "/v1/asr/status", "ASR 中继状态"],
  ["WS", "/v1/asr/stream", "腾讯 / P066 实时 ASR 中继"],
];

function sendJson(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  });
  res.end(payload);
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let settled = false;
    const chunks = [];
    req.on("data", (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBytes) {
        settled = true;
        reject(fail(413, "BODY_TOO_LARGE", `请求体超过 ${maxBytes} 字节`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      const text = Buffer.concat(chunks).toString("utf8").trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(fail(400, "INVALID_JSON", "请求体必须是 JSON"));
      }
    });
    req.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(fail(400, "BODY_READ_ERROR", `请求体读取失败：${error.message}`));
    });
  });
}

function numberEnv(env, name, fallback) {
  const value = Number(String(env[name] ?? "").trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolEnv(env, name, fallback) {
  const value = String(env[name] ?? "").trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function defaultStateFile(env) {
  const configured = String(env.CLOUD_STATE_DB || "").trim();
  if (configured) return path.resolve(configured);
  return path.resolve(process.cwd(), ".local", "cloud-gateway.db");
}

/**
 * @param {{env?: object, store?: object, fetchImpl?: Function, now?: () => number,
 *          asrUpstreamFactory?: Function, asrMaxSessionSeconds?: number, logger?: object,
 *          tokenSecret?: string}} options
 */
export async function createGatewayServer({
  env = process.env,
  store,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  asrUpstreamFactory,
  asrMaxSessionSeconds,
  logger = console,
  tokenSecret,
} = {}) {
  const driver = String(env.CLOUD_STATE_DRIVER || "sqlite").trim();
  const ownsStore = !store;
  const stateStore = store || await createStateStore({
    driver,
    file: defaultStateFile(env),
    now,
    redisUrl: String(env.CLOUD_REDIS_URL || "").trim() || undefined,
  });

  const auth = createAuthService({
    store: stateStore,
    env,
    now,
    secret: tokenSecret,
  });
  const budget = createBudgetService({store: stateStore, env, now});
  const deepseek = createDeepSeekService({env, fetchImpl});
  const doubao = createDoubaoService({env, fetchImpl});

  const rateWindowMs = numberEnv(env, "CLOUD_RATE_WINDOW_MS", 60_000);
  const rateLimit = numberEnv(env, "CLOUD_RATE_LIMIT_PER_WINDOW", 30);
  const idempotencyTtlMs = numberEnv(env, "CLOUD_IDEMPOTENCY_TTL_MS", 24 * 3600 * 1000);
  const requireTtsConsentFlag = boolEnv(env, "CLOUD_TTS_REQUIRE_CONSENT", true);

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      const gatewayError = toGatewayError(error);
      if (gatewayError.status >= 500) {
        logger.error?.(`[cloud-gateway] ${req.method} ${req.url} → ${gatewayError.status} ${gatewayError.code}`);
      }
      if (!res.headersSent) sendJson(res, gatewayError.status, gatewayError.toJSON());
      else res.end();
    });
  });

  const relay = createAsrRelay({
    httpServer: server,
    store: stateStore,
    auth,
    budget,
    env,
    now,
    upstreamFactory: asrUpstreamFactory,
    maxSessionSeconds: asrMaxSessionSeconds,
    logger,
  });

  async function authenticate(req, url, scope) {
    const token = extractBearerToken(req.headers, url.searchParams);
    const fingerprint = extractFingerprint(req.headers, url.searchParams);
    const verdict = await auth.verifyToken(token, {fingerprint, requiredScope: scope});
    if (!verdict.ok) throw fail(verdict.status, verdict.code, verdict.message);
    return verdict.claims;
  }

  async function enforceRate({claims, group}) {
    const result = await stateStore.consumeRate({
      bucket: `http:${claims.deviceId}:${group}`,
      windowMs: rateWindowMs,
      limit: rateLimit,
    });
    if (!result.allowed) {
      throw fail(429, "RATE_LIMITED", "请求过于频繁，请稍后再试", {
        retryAfterMs: result.retryAfterMs,
        resetAt: new Date(result.resetAt).toISOString(),
      });
    }
    return result;
  }

  async function runPaid({claims, group, kind, estimateMicros, execute, actualMicrosOf}) {
    await enforceRate({claims, group});
    const reservation = await budget.reserve({kind, micros: estimateMicros, ref: `${group}:${claims.deviceId}`});
    try {
      const result = await execute();
      const actual = Math.max(0, Math.min(estimateMicros, actualMicrosOf(result)));
      await budget.commit({reservationId: reservation.reservationId, actualMicros: actual});
      return {result, billing: {costCny: Number((actual / 1_000_000).toFixed(6)), reservedCny: Number((estimateMicros / 1_000_000).toFixed(6))}};
    } catch (error) {
      await budget.rollback({reservationId: reservation.reservationId});
      throw error;
    }
  }

  async function handleRequest(req, res) {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      throw fail(400, "BAD_URL", "请求 URL 不合法");
    }
    const requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", requestId);

    if (req.method === "GET" && url.pathname === "/health") {
      const asr = resolveAsrConfig({env});
      sendJson(res, 200, {
        ok: true,
        service: "alw001-cloud-gateway",
        version: GATEWAY_VERSION,
        stateDriver: stateStore.driver,
        now: new Date(now()).toISOString(),
        providers: {
          deepseek: deepseek.probe().configured,
          doubao: doubao.probe().configured,
          asr: asr.configured,
          asrUpstream: asr.provider,
        },
        asrMaxSessionSeconds: relay.sessionMaxSeconds,
        limits: {rateLimitPerWindow: rateLimit, rateWindowMs},
        endpoints: ENDPOINTS.length,
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/token") {
      const admin = auth.verifyAdminToken(extractAdminToken(req.headers));
      if (!admin.ok) throw fail(admin.status, admin.code, admin.message);
      const body = await readJsonBody(req, 16 * 1024);
      const issued = await auth.issueDeviceToken({
        deviceId: body.deviceId,
        fingerprint: body.fingerprint,
        scopes: body.scopes,
        ttlSeconds: body.ttlSeconds,
      });
      sendJson(res, 201, issued);
      return;
    }

    if (req.method === "POST" && url.pathname === "/auth/revoke") {
      const body = await readJsonBody(req, 16 * 1024);
      const admin = auth.verifyAdminToken(extractAdminToken(req.headers));
      if (admin.ok) {
        if (body.jti) {
          sendJson(res, 200, {ok: true, ...await auth.revokeToken({jti: body.jti})});
          return;
        }
        if (body.fingerprint) {
          sendJson(res, 200, {ok: true, ...await auth.revokeDevice({fingerprint: body.fingerprint})});
          return;
        }
        throw fail(400, "REVOKE_TARGET_REQUIRED", "需要 jti 或 fingerprint");
      }

      const claims = await (async () => {
        const token = extractBearerToken(req.headers, url.searchParams);
        const fingerprint = extractFingerprint(req.headers, url.searchParams);
        const verdict = await auth.verifyToken(token, {fingerprint});
        if (!verdict.ok) throw fail(verdict.status, verdict.code, verdict.message);
        return verdict.claims;
      })();
      const result = await auth.revokeToken({jti: claims.jti});
      sendJson(res, 200, {ok: true, ...result});
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/status") {
      const claims = await authenticate(req, url, "status");
      sendJson(res, 200, {
        ok: true,
        deviceId: claims.deviceId,
        version: GATEWAY_VERSION,
        stateDriver: stateStore.driver,
        budgets: await budget.status(),
        asr: await relay.status(),
        rate: {limit: rateLimit, windowMs: rateWindowMs},
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/tts/voices") {
      await authenticate(req, url, "tts");
      sendJson(res, 200, {ok: true, provider: "doubao", voices: doubao.voices, maxChars: MAX_TTS_CHARS});
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/asr/status") {
      await authenticate(req, url, "asr");
      sendJson(res, 200, {ok: true, asr: await relay.status()});
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/translate") {
      const claims = await authenticate(req, url, "ai");
      const body = await readJsonBody(req);
      assertNoProfileFields(body);
      requireConsent(body?.consent);
      if (typeof body?.text !== "string" || body.text.length === 0) {
        throw fail(400, "INVALID_INPUT", "缺少待翻译句子");
      }
      if (body.text.length > MAX_SENTENCE_CHARS) {
        throw fail(400, "TEXT_TOO_LARGE", `单句超过 ${MAX_SENTENCE_CHARS} 字上限`);
      }
      if (!/[A-Za-z]/.test(body.text)) {
        sendJson(res, 200, {ok: true, zh: body.text, mode: "passthrough", provider: "deepseek", billing: {costCny: 0}});
        return;
      }
      const estimateMicros = budget.estimateDeepSeekMaxMicros({inputChars: body.text.length, maxOutputTokens: 300});
      const {result, billing} = await runPaid({
        claims,
        group: "ai:translate",
        kind: BUDGET_KEYS.deepseek,
        estimateMicros,
        execute: () => deepseek.translate({text: body.text, consent: body.consent}),
        actualMicrosOf: (value) => budget.deepSeekActualMicros(value.usage) || estimateMicros,
      });
      sendJson(res, 200, {...result, billing, budget: await budget.budgetView(BUDGET_KEYS.deepseek)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/draft-en") {
      const claims = await authenticate(req, url, "ai");
      const body = await readJsonBody(req);
      assertNoProfileFields(body);
      requireConsent(body?.consent);
      if (typeof body?.text !== "string" || body.text.length === 0) {
        throw fail(400, "INVALID_INPUT", "缺少中文内容");
      }
      if (body.text.length > MAX_DRAFT_CHARS) {
        throw fail(400, "TEXT_TOO_LARGE", `中文内容超过 ${MAX_DRAFT_CHARS} 字上限`);
      }
      if (!/[\u3400-\u9fff]/.test(body.text)) {
        sendJson(res, 200, {ok: true, en: body.text, mode: "passthrough", provider: "deepseek", draft: true, billing: {costCny: 0}});
        return;
      }
      const estimateMicros = budget.estimateDeepSeekMaxMicros({inputChars: body.text.length, maxOutputTokens: 400});
      const {result, billing} = await runPaid({
        claims,
        group: "ai:draft-en",
        kind: BUDGET_KEYS.deepseek,
        estimateMicros,
        execute: () => deepseek.draftEn({text: body.text, consent: body.consent}),
        actualMicrosOf: (value) => budget.deepSeekActualMicros(value.usage) || estimateMicros,
      });
      sendJson(res, 200, {...result, billing, budget: await budget.budgetView(BUDGET_KEYS.deepseek)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/ai/analyze") {
      const claims = await authenticate(req, url, "ai");
      const body = await readJsonBody(req);
      assertNoProfileFields(body);
      requireConsent(body?.consent);
      if (!Array.isArray(body?.messages) || body.messages.length < 1 || body.messages.length > 12) {
        throw fail(400, "INVALID_INPUT", "需要 1–12 句对话");
      }
      const inputChars = body.messages.reduce((sum, message) => sum + String(message?.text || "").length, 0);
      const estimateMicros = budget.estimateDeepSeekMaxMicros({inputChars, maxOutputTokens: 620});
      const {result, billing} = await runPaid({
        claims,
        group: "ai:analyze",
        kind: BUDGET_KEYS.deepseek,
        estimateMicros,
        execute: () => deepseek.analyze({messages: body.messages, consent: body.consent}),
        actualMicrosOf: (value) => budget.deepSeekActualMicros(value.usage) || estimateMicros,
      });
      sendJson(res, 200, {...result, billing, budget: await budget.budgetView(BUDGET_KEYS.deepseek)});
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/tts/synthesize") {
      const claims = await authenticate(req, url, "tts");
      const body = await readJsonBody(req);
      assertNoProfileFields(body);
      if (body?.provider && String(body.provider) !== "doubao") {
        throw fail(400, "INVALID_PROVIDER", "薄网关当前只支持 doubao");
      }
      if (requireTtsConsentFlag) requireTtsConsent(body?.consent);
      const source = assertTtsText(body?.text);

      const idempotencyKey = String(req.headers["idempotency-key"] || body?.idempotencyKey || "").trim();
      const requestHash = sha256Hex(JSON.stringify({
        text: source,
        voiceId: String(body?.voiceId || ""),
        locale: String(body?.locale || ""),
        rate: Number(body?.rate || 1),
      }));

      if (idempotencyKey) {
        if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
          throw fail(400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key 必须是 8–128 位字母、数字或 . _ : -");
        }
        const claim = await stateStore.claimIdempotency({key: idempotencyKey, requestHash});
        if (claim.state === "conflict") throw fail(409, "IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同请求");
        if (claim.state === "in_progress") throw fail(409, "IDEMPOTENCY_IN_PROGRESS", "同一幂等键的请求仍在处理中");
        if (claim.state === "replay") {
          sendJson(res, claim.statusCode || 200, {...claim.response, replayed: true});
          return;
        }
      }

      const costMicros = budget.ttsCostMicros(source.length);
      let reservation;
      try {
        await enforceRate({claims, group: "tts:synthesize"});
        reservation = await budget.reserve({kind: BUDGET_KEYS.ttsDoubao, micros: costMicros, ref: `tts:${claims.deviceId}`});
      } catch (error) {
        if (idempotencyKey) await stateStore.releaseIdempotency({key: idempotencyKey});
        throw error;
      }

      try {
        const synthesized = await doubao.synthesize({
          text: source,
          voiceId: body?.voiceId,
          locale: body?.locale,
          rate: body?.rate,
          consent: body?.consent,
        });
        const actual = budget.ttsCostMicros(source.length);
        await budget.commit({reservationId: reservation.reservationId, actualMicros: actual});
        const response = {
          ok: true,
          provider: "doubao",
          modelVersion: synthesized.modelVersion,
          voiceId: synthesized.voiceId,
          mimeType: synthesized.mimeType,
          bytes: synthesized.bytes.length,
          audioSha256: synthesized.audioSha256,
          textSha256: synthesized.textSha256,
          audioBase64: synthesized.bytes.toString("base64"),
          usage: synthesized.usage,
          warnings: synthesized.warnings,
          billing: {costCny: Number((actual / 1_000_000).toFixed(6))},
          budget: await budget.budgetView(BUDGET_KEYS.ttsDoubao),
          stored: false,
        };
        if (idempotencyKey) await stateStore.completeIdempotency({key: idempotencyKey, statusCode: 200, response});
        sendJson(res, 200, {...response, replayed: false});
      } catch (error) {
        await budget.rollback({reservationId: reservation.reservationId});
        if (idempotencyKey) await stateStore.releaseIdempotency({key: idempotencyKey});
        throw error;
      }
      return;
    }

    throw fail(404, "NOT_FOUND", "没有这个端点");
  }

  return {
    server,
    relay,
    store: stateStore,
    auth,
    budget,
    deepseek,
    doubao,
    endpoints: ENDPOINTS.map(([method, pathname, description]) => ({method, pathname, description})),
    async listen({port = Number(env.PORT || 8783), host = String(env.HOST || "127.0.0.1")} = {}) {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve();
        });
      });
      return server.address();
    },
    async close() {
      await relay.close();
      if (server.listening) {
        await new Promise((resolve) => server.close(() => resolve()));
      }
      await stateStore.purgeIdempotency?.({olderThanMs: idempotencyTtlMs});
      if (ownsStore) await stateStore.close();
    },
  };
}

/* ------------------------------ 直接运行 ------------------------------ */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const gateway = await createGatewayServer({});
  const address = await gateway.listen({});
  const asr = resolveAsrConfig({env: process.env});
  console.log(`[cloud-gateway] listening on http://${address.address}:${address.port}`);
  console.log(`[cloud-gateway] state driver=${gateway.store.driver} version=${GATEWAY_VERSION}`);
  console.log(`[cloud-gateway] deepseek=${gateway.deepseek.probe().configured} doubao=${gateway.doubao.probe().configured} asr=${asr.configured}(${asr.provider})`);
  const shutdown = async () => {
    await gateway.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}