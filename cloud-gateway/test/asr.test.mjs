import test from "node:test";
import assert from "node:assert/strict";
import {WebSocket, WebSocketServer} from "ws";
import {startGateway, TEST_FP} from "./helpers.mjs";

const ASR_ENV = {
  CLOUD_ASR_UPSTREAM: "p066",
  CLOUD_ASR_P066_URL: "ws://127.0.0.1:9/asr",
  CLOUD_ASR_P066_TOKEN: "fake-p066-token",
};

async function startFakeUpstream() {
  const wss = new WebSocketServer({host: "127.0.0.1", port: 0});
  await new Promise((resolve) => wss.once("listening", resolve));
  const address = wss.address();
  const state = {audio: [], connections: 0, closes: 0, endMessages: 0};

  wss.on("connection", (ws) => {
    state.connections += 1;
    ws.send(JSON.stringify({type: "session", status: "ready"}));
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        state.audio.push(Buffer.from(data));
        ws.send(JSON.stringify({type: "interim", text: "par", startMs: 0, endMs: 100}));
        ws.send(JSON.stringify({type: "final", text: "partial-final", startMs: 0, endMs: 100, index: 1}));
        // 故意重复同一 final，验证服务端去重。
        ws.send(JSON.stringify({type: "final", text: "partial-final", startMs: 0, endMs: 100, index: 1}));
        return;
      }
      try {
        const message = JSON.parse(String(data));
        if (message.type === "end") {
          state.endMessages += 1;
          ws.send(JSON.stringify({type: "session", status: "end"}));
        }
      } catch {
        // 忽略非 JSON。
      }
    });
    ws.on("close", () => { state.closes += 1; });
  });

  return {
    state,
    port: address.port,
    factory: () => new WebSocket(`ws://127.0.0.1:${address.port}`),
    close: () => new Promise((resolve) => wss.close(() => resolve())),
  };
}

function makeInbox(ws) {
  const items = [];
  const listeners = new Set();
  ws.on("message", (data) => {
    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    items.push(message);
    for (const listener of [...listeners]) listener(message);
  });
  return {
    items,
    waitFor(predicate, timeoutMs = 3000) {
      const existing = items.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          listeners.delete(listener);
          reject(new Error("等待 WebSocket 消息超时"));
        }, timeoutMs);
        const listener = (message) => {
          if (!predicate(message)) return;
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(message);
        };
        listeners.add(listener);
      });
    },
  };
}

function connectAsr(base, {token, fingerprint = TEST_FP} = {}) {
  const url = `${base.replace(/^http/, "ws")}/v1/asr/stream?track=mix`;
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (fingerprint) headers["x-device-fingerprint"] = fingerprint;
  return new WebSocket(url, {headers});
}

function expectRejected(options, expectedStatus) {
  return new Promise((resolve, reject) => {
    const ws = connectAsr(options.base, options);
    ws.on("unexpected-response", (request, response) => {
      response.resume();
      resolve(response.statusCode);
    });
    ws.on("error", (error) => {
      if (!error.message.includes("Unexpected server response")) reject(error);
    });
    ws.on("open", () => reject(new Error("不应建立 WebSocket")));
    setTimeout(() => reject(new Error("握手超时")), 3000);
  });
}

async function tokenOf(gw, options = {}) {
  const issued = await gw.issueToken(options);
  assert.equal(issued.status, 201, JSON.stringify(issued.json));
  return issued.json.token;
}

test("ASR 握手 401：缺少令牌", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({env: ASR_ENV, gateway: {asrUpstreamFactory: upstream.factory}});
  t.after(async () => { await gw.close(); await upstream.close(); });
  assert.equal(await expectRejected({base: gw.base}), 401);
  assert.equal(upstream.state.connections, 0);
});

test("ASR 握手 403：scope 不足", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({env: ASR_ENV, gateway: {asrUpstreamFactory: upstream.factory}});
  t.after(async () => { await gw.close(); await upstream.close(); });
  const token = await tokenOf(gw, {deviceId: "device-asr-scope", scopes: ["status"]});
  assert.equal(await expectRejected({base: gw.base, token}), 403);
});

test("ASR 握手 402：预算为 0", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({
    env: {...ASR_ENV, CLOUD_ASR_BUDGET_CNY: "0"},
    gateway: {asrUpstreamFactory: upstream.factory},
  });
  t.after(async () => { await gw.close(); await upstream.close(); });
  const token = await tokenOf(gw);
  assert.equal(await expectRejected({base: gw.base, token}), 402);
});

test("逐帧转发、partial/final 标记、重复 final 去重", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({env: ASR_ENV, gateway: {asrUpstreamFactory: upstream.factory}});
  t.after(async () => { await gw.close(); await upstream.close(); });
  const token = await tokenOf(gw);

  const ws = connectAsr(gw.base, {token});
  t.after(() => { try { ws.close(); } catch {} });
  const inbox = makeInbox(ws);
  ws.on("error", () => {});
  await inbox.waitFor((message) => message.type === "session" && message.status === "ready");

  const frames = [Buffer.alloc(3200, 1), Buffer.alloc(1600, 2), Buffer.alloc(6400, 3)];
  for (const frame of frames) ws.send(frame, {binary: true});

  await inbox.waitFor((message) => message.type === "final");
  await new Promise((resolve) => setTimeout(resolve, 120));

  assert.equal(upstream.state.audio.length, frames.length, "上游收到的帧数应与客户端一致");
  for (let i = 0; i < frames.length; i += 1) {
    assert.deepEqual(upstream.state.audio[i], frames[i], `第 ${i + 1} 帧必须原样转发`);
  }

  const interim = inbox.items.filter((message) => message.type === "interim");
  const finals = inbox.items.filter((message) => message.type === "final");
  assert.ok(interim.length >= 1, "必须下发 partial");
  assert.equal(finals.length, 1, "重复 final 必须被去重");
  assert.equal(finals[0].final, true);
  assert.equal(finals[0].text, "partial-final");
  assert.equal(finals[0].mock, false);
});

test("会话上限：短上限到点自动结束并释放预算与会话", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({
    env: ASR_ENV,
    gateway: {asrUpstreamFactory: upstream.factory, asrMaxSessionSeconds: 0.3},
  });
  t.after(async () => { await gw.close(); await upstream.close(); });
  const token = await tokenOf(gw);

  const ws = connectAsr(gw.base, {token});
  const inbox = makeInbox(ws);
  ws.on("error", () => {});
  await inbox.waitFor((message) => message.type === "session" && message.status === "ready");

  const limit = await inbox.waitFor((message) => message.type === "error" && message.code === "ASR_SESSION_LIMIT", 3000);
  assert.equal(limit.code, "ASR_SESSION_LIMIT");
  const ended = await inbox.waitFor((message) => message.type === "session" && message.status === "ended", 3000);
  assert.equal(ended.reason, "session-limit");
  assert.equal(await gw.gateway.store.countSessions({kind: "asr"}), 0, "会话结束后必须释放占用");
  const budget = (await gw.gateway.budget.status())["asr:p066"];
  assert.equal(budget.reservedCny, 0, "会话结束后不应残留预留");
});

test("断线回收：客户端断开后关闭上游并释放会话", async (t) => {
  const upstream = await startFakeUpstream();
  const gw = await startGateway({env: ASR_ENV, gateway: {asrUpstreamFactory: upstream.factory}});
  t.after(async () => { await gw.close(); await upstream.close(); });
  const token = await tokenOf(gw);

  const ws = connectAsr(gw.base, {token});
  ws.on("error", () => {});
  const inbox = makeInbox(ws);
  await inbox.waitFor((message) => message.type === "session" && message.status === "ready");
  assert.equal(await gw.gateway.store.countSessions({kind: "asr"}), 1);

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(await gw.gateway.store.countSessions({kind: "asr"}), 0, "客户端断开后应释放会话");
  assert.ok(upstream.state.closes >= 1, "客户端断开后应关闭上游");
});