/**
 * 设备配对 + 短期令牌（N04 V1.3 T1-3）。
 *
 * 解决的问题：旧实现把长期归档令牌在构建时写进 `BuildConfig.ARCHIVE_TOKEN`，
 * 只要拿到 APK 就能 strings 出来，且无法轮换/撤销。
 *
 * 现在的模型：
 * - Mac 侧生成一次性配对码（默认 5 分钟、单次有效），只有本机回环请求能取到，
 *   也就是「首次必须由用户本人在 Mac 上点一次确认」。
 * - 手机用配对码换一个 deviceId + deviceSecret（只返回一次）。
 *   服务端只存 sha256(deviceSecret)，不存明文。
 * - 之后手机用 HMAC(deviceSecret, deviceId|ts|nonce) 证明身份换**短期令牌**
 *   （默认 24 小时，可用 SM_TOKEN_TTL_HOURS 调小，上限 24）。
 * - 令牌是 HMAC 自校验的，不落库；撤销靠 devices[].revokedAt + 签发时间比较：
 *   撤销后即使旧令牌还没过期也一律拒绝（revokedAt 之前签发的令牌立即失效）。
 * - 没有配对 → 服务端 401，手机端 fail closed（不上传、不注入令牌）。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_STORE = path.join(REPO_ROOT, "socialmate-v1.2", ".local", "pairings.json");
const LEGACY_TOKEN_FILE = path.join(REPO_ROOT, "socialmate-v1.2", ".local", "archive-token");

export const TOKEN_PREFIX = "v1";
export const MAX_TOKEN_TTL_HOURS = 24;
const CODE_TTL_MS = 5 * 60_000;
const CODE_MAX_ATTEMPTS = 5;
const CLOCK_SKEW_MS = 120_000;

function b64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}
function storeFile() {
  return path.resolve(process.env.SM_PAIRING_FILE || DEFAULT_STORE);
}
export function tokenTtlHours() {
  const raw = Number(process.env.SM_TOKEN_TTL_HOURS || 24);
  if (!Number.isFinite(raw) || raw <= 0) return MAX_TOKEN_TTL_HOURS;
  return Math.min(raw, MAX_TOKEN_TTL_HOURS);
}

/* ------------------------------- 共享密钥 ------------------------------- */
let cachedSecret = null;
/**
 * 令牌签名密钥：优先 SM_TOKEN_SECRET；否则复用本机 0600 的 archive-token；
 * 都没有时生成临时密钥（重启即失效，只会导致重新取令牌，不会放开权限）。
 */
export async function tokenSecret() {
  if (process.env.SM_TOKEN_SECRET) return Buffer.from(String(process.env.SM_TOKEN_SECRET));
  if (cachedSecret) return cachedSecret;
  try {
    const legacy = (await fs.readFile(LEGACY_TOKEN_FILE, "utf8")).trim();
    if (legacy.length >= 24) {
      cachedSecret = Buffer.from(legacy);
      return cachedSecret;
    }
  } catch {
    // 没有本机密钥文件时走临时密钥。
  }
  cachedSecret = crypto.randomBytes(32);
  return cachedSecret;
}

function hmac(secret, payload) {
  return b64url(crypto.createHmac("sha256", secret).update(payload).digest());
}

/**
 * 设备 secret 在服务端不明文落盘：用 tokenSecret 派生密钥做 AES-256-GCM 封装。
 * 拿到 pairings.json 而没有本机 tokenSecret 也解不开。
 */
async function sealDeviceSecret(plain) {
  const key = crypto.createHash("sha256").update(Buffer.concat([await tokenSecret(), Buffer.from("|pairing")])).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return `${b64url(iv)}.${b64url(Buffer.concat([body, cipher.getAuthTag()]))}`;
}

async function openDeviceSecret(sealed) {
  const key = crypto.createHash("sha256").update(Buffer.concat([await tokenSecret(), Buffer.from("|pairing")])).digest();
  const [ivRaw, bodyRaw] = String(sealed || "").split(".");
  if (!ivRaw || !bodyRaw) return "";
  const iv = Buffer.from(ivRaw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const buf = Buffer.from(bodyRaw.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const tag = buf.subarray(buf.length - 16);
  const body = buf.subarray(0, buf.length - 16);
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

/* ------------------------------- 存储 ------------------------------- */
async function readStore() {
  try {
    const raw = JSON.parse(await fs.readFile(storeFile(), "utf8"));
    return {schema: 1, devices: raw && typeof raw.devices === "object" ? raw.devices : {}};
  } catch (error) {
    if (error.code === "ENOENT") return {schema: 1, devices: {}};
    throw error;
  }
}

async function writeStore(store) {
  const file = storeFile();
  await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(store, null, 2), {encoding: "utf8", mode: 0o600});
  await fs.rename(temp, file);
  await fs.chmod(file, 0o600).catch(() => {});
}

/* --------------------------- 一次性配对码（内存） --------------------------- */
let codeState = null; // {code, expiresAt, attempts}

/** 只允许本机回环（不是经代理转发进来的）请求取配对码。 */
export function isLoopback(req) {
  const addr = String(req?.socket?.remoteAddress || "");
  const forwarded = String(req?.headers?.["x-forwarded-for"] || "").trim();
  const loopback = addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
  return loopback && !forwarded;
}

/** 生成一次性配对码。返回明文码，调用方负责只在受控通道展示。 */
export function issuePairingCode() {
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  codeState = {code, expiresAt: Date.now() + CODE_TTL_MS, attempts: 0};
  return {code, expiresAt: new Date(codeState.expiresAt).toISOString(), ttlMs: CODE_TTL_MS};
}

export function pairingCodeStatus() {
  if (!codeState) return {active: false, expiresAt: null};
  const active = codeState.expiresAt > Date.now();
  return {active, expiresAt: new Date(codeState.expiresAt).toISOString()};
}

function consumeCode(given) {
  if (!codeState) throw fail(400, "PAIRING_CODE_REQUIRED", "请先在 Mac 上生成一次性配对码");
  if (codeState.expiresAt <= Date.now()) {
    codeState = null;
    throw fail(410, "PAIRING_CODE_EXPIRED", "配对码已过期，请在 Mac 上重新生成");
  }
  codeState.attempts += 1;
  const expected = Buffer.from(codeState.code);
  const actual = Buffer.from(String(given || ""));
  const same = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!same) {
    if (codeState.attempts >= CODE_MAX_ATTEMPTS) codeState = null;
    throw fail(403, "PAIRING_CODE_INVALID", "配对码不正确");
  }
  codeState = null; // 单次有效
}

/* -------------------------------- 配对流程 -------------------------------- */
/** 用配对码换设备凭证；deviceSecret 只在此响应里出现一次。 */
export async function claimPairing({code, deviceName} = {}) {
  consumeCode(code);
  const store = await readStore();
  const deviceId = "dev_" + crypto.randomBytes(8).toString("hex");
  const deviceSecret = b64url(crypto.randomBytes(32));
  const at = new Date().toISOString();
  store.devices[deviceId] = {
    deviceId,
    name: String(deviceName || "未命名设备").slice(0, 40),
    secretHash: crypto.createHash("sha256").update(deviceSecret).digest("hex"),
    secretSealed: await sealDeviceSecret(deviceSecret),
    createdAt: at,
    lastSeenAt: null,
    revokedAt: null,
  };
  await writeStore(store);
  const token = await mintToken(deviceId);
  return {deviceId, deviceSecret, createdAt: at, ...token};
}

const seenNonces = new Map(); // `${deviceId}|${nonce}` -> ts
function nonceOK(deviceId, nonce, ts) {
  const key = `${deviceId}|${nonce}`;
  const now = Date.now();
  for (const [k, at] of seenNonces) {
    if (now - at > CLOCK_SKEW_MS * 2) seenNonces.delete(k);
  }
  if (seenNonces.has(key)) return false;
  seenNonces.set(key, ts);
  return true;
}

function proofOf(deviceSecret, deviceId, ts, nonce) {
  return hmac(Buffer.from(deviceSecret), `pair|${deviceId}|${ts}|${nonce}`);
}

/** 设备用自己的 secret 证明身份，换一张短期令牌。 */
export async function refreshToken({deviceId, ts, nonce, proof} = {}) {
  const id = String(deviceId || "");
  const stamp = Number(ts);
  const mark = String(nonce || "");
  if (!id || !Number.isFinite(stamp) || !mark) {
    throw fail(400, "PAIRING_PROOF_INCOMPLETE", "缺少设备证明参数");
  }
  if (Math.abs(Date.now() - stamp) > CLOCK_SKEW_MS) {
    throw fail(401, "PAIRING_PROOF_STALE", "设备证明时间超出允许偏差");
  }
  const store = await readStore();
  const device = store.devices[id];
  if (!device) throw fail(401, "DEVICE_NOT_PAIRED", "该设备未配对");
  if (device.revokedAt) throw fail(401, "DEVICE_REVOKED", "该设备已被撤销，请重新配对");
  if (!nonceOK(id, mark, stamp)) throw fail(409, "PAIRING_REPLAY", "设备证明被重复使用");
  const secret = await openDeviceSecret(device.secretSealed);
  if (!secret) throw fail(401, "DEVICE_SECRET_UNREADABLE", "本机无法解开该设备的配对密钥，请重新配对");
  const expected = proofOf(secret, id, stamp, mark);
  if (String(proof || "").length !== expected.length
    || !crypto.timingSafeEqual(Buffer.from(String(proof || "")), Buffer.from(expected))) {
    throw fail(401, "PAIRING_PROOF_INVALID", "设备证明不正确");
  }
  device.lastSeenAt = new Date().toISOString();
  await writeStore(store);
  return mintToken(id);
}

/** 签发短期令牌：v1.<deviceId>.<iatSec>.<expSec>.<mac>（自包含，可离线校验）。 */
export async function mintToken(deviceId) {
  const secret = await tokenSecret();
  const hours = tokenTtlHours();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.floor(hours * 3600);
  const mac = hmac(secret, `${TOKEN_PREFIX}|${deviceId}|${now}|${exp}`);
  return {token: `${TOKEN_PREFIX}.${deviceId}.${now}.${exp}.${mac}`,
    issuedAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date(exp * 1000).toISOString(), ttlHours: hours};
}

/**
 * 校验短期令牌。撤销以「撤销时刻」为界：撤销之前签发的令牌立即失效。
 * @param {string} value
 * @param {{store?: object}} [options] 可注入已读的 pairings store，避免重复读盘。
 */
export async function verifyToken(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw.startsWith(TOKEN_PREFIX + ".")) return {ok: false, code: "TOKEN_FORMAT"};
  const parts = raw.split(".");
  if (parts.length !== 5) return {ok: false, code: "TOKEN_FORMAT"};
  const [, deviceId, iatRaw, expRaw, mac] = parts;
  const iat = Number(iatRaw);
  const exp = Number(expRaw);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || exp <= iat) return {ok: false, code: "TOKEN_FORMAT"};
  const secret = await tokenSecret();
  const expected = hmac(secret, `${TOKEN_PREFIX}|${deviceId}|${iat}|${exp}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    return {ok: false, code: "TOKEN_INVALID"};
  }
  if (exp * 1000 <= Date.now()) return {ok: false, code: "TOKEN_EXPIRED"};
  const store = options.store || await readStore();
  const device = store.devices[deviceId];
  if (!device) return {ok: false, code: "DEVICE_UNKNOWN"};
  if (device.revokedAt && Date.parse(device.revokedAt) >= iat * 1000) {
    return {ok: false, code: "DEVICE_REVOKED"};
  }
  return {ok: true, deviceId, expiresAt: new Date(exp * 1000).toISOString(), device};
}

export async function revokeDevice(deviceId) {
  const store = await readStore();
  const id = String(deviceId || "");
  const device = store.devices[id];
  if (!device) throw fail(404, "DEVICE_NOT_FOUND", "没有这个设备");
  device.revokedAt = new Date().toISOString();
  await writeStore(store);
  return {deviceId: id, revokedAt: device.revokedAt};
}

/** 设备清单（不含任何 secret/proof 材料）。 */
export async function listDevices() {
  const store = await readStore();
  return Object.values(store.devices).map((device) => ({
    deviceId: device.deviceId,
    name: device.name,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    revokedAt: device.revokedAt || null,
    paired: !device.revokedAt,
  }));
}

/** 测试/排障用：清空内存配对码状态。 */
export function resetPairingCodeForTest() {
  codeState = null;
}
