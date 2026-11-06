/**
 * 设备短期令牌：签发 / 校验 / 撤销。
 *
 * 设计要点：
 * - 令牌 = smk1.<base64url(payload)>.<base64url(HMAC-SHA256)>；
 * - 服务端只存 token 的 sha256 与设备指纹的 sha256，数据库泄露也拿不到可用令牌；
 * - 校验时签名、令牌哈希、设备指纹哈希都用常量时间比较；
 * - 令牌可被服务端按 jti 立即撤销，TTL 默认 1 小时、最长 7 天；
 * - master secret 与 admin token 只从环境变量读取，不写入日志与响应。
 */
import crypto from "node:crypto";
import {fail, GatewayError} from "./errors.mjs";
import {sha256Hex} from "./state-store.mjs";

export const TOKEN_VERSION = "smk1";
export const DEFAULT_TTL_SECONDS = 3600;
export const MAX_TTL_SECONDS = 7 * 24 * 3600;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{3,64}$/;
const JTI_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function b64url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

/**
 * 常量时间比较字符串。
 * 长度不同直接 false（长度本身不是秘密），长度相同时再走 timingSafeEqual。
 */
export function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left ?? ""), "utf8");
  const b = Buffer.from(String(right ?? ""), "utf8");
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signPayload(secret, encodedPayload) {
  return b64url(crypto.createHmac("sha256", secret).update(encodedPayload).digest());
}

function readSecret(env) {
  const secret = String(env.CLOUD_GATEWAY_TOKEN_SECRET || "").trim();
  if (secret.length < 32) {
    throw new Error("CLOUD_GATEWAY_TOKEN_SECRET 未配置或太短（至少 32 字符）：拒绝启动，避免无签名令牌");
  }
  return secret;
}

/**
 * @param {{store: object, env?: object, now?: () => number, secret?: string, adminToken?: string}} options
 */
export function createAuthService({store, env = process.env, now = Date.now, secret, adminToken} = {}) {
  const masterSecret = secret || readSecret(env);
  const admin = adminToken !== undefined ? adminToken : String(env.CLOUD_GATEWAY_ADMIN_TOKEN || "").trim();

  async function issueDeviceToken({deviceId, fingerprint, scopes = ["ai", "tts", "asr", "status"], ttlSeconds = DEFAULT_TTL_SECONDS} = {}) {
    const id = String(deviceId || "").trim();
    if (!DEVICE_ID_PATTERN.test(id)) {
      throw fail(400, "INVALID_DEVICE_ID", "deviceId 必须是 3–64 位字母、数字或 . _ : -");
    }
    const fp = String(fingerprint || "").trim();
    if (fp.length < 8 || fp.length > 256) {
      throw fail(400, "INVALID_DEVICE_FINGERPRINT", "设备指纹长度必须是 8–256 字符");
    }
    const ttl = Number(ttlSeconds);
    if (!Number.isFinite(ttl) || ttl < 60 || ttl > MAX_TTL_SECONDS) {
      throw fail(400, "INVALID_TTL", `令牌有效期必须是 60–${MAX_TTL_SECONDS} 秒`);
    }
    const list = Array.isArray(scopes) ? [...new Set(scopes.map(String))].filter(Boolean) : [];
    if (list.length === 0) throw fail(400, "INVALID_SCOPES", "至少需要一个 scope");
    if (list.some((scope) => !/^(ai|tts|asr|status)$/.test(scope))) {
      throw fail(400, "INVALID_SCOPES", "scope 只能是 ai / tts / asr / status");
    }

    const issuedAt = now();
    const expiresAt = issuedAt + Math.round(ttl) * 1000;
    const jti = crypto.randomUUID();
    const fingerprintHash = sha256Hex(fp);
    const payload = {v: 1, jti, sub: id, fp: fingerprintHash, sc: list, iat: issuedAt, exp: expiresAt};
    const encoded = b64url(JSON.stringify(payload));
    const token = `${TOKEN_VERSION}.${encoded}.${signPayload(masterSecret, encoded)}`;

    await store.insertToken({
      jti,
      tokenHash: sha256Hex(token),
      deviceFingerprint: fingerprintHash,
      scopes: list,
      issuedAt,
      expiresAt,
    });

    return {
      ok: true,
      token,
      tokenType: "Bearer",
      jti,
      deviceId: id,
      scopes: list,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
      ttlSeconds: Math.round(ttl),
    };
  }

  /**
   * 校验令牌。返回判定对象而不是抛异常，方便 WebSocket 握手直接决定拒绝码。
   * @returns {{ok: true, claims: object} | {ok: false, status: number, code: string, message: string}}
   */
  async function verifyToken(token, {fingerprint, requiredScope} = {}) {
    const raw = String(token || "").trim();
    if (!raw) return {ok: false, status: 401, code: "TOKEN_REQUIRED", message: "缺少设备令牌"};
    const parts = raw.split(".");
    if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) {
      return {ok: false, status: 401, code: "TOKEN_INVALID", message: "设备令牌格式无效"};
    }
    const [, encoded, signature] = parts;
    const expected = signPayload(masterSecret, encoded);
    if (!constantTimeEqual(signature, expected)) {
      return {ok: false, status: 401, code: "TOKEN_BAD_SIGNATURE", message: "设备令牌签名无效"};
    }

    let payload;
    try {
      payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      return {ok: false, status: 401, code: "TOKEN_INVALID", message: "设备令牌载荷无效"};
    }
    if (!payload || typeof payload !== "object" || !JTI_PATTERN.test(String(payload.jti || ""))) {
      return {ok: false, status: 401, code: "TOKEN_INVALID", message: "设备令牌载荷无效"};
    }
    if (!Number.isFinite(payload.exp) || payload.exp <= now()) {
      return {ok: false, status: 401, code: "TOKEN_EXPIRED", message: "设备令牌已过期"};
    }

    const stored = await store.findToken({jti: payload.jti, tokenHash: sha256Hex(raw)});
    if (!stored) return {ok: false, status: 401, code: "TOKEN_UNKNOWN", message: "设备令牌不存在"};
    if (stored.revokedAt !== null) {
      return {ok: false, status: 401, code: "TOKEN_REVOKED", message: "设备令牌已被撤销"};
    }
    if (stored.expiresAt <= now()) {
      return {ok: false, status: 401, code: "TOKEN_EXPIRED", message: "设备令牌已过期"};
    }

    const providedFingerprint = String(fingerprint || "").trim();
    if (!providedFingerprint) {
      return {ok: false, status: 403, code: "DEVICE_FINGERPRINT_REQUIRED", message: "缺少设备指纹"};
    }
    if (!constantTimeEqual(sha256Hex(providedFingerprint), stored.deviceFingerprint)) {
      return {ok: false, status: 403, code: "DEVICE_MISMATCH", message: "设备指纹与令牌绑定不一致"};
    }
    if (!constantTimeEqual(payload.fp, stored.deviceFingerprint)) {
      return {ok: false, status: 401, code: "TOKEN_INVALID", message: "设备令牌绑定信息不一致"};
    }

    const scopes = stored.scopes;
    if (requiredScope && !scopes.includes(requiredScope)) {
      return {ok: false, status: 403, code: "SCOPE_FORBIDDEN", message: `令牌缺少 ${requiredScope} 权限`};
    }

    return {
      ok: true,
      claims: {
        jti: stored.jti,
        deviceId: payload.sub,
        scopes,
        issuedAt: stored.issuedAt,
        expiresAt: stored.expiresAt,
      },
    };
  }

  /** 管理令牌校验：只比较 sha256，避免长度差异泄露。 */
  function verifyAdminToken(token) {
    if (!admin) return {ok: false, status: 501, code: "ADMIN_NOT_CONFIGURED", message: "服务端未配置管理令牌"};
    const provided = String(token || "").trim();
    if (!provided) return {ok: false, status: 401, code: "ADMIN_TOKEN_REQUIRED", message: "缺少管理令牌"};
    if (!constantTimeEqual(sha256Hex(provided), sha256Hex(admin))) {
      return {ok: false, status: 401, code: "ADMIN_TOKEN_INVALID", message: "管理令牌无效"};
    }
    return {ok: true};
  }

  async function revokeToken({jti}) {
    if (!JTI_PATTERN.test(String(jti || ""))) throw fail(400, "INVALID_JTI", "jti 格式不合法");
    return await store.revokeToken({jti});
  }

  async function revokeDevice({fingerprint}) {
    const fp = String(fingerprint || "").trim();
    if (fp.length < 8) throw fail(400, "INVALID_DEVICE_FINGERPRINT", "设备指纹长度不足");
    return await store.revokeDevice({deviceFingerprint: sha256Hex(fp)});
  }

  return {issueDeviceToken, verifyToken, verifyAdminToken, revokeToken, revokeDevice};
}

/** 从 Authorization / x-device-token 读取令牌；query 参数仅给浏览器 WebSocket 用。 */
export function extractBearerToken(headers = {}, query = null) {
  const direct = String(headers["x-device-token"] || "").trim();
  if (direct) return direct;
  const auth = String(headers.authorization || "").trim();
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  if (match) return match[1];
  if (query) {
    const fromQuery = String(query.get("token") || "").trim();
    if (fromQuery) return fromQuery;
  }
  return "";
}

export function extractFingerprint(headers = {}, query = null) {
  const direct = String(headers["x-device-fingerprint"] || "").trim();
  if (direct) return direct;
  if (query) return String(query.get("fp") || "").trim();
  return "";
}

/** 管理令牌支持 x-admin-token 或 Authorization: Bearer。 */
export function extractAdminToken(headers = {}) {
  const direct = String(headers["x-admin-token"] || "").trim();
  if (direct) return direct;
  const auth = String(headers.authorization || "").trim();
  const match = /^Bearer\s+(\S+)$/i.exec(auth);
  return match ? match[1] : "";
}

export {GatewayError};