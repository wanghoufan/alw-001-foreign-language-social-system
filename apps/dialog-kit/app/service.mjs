/**
 * 对话教学编排：七阶段状态机、实体/关系抽取、建议生成、记忆确认。
 *
 * 设计原则：
 * - 全确定性：不调用模型、不访问网络；now / idFactory 可注入。
 * - 普通回答不被包装成建议：命中实体/关系少于 2 个时直接返回空建议。
 * - 低置信度建议不自动写入，只提示“需要确认”。
 */

import {
  ACTION_LABELS,
  ApiError,
  ENTITY_TYPE_LABELS,
  RELATION_TYPE_LABELS,
  STAGES,
  STAGE_LABELS,
  assertConfidence,
  clamp01,
  makeEntity,
  makeEvent,
  makeRelation,
  makeSuggestion,
} from './models.mjs';
import {AGENTS, DEFAULT_MEMORY_SEEDS, ENTITY_CATALOG, LEARNER, SAMPLES, SAMPLES_BY_ID} from './samples.mjs';
import {RuntimeStore} from './store.mjs';
import {fileURLToPath} from 'node:url';

const IDENTITIES = new Map([
  ...AGENTS.map((agent) => [agent.id, agent]),
  [LEARNER.id, LEARNER],
]);

function identity(id) {
  const found = IDENTITIES.get(id);
  if (!found) throw new ApiError(422, 'UNKNOWN_ACTOR', `未知参与者：${id}`);
  return {
    id: found.id,
    name: found.name,
    role: found.role,
  };
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function extractEntities(text) {
  const haystack = normalize(text);
  const seen = new Set();
  const entities = [];
  for (const item of ENTITY_CATALOG) {
    const hit = item.aliases.find((alias) => haystack.includes(normalize(alias)));
    if (!hit) continue;
    const dedupe = `${item.type}:${item.key}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    entities.push(
      makeEntity({
        type: item.type,
        key: item.key,
        label: item.label,
        confidence: hit.length >= 4 ? 0.88 : 0.72,
      })
    );
  }
  return entities;
}

function firstOf(entities, type) {
  return entities.find((item) => item.type === type) || null;
}

function deriveRelations(text, entities) {
  const person = firstOf(entities, 'person');
  const project = firstOf(entities, 'project');
  const place = firstOf(entities, 'place');
  const need = firstOf(entities, 'need');
  const relations = [];
  const hasMove = /搬|住|租|通勤|过去|去|在/.test(text);

  if (person && project) {
    relations.push(
      makeRelation({from: person.key, to: project.key, type: 'works_on', confidence: 0.8})
    );
  }
  if (person && place) {
    relations.push(
      makeRelation({
        from: person.key,
        to: place.key,
        type: 'located_at',
        confidence: hasMove ? 0.82 : 0.62,
      })
    );
  }
  if (person && need) {
    relations.push(
      makeRelation({from: person.key, to: need.key, type: 'needs', confidence: 0.78})
    );
  }
  if (project && need && !relations.some((item) => item.to === need.key)) {
    relations.push(
      makeRelation({from: project.key, to: need.key, type: 'needs', confidence: 0.66})
    );
  }

  const seen = new Set();
  return relations.filter((item) => {
    const key = `${item.from}:${item.type}:${item.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasAny(entities, type) {
  return entities.some((item) => item.type === type);
}

function personForActor(id, actor) {
  if (id !== 'me' && actor.role !== '对话对象') return null;
  return makeEntity({type: 'person', key: id, label: actor.name, confidence: 0.9});
}

function buildSuggestions({session, sample, text, entities, relations, confidence, createdAt}) {
  const matches = entities.length + relations.length;
  if (matches < 2) return [];
  const route = session.route;
  const ratio = Math.round(confidence * 100);
  const out = [];
  const push = (action, title, explanation, why, example) => {
    if (out.some((item) => item.action === action)) return;
    const suggestion = makeSuggestion({
      id: `${session.sessionId}-a${out.length + 1}`,
      action,
      title,
      explanation,
      why,
      example,
      confidence: clamp01((confidence + (action === 'confirm_relation' ? 0.05 : 0.02))),
      entities,
      relations,
      createdAt,
    });
    suggestion.stage = STAGES[session.stageIndex];
    out.push(suggestion);
  };

  if (hasAny(entities, 'place') && hasAny(entities, 'time')) {
    push(
      'confirm_relation',
      '确认见面安排',
      '把人物、地点、时间三件事一次说清，对方就能直接回答“可以”或“需要调整”。',
      `当前抽取置信度为 ${ratio}%；陈美玲习惯先看具体数字，再谈感受。`,
      route === 'en'
        ? 'Shall we meet at 3 p.m. on Saturday at the east gate of Hongcheng Lake Park?'
        : '我们这周六下午三点在红城湖公园东门见，可以吗？'
    );
  }

  if (hasAny(entities, 'need')) {
    push(
      'ask_clarify',
      '追问预算或需求边界',
      '不要只说“差不多”，先确认上限、是否含门票或咖啡，以及由谁承担。',
      '对方已经给出需求线索，追问一次可以避免见面后才发现预算不一致。',
      route === 'en'
        ? 'Just to confirm, does the 200 yuan budget include coffee and entrance fees?'
        : '我想确认一下：两百元预算包含咖啡和门票吗？'
    );
  }

  if (hasAny(entities, 'project')) {
    push(
      'practice_phrase',
      '练习成本表达',
      '先说结论，再说三项成本占比；每个百分比都补一句口径。',
      `样本标准答案是：“${sample.standardAnswer}”`,
      route === 'en'
        ? 'Logistics is about 18%, packaging 6%, and platform commission around 12%.'
        : '物流成本大概占 18%，包装占 6%，平台佣金差不多 12%。'
    );
  }

  if (/[?？]|吗|如何|怎么/.test(text)) {
    push(
      'roleplay_reply',
      '给出一句可接的回应',
      '先回应对方的问题，再补一个具体细节；不要只回“嗯”或“好的”。',
      '角色扮演需要推动对话，而不是停在单字回答。',
      route === 'en'
        ? "That works for me. I'll keep the budget under 200 yuan and send you the details."
        : '可以，我按两百元以内来安排，稍后把具体信息发你。'
    );
  }

  if ((session.memorySeeds || []).length + (session.memory || []).length >= 2) {
    push(
      'review_history',
      '查看历史建议',
      '把已确认的记忆和本轮新事实对照，优先复用不重复的表述。',
      '历史记忆已有至少两条，可以先核对再决定是否新增。',
      route === 'en'
        ? 'Let me check what we have already confirmed before adding anything new.'
        : '我先对照一下已经确认过的内容，再决定要不要新增。'
    );
  }

  return out.slice(0, 3);
}

function makeMemoryRecord({sessionId, suggestion, createdAt}) {
  return {
    memoryId: `m_${sessionId}_${suggestion.id}`,
    sessionId,
    suggestionId: suggestion.id,
    title: suggestion.title,
    content: suggestion.example,
    explanation: suggestion.explanation,
    confidence: suggestion.confidence,
    entities: suggestion.entities,
    relations: suggestion.relations,
    stage: suggestion.stage || null,
    createdAt,
  };
}

export class DialogService {
  constructor({dataDir, now = () => new Date(), idFactory, samples = SAMPLES} = {}) {
    this.store = new RuntimeStore({dir: dataDir || fileURLToPath(new URL('../data/runtime', import.meta.url))});
    this.now = now;
    this.idFactory = idFactory || ((seq) => `s_${seq}`);
    this.samples = samples;
    this.samplesById = new Map(samples.map((item) => [item.id, item]));
    this.seq = 0;
  }

  samplesPayload() {
    return this.samples.map((item) => ({
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

  agentsPayload() {
    return [...AGENTS, LEARNER].map((item) => ({...item}));
  }

  createSession({sampleId, route} = {}) {
    const sample = sampleId ? this.samplesById.get(sampleId) : this.samples[0];
    if (!sample) throw new ApiError(404, 'SAMPLE_NOT_FOUND', `样本不存在：${sampleId}`);
    const finalRoute = route === undefined || route === null ? sample.route : route;
    if (finalRoute !== 'zh' && finalRoute !== 'en') {
      throw new ApiError(400, 'INVALID_ROUTE', `无效语言路线：${finalRoute}`);
    }
    this.seq += 1;
    const sessionId = this.idFactory(this.seq);
    const createdAt = this.now().toISOString();
    const seeds = (sample.memorySeeds && sample.memorySeeds.length ? sample.memorySeeds : DEFAULT_MEMORY_SEEDS).map(
      (item) => ({...item, sessionId, createdAt})
    );
    const session = {
      sessionId,
      sampleId: sample.id,
      route: finalRoute,
      stageIndex: 0,
      stageHistory: [{stage: STAGES[0], at: createdAt, turnId: null, replayCount: 0}],
      turns: [],
      memorySeeds: seeds,
      memory: [],
      createdAt,
      updatedAt: createdAt,
    };
    return this.store.save(session);
  }

  getSession(sessionId) {
    const session = this.store.get(sessionId);
    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', `会话不存在：${sessionId}`);
    return session;
  }

  currentStage(session) {
    return STAGES[session.stageIndex];
  }

  stageGuide(session, stage = this.currentStage(session)) {
    const sample = this.samplesById.get(session.sampleId);
    const guide = (sample && sample.stageGuide || []).find((item) => item.stage === stage);
    return guide ? {...guide, label: STAGE_LABELS[stage]} : {stage, label: STAGE_LABELS[stage], text: ''};
  }

  switchRoute(sessionId, route) {
    if (route !== 'zh' && route !== 'en') {
      throw new ApiError(400, 'INVALID_ROUTE', `无效语言路线：${route}`);
    }
    const session = this.getSession(sessionId);
    if (session.route === route) return session;
    const at = this.now().toISOString();
    session.route = route;
    session.updatedAt = at;
    session.turns.push(
      makeEvent({
        type: 'session',
        sessionId,
        turnId: `t${session.turns.length + 1}`,
        stage: this.currentStage(session),
        actor: identity('system'),
        audience: identity('me'),
        content: route === 'en' ? '切换语言路线：英语路线' : '切换语言路线：中文路线',
        confidence: 1,
        createdAt: at,
      })
    );
    return this.store.save(session);
  }

  submitTurn({sessionId, actorId, audienceId, content, score = null, confidence, stage} = {}) {
    const session = this.getSession(sessionId);
    if (stage !== undefined && stage !== null && stage !== this.currentStage(session)) {
      throw new ApiError(400, 'STAGE_MISMATCH', `当前阶段是 ${this.currentStage(session)}，不是 ${stage}`);
    }
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) throw new ApiError(422, 'INVALID_CONTENT', 'content 必须是非空字符串');
    const actor = identity(actorId);
    const audience = audienceId ? identity(audienceId) : null;
    const sample = this.samplesById.get(session.sampleId);

    const entities = extractEntities(text);
    const actorPerson = personForActor(actorId, actor);
    if (actorPerson && !hasAny(entities, 'person')) entities.unshift(actorPerson);
    const relations = deriveRelations(text, entities);
    const finalConfidence =
      confidence === undefined || confidence === null
        ? clamp01(0.5 + entities.length * 0.06 + relations.length * 0.08)
        : assertConfidence(confidence);

    const createdAt = this.now().toISOString();
    const suggestedActions = buildSuggestions({
      session,
      sample,
      text,
      entities,
      relations,
      confidence: finalConfidence,
      createdAt,
    });

    const finalScore =
      score !== null && score !== undefined
        ? score
        : actorId === 'me' && this.currentStage(session) === 'feedback'
          ? Math.min(100, 60 + Math.round(finalConfidence * 30))
          : null;

    const event = makeEvent({
      type: 'speech',
      sessionId,
      turnId: `t${session.turns.length + 1}`,
      stage: this.currentStage(session),
      actor,
      audience,
      content: text,
      score: finalScore,
      confidence: finalConfidence,
      entities,
      relations,
      suggestedActions,
      createdAt,
    });

    session.turns.push(event);
    session.updatedAt = createdAt;
    this.store.save(session);
    return {event, session};
  }

  advance(sessionId) {
    const session = this.getSession(sessionId);
    if (session.stageIndex >= STAGES.length - 1) {
      throw new ApiError(400, 'STAGE_AT_FINISH', '已经处于收束阶段');
    }
    const at = this.now().toISOString();
    session.stageIndex += 1;
    const stage = this.currentStage(session);
    session.stageHistory.push({stage, at, turnId: null, replayCount: 0});
    session.updatedAt = at;
    session.turns.push(
      makeEvent({
        type: stage === 'finish' ? 'finish' : 'advance',
        sessionId,
        turnId: `t${session.turns.length + 1}`,
        stage,
        actor: identity('tutor'),
        audience: identity('me'),
        content: `进入${STAGE_LABELS[stage]}阶段`,
        confidence: 1,
        createdAt: at,
      })
    );
    this.store.save(session);
    return {session, guide: this.stageGuide(session, stage)};
  }

  rewind(sessionId) {
    const session = this.getSession(sessionId);
    if (session.stageIndex <= 0) {
      throw new ApiError(400, 'STAGE_AT_START', '已经处于第一阶段，无法继续回退');
    }
    const at = this.now().toISOString();
    session.stageIndex -= 1;
    const stage = this.currentStage(session);
    const previous = session.stageHistory[session.stageHistory.length - 1];
    session.stageHistory.push({stage, at, turnId: null, replayCount: (previous && previous.replayCount || 0) + 1});
    session.updatedAt = at;
    session.turns.push(
      makeEvent({
        type: 'rewind',
        sessionId,
        turnId: `t${session.turns.length + 1}`,
        stage,
        actor: identity('tutor'),
        audience: identity('me'),
        content: `回退到${STAGE_LABELS[stage]}阶段`,
        confidence: 1,
        createdAt: at,
      })
    );
    this.store.save(session);
    return {session, guide: this.stageGuide(session, stage)};
  }

  confirm({sessionId, suggestionId, accepted = true} = {}) {
    const session = this.getSession(sessionId);
    if (typeof accepted !== 'boolean') {
      throw new ApiError(422, 'INVALID_ACCEPTED', 'accepted 必须是布尔值');
    }
    const suggestion = [...session.turns.flatMap((turn) => turn.suggestedActions || []), ...session.memorySeeds]
      .find((item) => item.id === suggestionId);
    if (!suggestion) throw new ApiError(404, 'SUGGESTION_NOT_FOUND', `建议不存在：${suggestionId}`);

    let record = null;
    const createdAt = this.now().toISOString();
    if (accepted && !session.memory.some((item) => item.suggestionId === suggestionId)) {
      record = makeMemoryRecord({sessionId, suggestion, createdAt});
      session.memory.push(record);
      session.updatedAt = createdAt;
      this.store.save(session);
    }
    return {
      accepted,
      suggestionId,
      memory: session.memory,
      record,
      actionLabels: ACTION_LABELS,
      entityTypeLabels: ENTITY_TYPE_LABELS,
      relationTypeLabels: RELATION_TYPE_LABELS,
    };
  }

  memorySuggestions(sessionId) {
    const session = this.getSession(sessionId);
    return [...session.memorySeeds, ...session.memory].map((item, index) => ({
      ...item,
      order: index + 1,
      action: item.action || 'review_history',
      actionLabel: item.action ? ACTION_LABELS[item.action] : '历史事实',
    }));
  }
}