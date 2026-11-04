#!/usr/bin/env node
/**
 * N05 TTS 真机验收用「远端夹具服务」（不是产品代码，不监听 8790/8791/8781/8782）。
 *
 * 用途：真实 8791 还没重启加载 TTS 路由时，Android 端也能对「远端合成→缓存→下载→播放」
 * 全链路做真机验收。做法与后端 QA 一致：
 *   - 复用 socialmate-prototype/ai-gateway/server.mjs 的 createHandler（只读引用，不改它）；
 *   - SM_AI_NO_LISTEN=1：不启动真实 8791、不触发启动期权限巡检；
 *   - SM_PAIRING_FILE 指向 /tmp 副本，任何令牌刷新只写副本，真实 pairings.json 不动；
 *   - ttsCacheRoot 指向 /tmp，音频缓存不落 SocialMate-Data；
 *   - provider 只用 fake（本地预置音频，0 元、0 厂商 Key、0 外网请求）。
 *
 * 只额外做一件事：把 /v12/api/tts/* 的请求打到 stdout，供后端计数取证。
 */
import http from "node:http";

const PORT = Number(process.env.FIXTURE_PORT || 8799);
const CACHE_ROOT = process.env.FIXTURE_TTS_CACHE || "/tmp/alw001-n05-android/TtsCache";

process.env.SM_AI_NO_LISTEN = "1";
process.env.SM_PAIRING_FILE = process.env.SM_PAIRING_FILE
  || "/tmp/alw001-n05-android/pairings.json";

const {createHandler} = await import("../../socialmate-prototype/ai-gateway/server.mjs");
const handler = createHandler({port: PORT, ttsCacheRoot: CACHE_ROOT});

const server = http.createServer((req, res) => {
  if (String(req.url || "").startsWith("/v12/api/tts/")) {
    const started = Date.now();
    res.on("finish", () => {
      console.log(`[fixture] ${req.method} ${String(req.url).split("?")[0]} -> ${res.statusCode} ${Date.now() - started}ms`);
    });
  }
  handler(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[fixture] listening on http://127.0.0.1:${PORT} ttsCache=${CACHE_ROOT}`);
});
