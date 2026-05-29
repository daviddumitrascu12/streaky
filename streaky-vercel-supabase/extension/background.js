const DEFAULT_SERVER_URL = 'https://streaky-zeta.vercel.app';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'AMBOSS_STREAK_SYNC') return;

  syncLeaderboard(message.payload)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: String(error && error.message ? error.message : error) }));

  return true;
});

async function syncLeaderboard(payload) {
  if (!payload || !payload.username) return { skipped: true, reason: 'Kein Name gesetzt' };
  const serverUrl = DEFAULT_SERVER_URL;
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
      clientVersion: '3.1.0'
    })
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}

  if (!response.ok) {
    const detail = data && data.error ? `: ${data.error}` : (text ? `: ${text.slice(0, 180)}` : '');
    throw new Error(`Server antwortet mit ${response.status}${detail}`);
  }
  return data || { ok: true };
}
