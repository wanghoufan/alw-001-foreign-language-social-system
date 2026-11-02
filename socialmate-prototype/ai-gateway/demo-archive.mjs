/**
 * N04 演示会话 → Mac 固定演示归档目录（SDD §2.4 / T3）。
 *
 * 边界：
 * - 待传队列就是 `SocialMate-Data/Demo/Conversations` 里的会话 JSON（权威记录）；投递失败不删本地副本。
 * - 投递只走受控的隔离接收端（默认 127.0.0.1:8782），其 root 固定为
 *   `~/Documents/SocialMate/Demo/Conversations`；正式归档 `~/Documents/SocialMate/Conversations` 不参与。
 * - 2xx 才记为 exported；同一 sessionId + contentHash 重复投递由 conversation-archive.saveSession
 *   判 duplicate（HTTP 200），不会写第二份。
 * - 只搬运母版已生成的逐字会话对象，不在本模块改写任何原文。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {archivePaths} from "./conversation-archive.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");
const TOKEN_FILE = path.join(REPO_ROOT, "socialmate-v1.2", ".local", "demo-archive-token");
const STATE_FILE = "archive-state.json";

export const DEFAULT_DEMO_ARCHIVE_ENDPOINT = "http://127.0.0.1:8782/api/archive/session";

/** Mac 固定演示归档根目录（与真实 Conversations 完全分开的一棵树）。 */
export function demoArchiveRoot() {
  return process.env.SM_DEMO_ARCHIVE_DIR
    || path.join(os.homedir(), "Documents", "SocialMate", "Demo", "Conversations");
}

export function demoArchiveEndpoint() {
  return process.env.SM_DEMO_ARCHIVE_ENDPOINT || DEFAULT_DEMO_ARCHIVE_ENDPOINT;
}

/** 令牌只从环境或本机 .local 文件读取，不写入任何证据文件。 */
export async function demoArchiveToken() {
  if (process.env.SM_DEMO_ARCHIVE_TOKEN) return String(process.env.SM_DEMO_ARCHIVE_TOKEN);
  try {
    return (await fs.readFile(TOKEN_FILE, "utf8")).trim();
  } catch {
    return "";
  }
}

export function archiveStatePath(demoRoot) {
  return path.join(demoRoot, STATE_FILE);
}

async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir, {withFileTypes: true});
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await fs.mkdir(path.dirname(file), {recursive: true, mode: 0o700});
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), {encoding: "utf8", mode: 0o600});
  await fs.rename(temp, file);
}

async function readLedger(demoRoot) {
  const ledger = await readJson(archiveStatePath(demoRoot));
  if (!ledger || typeof ledger !== "object") {
    return {schemaVersion: 1, items: {}, updatedAt: null};
  }
  return {schemaVersion: 1, items: {...(ledger.items || {})}, updatedAt: ledger.updatedAt || null};
}

/** 递归收集演示会话 JSON（权威记录），只读，不改文件。 */
export async function listDemoSessions(conversationsDir) {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdirSafe(dir)) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".json")) files.push(full);
    }
  };
  await walk(conversationsDir);
  files.sort();
  const out = [];
  for (const file of files) {
    const payload = await readJson(file);
    if (!payload?.session?.sessionId) continue;
    out.push({
      file,
      relative: path.relative(conversationsDir, file),
      session: payload.session,
      contentHash: String(payload.contentHash || ""),
    });
  }
  return out;
}

/** sessionId → 人物 slug（来自演示 state.json；缺失时返回 null）。 */
async function readSessionOwners(demoRoot) {
  const state = await readJson(path.join(demoRoot, "state.json"));
  const map = new Map();
  for (const entry of state?.personas || []) {
    for (const meta of entry.sessions || []) map.set(meta.sessionId, entry.slug);
  }
  return map;
}

async function countRemotePairs(root) {
  let md = 0;
  let json = 0;
  const walk = async (dir) => {
    for (const entry of await readdirSafe(dir)) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) md += 1;
      else if (entry.isFile() && entry.name.endsWith(".json")) json += 1;
    }
  };
  await walk(root);
  return {md, json};
}

/** 当前归档状态：队列条数、已送达、待传、Mac 实际文件数。 */
export async function demoArchiveStatus({demoRoot, conversationsDir}) {
  const root = demoArchiveRoot();
  const endpoint = demoArchiveEndpoint();
  const token = await demoArchiveToken();
  const ledger = await readLedger(demoRoot);
  const sessions = await listDemoSessions(conversationsDir);
  const owners = await readSessionOwners(demoRoot);
  const items = sessions.map(({session, contentHash, relative}) => {
    const entry = ledger.items[session.sessionId] || null;
    const exported = Boolean(entry && entry.status === "exported"
      && entry.contentHash === (contentHash || entry.contentHash));
    const paths = archivePaths(session, root);
    return {
      sessionId: session.sessionId,
      personSlug: owners.get(session.sessionId) || null,
      queue: path.join("SocialMate-Data", "Demo", "Conversations", relative),
      contentHash: contentHash || null,
      status: exported ? "exported" : "pending",
      attempts: entry?.attempts || 0,
      httpStatus: entry?.httpStatus || null,
      remoteStatus: entry?.remoteStatus || null,
      deliveredAt: entry?.deliveredAt || null,
      lastError: exported ? null : (entry?.lastError || null),
      remoteMarkdown: paths.markdown,
      remoteJson: paths.json,
    };
  });
  const delivered = items.filter((i) => i.status === "exported").length;
  const remote = await countRemotePairs(root);
  return {
    ok: true,
    synthetic: true,
    root,
    endpoint,
    tokenConfigured: token.length >= 24,
    total: items.length,
    delivered,
    pending: items.length - delivered,
    remoteFiles: remote,
    ledgerUpdatedAt: ledger.updatedAt,
    items,
  };
}

/**
 * 把演示会话队列投递到隔离归档端。
 * - 已 exported 且本地 contentHash 未变 → 跳过，不重复上传；
 * - 上一个 exported 但 Mac 文件不在了（被手工删除/换机）→ 重新投递；
 * - 失败保留 pending 与 lastError，本地会话不删除，下一次调用继续补传。
 */
export async function pushDemoArchive({demoRoot, conversationsDir, fetchImpl = fetch, timeoutMs = 8000}) {
  const root = demoArchiveRoot();
  const endpoint = demoArchiveEndpoint();
  const token = await demoArchiveToken();
  if (token.length < 24) {
    return {
      ok: false,
      code: "ARCHIVE_TOKEN_MISSING",
      endpoint,
      root,
      total: 0,
      delivered: 0,
      pending: 0,
      created: 0,
      duplicates: 0,
      errors: ["演示归档令牌缺失（socialmate-v1.2/demo-archive-service.sh start 会生成）"],
      status: await demoArchiveStatus({demoRoot, conversationsDir}),
    };
  }

  const ledger = await readLedger(demoRoot);
  const sessions = await listDemoSessions(conversationsDir);
  let created = 0;
  let duplicates = 0;
  let skippedCached = 0;
  const errors = [];

  for (const {session, contentHash} of sessions) {
    const id = session.sessionId;
    const entry = ledger.items[id] || null;
    const cached = entry && entry.status === "exported" && entry.contentHash === contentHash;
    if (cached) {
      const paths = archivePaths(session, root);
      let present = true;
      try {
        await fs.access(paths.json);
      } catch {
        present = false;
      }
      if (present) {
        skippedCached += 1;
        continue;
      }
    }
    const paths = archivePaths(session, root);
    const base = {
      contentHash,
      attempts: (entry?.attempts || 0) + 1,
      remoteMarkdown: paths.markdown,
      remoteJson: paths.json,
      lastAttemptAt: new Date().toISOString(),
    };
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json; charset=utf-8", "X-Archive-Token": token},
        // 归档 JSON 只保存 final 段（normalizeSegment 不再重复写 final 字段）；
        // 投递时补回协议要求的 final:true，原文与其他字段逐字不变。
        body: JSON.stringify({...session,
          segments: (session.segments || []).map((segment) => ({...segment, final: true}))}),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw Object.assign(new Error(body?.error || `HTTP ${response.status}`),
          {httpStatus: response.status});
      }
      await fs.access(paths.json);
      if (body?.status === "duplicate") duplicates += 1;
      else created += 1;
      ledger.items[id] = {
        ...base,
        status: "exported",
        httpStatus: response.status,
        remoteStatus: body?.status || null,
        deliveredAt: new Date().toISOString(),
        lastError: null,
      };
    } catch (error) {
      ledger.items[id] = {
        ...base,
        status: "pending",
        httpStatus: error.httpStatus || null,
        remoteStatus: null,
        deliveredAt: null,
        lastError: String(error.message || error.code || "UNREACHABLE").slice(0, 200),
      };
      errors.push({sessionId: id, error: ledger.items[id].lastError});
    }
  }

  ledger.updatedAt = new Date().toISOString();
  await writeJsonAtomic(archiveStatePath(demoRoot), ledger);
  const status = await demoArchiveStatus({demoRoot, conversationsDir});
  return {
    ok: status.pending === 0,
    endpoint,
    root,
    total: status.total,
    delivered: status.delivered,
    pending: status.pending,
    created,
    duplicates,
    skippedCached,
    errors,
    status,
  };
}
