/**
 * 教学台前端：只调用同源接口，全部界面文案为中文。
 */

const state = {
  session: null,
  samples: [],
  agents: [],
  stageLabels: {},
  actionLabels: {},
  entityLabels: {},
  relationLabels: {},
  guide: null,
  lastSuggestions: [],
  status: '',
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {'Content-Type': 'application/json', ...(options.headers || {})},
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.code || `请求失败：${response.status}`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function currentSample() {
  return state.samples.find((item) => item.id === state.session?.sampleId) || state.samples[0] || null;
}

function identityName(id) {
  const found = state.agents.find((item) => item.id === id);
  return found ? found.name : id || '未指定';
}

function setStatus(text) {
  state.status = text;
  const node = $('#turnStatus');
  if (node) node.textContent = text;
}

function renderSamples() {
  const select = $('#sampleSelect');
  select.innerHTML = state.samples
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`)
    .join('');
  if (state.session) select.value = state.session.sampleId;
}

function renderAgents() {
  $('#agentCards').innerHTML = state.agents
    .map((agent) => {
      const goals = (agent.goals || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      const rules = (agent.constraints || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
      return `<article class="agent">
        <div class="agent-head"><strong>${escapeHtml(agent.name)}</strong><span class="tag">${escapeHtml(agent.role || '')}</span></div>
        <p class="muted">${escapeHtml(agent.persona || '')}</p>
        <p><strong>表达风格：</strong>${escapeHtml(agent.style || '')}</p>
        <div class="agent-cols"><div><strong>目标</strong><ul>${goals}</ul></div><div><strong>约束</strong><ul>${rules}</ul></div></div>
      </article>`;
    })
    .join('');
}

function renderSelectors() {
  for (const id of ['#actorSelect', '#audienceSelect']) {
    const node = $(id);
    const previous = node.value;
    node.innerHTML = state.agents
      .map((agent) => `<option value="${escapeHtml(agent.id)}">${escapeHtml(agent.name)}</option>`)
      .join('');
    if (previous && state.agents.some((agent) => agent.id === previous)) node.value = previous;
  }
  if (!$('#actorSelect').value) $('#actorSelect').value = 'me';
  if (!$('#audienceSelect').value) $('#audienceSelect').value = 'mia';
}

function renderStageRail() {
  if (!state.session) return;
  const stage = state.session.stageIndex;
  $('#stageRail').innerHTML = Object.entries(state.stageLabels)
    .map(([key, label], index) => {
      const status = index < stage ? 'done' : index === stage ? 'active' : '';
      return `<div class="stage ${status}"><span class="stage-index">${index + 1}</span><span>${escapeHtml(label)}</span></div>`;
    })
    .join('');
}

function renderSampleInfo() {
  const sample = currentSample();
  if (!sample) return;
  $('#sampleScenario').textContent = `场景：${sample.scenario}`;
  $('#sampleGoal').textContent = `目标：${sample.goal}`;
  $('#standardAnswer').textContent = sample.standardAnswer;
  $('#referenceAnswer').textContent = sample.referenceAnswer;
  $('#styleText').textContent = sample.style;
  $('#mistakeList').innerHTML = (sample.commonMistakes || [])
    .map((item) => `<li><strong>易错表达：</strong>${escapeHtml(item)}</li>`)
    .join('');
}

function renderSuggestions() {
  const list = state.lastSuggestions;
  if (!list.length) {
    $('#suggestionList').innerHTML = '<p class="state">本轮没有教学建议。普通寒暄或信息不足时，系统不会强行给建议。</p>';
    return;
  }
  $('#suggestionList').innerHTML = list
    .map((item) => {
      const action = state.actionLabels[item.action] || item.action;
      const entities = (item.entities || [])
        .map((entity) => `${state.entityLabels[entity.type] || entity.type}：${entity.label}`)
        .join('、');
      const relations = (item.relations || [])
        .map((relation) => `${state.relationLabels[relation.type] || relation.type}：${relation.from} → ${relation.to}`)
        .join('、');
      const needs = item.needsConfirmation ? '<span class="tag warn">需要确认</span>' : '<span class="tag ok">可直接采用</span>';
      return `<article class="suggestion">
        <div class="suggestion-head"><strong>${escapeHtml(item.title)}</strong><span class="tag">${escapeHtml(action)}</span>${needs}</div>
        <p><strong>建议解释：</strong>${escapeHtml(item.explanation)}</p>
        <p><strong>为什么：</strong>${escapeHtml(item.why)}</p>
        <p><strong>示例：</strong>${escapeHtml(item.example)}</p>
        <p class="muted"><strong>命中实体：</strong>${escapeHtml(entities)}</p>
        <p class="muted"><strong>命中关系：</strong>${escapeHtml(relations)}</p>
        <p class="muted">置信度：${(item.confidence * 100).toFixed(0)}%</p>
        <div class="actions">
          <button data-confirm="${escapeHtml(item.id)}" data-accepted="true" class="primary">确认写入记忆</button>
          <button data-confirm="${escapeHtml(item.id)}" data-accepted="false">拒绝</button>
        </div>
      </article>`;
    })
    .join('');
}

function renderMemory() {
  if (!state.session) return;
  const memory = state.session.memory || [];
  $('#memoryCount').textContent = String(memory.length);
  $('#memoryList').innerHTML = memory.length
    ? memory
        .map(
          (item) => `<div class="memory"><strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.content)}</p>
            <p class="muted">${escapeHtml(item.explanation)} · 置信度 ${(item.confidence * 100).toFixed(0)}%</p></div>`
        )
        .join('')
    : '<p class="state">还没有确认记忆。点击建议上的“确认写入记忆”后才会落盘。</p>';
}

async function renderHistory() {
  if (!state.session) return;
  const data = await api(`/api/memory/suggestions?sessionId=${encodeURIComponent(state.session.sessionId)}`);
  $('#historyList').innerHTML = data.suggestions
    .map(
      (item) => `<div class="memory"><strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.content)}</p>
        <p class="muted">${escapeHtml(item.explanation)} · 置信度 ${(item.confidence * 100).toFixed(0)}%</p></div>`
    )
    .join('');
}

function renderTimeline() {
  if (!state.session) return;
  $('#timeline').innerHTML = state.session.turns.length
    ? state.session.turns
        .map(
          (event) => `<div class="event">
            <span class="tag">${escapeHtml(state.stageLabels[event.stage] || event.stage)}</span>
            <strong>${escapeHtml(event.actor?.name || '')}</strong>
            <span class="muted">→ ${escapeHtml(event.audience?.name || '全场')}</span>
            <p>${escapeHtml(event.content)}</p>
            <p class="muted">${escapeHtml(event.type)} · 置信度 ${(event.confidence * 100).toFixed(0)}%${event.score === null ? '' : ` · 得分 ${event.score}`}</p>
          </div>`
        )
        .join('')
    : '<p class="state">还没有对话事件。</p>';
}

function render() {
  if (!state.session) return;
  $('#sessionId').textContent = state.session.sessionId;
  $('#stageLabel').textContent = state.stageLabels[state.session.stageHistory.at(-1).stage] || '—';
  $('#stageGuide').textContent = state.guide ? `本阶段讲解：${state.guide.text}` : '';
  $('#sampleSelect').value = state.session.sampleId;
  for (const radio of document.querySelectorAll('input[name="route"]')) {
    radio.checked = radio.value === state.session.route;
  }
  renderSampleInfo();
  renderStageRail();
  renderSuggestions();
  renderMemory();
  renderTimeline();
  renderHistory().catch((error) => setStatus(`历史建议读取失败：${error.message}`));
}

async function createSession() {
  const sampleId = $('#sampleSelect').value || state.samples[0]?.id;
  const route = document.querySelector('input[name="route"]:checked')?.value || 'zh';
  const data = await api('/api/dialog/session', {
    method: 'POST',
    body: JSON.stringify({sampleId, route}),
  });
  state.session = data.session;
  state.lastSuggestions = [];
  state.guide = data.session.stageHistory.length
    ? state.samples.find((item) => item.id === data.session.sampleId)?.stageGuide?.[0]
    : null;
  setStatus('新会话已开始，阶段重置为问候。');
  render();
}

async function switchRoute(route) {
  if (!state.session || state.session.route === route) return;
  const data = await api('/api/dialog/route', {
    method: 'POST',
    body: JSON.stringify({sessionId: state.session.sessionId, route}),
  });
  state.session = data.session;
  state.guide = data.guide;
  setStatus(`已切换到${route === 'en' ? '英语' : '中文'}路线，当前会话与阶段保留。`);
  render();
}

async function sendTurn() {
  if (!state.session) return;
  const content = $('#contentInput').value.trim();
  if (!content) return setStatus('请先输入一句话。');
  const payload = {
    sessionId: state.session.sessionId,
    actorId: $('#actorSelect').value,
    audienceId: $('#audienceSelect').value,
    content,
  };
  try {
    const data = await api('/api/dialog/turn', {method: 'POST', body: JSON.stringify(payload)});
    state.session = data.session;
    state.lastSuggestions = data.event.suggestedActions || [];
    state.guide = data.guide;
    if (data.labels) {
      state.entityLabels = data.labels.entityTypes || state.entityLabels;
      state.relationLabels = data.labels.relationTypes || state.relationLabels;
    }
    $('#contentInput').value = '';
    setStatus(
      `已记录：${identityName(payload.actorId)} → ${identityName(payload.audienceId)}；抽取实体 ${data.event.entities.length} 个、关系 ${data.event.relations.length} 个，生成建议 ${state.lastSuggestions.length} 条。`
    );
    render();
  } catch (error) {
    setStatus(`发送失败：${error.message}`);
  }
}

async function confirmSuggestion(suggestionId, accepted) {
  try {
    const data = await api('/api/dialog/confirm', {
      method: 'POST',
      body: JSON.stringify({sessionId: state.session.sessionId, suggestionId, accepted}),
    });
    state.session.memory = data.memory;
    setStatus(accepted ? `已写入记忆：${data.record ? data.record.title : '已存在，未重复写入'}。` : '已拒绝该建议，未写入记忆。');
    render();
  } catch (error) {
    setStatus(`确认失败：${error.message}`);
  }
}

async function rewind() {
  try {
    const data = await api('/api/dialog/rewind', {
      method: 'POST',
      body: JSON.stringify({sessionId: state.session.sessionId}),
    });
    state.session = data.session;
    state.guide = data.guide;
    state.lastSuggestions = [];
    setStatus('已回退到上一阶段；历史事件保留，可重新讲解或继续。');
    render();
  } catch (error) {
    setStatus(`回退失败：${error.message}`);
  }
}

async function advance() {
  try {
    const data = await api('/api/dialog/advance', {
      method: 'POST',
      body: JSON.stringify({sessionId: state.session.sessionId}),
    });
    state.session = data.session;
    state.guide = data.guide;
    state.lastSuggestions = [];
    setStatus(`已进入${data.stageLabel}阶段。`);
    render();
  } catch (error) {
    setStatus(`推进失败：${error.message}`);
  }
}

function replay() {
  if (!state.guide) return;
  setStatus(`重新讲解：${state.guide.text}`);
  render();
}

async function init() {
  const data = await api('/api/dialog/samples');
  state.samples = data.samples;
  state.agents = data.agents;
  state.stageLabels = data.labels.stages;
  state.actionLabels = data.labels.actions;
  state.entityLabels = {person: '人物', project: '项目', place: '地点', time: '时间', need: '需求'};
  state.relationLabels = {owns: '拥有', works_on: '参与', located_at: '位于', needs: '需要'};
  renderSamples();
  renderSelectors();
  renderAgents();
  await createSession();
}

$('#sampleSelect').addEventListener('change', () => createSession().catch((error) => setStatus(error.message)));
$('#newSession').addEventListener('click', () => createSession().catch((error) => setStatus(error.message)));
document.querySelectorAll('input[name="route"]').forEach((node) =>
  node.addEventListener('change', () => switchRoute(node.value).catch((error) => setStatus(error.message)))
);
$('#sendTurn').addEventListener('click', () => sendTurn());
$('#contentInput').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) sendTurn();
});
$('#rewind').addEventListener('click', () => rewind());
$('#replay').addEventListener('click', () => replay());
$('#advance').addEventListener('click', () => advance());
$('#suggestionList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-confirm]');
  if (!button) return;
  confirmSuggestion(button.dataset.confirm, button.dataset.accepted === 'true');
});

init().catch((error) => setStatus(`初始化失败：${error.message}`));