import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {DialogService} from '../app/service.mjs';
import {ENTITY_CATALOG, SAMPLES} from '../app/samples.mjs';
import {STAGES} from '../app/models.mjs';

const NOW = new Date('2026-11-04T10:00:00.000Z');

async function newService() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dialog-kit-'));
  return {
    dir,
    service: new DialogService({dataDir: dir, now: () => NOW, idFactory: (seq) => `s_${seq}`}),
  };
}

test('编排：新会话重置到问候并带至少五条历史建议', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  assert.equal(session.stageIndex, 0);
  assert.equal(session.turns.length, 0);
  assert.ok(session.memorySeeds.length >= 5);
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：样本目录至少提供二十个实体样例和四个样本', () => {
  assert.ok(ENTITY_CATALOG.length >= 20);
  assert.ok(SAMPLES.length >= 4);
  for (const item of SAMPLES) {
    assert.equal(item.stageGuide.length, 7);
    assert.ok(item.standardAnswer.length > 0);
    assert.ok(item.referenceAnswer.length > 0);
    assert.ok(item.style.length > 0);
    assert.ok(item.commonMistakes.length > 0);
  }
});

test('编排：一次具体邀约抽取实体/关系，且每条建议至少两个命中', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  const {event} = service.submitTurn({
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '这周六下午三点，红城湖公园东门，预算两百以内，可以吗？',
  });
  assert.ok(event.entities.length >= 2);
  assert.ok(event.relations.length >= 1);
  assert.ok(event.suggestedActions.length >= 1);
  for (const item of event.suggestedActions) {
    assert.ok(item.entities.length + item.relations.length >= 2);
    assert.equal(item.needsConfirmation, item.confidence < 0.6);
  }
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：普通寒暄不产生建议', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  const {event} = service.submitTurn({
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '你好。',
  });
  assert.equal(event.suggestedActions.length, 0);
  assert.equal(event.relations.length, 0);
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：阶段可继续、可回退，历史事件不被删除', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  service.submitTurn({
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '周六下午三点，红城湖公园见。',
  });
  service.advance(session.sessionId);
  service.advance(session.sessionId);
  const before = service.getSession(session.sessionId);
  assert.equal(STAGES[before.stageIndex], 'clarify');
  assert.equal(before.turns.length, 3);

  const result = service.rewind(session.sessionId);
  assert.equal(STAGES[result.session.stageIndex], 'topic');
  assert.equal(result.session.turns.length, 4);
  assert.ok(result.guide.text.length > 0);
  assert.equal(result.session.turns[0].content, '周六下午三点，红城湖公园见。');
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：第一阶段不能继续回退', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  assert.throws(() => service.rewind(session.sessionId), {status: 400, code: 'STAGE_AT_START'});
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：切换语言路线保留会话与阶段，开新会话才重置', async () => {
  const {dir, service} = await newService();
  const first = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  service.advance(first.sessionId);
  const switched = service.switchRoute(first.sessionId, 'en');
  assert.equal(switched.sessionId, first.sessionId);
  assert.equal(switched.stageIndex, 1);
  assert.equal(switched.route, 'en');

  const second = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  assert.notEqual(second.sessionId, first.sessionId);
  assert.equal(second.stageIndex, 0);
  assert.equal(second.turns.length, 0);
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：低置信度建议标记需要确认', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  const {event} = service.submitTurn({
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '周六下午三点，红城湖公园见，预算两百以内。',
    confidence: 0.41,
  });
  assert.ok(event.suggestedActions.length >= 1);
  assert.ok(event.suggestedActions.every((item) => item.needsConfirmation));
  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：确认写入记忆，拒绝不写入', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  const {event} = service.submitTurn({
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '周六下午三点，红城湖公园见，预算两百以内。',
  });
  const suggestion = event.suggestedActions[0];

  const before = service.memorySuggestions(session.sessionId).length;
  const rejected = service.confirm({
    sessionId: session.sessionId,
    suggestionId: suggestion.id,
    accepted: false,
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.record, null);
  assert.equal(service.getSession(session.sessionId).memory.length, 0);

  const accepted = service.confirm({
    sessionId: session.sessionId,
    suggestionId: suggestion.id,
    accepted: true,
  });
  assert.ok(accepted.record);
  assert.equal(accepted.memory.length, 1);
  assert.ok(accepted.record.title.length > 0);
  assert.ok(service.memorySuggestions(session.sessionId).length > before);

  await fs.rm(dir, {recursive: true, force: true});
});

test('编排：相同输入在固定时钟下产生相同事件结构', async () => {
  const {dir, service} = await newService();
  const session = service.createSession({sampleId: 'mia-hongcheng-weekend'});
  const input = {
    sessionId: session.sessionId,
    actorId: 'me',
    audienceId: 'mia',
    content: '周六下午三点，红城湖公园东门，预算两百以内。',
  };
  const first = service.submitTurn(input).event;
  const second = service.submitTurn(input).event;
  assert.equal(first.turnId, 't1');
  assert.equal(second.turnId, 't2');
  assert.equal(first.createdAt, second.createdAt);
  assert.deepEqual(first.entities, second.entities);
  assert.deepEqual(first.relations, second.relations);
  assert.equal(first.suggestedActions.length, second.suggestedActions.length);
  await fs.rm(dir, {recursive: true, force: true});
});