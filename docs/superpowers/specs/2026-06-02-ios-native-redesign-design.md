# iOS-Native UI/UX Redesign — Design Spec

**Date:** 2026-06-02
**Status:** draft-for-review
**Author:** Johannes + Claude (brainstorming session)
**Scope:** Verein- + Mannschaft- + Sponsor-Bereich (gesamtes authentifiziertes App-Shell)

## 1. Problem Statement

Die mobile App (Next.js 15 + Capacitor-WebView) fühlt sich an wie eine Website im Telefon, nicht wie eine native iOS-App. Aus den Screenshots + Code-Analyse ergeben sich **sieben Wurzelursachen**, aus denen alle sichtbaren Symptome folgen:

1. **Web-Chrome statt App-Chrome.** Globaler Logo-Banner ([`components/shared/app-header.tsx`](../../../components/shared/app-header.tsx)) oben + Footer mit „Impressum · Datenschutz · AGB · © 2026" in jedem Layout ([`(verein)/.../layout.tsx:226`](../../../app/(verein)/verein/[slug]/layout.tsx), [`(sponsor)/sponsor/layout.tsx:34`](../../../app/(sponsor)/sponsor/layout.tsx)). Native Apps haben oben eine Navigation Bar (Titel + eine Action), unten eine Tab Bar — keinen Logo-Banner, keinen Footer.

2. **Display-Font-Overkill (Haupttäter).** `Montserrat Alternates Black` mit `font-display font-black tracking-tight` auf nahezu jeder Überschrift ([`app/layout.tsx:14`](../../../app/layout.tsx), [`tailwind.config.ts:23`](../../../tailwind.config.ts)). Die schwere, runde Schrift + enges Tracking erzwingt Truncation (`A-Junioren - JSG Doss...`) und Mid-Word-Trennung (`Wieb-lingen`). Wirkt laut und gebastelt.

3. **Überschriften-Stapel.** Jede Seite stapelt dieselbe Info dreifach (Vereinsname-Eyebrow uppercase → Mannschaftsname-Eyebrow uppercase truncated → große Headline truncated → Saison-Pill). Es gibt **keine geteilte PageHeader-Komponente** — das Muster ist überall inline reinkopiert.

4. **Filter fressen vertikalen Platz.** Pacts-Seite: zwei volle Pill-Reihen mit Seiten-Labels (`STATUS`/`ART`) — auch bei 0 Einträgen. Desktop-Filter-Denke auf einem Telefon-Screen.

5. **Navigation springt.** Von der Mannschaft (Tabs: Übersicht/Pacts/Spiele/Profil) in ein Spiel-Detail → plötzlich Club-Tabs + wrappende Breadcrumb, weil `/verein/[slug]/spiel/[matchId]` im Club-Route-Group liegt statt im Team-Group.

6. **Jargon-Mix.** „Pacts", „Charges", „Wetten" — Deutsch/Englisch gemischt; `S/U/N`, `2526`-Pill kryptisch.

7. **FAB überlappt Inhalt.** Der grüne `+`-FAB liegt über Überschriften und schneidet sie ab.

## 2. Goals (verifizierbare Erfolgskriterien)

Nach diesem Durchgang muss Folgendes wahr sein. Jeder Punkt ist im iPhone-Viewport (390×844, `viewport-fit=cover`) prüfbar.

- **G1 — Kein Web-Chrome:** Auf keiner authentifizierten App-Seite erscheint der KICKPACT-Logo-Banner oben oder der Impressum/Datenschutz/AGB-Footer. Stattdessen: oben eine iOS-Navigation-Bar (Titel + Zahnrad), unten die Tab Bar.
- **G2 — Keine Truncation/Trennung bei Titeln:** Lange Mannschaftsnamen (`A-Junioren - JSG Dossenheim/Handschuhsheim/Wieblingen`) werden nirgends mit `…` abgeschnitten oder mitten im Wort getrennt. Sie brechen sauber auf max. 2 Zeilen oder verkleinern sich.
- **G3 — System-Font:** Die App-UI rendert in der Apple-System-Schrift (SF Pro über System-Font-Stack). Die Display-Font wird in App-Screens nicht mehr für Überschriften verwendet (bleibt für Logo/Marketing).
- **G4 — Eine PageHeader-Komponente:** Alle App-Screens nutzen dieselbe `PageHeader`-Komponente. Kein Eyebrow-Stapel; max. ein Titel + optionaler Subtitle.
- **G5 — Stabile Tab Bar:** Die Tab Bar bleibt über alle Screens eines Kontexts identisch. Insbesondere bleibt das Spiel-Detail im Mannschafts-Tab-Kontext (kein Nav-Sprung).
- **G6 — Kompakte Filter:** Filter belegen max. eine Zeile (Segmented Control) bzw. liegen hinter einem Filter-Button + Sheet. Keine zwei gestapelten Pill-Reihen mehr.
- **G7 — Collapsible Sections:** „Anstehende Aufgaben" und vergleichbare Sektionen sind ein-/ausklappbar und starten eingeklappt, sobald sie vollständig erledigt sind.
- **G8 — Kein FAB-Overlap:** Der FAB überdeckt keinen Text/keine Überschrift; Listen haben unten genug Padding (`scroll-padding`/Spacer) damit das letzte Element frei bleibt.
- **G9 — Klares Deutsch:** Sichtbare Navigations- und Überschriften-Begriffe sind konsistent deutsch (siehe §8 Glossar).
- **G10 — Safe-Areas korrekt:** Nav-Bar respektiert `safe-area-inset-top`, Tab Bar `safe-area-inset-bottom`; nichts liegt unter Notch/Home-Indicator.

## 3. Out of Scope

- Funktionale/Datenmodell-Änderungen (Queries, Permissions, Inngest-Jobs, Scraper). Reines UI/UX/IA-Redesign.
- Marketing-Seiten (`(marketing)`), Auth-Seiten, das öffentliche Profil `/m/[slug]` (haben eigenes Design, separat behandelt).
- Operator/Admin-Panel.
- Echte native Plugins (Push etc.) — separater Spec.
- Neue Features. Wir bauen **das Bestehende nativ um**, fügen nichts inhaltlich Neues hinzu (außer der Zahnrad-Menüstruktur, die nur Vorhandenes umsortiert).

## 4. Das native App-Shell

### 4.1 Navigation Bar (oben) — ersetzt den Logo-Header

Der globale `AppHeader` wird in allen authentifizierten App-Bereichen entfernt und durch eine **`AppNavBar`** ersetzt — eine pro-Screen-Leiste nach iOS-Large-Title-Muster:

- **Aufbau:** Großer Titel links (z.B. „Übersicht", „Spiele", „Pacts", „Sponsoren", „Profil"), rechts **eine** Action: das **Zahnrad-Icon** (öffnet das Menü-Sheet, §4.3). Bei Detail-Screens links zusätzlich ein **Back-Chevron** + Titel des Ziels.
- **Large-Title-Verhalten (Annäherung):** Beim Scrollen schrumpft der große Titel (34px → 17px) und die Leiste wird kompakt + bekommt eine dünne Trennlinie. Umsetzung pragmatisch via `position: sticky` + Scroll-Listener (kein echtes UIKit). Reduziertes Fallback ohne Animation ist akzeptabel, solange G1/G4 erfüllt sind.
- **Kontext-Zeile:** Der Vereins-/Mannschaftsname (bisher Eyebrow-Stapel) erscheint **nicht** mehr als laute Überschrift. Stattdessen entscheidet die `PageHeader` (§4.4) pro Screen, ob ein dezenter Subtitle nötig ist.
- **Safe-Area:** `padding-top: env(safe-area-inset-top)`.
- **Kein Logo** in der App-Nav-Bar (Entscheidung: Header komplett weg).

### 4.2 Tab Bar (unten)

Bleibt die bestehende [`components/shared/bottom-tab-bar.tsx`](../../../components/shared/bottom-tab-bar.tsx), aber:

- **Genau 5 Tabs sichtbar, kein „Mehr"-Tab mehr** in der Tab Bar. Overflow wandert ins Zahnrad-Menü oben (§4.3).
- iOS-Maße: Tab-Höhe ~49px + `safe-area-inset-bottom`; Icon ~26px, Label ~10–11px, aktiver Tab in Brand-Grün, inaktive in Neutral-Grau.
- SF-Symbols-ähnliche, dünne Outline-Icons; aktiver Zustand gefüllt/eingefärbt.

**Tab-Konfigurationen:**

| Kontext | Tab 1 | Tab 2 | Tab 3 | Tab 4 | Tab 5 |
|---|---|---|---|---|---|
| **Mannschaft** | Übersicht | Spiele | Pacts | Sponsoren | Profil |
| **Verein (Club)** | Übersicht | Mannschaften | Sponsoren | Abrechnung | Profil |
| **Sponsor** | Übersicht | Entdecken | Wetten | Inbox | Profil |

(Club- und Sponsor-Tabs sind Vorschlag — siehe §6.2/§6.3; im Review bestätigen.)

### 4.3 Das Zahnrad-Menü (oben rechts) — ersetzt „Mehr" + Avatar-Dropdown

Ein Tap aufs Zahnrad öffnet ein **Bottom-Sheet** (kein Dropdown), gegliedert in Sektionen:

- **Verwaltung (kontextabhängig):**
  - Mannschaft: Finanzen, Abo, Einstellungen, Verifikation
  - Verein: Pacts, Charges, Einstellungen, Abo, Verifikation
  - Sponsor: Bilanz, Charges, Rechnungen
- **Konto:** Rolle/Identität wechseln (Multi-Role-Switcher aus `HeaderUserMenu`), Benachrichtigungen, Abmelden.
- **Rechtliches:** Impressum, Datenschutz, AGB (hierher wandert der bisherige Footer — erfüllt G1).

Der bisherige `HeaderUserMenu` (Avatar + Rollenwechsel + Logout) wird in dieses Sheet integriert; der Avatar-Banner oben rechts entfällt.

### 4.4 `PageHeader` — eine geteilte Komponente

Neu: `components/shared/page-header.tsx`. Ersetzt alle inline-Heading-Stapel.

```tsx
<PageHeader
  title="Übersicht"            // ausgeschrieben, klar (kein Jargon)
  subtitle="A-Junioren · Saison 25/26"  // optional, dezent, EIN Subtitle
  // kein Eyebrow-Stapel, keine Saison-Pill, kein uppercase-Vereinsname
/>
```

- Titel: System-Font, ~28–34px, `font-semibold`/`font-bold` (nicht `font-black`).
- Subtitle: ~15px, Sekundär-Grau, **EINE** Zeile mit zentraler Info (Mannschaft + Saison kombiniert, lesbar `25/26` statt `2526`).
- Lange Namen: `text-balance`/`hyphens: none`/`overflow-wrap: anywhere` mit sauberem Zeilenumbruch statt Truncation oder Silbentrennung (G2).
- Die `PageHeader` ist Teil der Nav-Bar-Region (Large-Title), nicht ein separater Block, der zusätzlich Platz frisst.

### 4.5 Typografie-System (System-Font)

- `--font-sans` wird auf den **System-Font-Stack** umgestellt: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif`. (Inter bleibt optional als Fallback/Web, aber UI rendert nativ auf iOS.)
- `--font-display` (Montserrat Alternates) wird aus App-Überschriften entfernt; bleibt nur für Logo/Marketing-Seiten verfügbar.
- Globale Typo-Skala (iOS-orientiert): Large Title 34, Title1 28, Title2 22, Headline 17 semibold, Body 17, Subhead 15, Footnote 13, Caption 12.
- Alle `font-display font-black tracking-tight`-Vorkommen in App-Screens werden durch Skala-Klassen ersetzt. `tracking-tight` wird auf Titeln entfernt (System-Font braucht kein negatives Tracking).

### 4.6 Visuelles System (Airbnb/PayPal/Instagram-Cleanness)

- **Hintergrund:** ruhiges Off-White/Neutral; Karten weiß mit **dünnen Separatoren / sehr weichen Schatten** statt der aktuellen kräftigen Card-Rahmen. Weniger Boxen-in-Boxen.
- **Grün dosieren:** Brand-Grün (`#01C457`) bleibt Akzent für primäre Aktionen/aktive States, dominiert aber keine Flächen. Neutral-First.
- **Abstände:** 16px horizontale Screen-Margins, 8px-Grid, großzügiger vertikaler Rhythmus zwischen Sektionen.
- **Radius:** Karten 14–16px, Pills/Buttons 10–12px.
- **Listen statt Karten-Stapel:** Wo es passt (z.B. Aufgaben, Einstellungen), iOS-Inset-Grouped-List-Look (eine gerundete Gruppe, Zeilen mit Hairline-Trennern) statt vieler Einzelkarten.

## 5. Wiederkehrende UI-Bausteine

### 5.1 `CollapsibleSection`
Disclosure-Komponente (Header mit Titel + Chevron, animiertes Auf-/Zuklappen). Persistiert Zustand pro Sektion (localStorage o.ä.). „Anstehende Aufgaben" nutzt sie und startet eingeklappt, wenn `offene Aufgaben === 0` (G7).

### 5.2 `SegmentedControl` / `FilterSheet`
- Bei ≤4 Optionen einer Dimension: iOS-`SegmentedControl` (eine Zeile, gleich breite Segmente).
- Bei mehreren Dimensionen (Pacts: Status + Art + ggf. Mannschaft/Sponsor): **Filter-Button** in der Nav-Bar/oben, der ein `FilterSheet` öffnet; aktive Filter als kleine, entfernbare Chips über der Liste. Ersetzt [`components/shared/filter-bar.tsx`](../../../components/shared/filter-bar.tsx) im Mobile-Layout (G6).

### 5.3 `ScoreCard` (Spiel)
Fix für G2: Teamnamen mit `overflow-wrap: anywhere; hyphens: none;` → kein `Wieb-lingen`. Bei zwei langen Namen: Namen unter dem Score statt links/rechts gequetscht, oder kleinere Schrift. Datum/Saison als eine lesbare Zeile (`14. Mai 2026 · Saison 25/26`).

### 5.4 FAB-Spacer
Listen/Screens mit FAB bekommen unten `padding-bottom` ≥ FAB-Höhe + Tab-Bar, damit kein Inhalt überdeckt wird (G8). Optional: FAB blendet sich beim Scrollen nach unten dezent aus.

## 6. Screen-für-Screen

### 6.1 Mannschaft (Hauptfokus — die Screenshots)
- **Übersicht:** Nav-Bar „Übersicht" + Subtitle (Mannschaft · Saison). „Anstehende Aufgaben" als `CollapsibleSection` mit Inset-Grouped-List statt 4 Einzelkarten. KPI-Kacheln (Spiele, S/U/N → ausgeschrieben „Bilanz", Tore, Sponsor-€) als ruhiges 2×2-Grid. FAB-Spacer.
- **Spiele:** Liste der Spiele; kompakte Filter (Saison/Wettbewerb) als SegmentedControl falls nötig. Tap → Spiel-Detail **im selben Tab-Kontext**.
- **Spiel-Detail (G5-Fix):** Route von Club-Group ins Mannschafts-Group verschieben/aliasen, sodass die Mannschafts-Tab-Bar bestehen bleibt. Breadcrumb ersetzt durch Nav-Bar mit Back-Chevron + Titel. `ScoreCard` mit G2-Fix. „Spielverlauf" mit FAB-Spacer.
- **Pacts:** SegmentedControl (Status) + FilterSheet (Art/Sponsor). Leerstaaten ohne riesige Filterblöcke.
- **Sponsoren:** eigener Tab (vorher in „Mehr").
- **Profil (Tab 5):** das „richtig nice" Team-Profil — der bestehende `mein-profil-editor` wird visuell auf das neue System gehoben (Cover/Avatar/Name ohne 4-Zeilen-Black-Headline; „Öffentlich"-Toggle + „Live-Vorschau" als saubere Nav-Bar-Action statt gequetschter Zeile). Footer-Links (Impressum etc.) sind hier **nicht** mehr nötig — sie liegen im Zahnrad-Menü.

### 6.2 Verein (Club)
Gleiches Shell. Tab-Vorschlag: Übersicht · Mannschaften · Sponsoren · Abrechnung · Profil. Overflow (Pacts, Charges, Einstellungen, Abo, Verifikation) ins Zahnrad. **Im Review bestätigen.**

### 6.3 Sponsor
Gleiches Shell. Tab-Vorschlag: Übersicht · Entdecken (Discover) · Wetten (Pledge) · Inbox (mit Badge) · Profil. Overflow (Bilanz, Charges, Rechnungen) ins Zahnrad. **Im Review bestätigen.**

## 7. Komponenten-Inventar

**Neu:**
- `components/shared/app-nav-bar.tsx` — iOS-Nav-Bar (Titel + Back + Zahnrad, Large-Title-Collapse).
- `components/shared/page-header.tsx` — geteilter Titel/Subtitle.
- `components/shared/settings-sheet.tsx` — Zahnrad-Bottom-Sheet (Verwaltung + Konto + Rechtliches).
- `components/shared/collapsible-section.tsx`
- `components/shared/segmented-control.tsx`
- `components/shared/filter-sheet.tsx`

**Geändert:**
- `components/shared/app-header.tsx` — in App-Bereichen entfernt/ersetzt (Marketing kann Header behalten).
- `components/shared/bottom-tab-bar.tsx` — 5-Tab, kein „Mehr"-Tab.
- `*-sub-nav.tsx` (verein/team/sponsor) — neue 5-Tab-Configs + Overflow → Sheet.
- Layouts (`(verein)`, `(sponsor)`) — Footer raus, Nav-Bar rein.
- `app/layout.tsx` + `tailwind.config.ts` — System-Font-Stack, Typo-Skala.
- `mein-profil-editor.tsx`, Spiel-Detail-Page, Pacts-Page, Dashboard — auf neues System gehoben.
- Spiel-Detail-Route in Mannschafts-Group.

## 8. Glossar / Copy (Vorschlag — im Review bestätigen)

| Aktuell | Vorschlag |
|---|---|
| Pacts | **Verträge** (oder „Deals" — Markenfrage) |
| Charges | **Abrechnung** |
| Wetten (Sponsor) | **Wetten** beibehalten (passt zur Positionierung) oder **Einsätze** |
| S/U/N | **Bilanz** (Label) mit `S U N`-Werten darunter |
| 2526 | **25/26** |
| Saison-Pill | als Subtitle-Text statt Pill |

## 9. Verifikation

- **Manuell im Preview** (iPhone-Viewport 390×844, dark/light): Jeder G1–G10-Punkt per Screenshot belegt — Before/After der fünf Original-Screens + Spiel-Detail.
- **Lange-Namen-Test:** `A-Junioren - JSG Dossenheim/Handschuhsheim/Wieblingen` auf jedem Screen → keine Truncation/Trennung.
- **Tab-Stabilität:** Mannschaft → Spiele → Spiel-Detail → zurück: Tab-Bar identisch.
- **Safe-Area:** Notch + Home-Indicator-Test.
- Keine neuen TypeScript-Errors; `npm run build` grün.

## 10. Offene Punkte (für Review)

1. Glossar §8 — „Verträge" vs „Deals" für Pacts? „Wetten" vs „Einsätze"?
2. Club-Tab-Bar §6.2 und Sponsor-Tab-Bar §6.3 — Reihenfolge/Auswahl ok?
3. Display-Font wirklich komplett aus App-UI (auch keine einzelnen Akzent-Headlines)? Bestätigt: ja (Entscheidung getroffen), hier nur final dokumentiert.
4. Large-Title-Collapse-Animation: voll umsetzen oder reduziertes statisches Fallback genügt für v1?
