(() => {
  'use strict';

  if (window.__streakyAmbossV4) return;
  window.__streakyAmbossV4 = true;

  const STORE_KEY = 'ambossStreakLeaderboard.v2';
  const PANEL_ID = 'amboss-streak-leaderboard-root';
  const DEFAULT_SERVER_URL = 'https://streaky-zeta.vercel.app';
  const MAX_HISTORY = 5000;
  const SYNC_DEBOUNCE_MS = 900;

  const POSITIVE_IMAGES = Array.from({ length: 10 }, (_, i) => chrome.runtime.getURL(`assets/positive-streak/${String(i + 1).padStart(2, '0')}.png`));
  const NEGATIVE_IMAGES = Array.from({ length: 10 }, (_, i) => chrome.runtime.getURL(`assets/negative-streak/${String(i + 1).padStart(2, '0')}.png`));

  const DEFAULT_STATE = {
    username: '',
    serverUrl: DEFAULT_SERVER_URL,
    theme: 'dark',
    streak: 0,
    wrongStreak: 0,
    best: 0,
    totalCorrect: 0,
    totalWrong: 0,
    answered: {},
    history: [],
    lastAnswerCorrect: true,
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
    s.serverUrl = DEFAULT_SERVER_URL;
    s.theme = s.theme === 'light' ? 'light' : 'dark';
    s.streak = nn(s.streak);
    s.wrongStreak = nn(s.wrongStreak);
    s.best = nn(s.best);
    s.totalCorrect = nn(s.totalCorrect);
    s.totalWrong = nn(s.totalWrong);
    s.answered = s.answered && typeof s.answered === 'object' ? s.answered : {};
    s.history = Array.isArray(s.history) ? s.history.slice(-MAX_HISTORY) : [];
    s.importedSessions = s.importedSessions && typeof s.importedSessions === 'object' ? s.importedSessions : {};
    s.lastAnswerCorrect = s.lastAnswerCorrect !== false;
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
    if (!original || original.__streakyPatched) return;
    const patched = function (...args) {
      const result = original.apply(this, args);
      onRouteMaybeChanged();
      return result;
    };
    patched.__streakyPatched = true;
    history[method] = patched;
  }

  function onRouteMaybeChanged() {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
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
    changed = importExistingAnswered(questions, reason) || changed;
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
      list.push({ key, href, number, status: getQuestionStatus(row) });
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
    return changed;
  }

  function addAnswer(correct, q, reason) {
    if (!q || !q.key || state.answered[q.key]) return false;
    const entry = { key: q.key, correct: !!correct, number: q.number || 0, at: Date.now(), url: location.href, reason };
    state.answered[q.key] = entry;
    state.history.push(entry);
    state.history = state.history.slice(-MAX_HISTORY);
    rebuildStats();
    state.lastEventText = correct ? `✓ Frage ${q.number || ''} gezählt` : `✕ Frage ${q.number || ''} gezählt`;
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
    let streak = 0, wrongStreak = 0, best = 0, correct = 0, wrong = 0;
    let lastAnswerCorrect = true;
    for (const item of unique) {
      if (item.correct) { correct++; streak++; wrongStreak = 0; best = Math.max(best, streak); lastAnswerCorrect = true; }
      else { wrong++; streak = 0; wrongStreak++; lastAnswerCorrect = false; }
    }
    state.history = unique.slice(-MAX_HISTORY);
    state.streak = streak;
    state.wrongStreak = wrongStreak;
    state.best = Math.max(best, state.best || 0);
    state.totalCorrect = correct;
    state.totalWrong = wrong;
    state.lastAnswerCorrect = lastAnswerCorrect;
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
      serverUrl: DEFAULT_SERVER_URL,
      streak: state.streak,
      best: state.best,
      totalCorrect: state.totalCorrect,
      totalWrong: state.totalWrong,
      lastEventText: state.lastEventText
    };
    chrome.runtime.sendMessage({ type: 'AMBOSS_STREAK_SYNC', payload }, (res) => {
      if (chrome.runtime.lastError) state.lastSyncText = `Sync-Fehler: ${chrome.runtime.lastError.message}`;
      else if (!res || !res.ok) state.lastSyncText = `Sync-Fehler: ${(res && res.error) || 'unbekannt'}`;
      else { state.lastSyncText = 'Leaderboard aktualisiert'; state.lastSyncAt = Date.now(); }
      updateSyncButton();
      chrome.storage.local.set({ [STORE_KEY]: sanitize(state) });
    });
  }

  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const host = document.createElement('div');
    host.id = PANEL_ID;
    host.style.cssText = 'position:fixed; top:96px; right:18px; z-index:2147483647; width:190px;';
    const shadow = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .box { overflow:hidden; border-radius:22px; background: radial-gradient(circle at 50% 0%, rgba(255,108,0,.28), rgba(12,18,26,.98) 48%, rgba(7,10,14,.98)); color: white; box-shadow: 0 18px 50px rgba(0,0,0,.38), 0 0 28px rgba(255,93,0,.22); border: 1px solid rgba(255,187,75,.28); font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; user-select: none; }
        .box.negative { background: radial-gradient(circle at 50% 0%, rgba(255,55,55,.2), rgba(26,12,18,.98) 48%, rgba(12,5,8,.98)); border-color: rgba(255,95,95,.3); box-shadow: 0 18px 50px rgba(0,0,0,.38), 0 0 28px rgba(255,0,42,.16); }
        .top { display:flex; align-items:center; justify-content:space-between; padding: 9px 11px; cursor: grab; background: rgba(255,255,255,.055); backdrop-filter: blur(7px); }
        .title { font-size: 11px; font-weight: 900; letter-spacing: .07em; color: #ffd38a; }
        .user { max-width: 100px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 11px; opacity:.82; }
        .collapse { all:unset; width:22px; height:22px; text-align:center; border-radius:8px; cursor:pointer; color:#fff3d7; font-weight:900; }
        .collapse:hover { background: rgba(255,255,255,.11); }
        .flameWrap { position: relative; height: 126px; display:grid; place-items:center; overflow:hidden; }
        .flame { width: 112px; height: 112px; border-radius: 18px; background-size: contain; background-repeat:no-repeat; background-position:center; filter: drop-shadow(0 0 14px rgba(255,98,0,.65)); transform: translateZ(0); animation: float 1.25s ease-in-out infinite; }
        .negative .flame { filter: drop-shadow(0 0 10px rgba(255,80,80,.35)); animation: wobble 1.45s ease-in-out infinite; }
        .aura { position:absolute; inset:6px; pointer-events:none; opacity:.8; background: radial-gradient(ellipse at 50% 80%, rgba(255,190,20,.34) 0 18%, transparent 42%); animation: aura 1.2s ease-in-out infinite; }
        .negative .aura { background: radial-gradient(ellipse at 50% 80%, rgba(255,60,80,.22) 0 18%, transparent 42%); }
        .streakRow { display:flex; align-items:end; gap:8px; padding: 0 14px 6px; }
        .num { font-size: 44px; font-weight: 1000; line-height: .92; letter-spacing:-.055em; text-shadow: 0 0 20px rgba(255,124,0,.42); }
        .label { font-size: 12px; font-weight:800; color:#ffd38a; padding-bottom:5px; }
        .negative .label { color:#ffb2b2; }
        .meta { display:flex; justify-content:space-between; padding: 0 14px 11px; font-size: 12px; color: rgba(255,255,255,.84); }
        .buttons { display:grid; grid-template-columns: 1fr; border-top:1px solid rgba(255,255,255,.08); }
        button.sync { all:unset; text-align:center; padding:10px 4px; font-size:11px; font-weight:900; color:#fff0ce; cursor:pointer; background: rgba(255,255,255,.055); }
        button.sync:hover { background: rgba(255,150,0,.18); }
        .pulseGood { animation: popGood .45s ease; }
        .pulseBad { animation: popBad .45s ease; }
        @keyframes float { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-4px) scale(1.04)} }
        @keyframes wobble { 0%,100%{transform:rotate(0deg) translateY(0)} 33%{transform:rotate(-2deg) translateY(1px)} 66%{transform:rotate(2deg) translateY(-1px)} }
        @keyframes aura { 0%,100%{transform:scale(.92); opacity:.55} 50%{transform:scale(1.05); opacity:.95} }
        @keyframes popGood { 0%{transform:scale(1)} 42%{transform:scale(1.06); box-shadow:0 0 45px rgba(255,150,0,.55)} 100%{transform:scale(1)} }
        @keyframes popBad { 0%{transform:translateX(0)} 25%{transform:translateX(-5px)} 50%{transform:translateX(5px)} 75%{transform:translateX(-3px)} 100%{transform:translateX(0)} }
      </style>
      <div class="box" part="box">
        <div class="top" data-drag><div class="title">🔥 STREAKY</div><div class="user" data-user>kein Name</div><button class="collapse" data-action="collapse">–</button></div>
        <div data-body>
          <div class="flameWrap"><div class="aura"></div><div class="flame" data-flame></div></div>
          <div class="streakRow"><div class="num" data-current>0</div><div class="label" data-label>richtig</div></div>
          <div class="meta"><span>Best: <b data-best>0</b></span><span>✓ <b data-correct>0</b> · ✕ <b data-wrong>0</b></span></div>
          <div class="buttons"><button class="sync" data-action="sync">Jetzt syncen</button></div>
        </div>
      </div>`;
    panel = {
      host, shadow,
      box: shadow.querySelector('.box'), body: shadow.querySelector('[data-body]'), flame: shadow.querySelector('[data-flame]'),
      current: shadow.querySelector('[data-current]'), label: shadow.querySelector('[data-label]'),
      best: shadow.querySelector('[data-best]'), correct: shadow.querySelector('[data-correct]'), wrong: shadow.querySelector('[data-wrong]'),
      user: shadow.querySelector('[data-user]'), syncBtn: shadow.querySelector('[data-action="sync"]')
    };
    shadow.addEventListener('click', onShadowClick);
    makeDraggable(host, shadow.querySelector('[data-drag]'));
  }

  function ensurePanel() {
    if (!document.getElementById(PANEL_ID)) { panel = null; createPanel(); updatePanel(); }
  }

  function updatePanel() {
    if (!panel) return;
    const negative = state.wrongStreak > 0;
    const shown = negative ? state.wrongStreak : state.streak;
    panel.current.textContent = String(shown || 0);
    panel.label.textContent = negative ? 'falsch-serie' : 'richtig';
    panel.best.textContent = String(state.best || 0);
    panel.correct.textContent = String(state.totalCorrect || 0);
    panel.wrong.textContent = String(state.totalWrong || 0);
    panel.user.textContent = state.username ? `@${state.username}` : 'Name setzen';
    panel.box.classList.toggle('negative', negative);
    const image = negative ? imageFor(NEGATIVE_IMAGES, state.wrongStreak) : imageFor(POSITIVE_IMAGES, state.streak);
    panel.flame.style.backgroundImage = `url("${image}")`;
    updateSyncButton();
  }

  function imageFor(list, value) {
    const index = Math.max(0, Math.min(9, (nn(value) || 1) - 1));
    return list[index] || list[0];
  }

  function updateSyncButton() {
    if (!panel || !panel.syncBtn) return;
    if (!state.username) panel.syncBtn.textContent = 'Name im Add-on setzen';
    else if (/fehler/i.test(state.lastSyncText || '')) panel.syncBtn.textContent = 'Sync erneut versuchen';
    else panel.syncBtn.textContent = 'Jetzt syncen';
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
    // Buttons live inside the Shadow DOM; handler kept as safety net.
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
      if (state.username) {
        panel.syncBtn.textContent = 'Sync läuft…';
        syncNow();
      }
    }
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
