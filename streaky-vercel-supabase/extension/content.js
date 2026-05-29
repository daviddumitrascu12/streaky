(() => {
  'use strict';

  if (window.__ambossStreakLeaderboardV2) return;
  window.__ambossStreakLeaderboardV2 = true;

  const STORE_KEY = 'ambossStreakLeaderboard.v2';
  const PANEL_ID = 'amboss-streak-leaderboard-root';
  const MAX_HISTORY = 5000;
  const SYNC_DEBOUNCE_MS = 900;

  const DEFAULT_STATE = {
    username: '',
    serverUrl: 'https://streaky-zeta.vercel.app',
    theme: 'dark',
    streak: 0,
    best: 0,
    totalCorrect: 0,
    totalWrong: 0,
    answered: {},
    history: [],
        lastEventText: 'Name im Add-on-Popup setzen',
    lastSyncText: 'Noch nicht synchronisiert',
    lastSyncAt: 0,
    importedSessions: {}
  };

  let state = { ...DEFAULT_STATE };
  let panel = null;
  let observer = null;
  let scanTimer = null;
  let routeTimer = null;
  let syncTimer = null;
  let lastHref = location.href;
  let knownStatuses = new Map();
  let ready = false;

  init();

  async function init() {
    state = await loadState();
    await waitForBody();
    createPanel();
    attachListeners();
    observeDom();
    ready = true;
    scanSidebar('Start');
    updatePanel();
    setInterval(() => {
      ensurePanel();
      scanSidebar('Intervall');
    }, 1300);
  }

  function waitForBody() {
    return new Promise((resolve) => {
      if (document.body) resolve();
      else {
        const timer = setInterval(() => {
          if (document.body) { clearInterval(timer); resolve(); }
        }, 40);
      }
    });
  }

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORE_KEY], (res) => resolve(sanitize({ ...DEFAULT_STATE, ...(res && res[STORE_KEY] ? res[STORE_KEY] : {}) })));
    });
  }

  function saveState(sync = true) {
    state = sanitize(state);
    updatePanel();
    chrome.storage.local.set({ [STORE_KEY]: state }, () => {
      if (sync) scheduleSync();
    });
  }

  function sanitize(input) {
    const s = { ...DEFAULT_STATE, ...(input || {}) };
    s.username = String(s.username || '').trim().slice(0, 32);
    s.serverUrl = DEFAULT_STATE.serverUrl;
    s.streak = nn(s.streak); s.best = nn(s.best); s.totalCorrect = nn(s.totalCorrect); s.totalWrong = nn(s.totalWrong);
    s.answered = s.answered && typeof s.answered === 'object' ? s.answered : {};
    s.history = Array.isArray(s.history) ? s.history.slice(-MAX_HISTORY) : [];
    s.theme = s.theme === 'light' ? 'light' : 'dark';
    s.importedSessions = s.importedSessions && typeof s.importedSessions === 'object' ? s.importedSessions : {};
    s.lastEventText = String(s.lastEventText || 'Automatik aktiv');
    s.lastSyncText = String(s.lastSyncText || 'Noch nicht synchronisiert');
    s.lastSyncAt = nn(s.lastSyncAt);
    return s;
  }

  function nn(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function attachListeners() {
    document.addEventListener('click', onPanelClick, true);
    window.addEventListener('popstate', onRouteMaybeChanged);
    patchHistory('pushState');
    patchHistory('replaceState');

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORE_KEY]) return;
      state = sanitize({ ...DEFAULT_STATE, ...(changes[STORE_KEY].newValue || {}) });
      updatePanel();
      if (state.username) scheduleSync();
    });
  }

  function patchHistory(method) {
    const original = history[method];
    if (!original || original.__ambossStreakLeaderboardPatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      onRouteMaybeChanged();
      return result;
    };
    patched.__ambossStreakLeaderboardPatched = true;
    history[method] = patched;
  }

  function onRouteMaybeChanged() {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        state.lastEventText = 'Neue Frage/Sitzung erkannt – Streak bleibt erhalten';
        knownStatuses = new Map();
        updatePanel();
      }
      scanSidebar('Route');
    }, 160);
  }

  function observeDom() {
    observer = new MutationObserver(() => {
      if (!ready) return;
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => scanSidebar('DOM'), 160);
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-testid', 'data-test-id', 'data-e2e-test-id', 'aria-label', 'href']
    });
  }

  function scanSidebar(reason) {
    const questions = getSidebarQuestions();
    if (!questions.length) return;

    let changed = false;
    for (const q of questions) {
      if (!q.key || q.status === 'unknown') continue;
      const prev = knownStatuses.get(q.key);
      knownStatuses.set(q.key, q.status);

      if ((prev === 'unanswered' || prev === 'unknown') && q.status !== 'unanswered') {
        changed = addAnswer(q.status === 'correct', q, `live: ${reason}`) || changed;
      }
    }

    const newlyImported = importExistingAnswered(questions, reason);
    changed = changed || newlyImported;
    if (changed) saveState(true);
    else updatePanel();
  }

  function getSidebarQuestions() {
    const links = Array.from(document.querySelectorAll('a[href*="/questions/"]'));
    const list = [];
    const seen = new Set();

    for (const link of links) {
      const row = link.querySelector('[data-e2e-test-id^="question-selected"], [id*="_"]') || link;
      const href = link.href || link.getAttribute('href') || '';
      const key = normalizeQuestionHref(href);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const number = getQuestionNumber(row, href);
      list.push({ key, href, number, status: getQuestionStatus(row), selected: /question-selected-true/i.test(row.getAttribute('data-e2e-test-id') || '') });
    }

    return list.sort((a, b) => (a.number || 999999) - (b.number || 999999));
  }

  function getQuestionStatus(row) {
    if (!row) return 'unknown';
    const html = (row.innerHTML || '').toLowerCase();
    const text = `${row.getAttribute('class') || ''} ${row.getAttribute('data-testid') || ''} ${html}`.toLowerCase();
    if (row.querySelector('[data-testid="check-circle-filled-dotContainerGreen"], [data-testid*="dotContainerGreen"], [class*="dotContainerGreen"], [data-testid*="check-circle" i]')) return 'correct';
    if (row.querySelector('[data-testid*="dotContainerRed"], [class*="dotContainerRed"], [data-testid*="x-circle" i], [data-testid*="cross" i], [data-testid*="wrong" i]')) return 'wrong';
    if (/dotcontainergreen|check-circle-filled-dotcontainergreen/.test(text)) return 'correct';
    if (/dotcontainerred|wrong|incorrect|cross|x-circle/.test(text)) return 'wrong';
    if (row.querySelector('[data-testid="null-dotContainer"], [class*="dotContainer"]')) return 'unanswered';
    return 'unknown';
  }

  function getQuestionNumber(row, href) {
    const n1 = row && row.querySelector('[data-e2e-test-id^="question-"]');
    const attr = n1 ? n1.getAttribute('data-e2e-test-id') : '';
    const m1 = attr && attr.match(/question-(\d+)/i);
    if (m1) return Number(m1[1]);
    const text = (n1 && n1.textContent) || (row && row.textContent) || '';
    const m2 = text.match(/\b(\d{1,4})\b/);
    if (m2) return Number(m2[1]);
    const m3 = String(href || '').match(/\/(\d{1,4})\/?(?:[?#].*)?$/);
    return m3 ? Number(m3[1]) : 0;
  }

  function normalizeQuestionHref(href) {
    try {
      const url = new URL(href, location.href);
      url.hash = ''; url.search = '';
      return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch (_) {
      return String(href || '').split(/[?#]/)[0].replace(/\/$/, '');
    }
  }

  function importExistingAnswered(questions, reason) {
    const answeredNow = questions.filter(q => q.status === 'correct' || q.status === 'wrong');
    if (!answeredNow.length) return false;

    let changed = false;
    for (const q of answeredNow) {
      changed = addAnswer(q.status === 'correct', q, `import: ${reason}`) || changed;
    }
    if (changed) state.lastEventText = `${answeredNow.length} vorhandene Antworten geprüft – Streak bleibt global`;
    return changed;
  }

  function addAnswer(correct, q, reason) {
    if (!q || !q.key || state.answered[q.key]) return false;
    const entry = {
      key: q.key,
      correct: !!correct,
      number: q.number || 0,
      at: Date.now(),
      url: location.href,
      reason
    };
    state.answered[q.key] = entry;
    state.history.push(entry);
    state.history = state.history.slice(-MAX_HISTORY);
    rebuildStats();
    state.lastEventText = correct ? `✓ Frage ${q.number || ''} gezählt` : `✕ Frage ${q.number || ''} gezählt – Streak reset`;
    pulse(correct);
    return true;
  }

  function rebuildStats() {
    const unique = [];
    const seen = new Set();
    for (const item of state.history) {
      if (!item || !item.key || seen.has(item.key)) continue;
      seen.add(item.key);
      unique.push(item);
    }
    unique.sort((a, b) => (a.at || 0) - (b.at || 0));

    let streak = 0, best = 0, correct = 0, wrong = 0;
    for (const item of unique) {
      if (item.correct) { correct++; streak++; best = Math.max(best, streak); }
      else { wrong++; streak = 0; }
    }
    state.history = unique.slice(-MAX_HISTORY);
    state.streak = streak;
    state.best = Math.max(best, state.best || 0);
    state.totalCorrect = correct;
    state.totalWrong = wrong;
  }

  function scheduleSync() {
    if (!state.username) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, SYNC_DEBOUNCE_MS);
  }

  function syncNow() {
    if (!state.username) return;
    const payload = {
      username: state.username,
      serverUrl: DEFAULT_STATE.serverUrl,
      streak: state.streak,
      best: state.best,
      totalCorrect: state.totalCorrect,
      totalWrong: state.totalWrong,
      lastEventText: state.lastEventText
    };
    chrome.runtime.sendMessage({ type: 'AMBOSS_STREAK_SYNC', payload }, (res) => {
      if (chrome.runtime.lastError) {
        state.lastSyncText = `Sync-Fehler: ${chrome.runtime.lastError.message}`;
      } else if (!res || !res.ok) {
        state.lastSyncText = `Sync-Fehler: ${(res && res.error) || 'unbekannt'}`;
      } else {
        state.lastSyncText = 'Leaderboard aktualisiert';
        state.lastSyncAt = Date.now();
      }
      chrome.storage.local.set({ [STORE_KEY]: state });
      updatePanel();
    });
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.position = 'fixed';
    host.style.right = '18px';
    host.style.top = '88px';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'auto';
    document.body.appendChild(host);

    const s1 = chrome.runtime.getURL('assets/flame-stage-1.png');
    const s2 = chrome.runtime.getURL('assets/flame-stage-2.png');
    const s3 = chrome.runtime.getURL('assets/flame-stage-3.png');
    const s4 = chrome.runtime.getURL('assets/flame-stage-4.png');
    const s5 = chrome.runtime.getURL('assets/flame-stage-5.png');
    const s6 = chrome.runtime.getURL('assets/flame-stage-6.png');

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .box { width: 232px; border-radius: 18px; overflow: hidden; background: radial-gradient(circle at 50% 0%, rgba(255,108,0,.28), rgba(12,18,26,.98) 48%, rgba(7,10,14,.98)); color: white; box-shadow: 0 18px 50px rgba(0,0,0,.38), 0 0 28px rgba(255,93,0,.22); border: 1px solid rgba(255,187,75,.28); font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none; }
        .top { display:flex; align-items:center; justify-content:space-between; padding: 9px 11px; cursor: grab; background: rgba(255,255,255,.055); backdrop-filter: blur(7px); }
        .title { font-size: 11px; font-weight: 900; letter-spacing: .07em; color: #ffd38a; }
        .user { max-width: 105px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 11px; opacity:.82; }
        .flameWrap { position: relative; height: 116px; display:grid; place-items:center; overflow:hidden; }
        .flame { width: 98px; height: 98px; border-radius: 18px; background-size: cover; background-position:center; filter: drop-shadow(0 0 14px rgba(255,98,0,.65)); transform: translateZ(0); transition: transform .25s ease, filter .25s ease; }
        .stage1 .flame { background-image:url('${s1}'); width:82px; height:82px; animation: idle 1.7s ease-in-out infinite; }
        .stage2 .flame { background-image:url('${s2}'); width:92px; height:92px; animation: rocket 1.1s ease-in-out infinite; }
        .stage3 .flame { background-image:url('${s3}'); width:102px; height:102px; animation: comet .9s ease-in-out infinite; }
        .stage4 .flame { background-image:url('${s4}'); width:108px; height:108px; animation: quake .75s ease-in-out infinite; }
        .stage5 .flame { background-image:url('${s5}'); width:112px; height:112px; animation: phoenix 1s ease-in-out infinite; }
        .stage6 .flame { background-image:url('${s6}'); width:120px; height:120px; animation: godmode .58s ease-in-out infinite; filter: drop-shadow(0 0 26px rgba(255,195,0,.95)); }
        .spark, .spark2, .ring { position:absolute; inset:0; pointer-events:none; opacity:0; }
        .stage3 .spark, .stage4 .spark, .stage5 .spark, .stage6 .spark { opacity: 1; background: radial-gradient(circle at 18% 30%, #fffa8a 0 2px, transparent 3px), radial-gradient(circle at 82% 22%, #ff5b12 0 2px, transparent 3px), radial-gradient(circle at 72% 70%, #ffd25a 0 2px, transparent 3px); animation: sparks .9s linear infinite; }
        .stage5 .spark2, .stage6 .spark2 { opacity:1; background: radial-gradient(circle at 21% 14%, #ff38d1 0 2px, transparent 3px), radial-gradient(circle at 78% 18%, #39a7ff 0 2px, transparent 3px), radial-gradient(circle at 52% 6%, #fff174 0 3px, transparent 4px); animation: fireworks 1.05s ease-in-out infinite; }
        .stage6 .ring { opacity:1; background: radial-gradient(ellipse at 50% 78%, transparent 0 34%, rgba(255,93,0,.55) 36%, transparent 42%); animation: shock .65s ease-out infinite; }
        .streakRow { display:flex; align-items:end; gap:8px; padding: 0 14px 6px; }
        .num { font-size: 44px; font-weight: 1000; line-height: .92; letter-spacing:-.055em; text-shadow: 0 0 20px rgba(255,124,0,.42); }
        .label { font-size: 12px; font-weight:800; color:#ffd38a; padding-bottom:5px; }
        .meta { display:flex; justify-content:space-between; padding: 0 14px 10px; font-size: 12px; color: rgba(255,255,255,.84); }
        .status { min-height:31px; padding:8px 14px; font-size:11px; line-height:1.32; background: rgba(255,255,255,.06); color: rgba(255,255,255,.86); }
        .sync { padding: 7px 14px; font-size: 10.5px; color: rgba(255,218,155,.82); border-top: 1px solid rgba(255,255,255,.06); }
        .buttons { display:grid; grid-template-columns: 1fr; border-top:1px solid rgba(255,255,255,.08); }
        button { all:unset; text-align:center; padding:9px 4px; font-size:11px; font-weight:900; color:#fff0ce; cursor:pointer; background: rgba(255,255,255,.055); border-right:1px solid rgba(255,255,255,.07); }
        button:hover { background: rgba(255,150,0,.18); }
        .pulseGood { animation: popGood .45s ease; }
        .pulseBad { animation: popBad .45s ease; }
        @keyframes idle { 0%,100%{transform:scale(1)} 50%{transform:scale(1.045) translateY(-2px)} }
        @keyframes rocket { 0%,100%{transform:translateY(1px) scale(1)} 50%{transform:translateY(-5px) scale(1.06)} }
        @keyframes comet { 0%,100%{transform:rotate(-3deg) translateX(0) scale(1)} 50%{transform:rotate(3deg) translateX(5px) scale(1.06)} }
        @keyframes quake { 0%,100%{transform:translate(0,0) scale(1)} 25%{transform:translate(2px,-2px) scale(1.05)} 50%{transform:translate(-2px,1px) scale(1.08)} 75%{transform:translate(1px,2px) scale(1.04)} }
        @keyframes phoenix { 0%,100%{transform:rotate(-2deg) scale(1)} 50%{transform:rotate(2deg) scale(1.08)} }
        @keyframes godmode { 0%,100%{transform:scale(1) rotate(-1deg)} 50%{transform:scale(1.12) rotate(1deg)} }
        @keyframes sparks { from{transform:translateY(8px); opacity:.45} to{transform:translateY(-10px); opacity:1} }
        @keyframes fireworks { 0%,100%{transform:scale(.92); opacity:.65} 50%{transform:scale(1.08); opacity:1} }
        @keyframes shock { from{transform:scale(.65); opacity:1} to{transform:scale(1.25); opacity:0} }
        @keyframes popGood { 0%{transform:scale(1)} 42%{transform:scale(1.06); box-shadow:0 0 45px rgba(255,150,0,.55)} 100%{transform:scale(1)} }
        @keyframes popBad { 0%{transform:translateX(0)} 25%{transform:translateX(-5px)} 50%{transform:translateX(5px)} 75%{transform:translateX(-3px)} 100%{transform:translateX(0)} }
      </style>
      <div class="box" part="box">
        <div class="top" data-drag><div class="title">🔥 STREAKY</div><div class="user" data-user>kein Name</div><button data-action="collapse">–</button></div>
        <div data-body>
          <div class="flameWrap stage1" data-stage><div class="spark"></div><div class="spark2"></div><div class="ring"></div><div class="flame"></div></div>
          <div class="streakRow"><div class="num" data-current>0</div><div class="label">aktuell</div></div>
          <div class="meta"><span>Best: <b data-best>0</b></span><span>✓ <b data-correct>0</b> · ✕ <b data-wrong>0</b></span></div>
          <div class="status" data-status></div>
          <div class="sync" data-sync></div>
          <div class="buttons"><button data-action="sync">Jetzt syncen</button></div>
        </div>
      </div>`;

    panel = {
      host, shadow,
      box: shadow.querySelector('.box'), body: shadow.querySelector('[data-body]'), stage: shadow.querySelector('[data-stage]'),
      current: shadow.querySelector('[data-current]'), best: shadow.querySelector('[data-best]'), correct: shadow.querySelector('[data-correct]'), wrong: shadow.querySelector('[data-wrong]'),
      status: shadow.querySelector('[data-status]'), sync: shadow.querySelector('[data-sync]'), user: shadow.querySelector('[data-user]')
    };
    shadow.addEventListener('click', onShadowClick);
    makeDraggable(host, shadow.querySelector('[data-drag]'));
  }

  function ensurePanel() {
    if (!document.getElementById(PANEL_ID)) { panel = null; createPanel(); updatePanel(); }
  }

  function updatePanel() {
    if (!panel) return;
    panel.current.textContent = String(state.streak || 0);
    panel.best.textContent = String(state.best || 0);
    panel.correct.textContent = String(state.totalCorrect || 0);
    panel.wrong.textContent = String(state.totalWrong || 0);
    panel.user.textContent = state.username ? `@${state.username}` : 'Name setzen';
    panel.status.textContent = state.username ? state.lastEventText : 'Öffne das Add-on und wähle zuerst deinen Namen.';
    panel.sync.textContent = state.username ? state.lastSyncText : 'Leaderboard-Sync wartet auf Namen.';
    const stage = getStage(state.streak || 0);
    panel.stage.className = `flameWrap stage${stage}`;
  }

  function getStage(streak) {
    if (streak >= 50) return 6;
    if (streak >= 30) return 5;
    if (streak >= 15) return 4;
    if (streak >= 8) return 3;
    if (streak >= 3) return 2;
    return 1;
  }

  function pulse(correct) {
    if (!panel || !panel.box) return;
    const cls = correct ? 'pulseGood' : 'pulseBad';
    panel.box.classList.remove('pulseGood', 'pulseBad');
    void panel.box.offsetWidth;
    panel.box.classList.add(cls);
    setTimeout(() => panel && panel.box && panel.box.classList.remove(cls), 500);
  }

  function onPanelClick(event) {
    // Buttons live inside the Shadow DOM, so this document-level handler is only a safety net.
  }

  function onShadowClick(event) {
    const button = event.target && event.target.closest && event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const action = button.getAttribute('data-action');
    if (action === 'collapse') {
      const hidden = panel.body.style.display === 'none';
      panel.body.style.display = hidden ? '' : 'none';
    } else if (action === 'sync') {
      state.lastEventText = state.username ? `Sync gestartet für ${state.username}` : 'Bitte zuerst im Add-on einen Namen setzen';
      saveState(false);
      if (state.username) syncNow();
    }
  }

  function getNumberFromLocation() {
    const m = location.pathname.match(/\/(\d{1,4})\/?$/);
    return m ? Number(m[1]) : 0;
  }

  function makeDraggable(host, handle) {
    let dragging = false, sx = 0, sy = 0, sr = 0, st = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest('button')) return;
      dragging = true; sx = e.clientX; sy = e.clientY;
      const r = host.getBoundingClientRect(); sr = window.innerWidth - r.right; st = r.top; e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      host.style.right = `${Math.max(6, Math.min(window.innerWidth - 70, sr - (e.clientX - sx)))}px`;
      host.style.top = `${Math.max(6, Math.min(window.innerHeight - 70, st + (e.clientY - sy)))}px`;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  }
})();
