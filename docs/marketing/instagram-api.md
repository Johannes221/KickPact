# Instagram automatisch bepos­ten

Stand: 2026-07-20. **Live erprobt** — der erste Reel ging über genau diesen Weg
raus (`instagram.com/reel/DbA1JQWAp-Y`).

Wir posten über die **Instagram-API mit Instagram-Login** (`graph.instagram.com`),
nicht über den Facebook-Login-Weg. Das entscheidet zwei Dinge (siehe unten):
jedes Medium braucht eine öffentliche URL (→ R2), und die Token-Pflege läuft
anders.

---

## Was geht und was nicht

| | über die API | nur von Hand |
|---|---|---|
| Reels posten | ✅ | |
| Stories posten | ✅ | |
| Karussells posten | ✅ | |
| **Musik auf Reels** | ❌ | ✅ |
| **Link-Sticker in Stories** | ❌ | ✅ |
| Umfragen, Countdown, Sticker | ❌ | ✅ |
| Highlight anlegen und anpinnen | ❌ | ✅ |

Für Musik und Sticker gibt es keinen API-Weg — bei keinem Anbieter. Solche Posts
gehören von Hand gemacht; die Assets liegen dafür bereit.

---

## Der Kniff: jedes Medium braucht eine öffentliche URL

Der Instagram-Login-Weg nimmt Medien **nicht** als Datei-Upload, sondern nur als
öffentlich erreichbare URL — Meta holt sich die Datei selbst ab (live verifiziert:
ohne `video_url` kommt „The parameter video_url is required"). Direkt-Upload
(`upload_type=resumable`) wird auf `graph.instagram.com` ignoriert.

Deshalb läuft jeder Post über **Cloudflare R2** (`scripts/social/r2.ts`): Asset
kurz hochladen → signierten, eine Stunde gültigen Link erzeugen → posten → Asset
wieder löschen. Der Bucket bleibt privat, der Link trägt die Freigabe in sich und
läuft von allein ab. Reels als MP4, Stories und Karussell-Bilder als JPEG.

Die R2-Zugangsdaten (`CLOUDFLARE_R2_*`) stehen in der `.env.local` — aus der
Coolify-Umgebung der App übernommen, gleicher Bucket wie die App.

---

## Einrichtung, einmalig (schon erledigt)

Dokumentiert, falls es mal neu aufgesetzt werden muss.

1. **Instagram** auf ein Professional-Konto (Business) umstellen.
2. **Meta-App** auf [developers.facebook.com/apps](https://developers.facebook.com/apps/):
   Anwendungsfall **„Messaging und Content auf Instagram verwalten"** →
   Berechtigungen `instagram_business_basic` **und** `instagram_business_content_publish`.
3. Konto als **Instagram-Tester** eintragen (App-Rollen → Rollen), Einladung im
   Instagram-Konto annehmen (Einstellungen → Apps und Websites, oder
   [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/)).
4. Im Anwendungsfall **„Zugriffstokens generieren"** → Konto verbinden → Token
   generieren.
5. In die `.env.local`:
   ```
   IG_USER_ID=…       # die Zahl aus graph.instagram.com/me, nicht der @name
   IG_ACCESS_TOKEN=…  # der IGAA…-String
   ```
   Die R2-Werte sind schon drin.

Prüfen:
```bash
npm run social:token
```
Zeigt Konto und Gültigkeit.

---

## Token am Leben halten

**Hier sterben solche Automatiken.** Ein Token hält ~60 Tage. Läuft es ab, hilft
kein Erneuern mehr — dann in Meta neu generieren.

```bash
npm run social:token            # läuft es noch, welches Konto?
npm run social:token -- --renew # um ~60 Tage verlängern
```

Erneuern geht nur, solange das Token noch gültig und ≥24 Stunden alt ist. Einmal
im Monat reicht. `graph.instagram.com` gibt kein Ablaufdatum zurück, deshalb
zeigt der Check keine Restlaufzeit — die Regel ist einfach: monatlich `--renew`.

---

## Posten

```bash
npm run social:publish -- --list          # was ist da
npm run social:publish -- reel 01         # Probelauf, postet NICHTS
npm run social:publish -- reel 01 --live  # postet wirklich
npm run social:publish -- story wie-funktioniert --live
npm run social:publish -- karussell 01 --live
```

**Ohne `--live` passiert nichts Öffentliches.** Ein Post ist nicht zurückholbar.

Ein Story-Highlight postet **jeden Slide als eigene Story** (in Reihenfolge). Die
Slides danach in eine Highlight-Sammlung packen und anpinnen geht nur in der App.

Ein Karussell postet höchstens **10 Bilder** (Instagram-Limit); längere Decks
bricht der Publisher mit Hinweis ab.

**Tageskontingent:** 100 API-Posts pro 24 Stunden. Ein Story-Highlight mit sechs
Slides sind sechs Posts — der Publisher zeigt den Verbrauch vor jedem Lauf.

---

## Planen und freigeben

Zweigeteilt: ein Timer erinnert, du gibst frei. Kein Automatismus postet von
selbst — jeder Post braucht dein „j".

- **Zeitplan:** `scripts/social/schedule.ts` (Datum, Uhrzeit, Art, Slug).
- **Freigeben:** `npm run social:queue` — geht die fälligen Posts durch, öffnet
  die Vorschau, fragt „posten? [j/N]", postet nur bei „j". Ohne Terminal wird
  nichts gepostet.
- **Timer:** `scripts/social/launchd/com.kickpact.social-notify.plist` (12/18
  Uhr Desktop-Hinweis bei Fälligem, postet nichts).
- **Doppelpost-Schutz:** `scripts/social/state/posted.jsonl` — was einmal
  draußen ist, geht nie zweimal raus, bis auf den einzelnen Story-Slide genau.

> **Assets müssen gerendert vorliegen** (`out/social/` ist nicht dauerhaft): vor
> dem Posten ggf. `npm run social:render` und `npm run social:video`.

---

## Wenn es klemmt

| Symptom | Ursache |
|---|---|
| Token ungültig | `npm run social:token`, ggf. neu generieren |
| `video_url is required` | Asset kam nicht nach R2 — `CLOUDFLARE_R2_*` in .env.local prüfen |
| Container bleibt `IN_PROGRESS` | Meta verarbeitet; der Publisher wartet bis 5 Min |
| `ERROR` am Container | meist Format: Reels 9:16, 3–90 s |
| Bild abgelehnt | darf nur JPEG sein — der Publisher wandelt PNG→JPEG selbst |
| Version nicht unterstützt | `IG_API_VERSION` in .env.local hochsetzen |
