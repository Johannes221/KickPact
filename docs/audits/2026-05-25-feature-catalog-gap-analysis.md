# KickPact — Feature-Katalog & Gap-Analyse

**Stand:** 2026-05-25
**Basis:** Spec `2026-05-19-kickpact-v1-design.md`, Identity-Spec, Trust-Spec, Pricing-v2, plus tatsächlicher Code-Stand auf `main` (commit `96790e4`)
**Zweck:** Vollständiger Feature-Katalog auf kleinster Ebene über **alle Rollen**, gegengestellt mit dem, was im Code real existiert. Liest sich als "alles, was eine Plattform dieser Art können sollte" vs. "was haben wir heute".

## Legende

| Marker | Bedeutung |
|---|---|
| ✅ | Vollständig implementiert (Route + Query + UI + Action) |
| 🟡 | Teilweise: Datenmodell oder Action da, UI fehlt / UI da, Filter/Detail fehlt / nur Happy-Path |
| ❌ | Fehlt komplett |
| 🤔 | Bewusst out-of-scope laut Spec (v2+), hier nur zur Vollständigkeit aufgeführt |
| 🔍 | In Code vorhanden, aber Implementations-Tiefe nicht final verifiziert |

**Prio-Spalte** (für Lücken): **P0** = Blocker für v1-Launch · **P1** = wichtig, aber Launch-fähig ohne · **P2** = nice-to-have · **Lx** = Later, in Spec als v2+ markiert.

---

## 0. Rollen-Matrix

KickPact kennt **9 effektive Rollen-Kombinationen**. Ein User kann mehrere gleichzeitig haben (z.B. Vorstand eines Vereins + Sponsor eines anderen Vereins + Trainer einer dritten Mannschaft). Das Identity-Routing löst das beim Login auf.

| Rolle | Scope | Schreib-Rechte | Sieht |
|---|---|---|---|
| **Anonym** | – | – | Marketing, Hilfe, Pricing, Einladungs-Landings |
| **User (logged in, keine Rolle)** | – | nur eigene Konto-Daten | Identity-Picker, Onboarding-Einstiege |
| **Sponsor (Familie)** | eigene Pledges | Pledges, Approvals, eigenes Profil | eigene Pledges/Charges/Rechnungen |
| **Sponsor (Business)** | eigene Pledges | wie Familie + Business-Stammdaten | wie Familie + USt-Felder auf Rechnung |
| **Club-Admin** | 1 Verein, alle Teams | alles im Verein | alles im Verein |
| **Club-Trainer** | 1 Verein, alle Teams | Match-Events, eigenes Lesen | Verein + Sponsoren + Abrechnungen lesen |
| **Club-Viewer** | 1 Verein, alle Teams | – | Verein read-only |
| **Team-Trainer** | 1 Team | Match-Events nur dieses Teams | nur dieses Team + dessen Sponsoren |
| **Team-Viewer** | 1 Team | – | nur dieses Team read-only |
| **Plattform-Admin / Operator** | global | Verifications, Konflikte | alles |

---

## 1. Öffentlich (kein Login erforderlich)

| # | Feature | Status | Code-Pfad | Lücke / Notiz |
|---|---|---|---|---|
| 1.1 | Marketing-Landing mit Hero, Trigger-Karussell, Pricing-Block, FAQ | ✅ | `app/page.tsx` |  |
| 1.2 | Pricing-Seite mit Cycle-Toggle (monatlich / Saison / annual) | ✅ | `app/(marketing)/preise/page.tsx` |  |
| 1.3 | Hilfe-Center Hub | ✅ | `app/(marketing)/hilfe/page.tsx` | 27 Artikel |
| 1.4 | Hilfe-Artikel-Detail (Markdown + Frontmatter) | ✅ | `app/(marketing)/hilfe/[kategorie]/[slug]/page.tsx` |  |
| 1.5 | **Suche im Hilfe-Center** | 🟡 | – | Frontend-Suche fehlt / unklar — **P1** |
| 1.6 | **„Verwandte Artikel"-Navigation** | 🔍 | – | Frontmatter `related_articles` existiert, UI-Bindung prüfen |
| 1.7 | Impressum / Datenschutz / AGB | ✅ | `app/(legal)/*` |  |
| 1.8 | Status-Seite (System-Health) | ✅ | `app/status/page.tsx` | Inhalt-Tiefe nicht verifiziert |
| 1.9 | Login-Einstieg (Magic-Link) | ✅ | `app/(auth)/login/page.tsx` |  |
| 1.10 | Signup-Wizard | ✅ | `app/(auth)/signup/page.tsx` |  |
| 1.11 | E-Mail-Verifikations-Seite | ✅ | `app/(auth)/verify/page.tsx` |  |
| 1.12 | OAuth-Buttons (Google, Apple) | ✅ | `components/auth/oauth-buttons.tsx` | bedingt aktiv via Env |
| 1.13 | Sponsor-Einladungs-Landing | ✅ | `app/einladung/[token]/page.tsx` | polymorph (sponsor + team-member) |
| 1.14 | Team-Einladungs-Landing | ✅ | `app/team-einladung/[token]/page.tsx` |  |
| 1.15 | **Öffentliches Vereins-Profil** (Mini-Schaufenster für Sponsor-Discovery von außen) | ❌ | – | **P2** — Discovery nur intern für eingeloggte Sponsoren |
| 1.16 | **Öffentliche Mannschafts-Seite** mit Saison-Stats, Sponsoren-Wall | ❌ | – | **P2** |
| 1.17 | **„Über uns" / About-Page** | ❌ | – | **P2** |
| 1.18 | **Blog / News** | ❌ | – | **L2** |
| 1.19 | **Press-Kit** | ❌ | – | **L2** |
| 1.20 | **SEO-Sitemap** | 🔍 | – | `next-sitemap` etc. prüfen — **P1** |
| 1.21 | robots.txt | 🔍 | – |  |
| 1.22 | Open-Graph-Bilder pro Route | 🔍 | – | **P1** |
| 1.23 | Cookie-Banner / Consent | 🔍 | – | DSGVO-relevant — **P0** falls fehlt |
| 1.24 | Plausible/Analytics Script | ✅ | `components/analytics/plausible-script.tsx` |  |

---

## 2. Cross-Role (alle eingeloggten User)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| **Auth / Session** ||||
| 2.1 | Magic-Link-Login | ✅ |  |
| 2.2 | Google-OAuth | ✅ | env-bedingt |
| 2.3 | Apple-OAuth | ✅ | env-bedingt |
| 2.4 | Magic-Link Rate-Limit | ✅ | 5 req/60s/IP in better-auth |
| 2.5 | Session-Cookie + Bearer-Header | ✅ |  |
| 2.6 | Logout-Button | ✅ | `header-user-menu.tsx` |
| 2.7 | **„Alle Sessions abmelden"** | ❌ | better-auth kann das, kein UI-Button — **P1** |
| 2.8 | **Aktive Geräte / Login-Historie sehen** | ❌ | **P2** |
| 2.9 | **2FA / TOTP** | ❌ | **L2** |
| 2.10 | Mehrere E-Mails verknüpfen | ❌ | **L2** |
| 2.11 | Social-Account verknüpfen/lösen | 🤔 | Better-Auth-Default, nicht erweitert |
| **Identity-Routing** ||||
| 2.12 | Post-Login `/dashboard` Redirect (0/1/2+ Identitäten) | ✅ | `app/dashboard/page.tsx` |
| 2.13 | `/select-role` Identity-Picker (Multi-Identity) | ✅ | `app/select-role/page.tsx` |
| 2.14 | „Rolle wechseln" im Header-Menü | 🔍 | spec-konform laut Identity-Spec §7 — UI-Tiefe prüfen |
| 2.15 | „+ Neue Rolle hinzufügen" → /signup | ✅ |  |
| 2.16 | Erkennung: User hat schon Sponsor-Profil → kein Doppel-Sponsor anlegen | 🔍 | Code-Pfad ungeprüft |
| **Konto-Seite** ||||
| 2.17 | **Eigene „Mein-Konto"-Übersicht** (E-Mail, Name, Avatar, verknüpfte Konten) | ❌ | Es gibt **nur** `/sponsor/profil`, aber das ist nur das Sponsor-Profil, nicht das User-Konto — **P0** |
| 2.18 | **E-Mail-Adresse ändern** | ❌ | **P1** |
| 2.19 | **Name / Avatar ändern** | ❌ | **P1** |
| 2.20 | **Sprache wählen** (de/en) | ❌ | UI ist nur de — **L2** |
| 2.21 | **Theme Light/Dark/System** | 🔍 | `next-themes` ist verdrahtet, Toggle-UI prüfen |
| **DSGVO** ||||
| 2.22 | Account-Löschung beantragen | 🟡 | Server-Action `requestAccountDeletion` existiert (`lib/actions/dsgvo.ts`), **kein UI-Button gefunden** — **P0** |
| 2.23 | Löschung abbrechen (14-Tage-Grace) | 🟡 | Server-Action `cancelAccountDeletion` existiert, kein UI — **P0** |
| 2.24 | **Datenexport** (DSGVO Art. 20) | 🟡 | Server-Action `requestDataExport` existiert, kein UI — **P1** |
| 2.25 | Anonymisierungs-Job läuft täglich | ✅ | `lib/inngest/functions/anonymize-accounts` |
| 2.26 | Spieler-Opt-out / `players.blocked` Mechanik | 🟡 | Spalte da, **kein User-facing Flow zum Opt-out** — **P1** |
| **Notifications** ||||
| 2.27 | Transaktionale E-Mails (Magic-Link, Einladung, Approval, Rechnung) | ✅ | via Resend |
| 2.28 | **Notification-Preferences** (welche Mails will ich) | ❌ | aktuell „alle oder nichts" — **P1** |
| 2.29 | **In-App-Notifications / Notification-Center** (Glocke im Header) | ❌ | **P1** |
| 2.30 | **Web-Push (Browser-Notifications)** | ❌ | **L2** (Mobile v2) |
| 2.31 | E-Mail-Bounce-Handling / Mail-Status sichtbar | ❌ | **P2** |
| **Hilfe / Support** ||||
| 2.32 | Kontextuelle Hilfe-Links pro Seite | ❌ | **P1** — kein „?"-Icon mit Verweis auf relevanten Artikel |
| 2.33 | „Support kontaktieren" / Bug-Report-Formular | ❌ | **P1** — kein direkter Kontakt-CTA aus der App |
| 2.34 | Onboarding-Tour / Empty-State-Tooltips | ❌ | **P2** |
| 2.35 | Changelog / „Was ist neu?" | ❌ | **P2** |

---

## 3. Sponsor (Familie & Business)

### 3.1 Onboarding (Sponsor-Pfad)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.1.1 | Einladungslink öffnen (`/einladung/[token]`) | ✅ |  |
| 3.1.2 | Token validieren (gültig, nicht expired, nicht used) | ✅ | `lib/db/queries/invitations.ts` |
| 3.1.3 | Magic-Link-Login während Einladungs-Flow | ✅ |  |
| 3.1.4 | Sponsor-Typ wählen: Familie vs. Business | ✅ | `app/(sponsor)/sponsor/onboarding/page.tsx` |
| 3.1.5 | Business-Stammdaten erfassen (Firmenname, USt-ID, Adresse) | ✅ | `lib/actions/sponsor-profile.ts` |
| 3.1.6 | Pledge-Wizard im Anschluss starten | ✅ | leitet zu `/sponsor/pledge/new` |
| 3.1.7 | **Sponsor ohne Einladung selbst registrieren** (Discovery-only) | 🟡 | `/sponsor/discover` ist eingeloggter Sponsoren vorbehalten — **P1** Onboarding-Pfad „ich will sponsorn aber habe keinen Link" |
| 3.1.8 | **Pledge-Proxies-Setup** (Oma/Onkel über mich) | 🔍 | Schema-Spalte `pledgeProxiesJson` da, Form-UI prüfen |

### 3.2 Sponsor-Dashboard (`/sponsor`)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.2.1 | KPI: Charges diesen Monat | ✅ |  |
| 3.2.2 | KPI: Aktive Pledges | ✅ |  |
| 3.2.3 | KPI: Größte Einzel-Charge | ✅ |  |
| 3.2.4 | „Mein nächster zu erwartender Aufruhr" (nächstes Spiel mit hochgerechnetem Charge) | ❌ | **P2** — sehr engagement-stark |
| 3.2.5 | Liste „Letzte Ereignisse" (Tor → Charge) | 🔍 | im Dashboard? Vermutlich nur via Pledge-Detail erreichbar — **P1** |
| 3.2.6 | Liste „Anstehende Approvals" mit Count | 🔍 |  |
| 3.2.7 | **Gesamt-Bilanz** über alle Pledges (Saison, Jahr, kumuliert) | ❌ | **P1** — User hat explizit erwähnt: „was meine Gesamtbilanz ist" |
| 3.2.8 | **Monats-Chart / Sparkline** der eigenen Beiträge | 🔍 | `charges-sparkline.tsx` existiert — Verdrahtung prüfen |
| 3.2.9 | **Cap-Erreicht-Warnungen** auf Dashboard | ❌ | **P1** — wenn Monats-Cap zu 80% ausgeschöpft, Banner |

### 3.3 Pledge-Verwaltung

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.3.1 | Liste aller eigenen Pledges (`/sponsor/pledge`) | ✅ |  |
| 3.3.2 | Neuer Pledge anlegen via Wizard (`/sponsor/pledge/new`) | ✅ | 72-Zeilen-Page, Wizard im Component |
| 3.3.3 | Schritt 1: Trigger-Multi-Select aus Katalog | ✅ |  |
| 3.3.4 | Schritt 2: Pro Trigger Betrag + Per-Match-Cap | ✅ |  |
| 3.3.5 | Schritt 3: Monats-Cap (optional) | ✅ |  |
| 3.3.6 | Schritt 4: Laufzeit (default = Saisonende) | ✅ |  |
| 3.3.7 | „Worst-Case-Berechnung" auf Review-Schritt | ✅ |  |
| 3.3.8 | Spieler-Auswahl für `goal_by_player`-Trigger | ✅ | `/api/squad`-Route |
| 3.3.9 | Custom-Trigger frei benennen | 🔍 |  |
| 3.3.10 | Saison-Wetten-Trigger (Aufstieg, Tabellenplatz, Pokal) | ✅ | Trigger-Enum vorhanden |
| 3.3.11 | Pledge-Detail-Seite (`/sponsor/pledge/[id]`) | ✅ |  |
| 3.3.12 | Pledge pausieren / fortsetzen | ✅ | `setPledgeStatus` |
| 3.3.13 | **Pledge bearbeiten** (Beträge, Caps, Trigger anpassen) | ❌ | **P1** — Spec sagt "edit rules", kein UI |
| 3.3.14 | **Pledge vorzeitig beenden** | ❌ | **P1** — kein Button |
| 3.3.15 | **Pledge duplizieren / als Vorlage für nächste Saison** | ❌ | **P2** |
| 3.3.16 | Charges-History pro Pledge (letzte 10) | ✅ |  |
| 3.3.17 | **Vollständige Charge-History pro Pledge mit Filter** (nach Match, Trigger-Typ) | ❌ | **P1** |
| 3.3.18 | **Pledge-Statistiken pro Trigger** ("ich habe 47€ wegen Toren bezahlt") | ❌ | **P1** |
| 3.3.19 | Pledge in „Saison-Pause"-Status sehen | 🟡 | `paused`-Status existiert, **PausedUntil-UI** nur auf Verein-Seite |
| 3.3.20 | **„Pledge teilen" / Referral-Link** | ❌ | **L2** |
| 3.3.21 | **Conditional / Eskalierende Pledges** ("ab 3. Tor: 10€ statt 5€") | ❌ | **L2** |
| 3.3.22 | **Sponsoren-Challenges** ("wenn Verein X auch sponsort, matche ich") | ❌ | **L2** |

### 3.4 Event-Approvals-Inbox

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.4.1 | Inbox `/sponsor/inbox` mit pending Approvals | ✅ |  |
| 3.4.2 | Approval bestätigen (1-Klick) | ✅ | `confirmApproval` |
| 3.4.3 | Approval bestreiten mit optionaler Begründung | ✅ | `disputeApproval` |
| 3.4.4 | Verfallsdatum sichtbar (7 Tage) | 🔍 |  |
| 3.4.5 | Erinnerungs-Counter sichtbar | 🔍 |  |
| 3.4.6 | **Filter** (pending / disputed / confirmed history) | ❌ | **P1** — User möchte „Übersichten angucken, filtern" |
| 3.4.7 | **Bulk-Confirm** mehrerer Approvals auf einmal | ❌ | **P2** |
| 3.4.8 | Detail-View pro Event (Match, Spielzug, Minute, Spieler) | 🔍 |  |
| 3.4.9 | **„Anzeigen, woher das Tor kommt"** Link → Match-Detail | 🔍 |  |
| 3.4.10 | **Verein direkt anfragen** falls etwas merkwürdig wirkt | ❌ | **P2** |

### 3.5 Discovery & Anfrage

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.5.1 | Liste discoverable Teams (`/sponsor/discover`) | ✅ |  |
| 3.5.2 | Suche nach Vereins-/Mannschaftsname | ✅ | via GET `?q=` |
| 3.5.3 | **Filter nach Ort / Liga / Saison** | ❌ | **P1** |
| 3.5.4 | **Sortieren** (alphabetisch, Anzahl Sponsoren, etc.) | ❌ | **P2** |
| 3.5.5 | Team-Card mit Tagline | ✅ | `publicTagline` |
| 3.5.6 | Anfrage an Verein senden (`createSponsorInquiry`) | ✅ |  |
| 3.5.7 | Eigene Anfragen-Liste mit Status (pending/accepted/rejected) | ✅ | `listInquiriesForSponsor` |
| 3.5.8 | Anfrage zurückziehen | ❌ | **P2** |
| 3.5.9 | **Public Mannschafts-Profil** mit Saison-Stats vor dem Anfragen | 🟡 | nur Tagline, mehr Detail wäre engagierender — **P1** |
| 3.5.10 | **Pledge-Vorschau auf Verein-X-Liste** ("wenn ich hier pledgen würde, würde Trigger Y so aussehen") | ❌ | **L2** |

### 3.6 Rechnungen

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.6.1 | Liste eigener Rechnungen (`/sponsor/rechnungen`) | ✅ |  |
| 3.6.2 | PDF-Download | ✅ | `invoiceDownloadUrl` |
| 3.6.3 | Status: draft / sent / paid / withheld | ✅ |  |
| 3.6.4 | Periode + Verein + Total sichtbar | ✅ |  |
| 3.6.5 | **Filter nach Verein / Status / Jahr** | ❌ | **P1** |
| 3.6.6 | **Jahres-Summary** (z.B. für Steuer) | ❌ | **P1** — explizit gewünschter Use-Case (Sponsor will Jahres-Total wissen) |
| 3.6.7 | **CSV/Excel-Export** der Rechnungen | ❌ | **P1** für Business-Sponsoren |
| 3.6.8 | **Spendenquittung** falls Verein gemeinnützig | ❌ | **L2** |
| 3.6.9 | **„Als bezahlt markiert"-Bestätigung sichtbar** | 🔍 |  |
| 3.6.10 | **Rechnung bestreiten / Reklamation** | ❌ | **P1** |
| 3.6.11 | E-Mail-Wiederversand-Knopf | ❌ | **P2** |

### 3.7 Sponsor-Profil

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.7.1 | Profil-Seite (`/sponsor/profil`) | ✅ |  |
| 3.7.2 | Display-Name ändern | ✅ |  |
| 3.7.3 | Typ wechseln Familie ↔ Business | 🔍 | UI-Affordance prüfen |
| 3.7.4 | Business-Felder bearbeiten | ✅ |  |
| 3.7.5 | Pledge-Proxies hinzufügen/bearbeiten | 🔍 | Form-Element vorhanden? |
| 3.7.6 | **„Wie erscheint mein Name auf der Rechnung"-Vorschau** | ❌ | **P2** |
| 3.7.7 | **Multiple Adressen** (Wohn + Rechnung) | ❌ | **P2** |
| 3.7.8 | **Standard-Trigger-Vorlagen** für künftige Pledges | ❌ | **L2** |

### 3.8 Übersichten, Filter, Reports (Cross-Cutting für Sponsor)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 3.8.1 | **Globale Charge-History über alle Pledges** mit Filter | ❌ | **P0** — User möchte „die letzten Ereignisse sehen" |
| 3.8.2 | **Monats-/Jahres-Bilanz im Dashboard** | ❌ | **P0** |
| 3.8.3 | **Drill-Down KPI → Detail** | 🟡 | Dashboard-Tiles sind statische Zahlen, klick → ? |
| 3.8.4 | **Saison-Recap am Ende** ("So lief Saison 2025/26") | ❌ | **P2** |
| 3.8.5 | **Kalender / Game-Day-Vorschau** ("morgen spielt Verein X, du wirst voraussichtlich Y€ sponsoren") | ❌ | **L2** |

---

## 4. Verein-Admin

### 4.1 Verein-Onboarding (Step 1–5)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.1.1 | Step 1: Rollen-Auswahl | ✅ |  |
| 4.1.2 | Step 2: Fußball.de-Suche + Team-Auswahl | ✅ | `_actions/search.ts` |
| 4.1.3 | `isAlreadyClaimed`-Lockout | 🔍 | Trust-Spec-konform — Code-Pfad prüfen |
| 4.1.4 | Step 3: Stammdaten (Adresse, Logo, IBAN, USt-ID, §19 UStG) | ✅ |  |
| 4.1.5 | Step 4: Verifikations-Doc-Upload | ✅ | `_actions/submit-verification.ts` |
| 4.1.6 | Step 5: Plan-Auswahl + Trial-Start | ✅ |  |
| 4.1.7 | Sponsor-Einladungs-Link am Ende | 🔍 | im Step 5? |
| 4.1.8 | **Wizard-Resume** (Browser geschlossen → kann wiederkommen) | 🔍 | **P1** falls fehlt |
| 4.1.9 | **Logo-Upload** (statt URL) | 🔍 | Spec sagt `logoUrl`, UI für Upload? — **P1** |
| 4.1.10 | Zugriffs-Anfrage statt Onboarding (`/onboarding/zugriff-anfragen`) | ✅ |  |
| 4.1.11 | Konflikt-Doc-Upload bei Anspruch | 🔍 | `isConflictClaim`-Spalte da |

### 4.2 Verein-Dashboard (`/verein/[slug]`)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.2.1 | KPI: Charges diese Woche | ✅ |  |
| 4.2.2 | KPI: Charges aktueller Monat | ✅ |  |
| 4.2.3 | KPI: Anzahl aktive Teams | ✅ |  |
| 4.2.4 | KPI: Anzahl aktive Sponsoren | ✅ |  |
| 4.2.5 | Team-Liste (erste 3) | ✅ |  |
| 4.2.6 | Quick-Links zu Sponsoren / Abrechnungen / Mannschaften | ✅ |  |
| 4.2.7 | **„Anstehende Aufgaben"-Block** (Anfragen, Approvals, fehlende IBAN, Verifikation pending) | 🟡 | Verification-Banner gibt es, aber kein konsolidierter „To-Do"-Block — **P1** |
| 4.2.8 | **Aktivitäts-Feed** ("Verein vor 2h: Sponsor X hat Pledge angelegt") | 🔍 | `ereignisse` ist eigene Seite; auf Dashboard? — **P1** |
| 4.2.9 | **Saisonal-Chart** (Charges-Verlauf) | ❌ | nur auf Team-Detail vorhanden — **P1** auf Verein-Ebene |
| 4.2.10 | **Verifikations-Status-Banner** ("ausstehend") | ✅ | `verification-banner.tsx` |
| 4.2.11 | **Trial-Countdown** ("noch 12 Tage Trial") | 🔍 | **P0** falls fehlt |
| 4.2.12 | **Read-Only-Banner** bei pausierter Subscription | 🔍 |  |

### 4.3 Mannschaften (Teams)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.3.1 | Liste aller Teams (`/verein/[slug]/mannschaften`) | ✅ |  |
| 4.3.2 | Team-Detail (`/verein/[slug]/mannschaft/[teamId]`) | ✅ |  |
| 4.3.3 | Team-Stats (Spiele, S/U/N, Tore, Sponsor-€) | ✅ |  |
| 4.3.4 | Team-Spiele-Liste mit Charges-Color-Coding | ✅ |  |
| 4.3.5 | Team-Finanzen mit Chart + Top-Sponsoren (`/finanzen`) | ✅ |  |
| 4.3.6 | Team-Pacts/Pledges Liste (`/pacts`) | 🔍 | Existiert als Route — Tiefe prüfen |
| 4.3.7 | **Neues Team später hinzufügen** (nach Onboarding) | 🟡 | Schema unterstützt, **kein UI gefunden** — **P0** |
| 4.3.8 | **Team deaktivieren** (Saison vorbei, im Sommer nicht crawlen) | 🟡 | `isActive`-Spalte da, kein UI — **P1** |
| 4.3.9 | **Team umbenennen / Saison-Wechsel** | ❌ | **P1** für Saison-Übergang |
| 4.3.10 | **Team aus Fußball.de neu syncen** (manueller Crawler-Trigger) | ✅ | Auf Team-Detail wenn keine Spiele |
| 4.3.11 | **Team-Discoverable + Tagline editieren** | ✅ | `/sponsoren`-Seite |
| 4.3.12 | **Spieler-Roster anzeigen** | 🟡 | `players`-Tabelle da, **kein eigenes UI** — **P1** |
| 4.3.13 | **Spieler hinzufügen / bearbeiten** (manuell, wenn Fußball.de fehlt) | ❌ | **P1** |
| 4.3.14 | **Spieler blockieren** (DSGVO-Opt-out) | 🟡 | `blocked`-Spalte da, kein UI — **P0** (rechtlich) |
| 4.3.15 | **Spieler-Statistiken** (Tore, Vorlagen, Karten) | ❌ | **P2** |
| 4.3.16 | **Mannschafts-Bild / Logo pro Team** | ❌ | **P2** |
| 4.3.17 | **Kalender-Export als .ics** | ❌ | **L2** |

### 4.4 Spiele & Match-Events

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.4.1 | Spiele-Liste pro Team (`/mannschaft/[id]/spiele`) | ✅ |  |
| 4.4.2 | Match-Detail mit Score & HZ (`/spiel/[matchId]`) | ✅ |  |
| 4.4.3 | Match-Events Liste (gescrapt) | ✅ |  |
| 4.4.4 | Sponsor-Charges-Übersicht pro Match | ✅ |  |
| 4.4.5 | **Manuelles Event hinzufügen** (Tor/Karte/Spezial) | ✅ | `addManualEvent` |
| 4.4.6 | Subtype-Auswahl (Kopfball, Hackentor, Elfmeter, etc.) | ✅ |  |
| 4.4.7 | Side (heim/gast) + optionaler Spielername | ✅ |  |
| 4.4.8 | **Event bearbeiten / löschen** (falls Fehler) | ❌ | **P1** — Trainer macht garantiert Tippfehler |
| 4.4.9 | **Event mit Foto/Video belegen** | 🤔 | Spec: v2 |
| 4.4.10 | **Spieler-Auswahl aus Roster (statt Freitext)** | 🟡 | `players` existiert, in Manual-Event-Form? — **P1** |
| 4.4.11 | **Match-Ergebnis manuell überschreiben** (wenn Fußball.de falsch) | ❌ | **P1** |
| 4.4.12 | **Spiel-Notizen / Kommentar** für Sponsor | ❌ | **P2** |
| 4.4.13 | Match-Calendar-View über alle Teams | ❌ | **P2** |
| 4.4.14 | **„Heute spielt..."-Übersicht im Verein-Dashboard** | ❌ | **P2** |
| 4.4.15 | Live-Match-Indicator | 🤔 | v2 |
| 4.4.16 | Push beim Tor | 🤔 | v2 |

### 4.5 Sponsoren-Verwaltung

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.5.1 | Sponsoren-Übersicht (`/verein/[slug]/sponsoren`) | ✅ |  |
| 4.5.2 | Liste aktiver Sponsoren (Team-übergreifend) | ✅ |  |
| 4.5.3 | Sponsor-Einladungs-Link generieren | ✅ | `_actions/invitations.ts` |
| 4.5.4 | Liste pending Einladungen mit Token-Status | ✅ |  |
| 4.5.5 | **Einladung widerrufen** | 🔍 | Action existiert, UI-Button? |
| 4.5.6 | **Einladung erneut versenden** | ❌ | **P1** |
| 4.5.7 | Sponsor-Inquiry-Inbox (Discovery-Anfragen) | ✅ |  |
| 4.5.8 | Inquiry annehmen / ablehnen | ✅ | `respondToInquiry` |
| 4.5.9 | Discoverable-Toggle pro Team + Tagline | ✅ |  |
| 4.5.10 | **Sponsor-Detail-Seite** (welcher Sponsor pledgt was, wie viel, seit wann) | ❌ | **P1** — explizit gewünscht: „welche haben was gesetzt" |
| 4.5.11 | **Sponsor entfernen / pausieren** (durch Verein) | ❌ | **P2** |
| 4.5.12 | **Pledge-Übersicht filterbar** (nach Team, Sponsor, Trigger-Typ, Betrag) | ❌ | **P0** — explizit gewünscht („Übersichten angucken, filtern") |
| 4.5.13 | **Top-Sponsoren-Leaderboard** (Verein-intern) | 🟡 | gibt es als Block in `/finanzen` — als eigene Seite? — **P2** |
| 4.5.14 | **Sponsor-Onboarding-Status** (eingeladen / angenommen / Pledge angelegt) | ❌ | **P1** |
| 4.5.15 | **Direkt an Sponsor mailen** aus dem UI | ❌ | **P2** |

### 4.6 Abrechnungen

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.6.1 | Liste Rechnungen pro Verein | ✅ |  |
| 4.6.2 | Total / Open-Balance Anzeige | ✅ |  |
| 4.6.3 | **„Als bezahlt markieren"** (Admin-only) | ✅ | `markInvoicePaid` |
| 4.6.4 | PDF-Download | ✅ |  |
| 4.6.5 | **Filter nach Status / Sponsor / Periode** | ❌ | **P1** |
| 4.6.6 | **Bulk-Aktion** „mehrere als bezahlt markieren" | ❌ | **P2** |
| 4.6.7 | **CSV-Export** der Rechnungen | ❌ | **P1** für Steuerberater |
| 4.6.8 | **Mahnung manuell auslösen** | ❌ | **P1** |
| 4.6.9 | **Automatische Erinnerung an Sponsor** (z.B. nach 14 Tagen) | ❌ | **P1** |
| 4.6.10 | **Banking-Match-Helfer** (CSV-Import vom Konto, Auto-Matching) | 🤔 | Spec-Phase E2 |
| 4.6.11 | Girocode-QR auf PDF | ✅ | Trust-Spec |
| 4.6.12 | Rechnungs-Nummern-Counter (race-safe) | ✅ | `invoiceCounters` |
| 4.6.13 | **Withheld-Rechnungen sichtbar machen** ("warten auf Verifizierung") | 🔍 | Status existiert; UI prüfen |
| 4.6.14 | **Rechnungs-Detail mit Line-Items** | 🔍 | InvoiceItems existieren |
| 4.6.15 | **Rechnung erneut senden** (Resend-Button) | ❌ | **P1** |
| 4.6.16 | **Rechnung stornieren / Storno-Rechnung** | ❌ | **P1** — rechtlich relevant |

### 4.7 Subscription / Abo

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.7.1 | Abo-Status sehen (`/verein/[slug]/abo`) | ✅ |  |
| 4.7.2 | Trial-Tage anzeigen | ✅ |  |
| 4.7.3 | Plan-Auswahl Grid (Basic / Pro / Vereinslizenz) | ✅ |  |
| 4.7.4 | Stripe-Checkout starten | ✅ | `createCheckoutSession` |
| 4.7.5 | **Stripe-Customer-Portal** öffnen (Zahlungsmethode ändern, Rechnungen sehen) | 🟡 | Action `createCustomerPortalSession` existiert, **UI-Button vorhanden?** — **P0** prüfen |
| 4.7.6 | Plan upgraden / downgraden | 🔍 | im Customer-Portal? |
| 4.7.7 | **Abo kündigen** | 🔍 | über Customer-Portal — UI-Hinweis nötig |
| 4.7.8 | **Saison-Pass-Sommerpause-Anzeige** | 🟡 | `pausedUntil`-UI prüfen |
| 4.7.9 | **Billing-Cycle umstellen** (monthly ↔ saison ↔ annual) | 🔍 | über Stripe? |
| 4.7.10 | Read-Only-Status-Banner bei `past_due` | 🔍 | `getSubscriptionGate` |
| 4.7.11 | **Rechnungs-Historie für KickPact-Abo** (separate von Sponsor-Rechnungen!) | ❌ | **P1** — heute leicht zu verwechseln |
| 4.7.12 | **Plan-Vergleichs-Tabelle** | ✅ | wahrscheinlich im Grid |
| 4.7.13 | Stripe-Webhook-Dedupe | ✅ | `processedStripeEvents` |

### 4.8 Mitglieder-Verwaltung

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.8.1 | Mitglieder-Seite (`/einstellungen/mitglieder`) | ✅ |  |
| 4.8.2 | Liste aller Club-Mitglieder mit Rollen | ✅ |  |
| 4.8.3 | Liste aller Team-Mitglieder | ✅ |  |
| 4.8.4 | Einladung an neue Mitglieder (admin/trainer/viewer) | ✅ |  |
| 4.8.5 | Team-spezifische Einladungen (nur 1 Team) | ✅ |  |
| 4.8.6 | Zugriffs-Anfragen-Inbox (pending requests) | ✅ |  |
| 4.8.7 | Request annehmen / ablehnen mit Begründung | ✅ |  |
| 4.8.8 | Last-Admin-Schutz (kann sich nicht selbst entfernen) | ✅ |  |
| 4.8.9 | Mitglied entfernen | 🔍 | `manage.ts` Action — UI-Tiefe prüfen |
| 4.8.10 | **Rolle eines Mitglieds ändern** (Trainer → Admin etc.) | ❌ | **P1** |
| 4.8.11 | Konflikt-Claims (Doppel-Anspruch auf Verein) → Plattform-Admin | ✅ | `isConflictClaim`-Flag |
| 4.8.12 | **Einladungs-Link erneut versenden** | ❌ | **P1** |
| 4.8.13 | **Member-Audit-Log** ("wer hat wen wann eingeladen") | 🔍 | im Ereignisse-Log? |

### 4.9 Vereins-Einstellungen / Stammdaten

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.9.1 | Stammdaten-Formular | ✅ | Name, Ort, Adresse |
| 4.9.2 | IBAN | ✅ |  |
| 4.9.3 | USt-ID + §19-Kleinunternehmer-Flag | ✅ |  |
| 4.9.4 | **Logo-Upload-UI** | 🟡 | `logoUrl`-Spalte da, UI für Upload prüfen — **P1** |
| 4.9.5 | **Ort/Slug ändern** | 🔍 | Slug-Unique — Migration / Confirm? |
| 4.9.6 | **Verein löschen** | ❌ | **P1** (DSGVO-relevant) |
| 4.9.7 | **Branding-Farbe** für PDF | ❌ | **L2** |
| 4.9.8 | **E-Mail-Footer-Text** anpassen | ❌ | **L2** |
| 4.9.9 | **Custom-Domain** | 🤔 | L3 |
| 4.9.10 | **API-Zugang / Webhooks** für externes Reporting | ❌ | **L2** |

### 4.10 Saison-End-Verwaltung

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.10.1 | Saison-Ergebnis pro Team eintragen (Position, Aufstieg, Pokal) | ✅ | `setSeasonResult` auf Team-Detail |
| 4.10.2 | Saison-Wetten-Charges werden automatisch erzeugt | ✅ | `evaluate-season` Job |
| 4.10.3 | Custom-Saisonziel reporten | ✅ |  |
| 4.10.4 | **Saison-Recap** für Sponsoren (E-Mail oder PDF) | ❌ | **P2** |
| 4.10.5 | **„Nächste Saison"-Pledge-Renewal-Flow** | ❌ | **P1** — sehr wichtig für Retention |
| 4.10.6 | Saisonende-Erinnerung an Sponsoren | ✅ | `season-end-reminders` Job |

### 4.11 Audit-Log / Ereignisse

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.11.1 | Ereignisse-Seite (`/ereignisse`) | ✅ | 30-Zeilen-Page, View-Component |
| 4.11.2 | **Filter** (Typ, User, Datum) | ❌ | **P1** |
| 4.11.3 | **Suche** | ❌ | **P2** |
| 4.11.4 | **Export** als CSV | ❌ | **P2** |
| 4.11.5 | Pagination | 🔍 |  |

### 4.12 Verein-Übersichten & Filter (Cross-Cutting)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 4.12.1 | **Charges-Tabelle Verein-weit, filterbar** (Sponsor, Team, Trigger, Periode) | ❌ | **P0** — Kern-Use-Case („welche Sponsoren es davon gibt, welche haben was gesetzt") |
| 4.12.2 | **Pledges-Tabelle Verein-weit, filterbar** (Status, Sponsor-Typ, Team, Betrag) | ❌ | **P0** |
| 4.12.3 | **Sponsor-Profile-Seite pro Sponsor** (Verein-View: "Sponsor X = familie, pledged auf Team A&B, monatlich Ø Y€") | ❌ | **P1** |
| 4.12.4 | **Monatliche Aufstellung "wer schuldet wieviel"** | 🟡 | über Rechnungen ableitbar — **P1** als konsolidiertes Reporting |
| 4.12.5 | **Saison-Bilanz** ("So lief Saison 2025/26") | ❌ | **P1** |
| 4.12.6 | **Year-over-Year-Vergleich** | ❌ | **P2** |
| 4.12.7 | **Forecast** ("auf Basis der ersten 5 Spiele wirst du dieses Jahr X einnehmen") | ❌ | **L2** |

---

## 5. Verein-Trainer (Club-weit)

Identisch zu Admin, **aber:**

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 5.1 | Kein Zugriff auf Einstellungen / Mitglieder / Abo | ✅ | role-check in Actions / Pages |
| 5.2 | Kein „Als bezahlt markieren"-Button | ✅ | `canMarkPaid` |
| 5.3 | Manual-Events anlegen | ✅ |  |
| 5.4 | **Sichtbarkeit für Trainer**: was sieht Trainer beim Sponsoren-Bereich? | 🔍 | Spec: read-only — UI-Maskierung prüfen |
| 5.5 | **Trainer-Onboarding-Tipps** (anders als Admin-Onboarding) | ❌ | **P2** |

---

## 6. Team-Trainer (1 Team Scope)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 6.1 | Sieht nur eine Mannschaft (kein Verein-Dashboard) | 🔍 | Identity-Spec definiert — **P0 verifizieren** |
| 6.2 | Manual-Events nur für sein Team | 🔍 | `assertTeamAccess`-Helper laut Spec |
| 6.3 | Sponsoren seines Teams | 🔍 |  |
| 6.4 | Saison-Ergebnis seines Teams eintragen | 🔍 |  |
| 6.5 | **Eigene Home-Seite (kein Verein-Layout)** | ❌ | **P0** — Identity-Spec sagt eigene IA |
| 6.6 | **Burger-Menu mit reduzierten Nav-Items** | 🔍 |  |

---

## 7. Viewer (Club & Team)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 7.1 | Read-only Dashboard | 🔍 | role-check `viewer` — UI-Tiefe prüfen |
| 7.2 | Keine Buttons zum Erstellen sichtbar | 🔍 | **P0 verifizieren** dass keine Actions durchgehen |
| 7.3 | Kann PDFs anzeigen aber nicht „als bezahlt markieren" | 🔍 |  |
| 7.4 | **Eigener „Viewer-Mode"-Banner** | ❌ | **P2** |

---

## 8. Plattform-Admin / Operator

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| **Verifications** ||||
| 8.1 | Pending-Verifications-Queue (`/admin/verifications`) | ✅ |  |
| 8.2 | Dokument-Download (signed URL) | ✅ |  |
| 8.3 | Approve / Reject mit Begründung | ✅ |  |
| 8.4 | **Re-Upload-Aufforderung an Submitter** | 🔍 |  |
| 8.5 | **Verifications-Historie** (alte, archivierte) | 🔍 |  |
| 8.6 | **Filter** (Doc-Typ, Region, Alter) | ❌ | **P1** |
| **Konflikte** ||||
| 8.7 | Konflikt-Queue (`/admin/conflicts`) | ✅ |  |
| 8.8 | Dokument-Vergleich (existing-doc neben new-doc) | ✅ |  |
| 8.9 | Entscheidung treffen (einen annehmen, anderen ablehnen) | ✅ |  |
| 8.10 | **Account des "Verlierers" sperren** | 🔍 | Spec sagt locken — Code-Pfad prüfen |
| 8.11 | **Vorgang dokumentieren** | 🔍 |  |
| **User-Management** ||||
| 8.12 | **User-Liste** (alle User der Plattform) | ❌ | **P1** für Support |
| 8.13 | **User-Detail** (Rollen, Pledges, Subscriptions) | ❌ | **P1** |
| 8.14 | **Als User einloggen** (Impersonate für Support) | ❌ | **P2** |
| 8.15 | **User sperren / entsperren** | ❌ | **P1** |
| 8.16 | **Manuelles Account-Merge** | 🤔 | Spec: out-of-scope |
| **Verein-Verwaltung** ||||
| 8.17 | **Vereine-Liste** | ❌ | **P1** |
| 8.18 | **Verein-Detail mit allen Teams, Subscriptions, Verifikationen** | ❌ | **P1** |
| 8.19 | **Verein deaktivieren / sperren** | ❌ | **P1** |
| 8.20 | **Verifikation widerrufen** (Status `revoked`) | 🟡 | Status existiert, kein UI — **P1** |
| **Plattform-Stats** ||||
| 8.21 | **KPI-Dashboard** (Vereine total, MRR, Trial→Paid Conversion, Churn) | ❌ | **P0** für Geschäftsführung |
| 8.22 | **Crawler-Health** (Erfolgsrate, Drift-Detektion, letzte Crawls) | ❌ | **P1** |
| 8.23 | **Inngest-Job-Übersicht** | 🤔 | hat eigene Inngest-Dev-UI, aber Production-Insight? |
| 8.24 | **Stripe-Status** (failed payments etc.) | ❌ | **P1** |
| 8.25 | **Mail-Bounces** | ❌ | **P1** |
| **Operativ** ||||
| 8.26 | **Crawler manuell triggern** für einen Verein | 🔍 | Inngest-Events vorhanden — UI? |
| 8.27 | **Rechnung manuell neu erzeugen** | ❌ | **P1** |
| 8.28 | **System-Banner einblenden** ("Wartung 22 Uhr") | ❌ | **P2** |
| 8.29 | **Feature-Flags toggeln** | ❌ | **P2** |
| 8.30 | **Help-Center-Artikel im Admin verfassen** | ❌ | aktuell git-basiert — **L2** |

---

## 9. Cross-Cutting Themen

### 9.1 Listen-UX (durchgängig)

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.1.1 | **Pagination** auf großen Listen (Charges, Matches, Rechnungen, Audit) | ❌ überall | **P0** |
| 9.1.2 | **Sortierung** (klickbare Spalten-Header) | ❌ überall | **P1** |
| 9.1.3 | **Such-Felder** auf Listen | ❌ überall | **P1** |
| 9.1.4 | **Filter-Sidebar** oder Filter-Bar | ❌ überall | **P0** — explizit gewünscht |
| 9.1.5 | **URL-State** für Filter (sharebare Links) | ❌ überall | **P2** |
| 9.1.6 | **Saved Views** | ❌ | **L2** |
| 9.1.7 | **Bulk-Actions** | ❌ | **P2** |

### 9.2 Exporte

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.2.1 | **CSV-Export Rechnungen** | ❌ | **P1** |
| 9.2.2 | **CSV-Export Charges** | ❌ | **P1** |
| 9.2.3 | **Excel-Export** | ❌ | **P2** |
| 9.2.4 | **DATEV-Export** für Steuerberater | ❌ | **L2** |
| 9.2.5 | **DSGVO-Datenexport** (JSON) | 🟡 | Action da, kein UI — **P1** |

### 9.3 Notifications

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.3.1 | E-Mail-Templates (Magic-Link, Einladung, Approval, Rechnung, Mahnung) | ✅ |  |
| 9.3.2 | **Notification-Center in der App** (Glocke) | ❌ | **P1** |
| 9.3.3 | **Pro-Channel-Preferences** | ❌ | **P1** |
| 9.3.4 | **Push** | 🤔 | v2 |
| 9.3.5 | **Slack/Discord-Integration** | ❌ | **L2** |

### 9.4 Mobile

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.4.1 | Responsive Layout | 🔍 | UI-Komponenten Tailwind-basiert; Praxis-Verifikation nötig |
| 9.4.2 | **Mobile Burger-Nav** | 🔍 | `mobile-nav.tsx` existiert |
| 9.4.3 | **Floating Action Button** mit Quick-Actions (Spec §7 Identity) | ❌ | **P1** — explizit spec |
| 9.4.4 | **Sub-Drawer „Rolle wechseln"** | 🔍 |  |
| 9.4.5 | **PWA-Manifest + Installable** | 🔍 | prüfen |
| 9.4.6 | **Native App (Expo)** | 🤔 | v2 |

### 9.5 Empty States / Onboarding

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.5.1 | Empty States in Listen (mit CTA) | 🔍 | teilweise vorhanden |
| 9.5.2 | **First-Time-Tour** | ❌ | **P2** |
| 9.5.3 | **„Du bist fast fertig"-Checklist** (Onboarding-Completion) | ❌ | **P1** — "fehlt noch IBAN, Verifikation, erster Sponsor" |
| 9.5.4 | **Hilfe-Artikel-Verweise inline** ("?-Icon → springt zu Hilfe") | ❌ | **P1** |

### 9.6 Public-Facing Inhalte

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.6.1 | Public Vereins-Profil | ❌ | **P2** |
| 9.6.2 | Public Mannschafts-Profil | ❌ | **P2** |
| 9.6.3 | „Top-Vereine"-Schaufenster auf Landing | ❌ | **P2** |
| 9.6.4 | Sponsor-Wall / Recognition | ❌ | **P2** |

### 9.7 Accessibility

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.7.1 | Radix-Primitives = a11y-grundsolide | ✅ |  |
| 9.7.2 | **Skip-Links / Landmarks geprüft** | 🔍 |  |
| 9.7.3 | **Kontrast (WCAG AA)** verifiziert | 🔍 |  |
| 9.7.4 | **Screenreader-Test** | 🔍 |  |
| 9.7.5 | **Tastatur-Navigation** über kritische Flows | 🔍 |  |

### 9.8 Operative Robustheit

| # | Feature | Status | Lücke / Notiz |
|---|---|---|---|
| 9.8.1 | Inngest-Crons für alle wiederkehrenden Jobs | ✅ | 15 Functions |
| 9.8.2 | DSGVO-Anonymisierung | ✅ |  |
| 9.8.3 | Stripe-Webhook-Dedupe | ✅ |  |
| 9.8.4 | Mail-Dedupe (`sentNotifications`) | ✅ |  |
| 9.8.5 | Drift-Detection auf Fußball.de | ✅ | GitHub Action |
| 9.8.6 | **Sentry / Error-Tracking** | 🔍 | prüfen |
| 9.8.7 | **Application-Logs strukturiert** | 🔍 |  |
| 9.8.8 | **Backups (DB)** | 🔍 | Coolify/Hetzner |
| 9.8.9 | **Disaster-Recovery-Doc** | 🔍 | `docs/operations/` ansehen |

---

## 10. Top-Lücken in Severity-Reihenfolge

Konsolidiert aus den Tabellen oben, sortiert nach **Impact × Häufigkeit der User-Erwartung**.

### P0 — Blocker für vollständiges v1

1. **Konto-Seite / Account-Settings** (Sektion 2.17–2.24): Es gibt Server-Actions für Profil, DSGVO-Export, Account-Löschung, aber **keine** sichtbare User-facing Seite, die das anbindet. Rechtlich (DSGVO) und Vertrauens-mäßig zwingend.
2. **Filterbare Charges-/Pledges-Tabelle pro Verein** (4.12.1, 4.12.2): Genau der Use-Case, den du im Prompt beschrieben hast — „welche Sponsoren es davon gibt, welche haben was gesetzt, Übersichten angucken, filtern". Aktuell gibt es nur Block-Listen auf Team-Detail, kein zentrales filterbares Reporting.
3. **Filterbare Globale Charge-History für Sponsor** (3.8.1): Sponsor sieht aktuell nur pro Pledge die letzten 10 Charges — keine Gesamtübersicht über alle Vereine/Teams/Trigger.
4. **„Gesamtbilanz" für Sponsor** (3.2.7 + 3.8.2): explizit gefragt, nirgends da.
5. **Neues Team später hinzufügen** (4.3.7): Verein kann beim Onboarding Teams wählen, danach **kein UI** für Saison-Wechsel oder neue Mannschaft.
6. **Pagination** (9.1.1): aktuell laden Listen wahrscheinlich alles. Skaliert nicht über 1–2 Saisons.
7. **Spieler-Block (DSGVO-Opt-out)** (4.3.14): Spalte `players.blocked` existiert, aber **kein Flow** für Spieler-Opt-out. Rechtsrelevant.
8. **Stripe-Customer-Portal-Anbindung** (4.7.5): Action existiert, Button-Anbindung verifizieren.
9. **Plattform-KPI-Dashboard** (8.21): du wirst es brauchen — sonst keine Geschäftssicht.
10. **Cookie-Banner / Consent** (1.23): falls fehlt, sofort.

### P1 — wichtig, aber Launch-fähig ohne

11. Pledge bearbeiten + Pledge beenden (3.3.13, 3.3.14)
12. Sponsor-Detail-Seite im Verein (4.5.10) + Onboarding-Status pro Sponsor (4.5.14)
13. Filter überall (Approvals, Rechnungen, Audit-Log, Discovery)
14. CSV-Exporte (9.2.x)
15. Notification-Preferences (9.3.3) + In-App-Center (9.3.2)
16. „Anstehende Aufgaben"-Block + Trial-Countdown im Dashboard (4.2.7, 4.2.11)
17. Saison-Renewal-Flow für Sponsoren (4.10.5)
18. Match-Event editieren/löschen (4.4.8) + Manuelles Match-Ergebnis (4.4.11)
19. Logo-Upload-UI (4.9.4) + Verein-Löschung (4.9.6)
20. Plattform-Admin-Tiefe (User-Liste, Verein-Liste, Crawler-Health, Stripe-Status)
21. Onboarding-Completion-Checklist (9.5.3) + kontextuelle Hilfe (2.32, 9.5.4)
22. Storno / Rechnungs-Reklamation (4.6.16, 3.6.10)
23. Einladung erneut senden (4.8.12, 4.5.6) + Mitglieder-Rolle ändern (4.8.10)
24. Mobile FAB (9.4.3) + responsive Audit (9.4.1)
25. SEO-Sitemap / OG-Bilder (1.20, 1.22)

### P2 — nice-to-have / wertvoll für Engagement

26. Game-Day-Vorschau, Cap-Warnungen, Saison-Recap, Sponsor-Leaderboards, Spieler-Stats, Year-over-Year, etc.

### L2/L3 — bewusst v2+ laut Spec

27. Mobile-Native, Stripe-Connect, Live-Push, Foto/Video-Beweise, Sponsor-Challenges, API/Webhooks, DATEV-Export, etc.

---

## 11. Methodik-Hinweise / Verifications-Lücken

Die ✅-Markierungen kommen aus zwei Quellen:

- **Spec-Reads** (vollständig): zuverlässig.
- **Code-Reads via Explore-Agent** (Excerpts): die Existenz von Routen, Schema-Spalten und Server-Actions ist verifiziert; die **UI-Affordances innerhalb der Komponenten** wurden teilweise nur über Component-Namen abgeleitet. Wo das relevant ist, steht 🔍.

Für eine endgültige Audit-Quality-Aussage müssten folgende Komponenten noch in voller Tiefe gelesen werden (Pull-Up-Aufgaben):

- `components/.../PledgeStatusToggle`, `ApprovalRow`, `SponsorsManager`, `InvoicesTable`, `VerificationsTable`, `ConflictsTable`, `EinstellungenForm`, `SponsorProfileForm`, `EreignisseView`, `CheckoutButtons`, `FinanzenTrendChart`
- `app/(verein)/verein/[slug]/mannschaft/[teamId]/pacts/page.tsx` — Name verdächtig, möglicherweise Legacy
- Identity-Routing: Praxistest mit User der 0/1/2/3 Identitäten besitzt
- Mobile: Browser-Verification auf 375×667
- Header-User-Menu: Existenz von „Rolle wechseln"-Switcher
