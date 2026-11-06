/**
 * 测试共用工具：每个用例一个临时 SQLite 文件，互不污染；所有上游都用 fake。
 */
import {mkdtempSync, rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {createGatewayServer} from "../src/server.mjs";

export const TEST_SECRET = "unit-test-token-secret-0123456789abcdef";
export const TEST_ADMIN = "unit-test-admin-token-0123456789";
export const TEST_FP = "fingerprint-test-device-aaaa";

export async function startGateway({env = {}, now, gateway = {}} = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cloud-gateway-test-"));
  const mergedEnv = {
    CLOUD_STATE_DRIVER: "sqlite",
    CLOUD_STATE_DB: path.join(dir, "state.db"),
    CLOUD_GATEWAY_TOKEN_SECRET: TEST_SECRET,
    CLOUD_GATEWAY_ADMIN_TOKEN: TEST_ADMIN,
    CLOUD_RATE_LIMIT_PER_WINDOW: "1000",
    CLOUD_RATE_WINDOW_MS: "60000",
    CLOUD_DEEPSEEK_BUDGET_CNY: "1",
    CLOUD_TTS_BUDGET_CNY: "1",
    CLOUD_ASR_BUDGET_CNY: "1",
    DEEPSEEK_API_KEY: "test-deepseek-key-0123456789",
    SM_DOUBAO_API_KEY: "test-doubao-key-0123456789",
    CLOUD_ASR_UPSTREAM: "p066",
    CLOUD_ASR_P066_URL: "ws://127.0.0.1:9/asr",
    CLOUD_ASR_P066_TOKEN: "fake-p066-token",
    ...env,
  };
  const instance = await createGatewayServer({
    env: mergedEnv,
    tokenSecret: TEST_SECRET,
    now,
    ...gateway,
  });
  const address = await instance.listen({port: 0, host: "127.0.0.1"});
  const base = `http://127.0.0.1:${address.port}`;

  async function request(pathname, {method = "GET", token, fingerprint = TEST_FP, body, headers = {}} = {}) {
    const response = await fetch(`${base}${pathname}`, {
      method,
      headers: {
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...(fingerprint ? {"x-device-fingerprint": fingerprint} : {}),
        ...(body !== undefined ? {"Content-Type": "application/json"} : {}),
        ...headers,
      },
      ...(body !== undefined ? {body: JSON.stringify(body)} : {}),
    });
    let json = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return {status: response.status, json, headers: response.headers};
  }

  async function issueToken({deviceId = "device-0001", fingerprint = TEST_FP, scopes = ["ai", "tts", "asr", "status"], ttlSeconds = 3600} = {}) {
    const response = await request("/auth/token", {
      method: "POST",
      fingerprint: "",
      headers: {"x-admin-token": TEST_ADMIN},
      body: {deviceId, fingerprint, scopes, ttlSeconds},
    });
    return response;
  }

  async function close() {
    await instance.close();
    rmSync(dir, {recursive: true, force: true});
  }

  return {gateway: instance, base, dir, request, issueToken, close, env: mergedEnv};
}

/** 可直接注入 DeepSeek 的成功响应。 */
export function deepseekJson(content, usage = {prompt_tokens: 12, completion_tokens: 6}) {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => ({choices: [{message: {content}}], usage}),
  });
}

/** 豆包逐行 JSON + base64 音频。 */
export function doubaoAudio(audioBytes = Buffer.from("ID3-fake-mp3-bytes")) {
  return async () => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => Buffer.from(`${JSON.stringify({code: 0, data: audioBytes.toString("base64")})}\n`, "utf8"),
  });
}

/** 返回指定 HTTP 状态的上游响应。 */
export function upstreamStatus(status) {
  return async () => ({ok: false, status, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0)});
}