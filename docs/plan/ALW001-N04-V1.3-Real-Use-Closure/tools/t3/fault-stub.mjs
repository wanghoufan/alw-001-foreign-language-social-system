#!/usr/bin/env node
/**
 * T3 故障注入桩（只绑 127.0.0.1:8799，经 adb reverse 给手机用）。
 *
 * 目的：在不破坏真实归档服务、不伪造 final 的前提下，验证手机端 outbox 对
 * 401/403/429/5xx/413/连接重置的分类、退避与「不丢原文」。
 *
 *   node fault-stub.mjs --port 8799 --log <file>
 *   GET  /__mode/<mode>   切换模式：401 403 429 500 413 ok reset slow
 *   GET  /__stats         读取请求计数与最近一次请求摘要
 *   POST /api/archive/session   按模式回应（ok 时返回 201 + 固定 hash）
 */
import fs from "node:fs";
import http from "node:http";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(argOf("--port", "8799"));
const LOG = argOf("--log", "/tmp/t3-fault-stub.log");

let mode = "ok";
let requests = 0;
let last = null;
const log = (line) => fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname.startsWith("/__mode/")) {
    mode = url.pathname.slice("/__mode/".length);
    log(`mode=${mode}`);
    res.writeHead(200, {"Content-Type": "application/json"});
    return res.end(JSON.stringify({ok: true, mode}));
  }
  if (url.pathname === "/__stats") {
    res.writeHead(200, {"Content-Type": "application/json"});
    return res.end(JSON.stringify({ok: true, mode, requests, last}));
  }
  if (!url.pathname.endsWith("/api/archive/session") || req.method !== "POST") {
    res.writeHead(404, {"Content-Type": "application/json"});
    return res.end(JSON.stringify({ok: false, code: "NOT_FOUND"}));
  }
  let size = 0;
  for await (const chunk of req) size += chunk.length;
  requests += 1;
  last = {at: new Date().toISOString(), bytes: size, token: String(req.headers["x-archive-token"] || "").slice(0, 12)};
  log(`POST bytes=${size} mode=${mode} auth=${last.token ? "present" : "missing"}`);
  if (mode === "reset") {
    req.socket.destroy();
    return;
  }
  if (mode === "slow") {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
  const status = Number(mode) || 201;
  res.writeHead(status, {"Content-Type": "application/json"});
  res.end(JSON.stringify({
    ok: status >= 200 && status < 300,
    status: status === 201 ? "created" : "fault",
    code: status >= 200 && status < 300 ? undefined : `FAULT_${status}`,
    hash: status >= 200 && status < 300 ? "stub-hash-" + size : undefined,
  }));
});

server.listen(PORT, "127.0.0.1", () => log(`fault-stub listening ${PORT}`));
