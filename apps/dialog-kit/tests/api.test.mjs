import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {createApp} from '../app/server.mjs';

const NOW = new Date('2026-11-04T10:00:00.000Z');
let tempDir, app, server, base;

async function request(route, {method = 'GET', body} = {}) {
  const response = await fetch(base + route, {
    method,
    headers: body === undefined ? undefined : {'Content-Type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return {status: response.status, body: await response.json()};
}

before(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dialog-kit-api-'));
  app = createApp({dataDir: tempDir, now: () => NOW, idFactory: (seq) => `s_${seq}`});
  server = http.createServer((req, res) => app.handle(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tempDir, {recursive: true, force: true});
});

test('接口：健康检查', async () => {
  const result = await request('/api/health');
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
});

test('接口：样本列表为中文教学材料，含四类角色与七阶段', async () => {
  const result = await request('/api/dialog/samples');
  assert.equal(result.status, 200);
  assert.ok(result.body.samples.length >= 4);
  assert.ok(result.body.samples.every((item) => /[\u4e00-\u9fa5]/.test(item.title)));
  assert.ok(result.body.agents.length >= 5);
  assert.equal(Object.keys(result.body.labels.stages).length, 7);
  for (const sample of result.body.samples) {
    assert.equal(sample.stageGuide.length, 7);
    assert.ok(sample.standardAnswer.length > 0);
    assert.ok(sample.referenceAnswer.length > 0);
  }
});

test('接口：创建会话并提交回合', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-hongcheng-weekend'}});
  assert.equal(created.status, 200);
  const sessionId = created.body.session.sessionId;

  const turn = await request('/api/dialog/turn', {
    method: 'POST',
    body: {
      sessionId,
      actorId: 'me',
      audienceId: 'mia',
      content: '这周六下午三点，红城湖公园东门，预算两百以内，可以吗？',
    },
  });
  assert.equal(turn.status, 200);
  assert.equal(turn.body.event.type, 'speech');
  assert.equal(turn.body.event.stage, 'greet');
  assert.ok(turn.body.event.entities.length >= 2);
  assert.ok(turn.body.event.relations.length >= 1);
  assert.ok(turn.body.event.suggestedActions.length >= 1);
});

test('接口：普通寒暄返回空建议', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'daniel-first-meet'}});
  const turn = await request('/api/dialog/turn', {
    method: 'POST',
    body: {sessionId: created.body.session.sessionId, actorId: 'me', audienceId: 'daniel', content: '你好。'},
  });
  assert.equal(turn.status, 200);
  assert.deepEqual(turn.body.event.suggestedActions, []);
});

test('接口：无效参与者、置信度、阶段被拒绝', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-hongcheng-weekend'}});
  const sessionId = created.body.session.sessionId;

  let result = await request('/api/dialog/turn', {
    method: 'POST',
    body: {sessionId, actorId: 'nobody', content: '你好。'},
  });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'UNKNOWN_ACTOR');

  result = await request('/api/dialog/turn', {
    method: 'POST',
    body: {sessionId, actorId: 'me', content: '你好。', confidence: 2},
  });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'INVALID_CONFIDENCE');

  result = await request('/api/dialog/turn', {
    method: 'POST',
    body: {sessionId, actorId: 'me', content: '你好。', stage: 'finish'},
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'STAGE_MISMATCH');
});

test('接口：回退阶段并保留历史', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-hongcheng-weekend'}});
  const sessionId = created.body.session.sessionId;
  await request('/api/dialog/advance', {method: 'POST', body: {sessionId}});

  const rewound = await request('/api/dialog/rewind', {method: 'POST', body: {sessionId}});
  assert.equal(rewound.status, 200);
  assert.equal(rewound.body.session.stageIndex, 0);
  assert.equal(rewound.body.canContinue, true);
  assert.ok(rewound.body.guide.text.length > 0);

  const blocked = await request('/api/dialog/rewind', {method: 'POST', body: {sessionId}});
  assert.equal(blocked.status, 400);
  assert.equal(blocked.body.code, 'STAGE_AT_START');
});

test('接口：确认建议写入记忆，拒绝不写入', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-hongcheng-weekend'}});
  const sessionId = created.body.session.sessionId;
  const turn = await request('/api/dialog/turn', {
    method: 'POST',
    body: {sessionId, actorId: 'me', audienceId: 'mia', content: '周六下午三点，红城湖公园见，预算两百以内。'},
  });
  const suggestionId = turn.body.event.suggestedActions[0].id;

  let result = await request('/api/dialog/confirm', {
    method: 'POST',
    body: {sessionId, suggestionId, accepted: false},
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.accepted, false);
  assert.equal(result.body.memory.length, 0);

  result = await request('/api/dialog/confirm', {
    method: 'POST',
    body: {sessionId, suggestionId, accepted: true},
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.memory.length, 1);
  assert.ok(result.body.record.memoryId.startsWith('m_'));
});

test('接口：历史建议至少五条，未知会话返回 404', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-english-roleplay'}});
  const sessionId = created.body.session.sessionId;
  const result = await request(`/api/memory/suggestions?sessionId=${encodeURIComponent(sessionId)}`);
  assert.equal(result.status, 200);
  assert.ok(result.body.suggestions.length >= 5);

  const missing = await request('/api/memory/suggestions?sessionId=s_missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'SESSION_NOT_FOUND');
});

test('接口：切换语言路线保留会话', async () => {
  const created = await request('/api/dialog/session', {method: 'POST', body: {sampleId: 'mia-hongcheng-weekend'}});
  const sessionId = created.body.session.sessionId;
  const result = await request('/api/dialog/route', {method: 'POST', body: {sessionId, route: 'en'}});
  assert.equal(result.status, 200);
  assert.equal(result.body.session.sessionId, sessionId);
  assert.equal(result.body.session.route, 'en');
});

test('接口：静态教学台使用中文文档', async () => {
  const response = await fetch(base + '/');
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /四路口对话教学台/);
  assert.match(html, /标准答案/);
});