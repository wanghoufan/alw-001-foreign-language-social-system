#!/usr/bin/env node
// ALW-001 N05 V1.3 · T2 定点校验：红城湖 19 段 phrasePairs 合同检查
// 仅用 Node 标准库，不联网、不改数据。
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const REC_PATH = path.join(ROOT, 'SocialMate-Data/PrivatePlaces/pv-hongcheng-lake-park/records/rec-20261103072022-16b79c.json');
const PAIRS_PATH = path.join(HERE, 'phrase-pairs-v1.json');
const CLEAN_PATH = path.join(HERE, 'CLEANUP-candidates.json');

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;
const ALLOWED_SOURCE = new Set(['parsed_from_original', 'derived_from_source_zh', 'ai_suggested', 'insufficient']);
const ALLOWED_REVIEW = new Set(['parsed', 'pending_user_confirm', 'needs_review']);
const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

const fails = [];
const warns = [];
const fail = (code, msg) => fails.push(`[${code}] ${msg}`);

function readJSON(p, label) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    fail('IO', `${label} 无法读取/解析：${p} · ${e.message}`);
    return null;
  }
}

const rec = readJSON(REC_PATH, 'record');
const doc = readJSON(PAIRS_PATH, 'phrase-pairs-v1.json');
if (!rec || !doc) {
  console.log('=== ALW-001 N05 V1.3 · T2 定点校验 ===');
  fails.forEach(f => console.log('· ' + f));
  console.log('');
  console.log('RESULT: FAIL');
  process.exit(1);
}

// ---------- 1. 顶层合同 ----------
if (doc.schema !== 'alw001.phrase-pairs.v1') fail('SCHEMA', `schema 应为 alw001.phrase-pairs.v1，实际 ${doc.schema}`);
if (doc.recordId !== rec.recordId) fail('RECORD', `recordId 不一致：${doc.recordId} vs ${rec.recordId}`);
if (Number(doc.revisionBasis) !== Number(rec.revision)) fail('REVISION', `revisionBasis=${doc.revisionBasis} 与记录 revision=${rec.revision} 不一致`);
if (doc.cloudCall !== 'none') fail('CLOUD', `cloudCall 必须为 none，实际 ${doc.cloudCall}`);
if (!doc.generatedAt || isNaN(Date.parse(doc.generatedAt))) fail('TIME', `generatedAt 非法：${doc.generatedAt}`);
if (!norm(doc.method)) fail('METHOD', 'method 为空');

// ---------- 2. blockId 覆盖与真实记录一致 ----------
const realIds = rec.blocks.map(b => b.blockId);
const gotIds = Object.keys(doc.blocks || {});
if (realIds.length !== 19) fail('RECORD', `真实记录 blockCount=${realIds.length}，预期 19`);
if (gotIds.length !== realIds.length) fail('COVERAGE', `blocks 键数 ${gotIds.length} ≠ 真实段数 ${realIds.length}`);
realIds.forEach((id, i) => {
  if (!Object.prototype.hasOwnProperty.call(doc.blocks, id)) fail('COVERAGE', `缺少段 ${id}（第 ${i + 1} 段）`);
});
gotIds.forEach(id => {
  if (!realIds.includes(id)) fail('COVERAGE', `出现真实记录中不存在的 blockId：${id}`);
});
if (JSON.stringify(gotIds) !== JSON.stringify(realIds)) warns.push(`blocks 键顺序与记录 index 顺序不同（不影响合同，仅提示）：${gotIds.join(',')}`);

// ---------- 3. 逐条 pair ----------
const ids = new Map();
let pairCount = 0, playableCount = 0, pendingCount = 0, needsReviewCount = 0, aiCount = 0;
const blockSummary = [];

for (const b of rec.blocks) {
  const list = doc.blocks[b.blockId];
  if (!Array.isArray(list)) { fail('TYPE', `${b.blockId} 不是数组`); continue; }
  const phrases = (b.phrases || []).map(norm);
  let pPlayable = 0, pPending = 0, pNeeds = 0;

  if (list.length === 0) warns.push(`${b.blockId} 无可用词组（允许，但请确认不是漏映射）`);
  if (list.length > phrases.length) fail('COUNT', `${b.blockId} pair 数 ${list.length} 超过原 phrases 数 ${phrases.length}（疑似凭空新增英文）`);

  list.forEach((p, i) => {
    pairCount++;
    const where = `${b.blockId}[${i}]`;
    for (const k of ['id', 'zh', 'en', 'source', 'evidence', 'reviewStatus', 'playable']) {
      if (!(k in p)) fail('FIELD', `${where} 缺少字段 ${k}`);
    }
    if (typeof p.id !== 'string' || !/^blk-hc-\d{1,2}-p\d{1,2}$/.test(p.id || '')) fail('ID', `${where} id 格式非法：${p.id}`);
    if (ids.has(p.id)) fail('ID', `id 重复：${p.id}（前一次在 ${ids.get(p.id)}）`);
    ids.set(p.id, where);
    if (!String(p.id).startsWith(b.blockId + '-p')) fail('ID', `${where} id 前缀与段号不符：${p.id}`);

    if (!ALLOWED_SOURCE.has(p.source)) fail('SOURCE', `${where} source 非法：${p.source}`);
    if (!ALLOWED_REVIEW.has(p.reviewStatus)) fail('REVIEW', `${where} reviewStatus 非法：${p.reviewStatus}`);
    if (!norm(p.evidence)) fail('EVIDENCE', `${where} evidence 为空（必须留中文/英文来源线索）`);
    if (typeof p.playable !== 'boolean') fail('PLAYABLE', `${where} playable 必须是布尔值`);

    const zh = String(p.zh == null ? '' : p.zh);
    const en = String(p.en == null ? '' : p.en);
    if (!CJK.test(zh)) fail('ZH', `${where} zh 不含中日韩字符：${JSON.stringify(zh)}`);
    if (CJK.test(en)) fail('EN', `${where} en 混入中日韩字符（中文占位文本混进英文）：${JSON.stringify(en)}`);
    if (!norm(en)) fail('EN', `${where} en 为空`);

    // 语言方向反向检查：整段是中文的长句不能塞进 en（已由 CJK 拦截），
    // 纯拼音/空壳 zh 也拦：zh 去掉括号注释后必须有汉字
    const zhCore = zh.replace(/[（(][^）)]*[）)]/g, '');
    if (CJK.test(zh) && !CJK.test(zhCore)) warns.push(`${where} zh 仅在括号注释里有汉字：${zh}`);

    // en 必须能在本段原 phrases 里找到（归一化空白后）；若为子串，剩余部分必须是「纯中文+标点」，
    // 即只允许「英文 中文」直接拆的形态，防止把 coconut water 截成 water 之类凭空造短串
    const nEn = norm(en);
    let hit = false;
    for (const ph of phrases) {
      if (ph === nEn) { hit = true; break; }
      const idx = ph.indexOf(nEn);
      if (idx >= 0) {
        const rest = ph.slice(0, idx) + ph.slice(idx + nEn.length);
        if (CJK.test(rest) && !/[A-Za-z]/.test(rest)) { hit = true; break; }
      }
    }
    if (!hit) fail('EN_SOURCE', `${where} en«${en}» 无法在本段 phrases 中匹配：${JSON.stringify(b.phrases)}`);

    // playable 逻辑一致性
    const eligible = !!norm(zh) && !!norm(en) && CJK.test(zh) && !CJK.test(en) && p.reviewStatus !== 'needs_review';
    if (p.playable) {
      if (!eligible) fail('PLAYABLE', `${where} playable=true 但 zh/en/语言/评审态不满足条件（reviewStatus=${p.reviewStatus}）`);
      if (p.source === 'ai_suggested') fail('PLAYABLE', `${where} ai_suggested 不得直接可播`);
      if (p.source === 'insufficient') fail('PLAYABLE', `${where} insufficient 不得直接可播`);
      if (p.reviewStatus === 'parsed' && p.source !== 'parsed_from_original') fail('PLAYABLE', `${where} reviewStatus=parsed 只能来自 parsed_from_original`);
    } else if (eligible && p.reviewStatus !== 'needs_review' && p.source !== 'ai_suggested') {
      fail('PLAYABLE', `${where} playable=false 但条件均满足（reviewStatus=${p.reviewStatus}, source=${p.source}）`);
    }
    if (p.reviewStatus === 'needs_review' && p.playable) fail('PLAYABLE', `${where} needs_review 却标记可播`);

    if (p.playable) { playableCount++; pPlayable++; }
    if (p.reviewStatus === 'pending_user_confirm') { pendingCount++; pPending++; }
    if (p.reviewStatus === 'needs_review') { needsReviewCount++; pNeeds++; }
    if (p.source === 'ai_suggested') aiCount++;
  });

  blockSummary.push({ block: b.blockId, pairs: list.length, playable: pPlayable, pending: pPending, needsReview: pNeeds });
}

// ---------- 4. CLEANUP 候选自洽 ----------
let cleanBlocks = [];
if (fs.existsSync(CLEAN_PATH)) {
  const cl = readJSON(CLEAN_PATH, 'CLEANUP-candidates.json');
  if (cl) {
    if (cl.recordId !== rec.recordId) fail('CLEAN_RECORD', `CLEANUP recordId 不一致：${cl.recordId}`);
    for (const [bid, v] of Object.entries(cl.blocks || {})) {
      cleanBlocks.push(bid);
      const b = rec.blocks.find(x => x.blockId === bid);
      if (!b) { fail('CLEAN_BLOCK', `CLEANUP 含不存在的 blockId：${bid}`); continue; }
      const joined = (b.cnSentences || []).join('');
      if (v.before !== joined) fail('CLEAN_BEFORE', `${bid} before 与现有 cnSentences 拼接不一致`);
      if (sha(v.before) !== v.sha256Before) fail('CLEAN_HASH', `${bid} sha256Before 不符（重算 ${sha(v.before)}）`);
      if (sha(v.after) !== v.sha256After) fail('CLEAN_HASH', `${bid} sha256After 不符（重算 ${sha(v.after)}）`);
      if (v.before === v.after) fail('CLEAN_NOOP', `${bid} before 与 after 相同（空改动应删除该候选）`);
      if (typeof v.hasUnfinished !== 'boolean') fail('CLEAN_FLAG', `${bid} hasUnfinished 必须是布尔值`);
      if (v.hasUnfinished && !/\[原话未完\]/.test(v.after)) fail('CLEAN_FLAG', `${bid} 标记 hasUnfinished 但 after 未含 [原话未完]`);
      if (!norm(v.reason)) fail('CLEAN_REASON', `${bid} reason 为空`);
    }
  }
} else {
  warns.push('未找到 CLEANUP-candidates.json（非必需失败项）');
}

function report() {
  const lines = [];
  lines.push('=== ALW-001 N05 V1.3 · T2 定点校验 ===');
  lines.push(`record: ${REC_PATH.replace(ROOT + '/', '')}`);
  lines.push(`pairs : ${PAIRS_PATH.replace(ROOT + '/', '')}`);
  lines.push('');
  if (blockSummary.length) {
    lines.push('段  pairs 可播 待确认 需复核');
    for (const s of blockSummary) {
      lines.push(`${s.block.padEnd(10)} ${String(s.pairs).padStart(3)} ${String(s.playable).padStart(4)} ${String(s.pending).padStart(6)} ${String(s.needsReview).padStart(6)}`);
    }
    lines.push('');
  }
  lines.push(`合计 pair=${pairCount} 可播=${playableCount} 待确认=${pendingCount} 需复核=${needsReviewCount} ai_suggested=${aiCount}`);
  lines.push(`CLEANUP 候选段：${cleanBlocks.length ? cleanBlocks.join(', ') : '（无）'}`);
  lines.push('');
  if (warns.length) { lines.push('-- 提示 --'); warns.forEach(w => lines.push('· ' + w)); lines.push(''); }
  if (fails.length) {
    lines.push(`-- 失败 ${fails.length} 项 --`);
    fails.forEach(f => lines.push('· ' + f));
    lines.push('');
    lines.push('RESULT: FAIL');
    console.log(lines.join('\n'));
    process.exitCode = 1;
  } else {
    lines.push('RESULT: PASS');
    console.log(lines.join('\n'));
    process.exitCode = 0;
  }
}
report();
