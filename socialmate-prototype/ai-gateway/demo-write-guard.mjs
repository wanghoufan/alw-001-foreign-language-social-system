/**
 * 演示写操作的 CSRF / 写授权闸（N04 V1.3 T1-4）。
 *
 * 背景：`confirm:true` 只是「用户表达了意图」，不是身份或权限证明。
 * 任何同源的恶意页面（或一个能构造 POST 的网页）都能带 `confirm:true` 打过来，
 * 因此演示的 clear / restore / confirm / 档案编辑这类**写**操作需要三层：
 *
 * 1. 同源：写请求必须带 Origin（或 Referer），且 host 与本次请求的 Host 一致；
 *    跨源页面带不上我们的 Origin，直接被 403。
 * 2. CSRF：必须带自定义头 `x-sm-write: <ticket>`。自定义头会触发浏览器预检，
 *    而本服务不返回任何 CORS 头，跨源预检必然失败；同时票不可被跨源读取。
 * 3. 写授权：ticket 由本服务短期签发（默认 120 秒）、单次使用、HMAC 签名，
 *    过期/重放/签名不符一律拒绝。签发口令随进程随机生成，不落盘、不进 APK。
 *
 * 读演示仍然免令牌（否则手机首次打开会只剩空白），这里只约束写。
 */
import crypto from "node:crypto";

export const WRITE_HEADER = "x-sm-write";
export const WRITE_TICKET_TTL_MS = 120_000;
const NONCE_KEEP = 512;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(secret, payload) {
  return b64url(crypto.createHmac("sha256", secret).update(payload).digest());
}

/** 同源判定：Origin/Referer 的 host 必须等于本次请求的 Host（含 Tailscale 代理透传）。 */
export function sameOriginOf(req, fallbackPort) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const raw = String(req.headers.origin || "").trim()
    || String(req.headers.referer || "").trim();
  if (!raw) return {ok: false, reason: "ORIGIN_REQUIRED", host};
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {ok: false, reason: "ORIGIN_INVALID", host};
  }
  if (host && parsed.host === host) return {ok: true, host, origin: parsed.origin};
  const local = new Set([`127.0.0.1:${fallbackPort}`, `localhost:${fallbackPort}`]);
  if (parsed.host && local.has(parsed.host) && (!host || local.has(host))) {
    return {ok: true, host, origin: parsed.origin};
  }
  return {ok: false, reason: "ORIGIN_REJECTED", host, origin: parsed.origin};
}

export function createWriteGuard({ttlMs = WRITE_TICKET_TTL_MS, secret} = {}) {
  const key = secret || crypto.randomBytes(32);
  const used = new Map(); // nonce -> exp

  function prune(now) {
    for (const [nonce, exp] of used) {
      if (exp <= now) used.delete(nonce);
    }
    while (used.size > NONCE_KEEP) {
      used.delete(used.keys().next().value);
    }
  }

  function issue() {
    const now = Date.now();
    const exp = now + Math.max(1_000, Number(ttlMs) || WRITE_TICKET_TTL_MS);
    const nonce = b64url(crypto.randomBytes(12));
    const ticket = `${nonce}.${exp}.${sign(key, `write|${nonce}|${exp}`)}`;
    return {ticket, expiresAt: new Date(exp).toISOString(), ttlMs: exp - now};
  }

  /** 校验并消费一张票；无论成功与否都不回显票内容。 */
  function consume(req) {
    const given = String(req.headers[WRITE_HEADER] || "").trim();
    if (!given) return {ok: false, code: "WRITE_TICKET_REQUIRED"};
    const parts = given.split(".");
    if (parts.length !== 3) return {ok: false, code: "WRITE_TICKET_INVALID"};
    const [nonce, expRaw, mac] = parts;
    const exp = Number(expRaw);
    if (!Number.isFinite(exp) || exp <= Date.now()) return {ok: false, code: "WRITE_TICKET_EXPIRED"};
    const expected = sign(key, `write|${nonce}|${exp}`);
    if (mac.length !== expected.length) return {ok: false, code: "WRITE_TICKET_INVALID"};
    if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
      return {ok: false, code: "WRITE_TICKET_INVALID"};
    }
    prune(Date.now());
    if (used.has(nonce)) return {ok: false, code: "WRITE_TICKET_REPLAYED"};
    used.set(nonce, exp);
    return {ok: true, expiresAt: new Date(exp).toISOString()};
  }

  return {issue, consume, ttlMs};
}
