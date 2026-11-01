/**
 * Local, conservative Tencent real-time ASR spend guard.
 *
 * Price source: Tencent Cloud ASR "实时语音识别（大模型2.0版）" post-paid
 * 1.0 CNY/hour (0-299 h/day tier), retrieved 2026-11-01. This is a local
 * estimate from the PCM actually streamed to Tencent, not the cloud bill.
 *
 * The ledger is deliberately outside the repository's tracked files and is
 * never uploaded. Set ASR_BUDGET_CNY / ASR_PRICE_CNY_PER_HOUR to override.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_BUDGET_FILE = path.resolve(HERE, '../../.local/asr-budget.json');
export const RESERVE_CNY = 0.01;

const round6 = (n) => Math.round(n * 1e6) / 1e6;

function number(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function budgetFile(env) {
  return path.resolve(String(env.ASR_BUDGET_FILE || '').trim() || DEFAULT_BUDGET_FILE);
}

function readLedger(env) {
  try {
    return JSON.parse(fs.readFileSync(budgetFile(env), 'utf8')) || {};
  } catch {
    return {};
  }
}

export function asrBudgetStatus({env = process.env} = {}) {
  const limitCny = number(env.ASR_BUDGET_CNY, 1);
  const priceCnyPerHour = number(env.ASR_PRICE_CNY_PER_HOUR, 1);
  const ledger = readLedger(env);
  const spentCny = number(ledger.spentCny, 0);
  return {
    limitCny,
    priceCnyPerHour,
    spentCny: round6(spentCny),
    remainingCny: round6(Math.max(0, limitCny - spentCny)),
    seconds: number(ledger.seconds, 0),
    calls: Math.trunc(number(ledger.calls, 0)),
    reserveCny: RESERVE_CNY,
    updatedAt: ledger.updatedAt || null,
  };
}

export function canStartAsr({env = process.env} = {}) {
  const status = asrBudgetStatus({env});
  return status.remainingCny > RESERVE_CNY;
}

/** Record PCM seconds actually sent upstream; returns the updated status. */
export function recordAsrUsage(seconds, {env = process.env} = {}) {
  const status = asrBudgetStatus({env});
  const used = number(seconds, 0);
  if (used <= 0) return status;
  const next = {
    limitCny: status.limitCny,
    priceCnyPerHour: status.priceCnyPerHour,
    spentCny: round6(status.spentCny + (used / 3600) * status.priceCnyPerHour),
    seconds: Math.round((status.seconds + used) * 1000) / 1000,
    calls: status.calls + 1,
    updatedAt: new Date().toISOString(),
  };
  const target = budgetFile(env);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, {mode: 0o600});
  fs.renameSync(tmp, target);
  return {...status, ...next, remainingCny: round6(Math.max(0, next.limitCny - next.spentCny))};
}