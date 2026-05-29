# Streaky Leaderboard

Dieses Paket enthält zwei Teile:

1. `extension/` – Chrome-Erweiterung für AMBOSS
2. `server/` – lokale Leaderboard-Webseite mit SQLite-Datenbank

## 1. Leaderboard-Server starten

```bash
cd server
npm install
npm start
```

Danach ist die Webseite hier erreichbar:

```text
http://localhost:3000
```

Die Datenbank wird automatisch angelegt unter:

```text
server/data/leaderboard.sqlite
```

## 2. Chrome-Erweiterung laden

1. Chrome öffnen: `chrome://extensions`
2. Entwicklermodus aktivieren
3. „Entpackte Erweiterung laden“ klicken
4. Den Ordner `extension/` auswählen
5. AMBOSS neu laden
6. Oben rechts auf das Add-on klicken und einen Leaderboard-Namen setzen

Standard-Server ist:

```text
http://localhost:3000
```

## Features

- Name im Add-on auswählen
- Streak bleibt über neue AMBOSS-Fragensitzungen hinweg erhalten
- Bereits grüne Fragen in der Sidebar werden automatisch importiert
- Richtige Fragen erhöhen den globalen Streak
- Falsche Fragen setzen den aktuellen Streak auf 0, der Best-Streak bleibt erhalten
- Sync in SQLite-Datenbank
- Leaderboard-Webseite aktualisiert sich alle 2 Sekunden
- Integrierte Flame-Bilder mit mehreren Streak-Stufen:
  - 0–2: Idle Ember
  - 3–7: Rocket Flame
  - 8–14: Comet Dash
  - 15–29: Volcanic Eruption
  - 30–49: Phoenix Spiral
  - 50+: Ultimate God Mode

## Wichtig

Das ist ein lokaler Leaderboard-Server. Für ein echtes Online-Leaderboard musst du den `server/`-Ordner z.B. auf Render, Railway, VPS oder einem eigenen Server deployen und im Add-on die Server-URL eintragen. Wenn du eine andere Domain nutzt, muss sie ggf. in `extension/manifest.json` unter `host_permissions` ergänzt werden.


## GitHub + Hosting: schnellster Weg

GitHub Pages allein reicht **nicht**, weil Streaky eine API und Datenbank braucht. Am einfachsten ist: GitHub Repo → Render/Railway deployen. Der Node-Server liefert gleichzeitig die Webseite und die API.

### Option A: Render, am einfachsten

1. Neues GitHub-Repo erstellen, z.B. `streaky-leaderboard`.
2. Den Inhalt dieses Pakets hochladen.
3. Auf render.com anmelden und **New → Web Service** wählen.
4. Dein GitHub-Repo verbinden.
5. Root Directory: `server`
6. Build Command: `npm install`
7. Start Command: `npm start`
8. Nach dem Deploy bekommst du eine URL wie `https://streaky.onrender.com`.
9. Diese URL im Add-on-Popup bei **Leaderboard-Server** eintragen.

Hinweis: SQLite ist auf kostenlosen Deployments oft nicht dauerhaft persistent. Für echtes dauerhaftes Online-Leaderboard brauchst du bei Render eine Persistent Disk oder später Supabase/Postgres. Für Testen und private Nutzung reicht Render trotzdem am schnellsten.

### Option B: Railway

Railway ist ähnlich einfach und kann mit Volumes/persistenter Speicherung besser passen. Repo verbinden, Root Directory `server`, Start Command `npm start`, dann die Railway-URL im Add-on eintragen.

### Nach dem Hosting

Wenn du eine andere Domain nutzt, muss sie in `extension/manifest.json` bei `host_permissions` eingetragen sein. Für Render/Railway/Vercel ist das bereits vorbereitet. Danach die Chrome-Erweiterung neu laden.
