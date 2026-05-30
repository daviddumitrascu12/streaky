const STORE_KEY = 'ambossStreakLeaderboard.v2';
const DEFAULT_SERVER_URL = 'https://streaky-zeta.vercel.app';
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

const $ = (id) => document.getElementById(id);
let state = { ...DEFAULT_STATE };

function load() {
  chrome.storage.local.get([STORE_KEY], (res) => {
    state = sanitize({ ...DEFAULT_STATE, ...(res && res[STORE_KEY] ? res[STORE_KEY] : {}) });
    render();
  });
}

function sanitize(input) {
  const s = { ...DEFAULT_STATE, ...(input || {}) };
  s.username = String(s.username || '').trim().slice(0, 32);
  s.serverUrl = DEFAULT_SERVER_URL;
  s.theme = s.theme === 'light' ? 'light' : 'dark';
  s.streak = Math.max(0, Math.floor(Number(s.streak || 0)));
  s.wrongStreak = Math.max(0, Math.floor(Number(s.wrongStreak || 0)));
  s.best = Math.max(0, Math.floor(Number(s.best || 0)));
  s.totalCorrect = Math.max(0, Math.floor(Number(s.totalCorrect || 0)));
  s.totalWrong = Math.max(0, Math.floor(Number(s.totalWrong || 0)));
  s.lastAnswerCorrect = s.lastAnswerCorrect !== false;
  return s;
}

function save(sync = false) {
  state = sanitize(state);
  chrome.storage.local.set({ [STORE_KEY]: state }, () => {
    render();
    if (sync && state.username) syncNow();
  });
}

function render() {
  document.documentElement.setAttribute('data-theme', state.theme || 'dark');
  $('themeToggle').textContent = state.theme === 'light' ? '☀️ Light' : '🌙 Dark';
  $('username').value = state.username || '';
  $('streak').textContent = state.streak || 0;
  $('wrongStreak').textContent = state.wrongStreak || 0;
  $('best').textContent = state.best || 0;
  const negative = (state.wrongStreak || 0) > 0;
  const level = Math.max(1, Math.min(10, negative ? state.wrongStreak : (state.streak || 1)));
  $('mascot').src = `assets/${negative ? 'negative-streak' : 'positive-streak'}/${String(level).padStart(2, '0')}.png`;
}

function syncNow() {
  chrome.runtime.sendMessage({
    type: 'AMBOSS_STREAK_SYNC',
    payload: {
      username: state.username,
      serverUrl: DEFAULT_SERVER_URL,
      streak: state.streak || 0,
      best: state.best || 0,
      totalCorrect: state.totalCorrect || 0,
      totalWrong: state.totalWrong || 0,
      lastEventText: state.lastEventText || ''
    }
  }, (res) => {
    if (chrome.runtime.lastError) state.lastSyncText = `Sync-Fehler: ${chrome.runtime.lastError.message}`;
    else if (!res || !res.ok) state.lastSyncText = `Sync-Fehler: ${(res && res.error) || 'unbekannt'}`;
    else { state.lastSyncText = 'Leaderboard aktualisiert'; state.lastSyncAt = Date.now(); }
    chrome.storage.local.set({ [STORE_KEY]: sanitize(state) }, render);
  });
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('username').value.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
  if (!name) return;
  state.username = name;
  state.serverUrl = DEFAULT_SERVER_URL;
  state.lastEventText = `Name gesetzt: ${name}`;
  save(true);
});

$('syncNow').addEventListener('click', () => {
  if (state.username) syncNow();
});

$('openLeaderboard').addEventListener('click', () => {
  chrome.tabs.create({ url: DEFAULT_SERVER_URL });
});

$('themeToggle').addEventListener('click', () => {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  save(false);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORE_KEY]) {
    state = sanitize({ ...DEFAULT_STATE, ...(changes[STORE_KEY].newValue || {}) });
    render();
  }
});

load();
