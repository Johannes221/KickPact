# Spec: Baustein 3 — Sponsoren-Discovery (Suche, Filter, reiche Karten)

**Datum:** 2026-06-02
**Status:** approved-for-planning
**Autor:** Johannes + Claude (Brainstorming mit visuellem Begleiter)
**Baut auf:** Baustein 1 (`teams.league`, `teams.coverUrl`, `team_images`, Insights, Bild-Serve-Endpoint, `season_results`) und Baustein 2 (Profil/Verifikation). Beide auf `main`.

**Teil 3 von 3** der Profil/Einstellungen/Discovery-Überarbeitung.

## Ziel

Sponsoren sollen Mannschaften zum Sponsern **finden**: durchstöbern, nach **Liga** und **Ort** filtern, suchen — und anfragen. Heute ist `/sponsor/discover` nur eingeloggt und bietet nur eine Volltextsuche. Neu:

- **Reiche „Schaufenster"-Karten** (Cover, Logo, Name, Verein · Liga · Ort, ✔, Tagline, Vorjahres-Platzierung als Teaser).
- **Filter:** Liga (Dropdown aus `teams.league`) + Ort (Dropdown aus `clubs.ort`), kombiniert mit der Volltextsuche.
- **Beide Zugänge:** eine **öffentliche** Browse-Seite (ohne Login, Reichweite/Marketing) **und** die eingeloggte Sponsor-Variante — sie teilen Query + Karten/Filter-Komponenten.
- **Verifikation als Auffindbarkeits-Gate:** nur verifizierte Mannschaften sind auffindbar — in der Discovery **und** auf der öffentlichen Profilseite.

## Entscheidungen (im Brainstorming festgelegt)

- Zugang: **beides** (öffentlich + eingeloggt).
- Filter: **Liga + Ort** (Volltext bleibt). „Verifiziert" ist **kein** Filter, sondern Grundvoraussetzung.
- Darstellung: **reiche Karten**; Insights-Teaser = **Vorjahres-Platzierung** (günstig, kein Live-S/U/N pro Karte → vermeidet N+1).
- Verif-Gate gilt **für Discovery UND `/m/{slug}`** (unverifiziert = unsichtbar, 404).

## Was neu gebaut / geändert wird

### 1. Verifikations-Gate (Konsistenz)
- `listDiscoverableTeams` (`lib/db/queries/sponsor-discover.ts`): Bedingung `teams.verifiedAt IS NOT NULL` ergänzen (zusätzlich zu `discoverable` + `isActive`).
- `getPublicTeamProfileBySlug` (B1, gleiche Datei): ebenfalls `teams.verifiedAt IS NOT NULL` fordern → `null` (Seite rendert `notFound()`), wenn nicht verifiziert.
- Gate nutzt **team-level** Verifizierung (`teams.verifiedAt`). Der ✔-Badge zeigt entsprechend team-verifiziert; da nun alles Auffindbare verifiziert ist, ist der Badge primär Reassurance.

### 2. Query-Erweiterung `listDiscoverableTeams`
Neue optionale Filter + reichere Felder:
- Params: `league?: string`, `ort?: string` (zusätzlich zu `search`, `sponsorUserId`, `limit`). Bei gesetztem `league`/`ort` exakte Gleichheit (`eq`).
- Rückgabe (`DiscoverableTeam`) ergänzen um: `league: string | null`, `coverUrl: string | null` (Serve-Endpoint `/api/teams/{id}/image?slot=cover` bzw. `null`), `logoUrl: string | null` (`?slot=logo`), `lastSeasonPosition: number | null`, `lastSeasonPromoted: boolean`.
- Vorjahres-Teaser via `LEFT JOIN LATERAL` auf `season_results` (jüngste Zeile ≠ aktuelle Saison):
  ```sql
  LEFT JOIN LATERAL (
    SELECT final_position, promoted FROM season_results sr
    WHERE sr.team_id = teams.id AND sr.saison <> teams.saison
    ORDER BY sr.saison DESC LIMIT 1
  ) ls ON true
  ```
  (In Drizzle via `sql`-Fragment / `.leftJoinLateral` falls verfügbar, sonst korrelierte Subqueries pro Feld.)

### 3. Facetten-Query `listDiscoveryFacets`
- Neu in `sponsor-discover.ts`: `listDiscoveryFacets(): Promise<{ leagues: string[]; orte: string[] }>` — distinkte, nicht-leere `teams.league` bzw. `clubs.ort` über die auffindbaren (verifiziert + discoverable + active) Mannschaften, alphabetisch sortiert. Füttert die Filter-Dropdowns.

### 4. Geteilte UI-Komponenten
- `TeamDiscoverCard` (neu, z. B. `components/shared/team-discover-card.tsx` oder unter einem discover-Ordner): reiche Karte. Prop `mode: "public" | "sponsor"`:
  - `public`: „Profil ansehen" + „Anfragen" → beide verlinken auf `/m/{slug}` (Anfrage-Formular dort, login-frei).
  - `sponsor`: „Profil ansehen" → `/m/{slug}`; „Anfragen" inline (bestehender Inquiry-Flow); `hasOpenInquiry` → „Bereits angefragt"-Zustand.
- `DiscoverFilters` (neu, Client): Suchfeld + Liga-Dropdown + Ort-Dropdown; schreibt `?q=&league=&ort=` in die URL (GET/Router). Erhält die Facetten als Props.

### 5. Öffentliche Discovery-Seite (neu)
- Route `app/(marketing)/mannschaften/page.tsx` (oder passender öffentlicher Route-Group-Ort) — **kein** Auth. Lädt `listDiscoverableTeams({ search, league, ort })` + `listDiscoveryFacets()`. Rendert `DiscoverFilters` + Karten-Grid (`mode="public"`). Leerer Zustand mit freundlichem Text. SEO-Metadata.

### 6. Eingeloggte Sponsor-Seite (erweitern)
- `app/(sponsor)/sponsor/discover/page.tsx`: dieselben Facetten/Filter + reiche Karten (`mode="sponsor"`), `listDiscoverableTeams({ search, league, ort, sponsorUserId })`. „Deine Anfragen"-Sektion bleibt. Bestehende `DiscoverList`/`InquiriesList` werden auf die neue Karte/Filter umgestellt (Inquiry-Action wiederverwenden).

### 7. Was NICHT geändert wird
- Anfrage-/Lead-Flows selbst (`createSponsorInquiry` für eingeloggt, `createPublicSponsorLead` auf `/m/{slug}`) bleiben unverändert — Discovery verlinkt/nutzt sie nur.
- Bild-Serve-Endpoint, Insights, Schema (alles B1) unverändert; keine Migration nötig.

## Tests (verifizierbar)
- `listDiscoverableTeams`: (a) verifiziertes + discoverable + active Team erscheint; (b) **unverifiziertes** Team erscheint NICHT (Gate); (c) `league`-Filter grenzt korrekt ein; (d) `ort`-Filter grenzt korrekt ein; (e) `lastSeasonPosition` kommt aus der jüngsten Vorsaison-Zeile (nicht der aktuellen Saison); (f) `hasOpenInquiry` korrekt bei gesetztem `sponsorUserId`.
- `listDiscoveryFacets`: distinkte, sortierte Ligen/Orte nur aus auffindbaren Teams; keine Nulls/Leerstrings.
- `getPublicTeamProfileBySlug`: liefert `null` für ein **unverifiziertes** (aber discoverable) Team (neues Gate); weiterhin Profil für verifiziertes.
- Smoke/Manual: öffentliche `/mannschaften` lädt ohne Login, Filter (Liga/Ort) + Suche grenzen ein, Karten verlinken auf `/m/{slug}`; `/sponsor/discover` zeigt dieselben Filter + „Anfragen" inline + „Deine Anfragen"; `npx tsc --noEmit` clean.

## Erfolgskriterien
1. Öffentliche `/mannschaften`-Seite (ohne Login) listet verifizierte, öffentliche Mannschaften als reiche Karten; Liga- und Ort-Dropdowns + Suche filtern (URL-Parameter); Karten führen zur `/m/{slug}`-Anfrage.
2. `/sponsor/discover` bietet dieselben Filter/Karten + inline-Anfrage (eingeloggt) + „Deine Anfragen" + „bereits angefragt".
3. Nicht-verifizierte Mannschaften erscheinen weder in Discovery noch unter `/m/{slug}` (404).
4. Vorjahres-Platzierung erscheint als Teaser, ohne N+1 (LATERAL/Subquery).
5. `npx tsc --noEmit` clean; neue Query-/Gate-Tests grün; bestehende Tests grün.

## Bewusst NICHT in Baustein 3 (Follow-up)
- Umkreis-/Geo-Suche (keine Geodaten; Ort ist exakter Filter).
- Live-S/U/N-Teaser pro Karte (Performance; Vorjahres-Platzierung genügt).
- Sortier-Optionen / Pagination über das aktuelle Limit hinaus (Limit bleibt; erweiterbar später).
- Gespeicherte Suchen / Benachrichtigungen für Sponsoren.
