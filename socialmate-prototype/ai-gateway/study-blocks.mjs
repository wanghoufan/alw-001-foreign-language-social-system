/**
 * N05 S3 分段引擎（study blocks）。
 *
 * 核心不变式（验收①–④的机器判据）：
 * 1. 句数守恒：所有 block 的 cnSentences 句数之和 === 原文句子总数，不丢句、不重复；
 * 2. 逐字可回查：block.sourceText === rawInput.slice(sourceSpan.start, sourceSpan.end)，
 *    且 cnSentences.join("") === sourceText；
 * 3. 全文可复原：把块间空隙按原序插回后必须逐字等于 rawInput（stats.reassembled）。
 *
 * 本模块不调用任何 AI：英文说法只接受客户端已确认的 enVariants，缺英文时明确
 * 标记 needsTranslation，绝不编造翻译。
 */
import crypto from "node:crypto";

const MAX_SENTENCES_PER_BLOCK = 4;
const MIN_SENTENCES_PER_BLOCK = 3;
const MAX_EN_VARIANTS = 2;
const MAX_BLOCK_CHARS = 600;
/* N05 V1.3 中英词组（phrasePairs）上限与状态白名单 */
const MAX_PHRASE_PAIRS = 40;
const PHRASE_ZH_MAX = 120;
const PHRASE_EN_MAX = 240;
const PHRASE_EVIDENCE_MAX = 200;
const PHRASE_STATUSES = new Set(["parsed", "pending_user_confirm", "needs_review"]);
const PHRASE_SOURCES = new Set(["parsed_from_original", "derived_from_source_zh", "ai_suggested", "insufficient"]);
const PARAGRAPH_GAP = /\n[ \t]*\n/;

function fail(status, code, message) {
  return Object.assign(new Error(message), {status, code});
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function isSentenceEnd(text, index, limit) {
  const ch = text[index];
  if (/[。！？]/.test(ch)) return true;
  if (/[.!?]/.test(ch)) {
    const next = index + 1 < limit ? text[index + 1] : undefined;
    return next === undefined || next === "\n" || /\s/.test(next) || /[”’"）)]/.test(next);
  }
  return false;
}

function trailingPunctuationLimit(text, index, limit) {
  let cursor = index;
  while (cursor < limit && /[”’"）)]/.test(text[cursor])) cursor += 1;
  return cursor;
}

/** 段落区间：只按空行切，段内不合并，避免把两段内容压进同一学习块。 */
export function splitParagraphRanges(rawInput) {
  const text = String(rawInput ?? "");
  const ranges = [];
  let start = 0;
  for (const match of text.matchAll(new RegExp(PARAGRAPH_GAP.source, "g"))) {
    ranges.push({start, end: match.index});
    start = match.index + match[0].length;
  }
  ranges.push({start, end: text.length});
  return ranges.filter((range) => range.end > range.start && text.slice(range.start, range.end).trim());
}

/** 段内切句：句间空白并入前一句，保证句子区间连续覆盖整段、join 可逐字复原。 */
export function splitSentencesInRange(rawInput, from, to) {
  const text = String(rawInput ?? "");
  const units = [];
  let index = from;
  while (index < to) {
    while (index < to && /\s/.test(text[index])) index += 1;
    if (index >= to) break;
    const start = index;
    while (index < to) {
      if (text[index] === "\n") {
        index += 1;
        break;
      }
      if (isSentenceEnd(text, index, to)) {
        index = trailingPunctuationLimit(text, index + 1, to);
        break;
      }
      index += 1;
    }
    units.push({start, end: Math.min(index, to)});
  }
  for (let i = 0; i < units.length - 1; i += 1) units[i].end = units[i + 1].start;
  return units;
}

function blockIdFor(order, sourceText) {
  return `blk-${order + 1}-${sha256(sourceText).slice(0, 8)}`;
}

function normalizeVariantList(value, max) {
  if (value === undefined || value === null) return null;
  const list = Array.isArray(value) ? value : [value];
  if (list.length > max) throw fail(400, "TOO_MANY_EN_VARIANTS", `每块最多 ${max} 种英文说法`);
  return list
    .map((item) => String(item ?? "").replace(/[\u0000-\u001f]/g, " ").trim())
    .filter(Boolean)
    .slice(0, max);
}

function variantsFor(enVariants, order, blockId) {
  if (!enVariants) return null;
  if (Array.isArray(enVariants)) {
    const byOrder = enVariants[order];
    if (byOrder !== undefined) return normalizeVariantList(byOrder, MAX_EN_VARIANTS);
    const byBlock = enVariants.find?.((entry) => entry && entry.blockId === blockId);
    if (byBlock) return normalizeVariantList(byBlock.enVariants ?? byBlock.variants, MAX_EN_VARIANTS);
    return null;
  }
  if (typeof enVariants === "object") {
    if (enVariants[order] !== undefined) return normalizeVariantList(enVariants[order], MAX_EN_VARIANTS);
    if (enVariants[blockId] !== undefined) return normalizeVariantList(enVariants[blockId], MAX_EN_VARIANTS);
  }
  return null;
}

/**
 * 按 3–5 句/块（默认 4 句）分段。段落边界不跨越；段落尾部不足 3 句时独立成块，
 * 不为了凑数把下一段句子搬过来（那会造成跨段错配）。
 */
export function segmentRawInput(rawInput, options = {}) {
  const text = String(rawInput ?? "");
  if (!text.trim()) throw fail(400, "EMPTY_RAW_INPUT", "请先粘贴或口述内容");
  if (text.length > 20000) throw fail(413, "RAW_INPUT_TOO_LARGE", "单条记录原文超过 20000 字符上限");

  const maxSentences = Math.min(
    6,
    Math.min(8, Math.max(1, Number(options.maxSentencesPerBlock) || MAX_SENTENCES_PER_BLOCK)),
  );
  const enVariants = options.enVariants || null;
  const originalEnVariants = options.originalEnVariants || null;
  const blocks = [];
  let sentenceCount = 0;

  for (const range of splitParagraphRanges(text)) {
    const units = splitSentencesInRange(text, range.start, range.end);
    sentenceCount += units.length;
    for (let i = 0; i < units.length; i += maxSentences) {
      const group = units.slice(i, i + maxSentences);
      const span = {start: group[0].start, end: group[group.length - 1].end};
      const sourceText = text.slice(span.start, span.end);
      const cnSentences = group.map((unit) => text.slice(unit.start, unit.end));
      if (cnSentences.join("") !== sourceText) {
        throw fail(500, "SEGMENT_SELF_CHECK_FAILED", "分段自检失败：句子切片无法逐字覆盖原文");
      }
      if (sourceText.length > MAX_BLOCK_CHARS * 4) {
        throw fail(413, "BLOCK_TOO_LARGE", "单个学习段过长，请先自行拆分段落");
      }
      const order = blocks.length;
      const blockId = blockIdFor(order, sourceText);
      const provided = variantsFor(enVariants, order, blockId);
      const original = variantsFor(originalEnVariants, order, blockId);
      const en = provided || [];
      const originalChanged = Boolean(
        original && en.length && original.join("\u0000") !== en.join("\u0000"),
      );
      blocks.push({
        blockId,
        order,
        sourceSpan: span,
        sourceText,
        cnSentences,
        enVariants: en,
        phrases: [],
        reviews: [],
        contentRevision: 1,
        needsTranslation: en.length === 0,
        originalChanged,
      });
    }
  }

  const stats = blockStats(text, blocks);
  if (!stats.reassembled) {
    throw fail(500, "SEGMENT_LOSS_DETECTED", "分段自检失败：复原原文不一致，已拒绝写入");
  }
  if (stats.lostSentences || stats.duplicatedSentences) {
    throw fail(500, "SEGMENT_LOSS_DETECTED", "分段自检失败：句数不守恒，已拒绝写入");
  }
  const warnings = [];
  if (blocks.some((block) => block.originalChanged)) warnings.push("ORIGINAL_EN_CHANGED");
  if (blocks.some((block) => block.needsTranslation)) warnings.push("EN_VARIANT_MISSING");
  return {blocks, stats, warnings};
}

/** 句数守恒 + 逐字复原的统一判据，写入前后都跑一次。 */
export function blockStats(rawInput, blocks) {
  const text = String(rawInput ?? "");
  const list = Array.isArray(blocks) ? blocks : [];
  let cursor = 0;
  let reassembled = "";
  let sentenceCount = 0;
  const seen = new Set();
  let duplicatedSentences = 0;
  for (const block of list) {
    const span = block?.sourceSpan || {};
    const start = Number(span.start);
    const end = Number(span.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < cursor || end <= start || end > text.length) {
      reassembled = null;
      break;
    }
    reassembled += text.slice(cursor, start) + String(block.sourceText ?? "");
    cursor = end;
    const sentences = Array.isArray(block.cnSentences) ? block.cnSentences : [];
    sentenceCount += sentences.length;
    for (const sentence of sentences) {
      if (seen.has(sentence)) duplicatedSentences += 1;
      seen.add(sentence);
    }
  }
  if (reassembled !== null) reassembled += text.slice(cursor);
  const expectedSentences = splitParagraphRanges(text)
    .reduce((total, range) => total + splitSentencesInRange(text, range.start, range.end).length, 0);
  return {
    sentenceCount,
    expectedSentences,
    lostSentences: Math.max(0, expectedSentences - sentenceCount),
    duplicatedSentences,
    blockCount: list.length,
    reassembled: reassembled === text,
  };
}

/** 客户端可自带 blocks（人工调整分段），但必须通过同一套判据才允许写盘。 */
const HAN = /[\u3400-\u9fff]/;

/**
 * N05 V1.3：常用表达的结构化升级（向后兼容）。
 * 原 `phrases: string[]` 只读保留；新增 `phrasePairs` 承载 {id,zh,en,source,reviewStatus}。
 * 这里只做「不破坏数据」的规范化：字段白名单、长度上限、去重、状态收敛；
 * 判定 playable 由前端与审计报告负责，服务端不替用户确认翻译。
 */
export function normalizePhrasePairs(list, blockId) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list.slice(0, MAX_PHRASE_PAIRS)) {
    if (!raw || typeof raw !== "object") continue;
    const zh = String(raw.zh ?? "").trim().slice(0, PHRASE_ZH_MAX);
    const en = String(raw.en ?? "").trim().slice(0, PHRASE_EN_MAX);
    if (!zh || !en) continue;
    const status = PHRASE_STATUSES.has(raw.reviewStatus) ? raw.reviewStatus : "needs_review";
    const source = PHRASE_SOURCES.has(raw.source) ? raw.source : "insufficient";
    let id = String(raw.id ?? "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) id = `${blockId || "blk"}-p${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = {id, zh, en, source, reviewStatus: status};
    const evidence = String(raw.evidence ?? "").trim();
    if (evidence) entry.evidence = evidence.slice(0, PHRASE_EVIDENCE_MAX);
    /* 中文缺汉字或英文里混进汉字 = 语言错位，绝不当作可播配对 */
    entry.playable = raw.playable !== false && HAN.test(zh) && !HAN.test(en) && status !== "needs_review";
    out.push(entry);
  }
  return out;
}

export function validateProvidedBlocks(rawInput, blocks) {
  if (!Array.isArray(blocks) || !blocks.length) {
    throw fail(400, "INVALID_BLOCKS", "blocks 必须是非空数组");
  }
  if (blocks.length > 200) throw fail(413, "TOO_MANY_BLOCKS", "学习段数量超过上限");
  const orders = new Set();
  const ids = new Set();
  for (const block of blocks) {
    const blockId = String(block?.blockId || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(blockId)) {
      throw fail(400, "INVALID_BLOCK_ID", "blockId 不合法");
    }
    if (ids.has(blockId)) throw fail(400, "DUPLICATE_BLOCK_ID", "blockId 重复");
    ids.add(blockId);
    const order = Number(block.order);
    if (!Number.isInteger(order) || order < 0) throw fail(400, "INVALID_BLOCK_ORDER", "block.order 不合法");
    if (orders.has(order)) throw fail(400, "DUPLICATE_BLOCK_ORDER", "block.order 重复");
    orders.add(order);
  }
  const sorted = [...blocks].sort((a, b) => Number(a.order) - Number(b.order));
  for (const block of sorted) {
    const span = block.sourceSpan || {};
    const sourceText = String(block.sourceText ?? "");
    if (String(rawInput).slice(Number(span.start), Number(span.end)) !== sourceText) {
      throw fail(400, "SOURCE_SPAN_MISMATCH", "sourceSpan 与实际原文不一致，已拒绝写入");
    }
    const cnSentences = Array.isArray(block.cnSentences) ? block.cnSentences.map(String) : [];
    if (!cnSentences.length || cnSentences.join("") !== sourceText) {
      throw fail(400, "SENTENCE_SPAN_MISMATCH", "cnSentences 与 sourceText 不一致，已拒绝写入");
    }
    const en = normalizeVariantList(block.enVariants, MAX_EN_VARIANTS) || [];
    block.enVariants = en;
    block.cnSentences = cnSentences;
    /* phrasePairs 可选：给了就规范化，非法内容不写入但也不让整次保存失败（向后兼容）。 */
    if (block.phrasePairs !== undefined) {
      const pairs = normalizePhrasePairs(block.phrasePairs, String(block.blockId || ""));
      if (pairs.length) block.phrasePairs = pairs;
      else delete block.phrasePairs;
    }
  }
  const stats = blockStats(rawInput, sorted);
  if (!stats.reassembled || stats.lostSentences || stats.duplicatedSentences) {
    throw fail(400, "SEGMENT_LOSS_DETECTED", "分段不满足句数守恒或逐字复原，已拒绝写入");
  }
  return {blocks: sorted, stats};
}

export const BLOCK_LIMITS = {
  maxPhrasePairs: MAX_PHRASE_PAIRS,
  maxSentencesPerBlock: MAX_SENTENCES_PER_BLOCK,
  minSentencesPerBlock: MIN_SENTENCES_PER_BLOCK,
  maxEnVariants: MAX_EN_VARIANTS,
  maxBlocks: 200,
};