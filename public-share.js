(function () {
  'use strict';
  var data = window.SOCIALMATE_PUBLIC_PLACES || {places: []};
  var places = Array.isArray(data.places) ? data.places : [];
  var byId = new Map(places.map(function (p) { return [String(p.id), p]; }));
  var STORE_KEY = 'sm-hainan-wants-v1';
  var MAX_SELECTED = 40;

  var CAT_EN = {'城市街拍':'Street & city','美食夜生活':'Food & nightlife','海滨日落':'Beach & sunset','自然体验':'Nature & outdoors','海南环岛':'Around the island'};
  var CITY_EN = {'海口':'Haikou','文昌':'Wenchang','琼海':'Qionghai','万宁':'Wanning','陵水':'Lingshui','三亚':'Sanya','其他地区':'Other areas'};
  function catLabel(c){ return language === 'en' ? (CAT_EN[c] || c) : c; }
  function cityLabel(c){ return language === 'en' ? (CITY_EN[c] || c) : c; }
  var language = 'en', category = '', city = '', query = '';
  var listMode = 'all';
  var selected = '';
  var incoming = [];
  var wants = loadWants();

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  function loadWants() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return new Set((Array.isArray(raw) ? raw : []).map(String).filter(function (id) { return byId.has(id); }));
    } catch (e) { return new Set(); }
  }
  function saveWants() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(wantsArray())); } catch (e) {}
  }
  function wantsArray() {
    return Array.from(wants).sort(function (a, b) { return Number(a) - Number(b); });
  }
  function label(p) { return language === 'en' ? p.enName : p.name; }
  function subLabel(p) { return language === 'en' ? p.name : p.enName; }

  function copy(value) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(function () { notify('Copied'); })
        .catch(function () { fallbackCopy(value); });
      return;
    }
    fallbackCopy(value);
  }
  function fallbackCopy(value) {
    var el = document.createElement('textarea');
    el.value = value; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.select();
    try { notify(document.execCommand('copy') ? 'Copied' : 'Select the text and copy'); }
    catch (e) { notify('Select the text and copy'); }
    el.remove();
  }
  function notify(message) {
    var tip = $('#publicToast');
    tip.textContent = message; tip.hidden = false;
    clearTimeout(window.__publicToastTimer);
    window.__publicToastTimer = setTimeout(function () { tip.hidden = true; }, 2600);
  }

  function card(p) {
    var on = wants.has(String(p.id));
    return '<article class="public-item">' +
      '<button class="item-open" type="button" data-open="' + p.id + '">' +
        '<div class="card-meta"><span class="mini-tag">' + String(p.id).padStart(3, '0') +
        '</span><span>' + esc(cityLabel(p.city)) + ' · ' + esc(catLabel(p.category)) + '</span></div>' +
        '<strong>' + esc(label(p)) + '</strong><small>' + esc(subLabel(p)) + '</small>' +
        '<p class="muted">' + esc((language === 'en' ? p.en : p.cn).slice(0, 113)) + '…</p>' +
      '</button>' +
      '<button class="want-btn' + (on ? ' on' : '') + '" type="button" data-want="' + p.id +
        '" aria-pressed="' + on + '">' + (on ? '★ Saved' : (language === 'en' ? '☆ Want to go' : '☆ 想去')) + '</button>' +
    '</article>';
  }

  function visibleSet() {
    var q = query.trim().toLowerCase();
    return places.filter(function (p) {
      if (listMode === 'wants' && !wants.has(String(p.id))) return false;
      if (incoming.length && listMode === 'incoming' && incoming.indexOf(String(p.id)) === -1) return false;
      return (!category || p.category === category) && (!city || p.city === city) &&
        (!q || [p.name, p.enName, p.cn, p.en, p.location, p.category, p.city].join(' ').toLowerCase().indexOf(q) !== -1);
    });
  }

  function filter() {
    var set = visibleSet();
    $('#publicResults').innerHTML = set.length ? set.map(card).join('')
      : '<div class="empty">No matching places. Try another keyword.</div>';
    $('#publicCount').textContent = set.length + ' / ' + places.length + ' places';
    updateWantsButton();
  }

  function updateWantsButton() {
    var button = $('#wantsButton');
    if (button) {
      button.textContent = (language === 'en' ? 'My list' : '我的清单') + ' (' + wants.size + ')';
      button.setAttribute('aria-pressed', String(listMode === 'wants'));
      button.classList.toggle('active', listMode === 'wants');
    }
  }

  function applyStaticI18n() {
    var nodes = document.querySelectorAll('[data-zh][data-en]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = language === 'en' ? nodes[i].getAttribute('data-en') : nodes[i].getAttribute('data-zh');
    }
    var phs = document.querySelectorAll('[data-ph-zh][data-ph-en]');
    for (var j = 0; j < phs.length; j++) {
      phs[j].setAttribute('placeholder', language === 'en' ? phs[j].getAttribute('data-ph-en') : phs[j].getAttribute('data-ph-zh'));
    }
    document.title = language === 'en' ? 'Hainan Local Guide · SocialMate' : '海南本地指南 · SocialMate';
  }

  function initFilters() {
    var cities = Array.from(new Set(places.map(function (x) { return x.city; })));
    $('#publicCity').innerHTML = '<option value="">' + (language === 'en' ? 'All cities' : '全部城市') + '</option>' +
      cities.map(function (c) { return '<option value="' + esc(c) + '">' + esc(cityLabel(c)) + '</option>'; }).join('');
    var types = Array.from(new Set(places.map(function (x) { return x.category; })));
    $('#categoryFilters').innerHTML = '<button class="pill active" data-category="">' +
      (language === 'en' ? 'All' : '全部') + '</button>' +
      types.map(function (c) { return '<button class="pill" data-category="' + esc(c) + '">' + esc(catLabel(c)) + '</button>'; }).join('');
  }

  function detail(p) {
    if (!p) return showList();
    selected = String(p.id);
    $('#overview').hidden = true; $('#publicDetail').hidden = false;
    var on = wants.has(selected);
    $('#publicDetail').innerHTML = '<div class="public-card">' +
      '<div class="card-meta"><span class="mini-tag">NO. ' + String(p.id).padStart(3, '0') +
      '</span><span>' + esc(cityLabel(p.city)) + ' · ' + esc(catLabel(p.category)) + '</span></div>' +
      '<h1>' + esc(label(p)) + '</h1><div class="public-sub">' + esc(subLabel(p)) + '</div>' +
      '<div class="public-sub">' + esc(p.location) + '</div>' +
      '<p class="public-text">' + esc(language === 'en' ? p.en : p.cn) + '</p>' +
      '<div class="public-cn">' + esc(language === 'en' ? p.cn : p.en) + '</div>' +
      '<div class="public-row"><a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="' + esc(p.mapGoogle) + '">Google Maps ↗</a>' +
      '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + esc(p.mapAmap) + '">Amap 高德 ↗</a></div>' +
      '<div class="public-row"><button class="btn btn-soft want-detail' + (on ? ' on' : '') + '" type="button" data-want="' + p.id + '" aria-pressed="' + on + '">' +
      (on ? '★ Saved to my list' : (language === 'en' ? '☆ Add to my list' : '☆ 加入我的清单')) + '</button>' +
      '<button class="btn" type="button" id="sharePlace">' + (language === 'en' ? 'Share place' : '分享地点') + '</button>' +
      '<button class="btn" type="button" id="copyDescription">' + (language === 'en' ? 'Copy English' : '复制中文') + '</button>' +
      '<button class="btn" type="button" id="viewAll">' + (language === 'en' ? 'Browse all 115' : '浏览全部 115 处') + '</button></div>' +
    '</div>';
    document.title = label(p) + ' · Hainan Local Guide';
  }

  function showList() {
    selected = '';
    $('#overview').hidden = false; $('#publicDetail').hidden = true;
    document.title = 'Hainan Local Guide · SocialMate';
    filter();
  }

  function selectPlace(id, replace) {
    var p = byId.get(String(id)); if (!p) return showList();
    detail(p);
    var url = location.pathname + '?place=' + encodeURIComponent(p.id);
    if (replace) history.replaceState({place: p.id}, '', url);
    else history.pushState({place: p.id}, '', url);
    window.scrollTo(0, 0);
  }
  function all() {
    history.pushState({}, '', location.pathname); showList(); window.scrollTo(0, 0);
  }

  function currentShare() {
    var p = byId.get(selected); if (!p) return;
    shareOrCopy(label(p), p.en + '\n' + location.href, location.href);
  }

  function shareOrCopy(title, text, url) {
    if (navigator.share && window.isSecureContext) {
      navigator.share({title: title, text: text, url: url}).catch(function (err) {
        if (err && err.name !== 'AbortError') copy(text + '\n' + url);
      });
      return true;
    }
    copy(text + '\n' + url);
    return false;
  }

  /** 只包含已验证地点 ID；数量与 URL 长度都有上限。 */
  function buildShareUrl(ids) {
    var valid = ids.map(String).filter(function (id) { return byId.has(id); })
      .filter(function (id, i, arr) { return arr.indexOf(id) === i; })
      .slice(0, MAX_SELECTED);
    return location.origin + location.pathname + '?selected=' + valid.join(',');
  }

  function listText(ids) {
    return ids.map(function (id) {
      var p = byId.get(String(id));
      if (!p) return null;
      return '- ' + p.enName + ' (' + cityLabel(p.city) + ') — ' + location.origin + location.pathname + '?place=' + p.id;
    }).filter(Boolean).join('\n');
  }

  function renderMyList() {
    var panel = $('#myList');
    var ids = wantsArray();
    if (!ids.length) {
      panel.innerHTML = '<div class="public-note">' + (language === 'en'
        ? 'Nothing saved yet. Tap “☆ Want to go” on any place to build your list.'
        : '还没有收藏。点任意地点的「☆ 想去」就能建立清单。') + '</div>';
      panel.hidden = false;
      return;
    }
    panel.innerHTML = '<div class="public-card"><div class="section-heading"><h2>' +
      (language === 'en' ? 'My list' : '我的清单') + ' · ' + ids.length + '</h2>' +
      '<button class="pill" id="closeList" type="button">' + (language === 'en' ? 'Close' : '关闭') + '</button></div>' +
      '<ul class="want-list">' + ids.map(function (id) {
        var p = byId.get(id);
        return '<li><button class="linklike" type="button" data-open="' + id + '">' + esc(label(p)) +
          '</button> <small>' + esc(cityLabel(p.city)) + '</small>' +
          '<button class="pill" type="button" data-want="' + id + '" aria-label="Remove">×</button></li>';
      }).join('') + '</ul>' +
      '<label class="formlabel" for="shareLink">' + (language === 'en' ? 'Share link (only place IDs)' : '分享链接（只含地点 ID）') + '</label>' +
      '<input id="shareLink" class="field" readonly value="' + esc(buildShareUrl(ids)) + '">' +
      '<p class="public-note">' + (language === 'en'
        ? 'This link opens the same list on any phone. Nothing is uploaded — the list lives in the link and your browser.'
        : '这条链接在任何手机上都会打开同一份清单；不上传服务器，清单只在链接和本机浏览器里。') + '</p>' +
      '<div class="public-row"><button class="btn btn-primary" id="shareList" type="button">' +
        (language === 'en' ? 'Send list to SocialMate' : '把清单发回给 SocialMate') + '</button>' +
      '<button class="btn" id="copyList" type="button">' + (language === 'en' ? 'Copy list' : '复制清单') + '</button>' +
      '<button class="btn btn-ghost" id="clearList" type="button">' + (language === 'en' ? 'Clear all' : '清空') + '</button></div></div>';
    panel.hidden = false;
  }

  function toggleWant(id) {
    id = String(id);
    if (!byId.has(id)) return;
    if (wants.has(id)) wants.delete(id);
    else {
      if (wants.size >= MAX_SELECTED) { notify(language === 'en' ? 'Up to 40 places per list' : '每份清单最多 40 处'); return; }
      wants.add(id);
    }
    saveWants();
    updateWantsButton();
    if (selected === id) detail(byId.get(id));
    else filter();
    if (!$('#myList').hidden) renderMyList();
    notify(wants.has(id) ? (language === 'en' ? 'Added to my list' : '已加入清单')
      : (language === 'en' ? 'Removed from my list' : '已从清单移除'));
  }

  function shareList() {
    var ids = wantsArray();
    if (!ids.length) { notify(language === 'en' ? 'Pick at least one place first' : '请先选至少一个地点'); return; }
    var url = buildShareUrl(ids);
    var text = listText(ids);
    shareOrCopy('My Hainan list (' + ids.length + ')', text, url);
  }

  function openIncoming(ids) {
    incoming = ids.filter(function (id) { return byId.has(id); });
    if (!incoming.length) return showList();
    listMode = 'incoming';
    $('#overview').hidden = false; $('#publicDetail').hidden = true;
    $('#myList').hidden = false;
    $('#myList').innerHTML = '<div class="public-card"><div class="section-heading"><h2>' +
      (language === 'en' ? 'A list shared with you' : '朋友分享给你的清单') + ' · ' + incoming.length + '</h2></div>' +
      '<ul class="want-list">' + incoming.map(function (id) {
        var p = byId.get(id);
        return '<li><button class="linklike" type="button" data-open="' + id + '">' + esc(label(p)) +
          '</button> <small>' + esc(p.city) + '</small></li>';
      }).join('') + '</ul>' +
      '<div class="public-row"><button class="btn btn-primary" id="saveIncoming" type="button">' +
        (language === 'en' ? 'Save this list to my picks' : '把这份清单存到我的收藏') + '</button>' +
      '<button class="btn" id="closeList" type="button">' + (language === 'en' ? 'Browse all' : '浏览全部') + '</button></div></div>';
    filter();
  }

  function parseSelected(value) {
    return String(value || '').split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return /^\d{1,4}$/.test(s) && byId.has(s); })
      .filter(function (s, i, arr) { return arr.indexOf(s) === i; })
      .slice(0, MAX_SELECTED);
  }

  // ---- events ----
  $('#publicSearch').addEventListener('input', function (e) { query = e.target.value; filter(); });
  $('#publicCity').addEventListener('change', function (e) { city = e.target.value; filter(); });
  $('#categoryFilters').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-category]');
    if (!btn) return;
    category = btn.dataset.category;
    $('#categoryFilters').querySelectorAll('[data-category]').forEach(function (x) { x.classList.toggle('active', x === btn); });
    filter();
  });
  $('#wantsButton').addEventListener('click', function () {
    if (listMode === 'wants') { listMode = 'all'; $('#myList').hidden = true; showList(); }
    else { listMode = 'wants'; renderMyList(); showList(); }
  });
  $('#publicResults').addEventListener('click', function (e) {
    var want = e.target.closest('[data-want]');
    if (want) { e.preventDefault(); toggleWant(want.dataset.want); return; }
    var item = e.target.closest('[data-open]');
    if (item) selectPlace(item.dataset.open, false);
  });
  $('#publicDetail').addEventListener('click', function (e) {
    var want = e.target.closest('[data-want]');
    if (want) { toggleWant(want.dataset.want); return; }
    if (e.target.closest('#viewAll')) all();
    else if (e.target.closest('#copyDescription')) {
      var p = byId.get(selected); if (p) copy((language === 'en' ? p.en : p.cn) + '\n' + p.mapGoogle);
    } else if (e.target.closest('#sharePlace')) currentShare();
  });
  $('#myList').addEventListener('click', function (e) {
    var want = e.target.closest('[data-want]');
    if (want) { toggleWant(want.dataset.want); return; }
    var item = e.target.closest('[data-open]');
    if (item) { selectPlace(item.dataset.open, false); return; }
    if (e.target.closest('#shareList')) shareList();
    else if (e.target.closest('#copyList')) copy(listText(wantsArray()).concat('\n' + buildShareUrl(wantsArray())));
    else if (e.target.closest('#clearList')) {
      wants = new Set(); saveWants(); renderMyList(); showList();
      notify(language === 'en' ? 'List cleared' : '清单已清空');
    } else if (e.target.closest('#saveIncoming')) {
      incoming.forEach(function (id) { if (wants.size < MAX_SELECTED) wants.add(id); });
      saveWants(); listMode = 'all'; $('#myList').hidden = true; showList();
      notify(language === 'en' ? 'Saved to my picks' : '已存到我的收藏');
    } else if (e.target.closest('#closeList')) {
      listMode = 'all'; $('#myList').hidden = true; showList();
    }
  });
  $('#language').addEventListener('click', function () {
    language = language === 'en' ? 'cn' : 'en';
    $('#language').textContent = language === 'en' ? '中文' : 'English';
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    applyStaticI18n();
    initFilters();
    if (selected) detail(byId.get(selected));
    else { filter(); if (!$('#myList').hidden) renderMyList(); }
  });
  window.addEventListener('popstate', function () {
    var params = new URLSearchParams(location.search);
    var id = params.get('place');
    if (id && byId.has(id)) detail(byId.get(id));
    else { listMode = 'all'; $('#myList').hidden = true; showList(); }
  });

  // ---- boot ----
  applyStaticI18n();
  initFilters();
  var params = new URLSearchParams(location.search);
  var shared = parseSelected(params.get('selected'));
  if (shared.length) openIncoming(shared);
  var initial = params.get('place');
  if (initial && byId.has(initial)) detail(byId.get(initial));
  else if (!shared.length) showList();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }

  // 供自动化验收读取，不暴露任何私人数据
  window.__publicShare = {
    buildShareUrl: buildShareUrl,
    wants: function () { return wantsArray(); },
    parseSelected: parseSelected,
  };
})();