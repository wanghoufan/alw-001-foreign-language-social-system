/**
 * 跨进程并发扣减 worker：每个进程独立打开同一个 SQLite 文件。
 * 用真实子进程验证「不是内存 Map 硬闸」。
 */
import {createSqliteStateStore} from "../../src/state-store.mjs";

const [file, limitRaw, microsRaw, attemptsRaw] = process.argv.slice(2);
const limitMicros = Number(limitRaw);
const micros = Number(microsRaw);
const attempts = Number(attemptsRaw);

const store = createSqliteStateStore({file});
let reserved = 0;
let rejected = 0;
let errors = 0;

for (let i = 0; i < attempts; i += 1) {
  let done = false;
  for (let retry = 0; retry < 5 && !done; retry += 1) {
    try {
      const result = await store.reserve({budgetKey: "deepseek", micros, limitMicros});
      if (result.ok) reserved += 1;
      else rejected += 1;
      done = true;
    } catch (error) {
      if (retry === 4) errors += 1;
    }
  }
}

await store.close();
process.stdout.write(JSON.stringify({reserved, rejected, errors}));