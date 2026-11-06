/**
 * ASR WebSocket 中继：手机 → 本网关 → 腾讯云 / P066。
 *
 * 硬约束（对应计划 C4）：
 * - 逐帧转发：客户端发来的二进制帧原样发往上游，不拆分、不拼包、不做重采样；
 *   客户端必须自行保证 16kHz / PCM16LE / 单声道（Mac 网关内置重采样，这里刻意不做）。
 * - partial 不入库：本文件没有任何状态存储写入，只有会话占用与预算两张表。
 * - final 幂等：同一会话内按 index（或 startMs-endMs）去重，重复 final 不会二次下发。
 * - 300 秒会话上限可配置；到点自动结束并回收。
 * - 断线回收：任一端断开都会清理定时器、关闭另一端、结算预算、释放会话占用。
 * - 鉴权在升级握手完成，未授权直接 HTTP 401/403 拒绝，不建立 WebSocket。
 */
import crypto from "node:crypto";
import {WebSocket, WebSocketServer} from "ws";
import {extractBearerToken, extractFingerprint} from "./auth.mjs";
import {createTencentSignedUrl, ENGINE_EN, ENGINE_SPEAKER, generateVoiceId} from "./tencent-sign.mjs";

const WS_OPEN = 1;
const PCM16_BYTES_PER_SECOND = 16000 * 2;

function readEnv(env, name, fallback = "") {
  const value = String(env[name] ?? "").trim();
  return value || fallback;
}

function numberEnv(env, name, fallback) {
  const value = Number(readEnv(env, name, String(fallback)));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WS_OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function rejectUpgrade(socket, status, code, message) {
  const reasons = {400: "Bad Request", 401: "Unauthorized", 402: "Payment Required", 403: "Forbidden", 429: "Too Many Requests", 503: "Service Unavailable"};
  const body = JSON.stringify({ok: false, code, error: message});
  try {
    socket.write(
      `HTTP/1.1 ${status} ${reasons[status] || "Error"}\r\n` +
      "Connection: close\r\n" +
      "Content-Type: application/json; charset=utf-8\r\n" +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    );
  } catch {
    // 对端可能已经断开。
  }
  socket.destroy();
}

/** 读取 ASR 上游配置；只返回配置状态，不返回任何密钥值。 */
export function resolveAsrConfig({env = process.env} = {}) {
  const requested = readEnv(env, "CLOUD_ASR_UPSTREAM", "tencent").toLowerCase();
  const appId = readEnv(env, "TENCENT_APP_ID");
  const secretId = readEnv(env, "TENCENT_SECRET_ID");
  const secretKey = readEnv(env, "TENCENT_SECRET_KEY");
  const p066Url = readEnv(env, "CLOUD_ASR_P066_URL");
  const p066Token = readEnv(env, "CLOUD_ASR_P066_TOKEN");

  const tencentConfigured = Boolean(appId && secretId && secretKey && /^\d+$/.test(appId));
  const p066Configured = /^wss?:\/\//i.test(p066Url) && Boolean(p066Token);
  const provider = requested === "p066" ? "p066" : requested === "tencent" ? "tencent" : requested;
  const configured = provider === "tencent" ? tencentConfigured : provider === "p066" ? p066Configured : false;

  return {
    provider,
    configured,
    reason: configured ? null : provider === "tencent" ? "TENCENT_CREDENTIALS_NOT_FOUND" : provider === "p066" ? "P066_NOT_CONFIGURED" : "INVALID_UPSTREAM",
    tencentConfigured,
    p066Configured,
    budgets: {tencent: "asr:tencent", p066: "asr:p066"},
  };
}

function buildDefaultUpstreamFactory({env, config}) {
  return ({provider, track, sessionId}) => {
    if (provider === "tencent") {
      const engineModelType = track === "mix"
        ? readEnv(env, "TENCENT_ENGINE_SPEAKER", ENGINE_SPEAKER)
        : readEnv(env, "TENCENT_ENGINE_EN", ENGINE_EN);
      const {url} = createTencentSignedUrl({
        appId: readEnv(env, "TENCENT_APP_ID"),
        secretId: readEnv(env, "TENCENT_SECRET_ID"),
        secretKey: readEnv(env, "TENCENT_SECRET_KEY"),
        engineModelType,
        voiceId: generateVoiceId(),
        extraParams: track === "mix" ? {speaker_diarization: 1} : {},
      });
      return new WebSocket(url);
    }
    if (provider === "p066") {
      const url = new URL(readEnv(env, "CLOUD_ASR_P066_URL"));
      url.searchParams.set("engine", readEnv(env, "CLOUD_ASR_P066_ENGINE", "16k_zh_en_speaker_2.0"));
      url.searchParams.set("rate", "16000");
      url.searchParams.set("channels", "1");
      url.searchParams.set("track", track);
      url.searchParams.set("sessionId", sessionId);
      return new WebSocket(url.toString(), {
        headers: {"x-asr-token": readEnv(env, "CLOUD_ASR_P066_TOKEN")},
        handshakeTimeout: 10000,
      });
    }
    throw new Error(`未配置的 ASR 上游：${provider}`);
  };
}

/**
 * 把上游消息归一化成手机端事件。
 * @returns {{kind: "ready"|"end"|"error"|"budget"|"event"|"ignore", event?: object}}
 */
export function normalizeUpstreamMessage(message, {provider, sessionId, track, mock = false} = {}) {
  if (!message || typeof message !== "object") return {kind: "ignore"};

  if (provider === "p066") {
    const type = String(message.type || "");
    if (type === "session") {
      const status = String(message.status || "");
      if (status === "ready" || status === "connecting") return {kind: "ready", provider};
      if (status === "end" || status === "ended") return {kind: "end"};
      return {kind: "ignore"};
    }
    if (type === "interim" || type === "final") {
      return {
        kind: "event",
        event: {
          type: type === "final" ? "final" : "interim",
          sessionId,
          provider,
          track,
          text: String(message.text || ""),
          startMs: Number(message.startMs || 0),
          endMs: Number(message.endMs || 0),
          speaker: String(message.speaker || "unknown"),
          confidence: null,
          final: type === "final",
          mock,
          index: message.index,
        },
      };
    }
    if (type === "budget") {
      return {
        kind: "budget",
        event: {
          type: "budget",
          sessionId,
          provider,
          remainingCny: message.remainingCny,
          spentCny: message.spentCny,
          costCny: message.costCny,
          seconds: message.seconds,
        },
      };
    }
    if (type === "error") {
      return {kind: "error", code: String(message.code || "ASR_UPSTREAM_ERROR"), message: "上游 ASR 返回错误"};
    }
    return {kind: "ignore"};
  }

  // 腾讯云 v2：code=0 表示握手/正常；final=1 表示结束；result / sentences 承载识别文本。
  const code = Number(message.code);
  if (Number.isFinite(code) && code !== 0) {
    return {kind: "error", code: `ASR_UPSTREAM_${code}`, message: `腾讯云 ASR 返回错误码 ${code}`};
  }
  if (Number.isFinite(code) && code === 0 && !message.result && !message.sentences && message.final !== 1) {
    return {kind: "ready", provider};
  }
  if (message.final === 1) return {kind: "end"};
  if (message.sentences) {
    const list = Array.isArray(message.sentences)
      ? message.sentences
      : Array.isArray(message.sentences.sentence_list) ? message.sentences.sentence_list : [message.sentences];
    const events = [];
    for (const sentence of list) {
      if (!sentence) continue;
      const text = String(sentence.sentence ?? "").trim();
      if (!text) continue;
      const final = sentence.sentence_type === 1;
      events.push({
        type: final ? "final" : "interim",
        sessionId,
        provider,
        track,
        text,
        startMs: Number(sentence.start_time || 0),
        endMs: Number(sentence.end_time || 0),
        speaker: sentence.speaker_id === undefined ? (track === "mix" ? "unknown" : track) : `spk_${sentence.speaker_id}`,
        confidence: null,
        final,
        mock,
        index: sentence.sentence_id,
      });
    }
    return events.length ? {kind: "events", events} : {kind: "ignore"};
  }
  if (message.result) {
    const text = String(message.result.voice_text_str ?? "").trim();
    if (!text) return {kind: "ignore"};
    const final = message.result.slice_type === 2;
    return {
      kind: "event",
      event: {
        type: final ? "final" : "interim",
        sessionId,
        provider,
        track,
        text,
        startMs: Number(message.result.start_time || 0),
        endMs: Number(message.result.end_time || 0),
        speaker: message.result.speaker_id === undefined ? (track === "mix" ? "unknown" : track) : `spk_${message.result.speaker_id}`,
        confidence: null,
        final,
        mock,
        index: message.result.index,
      },
    };
  }
  return {kind: "ignore"};
}

/**
 * @param {{httpServer: import("node:http").Server, store: object, auth: object, budget: object,
 *          env?: object, now?: () => number, upstreamFactory?: Function,
 *          maxSessionSeconds?: number, setTimeoutFn?: Function, clearTimeoutFn?: Function,
 *          logger?: object}} options
 */
export function createAsrRelay({
  httpServer,
  store,
  auth,
  budget,
  env = process.env,
  now = Date.now,
  upstreamFactory,
  maxSessionSeconds,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
  logger = console,
} = {}) {
  const config = resolveAsrConfig({env});
  const sessionMaxSeconds = Number.isFinite(Number(maxSessionSeconds))
    ? Number(maxSessionSeconds)
    : numberEnv(env, "CLOUD_ASR_MAX_SESSION_SECONDS", 300);
  const maxConcurrentPerDevice = Math.max(1, numberEnv(env, "CLOUD_ASR_MAX_CONCURRENT_PER_DEVICE", 2));
  const maxAudioBytes = Math.max(PCM16_BYTES_PER_SECOND, sessionMaxSeconds * PCM16_BYTES_PER_SECOND + 4096);
  const upstream = upstreamFactory || buildDefaultUpstreamFactory({env, config});
  const budgetKind = config.provider === "p066" ? "asr:p066" : "asr:tencent";

  const wss = new WebSocketServer({noServer: true, perMessageDeflate: false});
  const sessions = new Map();
  let closed = false;

  async function status() {
    const activeSessions = await store.countSessions({kind: "asr"});
    const budgetView = await budget.budgetView(budgetKind);
    return {
      provider: config.provider,
      configured: config.configured,
      reason: config.reason,
      activeSessions,
      maxSessionSeconds: sessionMaxSeconds,
      maxConcurrentPerDevice,
      budget: budgetView,
      inputFormat: {sampleRate: 16000, channels: 1, encoding: "pcm16le"},
      relay: "frame-by-frame",
      partialStored: false,
    };
  }

  async function handleUpgrade(req, socket, head) {
    socket.on("error", () => {});
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    } catch {
      rejectUpgrade(socket, 400, "BAD_URL", "升级请求 URL 不合法");
      return;
    }
    if (url.pathname !== "/v1/asr/stream") {
      rejectUpgrade(socket, 400, "UNKNOWN_ASR_PATH", "未知的 ASR WebSocket 路径");
      return;
    }
    if (closed) {
      rejectUpgrade(socket, 503, "GATEWAY_CLOSING", "网关正在关闭");
      return;
    }

    const token = extractBearerToken(req.headers, url.searchParams);
    const fingerprint = extractFingerprint(req.headers, url.searchParams);
    const verdict = await auth.verifyToken(token, {fingerprint, requiredScope: "asr"});
    if (!verdict.ok) {
      rejectUpgrade(socket, verdict.status, verdict.code, verdict.message);
      return;
    }

    if (!config.configured) {
      rejectUpgrade(socket, 503, "ASR_NOT_CONFIGURED", "ASR 上游未配置：缺少厂商凭证或 P066 配置");
      return;
    }

    const sessionId = crypto.randomUUID();
    const opened = await store.openSession({
      id: sessionId,
      deviceId: verdict.claims.deviceId,
      kind: "asr",
      ttlMs: sessionMaxSeconds * 1000 + 5000,
      maxConcurrent: maxConcurrentPerDevice,
    });
    if (!opened.ok) {
      rejectUpgrade(socket, 429, "SESSION_LIMIT", "该设备并发语音会话已达上限");
      return;
    }

    let reservation;
    try {
      reservation = await budget.reserve({
        kind: budgetKind,
        micros: budget.asrCostMicros(sessionMaxSeconds),
        ref: `asr:${sessionId}`,
      });
    } catch (error) {
      await store.closeSession({id: sessionId});
      rejectUpgrade(socket, error.status || 402, error.code || "BUDGET_EXHAUSTED", error.message || "ASR 预算不足");
      return;
    }

    const track = ["A", "B", "mix"].includes(String(url.searchParams.get("track") || ""))
      ? String(url.searchParams.get("track"))
      : "mix";

    wss.handleUpgrade(req, socket, head, (ws) => {
      startSession(ws, {sessionId, claims: verdict.claims, reservation, track, mock: false});
    });
  }

  function startSession(client, {sessionId, claims, reservation, track, mock}) {
    const state = {
      id: sessionId,
      deviceId: claims.deviceId,
      client,
      track,
      mock,
      inputBytes: 0,
      startedAt: now(),
      finished: false,
      upstream: null,
      maxTimer: null,
      endTimer: null,
      finalSeen: new Set(),
      reservationId: reservation.reservationId,
      upstreamReady: false,
    };
    sessions.set(sessionId, state);

    sendJson(client, {
      type: "session",
      status: "connecting",
      sessionId,
      provider: config.provider,
      track,
      mock,
      inputFormat: {sampleRate: 16000, channels: 1, encoding: "pcm16le"},
      maxSessionSeconds: sessionMaxSeconds,
    });

    async function settleBudget() {
      const seconds = Math.min(sessionMaxSeconds, state.inputBytes / PCM16_BYTES_PER_SECOND);
      const micros = budget.asrCostMicros(seconds);
      try {
        await budget.commit({reservationId: state.reservationId, actualMicros: micros});
      } catch {
        await budget.rollback({reservationId: state.reservationId});
      }
      return {seconds: Number(seconds.toFixed(3)), costCny: Number((micros / 1_000_000).toFixed(6))};
    }

    async function finish(reason, {notifyClient = true, closeCode = 1000} = {}) {
      if (state.finished) return;
      state.finished = true;
      sessions.delete(sessionId);
      if (state.maxTimer) clearTimeoutFn(state.maxTimer);
      if (state.endTimer) clearTimeoutFn(state.endTimer);
      state.maxTimer = null;
      state.endTimer = null;

      if (state.upstream) {
        try {
          state.upstream.close();
        } catch {
          // 上游可能已断开。
        }
      }
      await store.closeSession({id: sessionId});
      const usage = await settleBudget();
      if (notifyClient) {
        sendJson(client, {
          type: "session",
          status: reason === "error" ? "error" : "ended",
          sessionId,
          provider: config.provider,
          track,
          mock,
          reason,
          final: true,
          usage,
        });
        setTimeoutFn(() => {
          try {
            if (client.readyState === WS_OPEN) client.close(closeCode, `session-${reason}`.slice(0, 123));
          } catch {
            // 已断开。
          }
        }, 20);
      } else {
        try {
          client.terminate();
        } catch {
          // 已断开。
        }
      }
    }

    function emitEvent(event) {
      if (state.finished) return;
      if (event.type === "final") {
        const key = event.index !== undefined && event.index !== null
          ? `i:${event.index}`
          : `t:${event.startMs}-${event.endMs}:${event.text}`;
        if (state.finalSeen.has(key)) return;
        state.finalSeen.add(key);
      }
      sendJson(client, event);
    }

    function handleUpstreamMessage(raw) {
      const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
      let message;
      try {
        message = JSON.parse(text);
      } catch {
        return;
      }
      const normalized = normalizeUpstreamMessage(message, {
        provider: config.provider,
        sessionId,
        track,
        mock: state.mock,
      });
      if (normalized.kind === "ready") {
        state.upstreamReady = true;
        sendJson(client, {
          type: "session",
          status: "ready",
          sessionId,
          provider: config.provider,
          track,
          mock: state.mock,
          engine: message.engine || null,
        });
        return;
      }
      if (normalized.kind === "end") {
        void finish("upstream-end");
        return;
      }
      if (normalized.kind === "error") {
        sendJson(client, {
          type: "error",
          sessionId,
          provider: config.provider,
          track,
          mock: state.mock,
          code: normalized.code,
          message: normalized.message,
          final: false,
        });
        void finish("error", {closeCode: 1011});
        return;
      }
      if (normalized.kind === "budget") {
        sendJson(client, {...normalized.event, provider: config.provider, mock: state.mock});
        return;
      }
      if (normalized.kind === "event") {
        emitEvent(normalized.event);
        return;
      }
      if (normalized.kind === "events") {
        for (const event of normalized.events) emitEvent(event);
      }
    }

    try {
      state.upstream = upstream({provider: config.provider, track, sessionId, mock});
    } catch (error) {
      logger.warn?.(`[cloud-gateway/asr] 创建上游失败 session=${sessionId}：${error.message}`);
      sendJson(client, {
        type: "error",
        sessionId,
        code: "ASR_UPSTREAM_CREATE_FAILED",
        message: "创建 ASR 上游连接失败",
        final: false,
        mock: state.mock,
      });
      void finish("error", {closeCode: 1011});
      return;
    }

    state.upstream.on("message", handleUpstreamMessage);
    state.upstream.on("error", () => {
      sendJson(client, {
        type: "error",
        sessionId,
        code: "ASR_UPSTREAM_ERROR",
        message: "ASR 上游连接异常",
        final: false,
        mock: state.mock,
      });
      void finish("error", {closeCode: 1011});
    });
    state.upstream.on("close", () => {
      if (!state.finished) void finish("upstream-close");
    });

    client.on("message", (data, isBinary) => {
      if (state.finished) return;
      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        state.inputBytes += buffer.length;
        if (state.inputBytes > maxAudioBytes) {
          sendJson(client, {
            type: "error",
            sessionId,
            code: "ASR_AUDIO_LIMIT",
            message: "音频数据超过会话上限",
            final: false,
            mock: state.mock,
          });
          void finish("audio-limit", {closeCode: 1013});
          return;
        }
        if (state.upstream && state.upstream.readyState === WS_OPEN) {
          state.upstream.send(buffer, {binary: true});
        }
        return;
      }

      let message;
      try {
        message = JSON.parse(Buffer.isBuffer(data) ? data.toString("utf8") : String(data));
      } catch {
        sendJson(client, {
          type: "error",
          sessionId,
          code: "ASR_BAD_CLIENT_JSON",
          message: "客户端消息必须是 JSON",
          final: false,
          mock: state.mock,
        });
        return;
      }
      if (message?.type === "end") {
        if (state.upstream && state.upstream.readyState === WS_OPEN) {
          try {
            state.upstream.send(JSON.stringify({type: "end"}));
          } catch {
            // 上游已断开。
          }
        }
        if (!state.endTimer) {
          state.endTimer = setTimeoutFn(() => void finish("client-end"), 10000);
          state.endTimer.unref?.();
        }
      }
    });

    client.on("close", () => {
      if (!state.finished) void finish("client-close", {notifyClient: false});
    });
    client.on("error", () => {
      if (!state.finished) void finish("client-error", {notifyClient: false});
    });

    if (sessionMaxSeconds > 0) {
      state.maxTimer = setTimeoutFn(() => {
        if (state.finished) return;
        sendJson(client, {
          type: "error",
          sessionId,
          code: "ASR_SESSION_LIMIT",
          message: `已到单次录音上限 ${sessionMaxSeconds} 秒，自动结束`,
          final: false,
          mock: state.mock,
        });
        const upstreamSocket = state.upstream;
        if (upstreamSocket && upstreamSocket.readyState === WS_OPEN) {
          try {
            upstreamSocket.send(JSON.stringify({type: "end"}));
          } catch {
            // 上游已断开。
          }
        }
        void finish("session-limit", {closeCode: 1013});
      }, sessionMaxSeconds * 1000);
      state.maxTimer.unref?.();
    }
  }

  httpServer.on("upgrade", (req, socket, head) => {
    handleUpgrade(req, socket, head).catch((error) => {
      logger.warn?.(`[cloud-gateway/asr] upgrade failed：${error.message}`);
      try {
        socket.destroy();
      } catch {
        // 已断开。
      }
    });
  });

  async function close() {
    if (closed) return;
    closed = true;
    for (const state of [...sessions.values()]) {
      // 直接结束会话：不向客户端补发（连接通常已在关闭流程中）。
      state.finished = true;
      if (state.maxTimer) clearTimeoutFn(state.maxTimer);
      if (state.endTimer) clearTimeoutFn(state.endTimer);
      try {
        state.upstream?.close();
      } catch {
        // 忽略。
      }
      // wss.close() 会等待所有客户端断开：关闭网关时必须主动终止客户端连接。
      try {
        state.client?.terminate();
      } catch {
        // 已断开。
      }
      await store.closeSession({id: state.id});
      try {
        await budget.commit({
          reservationId: state.reservationId,
          actualMicros: budget.asrCostMicros(Math.min(sessionMaxSeconds, state.inputBytes / PCM16_BYTES_PER_SECOND)),
        });
      } catch {
        await budget.rollback({reservationId: state.reservationId});
      }
    }
    sessions.clear();
    await new Promise((resolve) => wss.close(() => resolve()));
  }


  return {wss, status, close, config, sessionMaxSeconds, maxConcurrentPerDevice};
}