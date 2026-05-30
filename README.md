# Streaky – Vercel + Supabase + Mascot Assets

Diese Version enthält:

- `public/index.html` = Leaderboard-Webseite mit Streaky-Maskottchen
- `api/player.js` = API für Chrome-Add-on → Supabase
- `api/leaderboard.js` = API für Leaderboard
- `api/health.js` = Diagnose-API für Vercel/Supabase
- `extension/` = Chrome-Erweiterung
- `extension/assets/positive-streak/` = 10 Bilder für richtige Streaks
- `extension/assets/negative-streak/` = 10 Bilder für falsche Streaks
- `public/assets/positive-streak/` = dieselben 10 Bilder für die Webseite
- `public/assets/negative-streak/` = dieselben 10 Bilder für die Webseite

## Eigene Bilder hochladen / ersetzen

Wenn du eigene Bilder nutzen willst, ersetze einfach die Dateien:

```text
extension/assets/positive-streak/01.png bis 10.png
extension/assets/negative-streak/01.png bis 10.png
public/assets/positive-streak/01.png bis 10.png
public/assets/negative-streak/01.png bis 10.png
```

Wichtig: Dateinamen gleich lassen: `01.png`, `02.png`, ..., `10.png`.

## Vercel Deploy

Die Dateien müssen direkt im GitHub-Repo liegen:

```text
api/
extension/
public/
package.json
vercel.json
README.md
```

Danach in Vercel deployen oder redeployen.

## Vercel Environment Variables

In Vercel → Projekt → Settings → Environment Variables:

```text
SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=DEIN_SERVICE_ROLE_KEY
```

Danach `Deployments → ... → Redeploy`.

## Diagnose

Nach dem Deploy testen:

```text
https://streaky-zeta.vercel.app/api/health
```

`supabaseUrlLooksCorrect` und `hasServiceRoleKey` sollten `true` sein.

## Chrome-Erweiterung laden

Chrome → `chrome://extensions` → Entwicklermodus → Entpackte Erweiterung laden → Ordner `extension` auswählen.

Im Add-on:

1. Namen eingeben
2. `Name speichern`
3. `Leaderboard öffnen` öffnet direkt deine Webseite
4. `Jetzt syncen` synchronisiert deinen aktuellen Stand

Die Server-URL ist fest eingebaut: `https://streaky-zeta.vercel.app`.
