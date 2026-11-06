/**
 * Redis 状态存储适配器（生产可选）。
 *
 * 重要：本机没有 Redis 服务，因此该适配器未纳入 `node --test` 实测（README 标注 NOT_RUN）。
 * 它与 SQLite 适配器保持同一套异步接口，金额预留/提交/回滚全部由 Lua 脚本原子执行，
 * 供多实例网关共享同一份预算、令牌撤销、限流与 ASR 会话占用。
 *
 * 依赖：可选依赖 `redis`（npm install redis）。未安装时明确报错，不静默退回 SQLite。
 */
import crypto from "node:crypto";

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

const RESERVE_LUA = `
local micros = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = ARGV[3]
local rid = ARGV[4]
local ref = ARGV[5]
local b = redis.call('HMGET', KEYS[1], 'limit', 'spent', 'reserved')
local spent = tonumber(b[2] or '0')
local reserved = tonumber(b[3] or '0')
redis.call('HSET', KEYS[1], 'limit', limit, 'updated', now)
if limit <= 0 or spent + reserved + micros > limit then
  return {0, (limit <= 0 and 'BUDGET_ZERO' or 'BUDGET_EXHAUSTED'), spent, reserved}
end
redis.call('HINCRBY', KEYS[1], 'reserved', micros)
redis.call('HSET', KEYS[2], 'budget', KEYS[1], 'micros', micros, 'status', 'reserved', 'ref', ref, 'created', now, 'updated', now)
return {1, rid, spent, reserved + micros}
`;

const COMMIT_LUA = `
local actual = tonumber(ARGV[1])
local now = ARGV[2]
local r = redis.call('HMGET', KEYS[1], 'budget', 'micros', 'status')
if r[3] ~= 'reserved' then return {0, 'RESERVATION_NOT_FOUND'} end
local reservedMicros = tonumber(r[2])
local b = redis.call('HMGET', KEYS[2], 'limit', 'spent', 'reserved')
local limit = tonumber(b[1] or '0')
local spent = tonumber(b[2] or '0')
local rsv = tonumber(b[3] or '0')
local delta = actual - reservedMicros
if delta > (limit - spent - rsv) then
  redis.call('HINCRBY', KEYS[2], 'reserved', -reservedMicros)
  redis.call('HSET', KEYS[1], 'status', 'released', 'updated', now)
  return {0, 'BUDGET_EXHAUSTED', spent, rsv - reservedMicros}
end
redis.call('HINCRBY', KEYS[2], 'reserved', -reservedMicros)
redis.call('HINCRBY', KEYS[2], 'spent', actual)
redis.call('HSET', KEYS[2], 'updated', now)
redis.call('HSET', KEYS[1], 'status', 'committed', 'micros', actual, 'updated', now)
return {1, spent + actual, rsv - reservedMicros}
`;

const ROLLBACK_LUA = `
local r = redis.call('HMGET', KEYS[1], 'budget', 'micros', 'status')
if r[3] ~= 'reserved' then return {0, 'RESERVATION_NOT_FOUND'} end
redis.call('HINCRBY', KEYS[2], 'reserved', -tonumber(r[2]))
redis.call('HSET', KEYS[1], 'status', 'released', 'updated', ARGV[1])
return {1}
`;

const CLAIM_IDEMPOTENCY_LUA = `
local row = redis.call('HMGET', KEYS[1], 'request_hash', 'status', 'status_code', 'response_json', 'updated_at')
if not row[1] then
  redis.call('HSET', KEYS[1], 'request_hash', ARGV[1], 'status', 'pending', 'created_at', ARGV[2], 'updated_at', ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {'claimed'}
end
if row[1] ~= ARGV[1] then return {'conflict'} end
if row[2] == 'done' then return {'replay', row[3], row[4]} end
if tonumber(ARGV[2]) - tonumber(row[5] or '0') > tonumber(ARGV[4]) then
  redis.call('HSET', KEYS[1], 'status', 'pending', 'status_code', '', 'response_json', '', 'updated_at', ARGV[2])
  redis.call('PEXPIRE', KEYS[1], ARGV[3])
  return {'claimed'}
end
return {'in_progress'}
`;

const RATE_LUA = `
local now = tonumber(ARGV[1])
local win = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local row = redis.call('HMGET', KEYS[1], 'start', 'count')
if (not row[1]) or now - tonumber(row[1]) >= win then
  redis.call('HSET', KEYS[1], 'start', now, 'count', 1)
  redis.call('PEXPIRE', KEYS[1], win * 2)
  return {limit >= 1 and 1 or 0, 1, now + win}
end
local count = redis.call('HINCRBY', KEYS[1], 'count', 1)
redis.call('PEXPIRE', KEYS[1], win * 2)
local reset = tonumber(row[1]) + win
return {count <= limit and 1 or 0, count, reset}
`;

const OPEN_SESSION_LUA = `
local now = tonumber(ARGV[7])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
local n = redis.call('ZCARD', KEYS[2])
if n >= tonumber(ARGV[3]) then return {0, n} end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('ZADD', KEYS[2], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[3], 'device', ARGV[4], 'kind', ARGV[5], 'expires', ARGV[2])
redis.call('PEXPIRE', KEYS[3], ARGV[6])
return {1, n + 1}
`;

const CLOSE_SESSION_LUA = `
local h = redis.call('HMGET', KEYS[1], 'device', 'kind')
if h[1] then
  redis.call('ZREM', 'smgw:sessions:kind:' .. h[2], ARGV[1])
  redis.call('ZREM', 'smgw:sessions:device:' .. h[1] .. ':' .. h[2], ARGV[1])
  redis.call('DEL', KEYS[1])
end
return {1}
`;

const COUNT_SESSIONS_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
return redis.call('ZCARD', KEYS[1])
`;

function nowIso(now) {
  return new Date(now()).toISOString();
}

export async function createRedisStateStore({url = "redis://127.0.0.1:6379", now = Date.now} = {}) {
  let redisModule;
  try {
    redisModule = await import("redis");
  } catch {
    throw new Error("STATE_DRIVER=redis 需要安装可选依赖：npm install redis");
  }
  const client = redisModule.createClient({url});
  client.on("error", () => {
    // 连接错误由调用方通过命令失败感知；这里避免 EventEmitter 未捕获错误导致进程退出。
  });
  await client.connect();

  const budgetKey = (key) => `smgw:budget:${key}`;
  const reservationKey = (id) => `smgw:res:${id}`;
  const tokenKey = (jti) => `smgw:token:${jti}`;
  const tokenHashKey = (hash) => `smgw:tokenhash:${hash}`;
  const deviceKey = (fp) => `smgw:device:${fp}`;
  const idemKey = (key) => `smgw:idem:${key}`;
  const rateKey = (bucket) => `smgw:rate:${bucket}`;
  const sessionKey = (id) => `smgw:session:${id}`;
  const sessionKindKey = (kind) => `smgw:sessions:kind:${kind}`;
  const sessionDeviceKey = (device, kind) => `smgw:sessions:device:${device}:${kind}`;

  function budgetViewFromHash(hash) {
    if (!hash || hash.limit === undefined) return null;
    const limit = Number(hash.limit);
    const spent = Number(hash.spent || 0);
    const reserved = Number(hash.reserved || 0);
    return {
      key: hash.key || null,
      limitMicros: limit,
      spentMicros: spent,
      reservedMicros: reserved,
      remainingMicros: Math.max(0, limit - spent - reserved),
      updatedAt: hash.updated || null,
    };
  }

  async function budgetSnapshot(key) {
    const hash = await client.hGetAll(budgetKey(key));
    const view = budgetViewFromHash(hash);
    return view ? {...view, key} : null;
  }

  return {
    driver: "redis",

    async reserve({budgetKey: key, micros, limitMicros, ref = ""}) {
      const reservationId = crypto.randomUUID();
      const result = await client.eval(RESERVE_LUA, {
        keys: [budgetKey(key), reservationKey(reservationId)],
        arguments: [String(micros), String(limitMicros), nowIso(now), reservationId, String(ref || "")],
      });
      if (Number(result[0]) !== 1) {
        const snapshot = await budgetSnapshot(key);
        return {ok: false, reason: String(result[1]), budget: snapshot};
      }
      return {ok: true, reservationId, budget: await budgetSnapshot(key)};
    },

    async commit({reservationId, actualMicros}) {
      const reservation = await client.hGetAll(reservationKey(reservationId));
      if (!reservation.budget) return {ok: false, reason: "RESERVATION_NOT_FOUND"};
      const result = await client.eval(COMMIT_LUA, {
        keys: [reservationKey(reservationId), reservation.budget],
        arguments: [String(actualMicros), nowIso(now)],
      });
      const key = String(reservation.budget).replace(/^smgw:budget:/, "");
      if (Number(result[0]) !== 1) return {ok: false, reason: String(result[1]), budgetKey: key};
      return {ok: true, budgetKey: key, budget: await budgetSnapshot(key)};
    },

    async rollback({reservationId}) {
      const reservation = await client.hGetAll(reservationKey(reservationId));
      if (!reservation.budget) return {ok: false, reason: "RESERVATION_NOT_FOUND"};
      const result = await client.eval(ROLLBACK_LUA, {
        keys: [reservationKey(reservationId), reservation.budget],
        arguments: [nowIso(now)],
      });
      if (Number(result[0]) !== 1) return {ok: false, reason: String(result[1])};
      const key = String(reservation.budget).replace(/^smgw:budget:/, "");
      return {ok: true, budget: await budgetSnapshot(key)};
    },

    budgetSnapshot,

    async insertToken({jti, tokenHash, deviceFingerprint, scopes = [], issuedAt, expiresAt}) {
      await Promise.all([
        client.hSet(tokenKey(jti), {
          jti,
          token_hash: tokenHash,
          device_fingerprint: deviceFingerprint,
          scopes: JSON.stringify(scopes),
          issued_at: String(issuedAt),
          expires_at: String(expiresAt),
          last_used_at: "",
        }),
        client.set(tokenHashKey(tokenHash), jti),
        client.sAdd(deviceKey(deviceFingerprint), jti),
      ]);
    },

    async findToken({jti, tokenHash}) {
      const hash = await client.hGetAll(tokenKey(jti));
      if (!hash || !hash.token_hash) return null;
      if (hash.token_hash !== tokenHash) return null;
      const mappedJti = await client.get(tokenHashKey(tokenHash));
      if (mappedJti !== jti) return null;
      return {
        jti: hash.jti,
        tokenHash: hash.token_hash,
        deviceFingerprint: hash.device_fingerprint,
        scopes: JSON.parse(hash.scopes || "[]"),
        issuedAt: Number(hash.issued_at),
        expiresAt: Number(hash.expires_at),
        revokedAt: hash.revoked_at ? Number(hash.revoked_at) : null,
        lastUsedAt: hash.last_used_at ? Number(hash.last_used_at) : null,
      };
    },

    async revokeToken({jti}) {
      const changed = await client.hSetNX(tokenKey(jti), "revoked_at", String(now()));
      return {ok: changed, jti};
    },

    async revokeDevice({deviceFingerprint}) {
      const ids = await client.sMembers(deviceKey(deviceFingerprint));
      let revoked = 0;
      for (const jti of ids) {
        if (await client.hSetNX(tokenKey(jti), "revoked_at", String(now()))) revoked += 1;
      }
      return {ok: true, revoked};
    },

    async touchToken({jti, at}) {
      await client.hSet(tokenKey(jti), "last_used_at", String(at));
    },

    async claimIdempotency({key, requestHash, ttlMs = 30000}) {
      const result = await client.eval(CLAIM_IDEMPOTENCY_LUA, {
        keys: [idemKey(key)],
        arguments: [requestHash, String(now()), String(IDEMPOTENCY_TTL_MS), String(ttlMs)],
      });
      if (result[0] === "claimed") return {state: "claimed"};
      if (result[0] === "conflict") return {state: "conflict"};
      if (result[0] === "in_progress") return {state: "in_progress"};
      return {
        state: "replay",
        statusCode: Number(result[1]),
        response: JSON.parse(result[2] || "null"),
      };
    },

    async completeIdempotency({key, statusCode, response}) {
      await client.hSet(idemKey(key), {
        status: "done",
        status_code: String(statusCode),
        response_json: JSON.stringify(response),
        updated_at: String(now()),
      });
      await client.pExpire(idemKey(key), IDEMPOTENCY_TTL_MS);
    },

    async releaseIdempotency({key}) {
      await client.del(idemKey(key));
    },

    async purgeIdempotency() {
      // Redis 侧由 PEXPIRE 自动清理，不需要扫描。
      return {purged: 0};
    },

    async consumeRate({bucket, windowMs, limit}) {
      const result = await client.eval(RATE_LUA, {
        keys: [rateKey(bucket)],
        arguments: [String(now()), String(windowMs), String(limit)],
      });
      return {
        allowed: Number(result[0]) === 1,
        count: Number(result[1]),
        resetAt: Number(result[2]),
        retryAfterMs: Number(result[0]) === 1 ? 0 : Math.max(0, Number(result[2]) - now()),
      };
    },

    async openSession({id, deviceId, kind, ttlMs, maxConcurrent}) {
      const startedAt = now();
      const expiresAt = startedAt + ttlMs;
      const result = await client.eval(OPEN_SESSION_LUA, {
        keys: [
          sessionKindKey(kind),
          sessionDeviceKey(deviceId, kind),
          sessionKey(id),
        ],
        arguments: [id, String(expiresAt), String(maxConcurrent), deviceId, kind, String(ttlMs), String(startedAt)],
      });
      if (Number(result[0]) !== 1) return {ok: false, reason: "SESSION_LIMIT", active: Number(result[1])};
      return {ok: true, active: Number(result[1])};
    },

    async closeSession({id}) {
      await client.eval(CLOSE_SESSION_LUA, {keys: [sessionKey(id)], arguments: [id]});
      return {ok: true};
    },

    async countSessions({kind}) {
      const count = await client.eval(COUNT_SESSIONS_LUA, {
        keys: [sessionKindKey(kind)],
        arguments: [String(now())],
      });
      return Number(count);
    },

    async close() {
      await client.quit();
    },
  };
}