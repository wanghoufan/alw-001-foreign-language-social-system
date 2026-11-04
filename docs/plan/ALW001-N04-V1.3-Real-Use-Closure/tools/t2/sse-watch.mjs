#!/usr/bin/env node
/**
 * T2 真机取证用的私有 SSE 观察者（只读，不写任何业务数据）。
 * 连接 8791 的 /api/asr/live，把事件按到达时间写到 JSONL，供验收脚本核对
 * 「final 是不是 mock:false / 有没有 pendingId / 顺序对不对」。
 *
 * 用法：node sse-watch.mjs --out qa/<stamp>/asr-events.jsonl --seconds 90
 */
import fs from "node:fs";
import path from "node:path";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = argOf("--base", "http://127.0.0.1:8791").replace(/\/+$/, "");
const OUT = argOf("--out", "/tmp/asr-events.jsonl");
const SECONDS = Number(argOf("--seconds", "90"));

fs.mkdirSync(path.dirname(path.resolve(OUT)), {recursive: true});
const file = fs.createWriteStream(OUT, {flags: "a", encoding: "utf8"});
const started = Date.now();
let count = 0;

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), SECONDS * 1000);

const response = await fetch(`${BASE}/api/asr/live`, {
  headers: {Accept: "text/event-stream"},
  signal: controller.signal,
});
console.log("SSE", response.status, response.headers.get("content-type"));
const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
try {
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1] || "message";
      const data = /^data: (.+)$/m.exec(block)?.[1] || "";
      let parsed = null;
      try { parsed = JSON.parse(data); } catch {}
      const line = {
        receivedAt: new Date().toISOString(), atMs: Date.now() - started, event, data: parsed,
      };
      file.write(`${JSON.stringify(line)}\n`);
      count += 1;
      if (parsed) {
        console.log(`+${line.atMs}ms ${event} ${parsed.type || ""} mock=${parsed.mock} `
          + `len=${String(parsed.text || "").length} pendingId=${parsed.pendingId || "-"}`);
      }
    }
  }
} catch (error) {
  if (error.name !== "AbortError") console.error("SSE_ERROR", error.message);
}
clearTimeout(timer);
file.end();
console.log(JSON.stringify({ok: true, out: OUT, events: count, seconds: SECONDS}));
