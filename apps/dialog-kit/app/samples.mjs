/**
 * 教学样本加工层。
 *
 * 原始样本不在当前仓库时可使用这里的确定性夹具；
 * 每条样本都包含：场景、目标、七阶段讲解、标准答案、参考回答、表达风格、易错表达。
 */

import {STAGES, STAGE_LABELS} from './models.mjs';

export const AGENTS = Object.freeze([
  {
    id: 'mia',
    name: '陈美玲',
    role: '对话对象',
    persona: '新加坡华人，跨境电商东南亚市场运营，习惯先看数据再聊感受。',
    style: '中文夹英文，先给具体数字，再问对方感受。',
    goals: ['确认周末安排', '把成本问题讲清楚'],
    constraints: ['不替学员回答', '不编造未确认的事实'],
  },
  {
    id: 'maria',
    name: '玛丽亚',
    role: '对话对象',
    persona: '项目经理，说话直接，遇到模糊表述会追问。',
    style: '短句、具体、偏好用数字确认。',
    goals: ['确认项目范围', '追问预算与责任边界'],
    constraints: ['不猜测未给出的数字', '不替学员做决定'],
  },
  {
    id: 'daniel',
    name: '丹尼尔',
    role: '对话对象',
    persona: '第一次来海口的外国朋友，对老建筑和本地生活感兴趣。',
    style: '英语为主，中文单词为辅；问题简短。',
    goals: ['确认称呼', '了解海口的去处'],
    constraints: ['不假装熟悉本地', '不连续追问私人信息'],
  },
  {
    id: 'tutor',
    name: '教练',
    role: '教学引导',
    persona: '负责把学员的中文表达拆成可练习的步骤。',
    style: '先示范，再让学员复述；不代替学员开口。',
    goals: ['指出易错表达', '给出可复述的标准答案'],
    constraints: ['一次只给一个重点', '不输出跨语言混合提示'],
  },
  {
    id: 'system',
    name: '系统',
    role: '记忆与提示',
    persona: '只引用已确认事实，负责把建议写入或拒绝。',
    style: '陈述事实与置信度，不添加推测。',
    goals: ['保持记忆可追溯', '低置信度时提醒确认'],
    constraints: ['不写入未确认建议', '不覆盖历史记录'],
  },
]);

/** 学员不是代理，但需要一个参与者身份。 */
export const LEARNER = Object.freeze({id: 'me', name: '我', role: '学员'});

export const ENTITY_CATALOG = Object.freeze([
  {type: 'person', key: 'mia', label: '陈美玲', aliases: ['陈美玲', '美玲', 'Mia', 'Mia Chen']},
  {type: 'person', key: 'maria', label: '玛丽亚', aliases: ['玛丽亚', 'Maria']},
  {type: 'person', key: 'daniel', label: '丹尼尔', aliases: ['丹尼尔', 'Daniel']},
  {type: 'project', key: 'cross_border', label: '跨境电商', aliases: ['跨境电商', '跨境']},
  {type: 'project', key: 'shopee', label: 'Shopee 店铺', aliases: ['Shopee', '虾皮']},
  {type: 'project', key: 'tiktok_shop', label: 'TikTok Shop', aliases: ['TikTok Shop', 'TikTok']},
  {type: 'project', key: 'cost_management', label: '成本管理', aliases: ['成本管理', '成本']},
  {type: 'project', key: 'sku_cost', label: 'SKU 成本结构', aliases: ['SKU', '成本结构']},
  {type: 'project', key: 'campaign', label: '营销活动', aliases: ['campaign', '活动']},
  {type: 'place', key: 'hongcheng_park', label: '红城湖公园', aliases: ['红城湖公园', '红城湖']},
  {type: 'place', key: 'qilou_street', label: '骑楼老街', aliases: ['骑楼老街', '骑楼']},
  {type: 'place', key: 'haidian_island', label: '海甸岛', aliases: ['海甸岛', '海甸']},
  {type: 'place', key: 'guoxing_avenue', label: '国兴大道', aliases: ['国兴大道', '国兴']},
  {type: 'place', key: 'century_park', label: '世纪公园', aliases: ['世纪公园']},
  {type: 'place', key: 'haikou_bay', label: '海口湾', aliases: ['海口湾']},
  {type: 'place', key: 'longxing_road', label: '龙兴路', aliases: ['龙兴路']},
  {type: 'time', key: 'saturday', label: '周六', aliases: ['周六', '星期六', '这周六']},
  {type: 'time', key: 'saturday_3pm', label: '周六下午三点', aliases: ['周六下午三点', '周六下午3点', '星期六下午三点']},
  {type: 'time', key: 'next_month', label: '下个月', aliases: ['下个月', '下月']},
  {type: 'time', key: 'december', label: '十二月', aliases: ['十二月', '12月']},
  {type: 'time', key: 'one_week_leave', label: '一周年假', aliases: ['一周年假', '请一周']},
  {type: 'need', key: 'budget_200', label: '预算两百以内', aliases: ['预算两百', '预算两百以内', '两百以内', '200元']},
  {type: 'need', key: 'no_ticket', label: '不用门票', aliases: ['不用门票', '不要门票', '免费']},
  {type: 'need', key: 'three_numbers', label: '时间、地点、预算三个数字', aliases: ['时间、地点、预算', '三个具体数字', '三个数字']},
  {type: 'need', key: 'stabilizer', label: '手机稳定器', aliases: ['稳定器', '手机稳定器']},
  {type: 'need', key: 'boat_share', label: '拼船', aliases: ['拼船', '一起拼船']},
]);

const STAGE_GUIDE_COMMON = {
  greet: '先回应对方，再自然带出称呼与来意；不要一上来就抛长问题。',
  topic: '把话题收窄到一个可执行的小目标：周末安排、项目成本或一次练习。',
  clarify: '遇到“那个”“大概”“左右”这类模糊词，先追问具体时间、地点或数字。',
  roleplay: '按真实对话推进：一句回应加一个具体问题，控制在一到两句。',
  feedback: '指出一个最影响理解的表达问题，再给一条可复述的改法。',
  consolidate: '把刚确认的事实复述一遍，确认人物、地点、时间、预算没有错位。',
  finish: '用一句话收束本轮，明确下一步行动与确认方式。',
};

function sample({id, title, scenario, goal, route, standardAnswer, referenceAnswer, style, commonMistakes, memorySeeds = [], script = []}) {
  return {
    id,
    title,
    scenario,
    goal,
    route,
    standardAnswer,
    referenceAnswer,
    style,
    commonMistakes,
    stageGuide: STAGES.map((stage) => ({stage, label: STAGE_LABELS[stage], text: STAGE_GUIDE_COMMON[stage]})),
    memorySeeds,
    script,
  };
}

export const SAMPLES = Object.freeze([
  sample({
    id: 'mia-hongcheng-weekend',
    title: '陈美玲 · 红城湖周末计划',
    scenario: '周六下午约陈美玲去红城湖公园散步、拍短视频。',
    goal: '用中文确认时间、地点、预算，并回应她对搬家成本的顾虑。',
    route: 'zh',
    standardAnswer: '这周六下午三点，红城湖公园东门，预算两百以内，你看这样安排可以吗？',
    referenceAnswer: '我想约你这周六下午三点在红城湖公园东门见面，预算控制在两百元以内，主要就是散步和拍点视频素材；如果你觉得不合适，我们再调。',
    style: '先给数字，再问感受；中文为主，保留必要的英文术语。',
    commonMistakes: [
      '把“预算两百以内”说成“两百左右”，上限不清楚。',
      '只说“周六”，没有说具体几点。',
      '把地点说成“那个公园”，对方无法确认。',
    ],
    script: [
      ['me', 'mia', '美玲，好久不见。你最近还在那家跨境电商公司做东南亚市场运营吗？'],
      ['mia', 'me', '对，还是做 Shopee 和 TikTok Shop 的店铺运营。最近这个 campaign 的 ROI 也要再看一下，成本压力挺大的。'],
      ['me', 'mia', '那周末出来走走吧。这周六下午三点，红城湖公园东门，预算两百以内，你看可以吗？'],
      ['mia', 'me', '可以，两百以内没问题，最好不用门票。我最近还在算搬家的成本，海甸岛那边一室一厅大概三千二。'],
      ['me', 'mia', '那我们先不聊工作，就散步拍照。我提前把时间、地点、预算发你确认。'],
      ['mia', 'me', '好，重要的事配一句英文，我看得快一点。'],
    ],
  }),
  sample({
    id: 'maria-cost-clarify',
    title: '玛丽亚 · 项目成本澄清',
    scenario: '向玛丽亚说明跨境电商项目的成本结构，并确认预算边界。',
    goal: '把物流、包装、平台佣金拆开说清楚，避免对方反复追问。',
    route: 'zh',
    standardAnswer: '目前物流成本约占 18%，包装约占 6%，平台佣金约 12%；这三项加起来是 36%，剩下的部分我再按 SKU 拆给你看。',
    referenceAnswer: '这个项目的成本可以拆成三块：物流大概 18%，包装 6%，平台佣金 12%，合计 36%。我建议先把这三项确认，再讨论剩下的运营成本。',
    style: '先给结论，再给数字；每个数字都说明口径。',
    commonMistakes: [
      '只说“成本挺高的”，没有给占比。',
      '把平台佣金和物流成本混在一起说。',
      '没有说明百分比的分母是什么。',
    ],
    memorySeeds: [
      {
        id: 'seed-maria-1',
        title: '物流成本口径',
        content: '物流成本约占 18%，口径是含头程与尾程。',
        explanation: '先固定口径，后续数字才不会各说各话。',
        confidence: 0.86,
        entities: [
          {type: 'person', key: 'maria', label: '玛丽亚', confidence: 0.9},
          {type: 'project', key: 'cross_border', label: '跨境电商', confidence: 0.88},
        ],
        relations: [
          {from: 'maria', to: 'cross_border', type: 'works_on', confidence: 0.84},
        ],
        stage: 'clarify',
      },
      {
        id: 'seed-maria-2',
        title: '包装成本口径',
        content: '包装成本约占 6%，不含定制礼盒。',
        explanation: '把例外项单独列出，避免把定制费用摊进常规成本。',
        confidence: 0.83,
        entities: [
          {type: 'project', key: 'cost_management', label: '成本管理', confidence: 0.85},
          {type: 'need', key: 'three_numbers', label: '时间、地点、预算三个数字', confidence: 0.62},
        ],
        relations: [
          {from: 'cost_management', to: 'three_numbers', type: 'needs', confidence: 0.64},
        ],
        stage: 'clarify',
      },
      {
        id: 'seed-maria-3',
        title: '平台佣金口径',
        content: '平台佣金约 12%，按成交额计算。',
        explanation: '明确分母，避免把佣金率误当成利润率。',
        confidence: 0.81,
        entities: [
          {type: 'project', key: 'shopee', label: 'Shopee 店铺', confidence: 0.8},
          {type: 'project', key: 'tiktok_shop', label: 'TikTok Shop', confidence: 0.8},
        ],
        relations: [
          {from: 'shopee', to: 'tiktok_shop', type: 'owns', confidence: 0.6},
        ],
        stage: 'clarify',
      },
      {
        id: 'seed-maria-4',
        title: '成本合计',
        content: '三项成本合计约 36%，剩余部分按 SKU 继续拆。',
        explanation: '先给合计，再给下一步，对方更容易确认范围。',
        confidence: 0.79,
        entities: [
          {type: 'project', key: 'sku_cost', label: 'SKU 成本结构', confidence: 0.86},
          {type: 'project', key: 'cost_management', label: '成本管理', confidence: 0.8},
        ],
        relations: [
          {from: 'sku_cost', to: 'cost_management', type: 'needs', confidence: 0.7},
        ],
        stage: 'consolidate',
      },
      {
        id: 'seed-maria-5',
        title: '预算确认',
        content: '本周先确认预算上限，再决定是否加投 campaign。',
        explanation: '把预算与行动绑定，避免讨论停留在口头。',
        confidence: 0.76,
        entities: [
          {type: 'project', key: 'campaign', label: '营销活动', confidence: 0.84},
          {type: 'need', key: 'budget_200', label: '预算两百以内', confidence: 0.55},
        ],
        relations: [
          {from: 'campaign', to: 'budget_200', type: 'needs', confidence: 0.72},
        ],
        stage: 'feedback',
      },
    ],
  }),
  sample({
    id: 'mia-english-roleplay',
    title: '陈美玲 · 英语角色扮演',
    scenario: '用英语练习一次周末邀约，中文教练在旁提示。',
    goal: '完成“问候 → 邀约 → 确认预算 → 收束”四步。',
    route: 'en',
    standardAnswer: 'Would you like to meet at 3 p.m. this Saturday at the east gate of Hongcheng Lake Park? The budget is under 200 yuan.',
    referenceAnswer: "I'd love to show you around Hongcheng Lake Park this Saturday afternoon. Shall we meet at the east gate at 3 p.m.? I'll keep the budget under 200 yuan, and there's no entrance fee.",
    style: '礼貌但直接；先给时间地点，再给预算。',
    commonMistakes: [
      '把“周六下午三点”说成 "Saturday afternoon" 而没有具体时间。',
      '把“预算两百以内”说成 "about 200"，上限不明确。',
      '邀约句缺少明确的问题结尾。',
    ],
    script: [
      ['me', 'mia', 'Hey Meiling, are you free this Saturday afternoon?'],
      ['mia', 'me', "I should be. What did you have in mind?"],
      ['me', 'mia', "I'd like to walk around Hongcheng Lake Park and shoot some video clips. Shall we meet at the east gate at 3 p.m.?"],
      ['mia', 'me', "That works. I'd like to keep the budget under 200 yuan, and ideally there's no entrance fee."],
      ['me', 'mia', "No problem. I'll send you a bilingual confirmation."],
    ],
  }),
  sample({
    id: 'daniel-first-meet',
    title: '丹尼尔 · 第一次见面',
    scenario: '在骑楼老街第一次见丹尼尔，先用中文寒暄再切换到简单英语。',
    goal: '确认称呼、来海口的原因和下次见面的时间。',
    route: 'zh',
    standardAnswer: '你好，丹尼尔。很高兴认识你。你是第一次来海口吗？',
    referenceAnswer: '你好，丹尼尔，很高兴认识你。听说你是第一次来海口，这几天住在哪一带？如果方便的话，下周我们可以一起去骑楼老街走走。',
    style: '先寒暄，再问一个具体问题；不连续追问三个以上问题。',
    commonMistakes: [
      '连续问“你叫什么、你从哪来、你做什么”，像查户口。',
      '没有确认对方名字的发音。',
      '把“下次见”说成“改天见”，没有具体时间。',
    ],
    memorySeeds: [
      {
        id: 'seed-daniel-1',
        title: '第一次见面',
        content: '丹尼尔第一次来海口，计划停留两周。',
        explanation: '先记住停留时长，后续推荐地点才不会超出行程。',
        confidence: 0.84,
        entities: [
          {type: 'person', key: 'daniel', label: '丹尼尔', confidence: 0.9},
          {type: 'time', key: 'one_week_leave', label: '一周年假', confidence: 0.55},
        ],
        relations: [
          {from: 'daniel', to: 'one_week_leave', type: 'owns', confidence: 0.6},
        ],
        stage: 'topic',
      },
      {
        id: 'seed-daniel-2',
        title: '地点偏好',
        content: '丹尼尔想看老建筑，骑楼老街是首选。',
        explanation: '把偏好与地点绑定，推荐时有依据。',
        confidence: 0.82,
        entities: [
          {type: 'place', key: 'qilou_street', label: '骑楼老街', confidence: 0.9},
          {type: 'person', key: 'daniel', label: '丹尼尔', confidence: 0.88},
        ],
        relations: [
          {from: 'daniel', to: 'qilou_street', type: 'located_at', confidence: 0.62},
        ],
        stage: 'topic',
      },
      {
        id: 'seed-daniel-3',
        title: '时间确认',
        content: '下周六下午可以一起逛骑楼老街。',
        explanation: '时间要落到具体半天，避免“改天”。',
        confidence: 0.8,
        entities: [
          {type: 'time', key: 'saturday', label: '周六', confidence: 0.9},
          {type: 'place', key: 'qilou_street', label: '骑楼老街', confidence: 0.86},
        ],
        relations: [
          {from: 'saturday', to: 'qilou_street', type: 'located_at', confidence: 0.55},
        ],
        stage: 'clarify',
      },
      {
        id: 'seed-daniel-4',
        title: '称呼确认',
        content: '确认丹尼尔希望被称呼为 Daniel。',
        explanation: '先确认称呼，减少后续尴尬。',
        confidence: 0.78,
        entities: [
          {type: 'person', key: 'daniel', label: '丹尼尔', confidence: 0.92},
          {type: 'need', key: 'three_numbers', label: '时间、地点、预算三个数字', confidence: 0.5},
        ],
        relations: [
          {from: 'daniel', to: 'three_numbers', type: 'needs', confidence: 0.55},
        ],
        stage: 'greet',
      },
      {
        id: 'seed-daniel-5',
        title: '下次行动',
        content: '下次见面先发时间与地点，再确认是否带相机。',
        explanation: '把下次行动写成可执行的两步。',
        confidence: 0.75,
        entities: [
          {type: 'need', key: 'stabilizer', label: '手机稳定器', confidence: 0.7},
          {type: 'time', key: 'saturday', label: '周六', confidence: 0.7},
        ],
        relations: [
          {from: 'stabilizer', to: 'saturday', type: 'needs', confidence: 0.5},
        ],
        stage: 'finish',
      },
    ],
  }),
]);

export const SAMPLES_BY_ID = new Map(SAMPLES.map((item) => [item.id, item]));

/** 没有专属记忆种子的样本，使用这一组通用历史建议（保证至少 5 条可查看）。 */
export const DEFAULT_MEMORY_SEEDS = Object.freeze([
  {
    id: 'seed-default-1',
    title: '先给三个数字',
    content: '约见面之前，先给出时间、地点、预算三个具体数字。',
    explanation: '把模糊邀约变成可确认的安排。',
    confidence: 0.9,
    entities: [
      {type: 'person', key: 'mia', label: '陈美玲', confidence: 0.9},
      {type: 'need', key: 'three_numbers', label: '时间、地点、预算三个数字', confidence: 0.88},
    ],
    relations: [{from: 'mia', to: 'three_numbers', type: 'needs', confidence: 0.86}],
    stage: 'clarify',
  },
  {
    id: 'seed-default-2',
    title: '确认预算上限',
    content: '预算说“两百以内”，不要说“两百左右”。',
    explanation: '上限清楚，对方才知道能不能答应。',
    confidence: 0.87,
    entities: [
      {type: 'need', key: 'budget_200', label: '预算两百以内', confidence: 0.9},
      {type: 'time', key: 'saturday', label: '周六', confidence: 0.7},
    ],
    relations: [{from: 'budget_200', to: 'saturday', type: 'needs', confidence: 0.6}],
    stage: 'clarify',
  },
  {
    id: 'seed-default-3',
    title: '中文夹英文',
    content: '重要的事用中文说一遍，再补一句英文确认。',
    explanation: '既保留对方的阅读习惯，也降低理解成本。',
    confidence: 0.84,
    entities: [
      {type: 'person', key: 'mia', label: '陈美玲', confidence: 0.88},
      {type: 'need', key: 'three_numbers', label: '时间、地点、预算三个数字', confidence: 0.65},
    ],
    relations: [{from: 'mia', to: 'three_numbers', type: 'owns', confidence: 0.6}],
    stage: 'consolidate',
  },
  {
    id: 'seed-default-4',
    title: '红城湖傍晚拍摄',
    content: '周六下午去红城湖公园散步，傍晚拍短视频素材。',
    explanation: '地点与时间绑定，后续推荐更容易命中。',
    confidence: 0.82,
    entities: [
      {type: 'place', key: 'hongcheng_park', label: '红城湖公园', confidence: 0.9},
      {type: 'time', key: 'saturday_3pm', label: '周六下午三点', confidence: 0.86},
    ],
    relations: [{from: 'hongcheng_park', to: 'saturday_3pm', type: 'located_at', confidence: 0.7}],
    stage: 'topic',
  },
  {
    id: 'seed-default-5',
    title: '搬家成本对比',
    content: '海甸岛一室一厅约三千二，国兴大道现租两千六。',
    explanation: '先把差额算出来，再讨论搬不搬。',
    confidence: 0.8,
    entities: [
      {type: 'place', key: 'haidian_island', label: '海甸岛', confidence: 0.9},
      {type: 'place', key: 'guoxing_avenue', label: '国兴大道', confidence: 0.88},
    ],
    relations: [{from: 'haidian_island', to: 'guoxing_avenue', type: 'located_at', confidence: 0.7}],
    stage: 'feedback',
  },
  {
    id: 'seed-default-6',
    title: '成本管理证书',
    content: '陈美玲下个月要考跨境电商成本管理证书。',
    explanation: '学习计划会影响她的周末时间安排。',
    confidence: 0.78,
    entities: [
      {type: 'person', key: 'mia', label: '陈美玲', confidence: 0.9},
      {type: 'project', key: 'cost_management', label: '成本管理', confidence: 0.85},
      {type: 'time', key: 'next_month', label: '下个月', confidence: 0.7},
    ],
    relations: [{from: 'mia', to: 'cost_management', type: 'works_on', confidence: 0.8}],
    stage: 'topic',
  },
]);

export function sampleList() {
  return SAMPLES.map((item) => ({
    id: item.id,
    title: item.title,
    scenario: item.scenario,
    goal: item.goal,
    route: item.route,
    standardAnswer: item.standardAnswer,
    referenceAnswer: item.referenceAnswer,
    style: item.style,
    commonMistakes: item.commonMistakes,
    stageGuide: item.stageGuide,
  }));
}