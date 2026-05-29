const DEFAULT_SERVER_URL = 'http://localhost:3000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'AMBOSS_STREAK_SYNC') return;

  syncLeaderboard(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));

  return true;
});

async function syncLeaderboard(payload) {
  if (!payload || !payload.username) return { skipped: true, reason: 'Kein Name gesetzt' };
  const serverUrl = String(payload.serverUrl || DEFAULT_SERVER_URL).replace(/\/+$/, '');
  const response = await fetch(`${serverUrl}/api/player`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: payload.username,
      streak: Number(payload.streak || 0),
      best: Number(payload.best || 0),
      totalCorrect: Number(payload.totalCorrect || 0),
      totalWrong: Number(payload.totalWrong || 0),
      lastEventText: String(payload.lastEventText || ''),
      clientVersion: '2.0.0'
    })
  });

  if (!response.ok) throw new Error(`Server antwortet mit ${response.status}`);
  return response.json();
}
