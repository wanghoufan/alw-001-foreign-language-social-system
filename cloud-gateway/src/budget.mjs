/**
 * 预算服务：跨实例原子「预留 → 提交 / 回滚」。
 *
 * 金额单位统一为「微元」（1 元 = 1_000_000 微元）：
 * - 不使用浮点数做扣减，避免 0.1+0.2 类误差；
 * - 预留时按「本次请求可能产生的最坏成本」估算，提交时按真实用量结算；
 * - 任何一步失败都回滚，账本不会因请求失败被扣钱；
 * - 硬闸在 store 里由 SQLite 事务保证，内存 Map 不参与。
 */
import {fail} from "./errors.mjs";

export const MICROS_PER_CNY = 1_000_000;

/** 保守默认价，部署前必须由用户对照厂商官方价格核对。 */
export const DEFAULT_PRICES = {
  deepseekInputCnyPerMillion: 2,
  deepseekOutputCnyPerMillion: 8,
  doubaoCnyPer1000Chars: 0.3,
  tencentAsrCnyPerHour: 1,
};

export const BUDGET_KEYS = Object.freeze({
  deepseek: "deepseek",
  ttsDoubao: "tts:doubao",
  asrTencent: "asr:tencent",
  asrP066: "asr:p066",
});

function parseCny(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cnyToMicros(cny) {
  return Math.round(Number(cny) * MICROS_PER_CNY);
}

export function microsToCny(micros) {
  return Number((Number(micros) / MICROS_PER_CNY).toFixed(6));
}

/** 粗估 token：中英文混排按 1 字符 ≈ 0.75 token，向上取整。 */
export function estimateTokens(chars) {
  return Math.max(1, Math.ceil(Number(chars || 0) * 0.75));
}

export function estimateDeepSeekMaxMicros({inputChars, maxOutputTokens, prices = DEFAULT_PRICES}) {
  const inputTokens = estimateTokens(inputChars);
  const inputCny = (inputTokens / 1_000_000) * prices.deepseekInputCnyPerMillion;
  const outputCny = (Number(maxOutputTokens) / 1_000_000) * prices.deepseekOutputCnyPerMillion;
  return Math.max(1, cnyToMicros(inputCny + outputCny));
}

export function deepSeekActualMicros(usage, prices = DEFAULT_PRICES) {
  const prompt = Number(usage?.prompt_tokens || 0);
  const completion = Number(usage?.completion_tokens || 0);
  if (prompt <= 0 && completion <= 0) return 0;
  const inputCny = (prompt / 1_000_000) * prices.deepseekInputCnyPerMillion;
  const outputCny = (completion / 1_000_000) * prices.deepseekOutputCnyPerMillion;
  return Math.max(0, Math.round((inputCny + outputCny) * MICROS_PER_CNY));
}

export function ttsCostMicros(chars, cnyPer1000Chars = DEFAULT_PRICES.doubaoCnyPer1000Chars) {
  return Math.max(0, Math.round((Number(chars) / 1000) * cnyPer1000Chars * MICROS_PER_CNY));
}

export function asrCostMicros(seconds, cnyPerHour = DEFAULT_PRICES.tencentAsrCnyPerHour) {
  return Math.max(0, Math.round((Number(seconds) / 3600) * cnyPerHour * MICROS_PER_CNY));
}

/**
 * @param {{store: object, env?: object, now?: () => number}} options
 */
export function createBudgetService({store, env = process.env, now = Date.now} = {}) {
  const prices = {
    deepseekInputCnyPerMillion: parseCny(env.DEEPSEEK_INPUT_PRICE_CNY_PER_MILLION, DEFAULT_PRICES.deepseekInputCnyPerMillion),
    deepseekOutputCnyPerMillion: parseCny(env.DEEPSEEK_OUTPUT_PRICE_CNY_PER_MILLION, DEFAULT_PRICES.deepseekOutputCnyPerMillion),
    doubaoCnyPer1000Chars: parseCny(env.DOUBAO_PRICE_CNY_PER_1000_CHARS, DEFAULT_PRICES.doubaoCnyPer1000Chars),
    tencentAsrCnyPerHour: parseCny(env.TENCENT_ASR_PRICE_CNY_PER_HOUR, DEFAULT_PRICES.tencentAsrCnyPerHour),
  };

  /** 预算上限只从环境变量读；未配置时默认 0（拒绝任何付费请求）。
   * P066 ASR 未单独配预算时回退到 CLOUD_ASR_BUDGET_CNY，避免同一种能力出现两套默认值。 */
  const asrBudgetCny = parseCny(env.CLOUD_ASR_BUDGET_CNY, 0);
  const limits = {
    [BUDGET_KEYS.deepseek]: cnyToMicros(parseCny(env.CLOUD_DEEPSEEK_BUDGET_CNY, 0)),
    [BUDGET_KEYS.ttsDoubao]: cnyToMicros(parseCny(env.CLOUD_TTS_BUDGET_CNY, 0)),
    [BUDGET_KEYS.asrTencent]: cnyToMicros(asrBudgetCny),
    [BUDGET_KEYS.asrP066]: cnyToMicros(parseCny(env.CLOUD_ASR_P066_BUDGET_CNY, asrBudgetCny)),
  };

  /**
   * 预留失败统一转 402；错误体带余额快照，便于手机端提示。
   */
  async function reserve({kind, micros, ref = ""}) {
    const budgetKey = String(kind || "");
    if (!Object.prototype.hasOwnProperty.call(limits, budgetKey)) {
      throw fail(400, "INVALID_BUDGET_KIND", `未知预算类别：${budgetKey}`);
    }
    const result = await store.reserve({budgetKey, micros, limitMicros: limits[budgetKey], ref});
    if (!result.ok) {
      throw fail(402, result.reason, result.reason === "BUDGET_ZERO"
        ? "该能力预算为 0：任何付费请求都会被拒绝"
        : "该能力预算余额不足：本次请求已被拒绝", {
        budget: await budgetView(budgetKey),
      });
    }
    return {budgetKey, reservationId: result.reservationId, budget: await budgetView(budgetKey)};
  }

  async function commit({reservationId, actualMicros}) {
    const result = await store.commit({reservationId, actualMicros});
    if (!result.ok) {
      throw fail(402, result.reason, "结算时预算不足，已回滚本次预留",
        result.budgetKey ? {budget: await budgetView(result.budgetKey)} : {});
    }
    return {ok: true, micros: actualMicros, cny: microsToCny(actualMicros)};
  }

  async function rollback({reservationId}) {
    return await store.rollback({reservationId});
  }

  async function budgetView(budgetKey) {
    const snapshot = await store.budgetSnapshot(budgetKey);
    const limitMicros = limits[budgetKey] ?? 0;
    return {
      key: budgetKey,
      currency: "CNY",
      limitCny: microsToCny(limitMicros),
      spentCny: microsToCny(snapshot?.spentMicros || 0),
      reservedCny: microsToCny(snapshot?.reservedMicros || 0),
      remainingCny: microsToCny(Math.max(0, limitMicros - (snapshot?.spentMicros || 0) - (snapshot?.reservedMicros || 0))),
    };
  }

  async function status() {
    const entries = await Promise.all(Object.keys(limits).map(async (key) => [key, await budgetView(key)]));
    return Object.fromEntries(entries);
  }

  return {
    keys: BUDGET_KEYS,
    limits,
    prices,
    reserve,
    commit,
    rollback,
    status,
    budgetView,
    estimateDeepSeekMaxMicros: (input) => estimateDeepSeekMaxMicros({...input, prices}),
    deepSeekActualMicros: (usage) => deepSeekActualMicros(usage, prices),
    ttsCostMicros: (chars) => ttsCostMicros(chars, prices.doubaoCnyPer1000Chars),
    asrCostMicros: (seconds) => asrCostMicros(seconds, prices.tencentAsrCnyPerHour),
  };
}