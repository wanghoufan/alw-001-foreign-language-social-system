/**
 * 私有归档接收端（只绑 127.0.0.1，经 Tailscale Serve/HTTPS 或 ADB reverse 进入）。
 * 必须配置 SM_ARCHIVE_TOKEN，否则拒绝启动；令牌只从环境或本机 .local 文件读取。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {saveSession} from "./conversation-archive.mjs";
import {exportSessions, getSession, listSessions, searchSessions} from "./archive-history.mjs";
import {verifyToken} from "./pairing.mjs";
import {isPrivateIp} from "./lan-net.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_HTML = path.join(HERE, "archive-history.html");

const HOST = String(process.env.SM_ARCHIVE_HOST || "").trim() || "127.0.0.1";
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

/**
 * 令牌校验：接受两种凭证。
 * - `v1.<deviceId>.<iat>.<exp>.<mac>`：配对设备换来的短期令牌（≤24h，可撤销）；
 * - 旧的长期静态令牌：只为本机既有脚本/桌面流程保留，不再写进任何 APK。
 * 短期令牌优先判定，避免两条路径混用。
 */
async function tokenOK(header) {
  const given = String(header || "").trim();
  if (!given) return false;
  if (given.startsWith("v1.")) {
    const check = await verifyToken(given).catch(() => null);
    if (check && check.ok) return true;
    return false;
  }
  if (!TOKEN || given.length !== TOKEN.length) return false;
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
  if (!isPrivateIp(req.socket.remoteAddress)) {
    return json(res, 403, {ok: false, code: "LAN_ONLY", error: "仅允许本机或局域网访问"});
  }
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  if (url.pathname.endsWith("/health") && req.method === "GET") {
    return json(res, 200, {ok: true, service: "socialmate-archive", auth: "required"});
  }
  if (url.pathname.endsWith("/history") && req.method === "GET") {
    try {
      const html = await fs.readFile(HISTORY_HTML, "utf8");
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
      });
      return res.end(html);
    } catch {
      return json(res, 500, {ok: false, code: "HISTORY_PAGE_MISSING"});
    }
  }
  if (url.pathname.endsWith("/api/archive/list") && req.method === "GET") {
    if (!(await tokenOK(req.headers["x-archive-token"]))) {
      return json(res, 401, {ok: false, code: "UNAUTHORIZED"});
    }
    try {
      const data = await listSessions({
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
      });
      // 只输出统计信息，不输出任何原文。
      console.log(`[archive] list total=${data.total} scanned=${data.scanned} skipped=${data.skipped}`);
      return json(res, 200, {ok: true, ...data});
    } catch (error) {
      return json(res, error.status || 500, {ok: false, code: "LIST_FAILED", error: error.message});
    }
  }
  if (url.pathname.endsWith("/api/archive/sessions") && req.method === "GET") {
    if (!(await tokenOK(req.headers["x-archive-token"]))) {
      return json(res, 401, {ok: false, code: "UNAUTHORIZED"});
    }
    try {
      const data = await searchSessions({
        q: url.searchParams.get("q") || "",
        person: url.searchParams.get("person") || "",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        limit: url.searchParams.get("limit") || undefined,
        cursor: url.searchParams.get("cursor") || "",
      });
      // 只记录条数，绝不记录搜索词或原文。
      console.log(`[archive] search items=${data.items.length} matched=${data.matched} scanned=${data.scanned}`);
      return json(res, 200, {ok: true, ...data});
    } catch (error) {
      return json(res, error.status || 500, {
        ok: false,
        code: error.status === 400 ? "INVALID_QUERY" : "SEARCH_FAILED",
        error: error.message,
      });
    }
  }
  if (url.pathname.includes("/api/archive/session/") && req.method === "GET") {
    if (!(await tokenOK(req.headers["x-archive-token"]))) {
      return json(res, 401, {ok: false, code: "UNAUTHORIZED"});
    }
    const sessionId = decodeURIComponent(url.pathname.split("/api/archive/session/")[1] || "");
    try {
      const found = await getSession(sessionId);
      if (!found) return json(res, 404, {ok: false, code: "SESSION_NOT_FOUND"});
      console.log(`[archive] read session=${sessionId.slice(0, 12)}…`);
      return json(res, 200, {ok: true, ...found});
    } catch (error) {
      return json(res, error.status || 500, {ok: false, code: "READ_FAILED", error: error.message});
    }
  }
  if (url.pathname.endsWith("/api/archive/export") && req.method === "GET") {
    if (!(await tokenOK(req.headers["x-archive-token"]))) {
      return json(res, 401, {ok: false, code: "UNAUTHORIZED"});
    }
    try {
      const {markdown, count} = await exportSessions({
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
      });
      console.log(`[archive] export count=${count}`);
      res.writeHead(200, {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'attachment; filename="socialmate-export.md"',
      });
      return res.end(markdown);
    } catch (error) {
      return json(res, error.status || 500, {ok: false, code: "EXPORT_FAILED", error: error.message});
    }
  }
  if (url.pathname.endsWith("/api/archive/session") && req.method === "POST") {
    if (!(await tokenOK(req.headers["x-archive-token"]))) {
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
