import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createSqliteStateStore} from "../src/state-store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "fixtures", "reserve-worker.mjs");

function runWorker(file, limit, micros, attempts) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER, file, String(limit), String(micros), String(attempts)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`worker exit ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout || "{}"));
    });
  });
}

test("SQLite 预留/提交/回滚语义", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cloud-gateway-budget-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const store = createSqliteStateStore({file: path.join(dir, "state.db")});
  t.after(() => store.close());

  const first = await store.reserve({budgetKey: "deepseek", micros: 1000, limitMicros: 1000});
  assert.equal(first.ok, true);
  assert.equal(first.budget.reservedMicros, 1000);
  assert.equal(first.budget.remainingMicros, 0);

  const exhausted = await store.reserve({budgetKey: "deepseek", micros: 1, limitMicros: 1000});
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, "BUDGET_EXHAUSTED");

  const committed = await store.commit({reservationId: first.reservationId, actualMicros: 600});
  assert.equal(committed.ok, true);
  assert.equal((await store.budgetSnapshot("deepseek")).spentMicros, 600);
  assert.equal((await store.budgetSnapshot("deepseek")).reservedMicros, 0);

  const second = await store.reserve({budgetKey: "deepseek", micros: 400, limitMicros: 1000});
  assert.equal(second.ok, true);
  const rolled = await store.rollback({reservationId: second.reservationId});
  assert.equal(rolled.ok, true);
  assert.equal((await store.budgetSnapshot("deepseek")).reservedMicros, 0);
  assert.equal((await store.budgetSnapshot("deepseek")).spentMicros, 600);

  const zero = await store.reserve({budgetKey: "tts:doubao", micros: 10, limitMicros: 0});
  assert.equal(zero.ok, false);
  assert.equal(zero.reason, "BUDGET_ZERO");
});

test("跨进程并发扣减不会超过上限", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cloud-gateway-budget-concurrent-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, "state.db");

  const limit = 1000;
  const micros = 100;
  const workers = 4;
  const attempts = 10;
  const results = await Promise.all(Array.from({length: workers}, () => runWorker(file, limit, micros, attempts)));
  const success = results.reduce((sum, item) => sum + Number(item.reserved || 0), 0);
  const errors = results.reduce((sum, item) => sum + Number(item.errors || 0), 0);
  assert.equal(errors, 0, "子进程不应出现未处理的数据库错误");

  const store = createSqliteStateStore({file});
  t.after(() => store.close());
  const snapshot = await store.budgetSnapshot("deepseek");
  assert.ok(snapshot, "预算行必须存在");
  assert.ok(snapshot.reservedMicros <= limit, "预留总额不得超上限");
  assert.equal(snapshot.reservedMicros, success * micros);
  assert.equal(success, limit / micros, "恰好只允许 10 次 100 微元预留成功");
});