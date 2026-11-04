/**
 * N05 V1.2 T4 AI 语义分段（DeepSeek）。
 *
 * 设计原则：**AI 只决定「哪些句子属于同一段」，不复制原文、不改字**。
 * - 服务端先用规则把原文切成句子（带偏移），把句子数组交给模型；
 * - 模型只返回句号分组（如 [[0,1,2],[3,4]]）；
 * - 服务端据此生成 blocks，span 与文本都从原串切出，天然零丢失、零重复；
 * - 任何异常（无 Key / 未授权 / 预算不足 / 超时 / 返回不合规）都抛错，由调用方降级到规则分段。
 */
const SEGMENT_SYSTEM = [
  "你是语言学习材料的分段助手。输入是一组按顺序排列的句子（可能有中文和英文混排）。",
  "任务：把句子按语义主题和练习长度分组，只输出 JSON：{\"groups\": [[起始下标, 结束下标], ...]}。",
  "规则：",
  "1) 每个下标必须出现且只出现一次，组之间按顺序、连续、不重叠；",
  "2) 每组建议 1–4 句；中文与它对应的英文应尽量落在同一组；",
  "3) 不要输出任何解释、不要改写句子、不要遗漏或重复下标。",
].join("\n");

function fail(status, code, message, extra) {
  return Object.assign(new Error(message), {status, code}, extra || {});
}

/** 校验并归一化模型返回的分组：必须覆盖 0..n-1 且连续升序。 */
export function normalizeGroups(raw, sentenceCount) {
  const groups = Array.isArray(raw) ? raw : [];
  const flat = [];
  for (const group of groups) {
    if (!group) continue;
    // 兼容 [1,2] / "1,2" / {start,end} / {from,to} 四种常见写法
    let nums = [];
    if (Array.isArray(group)) {
      nums = group.map((v) => Number(v));
    } else if (typeof group === "string") {
      nums = group.split(/[^0-9]+/).filter(Boolean).map((v) => Number(v));
    } else if (typeof group === "object") {
      const a = Number(group.start ?? group.from ?? group.first);
      const b = Number(group.end ?? group.to ?? group.last);
      if (Number.isInteger(a) && Number.isInteger(b)) {
        const step = a <= b ? 1 : -1;
        for (let i = a; step > 0 ? i <= b : i >= b; i += step) nums.push(i);
      }
    }
    nums = nums.filter((n) => Number.isInteger(n));
    if (!nums.length) continue;
    flat.push(nums.sort((x, y) => x - y));
  }
  if (!flat.length) return null;
  const all = flat.flat().sort((x, y) => x - y);
  const expected = Array.from({length: sentenceCount}, (_, i) => i);
  const isPermutation = (list) => list.length === expected.length && list.every((v, i) => v === expected[i]);
  if (isPermutation(all)) return flat;
  // 模型偶尔用 1 起始下标：整体减一后再验一次
  const shifted = all.map((v) => v - 1);
  if (shifted[0] === 0 && isPermutation(shifted)) return flat.map((g) => g.map((v) => v - 1));
  // 模型偶尔把「组」写成 [起始, 结束] 的区间：按区间展开后再验一次
  const expandRange = (g) => {
    if (g.length === 2 && g[0] < g[1]) {
      return Array.from({length: g[1] - g[0] + 1}, (_, i) => g[0] + i);
    }
    return g;
  };
  const ranged = flat.map(expandRange);
  const rangedAll = ranged.flat().sort((x, y) => x - y);
  if (isPermutation(rangedAll)) return ranged;
  const rangedShifted = rangedAll.map((v) => v - 1);
  if (rangedShifted[0] === 0 && isPermutation(rangedShifted)) {
    return ranged.map((g) => g.map((v) => v - 1));
  }
  return null;
}

export async function callDeepSeekSegment({
  sentences,
  env = process.env,
  fetchImpl = fetch,
  timeoutMs = 20000,
  model = "deepseek-flash",
} = {}) {
  const secret = String(env.DEEPSEEK_API_KEY || "").trim();
  if (!secret) {
    throw fail(503, "AI_UNAVAILABLE", "Mac 服务端尚未配置 DEEPSEEK_API_KEY", {reason: "PROVIDER_NOT_CONFIGURED"});
  }
  const list = Array.isArray(sentences) ? sentences : [];
  if (!list.length) throw fail(400, "EMPTY_TEXT", "没有可分段的内容");

  const inputChars = list.reduce((sum, s) => sum + String(s).length, 0) + 200;
  const maxCost = (Math.ceil(inputChars / 2) * 2 + 800 * 8) / 1_000_000;
  if (maxCost > 0.05) throw fail(400, "INPUT_EXCEEDS_COST_CAP", "本次分段预估成本超过单次 0.05 元上限");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {"Content-Type": "application/json", Authorization: `Bearer ${secret}`},
      body: JSON.stringify({
        model,
        messages: [
          {role: "system", content: SEGMENT_SYSTEM},
          {role: "user", content: JSON.stringify({sentences: list})},
        ],
        response_format: {type: "json_object"},
        max_tokens: 1200,
        stream: false,
        thinking: {type: "disabled"},
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw fail(502, "AI_HTTP_ERROR", `DeepSeek 返回 HTTP ${response.status}`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    let parsed = null;
    try {
      parsed = JSON.parse(String(content || ""));
    } catch {
      throw fail(502, "AI_BAD_JSON", "DeepSeek 返回的不是合法 JSON");
    }
    const normalized = normalizeGroups(parsed?.groups, list.length);
    if (!normalized) {
      console.error("[ai-segment] groups=" + JSON.stringify(parsed?.groups).slice(0, 400)
        + " sentences=" + list.length);
      throw fail(502, "AI_BAD_GROUPS", "DeepSeek 返回的分组没有覆盖全部句子");
    }
    return {
      groups: normalized,
      model,
      usage: payload?.usage || null,
      inputChars,
      estimatedCostCny: Number(maxCost.toFixed(6)),
    };
  } finally {
    clearTimeout(timer);
  }
}