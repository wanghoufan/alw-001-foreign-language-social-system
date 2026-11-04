#!/usr/bin/env node
/**
 * N05 V1.5.1 T2 证据：用于验证 SessionArchive「401 → 刷新一次令牌 → 重试一次」。
 * 只在本机 0.0.0.0:8799 监听，不写任何归档目录；第一次 POST 返回 401，之后返回 201。
 *
 * 运行：node docs/plan/.../qa/t2-recovery/fake-archive.mjs <logfile>
 * 日志只记 token 的 sha256 前缀（不记令牌全文）与请求字节数。
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const port = Number(process.env.PORT || 8799);
const logFile = process.argv[2] || "/dev/stdout";
const out = fs.createWriteStream(logFile, {flags: "a"});
let posts = 0;

function log(obj) {
  const line = `${new Date().toISOString()} ${JSON.stringify(obj)}\n`;
  out.write(line);
  process.stdout.write(line);
}

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, {"content-type": "application/json"});
    res.end(JSON.stringify({ok: true, role: "qa-fake-archive", posts}));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405);
    res.end();
    return;
  }
  let bytes = 0;
  req.on("data", (chunk) => { bytes += chunk.length; });
  req.on("end", () => {
    posts += 1;
    const token = String(req.headers["x-archive-token"] || "");
    const record = {
      post: posts,
      path: req.url,
      bytes,
      hasToken: token.length > 0,
      tokenSha12: token ? crypto.createHash("sha256").update(token).digest("hex").slice(0, 12) : "",
    };
    log(record);
    if (posts === 1) {
      res.writeHead(401, {"content-type": "application/json"});
      res.end(JSON.stringify({ok: false, error: "TOKEN_EXPIRED"}));
    } else {
      res.writeHead(201, {"content-type": "application/json"});
      res.end(JSON.stringify({ok: true, hash: "qa401refresh"}));
    }
  });
});

server.listen(port, "0.0.0.0", () => log({event: "listen", port}));