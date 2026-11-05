/**
 * 四路口对话教学 · 领域模型
 *
 * 所有事件都必须落成同一种结构：
 * type / sessionId / turnId / stage / actor / audience / content /
 * score / confidence / entities / relations / suggestedActions / createdAt
 *
 * 这里只做确定性的契约校验，不依赖任何外部服务。
 */

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export const STAGES = Object.freeze([
  'greet',
  'topic',
  'clarify',
  'roleplay',
  'feedback',
  'consolidate',
  'finish',
]);

export const STAGE_LABELS = Object.freeze({
  greet: '问候',
  topic: '定题',
  clarify: '澄清',
  roleplay: '角色扮演',
  feedback: '反馈',
  consolidate: '巩固',
  finish: '收束',
});

export const EVENT_TYPES = Object.freeze([
  'session',
  'speech',
  'advance',
  'rewind',
  'confirm',
  'finish',
]);

export const ENTITY_TYPES = Object.freeze(['person', 'project', 'place', 'time', 'need']);

export const ENTITY_TYPE_LABELS = Object.freeze({
  person: '人物',
  project: '项目',
  place: '地点',
  time: '时间',
  need: '需求',
});

export const RELATION_TYPES = Object.freeze(['owns', 'works_on', 'located_at', 'needs']);

export const RELATION_TYPE_LABELS = Object.freeze({
  owns: '拥有',
  works_on: '参与',
  located_at: '位于',
  needs: '需要',
});

export const ACTION_TYPES = Object.freeze([
  'ask_clarify',
  'confirm_relation',
  'practice_phrase',
  'roleplay_reply',
  'review_history',
]);

export const ACTION_LABELS = Object.freeze({
  ask_clarify: '追问澄清',
  confirm_relation: '确认关系',
  practice_phrase: '练习表达',
  roleplay_reply: '角色回应',
  review_history: '查看历史建议',
});

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function assertNonEmptyString(value, field, status = 422) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(status, 'INVALID_INPUT', `${field} 必须是非空字符串`);
  }
  return value.trim();
}

export function assertStage(stage, status = 400) {
  if (!STAGES.includes(stage)) {
    throw new ApiError(status, 'INVALID_STAGE', `无效阶段：${stage}`);
  }
  return stage;
}

export function assertEventType(type) {
  if (!EVENT_TYPES.includes(type)) {
    throw new ApiError(422, 'INVALID_EVENT_TYPE', `无效事件类型：${type}`);
  }
  return type;
}

export function assertConfidence(value, field = 'confidence') {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1) {
    throw new ApiError(422, 'INVALID_CONFIDENCE', `${field} 必须是 0 到 1 之间的数字`);
  }
  return number;
}

export function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function makeEntity({type, key, label, confidence = 0.8}) {
  if (!ENTITY_TYPES.includes(type)) {
    throw new ApiError(422, 'INVALID_ENTITY_TYPE', `无效实体类型：${type}`);
  }
  return {
    type,
    key: assertNonEmptyString(key, 'entity.key'),
    label: assertNonEmptyString(label, 'entity.label'),
    confidence: assertConfidence(confidence, 'entity.confidence'),
  };
}

export function makeRelation({from, to, type, confidence = 0.8}) {
  if (!RELATION_TYPES.includes(type)) {
    throw new ApiError(422, 'INVALID_RELATION_TYPE', `无效关系类型：${type}`);
  }
  return {
    from: assertNonEmptyString(from, 'relation.from'),
    to: assertNonEmptyString(to, 'relation.to'),
    type,
    confidence: assertConfidence(confidence, 'relation.confidence'),
  };
}

/**
 * 每条建议至少命中 2 个实体/关系；不足 2 个时由调用方决定丢弃，
 * 这里直接报错，避免“普通回答被包装成建议”。
 */
export function makeSuggestion({
  id,
  action,
  title,
  explanation,
  why,
  example,
  confidence,
  entities = [],
  relations = [],
  needsConfirmation,
  createdAt,
}) {
  if (!ACTION_TYPES.includes(action)) {
    throw new ApiError(422, 'INVALID_ACTION_TYPE', `无效建议动作：${action}`);
  }
  if (entities.length + relations.length < 2) {
    throw new ApiError(422, 'INSUFFICIENT_MATCHES', '每条建议至少需要命中 2 个实体或关系');
  }
  const score = assertConfidence(confidence);
  return {
    id: assertNonEmptyString(id, 'suggestion.id'),
    action,
    title: assertNonEmptyString(title, 'suggestion.title'),
    explanation: assertNonEmptyString(explanation, 'suggestion.explanation'),
    why: assertNonEmptyString(why, 'suggestion.why'),
    example: assertNonEmptyString(example, 'suggestion.example'),
    confidence: score,
    needsConfirmation: typeof needsConfirmation === 'boolean' ? needsConfirmation : score < 0.6,
    entities: entities.map(makeEntity),
    relations: relations.map(makeRelation),
    createdAt: createdAt || new Date().toISOString(),
  };
}

export function makeEvent({
  type,
  sessionId,
  turnId,
  stage,
  actor,
  audience = null,
  content = '',
  score = null,
  confidence = 0.8,
  entities = [],
  relations = [],
  suggestedActions = [],
  createdAt,
}) {
  return {
    type: assertEventType(type),
    sessionId: assertNonEmptyString(sessionId, 'sessionId'),
    turnId: assertNonEmptyString(turnId, 'turnId'),
    stage: assertStage(stage),
    actor,
    audience,
    content: typeof content === 'string' ? content : '',
    score: score === null || score === undefined ? null : Math.max(0, Math.min(100, Number(score))),
    confidence: assertConfidence(confidence),
    entities: entities.map(makeEntity),
    relations: relations.map(makeRelation),
    suggestedActions,
    createdAt: createdAt || new Date().toISOString(),
  };
}