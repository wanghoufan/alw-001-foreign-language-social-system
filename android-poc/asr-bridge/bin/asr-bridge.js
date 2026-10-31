#!/usr/bin/env node
/**
 * CLI 入口：npm start / npm run start:mock。
 * 环境变量由 `node --env-file-if-exists=.env` 加载。
 */

import { createAsrBridgeServer } from '../src/server.js';

let server;
try {
  server = await createAsrBridgeServer();
} catch (error) {
  console.error(`[asr-bridge] 启动失败：${error.message}`);
  process.exitCode = 1;
  process.exit();
}

console.log(`[asr-bridge] WebSocket: ${server.url}?track=A|B|mix&rate=48000&channels=2`);
console.log(`[asr-bridge] Health:    http://${server.host}:${server.port}/health`);
if (server.mode === 'mock') {
  console.log('[asr-bridge] 当前是 MOCK 模式：事件带 mock:true，不是真实腾讯云 ASR。');
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[asr-bridge] 收到 ${signal}，正在关闭...`);
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
