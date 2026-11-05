import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  STAGES,
  STAGE_LABELS,
  assertConfidence,
  makeEntity,
  makeEvent,
  makeRelation,
  makeSuggestion,
} from '../app/models.mjs';

const actor = {id: 'me', name: '我', role: '学员'};
const base = {
  sessionId: 's_1',
  turnId: 't1',
  stage: 'greet',
  actor,
  audience: {id: 'mia', name: '陈美玲', role: '对话对象'},
  content: '你好，美玲。',
};

test('模型：七个阶段与中文标签齐全', () => {
  assert.equal(STAGES.length, 7);
  assert.deepEqual(
    STAGES.map((stage) => STAGE_LABELS[stage]),
    ['问候', '定题', '澄清', '角色扮演', '反馈', '巩固', '收束']
  );
});

test('模型：事件结构包含全部固定字段', () => {
  const event = makeEvent({type: 'speech', ...base});
  for (const key of [
    'type',
    'sessionId',
    'turnId',
    'stage',
    'actor',
    'audience',
    'content',
    'score',
    'confidence',
    'entities',
    'relations',
    'suggestedActions',
    'createdAt',
  ]) {
    assert.ok(Object.hasOwn(event, key), `缺少字段 ${key}`);
  }
  assert.equal(event.type, 'speech');
  assert.equal(event.score, null);
});

test('模型：无效阶段报 400', () => {
  assert.throws(() => makeEvent({type: 'speech', ...base, stage: 'unknown'}), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, 'INVALID_STAGE');
    return true;
  });
});

test('模型：无效事件类型与置信度报 422', () => {
  assert.throws(() => makeEvent({type: 'not-a-type', ...base}), {status: 422, code: 'INVALID_EVENT_TYPE'});
  assert.throws(() => assertConfidence(1.2), {status: 422, code: 'INVALID_CONFIDENCE'});
  assert.throws(() => assertConfidence(-0.01), {status: 422, code: 'INVALID_CONFIDENCE'});
});

test('模型：实体与关系类型受白名单约束', () => {
  assert.throws(() => makeEntity({type: 'animal', key: 'x', label: 'x'}), {status: 422, code: 'INVALID_ENTITY_TYPE'});
  assert.throws(
    () => makeRelation({from: 'a', to: 'b', type: 'likes'}),
    {status: 422, code: 'INVALID_RELATION_TYPE'}
  );
});

test('模型：少于两个命中的建议被拒绝生成', () => {
  assert.throws(
    () =>
      makeSuggestion({
        id: 'a1',
        action: 'confirm_relation',
        title: '确认',
        explanation: '解释',
        why: '原因',
        example: '示例',
        confidence: 0.8,
        entities: [{type: 'place', key: 'p', label: '地点', confidence: 0.8}],
        relations: [],
      }),
    {status: 422, code: 'INSUFFICIENT_MATCHES'}
  );
});