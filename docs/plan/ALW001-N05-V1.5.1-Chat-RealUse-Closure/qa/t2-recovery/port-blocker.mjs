#!/usr/bin/env node
/**
 * N05 V1.5.1 T2 断线失败路径证据：临时占住 8790/8791，让客户端重连必然失败。
 * 只破坏连接、不读写任何业务数据；到时自动退出，避免长期占用端口。
 * 用法：node <abs path>/port-blocker.mjs <seconds>
 */
import net from "node:net";
import http from "node:http";
import fs from "node:fs";

const seconds = Number(process.argv[2] || 40);
const logFile = process.argv[3] || "";
function log(obj) {
  const line = `${new Date().toISOString()} ${JSON.stringify(obj)}\n`;
  if (logFile) fs.appendFileSync(logFile, line);
  process.stdout.write(line);
}

const tcp = net.createServer((socket) => socket.destroy());
const web = http.createServer((req, res) => {
  res.writeHead(503, {"content-type": "text/plain"});
  res.end("qa-blocked");
});

tcp.listen(8790, "0.0.0.0", () => log({event: "block", port: 8790}));
web.listen(8791, "0.0.0.0", () => log({event: "block", port: 8791}));

setTimeout(() => {
  tcp.close();
  web.close();
  log({event: "release"});
  setTimeout(() => process.exit(0), 200);
}, Math.max(5, seconds) * 1000);