# Spec: Baustein 2 — „Mein Profil" / „Einstellungen" trennen + Mobile-Nav

**Datum:** 2026-06-01
**Status:** approved-for-planning
**Autor:** Johannes + Claude (Brainstorming mit visuellem Begleiter)
**Baut auf:** Baustein 1 ([2026-06-01-oeffentliches-profil-redesign-design.md](2026-06-01-oeffentliches-profil-redesign-design.md)) — dessen Upload-Routes, Insights-Query, öffentliche Komponenten und Schema werden wiederverwendet.

**Teil 2 von 3** der Profil/Einstellungen/Discovery-Überarbeitung. Baustein 3 = Sponsoren-Discovery.

## Ziel

Heute sind „Profil bearbeiten" und „Einstellungen" vermischt: Stammdaten (Name/Logo) und die Links zu „Öffentliches Profil" und „Verifikation" liegen mitten in der Einstellungen-Seite. Baustein 2 trennt das sauber:

- **„Mein Profil"** — eigener Tab, **WYSIWYG-nahe editierbare Vorschau**: sieht aus wie die öffentliche Seite (Baustein-1-Look), aber mit Inline-Bedienelementen. Hier pflegt die Mannschaft ihr ganzes öffentliches Erscheinungsbild **und** die Verifikation. Mobil & schön.
- **„Einstellungen"** — nur noch der „langweilige" Rest: Rechnungs-/Zahlungsdaten, Lifecycle (de-/aktivieren), Mitglieder & Zugriff, Spieler & DSGVO, Saison-Endstand.
- **Mobile-Navigation** entlastet: Bottom-Bar zeigt 4 Haupt-Tabs + ein „Mehr"-Sheet (statt 7–8 Icons).

## Entscheidungen (im Brainstorming festgelegt)

- Profil-Stil: **WYSIWYG-nahe Edit-Ansicht** (kein schlichtes Formular).
- Navigation: neuer **„Profil"-Tab**; Mobile-Bottom-Bar = 4 primäre Tabs + „Mehr".
- **Verifikation** lebt in „Mein Profil" (Status-Zeile + Einstieg in den bestehenden Verifikations-Flow); der ✔-Badge erscheint öffentlich.

## Was neu gebaut / geändert wird

### 1. Navigation (`team-sub-nav.tsx` + `bottom-tab-bar.tsx`)
- `ALL_TABS` bekommt einen `Profil`-Eintrag (`/profil`, Icon `UserRound`) und pro Tab ein `primary: boolean`-Flag.
  - **Desktop:** alle Tabs horizontal (unverändertes Verhalten), Reihenfolge: Übersicht, Profil, Pacts, Sponsoren, Spiele, Finanzen, Abo, Einstellungen.
  - **Mobile primär (`primary:true`):** Übersicht, Pacts, Spiele, Profil. **Overflow (`primary:false`):** Sponsoren, Finanzen, Abo, Einstellungen.
- `getTeamSubNavTabs` bleibt plan-aware (auf `verein`-Lizenz fallen Abo/Einstellungen wie bisher weg — diese sind dann ohnehin im Overflow).
- `BottomTabBar` wird um einen **Overflow-Modus** erweitert: zeigt die primären Items + einen „Mehr"-Button, der ein Sheet/Popover mit den restlichen Items öffnet (aktiver Zustand schlägt auch durch, wenn eine Overflow-Route aktiv ist → „Mehr" markiert). Bestehende Aufrufer ohne Overflow-Items verhalten sich unverändert.

### 2. „Mein Profil"-Seite (`…/mannschaft/[teamId]/profil/page.tsx` — Neuaufbau)
WYSIWYG-Edit-Ansicht, die die öffentlichen Baustein-1-Sektionen spiegelt, aber editierbar. Reiner Admin-Zugriff (bestehender Team-Auth-Guard). Bestandteile:
- **Edit-Toolbar (sticky):** Titel „Mein Profil", **Öffentlich-Schalter** (`discoverable`, ruft `saveTeamPublicProfile`/`setTeamDiscoverable`), **„Vorschau ↗"** → `/m/{slug}` (nur wenn Slug existiert/öffentlich).
- **Hero (edit):** Cover mit „Cover ändern" (Upload-Route Cover), Logo mit Ändern (Upload-Route Logo), **Name inline editierbar** (`renameTeam`). Liga/Ort werden angezeigt (read-only; Liga aus Crawler, Ort aus Club).
- **Verifikations-Zeile:** zeigt Status (verifiziert / ausstehend / nicht gestartet) + Link „Status ansehen" bzw. „Mannschaft verifizieren" → bestehende `…/verifikation`-Seite (bleibt erhalten, nur von hier verlinkt).
- **Insights:** Anzeige + „anzeigen"-Schalter (`setTeamShowInsights`).
- **Galerie:** Thumbnails mit Löschen (DELETE-Route) + „＋ Bild" (POST-Route), max. 8.
- **Über uns (inline):** Tagline + Ziele + öffentlicher Anzeigename bearbeitbar (`saveTeamPublicProfile`).
- Wiederverwendung: die Insights-/Galerie-Darstellung lehnt sich an die öffentlichen Komponenten an; Edit-Steuerung kommt aus dem in Baustein 1 / Task 10 gebauten `MediaManager`, der hier in die WYSIWYG-Ansicht integriert wird (statt separater Block unter einem Formular). Der frühere separate `PublicProfileForm`-Block entfällt zugunsten der Inline-Edits.

### 3. „Einstellungen"-Seite (`…/einstellungen/page.tsx` — verschlanken)
- **Entfernen:** Stammdaten-Block (Name/Logo → jetzt im Profil), Link „Öffentliches Profil", Link „Mannschaft verifizieren" (beides jetzt über Profil erreichbar).
- **Behalten:** Rechnungs- & Zahlungsdaten, Lifecycle, „Weitere Bereiche" → Mitglieder & Zugriff, Spieler & DSGVO-Opt-out, Saison-Endstand.
- `TeamStammdatenForm` wird in die Profil-Seite verschoben/integriert (nicht gelöscht — Name/Logo-Logik bleibt, neuer Ort).

### 4. Was NICHT geändert wird
- Die Verifikations-Seite/-Actions selbst (`…/verifikation`) bleiben unverändert — nur der Einstiegspunkt wandert.
- Upload-Routes, Insights-Query, öffentliche `/m/[slug]`-Seite (Baustein 1) bleiben unverändert.
- `saveTeamPublicProfile`, `renameTeam`, `setTeamShowInsights`, Cover/Galerie-Routes existieren bereits.

## Tests (verifizierbar)
- `getTeamSubNavTabs`: enthält `Profil`; primäre vs. Overflow-Aufteilung korrekt; `verein`-Plan filtert Abo/Einstellungen weiterhin raus. (Unit, isoliert.)
- `BottomTabBar`-Overflow: Rendering-Logik primär+„Mehr" (Komponententest oder isolierte Helper-Funktion für die Aufteilung).
- Smoke/Manual: Profil-Tab erscheint; „Mein Profil" lädt mit Hero/Insights/Galerie/Über-uns + Edit-Bedienelementen; Cover/Logo/Galerie/Name/Tagline/Insights-Toggle/Öffentlich-Schalter wirken (Werte landen in DB, öffentliche Seite spiegelt sie); Einstellungen zeigt Stammdaten/Profil/Verifikation **nicht** mehr; Verifikation weiterhin aus Profil erreichbar; `npx tsc --noEmit` clean.

## Erfolgskriterien
1. Team-Sub-Nav hat einen „Profil"-Tab; Mobile-Bottom-Bar zeigt 4 + „Mehr", „Mehr" öffnet die restlichen Tabs; aktiver Zustand korrekt (inkl. Overflow→„Mehr").
2. „Mein Profil" ist die editierbare Vorschau: alle Felder/Medien (Cover, Logo, Name, Tagline, Ziele, öffentl. Name, Galerie, Insights-Toggle, Öffentlich-Schalter) lassen sich dort bearbeiten und spiegeln sich auf `/m/{slug}`. Verifikations-Status + Einstieg sind dort sichtbar.
3. „Einstellungen" enthält keine Stammdaten/Profil/Verifikations-Einträge mehr, aber weiterhin Billing, Lifecycle, Mitglieder, Spieler/DSGVO, Saison.
4. Keine toten Links; `npx tsc --noEmit` clean; Nav-Tests grün; bestehende Tests grün.

## Bewusst NICHT in Baustein 2 (Follow-up)
- Drag&Drop-Sortierung der Galerie (sort_order existiert; UI optional später).
- Volle „echte" Inline-Rich-Text-Bearbeitung — schlichte editierbare Felder/Textareas reichen.
- Sponsoren-Discovery → Baustein 3.
