#!/usr/bin/env node
/**
 * N05 V1.5.1 T1 现场证据：对本机真实部署（p066 模式）做 ASR WebSocket 握手鉴权正负例。
 * 零 P066 费用：所有负例在 handleUpgrade 之前被拒；正例只完成握手后立刻关闭，不发送音频。
 *
 * 运行：node docs/plan/ALW001-N05-V1.5.1-Chat-RealUse-Closure/qa/t1-security/verify-ws-auth.mjs
 */
import WebSocket from "../../../../../android-poc/asr-bridge/node_modules/ws/index.js";
import crypto from "node:crypto";
import {mintToken, tokenSecret} from "../../../../../socialmate-prototype/ai-gateway/pairing.mjs";

const BRIDGE = process.env.ASR_WS || "ws://127.0.0.1:8790/asr";
const DEVICE_ID = process.env.DEVICE_ID || "";
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} → ${actual} (expected ${expected})`);
}
async function activeSessions() {
  const res = await fetch("http://127.0.0.1:8790/health");
  return (await res.json()).activeSessions;
}
function connect(headers) {
  return new Promise((resolve) => {
    const ws = new WebSocket(BRIDGE, {headers});
    const timer = setTimeout(() => { try { ws.terminate(); } catch {} resolve({result: "TIMEOUT"}); }, 6000);
    ws.on("open", () => { clearTimeout(timer); ws.close(); resolve({result: "OPEN"}); });
    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      res.resume();
      resolve({result: res.statusCode, error: res.headers["x-asr-auth-error"] || ""});
    });
    ws.on("error", (err) => {
      clearTimeout(timer);
      resolve({result: "ERROR", error: String(err.message || err)});
    });
  });
}

const noToken = await connect({});
check("无令牌握手", noToken.result, 401);
console.log(`   code=${noToken.error} activeSessions=${await activeSessions()}`);
check("无令牌未建立会话", await activeSessions(), 0);

const forged = await connect({"x-asr-token": "v1.dev_x.1.2.deadbeef"});
check("伪造令牌握手", forged.result, 401);
console.log(`   code=${forged.error}`);

if (DEVICE_ID) {
  // 撤销前签发的令牌：手搓 iat < revokedAt，验证服务端按撤销时刻 fail-closed。
  const secret = await tokenSecret();
  const store = JSON.parse(await (await import("node:fs/promises")).readFile(
    new URL("../../../../../socialmate-v1.2/.local/pairings.json", import.meta.url), "utf8"));
  const revokedAt = Date.parse(store.devices[DEVICE_ID].revokedAt);
  const iat = Math.floor(revokedAt / 1000) - 3600;
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const mac = Buffer.from(crypto.createHmac("sha256", secret).update(`v1|${DEVICE_ID}|${iat}|${exp}`).digest())
    .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const revokedTry = await connect({
    "x-asr-token": `v1.${DEVICE_ID}.${iat}.${exp}.${mac}`,
    origin: "http://127.0.0.1:8791",
  });
  check("撤销设备令牌握手", revokedTry.result, 401);
  console.log(`   code=${revokedTry.error}`);
}

// 取一个真实有效设备令牌（注意：令牌是短期的，但本脚本只用于本机证据）。
const devices = JSON.parse(await (await import("node:fs/promises")).readFile(
  new URL("../../../../../socialmate-v1.2/.local/pairings.json", import.meta.url), "utf8"));
const active = Object.values(devices.devices).find((d) => !d.revokedAt && d.name !== "verify-t1");
const badOrigin = await connect({
  "x-asr-token": (await mintToken(active.deviceId)).token,
  origin: "https://evil.example",
});
check("错误 Origin + 有效令牌", badOrigin.result, 403);
console.log(`   code=${badOrigin.error}`);

const good = await connect({"x-asr-token": (await mintToken(active.deviceId)).token});
check("有效令牌 + 原生无 Origin", good.result, "OPEN");
let released = -1;
for (let i = 0; i < 20; i += 1) {
  await new Promise((r) => setTimeout(r, 100));
  released = await activeSessions();
  if (released === 0) break;
}
check("握手后会话已释放", released, 0);

console.log(`\nRESULT ${fail === 0 ? "PASS" : "FAIL"} pass=${pass} fail=${fail} device=${active.deviceId}`);
process.exit(fail === 0 ? 0 : 1);