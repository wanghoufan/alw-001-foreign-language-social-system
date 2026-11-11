/* N06 独立 HTML 原型交互
 * 仅浏览器本地演示：不联网、不写生产数据库、不调用云端 AI/TTS。
 */
(function () {
  'use strict';

  const N = window.N06;
  const $ = (s, root) => (root || document).querySelector(s);
  const $$ = (s, root) => Array.from((root || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const TODAY = todayStr();
  const IMG_ROOT = '../../../成果整理/Hainan-Travel-Guide/images/';
  const TOPICS = [['festival', '节日'], ['daily', '日常生活'], ['culture', '文化习俗'], ['fitness', '健身运动'], ['works', '我的作品'], ['more', '更多']];
  const CITIES = ['全部', ...Array.from(new Set(N.places.map(p => p.city)))];
  const TOPIC_TITLE = { festival: '节日话题', daily: '日常生活', culture: '文化习俗', fitness: '健身运动', works: '我的作品', more: '更多' };

  const S = {
    tab: 'topics', sub: 'festival', placeId: null, workId: null, personId: null,
    win: '14d', region: '全部', themeFilter: '全部',
    hainanCity: '全部', qHainan: '', qWorks: '', qSelf: '', worksCat: '全部', selfCat: '全部',
    works: N.works.map(w => ({ ...w })),
    stories: N.stories.map(s => ({ ...s })),
    records: {}, currentSeg: {}, expanded: {},
    chat: {
      person: 'oliver', topic: '', listening: false, sent: 0, extra: {}
    },
    import: { mode: 'all', text: '', parsed: null, placeId: null, error: '' },
    lbIndex: -1, themeMode: 'system'
  };
  N.places.forEach(p => { S.records[p.id] = JSON.parse(JSON.stringify(p.records || [])); });

  /* ---------- 工具 ---------- */
  function photoUrl(p, slot) {
    return encodeURI(IMG_ROOT + p.cityFolder + '/' + String(p.id).padStart(3, '0') + '/0' + slot + '.webp');
  }
  /* 槽位三种状态：ok＝有归档且未被排除；excluded＝清单记录与地点不符/来源未登记，禁止展示；
   * missing＝没有归档。excluded 与 missing 都必须出明确提示，不能拿别处图片补。 */
  function exclusionFor(p, slot) {
    return (p.photoExclusions || []).filter(x => x.slot === slot)[0] || null;
  }
  function slotState(p, slot) {
    if (p.photos.indexOf(slot) >= 0) return 'ok';
    return exclusionFor(p, slot) ? 'excluded' : 'missing';
  }
  function excludedCount(p) { return (p.photoExclusions || []).length; }
  function missingCount(p) {
    let n = 0;
    for (let slot = 1; slot <= p.declaredPhotos; slot++) if (slotState(p, slot) === 'missing') n++;
    return n;
  }
  function exclusionText(p, slot) {
    const ex = exclusionFor(p, slot);
    if (!ex) return '';
    return ex.reason + '（待重新采集，不用与地点不符的图片冒充）';
  }
  function fmtSlots(list) {
    const a = list.slice().sort((x, y) => x - y);
    if (!a.length) return '';
    if (a.length === 1) return String(a[0]);
    const ranges = [];
    let start = a[0], prev = a[0];
    for (let i = 1; i < a.length; i++) {
      if (a[i] === prev + 1) { prev = a[i]; }
      else { ranges.push(start === prev ? String(start) : start + '–' + prev); start = prev = a[i]; }
    }
    ranges.push(start === prev ? String(start) : start + '–' + prev);
    return ranges.join('、');
  }
  /* 来源只写实际存在的槽位：可用、按清单排除、无归档分别列出，
   * 不再统一写 01–03，避免让人以为三个源文件都存在。 */
  function sourceLine(p) {
    const ok = [], ex = [], miss = [];
    for (let slot = 1; slot <= p.declaredPhotos; slot++) {
      const state = slotState(p, slot);
      if (state === 'ok') ok.push(pad(slot) + '.webp');
      else if (state === 'excluded') ex.push(slot);
      else miss.push(slot);
    }
    const parts = [];
    if (ok.length) parts.push(`现有归档 ${ok.join('、')}`);
    if (ex.length) parts.push(`第 ${fmtSlots(ex)} 张按清单记录排除`);
    if (miss.length) parts.push(`第 ${fmtSlots(miss)} 张无归档`);
    if (!ok.length) parts.push('本页没有可用照片，待重新采集');
    const caveatSlots = Object.keys(p.photoCaveats || {}).map(Number).filter(s => ok.includes(pad(s) + '.webp'));
    if (caveatSlots.length) parts.push(`第 ${fmtSlots(caveatSlots)} 张主题待核实`);
    return '来源：' + parts.join('；') + '。';
  }
  function copyText(text, okMsg) {
    const done = () => toast(okMsg || '已复制');
    const fail = () => toast('复制失败，请长按选择文本');
    try {
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done, fail));
      else fallbackCopy(text, done, fail);
    } catch (e) { fallbackCopy(text, done, fail); }
  }
  /* 系统分享可用就调起；不可用或失败时复制原文，并明确告知当前环境没有系统分享。 */
  function shareOrCopy(title, text) {
    if (navigator.share) {
      navigator.share({ title, text }).then(() => toast('已调起系统分享')).catch(() => {
        copyText(text, '未完成系统分享，已复制内容');
      });
    } else {
      copyText(text, '当前环境不支持系统分享，已复制内容');
    }
  }
  function fallbackCopy(text, done, fail) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    ok ? done() : fail();
  }
  function speak(text) {
    if (!('speechSynthesis' in window)) { toast('当前浏览器不支持演示朗读'); return; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = /[\u4e00-\u9fa5]/.test(text) ? 'zh-CN' : 'en-US';
      u.rate = 0.94;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
      toast('浏览器演示朗读 · 不是豆包/TTS 验收');
    } catch (e) { toast('演示朗读不可用'); }
  }
  /* 图片状态只分三种：ok＝有像素；failed＝解码完成但宽度为 0；pending＝仍在加载。
   * 只有 failed 才隐藏图片、亮出缺图提示；pending 永远不判定为缺图。
   * 加载超过 3 秒只显示“加载较慢”的小提示，不遮挡、不隐藏图片。 */
  function imgFallback(img) {
    return img && img.parentElement ? img.parentElement.querySelector('.fallback') : null;
  }
  function imgSlow(img) {
    return img && img.parentElement ? img.parentElement.querySelector('.slowhint') : null;
  }
  window.__n06ImgState = function (img) {
    if (img && img.complete && img.naturalWidth > 0) return 'ok';
    if (img && img.complete && img.naturalWidth === 0) return 'failed';
    return 'pending';
  };
  window.__n06ImgError = function (img) {
    var slowTimer = null, poll = null;
    var settle = function () {
      var state = window.__n06ImgState(img);
      var fb = imgFallback(img), slow = imgSlow(img);
      if (state === 'ok') { window.__n06ImgLoad(img); return true; }
      if (state === 'failed') {
        img.style.display = 'none';
        if (fb) { fb.hidden = false; fb.dataset.state = 'failed'; }
        if (slow) slow.hidden = true;
        return true;
      }
      return false;
    };
    if (settle()) return;
    slowTimer = setTimeout(function () {
      if (settle()) return;
      var slow = imgSlow(img);
      if (slow) slow.hidden = false;
      poll = setInterval(function () {
        if (settle()) { clearInterval(poll); poll = null; }
      }, 300);
      setTimeout(function () { if (poll) { clearInterval(poll); poll = null; } }, 60000);
    }, 3000);
    if (img.addEventListener) {
      img.addEventListener('load', function () {
        clearTimeout(slowTimer);
        if (poll) clearInterval(poll);
        window.__n06ImgLoad(img);
      });
    }
  };
  window.__n06ImgLoad = function (img) {
    img.style.display = '';
    var fb = imgFallback(img);
    if (fb) { fb.hidden = true; fb.dataset.state = 'ok'; }
    var slow = imgSlow(img);
    if (slow) slow.hidden = true;
  };
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }
  function setTheme(mode) {
    S.themeMode = mode;
    let dark = mode === 'dark';
    if (mode === 'system') dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#122228' : '#eef3ef');
    try { localStorage.setItem('n06.theme', mode); } catch (e) {}
    const b = $('[data-act="theme"]');
    if (b) b.textContent = dark ? '☀' : '☾';
    if ($('#modal').classList.contains('on') && $('#themeSheet')) renderThemeSheet();
  }
  function applyStoredTheme() {
    let m = 'light';
    try { m = localStorage.getItem('n06.theme') || 'system'; } catch (e) {}
    setTheme(m);
  }
  function scrollTop() {
    window.scrollTo(0, 0);
    const app = $('#app'); if (app) app.scrollTop = 0;
  }
  function openModal(html) {
    const body = $('#modalBody'); if (!body) return;
    body.innerHTML = html;
    $('#modal').classList.add('on');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal').classList.remove('on');
    $('#modalBody').innerHTML = '';
    document.body.style.overflow = '';
  }
  function openSheet(title, inner) {
    openModal(`<div class="modal-head"><h2>${title}</h2><button class="iconbutton" type="button" data-act="modal-close" aria-label="关闭">✕</button></div><div class="sheet-body">${inner}</div>`);
  }
  function themeIcon() { return document.documentElement.dataset.theme === 'dark' ? '☀' : '☾'; }

  /* ---------- 日期 ---------- */
  function parseD(s) { if (!s) return null; const a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2], 12, 0, 0); }
  function addDays(s, n) { const d = parseD(s); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function nextDate(f) { if (!f.y2026 && !f.y2027) return null; if (f.y2026 && f.y2026 >= TODAY) return f.y2026; return f.y2027 || f.y2026; }
  function festivalList() {
    const all = N.festivals.slice().filter(f => {
      if (S.region !== '全部' && f.region !== S.region) return false;
      if (S.themeFilter !== '全部' && f.theme !== S.themeFilter) return false;
      return true;
    });
    const out = all.filter(f => {
      if (S.win === 'all') return true;
      const d = nextDate(f); if (!d) return false;
      if (S.win === 'today') return d === TODAY;
      if (S.win === '14d') return d >= TODAY && d <= addDays(TODAY, 14);
      if (S.win === 'month') return d.slice(0, 7) === TODAY.slice(0, 7);
      return true;
    });
    return out.sort((a, b) => String(nextDate(a) || '9999').localeCompare(String(nextDate(b) || '9999')));
  }
  function winLabel() { return { today: '今天', '14d': '未来 14 天', month: '本月', all: '全部' }[S.win] || '全部'; }

  /* ---------- 路由 ---------- */
  function parseRoute() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    const tabs = ['topics', 'hainan', 'chat', 'self', 'people'];
    S.tab = tabs.includes(parts[0]) ? parts[0] : 'topics';
    S.placeId = null; S.workId = null; S.personId = null; S.lbIndex = -1;
    if (S.tab === 'topics') {
      S.sub = TOPICS.some(t => t[0] === parts[1]) ? parts[1] : 'festival';
      if (S.sub === 'works' && parts[2] && S.works.some(w => w.id === parts[2])) S.workId = parts[2];
    }
    if (S.tab === 'hainan') {
      if (parts[1] && N.places.some(p => String(p.id) === parts[1])) S.placeId = Number(parts[1]);
      if (S.placeId && parts[2] === 'full') {
        const n = Number(parts[3]);
        if (n >= 1) S.lbIndex = n - 1;
      }
    }
    if (S.tab === 'people' && parts[1] && N.people.some(p => p.slug === parts[1])) S.personId = parts[1];
  }
  function go(hash) {
    if (location.hash === hash) { parseRoute(); render(); return; }
    location.hash = hash;
  }
  function parentHash() {
    if (S.tab === 'hainan' && S.placeId) return '#hainan';
    if (S.tab === 'topics' && S.workId) return '#topics/works';
    if (S.tab === 'people' && S.personId) return '#people';
    if (S.tab === 'topics' && S.sub !== 'festival') return '#topics/festival';
    return '#topics/festival';
  }

  /* ---------- 顶栏与 Tab ---------- */
  function renderHeader() {
    const top = $('#topbar');
    let kicker = '话题 · 示范', title = TOPIC_TITLE[S.sub] || '话题', back = '';
    if (S.tab === 'hainan') { kicker = '海南 · 示范图库'; title = '地点'; }
    if (S.tab === 'chat') { kicker = '聊天 · 固定示例'; title = '对话练习'; }
    if (S.tab === 'self') { kicker = '关于我'; title = '我的介绍'; }
    if (S.tab === 'people') { kicker = '人物'; title = '聊过的人'; }
    if (S.tab === 'hainan' && S.placeId) {
      const p = N.places.find(x => x.id === S.placeId);
      kicker = `海南 · ${p.city}`; title = '地点详情'; back = '<button class="iconbutton" type="button" data-act="back" aria-label="返回">‹</button>';
    }
    if (S.tab === 'topics' && S.workId) {
      const w = S.works.find(x => x.id === S.workId);
      kicker = '我的作品'; title = '作品详情'; back = '<button class="iconbutton" type="button" data-act="back" aria-label="返回">‹</button>';
    }
    if (S.tab === 'people' && S.personId) {
      const p = N.people.find(x => x.slug === S.personId);
      kicker = '人物 · 虚构演示'; title = '人物详情'; back = '<button class="iconbutton" type="button" data-act="back" aria-label="返回">‹</button>';
    }
    let bar = '';
    if (S.tab === 'topics' && !S.workId) {
      bar = `<div class="chipbar" role="tablist" aria-label="话题分类">${TOPICS.map(([k, v]) => `<button class="chip ${S.sub === k ? 'on' : ''}" type="button" role="tab" aria-selected="${S.sub === k}" data-topic="${k}">${v}</button>`).join('')}</div>`;
    }
    top.innerHTML = `<div class="topline">${back}<div class="pagehead"><span class="kicker">${esc(kicker)}</span><h1>${esc(title)}</h1></div><span class="demo-pill"><i></i>示范</span><button class="iconbutton" type="button" data-act="theme" aria-label="切换浅色深色">${themeIcon()}</button><button class="iconbutton" type="button" data-act="more" aria-label="更多设置">···</button></div>${bar}`;
    $$('.tabbtn').forEach(b => b.classList.toggle('on', b.dataset.nav === S.tab));
    if (S.tab === 'topics' && !S.workId) {
      requestAnimationFrame(() => {
        const bar = $('#topbar .chipbar');
        const on = bar && bar.querySelector('.chip.on');
        if (!bar || !on) return;
        on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (bar.scrollLeft <= 0) return;
        const cs = getComputedStyle(bar);
        const pad = parseFloat(cs.paddingLeft) || 0;
        const gap = parseFloat(cs.columnGap) || 0;
        const edge = bar.scrollLeft + pad;
        const firstFull = Array.from(bar.children).find(c => c.offsetLeft >= edge - 0.5);
        if (firstFull) bar.scrollLeft = Math.max(bar.scrollLeft, firstFull.offsetLeft - gap);
      });
    }
    const view = $('#view');
    view.classList.toggle('flush', S.tab === 'chat');
  }

  /* ---------- 首页渲染 ---------- */
  function render() {
    parseRoute();
    renderHeader();
    if (!(S.tab === 'hainan' && S.placeId && S.lbIndex >= 0)) {
      const lb = $('#lightbox');
      if (lb && lb.classList.contains('on')) { lb.classList.remove('on'); document.body.style.overflow = ''; }
    }
    const view = $('#view');
    if (S.tab === 'topics') view.innerHTML = renderTopics();
    else if (S.tab === 'hainan') view.innerHTML = S.placeId ? renderPlaceDetail() : renderHainanList();
    else if (S.tab === 'chat') view.innerHTML = renderChat();
    else if (S.tab === 'self') view.innerHTML = renderSelf();
    else if (S.tab === 'people') view.innerHTML = S.personId ? renderPersonDetail() : renderPeopleList();
    bindAfterRender();
    if (S.lbIndex >= 0) setTimeout(() => showLightbox(S.lbIndex, false), 30);
  }

  function demoNotice(text) {
    return `<div class="notice"><span class="dot"></span><div><b>示范原型</b> · ${text}</div></div>`;
  }

  /* ---------- 话题：节日 ---------- */
  function renderTopics() {
    if (S.workId) return renderWorkDetail();
    if (S.sub === 'festival') return renderFestival();
    if (S.sub === 'works') return renderWorks();
    if (S.sub === 'more') return renderMore();
    return renderTopicPack();
  }

  function renderFestival() {
    const list = festivalList();
    const regions = ['全部', ...Array.from(new Set(N.festivals.map(f => f.region)))];
    const themes = ['全部', ...Array.from(new Set(N.festivals.map(f => f.theme)))];
    const nextAll = N.festivals.slice().sort((a, b) => String(nextDate(a) || '9999').localeCompare(String(nextDate(b) || '9999')))[0];
    return `
      ${demoNotice(`节日日期、民俗与问句是待核实样本；未核实日期不显示倒计时，也不会推送提醒。今天按本机日期 <b>${TODAY}</b> 计算。`)}
      <div class="chipbar" style="padding:0 0 10px" aria-label="日期范围">
        ${[['today', '今天'], ['14d', '未来 14 天'], ['month', '本月'], ['all', '全部']].map(([k, v]) => `<button class="chip ${S.win === k ? 'on' : ''}" type="button" data-window="${k}">${v}</button>`).join('')}
      </div>
      <div class="toolbar">
        <select class="select grow" id="regionFilter" aria-label="国家或地区">${regions.map(r => `<option value="${esc(r)}" ${S.region === r ? 'selected' : ''}>${esc(r === '全部' ? '全部地区' : r)}</option>`).join('')}</select>
        <select class="select grow" id="themeFilter" aria-label="主题">${themes.map(t => `<option value="${esc(t)}" ${S.themeFilter === t ? 'selected' : ''}>${esc(t === '全部' ? '全部主题' : t)}</option>`).join('')}</select>
      </div>
      <div class="section-head"><h2>${winLabel()}</h2><span class="count" id="festivalCount">${list.length} 个候选样本</span></div>
      <div id="festivalList">${festivalCards(list, nextAll)}</div>
      <p class="footer-note">候选 ${N.festivals.length} 个：日期已核对 ${N.festivals.filter(f => f.status === 'fixed').length} 个、待确认 ${N.festivals.filter(f => f.status === 'pending').length} 个。节日本日与公共假期分开标注；未核实日期不显示倒计时，也不推送提醒。</p>`;
  }

  function festivalCards(list, nextAll) {
    if (!list.length) {
      const nd = nextAll && nextDate(nextAll);
      return `<div class="card empty"><b>这个范围没有匹配的节日</b><div>${nd ? `最近的示范样本是「${esc(nextAll.cn)}」，下一次 ${esc(nextDate(nextAll))}。` : '调整筛选看看。'}</div><button class="btn soft" type="button" data-window="all">看全部示范样本</button></div>`;
    }
    return list.map(f => {
      const d = nextDate(f);
      const past26 = f.y2026 && f.y2026 < TODAY;
      const q = (f.questions || []).map(x => `<div class="q"><div>${esc(x.cn)}</div><div class="en">${esc(x.en)}</div></div>`).join('');
      const typeLabel = { festival_day: '节日本日', public_holiday: '公共假期', makeup_workday: '调休上班日', observance: '纪念 / 观察日' }[f.holidayType] || '节日本日';
      const urls = f.sourceUrls || [];
      const srcText = urls.length ? urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noreferrer">${esc(u)}</a>`).join('<br>') : '来源待补';
      const related = (f.relatedPlaceIds || []).length ? f.relatedPlaceIds.join('、') : '无';
      return `<article class="card festival-card">
        <div class="top">
          <div><h3>${esc(f.cn)}</h3><div class="en">${esc(f.en)}</div></div>
          <div class="fest-pills"><span class="pill line">${esc(typeLabel)}</span>${f.status === 'pending' ? '<span class="pill warn">日期待确认</span>' : '<span class="pill line">日期已核对</span>'}</div>
        </div>
        <p class="brief">${esc(f.briefCn)}</p>
        <p class="brief en">${esc(f.briefEn)}</p>
        <div class="dates">
          <span class="date-chip ${f.y2026 && f.y2026 === d ? 'next' : ''}">${esc(f.y2026 || '待定')}${past26 ? ' · 已过' : ''}</span>
          <span class="date-chip ${f.y2027 && f.y2027 === d ? 'next' : ''}">${esc(f.y2027 || '待定')}</span>
        </div>
        <details>
          <summary>看 ${(f.questions || []).length} 条话题句与来源</summary>
          <div class="qwrap">${q}</div>
          <div class="fest-src"><div class="meta">核实日期：${esc(f.verifiedAt || '未核实')} · 关联地点 id：${esc(related)}</div><div class="meta" style="margin-top:4px;word-break:break-all">${srcText}</div></div>
        </details>
        <div class="footer">
          <span class="meta">${esc(f.region)} · ${esc(f.theme)} · ${esc(f.dateRule)}</span>
          <button class="btn small soft" type="button" data-act="copy" data-copy="${esc((f.questions || []).map(x => x.cn + ' ' + x.en).join('\n'))}">复制问句</button>
        </div>
      </article>`;
    }).join('');
  }

  function renderTopicPack() {
    const packs = {
      daily: [
        { cn: '你今天过得怎么样？', en: 'How has your day been so far?', tag: '开场' },
        { cn: '你平时下班后一般做什么？', en: 'What do you usually do after work?', tag: '日常' },
        { cn: '这周有什么让你开心的小事？', en: 'What was one small good thing this week?', tag: '近况' }
      ],
      culture: [
        { cn: '你家乡有什么别人不太知道的习惯？', en: 'Is there a local habit from home that visitors might not know about?', tag: '文化' },
        { cn: '你们家过节时一定会做哪件事？', en: 'Is there something your family always does for a holiday?', tag: '家庭' },
        { cn: '你更喜欢热闹的庆祝还是安静地过？', en: 'Do you prefer a big celebration or a quiet one?', tag: '选择' }
      ],
      fitness: [
        { cn: '你最近在练什么？', en: 'What have you been training for recently?', tag: '训练' },
        { cn: '你更喜欢早上运动还是晚上运动？', en: 'Do you prefer exercising in the morning or in the evening?', tag: '习惯' },
        { cn: '你会给自己设具体目标吗？', en: 'Do you set specific goals for yourself?', tag: '目标' }
      ]
    }[S.sub] || [];
    return `
      ${demoNotice('这一组是固定示范话题包；本原型没有完整节日候选清单，也未接入完整节日数据；问句可直接复制。')}
      <div class="section-head"><h2>${TOPIC_TITLE[S.sub]}</h2><span class="count">${packs.length} 条示范</span></div>
      ${packs.map(x => `<article class="card pad stack">
        <div class="row between"><span class="pill">${esc(x.tag)}</span><span class="meta">示范话题句</span></div>
        <div><div style="font-size:19px">${esc(x.cn)}</div><div style="font-size:18px;color:var(--muted);margin-top:3px">${esc(x.en)}</div></div>
        <div class="btnrow"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(x.cn + '\n' + x.en)}">复制</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(x.en)}">朗读英文</button></div>
      </article>`).join('')}
      <p class="footer-note">话题结构已留出扩展位；本页不冒充完整节日数据。</p>`;
  }

  function renderMore() {
    return `
      ${demoNotice('这里是原型的范围说明与入口，不是正式产品页面。')}
      <article class="card pad stack">
        <h3>原「软件」已经放进话题</h3>
        <p>一级 Tab 现在是「话题｜海南｜聊天｜关于我｜人物」。原软件库的搜索、分类、新建、回收站、复制与中英介绍，迁到「话题 &gt; 我的作品」，不是一张链接卡。</p>
        <div class="btnrow"><button class="btn primary" type="button" data-topic="works">打开我的作品</button><button class="btn" type="button" data-act="open-diff">差异说明在哪</button></div>
      </article>
      <article class="card pad stack">
        <h3>数据边界</h3>
        <p>地点长文、双语问题、节日日期与人物内容全部标为示范或待核实；原型不写生产数据库、不覆盖正式 APP，也不把浏览器朗读当作豆包验收。</p>
      </article>
      <article class="card pad stack">
        <h3>本原型包含</h3>
        <p>海南列表封面 → 3 图详情 → 全屏；整篇/单段粘贴预览与段落切换；节日按日期、地区、主题筛选；我的作品（含 B/C 分类示范与分享）；聊天按人物切换固定示例、分享换题；关于我搜索分类；人物续聊档案；浅色/深色。</p>
      </article>
      <article class="card pad stack">
        <h3>聊天为什么是固定示例</h3>
        <p>本原型不联网、不调用云端 AI，也不采集麦克风。聊天页每个虚构人物各有一套固定对话、接话与追问；切换人物会换样本，但不会根据你输入的内容实时理解或生成。页面上的「接话 / 追问」都标了固定示例与依据，不可当成 AI 实时能力。</p>
      </article>
      <p class="footer-note">${esc(N.meta.version)} · ${esc(N.meta.builtAt)} · 等待用户审查原型，未获正式 APP 改动授权。</p>`;
  }

  /* ---------- 我的作品 ---------- */
  function filteredWorks() {
    const q = S.qWorks.trim().toLowerCase();
    return S.works.filter(w => {
      if (w.recycled) return false;
      if (S.worksCat !== '全部' && w.cat !== S.worksCat) return false;
      if (q && !(w.name + ' ' + w.cn + ' ' + w.en + ' ' + w.id).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderWorks() {
    const list = filteredWorks();
    return `
      ${demoNotice('9 条现有演示作品均为 A 类；B/C 两条是本原型补的分类示范样本，用于证明分类筛选不是死路，不是生产数据，也不是已验收作品。')}
      <div class="toolbar">
        <div class="search"><span class="ico">⌕</span><input id="workSearch" value="${esc(S.qWorks)}" placeholder="搜索作品、中文或英文" aria-label="搜索作品"></div>
      </div>
      <div class="chipbar" style="padding:0 0 10px">
        ${['全部', 'A', 'B', 'C'].map(c => `<button class="chip ${S.worksCat === c ? 'on' : ''}" type="button" data-workcat="${c}">${c === '全部' ? '全部' : c + ' 类'}</button>`).join('')}
      </div>
      <div class="row between" style="margin:0 2px 9px">
        <span class="meta" id="workCount">${list.length} 个作品</span>
        <span class="btnrow"><button class="btn small soft" type="button" data-act="works-new">＋ 新建</button><button class="btn small" type="button" data-act="works-recycle">回收站 ${S.works.filter(w => w.recycled).length}</button></span>
      </div>
      <div id="workList">${workCards(list)}</div>
      <p class="footer-note">搜索、分类、新建、回收站、复制、中英介绍、讲解步骤与分享均已保留为可点击原型；分享在浏览器不支持系统分享时改为复制。</p>`;
  }
  function workCards(list) {
    if (!list.length) return `<div class="card empty"><b>没有匹配的作品</b><div>换个关键词或分类试试。</div></div>`;
    return list.map(w => `<article class="card work-card" data-work="${esc(w.id)}">
      <div class="work-badge" style="background:${esc(w.color)}">${esc((w.name.match(/[A-Za-z\u4e00-\u9fa5]/) || ['S'])[0].toUpperCase())}</div>
      <div class="grow">
        <h3>${esc(w.name)}</h3>
        <div class="en">${esc(w.id)} · ${esc(w.cat)} 类 · ${w.demoAdded ? '分类示范补充' : '样本'}</div>
        <p class="cn">${esc(w.cn)}</p>
        <div class="foot"><span class="pill">中英介绍</span><span class="meta">点击看详情</span></div>
      </div>
    </article>`).join('');
  }
  function refreshWorkList() {
    const host = $('#workList'); if (!host) return;
    const list = filteredWorks();
    host.innerHTML = workCards(list);
    const c = $('#workCount'); if (c) c.textContent = list.length + ' 个作品';
  }
  function renderWorkDetail() {
    const w = S.works.find(x => x.id === S.workId);
    if (!w) return `<div class="card empty"><b>作品不存在</b></div>`;
    const steps = (w.steps || []).map(st => `<div class="card pad" style="box-shadow:none;margin-top:8px"><div class="pill">步骤 ${st.n}</div><div style="font-size:19px;margin-top:6px">${esc(st.cn)}</div>${st.detail ? `<div style="font-size:17px;color:var(--muted);margin-top:3px">${esc(st.detail)}</div>` : ''}<div lang="en" style="font-size:18px;margin-top:5px">${esc(st.en)}</div></div>`).join('');
    return `
      <div class="row between" style="margin-bottom:10px"><span class="pill">${esc(w.id)} · ${esc(w.cat)} 类</span><span class="meta">${w.demoAdded ? '分类示范补充' : '现有演示数据样本'}</span></div>
      <h2 style="margin-bottom:4px">${esc(w.name)}</h2>
      <div class="textbox"><h4>中文介绍</h4><p>${esc(w.cn)}</p></div>
      <div class="textbox"><h4>English</h4><p class="en" lang="en">${esc(w.en)}</p></div>
      <div class="detail-actions"><button class="btn soft" type="button" data-act="copy" data-copy="${esc(w.en)}">复制英文</button><button class="btn" type="button" data-act="speak" data-speak="${esc(w.en)}">朗读英文</button><button class="btn" type="button" data-act="work-share" data-id="${esc(w.id)}">分享作品</button><button class="btn" type="button" data-act="works-edit" data-id="${esc(w.id)}">编辑</button><button class="btn danger" type="button" data-act="works-recycle-one" data-id="${esc(w.id)}">移入回收站</button></div>
      ${steps ? `<div class="section-head"><h2>讲解步骤</h2><span class="count">${(w.steps || []).length} 步</span></div>${steps}` : ''}
      <p class="footer-note">状态说明：${esc(w.status)}。原型保留原有中英介绍与步骤结构；分享为原型内演示，不支持系统分享时自动复制。</p>`;
  }

  function workForm(w) {
    return `<div class="modal-head"><h2>${w ? '编辑作品' : '新建作品'}</h2><button class="iconbutton" type="button" data-act="modal-close" aria-label="关闭">✕</button></div>
      <div class="sheet-body">
        <label class="field"><span>名称（中英）</span><input id="workName" value="${esc(w ? w.name : '')}" placeholder="例：我的新作品 · My New App"></label>
        <label class="field"><span>中文介绍</span><textarea id="workCn" style="min-height:110px">${esc(w ? w.cn : '')}</textarea></label>
        <label class="field"><span>English</span><textarea id="workEn" style="min-height:110px">${esc(w ? w.en : '')}</textarea></label>
        <label class="field"><span>分类</span><select id="workCat"><option value="A" ${w && w.cat === 'A' ? 'selected' : ''}>A 类</option><option value="B" ${w && w.cat === 'B' ? 'selected' : ''}>B 类</option><option value="C" ${!w || w.cat === 'C' ? 'selected' : ''}>C 类</option></select></label>
        <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="works-save" data-id="${w ? esc(w.id) : ''}">保存</button><button class="btn" type="button" data-act="modal-close">取消</button></div>
        <p class="meta" style="margin-top:10px">原型保存只存在当前页面内存，刷新即恢复样本。</p>
      </div>`;
  }

  function openWorkShare(w) {
    openSheet('分享作品 · ' + esc(w.name), `<p class="meta">${esc(w.id)} · ${esc(w.cat)} 类 · ${w.demoAdded ? '分类示范补充' : '现有演示数据样本'}</p>
      <p class="meta" style="margin-top:6px">原型内分享：系统分享不可用时改为复制中英介绍；不生成图片卡片、不上传、不写生产数据。</p>
      <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="work-share-native" data-id="${esc(w.id)}">调起系统分享</button><button class="btn soft" type="button" data-act="work-share-copy" data-id="${esc(w.id)}">复制中英介绍</button><button class="btn" type="button" data-act="modal-close">关闭</button></div>
      <div class="textbox" style="margin-top:12px"><h4>分享内容预览</h4><p>${esc(w.cn)}</p><p class="en" lang="en" style="margin-top:8px">${esc(w.en)}</p></div>`);
  }
  function workShareText(w) { return w.name + '\n\n' + w.cn + '\n\n' + w.en; }


  /* ---------- 关于我 ---------- */
  function filteredStories() {
    const q = S.qSelf.trim().toLowerCase();
    return S.stories.filter(s => {
      if (S.selfCat !== '全部' && s.cat !== S.selfCat) return false;
      if (q && !(s.title + ' ' + s.cn + ' ' + s.en + ' ' + s.cat).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderSelf() {
    const list = filteredStories();
    const cats = ['全部', ...Array.from(new Set(S.stories.map(s => s.cat)))];
    return `
      ${demoNotice('关于我保持中英直接可见；搜索框与分类标签保留。这里是原型可编辑样本。')}
      <div class="toolbar">
        <div class="search"><span class="ico">⌕</span><input id="selfSearch" value="${esc(S.qSelf)}" placeholder="搜索我的介绍" aria-label="搜索关于我"></div>
        <button class="btn soft" type="button" data-act="story-add">＋ 新增</button>
      </div>
      <div class="chipbar" style="padding:0 0 10px">${cats.map(c => `<button class="chip ${S.selfCat === c ? 'on' : ''}" type="button" data-selfcat="${c}">${c}</button>`).join('')}</div>
      <div class="section-head"><h2>可直接说给朋友听</h2><span class="count" id="selfCount">${list.length} 条</span></div>
      <div id="storyList">${storyCards(list)}</div>
      <p class="footer-note">中英都默认展示；不出现「中英双语」这类空占位标题。未核实的新内容请自行判断后再用于正式版。</p>`;
  }
  function storyCards(list) {
    if (!list.length) return `<div class="card empty"><b>没有匹配内容</b><div>换个关键词或分类。</div></div>`;
    return list.map(s => `<article class="card story-card">
      <div class="head"><h3>${esc(s.title)}</h3><span class="pill">${esc(s.cat)}</span></div>
      <p class="cn">${esc(s.cn)}</p>
      <p class="en" lang="en">${esc(s.en)}</p>
      <div class="foot"><span class="meta">${s.demoEdited ? '原型内已编辑' : '现有演示数据'}</span><span class="btnrow"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(s.cn + '\n' + s.en)}">复制</button><button class="btn small" type="button" data-act="story-edit" data-id="${esc(s.id)}">编辑</button></span></div>
    </article>`).join('');
  }
  function refreshStoryList() {
    const host = $('#storyList'); if (!host) return;
    const list = filteredStories();
    host.innerHTML = storyCards(list);
    const c = $('#selfCount'); if (c) c.textContent = list.length + ' 条';
  }
  function storyForm(s) {
    return `<div class="modal-head"><h2>${s ? '编辑介绍' : '新增介绍'}</h2><button class="iconbutton" type="button" data-act="modal-close" aria-label="关闭">✕</button></div>
      <div class="sheet-body">
        <label class="field"><span>标题</span><input id="storyTitle" value="${esc(s ? s.title : '')}" placeholder="例：我周末常去的地方"></label>
        <label class="field"><span>分类</span><select id="storyCat">${['生活', '经历', '兴趣'].map(c => `<option ${s && s.cat === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <label class="field"><span>中文</span><textarea id="storyCn" style="min-height:100px">${esc(s ? s.cn : '')}</textarea></label>
        <label class="field"><span>English</span><textarea id="storyEn" style="min-height:100px">${esc(s ? s.en : '')}</textarea></label>
        <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="story-save" data-id="${s ? esc(s.id) : ''}">保存</button><button class="btn" type="button" data-act="modal-close">取消</button></div>
        <p class="meta" style="margin-top:10px">原型保存只存在当前页面，刷新即恢复样本。</p>
      </div>`;
  }

  /* ---------- 海南 ---------- */
  function filteredPlaces() {
    const q = S.qHainan.trim().toLowerCase();
    return N.places.filter(p => {
      if (S.hainanCity !== '全部' && p.city !== S.hainanCity) return false;
      if (q && !(p.cnName + ' ' + p.enName + ' ' + p.city + ' ' + p.category + ' ' + p.introCn).toLowerCase().includes(q)) return false;
      return true;
    });
  }
  function renderHainanList() {
    const list = filteredPlaces();
    return `
      ${demoNotice('封面与详情共用同一批归档图：清单记录与地点不符、或来源未登记的已排除并显示待核实；其余图片仅有清单记录、未逐张重开来源页核验。地点长文为示范改写，开放、门票、店家等动态信息待核实。')}
      <div class="search"><span class="ico">⌕</span><input id="hainanSearch" value="${esc(S.qHainan)}" placeholder="搜索地点、城市或分类" aria-label="搜索海南地点"></div>
      <div class="chipbar" style="padding:10px 0 4px">
        ${CITIES.map(c => `<button class="chip ${S.hainanCity === c ? 'on' : ''}" type="button" data-city="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <div class="section-head"><h2>地点</h2><span class="count" id="hainanCount">${list.length} 个示范地点</span></div>
      <div id="hainanList">${placeCards(list)}</div>
      <p class="footer-note">原型载入 ${N.places.length} 个地点样本（现有数据集 115 个），不是完整清单。图片来自仓库 <span class="mono">docs/成果整理/Hainan-Travel-Guide/images</span>，未重新下载；按清单记录排除的图片不展示，其余图片来源待核实。</p>`;
  }
  function placeCards(list) {
    if (!list.length) return `<div class="card empty"><b>没有匹配地点</b><div>换个关键词或城市。</div></div>`;
    return list.map(p => {
      const cover = p.photos.length
        ? `<img src="${photoUrl(p, p.photos[0])}" alt="${esc(p.cnName)} 封面" onload="__n06ImgLoad(this)" onerror="__n06ImgError(this)">
        <span class="fallback" hidden>封面加载失败<br>真实缺图</span><span class="slowhint" hidden>加载较慢，仍在等待…</span>`
        : `<span class="fallback">暂无可用照片<br>来源待核实</span>`;
      const count = p.photos.length
        ? (p.photos.length === p.declaredPhotos ? `${p.photos.length} 图` : `${p.photos.length} / ${p.declaredPhotos} 图`)
        : `0 图 · 待核实`;
      return `<article class="card place-card" data-place="${p.id}">
      <div class="place-cover">
        ${cover}
        <span class="photo-count">${count}</span>
      </div>
      <div class="place-body">
        <h3>${esc(p.cnName)}</h3>
        <div class="en">${esc(p.enName)}</div>
        <div class="meta">${esc(p.city)} · ${esc(p.category)}</div>
        <p class="excerpt">${esc(p.introCn)}</p>
      </div>
    </article>`;
    }).join('');
  }
  function refreshHainanList() {
    const host = $('#hainanList'); if (!host) return;
    const list = filteredPlaces();
    host.innerHTML = placeCards(list);
    const c = $('#hainanCount'); if (c) c.textContent = list.length + ' 个示范地点';
  }

  function renderPlaceDetail() {
    const p = N.places.find(x => x.id === S.placeId);
    if (!p) return `<div class="card empty"><b>地点不存在</b></div>`;
    const slides = [];
    for (let slot = 1; slot <= p.declaredPhotos; slot++) {
      const state = slotState(p, slot);
      if (state === 'ok') {
        slides.push(`<div class="slide" data-lb="${slot - 1}" data-act="lb-open"><img src="${photoUrl(p, slot)}" alt="${esc(p.cnName)} 照片 ${slot}" onload="__n06ImgLoad(this)" onerror="__n06ImgError(this)"><span class="fallback" hidden>这张图片加载失败<br>第 ${slot} 张 · 真实缺图提示</span><span class="slowhint" hidden>加载较慢，仍在等待…</span><span class="zoomhint">点击全屏</span></div>`);
      } else if (state === 'excluded') {
        slides.push(`<div class="slide"><span class="fallback">第 ${slot} 张已排除（待核实）<br><small>${esc(exclusionText(p, slot))}</small></span></div>`);
      } else {
        slides.push(`<div class="slide"><span class="fallback">第 ${slot} 张缺失（待补图）<br><small>不用其他地点图片冒充</small></span></div>`);
      }
    }
    const questions = (p.questions || []).map(q => `<div class="qcard"><div class="cn">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(q.en)}">朗读英文</button></div></div>`).join('');
    return `
      <div class="detail-hero">
        <div class="gallery-wrap">
          <div class="gallery" id="gallery" aria-label="${esc(p.cnName)} 照片">${slides.join('')}</div>
          <span class="gallery-count" id="galleryCount">1 / ${p.declaredPhotos}</span>
          <div class="gallery-nav">
            <div class="dots" id="galleryDots">${Array.from({ length: p.declaredPhotos }).map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>
            <div class="btnrow"><button class="btn small" type="button" data-act="gallery-prev">‹</button><button class="btn small" type="button" data-act="gallery-next">›</button></div>
          </div>
        </div>
        <div class="detail-head">
          <h2>${esc(p.cnName)}</h2>
          <div class="enname">${esc(p.enName)}</div>
          <div class="loc">${esc(p.locationCn)}<br><span lang="en">${esc(p.locationEn)}</span></div>
        </div>
      </div>
      <div class="detail-body">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <span class="pill ${p.photos.length < p.declaredPhotos ? 'warn' : ''}">可用照片 ${p.photos.length} / ${p.declaredPhotos} 张</span>
          ${excludedCount(p) ? `<span class="pill warn">已排除 ${excludedCount(p)} 张</span>` : ''}
          ${missingCount(p) ? `<span class="pill warn">缺图 ${missingCount(p)} 张</span>` : ''}
        </div>
        <p class="photo-hint">${p.photos.length
          ? `照片来源待核实：这 ${p.photos.length} 张图仅有清单记录，未逐张重开来源页核验。`
          : '本页没有可用照片：缺图与已排除位置已在图库中标明，不用其他地点图片冒充。'}来源明细见下方折叠。</p>
        <div class="textbox" style="margin-top:12px"><h4>中文介绍 <span>示范改写</span></h4><p>${esc(p.introCn)}</p><div class="provenance">地点名称与位置来自现有数据；长文与问句为原型示范，动态事实待核实。</div></div>
        <div class="textbox"><h4>English <span>demo</span></h4><p class="en" lang="en">${esc(p.introEn)}</p></div>
        <div class="detail-actions">
          <button class="btn primary" type="button" data-act="copy" data-copy="${esc(p.introEn)}">复制英文</button>
          <button class="btn" type="button" data-act="speak" data-speak="${esc(p.introEn)}">朗读英文</button>
          ${p.photos.length ? `<button class="btn" type="button" data-act="lb-open" data-lb="${p.photos[0] - 1}">全屏看图</button>` : ''}
        </div>
        <details class="source-details">
          <summary>照片来源说明（文件、清单记录与许可待核实项）</summary>
          <div class="source-body">
            <p class="meta">${esc(sourceLine(p))}${p.photos.length ? ' 未排除的图片仅有 PHOTO_MANIFEST.csv 记录，未逐张重开来源页核验（待核实）。' : ''}</p>
            <p class="meta">${esc(p.note)}</p>
            ${(p.photoCaveats ? Object.keys(p.photoCaveats) : []).map(slot => `<p class="meta" style="margin-top:5px">第 ${slot} 张：${esc(p.photoCaveats[slot])}</p>`).join('')}
            <p class="meta">照片与封面同源；清单记录与地点不符或来源未登记的图片不展示，其余图片来源按待核实处理。</p>
          </div>
        </details>
        <div class="section-head" style="margin-top:18px"><h2>可以这样接着聊</h2><span class="count">${(p.questions || []).length} 条</span></div>
        ${questions}
        ${renderRecordSection(p)}
        <p class="footer-note">文本不是生产数据。正式 APP 是否缺图需按计划另做真实链路排查，不能由本原型推断。</p>
      </div>`;
  }

  function renderRecordSection(p) {
    const recs = S.records[p.id] || [];
    const idx = Math.min(S.currentSeg[p.id] || 0, Math.max(0, recs.length - 1));
    const rec = recs[idx];
    const segbar = recs.length > 1 ? `<div class="segbar">${recs.map((r, i) => `<button class="seg ${i === idx ? 'on' : ''}" type="button" data-seg="${i}">第 ${i + 1} 段</button>`).join('')}</div>` : '';
    let body = '';
    if (!rec) {
      body = `<div class="card empty" style="margin-top:10px"><b>还没有游玩记录</b><div>可以整篇粘贴，或只粘贴当前这一段。</div><div class="btnrow" style="justify-content:center;margin-top:12px"><button class="btn primary" type="button" data-act="import-open" data-mode="all">整篇导入</button><button class="btn" type="button" data-act="import-open" data-mode="single">粘贴到本段</button></div></div>`;
    } else {
      const expanded = !!S.expanded[rec.id];
      const exp = expanded ? rec.expressions : rec.expressions.slice(0, 2);
      const more = rec.expressions.length > 2 ? `<button class="linkbtn" type="button" data-expand="${esc(rec.id)}">${expanded ? '收起表达' : `展开全部 ${rec.expressions.length} 条表达`}</button>` : '';
      body = `
        ${segbar}
        <div class="record-body">
          <div class="row between" style="margin-top:8px"><span class="pill">${esc(rec.title)}</span><span class="meta">${esc(rec.date)}${rec.imported ? ' · 本次导入' : ''}${rec.legacy ? ' · 旧格式历史兼容' : ''}</span></div>
          <div class="exp-list">${exp.map(x => `<div class="exp"><div class="cn">${esc(x.cn)}</div><div class="en" lang="en">${esc(x.en)}</div></div>`).join('')}</div>
          <div style="margin-top:6px">${more}</div>
          <div class="record-body">
            <div class="textbox" style="margin-top:10px"><h4>整理后的中文</h4><p>${esc(rec.cn)}</p></div>
            <div class="textbox"><h4>唯一英文</h4><p class="en" lang="en">${esc(rec.en)}</p></div>
          </div>
          <details style="margin-top:9px"><summary style="font-size:15px;font-weight:700;color:var(--pine);cursor:pointer">更多 / 历史</summary>
            <div class="card pad" style="box-shadow:none;margin-top:7px">
              <p class="meta">recordId：${esc(rec.id)} · 更新：${esc(rec.date)}</p>
              ${(rec.history || []).map(h => `<p class="meta">${esc(h.v)} · ${esc(h.date)} · ${esc(h.note)}</p>`).join('') || '<p class="meta">暂无历史版本</p>'}
              ${rec.sourceSpan ? `<p class="meta" style="margin-top:6px">旧 sourceSpan：${esc(rec.sourceSpan.start)}–${esc(rec.sourceSpan.end)} · ${esc(rec.sourceSpan.note)}</p>` : ''}
              ${(rec.enVariants || []).length ? `<details style="margin-top:7px"><summary style="font-size:15px;font-weight:700;color:var(--pine);cursor:pointer">旧英文 B 版本 ${rec.enVariants.length} 条（默认隐藏）</summary>${rec.enVariants.map(v => `<p class="meta" lang="en" style="margin-top:5px">${esc(v.en)}<br>${esc(v.note)}</p>`).join('')}</details>` : ''}
              ${(rec.practiceLog || []).length ? `<div style="margin-top:7px"><p class="meta" style="font-weight:700">练习日志 ${rec.practiceLog.length} 条</p>${rec.practiceLog.map(x => `<p class="meta">${esc(x.date)} · ${esc(x.result)}</p>`).join('')}</div>` : ''}
              <p class="meta" style="margin-top:6px">旧 enVariants / B 版本仅保留历史兼容，原型不删除旧记录；正式版继续保存 recordId、版本与练习日志。</p>
            </div>
          </details>
          <div class="btnrow" style="margin-top:9px"><button class="btn small soft" type="button" data-act="import-open" data-mode="single">粘贴到本段</button><button class="btn small" type="button" data-act="import-open" data-mode="all">整篇导入</button></div>
        </div>`;
    }
    return `<div id="recordHost"><div class="section-head" style="margin-top:18px"><h2>我的游玩记录</h2><span class="count">${recs.length} 段</span></div>${body}</div>`;
  }

  /* ---------- 粘贴导入 ---------- */
  const SAMPLE = `这条街很适合慢慢走。 This street is great for a slow walk.
抬头看这些老窗户。 Look up at these old windows.
下午的光线更舒服。 The light is softer in the afternoon.
我们从钟楼那边走进来，沿着骑楼慢慢走，最后在一家小店坐下。没有赶景点，反而聊了很久。
We walked in from the clock tower side and followed the arcade slowly. We ended up sitting in a small shop for a long time. We did not rush to any sights, and that slow hour was the best part of the day.

---

椰子水很甜，但不要一次喝太多。 The coconut water is sweet, but do not drink too much at once.
傍晚的风比下午舒服。 The breeze is nicer in the evening than in the afternoon.
下次可以带朋友去海边。 Next time I can take a friend to the coast.
傍晚我们又走了一段，路边的小店陆续亮灯。朋友说下次想去看海，我就把路线记了下来。
Later in the evening we walked another stretch as the small shops began to light up. My friend said he wanted to see the sea next time, so I wrote down a simple route.`;

  function openImport(mode) {
    const p = N.places.find(x => x.id === S.placeId);
    const keepText = S.import.placeId === S.placeId ? S.import.text : '';
    S.import = { mode, text: keepText, parsed: null, placeId: S.placeId, error: '' };
    openModal(`<div class="modal-head"><h2>${mode === 'all' ? '整篇导入' : '粘贴到本段'}</h2><button class="iconbutton" type="button" data-act="modal-close" aria-label="关闭">✕</button></div>
      <div class="sheet-body">
        <p class="meta">格式：每行「中文表达 + 英文表达」→ 整理后的中文段落 → 唯一英文段落。多段用单独一行 <b>---</b> 分隔。识别不清时原型会拒绝猜测。</p>
        <div class="segmented" style="margin-top:10px"><button class="${mode === 'all' ? 'on' : ''}" type="button" data-import-mode="all">整篇（可多段）</button><button class="${mode === 'single' ? 'on' : ''}" type="button" data-import-mode="single">只粘贴本段</button></div>
        <label class="field"><span>粘贴内容</span><textarea id="importText" placeholder="在这里粘贴…">${esc(S.import.text)}</textarea></label>
        <div class="btnrow"><button class="btn soft" type="button" data-act="import-sample">填入示例</button><button class="btn" type="button" data-act="import-parse">识别预览</button></div>
        <div class="preview" id="importPreview"><div class="meta" style="margin-top:8px">还没有识别结果。</div></div>
        <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" id="importConfirm" data-act="import-confirm" disabled>确认导入</button><button class="btn" type="button" data-act="modal-close">取消</button></div>
        <p class="meta" style="margin-top:10px">导入只写入当前原型页面内存；不写正式 APP、不写生产数据库。单段模式会合并到当前段，不删除旧段。</p>
      </div>`);
  }

  function parseImport(text, mode) {
    const raw = String(text || '').replace(/\r/g, '').trim();
    if (!raw) return { error: '请先粘贴内容，或点「填入示例」。' };
    const blocks = raw.split(/\n\s*---+\s*\n/).map((b, i) => ({ raw: b.trim(), no: i + 1 })).filter(b => b.raw);
    if (mode === 'single' && blocks.length > 1) return { error: '当前是「只粘贴本段」，但检测到多段。请改用整篇导入，或只保留一段。' };
    const parsed = [];
    for (const b of blocks) {
      const lines = b.raw.split('\n').map(l => l.trim()).filter(Boolean);
      const expressions = [];
      const cnLines = [];
      const enLines = [];
      let phase = 'expr';
      for (const line of lines) {
        const hasCJK = /[\u4e00-\u9fa5]/.test(line);
        const hasLatin = /[A-Za-z]/.test(line);
        if (phase === 'expr') {
          if (hasCJK && hasLatin) {
            const i = line.search(/[A-Za-z]/);
            const cn = line.slice(0, i).trim();
            const en = line.slice(i).trim();
            if (!cn || !en) return { error: `第 ${b.no} 段：有一行中英没有分开，请写成「中文 + 空格 + English」。` };
            expressions.push({ cn, en });
          } else if (hasCJK && !hasLatin) {
            phase = 'cn'; cnLines.push(line);
          } else {
            return { error: `第 ${b.no} 段：整理段落之前出现了纯英文行，无法判断它是表达还是正文。请把表达写成「中文 + English」。` };
          }
        } else if (phase === 'cn') {
          if (hasCJK && hasLatin) {
            return { error: `第 ${b.no} 段：中文整理段之后又出现了中英混排行。可能把两段混在一起了，请用单独一行 --- 分段。` };
          } else if (hasCJK) {
            cnLines.push(line);
          } else {
            phase = 'en'; enLines.push(line);
          }
        } else {
          if (hasCJK && hasLatin) return { error: `第 ${b.no} 段：英文段落里出现了中英混排行，请检查是否混段。` };
          enLines.push(line);
        }
      }
      if (!expressions.length) return { error: `第 ${b.no} 段：没有识别到「中文 + English」表达行。` };
      const cn = cnLines.join('').trim();
      const en = enLines.join(' ').trim();
      if (cn.length < 15) return { error: `第 ${b.no} 段：没有识别到足够的中文整理段（至少 15 字）。` };
      if (en.split(/\s+/).filter(Boolean).length < 8) return { error: `第 ${b.no} 段：没有识别到足够长的唯一英文段（至少 8 个词）。` };
      parsed.push({ expressions, cn, en });
    }
    return { blocks: parsed, expressionCount: parsed.reduce((n, x) => n + x.expressions.length, 0) };
  }

  function previewImport() {
    const host = $('#importPreview'); if (!host) return;
    const box = $('#importText');
    if (box) S.import.text = box.value;
    const r = parseImport(S.import.text, S.import.mode);
    S.import.parsed = r.error ? null : r;
    S.import.error = r.error || '';
    const btn = $('#importConfirm');
    if (btn) btn.disabled = !!r.error;
    if (r.error) { host.innerHTML = `<div class="err">${esc(r.error)}</div>`; return; }
    host.innerHTML = `<div class="ok">识别到 ${r.blocks.length} 段 / ${r.expressionCount} 条表达，可确认导入。</div>${r.blocks.map((b, i) => `<div class="preview-block"><div class="ph"><span>第 ${i + 1} 段</span><span>${b.expressions.length} 条表达</span></div><div class="pc">${esc(b.cn.slice(0, 64))}${b.cn.length > 64 ? '…' : ''}</div><div class="pe" lang="en">${esc(b.en.slice(0, 90))}${b.en.length > 90 ? '…' : ''}</div></div>`).join('')}`;
  }

  function confirmImport() {
    const p = N.places.find(x => x.id === S.import.placeId);
    if (!p || !S.import.parsed) { toast('请先识别预览'); return; }
    const blocks = S.import.parsed.blocks;
    const recs = S.records[p.id] || (S.records[p.id] = []);
    if (S.import.mode === 'single' && recs.length) {
      const idx = Math.min(S.currentSeg[p.id] || 0, recs.length - 1);
      const rec = recs[idx];
      const seen = new Set(rec.expressions.map(x => x.cn + '|' + x.en));
      blocks[0].expressions.forEach(x => { if (!seen.has(x.cn + '|' + x.en)) rec.expressions.push(x); });
      rec.cn = blocks[0].cn;
      rec.en = blocks[0].en;
      rec.date = TODAY;
      rec.history = rec.history || [];
      rec.history.unshift({ v: 'v' + (rec.history.length + 1), date: TODAY, note: '原型内粘贴合并到本段' });
      S.currentSeg[p.id] = idx;
      closeModal(); render(); toast('已合并到当前段（原型临时）');
    } else {
      blocks.forEach((b, i) => {
        recs.push({
          id: 'rec-import-' + Date.now() + '-' + i,
          title: '新导入段 ' + (recs.length + 1),
          date: TODAY,
          expressions: b.expressions,
          cn: b.cn,
          en: b.en,
          history: [{ v: 'v1', date: TODAY, note: '原型内整篇导入' }],
          imported: true
        });
      });
      S.currentSeg[p.id] = recs.length - blocks.length;
      closeModal(); render(); toast(`已导入 ${blocks.length} 段（原型临时）`);
    }
    setTimeout(() => { const h = $('#recordHost'); if (h) h.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
  }

  /* ---------- 聊天 ---------- */
  function activeChatDemo() {
    const person = N.people.find(p => p.slug === S.chat.person) || N.people[0];
    const demo = person.chatDemo || { note: '', topics: [], tags: {} };
    const topics = demo.topics || [];
    const topic = topics.find(t => t.id === S.chat.topic) || topics[0] || null;
    return { person, demo, topics, topic };
  }
  function chatExtraKey(person, topic) {
    return person.slug + '|' + (topic ? topic.id : 'default');
  }
  function renderChat() {
    const { person, demo, topics, topic } = activeChatDemo();
    const place = N.places.find(p => p.id === ((demo.tags && demo.tags.placeId) || 3)) || N.places[0];
    const key = chatExtraKey(person, topic);
    const extra = S.chat.extra[key] || [];
    const all = (topic ? topic.messages : []).concat(extra);
    const msgs = all.map(m => `<div class="bubble ${m.who === 'me' ? 'me' : ''}"><span class="who">${m.who === 'me' ? '我' : esc(person.name)}</span>${esc(m.text)}${m.cn ? `<div style="font-size:15px;opacity:.78;margin-top:2px">${esc(m.cn)}</div>` : ''}</div>`).join('');
    const coach = topic ? topic.coach : null;
    const follow = coach ? coach.follow : { en: '', cn: '', basis: '' };
    const probe = coach ? coach.probe : { en: '', cn: '', basis: '' };
    return `<div class="chat-page">
      <div class="chat-top">
        <select id="chatPerson" aria-label="正在和谁聊天">${N.people.map(p => `<option value="${esc(p.slug)}" ${S.chat.person === p.slug ? 'selected' : ''}>${esc(p.name)} · ${esc(p.region)}</option>`).join('')}</select>
        <button class="btn primary" type="button" data-act="chat-start">${S.chat.listening ? '停止' : '开始'}</button>
      </div>
      <div class="chat-live"><span class="livedot ${S.chat.listening ? 'pulse' : ''}"></span>${S.chat.listening ? '正在演示字幕条 · 固定示例，不采集麦克风' : '未开始 · 点「开始」演示字幕条（不采集麦克风）'}</div>
      <div class="chat-topicbar"><span class="pill">固定示例 · 话题：${esc(topic ? topic.title : '无')}</span><button class="btn small soft" type="button" data-act="chat-share">分享 / 换题</button></div>
      <div class="chat-thread" id="chatThread">${msgs}${S.chat.listening && topic ? `<div class="bubble"><span class="who">朋友（实时字幕示意 · 固定示例）</span>${esc(topic.liveLine)}</div>` : ''}</div>
      <div class="chat-coach">
        <div class="coach-grid">
          <article class="coach-card"><div class="label"><span>自然接话</span><span>固定示例</span></div><div class="en" lang="en">${esc(follow.en)}</div><div class="cn">${esc(follow.cn)}</div><div class="basis">依据：${esc(follow.basis)}</div><div class="btnrow" style="margin-top:8px"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(follow.en)}">复制</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(follow.en)}">朗读</button></div></article>
          <article class="coach-card"><div class="label"><span>继续追问</span><span>固定示例</span></div><div class="en" lang="en">${esc(probe.en)}</div><div class="cn">${esc(probe.cn)}</div><div class="basis">依据：${esc(probe.basis)}</div><div class="btnrow" style="margin-top:8px"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(probe.en)}">复制</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(probe.en)}">朗读</button></div></article>
        </div>
        <p class="chat-static">以上对话、接话与追问都是本原型写死的样本；切换人物或话题只会换另一套样本，不会根据你的输入实时理解，也不调用云端 AI。</p>
      </div>
      <div class="chat-tags" aria-label="关联小标签">
        <button class="tagbtn" type="button" data-act="chat-tag" data-tag="place"><i>⌖</i>地点 · ${esc(place.cnName)}</button>
        <button class="tagbtn" type="button" data-act="chat-tag" data-tag="festival"><i>◷</i>节日 · 选一个最近话题</button>
        <button class="tagbtn" type="button" data-act="chat-tag" data-tag="person"><i>♧</i>人物 · ${esc(person.name)}</button>
      </div>
      <p class="chat-note">结构保留「对话 / 接话 / 追问 / 分享换题」；分享换题只切换固定样本，不做 AI 实时理解。小标签不替换接话板块。</p>
      <div class="composer"><input id="chatInput" placeholder="手动补充一句话" aria-label="手动补充一句话"><button class="btn primary" type="button" data-act="chat-send">发送</button></div>
      <p class="chat-note">原型演示：不打开麦克风、不调用云端 AI；真实录音与字幕仍需正式版能力。</p>
    </div>`;
  }

  function chatSend() {
    const input = $('#chatInput'); if (!input) return;
    const v = input.value.trim(); if (!v) return;
    const { person, topic } = activeChatDemo();
    const key = chatExtraKey(person, topic);
    (S.chat.extra[key] || (S.chat.extra[key] = [])).push({ who: 'me', text: v, cn: '' });
    S.chat.sent++;
    render();
    const ta = $('#chatThread'); if (ta && ta.lastElementChild) ta.lastElementChild.scrollIntoView({ block: 'nearest' });
    const ni = $('#chatInput'); if (ni) ni.focus();
  }

  function openChatTag(kind) {
    const { person, demo } = activeChatDemo();
    if (kind === 'place') {
      const p = N.places.find(x => x.id === ((demo.tags && demo.tags.placeId) || 3)) || N.places[0];
      const q = p.questions[0];
      openSheet('关联地点 · ' + esc(p.cnName), `<p class="meta">来自海南地点，示范内容待核实。</p><p class="meta" style="margin-top:5px">${esc((demo.tags && demo.tags.placeNote) || '我这边的地方，用于主动分享，不代表对方行程。')}</p><div class="qcard" style="margin-top:10px"><div class="cn">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(q.en)}">朗读英文</button></div></div><p class="meta" style="margin-top:8px">不会替换聊天页原有的接话与追问。</p>`);
    } else if (kind === 'festival') {
      const inWindow = festivalList();
      const list = inWindow.length ? inWindow : N.festivals.slice(0, 3);
      const cards = list.map(f => {
        const q = f.questions[0];
        return `<div class="qcard" style="margin-top:8px"><div class="row between"><b>${esc(f.cn)}</b><span class="pill line">${esc(f.region)}</span></div><div class="meta" style="margin-top:3px">${esc(f.dateRule)} · 日期待复核</div><div class="cn" style="margin-top:6px">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(q.en)}">朗读英文</button></div></div>`;
      }).join('');
      openSheet('节日 · 选一个最近话题', `<p class="meta">${inWindow.length ? '未来 14 天内的示范样本' : '未来 14 天没有匹配样本，改用最近 3 个示范'}；不推断对方是否庆祝，也不按国籍推断。</p>${cards}`);
    } else {
      const q = person.questionsConfirmed[0];
      openSheet('人物 · ' + esc(person.name), `<p class="meta">${esc(person.region)} · 虚构演示人物 · 仅用已确认事实。</p><div class="qcard" style="margin-top:10px"><div class="cn">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(q.en)}">朗读英文</button></div></div>`);
    }
  }

  function chatShareText(topic) {
    if (!topic) return '';
    return topic.title + '\n' + topic.coach.follow.en + '\n' + topic.coach.follow.cn + '\n' + topic.coach.probe.en + '\n' + topic.coach.probe.cn;
  }
  function openChatShare() {
    const { person, topics, topic } = activeChatDemo();
    const text = chatShareText(topic);
    openSheet('分享 / 换题', `<p class="meta">${esc(person.name)} · 本页是固定示例，不调用云端 AI，也不会按你的输入实时理解。</p>
      <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="chat-share-native">调起系统分享</button><button class="btn soft" type="button" data-act="chat-share-copy">复制当前话题句</button><button class="btn" type="button" data-act="modal-close">关闭</button></div>
      <div class="section-head" style="margin-top:16px"><h2>换成另一个固定示例话题</h2><span class="count">${topics.length} 个</span></div>
      <div class="stack">${topics.map(t => `<button class="btn ${topic && t.id === topic.id ? 'primary' : 'soft'}" type="button" data-chat-topic="${esc(t.id)}">${esc(t.title)}${topic && t.id === topic.id ? ' · 当前' : ''}</button>`).join('')}</div>
      <p class="meta" style="margin-top:10px">切换只更换写死的对话、接话与追问，不生成新内容，也不会向你之外的人发送。</p>
      <div class="textbox" style="margin-top:12px"><h4>分享内容预览</h4><p>${esc(topic ? topic.coach.follow.cn : '')}</p><p class="en" lang="en" style="margin-top:6px">${esc(topic ? topic.coach.follow.en : '')}</p></div>`);
    window.__n06ChatShareText = text;
  }


  /* ---------- 人物 ---------- */
  function renderPeopleList() {
    return `
      ${demoNotice('人物均为现有演示数据中的虚构角色；确认事实与静态示范问句分开显示，不按国籍推断习惯，也不调用云端 AI 生成建议。')}
      <div class="section-head"><h2>聊过的人</h2><span class="count">${N.people.length} 位虚构演示</span></div>
      ${N.people.map(p => `<article class="card person-card" data-person="${esc(p.slug)}">
        <div class="avatar">${esc(p.name.slice(0, 1))}</div>
        <div class="grow">
          <div class="row between"><h3>${esc(p.name)}</h3><span class="pill line">虚构</span></div>
          <div class="meta">${esc(p.region)} · ${esc(p.regionEn)}</div>
          <p class="p">${esc(p.personality)}</p>
          <div class="foot" style="margin-top:5px"><span class="meta">已确认 ${p.confirmed.length} 条 · 对话 ${p.sessions.length} 次</span><span class="linkbtn">查看续聊 →</span></div>
        </div>
      </article>`).join('')}
      <p class="footer-note">人物页保留基本情况、兴趣与偏好、已聊内容、中英问句、编辑与历史入口。</p>`;
  }

  function renderPersonDetail() {
    const p = N.people.find(x => x.slug === S.personId);
    if (!p) return `<div class="card empty"><b>人物不存在</b></div>`;
    const facts = p.confirmed.map(f => `<div class="fact"><div class="en" lang="en">✓ ${esc(f.text)}</div><div class="cn">${esc(f.cn)}</div></div>`).join('');
    const pending = `<div class="fact pending"><div class="row between"><span class="pill warn">待确认</span><span class="meta">不要当事实</span></div><div class="en" lang="en" style="margin-top:6px">${esc(p.pending.text)}</div><div class="cn">${esc(p.pending.cn)}</div></div>`;
    const qs = p.questionsConfirmed.map(q => `<div class="qcard"><div class="cn">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button><button class="btn small" type="button" data-act="speak" data-speak="${esc(q.en)}">朗读英文</button></div></div>`).join('');
    const sug = p.questionsSuggestion.map(q => `<div class="qcard" style="border-style:dashed"><div class="row between"><span class="pill line">静态示范</span><span class="meta">非 AI 生成 · 非已确认</span></div><div class="cn" style="margin-top:5px">${esc(q.cn)}</div><div class="en" lang="en">${esc(q.en)}</div><div class="meta" style="margin-top:5px;color:var(--sand)">${esc(q.caution)}</div><div class="qacts"><button class="btn small soft" type="button" data-act="copy" data-copy="${esc(q.cn + '\n' + q.en)}">复制中英</button></div></div>`).join('');
    const sessions = p.sessions.map((s, i) => `<details class="session" ${i === 0 ? 'open' : ''}><summary style="cursor:pointer;list-style:none"><div class="row between"><b style="font-size:17px">${esc(s.title)}</b><span class="date">${esc(s.date)}</span></div></summary>${s.lines.map(l => `<div class="line"><b>${esc(l.who)}：</b><span lang="en">${esc(l.en)}</span><div class="meta">${esc(l.cn)}</div></div>`).join('')}</details>`).join('');
    return `
      <div class="row between" style="margin-bottom:10px"><div><h2>${esc(p.name)}</h2><div class="meta">${esc(p.region)} · ${esc(p.regionEn)}</div></div><div class="avatar">${esc(p.name.slice(0, 1))}</div></div>
      <div class="btnrow" style="margin-bottom:12px"><span class="pill warn">虚构演示</span><span class="pill">已确认 ${p.confirmed.length} 条</span><button class="btn small" type="button" data-act="person-edit">编辑</button><button class="btn small" type="button" data-act="person-history">历史</button></div>
      <div class="textbox"><h4>基本情况与偏好</h4><p style="font-size:18px">${esc(p.personality)}</p><p style="font-size:17px;color:var(--muted);margin-top:5px">交流风格：${esc(p.style)}</p><p style="font-size:17px;color:var(--muted);margin-top:4px">注意：${esc(p.cautions)}</p><div class="btnrow" style="margin-top:8px">${p.interests.map(x => `<span class="pill line">${esc(x)}</span>`).join('')}</div></div>
      <div class="section-head" style="margin-top:16px"><h2>已确认的事实</h2><span class="count">来自对话记录</span></div>
      ${facts}
      <div class="section-head" style="margin-top:14px"><h2>待确认</h2><span class="count">先问再记</span></div>
      ${pending}
      <div class="section-head" style="margin-top:16px"><h2>可以接续的问句</h2><span class="count">只基于确认事实</span></div>
      ${qs}
      <div class="section-head" style="margin-top:16px"><h2>示范问句（静态样本）</h2><span class="count">非 AI 生成 · 与事实分开</span></div>
      ${sug}
      <div class="section-head" style="margin-top:16px"><h2>已聊内容</h2><span class="count">${p.sessions.length} 次</span></div>
      ${sessions}
      <p class="footer-note">人物为虚构演示数据；示范问句是写死的静态样本，不是 AI 实时生成；正式版保留编辑与历史，不把它写成已确认事实。</p>`;
  }

  /* ---------- 通用弹层 ---------- */
  function renderThemeSheet() {
    const modes = [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统（默认）']];
    const host = $('#themeSheet'); if (!host) return;
    host.innerHTML = `<div class="segmented" style="margin-top:8px">${modes.map(([k, v]) => `<button class="${S.themeMode === k ? 'on' : ''}" type="button" data-theme-mode="${k}">${v}</button>`).join('')}</div><p class="meta" style="margin-top:8px">默认跟随系统；浅色/深色/跟随系统三档可手选，选择会保存在本机浏览器。</p>`;
  }
  function openMore() {
    openSheet('更多 · 原型设置', `<div id="themeSheet"></div>
      <div class="divider"></div>
      <h3>范围与边界</h3>
      <p class="meta" style="margin-top:5px">${esc(N.meta.note)}</p>
      <div class="btnrow" style="margin-top:10px"><button class="btn soft" type="button" data-act="open-diff">差异说明位置</button><button class="btn" type="button" data-act="modal-close">关闭</button></div>
      <p class="meta" style="margin-top:10px">${esc(N.meta.version)} · ${esc(N.meta.builtAt)}</p>`);
    renderThemeSheet();
  }
  function openDiff() {
    openSheet('差异说明', `<p>同目录文件：<b>差异说明.md</b>、<b>验证说明.md</b>、<b>截图索引.md</b>、<b>单文件说明.md</b>。</p><p class="meta" style="margin-top:8px">关键差异：正式版详情目前只取个人卡片图库；现有静态地点数据里的 photos 槽位没有在详情图库渲染。原型改为直接读取同一城市的归档图片，按清单记录排除与地点不符或来源未登记的图片，其余按待核实标注。</p><p class="meta" style="margin-top:8px">本原型不修改正式 APP，不声称旧 R3 已 DONE。</p>`);
  }
  function openRecycle() {
    const list = S.works.filter(w => w.recycled);
    openSheet('回收站', `${list.length ? list.map(w => `<div class="card pad" style="box-shadow:none;margin-top:8px"><div class="row between"><b>${esc(w.name)}</b><span class="meta">${esc(w.id)}</span></div><div class="btnrow" style="margin-top:8px"><button class="btn small soft" type="button" data-act="works-restore" data-id="${esc(w.id)}">恢复</button></div></div>`).join('') : '<p class="meta" style="margin-top:8px">回收站是空的。</p>'}<p class="meta" style="margin-top:10px">原型只在当前页面内存里移动；正式版保留原回收站行为。</p>`);
  }
  function personEditForm(p) {
    return `<div class="modal-head"><h2>编辑人物</h2><button class="iconbutton" type="button" data-act="modal-close" aria-label="关闭">✕</button></div><div class="sheet-body">
      <label class="field"><span>基本情况</span><textarea id="personPersonality" style="min-height:100px">${esc(p.personality)}</textarea></label>
      <label class="field"><span>交流风格</span><input id="personStyle" value="${esc(p.style)}"></label>
      <label class="field"><span>注意</span><textarea id="personCautions" style="min-height:90px">${esc(p.cautions)}</textarea></label>
      <div class="btnrow" style="margin-top:12px"><button class="btn primary" type="button" data-act="person-save">保存</button><button class="btn" type="button" data-act="modal-close">取消</button></div>
      <p class="meta" style="margin-top:9px">原型保存只改当前页面内存，不改生产人物档案。</p>
    </div>`;
  }

  /* ---------- 全屏 ---------- */
  function currentPlaceForLb() { return N.places.find(p => p.id === S.placeId); }
  function showLightbox(index, updateHash) {
    const p = currentPlaceForLb(); if (!p) return;
    S.lbIndex = Math.max(0, Math.min(index, p.declaredPhotos - 1));
    const slot = S.lbIndex + 1;
    const stage = $('#lbStage');
    const state = slotState(p, slot);
    if (state === 'ok') {
      stage.innerHTML = `<img src="${photoUrl(p, slot)}" alt="${esc(p.cnName)} 照片 ${slot}" onload="__n06ImgLoad(this)" onerror="__n06ImgError(this)"><span class="fallback" hidden>这张图片加载失败 · 真实缺图提示</span><span class="slowhint" hidden>加载较慢，仍在等待…</span>`;
    } else if (state === 'excluded') {
      stage.innerHTML = `<span class="fallback">第 ${slot} 张已排除（待核实）<br>${esc(exclusionText(p, slot))}</span>`;
    } else {
      stage.innerHTML = `<span class="fallback">第 ${slot} 张缺失（待补图）<br>不用其他地点图片冒充</span>`;
    }
    $('#lbCount').textContent = `${slot} / ${p.declaredPhotos}`;
    $('#lbHint').textContent = `${p.cnName} · 可用 ${p.photos.length} 张 · 其余待核实`;
    $('#lightbox').classList.add('on');
    document.body.style.overflow = 'hidden';
    if (updateHash !== false) history.replaceState(null, '', '#hainan/' + p.id + '/full/' + slot);
  }
  function closeLightbox() {
    const p = currentPlaceForLb();
    $('#lightbox').classList.remove('on');
    document.body.style.overflow = '';
    S.lbIndex = -1;
    if (p) history.replaceState(null, '', '#hainan/' + p.id);
  }
  function galleryTo(i) {
    const g = $('#gallery'); if (!g) return;
    const p = currentPlaceForLb(); if (!p) return;
    const idx = Math.max(0, Math.min(i, p.declaredPhotos - 1));
    const slide = g.children[idx]; if (!slide) return;
    g.scrollTo({ left: slide.offsetLeft - 14, behavior: 'smooth' });
    updateGalleryUi(idx);
  }
  function updateGalleryUi(idx) {
    const p = currentPlaceForLb(); if (!p) return;
    const c = $('#galleryCount'); if (c) c.textContent = `${idx + 1} / ${p.declaredPhotos}`;
    $$('#galleryDots i').forEach((d, i) => d.classList.toggle('on', i === idx));
  }
  function bindGallery() {
    const g = $('#gallery'); if (!g) return;
    let raf = null;
    g.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const slide = g.children[0]; if (!slide) return;
        const step = slide.getBoundingClientRect().width + 10;
        const idx = Math.max(0, Math.min(g.children.length - 1, Math.round(g.scrollLeft / step)));
        updateGalleryUi(idx);
      });
    });
  }

  /* ---------- 事件 ---------- */
  function bindAfterRender() {
    if (S.tab === 'hainan' && S.placeId) bindGallery();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-nav],[data-topic],[data-window],[data-place],[data-work],[data-person],[data-workcat],[data-selfcat],[data-city],[data-seg],[data-expand],[data-import-mode],[data-theme-mode],[data-chat-topic]');
    if (!el) {
      if (e.target.id === 'modal') closeModal();
      return;
    }
    const act = el.dataset.act;
    if (act) {
      switch (act) {
        case 'theme': setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); break;
        case 'more': openMore(); break;
        case 'modal-close': closeModal(); break;
        case 'back': closeModal(); go(parentHash()); break;
        case 'copy': copyText(el.dataset.copy || ''); break;
        case 'speak': speak(el.dataset.speak || ''); break;
        case 'lb-open': showLightbox(Number(el.dataset.lb || 0)); break;
        case 'lb-close': closeLightbox(); break;
        case 'lb-prev': showLightbox(S.lbIndex - 1); break;
        case 'lb-next': showLightbox(S.lbIndex + 1); break;
        case 'gallery-prev': { const g = $('#gallery'); const first = g && g.children[0]; const step = first ? first.getBoundingClientRect().width + 10 : 0; galleryTo(Math.max(0, Math.round((g.scrollLeft || 0) / step) - 1)); break; }
        case 'gallery-next': { const g = $('#gallery'); const first = g && g.children[0]; const step = first ? first.getBoundingClientRect().width + 10 : 0; galleryTo(Math.min(N.places.find(p => p.id === S.placeId).declaredPhotos - 1, Math.round((g.scrollLeft || 0) / step) + 1)); break; }
        case 'import-open': openImport(el.dataset.mode || 'all'); break;
        case 'import-sample': { const t = $('#importText'); if (t) { t.value = SAMPLE; S.import.text = SAMPLE; previewImport(); } break; }
        case 'import-parse': previewImport(); break;
        case 'import-confirm': confirmImport(); break;
        case 'works-new': openModal(workForm(null)); break;
        case 'works-edit': { const w = S.works.find(x => x.id === el.dataset.id); if (w) openModal(workForm(w)); break; }
        case 'works-save': {
          const name = ($('#workName') || {}).value || '';
          const cn = ($('#workCn') || {}).value || '';
          const en = ($('#workEn') || {}).value || '';
          const cat = ($('#workCat') || {}).value || 'C';
          if (!name.trim() || !cn.trim() || !en.trim()) { toast('名称、中文和英文都要填写'); break; }
          if (el.dataset.id) {
            const w = S.works.find(x => x.id === el.dataset.id);
            if (w) { w.name = name.trim(); w.cn = cn.trim(); w.en = en.trim(); w.cat = cat; }
          } else {
            S.works.unshift({ id: 'P9' + String(S.works.length + 1).padStart(2, '0'), name: name.trim(), cn: cn.trim(), en: en.trim(), cat, status: '原型新建样本，未进正式库', steps: [], color: '#0c7766', recycled: false });
          }
          closeModal(); render(); toast('已保存（原型临时）'); break;
        }
        case 'works-recycle-one': {
          const w = S.works.find(x => x.id === el.dataset.id); if (!w) break;
          openSheet('移入回收站？', `<p>「${esc(w.name)}」会从列表移到回收站，可以恢复。</p><div class="btnrow" style="margin-top:12px"><button class="btn danger" type="button" data-act="works-delete-confirm" data-id="${esc(w.id)}">移入回收站</button><button class="btn" type="button" data-act="modal-close">取消</button></div>`);
          break;
        }
        case 'works-delete-confirm': { const w = S.works.find(x => x.id === el.dataset.id); if (w) w.recycled = true; closeModal(); go('#topics/works'); toast('已移入回收站（原型）'); break; }
        case 'works-recycle': openRecycle(); break;
        case 'work-share': { const w = S.works.find(x => x.id === el.dataset.id); if (w) openWorkShare(w); break; }
        case 'work-share-native': { const w = S.works.find(x => x.id === el.dataset.id); if (w) shareOrCopy(w.name, workShareText(w)); break; }
        case 'work-share-copy': { const w = S.works.find(x => x.id === el.dataset.id); if (w) copyText(workShareText(w), '已复制作品中英介绍'); break; }
        case 'works-restore': { const w = S.works.find(x => x.id === el.dataset.id); if (w) w.recycled = false; closeModal(); render(); toast('已恢复（原型）'); break; }
        case 'story-add': openModal(storyForm(null)); break;
        case 'story-edit': { const s = S.stories.find(x => x.id === el.dataset.id); if (s) openModal(storyForm(s)); break; }
        case 'story-save': {
          const title = ($('#storyTitle') || {}).value || '';
          const cn = ($('#storyCn') || {}).value || '';
          const en = ($('#storyEn') || {}).value || '';
          const cat = ($('#storyCat') || {}).value || '生活';
          if (!title.trim() || !cn.trim() || !en.trim()) { toast('标题、中文和英文都要填写'); break; }
          if (el.dataset.id) {
            const s = S.stories.find(x => x.id === el.dataset.id);
            if (s) { s.title = title.trim(); s.cn = cn.trim(); s.en = en.trim(); s.cat = cat; s.demoEdited = true; }
          } else {
            S.stories.unshift({ id: 'story-' + Date.now(), title: title.trim(), cn: cn.trim(), en: en.trim(), cat, demoEdited: true });
          }
          closeModal(); render(); toast('已保存（原型临时）'); break;
        }
        case 'person-edit': { const p = N.people.find(x => x.slug === S.personId); if (p) openModal(personEditForm(p)); break; }
        case 'person-save': {
          const p = N.people.find(x => x.slug === S.personId); if (!p) break;
          p.personality = ($('#personPersonality') || {}).value || p.personality;
          p.style = ($('#personStyle') || {}).value || p.style;
          p.cautions = ($('#personCautions') || {}).value || p.cautions;
          closeModal(); render(); toast('已保存（原型临时）'); break;
        }
        case 'person-history': {
          const p = N.people.find(x => x.slug === S.personId); if (!p) break;
          openSheet('对话历史 · ' + p.name, p.sessions.map(s => `<div class="session"><div class="date">${esc(s.date)}</div><b>${esc(s.title)}</b>${s.lines.map(l => `<div class="line"><b>${esc(l.who)}：</b>${esc(l.en)}<div class="meta">${esc(l.cn)}</div></div>`).join('')}</div>`).join(''));
          break;
        }
        case 'chat-start': S.chat.listening = !S.chat.listening; render(); toast(S.chat.listening ? '原型演示：不会打开麦克风' : '已停止演示'); break;
        case 'chat-send': chatSend(); break;
        case 'chat-share': openChatShare(); break;
        case 'chat-share-copy': copyText(window.__n06ChatShareText || '', '已复制当前话题句'); break;
        case 'chat-share-native': shareOrCopy('N06 对话话题', window.__n06ChatShareText || ''); break;
        case 'chat-tag': openChatTag(el.dataset.tag); break;
        case 'open-diff': openDiff(); break;
        case 'theme-mode': setTheme(el.dataset.themeMode); renderThemeSheet(); break;
        default: break;
      }
      return;
    }
    if (el.dataset.nav) {
      const tab = el.dataset.nav;
      if (tab === 'topics') go('#topics/' + (S.sub || 'festival'));
      else go('#' + tab);
      return;
    }
    if (el.dataset.topic) { go('#topics/' + el.dataset.topic); return; }
    if (el.dataset.window) { S.win = el.dataset.window; render(); return; }
    if (el.dataset.place) { go('#hainan/' + el.dataset.place); return; }
    if (el.dataset.work) { go('#topics/works/' + el.dataset.work); return; }
    if (el.dataset.person) { go('#people/' + el.dataset.person); return; }
    if (el.dataset.workcat) { S.worksCat = el.dataset.workcat; render(); return; }
    if (el.dataset.selfcat) { S.selfCat = el.dataset.selfcat; render(); return; }
    if (el.dataset.city) { S.hainanCity = el.dataset.city; render(); return; }
    if (el.dataset.seg !== undefined) { S.currentSeg[S.placeId] = Number(el.dataset.seg); render(); setTimeout(() => { const h = $('#recordHost'); if (h) h.scrollIntoView({ block: 'start' }); }, 40); return; }
    if (el.dataset.expand) { S.expanded[el.dataset.expand] = !S.expanded[el.dataset.expand]; render(); setTimeout(() => { const h = $('#recordHost'); if (h) h.scrollIntoView({ block: 'start' }); }, 40); return; }
    if (el.dataset.chatTopic) { S.chat.topic = el.dataset.chatTopic; closeModal(); render(); toast('已切换到固定示例话题'); return; }
    if (el.dataset.importMode) { S.import.mode = el.dataset.importMode; openImport(S.import.mode); return; }
  });

  document.addEventListener('input', (e) => {
    const id = e.target.id;
    if (id === 'hainanSearch') { S.qHainan = e.target.value; refreshHainanList(); }
    else if (id === 'workSearch') { S.qWorks = e.target.value; refreshWorkList(); }
    else if (id === 'selfSearch') { S.qSelf = e.target.value; refreshStoryList(); }
    else if (id === 'importText') { S.import.text = e.target.value; previewImport(); }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'regionFilter') { S.region = e.target.value; render(); }
    else if (id === 'themeFilter') { S.themeFilter = e.target.value; render(); }
    else if (id === 'chatPerson') { S.chat.person = e.target.value; S.chat.topic = ''; S.chat.listening = false; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#lightbox').classList.contains('on')) closeLightbox();
      else if ($('#modal').classList.contains('on')) closeModal();
      return;
    }
    if ($('#lightbox').classList.contains('on')) {
      if (e.key === 'ArrowLeft') showLightbox(S.lbIndex - 1);
      if (e.key === 'ArrowRight') showLightbox(S.lbIndex + 1);
      return;
    }
    if (e.target.id === 'chatInput' && e.key === 'Enter') { e.preventDefault(); chatSend(); }
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

  window.addEventListener('hashchange', () => { render(); scrollTop(); });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (S.themeMode === 'system') setTheme('system'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  applyStoredTheme();
  if (!location.hash) history.replaceState(null, '', '#topics/festival');
  render();
  scrollTop();
})();
