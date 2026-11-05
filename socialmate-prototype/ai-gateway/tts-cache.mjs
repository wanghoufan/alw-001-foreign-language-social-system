/**
 * N05 TTS 音频缓存 + 独立计费账本。
 *
 * 边界（对应 TTS-PROVIDER-ADAPTER-DECISION-V1.0 §四）：
 * - 缓存只存音频字节和元数据，**不存原文字**（只存 textSha256），避免把学习段原文复制一份；
 * - 目录固定为 SocialMate-Data/TtsCache/，可整目录删除，与 People/PlaceNotes 学习记录物理分离；
 * - 缓存键绑定业务来源（recordId/blockId/revision），同一段重复播放只重放音频，不重复合成；
 * - 账本只记「钱」，与 ASR/DeepSeek 的 1 元预算完全独立；本轮 limitCny 硬编码 0，
 *   任何计费请求在进入适配器前就被 402 拦下，因此账本永远不会有支出条目。
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

/** 本轮不允许任何计费调用：用户批准供应商与预算前不得放开。 */
export const TTS_BUDGET_LIMIT_CNY = 0;
export const CACHE_SCHEMA = 1;

/**
 * AWS Polly 独立账本硬上限（默认 ¥0）：与 ASR/DeepSeek、TTS 公共账本完全隔离。
 * 只有用户在本地凭据文档里显式填写 SM_POLLY_BUDGET_CNY 并重启服务后才会放开；
 * 未填 / 非法 / 0 时任何 aws-polly 计费请求仍被 402 拦下，账本不可能出现支出条目。
 */
function parseBudgetCny(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.min(Math.round(amount * 1e6) / 1e6, 1000);
}
export const AWS_POLLY_BUDGET_LIMIT_CNY = parseBudgetCny(process.env.SM_POLLY_BUDGET_CNY);
export const DOUBAO_BUDGET_LIMIT_CNY = parseBudgetCny(process.env.SM_DOUBAO_BUDGET_CNY);

/** 按 provider 的独立账本上限表（未列出的 provider 一律 0）。 */
export const PROVIDER_LEDGER_LIMITS = {"aws-polly": AWS_POLLY_BUDGET_LIMIT_CNY, doubao: DOUBAO_BUDGET_LIMIT_CNY};

/** 音频扩展名由 mimeType 决定；.wav / .mp3 都算合法缓存文件（旧缓存继续可读）。 */
const AUDIO_EXT_BY_MIME = {"audio/wav": ".wav", "audio/mpeg": ".mp3"};
const KNOWN_AUDIO_EXTS = [".wav", ".mp3"];
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

function extOfMime(mimeType) {
  return AUDIO_EXT_BY_MIME[String(mimeType || "").toLowerCase()] || ".wav";
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function defaultCacheRoot() {
  return process.env.SM_TTS_CACHE_DIR || path.join(REPO_ROOT, "SocialMate-Data", "TtsCache");
}

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

async function writeFileAtomic(file, data, mode = 0o600) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, {recursive: true, mode: 0o700});
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(temp, data, {mode});
  await fs.rename(temp, file);
  await fs.chmod(file, mode).catch(() => {});
}

export function createTtsCache({root} = {}) {
  const cacheRoot = () => path.resolve(root || defaultCacheRoot());
  const dirOf = (name) => path.join(cacheRoot(), name);

  async function ensure() {
    for (const name of ["audio", "index", "preset", "ledger"]) {
      await fs.mkdir(dirOf(name), {recursive: true, mode: 0o700});
    }
  }

  function presetDir() {
    return dirOf("preset");
  }

  function audioFile(audioId, ext) {
    return path.join(dirOf("audio"), `${audioId}${ext}`);
  }

  function audioMetaFile(audioId) {
    return path.join(dirOf("audio"), `${audioId}.json`);
  }

  /**
   * 候选音频文件：优先按 mimeType 决定的扩展名，其余已知扩展名作兼容回退，
   * 保证旧 .wav 缓存与新的 .mp3 缓存都能读到。
   */
  function candidateAudioFiles(audioId, mimeType) {
    const preferred = extOfMime(mimeType);
    return [...new Set([preferred, ...KNOWN_AUDIO_EXTS])].map((ext) => audioFile(audioId, ext));
  }

  function paths(audioId, mimeType) {
    return {
      audio: audioFile(audioId, extOfMime(mimeType)),
      audioMeta: audioMetaFile(audioId),
    };
  }

  function indexPath(key) {
    return path.join(dirOf("index"), `${key}.json`);
  }

  async function readJson(file) {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      return null;
    }
  }

  /**
   * 读缓存条目并校验完整性；音频字节缺失或被改动一律视为「没有可用缓存」，
   * 不把错误的音频当成命中返回。
   */
  async function readEntry(key) {
    if (!/^[a-f0-9]{64}$/.test(String(key || ""))) return null;
    const meta = await readJson(indexPath(key));
    if (!meta || !meta.audioId) return null;
    let bytes = null;
    for (const file of candidateAudioFiles(meta.audioId, meta.mimeType)) {
      let candidate;
      try {
        candidate = await fs.readFile(file);
      } catch {
        continue;
      }
      if (candidate.length !== Number(meta.bytes) || sha256Hex(candidate) !== meta.audioSha256) continue;
      bytes = candidate;
      break;
    }
    if (!bytes) return null;
    return {...meta, bytes};
  }

  async function writeEntry({key, meta, bytes}) {
    await ensure();
    const target = paths(meta.audioId, meta.mimeType);
    await writeFileAtomic(target.audio, bytes);
    await writeFileAtomic(target.audioMeta, JSON.stringify({...meta, key}, null, 2), 0o600);
    await writeFileAtomic(indexPath(key), JSON.stringify(meta, null, 2), 0o600);
    return meta;
  }

  /** 按 audioId 取音频：sha 与 Content-Length 都在这里校验，篡改直接 400。 */
  async function readAudio(audioId) {
    if (!/^tts-[a-f0-9]{32}$/.test(String(audioId || ""))) {
      throw fail(400, "INVALID_AUDIO_ID", "音频标识不合法");
    }
    const meta = await readJson(audioMetaFile(audioId));
    if (!meta) throw fail(404, "AUDIO_NOT_FOUND", "缓存里没有这段音频，请重新申请合成");
    let bytes = null;
    for (const file of candidateAudioFiles(audioId, meta.mimeType)) {
      try {
        bytes = await fs.readFile(file);
        break;
      } catch {
        // 继续尝试下一个扩展名（.wav / .mp3 兼容）
      }
    }
    if (!bytes) throw fail(404, "AUDIO_NOT_FOUND", "缓存里没有这段音频，请重新申请合成");
    if (bytes.length !== Number(meta.bytes)) {
      throw fail(400, "AUDIO_LENGTH_MISMATCH", "音频长度与缓存记录不一致，已拒绝返回");
    }
    const actual = sha256Hex(bytes);
    if (actual !== meta.audioSha256) {
      throw fail(400, "AUDIO_SHA_MISMATCH", "音频内容校验失败，已拒绝返回");
    }
    return {meta, bytes, audioSha256: actual};
  }

  async function stats() {
    const count = async (name, suffix) => {
      try {
        return (await fs.readdir(dirOf(name))).filter((item) => item.endsWith(suffix)).length;
      } catch {
        return 0;
      }
    };
    let audioFiles = 0;
    try {
      audioFiles = (await fs.readdir(dirOf("audio")))
        .filter((item) => KNOWN_AUDIO_EXTS.some((ext) => item.endsWith(ext))).length;
    } catch {
      audioFiles = 0;
    }
    return {audioFiles, indexFiles: await count("index", ".json")};
  }

  function ledgerFile() {
    return path.join(cacheRoot(), "ledger.json");
  }

  function emptyLedger() {
    return {
      schema: CACHE_SCHEMA,
      currency: "CNY",
      limitCny: TTS_BUDGET_LIMIT_CNY,
      spentCny: 0,
      entries: [],
      updatedAt: null,
      note: "TTS 独立账本，与 ASR/DeepSeek 预算无关；limitCny=0 时任何计费请求都会被拒绝。",
    };
  }

  /** 只读快照：报价/列清单不创建任何文件。 */
  async function ledger() {
    const stored = await readJson(ledgerFile());
    if (!stored) return {...emptyLedger(), exists: false};
    return {...emptyLedger(), ...stored, limitCny: TTS_BUDGET_LIMIT_CNY, exists: true};
  }

  /** 首次真实合成时落一份 0 元账本骨架；之后只有计费成功才会改写（本轮不可达）。 */
  async function ensureLedger() {
    const stored = await readJson(ledgerFile());
    if (stored) return ledger();
    await ensure();
    const fresh = emptyLedger();
    await writeFileAtomic(ledgerFile(), JSON.stringify(fresh, null, 2), 0o600);
    return {...fresh, exists: true};
  }

  /** 只有计费调用成功才会走到这里；limitCny=0 时上层已 402，本轮不会被调用。 */
  async function recordBilling({providerId, chars, costCny, requestId}) {
    const current = await ledger();
    const updated = {
      ...emptyLedger(),
      spentCny: Number((Number(current.spentCny) + Number(costCny)).toFixed(6)),
      entries: [...(Array.isArray(current.entries) ? current.entries : []), {
        at: new Date().toISOString(), providerId, chars, costCny, requestId,
      }].slice(-200),
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(ledgerFile(), JSON.stringify(updated, null, 2), 0o600);
    return updated;
  }

  /** 缓存可整目录清理：只删本模块自己的四个子目录与账本，不碰任何学习记录。 */
  async function clear() {
    for (const name of ["audio", "index", "preset", "ledger"]) {
      await fs.rm(dirOf(name), {recursive: true, force: true});
    }
    await fs.rm(ledgerFile(), {force: true});
    return {cleared: true, rootIsUnderSocialMateData: cacheRoot().startsWith(REPO_ROOT)};
  }

  /* -------------------- 按 provider 的独立账本（aws-polly） -------------------- */

  function providerFile(providerId) {
    const id = String(providerId || "");
    if (!PROVIDER_ID_PATTERN.test(id)) throw fail(400, "INVALID_PROVIDER_ID", "providerId 不合法");
    return path.join(cacheRoot(), "ledger", `${id}.json`);
  }

  function providerLimit(providerId) {
    return Object.prototype.hasOwnProperty.call(PROVIDER_LEDGER_LIMITS, providerId)
      ? PROVIDER_LEDGER_LIMITS[providerId]
      : 0;
  }

  function emptyProviderLedger(providerId) {
    return {
      schema: CACHE_SCHEMA,
      providerId,
      currency: "CNY",
      limitCny: providerLimit(providerId),
      spentCny: 0,
      entries: [],
      updatedAt: null,
      note: "按 provider 独立账本，与 ASR/DeepSeek 预算及 TTS 公共账本无关；limitCny=0 时任何计费请求都会被拒绝。",
    };
  }

  /** 只读快照：列 provider / 报价都不创建任何文件。 */
  async function providerLedger(providerId) {
    const id = String(providerId || "");
    const stored = await readJson(providerFile(id));
    if (!stored) return {...emptyProviderLedger(id), exists: false};
    return {
      ...emptyProviderLedger(id),
      ...stored,
      limitCny: providerLimit(id),
      spentCny: Number(stored.spentCny) || 0,
      entries: Array.isArray(stored.entries) ? stored.entries : [],
      exists: true,
    };
  }

  /** 首次真实计费合成前落一份 0 元骨架；本轮 0 元上限下不会被调用。 */
  async function ensureProviderLedger(providerId) {
    const id = String(providerId || "");
    const file = providerFile(id);
    if (await readJson(file)) return providerLedger(id);
    await ensure();
    const fresh = emptyProviderLedger(id);
    await writeFileAtomic(file, JSON.stringify(fresh, null, 2), 0o600);
    return {...fresh, exists: true};
  }

  /**
   * 记账：上限 0（或会超限）时直接 402 且不写文件，保证「被拒绝的请求账本零变动」。
   */
  async function recordProviderBilling({providerId, chars, costCny, requestId}) {
    const id = String(providerId || "");
    const current = await providerLedger(id);
    const projected = Number((Number(current.spentCny) + Number(costCny)).toFixed(6));
    if (!(costCny > 0) || Number(current.limitCny) <= 0 || projected > Number(current.limitCny)) {
      throw fail(402, "TTS_BUDGET_ZERO", "该 provider 的独立预算为 0：任何计费请求都会被拒绝，账本不会变动", {
        providerId: id,
      });
    }
    const updated = {
      ...emptyProviderLedger(id),
      spentCny: projected,
      entries: [...current.entries, {
        at: new Date().toISOString(), providerId: id, chars, costCny, requestId,
      }].slice(-200),
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(providerFile(id), JSON.stringify(updated, null, 2), 0o600);
    return updated;
  }

  return {
    cacheRoot, ensure, presetDir, readEntry, writeEntry, readAudio, stats,
    ledger, ensureLedger, recordBilling, providerLedger, ensureProviderLedger,
    recordProviderBilling, clear,
  };
}
