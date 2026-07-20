# Instagram automatisch bepos­ten

Stand: 2026-07-19. Verifiziert gegen die Meta-Doku am selben Tag.

Der Code steht (`scripts/social/publish.ts`). Was fehlt, ist die Einrichtung bei
Meta — die geht nur von Hand, weil dabei Konten verknüpft und Zugangsdaten
erzeugt werden.

---

## Was geht und was nicht

| | über die API | nur von Hand |
|---|---|---|
| Reels posten | ✅ | |
| Stories posten | ✅ | |
| Karussells posten | ✅ (braucht R2, s.u.) | |
| **Musik auf Reels** | ❌ | ✅ |
| **Link-Sticker in Stories** | ❌ | ✅ |
| Umfragen, Countdown, Sticker | ❌ | ✅ |
| Highlight anlegen und anpinnen | ❌ | ✅ |

Die Audio-API deckt nur Reels ab, kennt keine Trending-Sounds und verlangt
Facebook-Login. Für Musik aus dem lizenzierten Katalog gibt es keinen Weg über
die API — bei keinem Anbieter, weil alle an derselben Schnittstelle hängen.

**Praktische Folge:** Reels, bei denen Musik zählt, und Stories mit Link-Sticker
gehören weiter von Hand gepostet. Der Rest läuft automatisch.

---

## Einrichtung, einmalig

### 1. Konten verknüpfen

- Instagram-Konto auf **Professional** umstellen (Business oder Creator).
  Privatkonten können über die API gar nicht posten.
- Eine **Facebook-Seite** anlegen, falls noch keine da ist, und das
  Instagram-Konto damit verbinden.

Das ist auch die Voraussetzung für den lizenzierten Musikkatalog und für die
Planung in der Meta Business Suite.

### 2. Meta-App anlegen

Auf [developers.facebook.com](https://developers.facebook.com/apps/) eine App
vom Typ **Business** anlegen und das Produkt **Instagram** hinzufügen.

Nötige Berechtigungen:

```
instagram_business_basic
instagram_business_content_publish
```

Die alten Namen (`instagram_basic`, `instagram_content_publish`) wurden im
Januar 2025 abgelöst und funktionieren nicht mehr.

> Laut Doku genügt **Standard Access**, ein App-Review ist fürs Posten auf den
> *eigenen* Account nicht gelistet. Das konnte ich nicht abschließend belegen —
> falls beim ersten Versuch eine Berechtigung fehlt, sagt die Fehlermeldung es
> deutlich.

### 3. Werte holen

Vier Werte, alle in die `.env.local`:

```
IG_USER_ID=…        # die Instagram-Professional-Konto-ID (nicht der @name)
IG_ACCESS_TOKEN=…   # langlebiges Token, s.u.
IG_APP_ID=…         # Meta-App → Einstellungen → Allgemein
IG_APP_SECRET=…     # ebenda
```

`IG_USER_ID` findest du im Graph API Explorer über
`GET /me/accounts` → die Seiten-ID → `GET /<seiten-id>?fields=instagram_business_account`.

Das Token aus dem Explorer ist **kurzlebig (ein bis zwei Stunden)**. Es muss
einmal in ein langlebiges getauscht werden:

```
GET /oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id=<IG_APP_ID>
  &client_secret=<IG_APP_SECRET>
  &fb_exchange_token=<kurzlebiges Token>
```

Danach prüfen:

```bash
npm run social:token
```

Zeigt Gültigkeit, Ablaufdatum und ob die Berechtigungen stimmen.

---

## Token am Leben halten

**Das ist die Stelle, an der solche Automatiken sterben.** Ein langlebiges Token
hält etwa 60 Tage. Läuft es ab, hilft kein Erneuern mehr — dann ist der ganze
Ablauf oben nochmal fällig.

```bash
npm run social:token            # wie lange noch?
npm run social:token -- --renew # um ~60 Tage verlängern
```

Erneuern geht nur, solange das Token **noch gültig und mindestens 24 Stunden
alt** ist. Einmal im Monat reicht.

Trag dir eine monatliche Erinnerung ein, oder lass n8n einmal im Monat
`npm run social:token` laufen und dir eine Nachricht schicken, wenn weniger als
14 Tage übrig sind.

---

## Posten

```bash
npm run social:publish -- --list          # was ist da
npm run social:publish -- reel 01         # Probelauf, postet NICHTS
npm run social:publish -- reel 01 --live  # postet wirklich
```

**Ohne `--live` passiert nichts Öffentliches.** Ein Post ist nicht zurückholbar,
deshalb ist der Probelauf der Standard.

Beispiele:

```bash
npm run social:publish -- story wie-funktioniert --live
npm run social:publish -- story was-kostet-das --live
npm run social:publish -- reel 03 --live
```

Ein Story-Highlight postet **jeden Slide als eigene Story**, in der Reihenfolge
der Dateien. Die Slides in eine Highlight-Sammlung packen und anpinnen geht
danach nur in der App — das kann die API nicht.

### Warum Stories als Video rausgehen

Die API nimmt Bilder ausschließlich als öffentlich erreichbare URL, und nur als
JPEG. Videos lassen sich dagegen direkt hochladen, und `media_type: STORIES`
unterstützt das.

Deshalb wandelt der Publisher jeden Story-Slide beim Posten in ein
5-Sekunden-Video um. Für den Betrachter ist das identisch (Instagram blendet
Bild-Stories ohnehin nach etwa 5 Sekunden weiter), spart aber den kompletten
Umweg über einen öffentlichen Bucket. Die PNGs bleiben unangetastet — die sind
fürs Posten von Hand.

### Karussells brauchen R2

Bei Bildern führt kein Weg an einer öffentlichen URL vorbei. Dafür müssen die
R2-Zugangsdaten in die `.env.local`:

```
CLOUDFLARE_R2_ACCESS_KEY_ID=…
CLOUDFLARE_R2_SECRET_ACCESS_KEY=…
CLOUDFLARE_R2_BUCKET=…
CLOUDFLARE_R2_ENDPOINT=…
```

Die Werte liegen in Coolify beziehungsweise Vaultwarden. Solange sie fehlen,
bricht der Publisher bei Karussells mit einem klaren Hinweis ab — Reels und
Stories laufen davon unberührt.

### Tageskontingent

100 API-Posts pro 24 Stunden, gleitend. Klingt nach viel, aber ein
Story-Highlight mit sechs Slides sind sechs Posts. Der Publisher zeigt den
Verbrauch vor jedem Lauf an.

---

## Planen und freigeben

Der Ablauf ist absichtlich zweigeteilt: ein Timer *erinnert*, du *gibst frei*.
Kein Automatismus postet je von selbst — jeder Post braucht dein „j".

**Der Zeitplan** steht in `scripts/social/schedule.ts` — eine Liste aus
Datum, Uhrzeit, Art und Slug. Das ist die Datei, die du anfasst, um den Kalender
zu ändern. Voreingestellt sind die drei Reels und die vier Story-Highlights über
etwa zwei Wochen (Karussells fehlen, bis R2 steht).

**Freigeben und posten:**

```bash
npm run social:queue            # fällige Posts einzeln freigeben
npm run social:queue -- --list  # nur zeigen, was fällig/geplant ist
```

`social:queue` geht die fälligen Posts durch, öffnet zu jedem die Vorschau
(Reel im Player, Story-Ordner im Finder), zeigt die Caption und fragt
„jetzt posten? [j/N]". Nur bei `j` geht es raus. Übersprungenes bleibt fällig und
kommt beim nächsten Lauf wieder.

Zwei harte Riegel: ohne Terminal wird nichts gepostet (Schutz gegen
unbeaufsichtigtes Feuern), und was einmal draußen ist, wird nie wiederholt
(`scripts/social/state/posted.jsonl` merkt sich jeden Post, bis auf den einzelnen
Story-Slide genau).

**Der Timer** (macOS launchd) erinnert dich, wenn etwas fällig ist — er postet
nichts:

```bash
cp scripts/social/launchd/com.kickpact.social-notify.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.kickpact.social-notify.plist
```

Er feuert 12:00 und 18:00 (die Fälligkeitszeiten im Plan) und schickt eine
Desktop-Meldung, wenn Posts warten. Dann öffnest du ein Terminal und gibst mit
`npm run social:queue` frei. Vorher im Plist den Repo-Pfad prüfen.

> **Assets müssen gerendert vorliegen.** `out/social/` wird bei jedem Render neu
> gebaut und ist nicht dauerhaft. Vor dem Posten einmal `npm run social:render`
> (Karussells/Stories, ~2 Min) und `npm run social:video` (Reels, ~15 Min)
> laufen lassen, falls der Ordner leer ist. Der Runner sagt es, wenn eine Datei
> fehlt.

> **Reihenfolge zum Loslegen:** erst die Meta-Einrichtung oben (einmalig), dann
> `npm run social:token` zur Kontrolle, dann rendern, dann `npm run social:queue`.

## Wenn es klemmt

| Symptom | Ursache |
|---|---|
| `Cannot parse access token` | Token abgelaufen oder falsch kopiert → `npm run social:token` |
| Fehlende Berechtigung | Scopes fehlen, s. Schritt 2 |
| Container bleibt `IN_PROGRESS` | Meta verarbeitet noch; der Publisher wartet bis 5 Minuten |
| `ERROR` am Container | Meist Format: Reels wollen 9:16 und 3 bis 90 Sekunden |
| Bild wird abgelehnt | PNG statt JPEG — betrifft nur den Karussell-Weg |
| Version nicht mehr unterstützt | `IG_API_VERSION` in `.env.local` hochsetzen |
