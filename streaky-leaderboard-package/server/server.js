const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'leaderboard.sqlite');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS players (
    username TEXT PRIMARY KEY,
    streak INTEGER NOT NULL DEFAULT 0,
    best INTEGER NOT NULL DEFAULT 0,
    totalCorrect INTEGER NOT NULL DEFAULT 0,
    totalWrong INTEGER NOT NULL DEFAULT 0,
    lastEventText TEXT DEFAULT '',
    clientVersion TEXT DEFAULT '',
    updatedAt INTEGER NOT NULL
  )`);
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function cleanName(value) {
  return String(value || '').trim().replace(/[^\p{L}\p{N}_ .-]/gu, '').slice(0, 32);
}
function int(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

app.post('/api/player', (req, res) => {
  const username = cleanName(req.body.username);
  if (!username) return res.status(400).json({ error: 'username missing' });

  const payload = {
    username,
    streak: int(req.body.streak),
    best: Math.max(int(req.body.best), int(req.body.streak)),
    totalCorrect: int(req.body.totalCorrect),
    totalWrong: int(req.body.totalWrong),
    lastEventText: String(req.body.lastEventText || '').slice(0, 200),
    clientVersion: String(req.body.clientVersion || '').slice(0, 40),
    updatedAt: Date.now()
  };

  db.run(`INSERT INTO players (username, streak, best, totalCorrect, totalWrong, lastEventText, clientVersion, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            streak=excluded.streak,
            best=MAX(players.best, excluded.best),
            totalCorrect=excluded.totalCorrect,
            totalWrong=excluded.totalWrong,
            lastEventText=excluded.lastEventText,
            clientVersion=excluded.clientVersion,
            updatedAt=excluded.updatedAt`,
    [payload.username, payload.streak, payload.best, payload.totalCorrect, payload.totalWrong, payload.lastEventText, payload.clientVersion, payload.updatedAt],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true, player: payload });
    }
  );
});

app.get('/api/leaderboard', (req, res) => {
  db.all(`SELECT username, streak, best, totalCorrect, totalWrong, lastEventText, updatedAt
          FROM players
          ORDER BY streak DESC, best DESC, totalCorrect DESC, updatedAt ASC
          LIMIT 100`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, updatedAt: Date.now(), players: rows });
  });
});

app.post('/api/reset', (req, res) => {
  const username = cleanName(req.body.username);
  if (!username) return res.status(400).json({ error: 'username missing' });
  db.run('DELETE FROM players WHERE username = ?', [username], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.listen(PORT, () => {
  console.log(`Streaky Leaderboard läuft auf http://localhost:${PORT}`);
  console.log(`SQLite DB: ${DB_PATH}`);
});
