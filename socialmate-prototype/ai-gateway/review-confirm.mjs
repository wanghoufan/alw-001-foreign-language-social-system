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

import {appendPeopleFacts, listPeople, peopleRoot} from "./people-store.mjs";
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
 */
export async function confirmReview(input, session, options = {}) {
  const segments = Array.isArray(session?.segments) ? session.segments : [];
  const validSegmentIndexes = segments.map((_, index) => index);

  let knownPeople = options.knownPeople;
  if (!knownPeople) {
    knownPeople = {};
    for (const person of await listPeople()) knownPeople[person.slug] = {name: person.name};
  }

  const plan = await planProfileCandidates({...input, sessionId: session?.sessionId || input?.sessionId},
    {validSegmentIndexes, knownPeople});

  let peopleResult = {added: [], skipped: [], files: []};
  if (plan.peopleFacts.length) {
    peopleResult = await appendPeopleFacts(plan.peopleFacts);
  }

  let result;
  try {
    result = await commitProfilePlan(plan);
  } catch (error) {
    const restored = await restore(peopleResult.added);
    error.peopleRolledBack = restored;
    throw error;
  }

  return {
    ...result,
    people: {
      added: peopleResult.added.map(({slug, section, file}) => ({slug, section, file})),
      skipped: peopleResult.skipped,
    },
  };
}

export const REVIEW_CONFIRM_PATHS = {peopleRoot};
