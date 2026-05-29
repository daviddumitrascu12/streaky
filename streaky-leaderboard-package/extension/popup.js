const STORE_KEY = 'ambossStreakLeaderboard.v2';
const DEFAULT_STATE = {
  username: '',
  serverUrl: 'http://localhost:3000',
  streak: 0,
  best: 0,
  totalCorrect: 0,
  totalWrong: 0,
  answered: {},
  history: [],
  paused: false,
  lastEventText: 'Name im Add-on-Popup setzen',
  lastSyncText: 'Noch nicht synchronisiert',
  lastSyncAt: 0,
  importedSessions: {}
};

const $ = (id) => document.getElementById(id);
let state = { ...DEFAULT_STATE };

function load() {
  chrome.storage.local.get([STORE_KEY], (res) => {
    state = { ...DEFAULT_STATE, ...(res && res[STORE_KEY] ? res[STORE_KEY] : {}) };
    render();
  });
}

function save(sync = false) {
  chrome.storage.local.set({ [STORE_KEY]: state }, () => {
    render();
    if (sync && state.username) syncNow();
  });
}

function render() {
  $('username').value = state.username || '';
  $('serverUrl').value = state.serverUrl || DEFAULT_STATE.serverUrl;
  $('streak').textContent = state.streak || 0;
  $('best').textContent = state.best || 0;
  $('correct').textContent = state.totalCorrect || 0;
  $('togglePause').textContent = state.paused ? 'Weiter' : 'Pause';
  $('status').textContent = `${state.lastEventText || ''}\n${state.lastSyncText || ''}`;
}

function syncNow() {
  chrome.runtime.sendMessage({
    type: 'AMBOSS_STREAK_SYNC',
    payload: {
      username: state.username,
      serverUrl: state.serverUrl || DEFAULT_STATE.serverUrl,
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
    chrome.storage.local.set({ [STORE_KEY]: state }, render);
  });
}

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('username').value.trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
  if (!name) return;
  state.username = name;
  state.serverUrl = ($('serverUrl').value || DEFAULT_STATE.serverUrl).trim().replace(/\/+$/, '');
  state.lastEventText = `Name gesetzt: ${name}`;
  save(true);
});

$('togglePause').addEventListener('click', () => {
  state.paused = !state.paused;
  state.lastEventText = state.paused ? 'Pausiert' : 'Automatik aktiv';
  save(false);
});

$('reset').addEventListener('click', () => {
  if (!confirm('Wirklich lokalen Streak zurücksetzen? Das Leaderboard wird beim nächsten Sync überschrieben.')) return;
  state = { ...DEFAULT_STATE, username: state.username, serverUrl: state.serverUrl, lastEventText: 'Lokal zurückgesetzt' };
  save(true);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORE_KEY]) {
    state = { ...DEFAULT_STATE, ...(changes[STORE_KEY].newValue || {}) };
    render();
  }
});

load();
