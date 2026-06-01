# Spec: Öffentliches Mannschafts-Profil — Redesign (Baustein 1)

**Datum:** 2026-06-01
**Status:** approved-for-planning
**Autor:** Johannes + Claude (Brainstorming mit visuellem Begleiter)
**Baut auf / erweitert:** [`2026-06-01-public-team-profile.md`](2026-06-01-public-team-profile.md) — dort definierte Felder (`publicSlug`, `publicName`, `publicTagline`, `publicGoals`, `discoverable`), die Slug-Mechanik, `getPublicTeamProfileBySlug`, `sponsor_leads` und der anonyme Anfrage-Flow bleiben **unverändert** und werden wiederverwendet.

**Gehört zu** einer 3-teiligen Überarbeitung von Profil/Einstellungen/Discovery. Dies ist **Baustein 1** (öffentliches Profil + Galerie + Insights). Baustein 2 = interne Aufteilung „Mein Profil"/„Einstellungen". Baustein 3 = Sponsoren-Discovery (Suche/Filter). Jeder Baustein bekommt sein eigenes Spec.

---

## Ziel

Die heutige öffentliche Profilseite (`/m/{slug}`) ist funktional, aber sehr basic. Sie soll ein **modernes, sport-energetisches „Profil-Feeling"** bekommen (Strava/sofascore-Richtung), mit dem eine Mannschaft sich attraktiv für Sponsoren präsentiert:

- **Mehrere Bilder** statt nur Logo: ein Cover-Bild (Hero-Hintergrund) + eine Galerie.
- **Optionale Saison-Insights** (Bilanz, Tore, Platzierung, Auf-/Abstieg), pro Mannschaft an-/abschaltbar.
- **Visueller Look:** Richtung „Editorial/Stadion" — dunkler Foto-Hero mit fetter Typo, Akzentfarbe **CI-Grün** (kein Orange/Rot), dezentes KickPact-Muster im Hintergrund. Mobile-First.
- **Auffindbarkeit:** Cover als OG-Image fürs Teilen; teilbare URL bleibt.

## Visuelle Richtung (im Brainstorming freigegeben)

Mobile-First. Komposition von oben nach unten:

1. **Hero** — Cover-Foto (dunkles Overlay) ODER grüner KickPact-Platzhalter, darüber Logo, Name, „Verein · Liga · Ort", ✔ Verifiziert-Badge, Saison-Badge.
2. **Saison-Insights** (wenn aktiviert) — 4 Stat-Kacheln (Platz, Bilanz S/U/N, Tore, Spiele) + Zeile „Letzte Saison: … · Auf-/Abstieg".
3. **Galerie** — horizontal scrollbare Bilder.
4. **Über uns** — Tagline + „Unsere Ziele".
5. **So funktioniert Sponsoring** — grüne Erklärbox (bestehend, hübscher).
6. **Sponsoring-Anfrage** — bestehendes Kontaktformular (Haupt-CTA).

Bewusst **nicht** in diesem Baustein: Partner-/Sponsoren-Logos und „Nächste Spiele" (später günstig nachrüstbar).

## Was neu gebaut wird

### 1. Schema (eine Migration)

**`teams`** — neue Spalten:
- `cover_url text` (nullable) — Storage-Key des Cover-Bilds (`r2://…`/`local://…`). Eigenes Bild, unabhängig von der Galerie.
- `show_insights boolean NOT NULL DEFAULT true` — Insights-Sektion an/aus (Default **an**, abschaltbar).
- `league text` (nullable) — Spielklasse/Liga. Quelle: Crawler (siehe §5). Bis der Crawl sie befüllt → im Hero weglassen.

**Neue Tabelle `team_images`** (Galerie):
- `id text PK`, `team_id text FK → teams.id (ON DELETE cascade)`, `storage_key text NOT NULL`, `sort_order integer NOT NULL DEFAULT 0`, `created_at timestamptz DEFAULT now()`.
- Index auf `(team_id, sort_order)`.
- Rollen sauber getrennt: **Logo** = `teams.logo_url`, **Cover** = `teams.cover_url`, **Galerie** = `team_images`.

### 2. Bild-Upload (Route-Handler, baut auf dem Logo-Fix auf)

Gleiches Muster wie `POST /api/teams/[teamId]/logo`: Route-Handler (kein 1-MB-Server-Action-Limit), `lib/storage/images.ts` (HEIC/HEIF→JPEG, Format-/Größen-Check, 10 MB), Auth über den geteilten Action-Kern (`assertClubWriteAccess` admin).

- `POST /api/teams/[teamId]/cover` — setzt `teams.cover_url`.
- `POST /api/teams/[teamId]/images` — fügt ein Galerie-Bild hinzu (max. **8** pro Team), legt `team_images`-Zeile an, gibt `{ id, url }` zurück.
- `DELETE /api/teams/[teamId]/images/[imageId]` — entfernt ein Galerie-Bild (Auth + Team-Scope-Check, dass das Bild zum Team gehört).
- (Reihenfolge ändern via `sort_order` ist vorgesehen, aber optional / kann mit dem Editor in Baustein 2 kommen.)

Storage-Keys: `teams/{teamId}/cover-{cuid}.{ext}` bzw. `teams/{teamId}/gallery-{cuid}.{ext}`.

### 3. Öffentliche Bild-Auslieferung (löst „signierte URL läuft ab" + lokale Anzeige)

Signierte R2-URLs laufen ab — auf einer gecachten öffentlichen Seite unbrauchbar. Außerdem fehlt heute der `/api/documents/download`-Handler für `local://`-Keys.

- Neuer **öffentlicher** Endpoint `GET /api/teams/[teamId]/image?slot=cover|logo|gallery&id=…`:
  - lädt den passenden Storage-Key (Cover/Logo aus `teams`, Galerie aus `team_images` per `id`),
  - **R2** → 302-Redirect auf eine **frisch** signierte URL (immer gültig, da serverseitig erzeugt),
  - **local** → Datei streamen.
  - **Sicherheits-Gate:** liefert ausschließlich Keys unterhalb von `teams/<teamId>/…`. Verifizierungs-Dokumente (`verifications/…`) sind damit **nicht** erreichbar.
- Die öffentliche Seite + OG-Image referenzieren Bilder über diesen Endpoint.

### 4. Insights

- **Extraktion:** Die heute in `app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx` (Z. 73–82) inline berechnete Bilanz/Tore-Logik wandert in eine wiederverwendbare Query `computeTeamSeasonStats(teamId)` (Query-Schicht). Dashboard **und** Profil nutzen sie → Single Source of Truth.
- **Aggregation:** `getPublicTeamInsights(teamId)` kombiniert:
  - *laufende Saison* aus `computeTeamSeasonStats` (Spiele, S/U/N, Tore:Gegentore),
  - *letzte Saison* aus `season_results` (Platzierung, `teams_in_league`, `promoted`/`relegated`).
- Respektiert `teams.show_insights`: ist es `false`, liefert die Query kein Insights-Objekt und die Sektion entfällt.
- **Implementierungs-Hinweis (Falle):** Das `saison`-Format in `season_results` (Kommentar: „2025/26") weicht von `teams.saison` („2526") ab. „Letzte Saison" daher **nicht** per String-Gleichheit bestimmen, sondern die jüngste `season_results`-Zeile des Teams ungleich der aktuellen Saison wählen (z. B. `ORDER BY saison DESC`), und das Format beim Abgleich normalisieren.

### 5. Liga aus dem Crawler

- Der Crawler erkennt Spielklassen bereits an `row-competition`-Zeilen (`lib/crawler/fussballde.ts` Z. 416, heute übersprungen). Beim Crawl wird die Liga/Spielklasse extrahiert und in `teams.league` persistiert.
- Robust: ändert sich die Liga nicht, bleibt der Wert; ist `league` (noch) `null`, zeigt der Hero nur „Verein · Ort".
- `league` ist außerdem die Grundlage für den **Liga-Filter in Baustein 3** (Discovery).

### 6. Öffentliche Seite (Neuaufbau)

- `app/m/[slug]/page.tsx` wird auf die freigegebene Komposition umgebaut (Richtung A / CI-Grün, Tailwind + Brand-Tokens, Mobile-First, Server Component; Anfrage-Formular bleibt Client-Component).
- `getPublicTeamProfileBySlug` wird erweitert um `coverUrl`, Galerie-Liste, `league`, Insights (via `getPublicTeamInsights`). Privacy-Gate (`notFound()` wenn nicht `discoverable`/`isActive`) bleibt.
- **OG-Image:** `generateMetadata` nutzt das Cover (über den Bild-Endpoint) als `openGraph.images` für schönere geteilte Links; Fallback = bestehendes/Standard-OG.

### 7. Editing-Grenze zu Baustein 2

Dieses Spec liefert Datenmodell + öffentliche Seite + Upload/Delete-APIs + Insights-Query. Zum **Setzen** von Cover/Galerie/Insights-Schalter werden die neuen Uploads **minimal** an die bestehende `…/profil`-Editor-Seite angeklemmt (Cover-Upload, Galerie hinzufügen/löschen, Insights-Toggle). Die **vollständige, schöne „Mein Profil"-Oberfläche** (mobil, getrennt von „Einstellungen") ist **Baustein 2**.

### 8. Tests

- Queries: `team_images` (add/list/delete, Reihenfolge nach `sort_order`), `computeTeamSeasonStats` (S/U/N + Tore aus geseedeten Matches), `getPublicTeamInsights` (kombiniert; liefert nichts bei `show_insights=false`).
- Route-Handler: `cover` & `images` (Auth 401/403, Erfolg, Galerie-Limit 8, delete prüft Team-Zugehörigkeit), Bild-Endpoint (nur `teams/`-Keys, kein Zugriff auf `verifications/`).
- Render/Smoke: öffentliche Seite zeigt die Sektionen; Insights weg bei `show_insights=false`; Cover-Platzhalter wenn `cover_url=null`.

## Erfolgskriterien (verifizierbar)

1. **Migration** generiert & angewendet: `teams.cover_url`, `teams.show_insights`, `teams.league`, Tabelle `team_images` existieren. `npx tsc --noEmit` clean.
2. **Cover-Upload:** Admin lädt ein Cover (inkl. iPhone-HEIC) hoch → `teams.cover_url` gesetzt → erscheint im Hero von `/m/{slug}`. Ohne Cover zeigt der Hero den grünen KickPact-Platzhalter (kein leerer Kasten).
3. **Galerie:** Admin lädt mehrere Bilder (bis 8) hoch, kann eines löschen → Galerie auf der öffentlichen Seite spiegelt das wider.
4. **Insights:** Bei `show_insights=true` zeigt `/m/{slug}` Platz/Bilanz/Tore/Spiele + „Letzte Saison". Schaltet der Admin sie aus → Sektion verschwindet, Seite bleibt valide.
5. **Liga:** Nach einem Crawl steht in `teams.league` die Spielklasse und erscheint im Hero („Verein · Liga · Ort"). Ist sie `null`, fällt nur die Liga weg.
6. **Bild-Auslieferung:** Cover/Galerie/Logo laden auf der öffentlichen Seite zuverlässig (keine abgelaufenen URLs); der Bild-Endpoint liefert **keine** `verifications/`-Keys aus (Test grün).
7. **Privacy:** `/m/{slug}` für ein privates/inaktives Team → 404 (unverändert).
8. Bestehende Tests bleiben grün; neue Query-/Route-/Render-Tests grün.

## Bewusst NICHT in diesem Baustein (Follow-up)

- Vollständige „Mein Profil"-Oberfläche & Trennung von „Einstellungen" → **Baustein 2**.
- Sponsoren-Discovery (Suche/Filter nach Liga/Ort) → **Baustein 3** (nutzt `teams.league` + `clubs.ort`).
- Partner-/Sponsoren-Logos und „Nächste Spiele" auf dem Profil.
- Drag&Drop-Sortierung der Galerie (sort_order ist da; UI ggf. in Baustein 2).
- Bild-Resizing/Thumbnails serverseitig (vorerst Originale; `sharp`/Thumbnails später, falls Performance es verlangt).
