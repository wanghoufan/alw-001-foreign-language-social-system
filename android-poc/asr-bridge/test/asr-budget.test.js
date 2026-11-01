import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  asrBudgetStatus,
  canStartAsr,
  recordAsrUsage,
  RESERVE_CNY,
} from '../src/asr-budget.js';

function envFor(dir, limit = '0.01') {
  return {
    ASR_BUDGET_FILE: path.join(dir, 'asr-budget.json'),
    ASR_BUDGET_CNY: limit,
    ASR_PRICE_CNY_PER_HOUR: '1',
  };
}

test('ASR budget starts at one yuan and stops new sessions at the reserve', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-budget-'));
  const env = {ASR_BUDGET_FILE: path.join(dir, 'asr-budget.json')};
  const initial = asrBudgetStatus({env});
  assert.equal(initial.limitCny, 1);
  assert.equal(initial.priceCnyPerHour, 1);
  assert.equal(initial.spentCny, 0);
  assert.ok(initial.remainingCny > RESERVE_CNY);
});

test('ASR budget charges streamed seconds and blocks at the reserve', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-budget-'));
  const env = envFor(dir);
  const after = recordAsrUsage(36, {env}); // 36s at 1 CNY/h = 0.01 CNY
  assert.equal(after.spentCny, 0.01);
  assert.equal(after.remainingCny, 0);
  assert.equal(after.seconds, 36);
  assert.equal(after.calls, 1);
  assert.equal(canStartAsr({env}), false);
  assert.equal(fs.statSync(env.ASR_BUDGET_FILE).mode & 0o777, 0o600);
});

test('ASR budget ignores zero-length sessions and keeps a sub-cent remainder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'asr-budget-'));
  const env = envFor(dir);
  const before = asrBudgetStatus({env});
  const unchanged = recordAsrUsage(0, {env});
  assert.equal(unchanged.spentCny, before.spentCny);
  const after = recordAsrUsage(18, {env}); // 0.005 CNY
  assert.equal(after.spentCny, 0.005);
  assert.equal(after.remainingCny, 0.005);
  assert.equal(canStartAsr({env}), false); // remaining <= 0.01 reserve
});