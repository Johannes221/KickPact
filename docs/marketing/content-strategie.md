# KickPact Content-Strategie

Stand: 2026-07-17. Zielgruppe sind **Vereine**, nicht Sponsoren.

## 0. Die zwei Regeln, aus denen alles andere folgt

**Wir posten als KickPact, nie als Verein.** Kein Content im Namen einer
Mannschaft, keine echten Spiele, keine Vorschauen oder Rückblicke als
Eigen-Content. Wir sind nicht der Verein und tun auch nicht so. Jeder Post
beantwortet eine von drei Fragen: Was macht die App? Was bringt sie uns? Wie
fange ich an? Ein Rückblick-Motiv darf vorkommen, aber als Feature-Beleg („das
baut dir die App"), nie als Spielbericht.

**Weiß, Grün und Navy sind die CI.** Das Dunkle ist Fallback, nicht Marke. Die
Palette steht in `scripts/social/brand.ts`, die Werte kommen aus
`public/brand/README.md` und `tailwind.config.ts`.

Der Sponsor ist der Onkel, der eh am Spielfeldrand steht. Den erreichen wir nicht
über Instagram, sondern über den Verein, der ihn einlädt. Deshalb ist jeder Post
an den Verein gerichtet.

---

## 1. Wen wir im Verein wirklich ansprechen

Ein Verein ist keine Person. Vier Leute entscheiden mit, und sie wollen
Verschiedenes:

| Wer | Will | Schmerz | Hört auf |
|---|---|---|---|
| **Kassenwart / Abteilungsleiter** | Geld in der Kasse, kein Ärger | Klinkenputzen, leerer Umschlag | Zahlen, Aufwand, Risiko |
| **Trainer** | Ansporn, volle Kabine | Motivation in der 88. Minute | Wirkung auf die Mannschaft |
| **Spieler** | Gaudi, Ausrüstung, Trainingslager | Zahlt alles selbst | Humor, Wettbewerb |
| **Der Social-Media-Mensch** | Content, der was hermacht | Screenshot aus der WhatsApp-Gruppe | Fertige Motive, zwei Klicks |

Der **Kassenwart entscheidet**, aber die **Spieler tragen es rein**. Deshalb
braucht der Kanal beides: nüchterne Nutzen-Posts und Kabinen-Humor. Ein Kanal,
der nur eins davon macht, verliert entweder die Entscheider oder die Reichweite.

## 2. Die Angles

Jeder Post läuft auf genau einem Angle. Angle rotieren, nicht mischen.

1. **Erklärung** — was die App tut, Schritt für Schritt. Der Kern.
2. **Features** — was drin ist, ohne Marketing-Sprech.
3. **Mannschaftskasse** — Geld, das ohne Betteln reinkommt.
4. **Ansporn** — 5 € pro Tor verändert, wie die 88. Minute aussieht.
5. **Kein Klinkenputzen** — der Schmerz, den wir wegnehmen.
6. **Gaudi** — Amateurfußball-Wahrheiten. Reichweite, kein Verkauf.
7. **Einwand** — die Fragen aus der Vorstandssitzung, nüchtern beantwortet.
8. **Beweis** — echte Vereine, echte Zahlen. **Erst, wenn es sie gibt.**

Angle 8 ist heute leer. Solange kein Verein zitierbar ist, wird nichts geschätzt
und nichts erfunden. Sobald der erste Verein „ja" sagt, wird das der stärkste
Angle im Kanal, und dann verschiebt sich der Plan zu seinen Gunsten.

## 3. Wann wir senden

Amateurfußball spielt Samstag und Sonntag. Das ändert nicht, **was** wir posten
(das ist immer die App), aber es sagt uns, **wann** jemand hinschaut.

- **Freitagabend** denkt der Verein ans Wochenende. Guter Moment für alles, was
  nach Vorfreude klingt.
- **Sonntagabend und Montag** ist Nachbereitung. Guter Moment für Nutzen und
  Erklärung, weil da jemand über die Mannschaftskasse nachdenkt.
- **Samstag** ist tot. Alle sind am Platz, keiner liest Instagram.

**Wochen-Raster, sechs Posts:**

| Tag | Format | Angle |
|---|---|---|
| Mo | Karussell | Erklärung / Mannschaftskasse |
| Di | Reel | Gaudi |
| Mi | Karussell | Features / Beweis |
| Do | Reel (du) | Ansporn / Einwand |
| Fr | Reel | Ansporn / Gaudi |
| Sa | nichts | Alle sind am Platz |
| So | Karussell abends | Erklärung / Einwand |

Samstag bewusst leer. Ein Kanal, der sieben Tage sendet, ist kein Zeichen von
Fleiß, sondern von fehlender Priorität.

## 4. Das Design-System

Die Palette liegt in `scripts/social/brand.ts` und ist die einzige Quelle für
Karussells und Videos.

```
Primary Green  #01C457   Flächen, Balken, Punkte
Dark Green     #00563A   grüner TEXT auf Weiß
Night Navy     #1A1A2E   das „Schwarz" der Marke
Weiß           #FFFFFF   Grundfläche
```

**Warum zwei Grüns, und warum das nicht Geschmack ist:** `#01C457` auf Weiß hat
etwa 2,4:1 Kontrast. Das reißt jede WCAG-Schwelle, auch die 3:1 für große
Schrift. Grüner Text auf weißem Grund ist damit für einen Teil der Leute nicht
lesbar, und auf einem Handy in der Sonne für alle. Also: **`#01C457` nur als
Fläche**, **`#00563A` für grünen Text** (etwa 8,4:1). Umgekehrt gilt dasselbe:
Weiß auf Grün wären wieder 2,4:1, Navy auf Grün sind etwa 7:1. **Grüne Fläche
heißt Navy-Text, nie weißer.**

**Zwei Tonarten**, mehr nicht:
- `light` — weiße Fläche, Navy-Text, grüne Akzente. Der Normalfall.
- `green` — volle grüne Fläche, Navy-Text. Für Aufschlag und Pointe.

Ein Karussell aus sieben identischen weißen Flächen liest sich als eine einzige
lange Fläche, und der Daumen wischt durch. Der Tonartwechsel ist der Rhythmus.
Sparsam einsetzen: wenn alles knallt, knallt nichts.

**Schrift:** Display ist **Montserrat Alternates Black**, Body ist **Inter**. So
macht es die App (`app/layout.tsx`). Die Brand-README nennt für Display noch
„Inter Black", das ist veraltet, der Code gewinnt.

## 5. Wie Content entsteht

```bash
npm run social:render          # Karussells → out/social/<slug>/
npm run social:render -- 02    # nur ein Deck
npm run social:video           # Reels → out/social/video/<slug>.mp4
npm run social:video -- 02     # nur ein Spot
```

Content planen heißt **eine Textdatei editieren**: `scripts/social/decks.ts` für
Karussells, die `SPOTS`-Konstante in `scripts/social/video.tsx` für Reels. Pro
Deck fallen die PNGs plus eine `caption.txt` an, pro Spot ein MP4 plus Caption.

Warum aus dem Repo und nicht aus Canva: die Motive der App sind schon React
(`lib/story/story-card.tsx`). Ein zweiter, handgepflegter Satz Vorlagen in einem
Design-Tool driftet garantiert weg. Beim ersten Farbwechsel postet der
Marketing-Kanal dann ein anderes Produkt, als die App ausliefert.

**Eine harte Leitplanke ist eingebaut:** ein `[X]`-Platzhalter bricht den Render
ab. Ein durchgerutschtes `[X]` im Feed wäre der Beweis, dass den Post nie jemand
gelesen hat.

**Zahl und Währung werden zentral geschützt** (`typo()` in `brand.ts`). Ohne das
brach Satori „Außer es hängen 5 € pro Tor drin." zwischen der 5 und dem Euro um,
und zwar auf genau dem Beat, der die Pointe trägt.

### Videos: warum kein Remotion

Wir rendern Motive längst mit Satori, und ffmpeg liegt auf der Maschine. Damit
ist ein Reel „viele PNGs plus ein ffmpeg-Aufruf" und braucht keine zweite
Render-Engine im Projekt. Ein 14-Sekunden-Reel kostet etwa 2,5 Minuten Render.
Das ist langsam, aber es läuft einmal pro Textänderung.

Sobald ein Spot echtes Video, Masken oder Audio-Sync braucht, ist Remotion die
richtige Antwort. Für Text-on-Motion ist es Overkill.

### Flächen haben verschiedene Regeln

Das Karussell trägt sein Logo unten, das Reel oben. Kein Versehen: Instagram legt
im Reel unten Caption, Username und Buttons über das Video und rechts die
Aktions-Leiste. Unten links wäre das Logo im fertigen Reel verdeckt. Im
Feed-Karussell ist unten frei.

## 6. Musik

**Business-Accounts haben auf Instagram und TikTok einen eingeschränkten
Musikkatalog.** Die Trending-Sounds, die Reichweite bringen, sind für
kommerzielle Accounts oft gesperrt. Ein Reel mit gesperrtem Sound wird stumm
geschaltet oder gar nicht ausgespielt.

Deshalb kommen die Reels **ohne Tonspur** aus dem Renderer. Musik wird in
Instagram bzw. TikTok selbst druntergelegt, weil nur dort der lizenzierte Katalog
des Accounts greift. Ein hier einmontierter Track wäre nicht abgedeckt.

- **Meta Sound Collection** und **TikTok Commercial Music Library**: kostenlos,
  für Business-Accounts freigegeben, rechtlich sauber.
- Falls Wiedererkennung gewünscht: **Epidemic Sound** oder **Artlist**, etwa 12
  bis 15 € im Monat, deckt alle Kanäle ab.

Empfehlung: mit den kostenlosen Bibliotheken starten, dann zwei bis drei feste
Tracks als Set. Das ist auf Dauer mehr wert als jeder Trend-Sound.

> **Vor dem ersten Post prüfen.** Die Musikregeln der Plattformen ändern sich
> regelmäßig, und mein Wissensstand reicht nicht bis heute. Einmal im
> Business-Account nachsehen, welcher Katalog tatsächlich freigegeben ist.

## 7. Ausbaustufen zum Autopilot

**Stufe 1, läuft** — Karussells und Reels aus dem Repo. Hochladen von Hand.

**Stufe 2, Screen-Recordings automatisch.** Playwright ist schon im Stack und
kann Video aufnehmen. Ein Skript, das durch einen Flow klickt, liefert das „so
sieht das in der App aus"-Reel reproduzierbar. Ändert sich die UI, wird neu
gerendert statt neu gedreht.

**Stufe 3, Posten ohne Menschen.** n8n auf deinem Server, Meta Graph API.
Instagram und Facebook nehmen Reels, Karussells und Stories per API an, für
Business-Accounts.

> TikTok ist die Ausnahme. Die Content Posting API braucht ein Audit, und ohne
> das kommt der Post nur als Entwurf an. Realistisch bleibt manuelles
> Cross-Posting der fertigen MP4s. Kein Beinbruch, es sind zwei Minuten pro Reel.

**Stufe 4, B-Roll und Stimmung.** Higgsfield für Clips und Voiceover. Bewusst
zuletzt: KI-Bilder von Fußballplätzen sehen für Leute, die jedes Wochenende auf
echten Plätzen stehen, sofort falsch aus. Die sieben echten Fotos unter
`public/brand/photos/` tragen weiter.

## 8. Was fertig ist

**Karussells** (`npm run social:render`, 27 Slides):

| Deck | Angle | Slides |
|---|---|---|
| `01-so-funktioniert` | Erklärung | 7 |
| `02-fuenf-euro-pro-tor` | Ansporn | 6 |
| `03-was-die-app-kann` | Features | 8 |
| `04-vier-fragen` | Einwand | 6 |

**Reels** (`npm run social:video`, 9:16, ohne Ton):

| Spot | Angle | Länge |
|---|---|---|
| `01-so-funktioniert` | Erklärung | ~20 s |
| `02-fuenf-euro-pro-tor` | Ansporn | ~14 s |
| `03-kein-banner-mehr` | Kein Klinkenputzen | ~16 s |

## 9. Was noch offen ist

**Die Produkt-Motive sind noch in der alten Palette.** Story-Card und Wrapped
laufen auf Navy/Orange/Lime (`lib/story/story-card.tsx`), nicht auf der CI. Damit
sieht ein Feature-Beleg im Feed anders aus als der Feed drumherum. Der Umbau
gehört gemacht, aber **erst nachdem der Font-Fix drin ist** — sonst kollidieren
zwei Sessions in derselben Datei.

**Font-Bug in den Bild-Routen, verifiziert am 2026-07-17.** Die Story- und
Wrapped-Routen übergeben `next/og` keine Fonts. Satori fällt auf sein gebündeltes
Noto Sans zurück, und jedes `fontWeight: 900` verpufft. Die Bilder, die eure
Vereine teilen, rendern live dünn statt fett. Läuft als eigene Aufgabe.

**Die fehlenden Schriftschnitte liegen jetzt da.** `public/fonts/inter/Inter-Black.ttf`
und `public/fonts/montserrat-alternates/` sind neu dazugeholt (Google Fonts, OFL).
Der Font-Fix kann sie direkt benutzen.

**Angle „Beweis" ist leer.** Braucht den ersten Verein, der sich zitieren lässt.

**Musikkatalog ungeprüft** (Abschnitt 6).

**Kanäle stehen noch nicht.** Instagram, Facebook und TikTok sind gesetzt. Zu
klären: Business- oder Creator-Account (hängt am Musikkatalog und an Stufe 3).
