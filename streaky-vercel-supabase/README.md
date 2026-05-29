# Streaky – Vercel + Supabase Version

Diese Version ist für Vercel gebaut. Sie enthält:

- `public/index.html` = Leaderboard-Webseite
- `api/player.js` = API, die Streaky aus dem Chrome-Add-on aktualisiert
- `api/leaderboard.js` = API für das Leaderboard
- `extension/` = Chrome-Erweiterung

## 1. Supabase-Tabelle anlegen

In Supabase → SQL Editor ausführen:

```sql
create table if not exists public.streaky_leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  streak integer not null default 0,
  best_streak integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists streaky_best_streak_idx
on public.streaky_leaderboard (streak desc, best_streak desc, total_correct desc);
```

## 2. Auf GitHub hochladen

Wichtig: Lade den **Inhalt dieses Ordners** hoch, nicht den übergeordneten ZIP-Ordner.
Die Dateien `package.json`, `vercel.json`, `api/`, `public/` und `extension/` müssen direkt im GitHub-Repo liegen.

Richtig:

```text
streaky-repo/
  api/
  public/
  extension/
  package.json
  vercel.json
```

Falsch:

```text
streaky-repo/
  streaky-vercel-supabase/
    api/
    public/
    package.json
```

## 3. Vercel deployen

Vercel → Add New → Project → GitHub-Repo auswählen.

Framework Preset: `Other`

Build Command: leer lassen oder `npm install`

Output Directory: leer lassen

## 4. Vercel Environment Variables

Vercel → dein Projekt → Settings → Environment Variables:

```text
SUPABASE_URL=deine Supabase Project URL
SUPABASE_SERVICE_ROLE_KEY=dein Supabase service_role key
```

Danach Vercel → Deployments → neuestes Deployment → `...` → Redeploy.

## 5. Test-URLs

Nach dem Deploy:

```text
https://dein-projekt.vercel.app/
https://dein-projekt.vercel.app/api/leaderboard
```

`/api/leaderboard` sollte JSON zurückgeben.

## 6. Chrome-Erweiterung laden

Chrome → `chrome://extensions` → Entwicklermodus → Entpackte Erweiterung laden → Ordner `extension` auswählen.

Im Streaky-Popup:

```text
Name: dein Name
Leaderboard-Server: https://dein-projekt.vercel.app
```

Dann AMBOSS neu laden.
