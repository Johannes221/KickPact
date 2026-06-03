# Onboarding-/Welcome-Redesign — Design

**Datum:** 2026-06-03
**Scope:** Nativer App-Intro-Wizard (`/willkommen`) + Rollen-Chooser (`/signup`) frischer, kompakter, lebendiger. Mobile-First (native iOS-Shell).

## Ziel / Erfolgskriterien

1. **Intro-Wizard** (`app/willkommen/_components/intro-wizard.tsx`): schärfere Copy, echter Ablauf-Slide, beidseitige Benefits, **Progress-Bar über volle Breite**, animierter Brand-Hintergrund.
2. **Rollen-Chooser** (`app/(auth)/signup/page.tsx`): **passt komplett auf einen Mobile-Screen ohne Scrollen**, kleine tippbare Tiles, kein aufgeblähter Titelblock.
3. Keine funktionalen Änderungen an Auth-Flow, Routing oder den eigentlichen Onboarding-Wizards (mannschaft/verein/sponsor-Steps). Reines Präsentations-Redesign.

Verifikation: Screenshots im Mobile-Viewport (375×812) — Chooser ohne Scroll sichtbar; Wizard-Slides 1–4 korrekt; Progress-Bar volle Breite; Hintergrund animiert.

## A · Intro-Wizard

Bleibt 4 Slides, native iOS-Shell, hell, skippable, `kp_intro_seen`-localStorage. Copy mit Hormozi (konkreter Nutzen) + Rubin (reduziert) geschärft.

**Slide 1 — Hook** *(bleibt)*: „Sponsoring, das mitfiebert." + bestehender Body.

**Slide 2 — Betrag** *(bleibt)*: „Du bestimmst den Betrag." + 3 Meilenstein-Karten (Pro Tor 3 € / Pro Sieg 50 € / Pro Aufstieg 200 €).

**Slide 3 — Ablauf** *(neu, ersetzt abstrakte Features)*: Titel „So läuft's." als nummerierter 4-Schritt-Flow:
1. **Mannschaft anlegen** — Wizard findet euer Team — in 90 Sekunden.
2. **Spiele auswählen** — Ihr bestimmt, welche zählen.
3. **Sponsoren einladen** — Ein Link für Familie, Stammtisch & lokale Firmen.
4. **Automatisch erfasst** — Tore, Siege, Aufstieg — die Kasse füllt sich von allein.

Darunter ein Badge: **„30 Tage kostenlos — danach ab 5 €/Monat."**
Visuell: vertikale Schritt-Liste mit verbundenen Nummern-Badges (Timeline-Stil wie der bestehende Onboarding-Wizard-Screenshot, der dem User gefällt).

**Slide 4 — Benefits beidseitig** *(neu, echte Website-Benefits)*: Titel „Gemacht für beide Seiten." Zwei Karten:
- **Für Mannschaften:** 100 % bleibt bei euch — kein Abzug · Kasse wächst automatisch, ohne Aufwand · Eigenständig — keine Vorstands-Politik · Live mitfiebern, jedes Tor zählt.
- **Für Sponsoren:** Zahl nur, wenn das Team liefert (performance-basiert) · Frei wählbar: 0,50 €–500 € pro Event · Steuerlich absetzbar als Werbeleistung · Rechnung am Monatsende, 100 % ans Team.

**Progress-Bar-Fix:** Statt linksbündiger Dots eine **volle Breite spannende segmentierte Leiste** — n gleich breite Segmente (`flex-1`), vergangene/aktives Segment grün gefüllt, kommende neutral. Footer-CTA „Weiter" / „Los geht's" bleibt.

## B · Rollen-Chooser (kompakt, kein Scroll)

`app/(auth)/signup/page.tsx` hat zwei nahezu identische Chooser-Blöcke (ausgeloggter 3-Wege-Chooser + `AuthenticatedRoleChooser`). **Refactor:** in eine geteilte Komponente `components/auth/role-chooser.tsx` extrahieren (Props: `heading`, `subline`, `badge?`, `tiles`-Daten mit Ziel-Href). Beide Call-Sites nutzen sie; `ROLE_META` bleibt Datenquelle, aber die für den Chooser gezeigte Variante nutzt nur Icon + Titel + **eine** Kurzzeile (Bullets entfallen im Chooser).

**Layout (Mobile-First, kein Scroll):**
- Kompakter Kopf: kleines Logo/Badge optional, **eine** Headline-Zeile „KickPact starten" (z.B. `text-2xl`), knappe Subline einzeilig. Deutlich weniger vertikaler Platz als bisher (`py-12 md:py-16` → safe-area + knapp).
- **3 kompakte Tiles** als vertikale Liste (Mobile) / 3-Spalten (Desktop): Zeile mit Icon-Badge links + Titel + einzeiliger Tagline + Chevron rechts. Höhe je Tile ~72–84px → 3 Tiles + Kopf + „Schon dabei? Login" passen auf 375×812 ohne Scroll.
- Tagline-Kurztexte: Mannschaft „Eine Mannschaft, direkt in eure Kasse" · Verein „Mehrere Teams unter einem Dach" · Sponsor „Ein Team performance-basiert unterstützen".
- Tap-Ziel: ganze Tile (bestehende Hrefs/`ADD_ROLE_HREF` bzw. `?role=…&from=chooser`), `active:scale`-Feedback für „smooth durchklicken".
- Detail-Bullets wandern in den jeweiligen Folge-Schritt (nicht mehr im Chooser).

## C · Hintergrund / Motion

Brand-Hintergrund hinter Wizard-Slides (und optional Chooser), CSS-only (WebView-Performance), `prefers-reduced-motion`-aware (statisch bei reduce):
- **Variante A (Empfehlung):** dezentes **grünes Netz-Grid** (SVG/CSS-Linien, accent @ ~6–10 % Opazität) das langsam driftet, plus weicher radialer grüner Glow hinter dem Fokus-Element.
- **Variante B:** 2–3 **grüne Mesh-Gradient-Blobs**, langsam schwebend (`@keyframes` translate/scale), stark weichgezeichnet.

Beide werden gebaut und am echten Slide verglichen; finale Wahl durch User. Implementierung als isolierte Komponente `components/shared/brand-backdrop.tsx` mit `variant`-Prop, damit austauschbar.

## Nicht im Scope (YAGNI)

- Keine Änderung an Auth/Session/Routing-Logik, Middleware, Onboarding-Wizard-Steps.
- Kein neuer Welcome-Screen im Browser (Intro bleibt native-App-only wie bisher).
- Keine 21st.dev-Dependency (Variante C verworfen — WebView-Perf + Dependency).

## Betroffene Dateien

- `app/willkommen/_components/intro-wizard.tsx` (Copy, Slide 3+4, Progress-Bar, Backdrop)
- `app/(auth)/signup/page.tsx` (beide Chooser → geteilte Komponente, kompaktes Layout)
- `components/auth/role-chooser.tsx` *(neu)*
- `components/shared/brand-backdrop.tsx` *(neu)*
- ggf. `app/globals.css` (Keyframes für Backdrop/Progress)
