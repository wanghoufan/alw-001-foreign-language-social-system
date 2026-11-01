/**
 * 复盘确认写入的事务编排（Profile ⇄ People 两处必须一致）。
 *
 * 顺序与补偿：
 * 1. plan：只计算，不落盘；段号必须命中归档会话真实段号，人物必须命中真实人物主档 slug。
 * 2. 先写 People/<slug>/00-profile.md（逐文件原子替换 + 写前备份 + 写后自检）。
 * 3. 再写 SocialMate-Data/Profile（原子替换）。
 * 4. 若第 3 步失败，用第 2 步的备份把人物主档恢复原样，并回滚 Profile（Profile 本身是原子的，失败即未变）。
 *    绝不出现“界面说已保存、实际只写了一半”的状态。
 */
import fs from "node:fs/promises";
import path from "node:path";

import {appendPeopleFacts, createPersonFile, listPeople, peopleRoot, removeEmptyPersonFile} from "./people-store.mjs";
import {commitProfilePlan, planProfileCandidates} from "./profile-store.mjs";

async function restore(files) {
  const restored = [];
  for (const item of files) {
    try {
      const backup = path.resolve(peopleRoot(), item.backup);
      const target = path.resolve(peopleRoot(), item.file);
      await fs.copyFile(backup, target);
      await fs.chmod(target, 0o600).catch(() => {});
      restored.push(item.file);
    } catch {}
  }
  return restored;
}

/**
 * @param {object} input        { confirm, sessionId, items }
 * @param {object} session      已由归档服务校验过的会话原文（含 segments）
 * @param {object} [options]    {knownPeople} 覆盖默认的人物索引（测试用）
 *
 * 新建人物（用户在页面显式点「新建人物」并填姓名/标识）：
 * - 先按模板校验，只在该人物**确实分到了事实**时才真正建目录，避免留下空档案；
 * - 建完再追加事实；后续任一步失败，清掉本轮新建且仍为空的主档。
 */
export async function confirmReview(input, session, options = {}) {
  const segments = Array.isArray(session?.segments) ? session.segments : [];
  const validSegmentIndexes = segments.map((_, index) => index);
  const items = Array.isArray(input?.items) ? input.items : [];

  let knownPeople = options.knownPeople;
  if (!knownPeople) {
    knownPeople = {};
    for (const person of await listPeople()) knownPeople[person.slug] = {name: person.name};
  }

  // 收集「新建人物」请求：只放行显式 createPerson:true 且有姓名/合法标识的条目。
  const pendingCreate = new Map();
  for (const item of items) {
    if (item?.kind !== "person" || item?.createPerson !== true) continue;
    const slug = String(item?.peopleSlug || "").trim();
    const name = String(item?.personName || item?.name || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(slug) || !name) continue;
    if (!knownPeople[slug]) pendingCreate.set(slug, name);
  }
  for (const [slug, name] of pendingCreate) knownPeople[slug] = {name, pendingCreate: true};

  const plan = await planProfileCandidates({...input, sessionId: session?.sessionId || input?.sessionId},
    {validSegmentIndexes, knownPeople});

  const created = [];
  let peopleResult = {added: [], skipped: [], files: []};
  try {
    // 只为真正产生了事实的新人物建主档，避免“点了新建但什么都没写”留下空目录。
    const needed = new Set(plan.peopleFacts.map((fact) => fact.slug));
    for (const [slug, name] of pendingCreate) {
      if (!needed.has(slug)) continue;
      const result = await createPersonFile({slug, name});
      if (result.created) created.push(result.slug);
    }
    if (plan.peopleFacts.length) peopleResult = await appendPeopleFacts(plan.peopleFacts);
  } catch (error) {
    for (const slug of created) await removeEmptyPersonFile(slug).catch(() => {});
    throw error;
  }

  let result;
  try {
    result = await commitProfilePlan(plan);
  } catch (error) {
    const restored = await restore(peopleResult.added);
    const removed = [];
    for (const slug of created) {
      const outcome = await removeEmptyPersonFile(slug).catch(() => null);
      if (outcome?.removed) removed.push(slug);
    }
    error.peopleRolledBack = restored;
    error.peopleCreatedRemoved = removed;
    throw error;
  }

  return {
    ...result,
    people: {
      added: peopleResult.added.map(({slug, section, file}) => ({slug, section, file})),
      created,
      skipped: peopleResult.skipped,
    },
  };
}

export const REVIEW_CONFIRM_PATHS = {peopleRoot};
