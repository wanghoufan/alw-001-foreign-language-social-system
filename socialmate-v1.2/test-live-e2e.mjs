/**
 * Full local chain regression WITHOUT paid APIs:
 * phone WebSocket -> ASR bridge (forced MOCK) -> in-process hub -> SSE -> final event.
 * Also proves the AI provider sees no keys, so a mock final must never bill.
 */
import {test} from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";
import WebSocket from "./vendor/ws/index.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..");
const node = process.execPath;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const {port} = server.address();
      server.close(() => resolve(port));
    });
  });
}
async function waitFor(fn, timeoutMs = 12000, label = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

test("mock phone audio reaches SSE as mock final, with zero paid-AI keys", async () => {
  const asrPort = await freePort();
  const aiPort = await freePort();
  const child = spawn(node, ["socialmate-prototype/ai-gateway/live-server.mjs"], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(asrPort),
      SOCIALMATE_AI_PORT: String(aiPort),
      ASR_FORCE_MOCK: "1",
      DEEPSEEK_API_KEY: "",
      OPENCODE_GO_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", d => { logs += d; });
  child.stderr.on("data", d => { logs += d; });
  const cleanup = () => { try { child.kill("SIGTERM"); } catch {} };
  try {
    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${aiPort}/api/asr/status`);
      return res.ok && (await res.json()).combined === true;
    }, 12000, "combined service");

    const aiHealth = await (await fetch(`http://127.0.0.1:${aiPort}/api/ai/health`)).json();
    assert.equal(aiHealth.features.asrLive, true);
    assert.equal(aiHealth.asr.mock, true);
    assert.equal(aiHealth.budget.limitCny, 1);
    assert.ok(aiHealth.budget.remainingCny <= 1);
    assert.equal(aiHealth.providers.deepseek.configured, false);
    assert.equal(aiHealth.providers["opencode-go"].configured, false);
    const asrHealth = await (await fetch(`http://127.0.0.1:${asrPort}/health`)).json();
    assert.equal(asrHealth.mock, true);

    const sse = await fetch(`http://127.0.0.1:${aiPort}/api/asr/live`, {
      headers: {Accept: "text/event-stream"},
    });
    assert.equal(sse.status, 200);
    const events = [];
    const reader = sse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const readLoop = (async () => {
      for (;;) {
        const {value, done} = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, {stream: true});
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const line = block.split("\n").find(x => x.startsWith("data: "));
          if (line) {
            try { events.push(JSON.parse(line.slice(6))); } catch {}
          }
        }
      }
    })();

    const ws = new WebSocket(`ws://127.0.0.1:${asrPort}/asr?track=mix&rate=16000&channels=1`);
    await new Promise((resolve, reject) => {
      ws.on("open", resolve);
      ws.on("error", reject);
    });
    // 1.0s of 440Hz tone at ~0.3 amplitude, then 0.6s silence, then end.
    const samples = 16000;
    const pcm = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i += 1) {
      pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 16000) * 10000), i * 2);
    }
    ws.send(pcm);
    ws.send(Buffer.alloc(9600 * 2)); // 600ms silence
    ws.send(JSON.stringify({type: "end"}));

    const final = await waitFor(() => events.find(e => e.type === "final" && e.final === true), 6000, "mock final SSE");
    assert.equal(final.mock, true);
    assert.equal(final.provider, "mock");
    assert.equal(final.speaker, "spk_0");
    assert.match(final.text, /\[mock\] speech detected/);
    assert.ok(events.some(e => e.type === "interim"), "interim event should arrive before final");

    ws.close();
    await reader.cancel();
    await readLoop.catch(() => {});
    console.log(JSON.stringify({ok: true, asrPort, aiPort, events: events.length, final: final.text}));
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    cleanup();
  }
});