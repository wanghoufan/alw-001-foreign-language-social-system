/**
 * 私有归档接收端（只绑 127.0.0.1，经 Tailscale Serve/HTTPS 或 ADB reverse 进入）。
 * 必须配置 SM_ARCHIVE_TOKEN，否则拒绝启动；令牌只从环境或本机 .local 文件读取。
 */
import crypto from "node:crypto";
import http from "node:http";
import {saveSession} from "./conversation-archive.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.SM_ARCHIVE_PORT || 8781);
const TOKEN = String(process.env.SM_ARCHIVE_TOKEN || "");
const MAX_BODY = 512 * 1024;

if (!TOKEN || TOKEN.length < 24) {
  console.error("[archive] SM_ARCHIVE_TOKEN 未配置或过短（至少 24 字符），拒绝启动");
  process.exit(78);
}

function json(res, code, obj) {
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(obj));
}

function tokenOK(header) {
  const given = String(header || "");
  if (given.length !== TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(TOKEN));
}

async function readBody(req) {
  let size = 0;
  const parts = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error("payload too large");
      error.status = 413;
      throw error;
    }
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    const error = new Error("invalid json");
    error.status = 400;
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname.endsWith("/health") && req.method === "GET") {
    return json(res, 200, {ok: true, service: "socialmate-archive", auth: "required"});
  }
  if (url.pathname.endsWith("/api/archive/session") && req.method === "POST") {
    if (!tokenOK(req.headers["x-archive-token"])) {
      return json(res, 401, {ok: false, code: "UNAUTHORIZED"});
    }
    try {
      const payload = await readBody(req);
      const result = await saveSession(payload);
      // 只记录状态与会话 ID，不记录任何转写正文。
      console.log(`[archive] ${result.status} session=${String(payload?.sessionId || "").slice(0, 12)}…`);
      return json(res, result.status === "duplicate" ? 200 : 201, {
        ok: true,
        status: result.status,
        sessionId: payload?.sessionId,
        hash: result.hash,
      });
    } catch (error) {
      const status = error.status || (error.code === "ARCHIVE_REVISION_CONFLICT" ? 409 : 400);
      return json(res, status, {
        ok: false,
        code: error.code || "ARCHIVE_REJECTED",
        error: error.message,
      });
    }
  }
  return json(res, 404, {ok: false, code: "NOT_FOUND"});
});

server.listen(PORT, HOST, () => {
  console.log(`[archive] http://${HOST}:${PORT} (token required, max ${MAX_BODY} bytes)`);
});

export {server};