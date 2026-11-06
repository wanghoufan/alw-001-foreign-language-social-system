/**
 * 最小跨实例状态存储接口（默认 SQLite）。
 *
 * 为什么不是内存 Map：
 * - 金额硬闸、令牌撤销、限流、ASR 会话占用、幂等键都必须能被多个网关实例看到；
 * - SQLite 以 BEGIN IMMEDIATE 写锁实现跨连接/跨进程原子，测试会启动多个进程并发扣减；
 * - 生产可切换到 Redis 适配器（见 state-store-redis.mjs，未在本机实测）。
 *
 * 存进去的内容：
 * - 只有哈希值与计数；令牌原文、设备指纹原文、学习文本一律不落库。
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";

export const STATE_SCHEMA_VERSION = 1;

function nowIso(now) {
  return new Date(now()).toISOString();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export {sha256Hex};

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budgets (
  key TEXT PRIMARY KEY,
  limit_micros INTEGER NOT NULL,
  spent_micros INTEGER NOT NULL DEFAULT 0,
  reserved_micros INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reservations (
  id TEXT PRIMARY KEY,
  budget_key TEXT NOT NULL,
  micros INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'reserved',
  ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reservations_budget ON reservations(budget_key, status);

CREATE TABLE IF NOT EXISTS tokens (
  jti TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  device_fingerprint TEXT NOT NULL,
  scopes TEXT NOT NULL,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  last_used_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tokens_device ON tokens(device_fingerprint);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  status_code INTEGER,
  response_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_idempotency_updated ON idempotency(updated_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON active_sessions(device_id, kind);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON active_sessions(expires_at);
`;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * 多进程同时首次打开同一个库时，journal_mode/schema 写入会短暂拿不到写锁。
 * 这里对「database is locked」做同步重试，避免多实例启动互相踩踏。
 */
function execWithRetry(db, sql, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      db.exec(sql);
      return;
    } catch (error) {
      const busy = error?.errcode === 5 || /locked|busy/i.test(String(error?.message || ""));
      if (!busy || i === attempts - 1) throw error;
      sleepSync(50);
    }
  }
}

/**
 * SQLite 状态存储。
 * @param {{file?: string, now?: () => number, namespace?: string}} options
 *   file 为 ":memory:" 或具体路径；目录会自动创建。
 */
export function createSqliteStateStore({file = ":memory:", now = Date.now} = {}) {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true, mode: 0o700});
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA busy_timeout = 5000");
  execWithRetry(db, SCHEMA);
  execWithRetry(db, `INSERT INTO meta(key, value) VALUES('schema_version', '${STATE_SCHEMA_VERSION}')
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`);

  function tx(fn) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        db.exec("ROLLBACK");
      } catch {
        // 事务可能已被 SQLite 自动回滚，忽略二次回滚错误。
      }
      throw error;
    }
  }

  function budgetRow(key) {
    return db.prepare("SELECT key, limit_micros, spent_micros, reserved_micros, updated_at FROM budgets WHERE key=?")
      .get(key) || null;
  }

  function publicBudget(row) {
    if (!row) return null;
    return {
      key: row.key,
      limitMicros: Number(row.limit_micros),
      spentMicros: Number(row.spent_micros),
      reservedMicros: Number(row.reserved_micros),
      remainingMicros: Math.max(0, Number(row.limit_micros) - Number(row.spent_micros) - Number(row.reserved_micros)),
      updatedAt: row.updated_at,
    };
  }

  return {
    driver: "sqlite",

    /**
     * 预留：失败时不产生任何写副作用。
     * @returns {{ok: true, reservationId: string, budget: object} | {ok: false, reason: string, budget: object}}
     */
    async reserve({budgetKey, micros, limitMicros, ref = ""}) {
      if (!budgetKey) throw new Error("budgetKey required");
      if (!Number.isInteger(micros) || micros < 0) throw new Error("micros must be a non-negative integer");
      if (!Number.isInteger(limitMicros) || limitMicros < 0) throw new Error("limitMicros must be a non-negative integer");

      return tx(() => {
        const ts = nowIso(now);
        db.prepare("INSERT OR IGNORE INTO budgets(key, limit_micros, spent_micros, reserved_micros, updated_at) VALUES(?,?,0,0,?)")
          .run(budgetKey, limitMicros, ts);
        db.prepare("UPDATE budgets SET limit_micros=?, updated_at=? WHERE key=?").run(limitMicros, ts, budgetKey);

        const row = budgetRow(budgetKey);
        const available = Number(row.limit_micros) - Number(row.spent_micros) - Number(row.reserved_micros);
        if (Number(row.limit_micros) <= 0 || micros > available) {
          return {ok: false, reason: Number(row.limit_micros) <= 0 ? "BUDGET_ZERO" : "BUDGET_EXHAUSTED", budget: publicBudget(row)};
        }

        const reservationId = crypto.randomUUID();
        db.prepare("UPDATE budgets SET reserved_micros=reserved_micros+?, updated_at=? WHERE key=?")
          .run(micros, ts, budgetKey);
        db.prepare("INSERT INTO reservations(id, budget_key, micros, status, ref, created_at, updated_at) VALUES(?,?,?,'reserved',?,?,?)")
          .run(reservationId, budgetKey, micros, ref, ts, ts);
        return {ok: true, reservationId, budget: publicBudget(budgetRow(budgetKey))};
      });
    },

    /** 提交：actualMicros 必须 ≤ 预留；多出的部分只有在余额允许时才补扣，否则整笔回滚。 */
    async commit({reservationId, actualMicros}) {
      if (!Number.isInteger(actualMicros) || actualMicros < 0) throw new Error("actualMicros must be a non-negative integer");
      return tx(() => {
        const ts = nowIso(now);
        const res = db.prepare("SELECT * FROM reservations WHERE id=?").get(reservationId);
        if (!res || res.status !== "reserved") return {ok: false, reason: "RESERVATION_NOT_FOUND"};
        const row = budgetRow(res.budget_key);
        if (!row) return {ok: false, reason: "BUDGET_NOT_FOUND"};

        const delta = actualMicros - Number(res.micros);
        const available = Number(row.limit_micros) - Number(row.spent_micros) - Number(row.reserved_micros);
        if (delta > available) {
          db.prepare("UPDATE budgets SET reserved_micros=reserved_micros-?, updated_at=? WHERE key=?")
            .run(Number(res.micros), ts, res.budget_key);
          db.prepare("UPDATE reservations SET status='released', updated_at=? WHERE id=?").run(ts, reservationId);
          return {
            ok: false,
            reason: "BUDGET_EXHAUSTED",
            budgetKey: res.budget_key,
            budget: publicBudget(budgetRow(res.budget_key)),
          };
        }

        db.prepare("UPDATE budgets SET reserved_micros=reserved_micros-?, spent_micros=spent_micros+?, updated_at=? WHERE key=?")
          .run(Number(res.micros), actualMicros, ts, res.budget_key);
        db.prepare("UPDATE reservations SET status='committed', micros=?, updated_at=? WHERE id=?")
          .run(actualMicros, ts, reservationId);
        return {ok: true, budgetKey: res.budget_key, budget: publicBudget(budgetRow(res.budget_key))};
      });
    },

    async rollback({reservationId}) {
      return tx(() => {
        const ts = nowIso(now);
        const res = db.prepare("SELECT * FROM reservations WHERE id=?").get(reservationId);
        if (!res || res.status !== "reserved") return {ok: false, reason: "RESERVATION_NOT_FOUND"};
        db.prepare("UPDATE budgets SET reserved_micros=MAX(0, reserved_micros-?), updated_at=? WHERE key=?")
          .run(Number(res.micros), ts, res.budget_key);
        db.prepare("UPDATE reservations SET status='released', updated_at=? WHERE id=?").run(ts, reservationId);
        return {ok: true, budget: publicBudget(budgetRow(res.budget_key))};
      });
    },

    async budgetSnapshot(budgetKey) {
      return publicBudget(budgetRow(budgetKey));
    },

    /* ------------------------------ 令牌 ------------------------------ */

    async insertToken({jti, tokenHash, deviceFingerprint, scopes = [], issuedAt, expiresAt}) {
      db.prepare(`INSERT INTO tokens(jti, token_hash, device_fingerprint, scopes, issued_at, expires_at)
        VALUES(?,?,?,?,?,?)`)
        .run(jti, tokenHash, deviceFingerprint, JSON.stringify(scopes), issuedAt, expiresAt);
    },

    async findToken({jti, tokenHash}) {
      const row = db.prepare("SELECT * FROM tokens WHERE jti=?").get(jti);
      if (!row) return null;
      if (row.token_hash !== tokenHash) return null;
      return {
        jti: row.jti,
        tokenHash: row.token_hash,
        deviceFingerprint: row.device_fingerprint,
        scopes: JSON.parse(row.scopes || "[]"),
        issuedAt: Number(row.issued_at),
        expiresAt: Number(row.expires_at),
        revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
        lastUsedAt: row.last_used_at === null ? null : Number(row.last_used_at),
      };
    },

    async revokeToken({jti}) {
      const ts = now();
      const result = db.prepare("UPDATE tokens SET revoked_at=? WHERE jti=? AND revoked_at IS NULL").run(ts, jti);
      return {ok: result.changes > 0, jti};
    },

    async revokeDevice({deviceFingerprint}) {
      const ts = now();
      const result = db.prepare("UPDATE tokens SET revoked_at=? WHERE device_fingerprint=? AND revoked_at IS NULL")
        .run(ts, deviceFingerprint);
      return {ok: true, revoked: Number(result.changes)};
    },

    async touchToken({jti, at}) {
      db.prepare("UPDATE tokens SET last_used_at=? WHERE jti=?").run(at, jti);
    },

    /* ------------------------------ 幂等 ------------------------------ */

    /**
     * 抢占幂等键。pending 超过 ttlMs 视为上一次请求已崩溃，可重新抢占。
     */
    async claimIdempotency({key, requestHash, ttlMs = 30000}) {
      return tx(() => {
        const ts = now();
        const row = db.prepare("SELECT * FROM idempotency WHERE key=?").get(key);
        if (!row) {
          db.prepare("INSERT INTO idempotency(key, request_hash, status, created_at, updated_at) VALUES(?,?,'pending',?,?)")
            .run(key, requestHash, ts, ts);
          return {state: "claimed"};
        }
        if (row.request_hash !== requestHash) return {state: "conflict"};
        if (row.status === "done") {
          return {state: "replay", statusCode: Number(row.status_code), response: JSON.parse(row.response_json || "null")};
        }
        if (ts - Number(row.updated_at) > ttlMs) {
          db.prepare("UPDATE idempotency SET request_hash=?, status='pending', status_code=NULL, response_json=NULL, updated_at=? WHERE key=?")
            .run(requestHash, ts, key);
          return {state: "claimed"};
        }
        return {state: "in_progress"};
      });
    },

    async completeIdempotency({key, statusCode, response}) {
      const ts = now();
      db.prepare("UPDATE idempotency SET status='done', status_code=?, response_json=?, updated_at=? WHERE key=?")
        .run(statusCode, JSON.stringify(response), ts, key);
    },

    async releaseIdempotency({key}) {
      const ts = now();
      db.prepare("DELETE FROM idempotency WHERE key=? AND status='pending'").run(key);
    },

    async purgeIdempotency({olderThanMs}) {
      const cutoff = now() - olderThanMs;
      const result = db.prepare("DELETE FROM idempotency WHERE updated_at < ?").run(cutoff);
      return {purged: Number(result.changes)};
    },

    /* ------------------------------ 限流 ------------------------------ */

    /** 固定窗口限流；返回是否放行与需等待时间。 */
    async consumeRate({bucket, windowMs, limit}) {
      return tx(() => {
        const ts = now();
        const row = db.prepare("SELECT * FROM rate_limits WHERE bucket=?").get(bucket);
        if (!row || ts - Number(row.window_start) >= windowMs) {
          db.prepare("INSERT INTO rate_limits(bucket, window_start, count) VALUES(?,?,1) ON CONFLICT(bucket) DO UPDATE SET window_start=excluded.window_start, count=1")
            .run(bucket, ts);
          return {allowed: limit >= 1, count: 1, resetAt: ts + windowMs, retryAfterMs: limit >= 1 ? 0 : windowMs};
        }
        const count = Number(row.count) + 1;
        db.prepare("UPDATE rate_limits SET count=? WHERE bucket=?").run(count, bucket);
        const resetAt = Number(row.window_start) + windowMs;
        return {
          allowed: count <= limit,
          count,
          resetAt,
          retryAfterMs: count <= limit ? 0 : Math.max(0, resetAt - ts),
        };
      });
    },

    /* ------------------------------ ASR 会话 ------------------------------ */

    async openSession({id, deviceId, kind, ttlMs, maxConcurrent}) {
      return tx(() => {
        const ts = now();
        db.prepare("DELETE FROM active_sessions WHERE expires_at <= ?").run(ts);
        const row = db.prepare("SELECT COUNT(*) AS n FROM active_sessions WHERE device_id=? AND kind=?")
          .get(deviceId, kind);
        if (Number(row.n) >= maxConcurrent) return {ok: false, reason: "SESSION_LIMIT", active: Number(row.n)};
        db.prepare("INSERT INTO active_sessions(id, device_id, kind, started_at, expires_at) VALUES(?,?,?,?,?)")
          .run(id, deviceId, kind, ts, ts + ttlMs);
        return {ok: true, active: Number(row.n) + 1};
      });
    },

    async closeSession({id}) {
      db.prepare("DELETE FROM active_sessions WHERE id=?").run(id);
      return {ok: true};
    },

    async countSessions({kind}) {
      const ts = now();
      db.prepare("DELETE FROM active_sessions WHERE expires_at <= ?").run(ts);
      const row = db.prepare("SELECT COUNT(*) AS n FROM active_sessions WHERE kind=?").get(kind);
      return Number(row.n);
    },

    async close() {
      db.close();
    },
  };
}

/**
 * 统一工厂。driver=redis 时动态加载适配器，未安装 redis 依赖会明确报错，
 * 不会静默退回 SQLite（避免生产把预算写进单机文件）。
 */
export async function createStateStore({driver = "sqlite", file = ":memory:", now = Date.now, redisUrl} = {}) {
  if (driver === "sqlite") return createSqliteStateStore({file, now});
  if (driver === "redis") {
    const {createRedisStateStore} = await import("./state-store-redis.mjs");
    return createRedisStateStore({url: redisUrl, now});
  }
  throw new Error(`未知状态存储驱动：${driver}`);
}