# KickPact Help-Center — Artikel-Index

**Stand:** 2026-05-24
**Status:** Outline + 3 Beispiel-Artikel
**Ziel:** Self-Service-Onboarding für alle Tarife (auch Vereinslizenz). Help-Center ist Sales-Asset, nicht nur Support.

> **Quellen:** [docs/pricing.md](../pricing.md) (Pricing-Modell, Limits) · [docs/superpowers/specs/2026-05-19-kickpact-v1-design.md](../superpowers/specs/2026-05-19-kickpact-v1-design.md) (Trigger-Katalog §5.3, Flows §6, Auth §7, UI §8)

---

## Stil-Guide (gilt für alle Artikel)

- **Tonalität:** sport-energetisch, knapp, freundlich. Stripe-Docs-Präzision plus Strava-In-App-Klarheit.
- **Sprache:** Deutsch, **Du-Form**. Englische Begriffe nur wenn unvermeidbar (z.B. "Webhook", "Pledge").
- **Länge:** **200–600 Wörter pro Artikel**. Lieber mehr kleine Artikel als wenige große.
- **Verboten:** "Awesome!", "Super!", Emoji-Spam, Marketing-Floskeln, vage Versprechen.
- **Erlaubt:** konkrete Zahlen, echte Beispielnamen (Schmidt, Mehmet, FC Musterstadt), klare Schritt-für-Schritt-Listen, Screenshot-Platzhalter.
- **Beispiel-Kontext:** Amateur-Fußball, 22-Mann-Kader, 6 Sponsoren je Mannschaft, Vater-sponsert-Sohn-und-Patenkind, Onkel-sponsert-zwei-Teams.

---

## Priorisierung

| Prio | Bedeutung |
|---|---|
| **MUSS** | Vor v1-Launch fertig. Ohne diese Artikel kein Self-Service möglich. |
| **SOLL** | Innerhalb 4 Wochen nach Launch. Reduziert Support-Last spürbar. |
| **Later** | Edge-Cases / Premium-Themen. Wenn Zeit, gerne. |

---

## Kategorien & Artikel

### 1. Erste Schritte — Verein (8 Artikel)

- [x] **erste-schritte-verein** — [Prio: MUSS] — Von Magic-Link-Signup bis erster Sponsor-Einladungslink, End-to-End.
- [ ] **fussballde-verknuepfung** — [Prio: MUSS] — Wie der Wizard die Mannschaft findet und was tun, wenn sie nicht auftaucht.
- [ ] **mannschaft-hinzufuegen** — [Prio: MUSS] — Zweite Mannschaft anlegen (Senioren II, A-Jugend, Damen).
- [ ] **vereins-stammdaten-und-logo** — [Prio: MUSS] — Adresse, IBAN, USt-ID, Logo-Upload für PDF-Rechnung.
- [ ] **sponsor-einladungslink-teilen** — [Prio: MUSS] — Link generieren, per WhatsApp/Mail verteilen, Status tracken.
- [ ] **user-rollen-admin-trainer-viewer** — [Prio: SOLL] — Wer darf was, Trainer als zusätzlicher Admin einladen.
- [ ] **vereins-mail-absender-einrichten** — [Prio: SOLL] — Reply-To auf Vereinsadresse umstellen (Pro/Vereinslizenz).
- [ ] **hilfe-mein-verein-existiert-nicht-auf-fussballde** — [Prio: Later] — Manueller Fallback, wenn Fußball.de den Verein nicht kennt.

### 2. Erste Schritte — Sponsor (5 Artikel)

- [ ] **sponsor-einladung-oeffnen** — [Prio: MUSS] — Was passiert nach Klick auf den Einladungslink, Konto-Anlage in unter 2 Minuten.
- [ ] **sponsor-typ-familie-vs-business** — [Prio: MUSS] — Welchen Typ wählen, was passiert mit USt-ID, Rechnungsadresse.
- [ ] **ersten-pledge-anlegen** — [Prio: MUSS] — Trigger auswählen, Beträge setzen, Caps, Worst-Case-Review.
- [ ] **eltern-als-sponsor-manager** — [Prio: SOLL] — Wenn Oma+Opa+Patenonkel über ein Konto laufen (Junioren-Use-Case).
- [ ] **sponsor-dashboard-verstehen** — [Prio: SOLL] — Pledge-Übersicht, Saldo, History.

### 3. Pledges & Trigger (10 Artikel)

- [ ] **was-ist-ein-pledge** — [Prio: MUSS] — Begriffsklärung: Sponsoring-Versprechen mit Regeln + Caps.
- [ ] **auto-trigger-katalog** — [Prio: MUSS] — Alle 10 Auto-Trigger erklärt: Tor, Sieg, Clean Sheet, Comeback, Hattrick, Tordifferenz, Gesamttore, Spieler-Tor, Unentschieden, Niederlage.
- [ ] **manual-trigger-katalog** — [Prio: MUSS] — Spezial-Tor-Subtypes (Kopfball, Hackentor, Volley, Fernschuss, Elfmeter, Freistoß), Karten, Assist, Spieler des Spiels.
- [ ] **caps-und-monats-limits** — [Prio: MUSS] — Per-Match-Cap, Monats-Cap, was tun bei "Ausreißer-Spielen" (7:1-Sieg).
- [ ] **worst-case-berechnung-verstehen** — [Prio: MUSS] — Wie KickPact die Saison-Range schätzt, warum die Spanne breit ist.
- [ ] **saison-wetten-einfuehrung** — [Prio: SOLL] — Aufstieg, Klassenerhalt, Tabellenplatz, Meister, Pokalrunde, Custom-Saison-Ziel (Pro/Vereinslizenz).
- [ ] **custom-trigger-anlegen** — [Prio: SOLL] — "Bizeps-Tor von Schmidt", "Eckball-Tor", "Trainer-Frisur-Lob" (Pro/Vereinslizenz).
- [ ] **pledge-paused-und-beendet** — [Prio: SOLL] — Pledge pausieren, beenden, reaktivieren.
- [ ] **mehrere-pledges-pro-sponsor** — [Prio: SOLL] — Einer für die Mannschaft, einer für den Sohn — wie kombinieren.
- [ ] **pledge-rules-best-practices** — [Prio: Later] — Erfahrungswerte aus Pilot-Vereinen: was funktioniert, was eskaliert.

### 4. Tarife & Pricing (8 Artikel)

- [x] **welcher-tarif-passt** — [Prio: MUSS] — Entscheidungshilfe: wie viele Sponsoren? wie viele Teams? → Tarif-Empfehlung.
- [x] **saison-pass-vs-annual** — [Prio: MUSS] — Wann lohnt was, mit konkreten Zahlen.
- [ ] **5-spieltag-cutoff** — [Prio: MUSS] — Was passiert ab dem 6. Spieltag (Saison-Pass + Saison-Wetten gesperrt bis nächste Saison).
- [ ] **trial-30-tage** — [Prio: MUSS] — Trial-Start, Reminder, was nach Ablauf passiert, Grace-Period.
- [ ] **upgrade-basic-auf-pro** — [Prio: SOLL] — Wann sinnvoll, was passiert mit bestehenden Pledges, Stripe-Pro-Rated.
- [ ] **vereinslizenz-break-even** — [Prio: SOLL] — Ab 3 Mannschaften günstiger als 3× Pro — mit Rechnung.
- [ ] **mid-season-einstieg** — [Prio: SOLL] — Onboarding im Oktober: was wird empfohlen, kein anteiliger Saison-Pass.
- [ ] **kuendigung-und-pause** — [Prio: SOLL] — Wo kündigen, Sommerpause beim Saison-Pass, Daten bleiben.

### 5. Sponsor-Akquise (Pro & Vereinslizenz, 6 Artikel)

- [ ] **sponsoren-finden-pledge-discovery** — [Prio: SOLL] — Mannschaft öffentlich machen, in `/sponsor/discover` erscheinen.
- [ ] **embed-widget-vereinswebsite** — [Prio: SOLL] — Code-Snippet einbauen, "5 € pro Tor — jetzt mitmachen"-Button.
- [ ] **auto-sponsor-newsletter** — [Prio: SOLL] — Monatlicher Recap, was er enthält, wer ihn bekommt.
- [ ] **einladungslinks-tracken** — [Prio: SOLL] — Wer hat geklickt, wer hat abgeschlossen, Reminder verschicken.
- [ ] **sponsor-pitch-vorlage** — [Prio: Later] — Mustertext für WhatsApp/Mail an potenzielle Sponsoren.
- [ ] **local-business-sponsoren-gewinnen** — [Prio: Later] — Bäcker, Autohaus, Friseur — wie ansprechen, was bieten.

### 6. Abrechnung (7 Artikel)

- [ ] **so-funktioniert-die-monatsrechnung** — [Prio: MUSS] — 1. des Monats, PDF, an Sponsor und Verein, Inhalt der Rechnung.
- [ ] **pdf-rechnung-lesen** — [Prio: MUSS] — Aufbau, Trigger-Items, Match-Bezug, Netto/USt oder §19-Hinweis.
- [ ] **als-bezahlt-markieren** — [Prio: MUSS] — Geld kommt off-platform, Verein markiert in KickPact als bezahlt.
- [ ] **ust-und-kleinunternehmer** — [Prio: MUSS] — §19 UStG anhaken oder nicht, was steht dann auf der Rechnung.
- [ ] **reminder-an-sponsor** — [Prio: SOLL] — Automatische Erinnerungen für offene Rechnungen, manuelle Erinnerung.
- [ ] **csv-export-fuer-buchhaltung** — [Prio: SOLL] — Pledges, Charges, Invoices als CSV/Excel (Pro/Vereinslizenz).
- [ ] **vereinslizenz-sammelrechnung** — [Prio: SOLL] — Ein PDF für alle Mannschaften pro Sponsor (nur Vereinslizenz).

### 7. Vereinslizenz-Spezial (5 Artikel)

- [ ] **master-cockpit-uebersicht** — [Prio: MUSS] — `/verein/[slug]/admin` — was steht drin, wie navigieren.
- [ ] **cross-team-sponsor-view** — [Prio: SOLL] — Welcher Sponsor unterstützt welche Teams (Onkel = U13 + Senioren).
- [ ] **10-admin-slots-verteilen** — [Prio: SOLL] — Vorstand + Trainer pro Mannschaft, Rollen einladen.
- [ ] **aggregiertes-saison-recap** — [Prio: Later] — Vereinsweiter Saison-Report für Jahreshauptversammlung.
- [ ] **custom-domain-v2** — [Prio: Later] — `sponsor.fc-musterstadt.de` (v2-Feature, Outlook).

### 8. Approvals & Disputes (5 Artikel)

- [ ] **pending-events-bestaetigen** — [Prio: MUSS] — Was sind Pending Events, wie schnell bestätigen, Inbox-Counter.
- [ ] **event-bestreiten** — [Prio: MUSS] — Wann macht das Sinn, optionaler Grund, was sieht der Verein.
- [ ] **reminder-logik** — [Prio: SOLL] — Wann kommt die Erinnerung (7d, 14d, 30d, dann monatlich), wie abstellen.
- [ ] **expired-am-saison-ende** — [Prio: SOLL] — Pending-Approvals verfallen mit Saison-Ende, was passiert mit Charges.
- [ ] **disputes-und-trust** — [Prio: Later] — Audit-Log, "reported_by", wie KickPact Trust einbaut.

### 9. Crawler & Fußball.de (5 Artikel)

- [ ] **wie-der-crawler-funktioniert** — [Prio: MUSS] — Alle 6h, was wird geholt, was nicht (z.B. keine Kopfball-Info).
- [ ] **match-fehlt-was-tun** — [Prio: MUSS] — Manueller Match-Eintrag als Fallback, Idempotenz-Check.
- [ ] **fussballde-aendert-daten** — [Prio: SOLL] — Was passiert wenn ein Ergebnis nachträglich korrigiert wird.
- [ ] **crawler-pausen-und-sommerpause** — [Prio: SOLL] — Wann der Crawler nicht läuft (Trial-Ende, Sommerpause, Read-Only).
- [ ] **player-mapping-korrigieren** — [Prio: Later] — Wenn der Crawler einen Spieler nicht zuordnen kann.

### 10. FAQ (1 Sammelartikel)

- [ ] **faq** — [Prio: MUSS] — 12–15 häufigste Fragen, Cross-Links in die Tiefenartikel. Beispielfragen:
  - Brauche ich eine USt-ID?
  - Was passiert wenn ein Sponsor nicht zahlt?
  - Kann ich mehrere Vereine gleichzeitig verwalten?
  - Bekommt KickPact Provision? (Nein.)
  - Wie lange laufen die Daten nach Kündigung?
  - Kann ein Spieler selbst Sponsor sein?
  - Was wenn Fußball.de das Ergebnis falsch hat?
  - Können Pledges nachträglich geändert werden?
  - Wie storniere ich einen falsch bestätigten Event?
  - Brauchen Sponsoren ein Stripe-Konto? (Nein, v1 ist Tracking-only.)

---

## Volumen-Übersicht

| Kategorie | Artikel total | MUSS | SOLL | Later |
|---|---:|---:|---:|---:|
| 1. Erste Schritte — Verein | 8 | 5 | 2 | 1 |
| 2. Erste Schritte — Sponsor | 5 | 3 | 2 | 0 |
| 3. Pledges & Trigger | 10 | 5 | 4 | 1 |
| 4. Tarife & Pricing | 8 | 4 | 4 | 0 |
| 5. Sponsor-Akquise | 6 | 0 | 4 | 2 |
| 6. Abrechnung | 7 | 4 | 3 | 0 |
| 7. Vereinslizenz-Spezial | 5 | 1 | 2 | 2 |
| 8. Approvals & Disputes | 5 | 2 | 2 | 1 |
| 9. Crawler & Fußball.de | 5 | 2 | 2 | 1 |
| 10. FAQ | 1 | 1 | 0 | 0 |
| **Total** | **60** | **27** | **25** | **8** |

→ **MUSS-Launch-Set:** 27 Artikel. Bei 250–500 Wörter ≈ 8–14k Wörter — an einem fokussierten Wochenende schreibbar.

---

## Bereits ausgeschrieben (3 Beispiele für Tonalitäts-Standard)

- [`/articles/welcher-tarif-passt.md`](articles/welcher-tarif-passt.md) — Decision-Tree für Tarifwahl.
- [`/articles/erste-schritte-verein.md`](articles/erste-schritte-verein.md) — End-to-End-Verein-Onboarding.
- [`/articles/saison-pass-vs-annual.md`](articles/saison-pass-vs-annual.md) — Billing-Cycle-Vergleich.

---

## Implementation-Hinweise

### Tech-Stack (geplant)

- **Routes:** `/hilfe` (Index mit Kategorie-Grid + Suche) · `/hilfe/[kategorie]/[slug]` (Artikel).
- **Format:** Markdown-Dateien unter `docs/help-center/articles/<slug>.md` mit Frontmatter, gerendert zu MDX über `@next/mdx` oder `next-mdx-remote`. So bleiben Artikel auch ohne Server lesbar (GitHub, Editor).
- **Suche v1:** einfacher String-Match über Titel + Inhalt (clientseitig mit Fuse.js, alle Artikel im Build vorab geladen — bei ~60 Artikeln völlig unproblematisch).
- **Suche v2 (optional):** Algolia DocSearch (kostenlos für OSS-/Doku-Projekte) oder eigene Postgres-FTS-Tabelle wenn Algolia-Antrag verzögert.

### Frontmatter-Schema

```yaml
---
title: "Welcher Tarif passt zu meinem Verein?"
slug: "welcher-tarif-passt"
category: "tarife-pricing"
category_label: "Tarife & Pricing"
prio: "MUSS"
audience: ["verein-admin", "sponsor"]   # einer von: verein-admin, trainer, sponsor, vereinslizenz-admin
related_articles:
  - "saison-pass-vs-annual"
  - "vereinslizenz-break-even"
  - "trial-30-tage"
last_updated: "2026-05-24"
reading_time_min: 4                       # auto-berechenbar, optional manuell
status: "published"                       # draft | review | published
---
```

### Asset-Konventionen

- Screenshots: `docs/help-center/assets/<slug>/<num>-<kurzbeschreibung>.png`. In Artikeln als `![Screenshot: Wizard Schritt 2 — Mannschaft wählen](../assets/erste-schritte-verein/02-mannschaft-wahl.png)`.
- Bis Screenshots existieren: Platzhalter `![Screenshot: ... (placeholder)](placeholder)` — wird beim Build durch ein graues Block-Placeholder-Element ersetzt.

### Aufgabenliste vor v1-Launch

1. 27 MUSS-Artikel schreiben (Vorlage: die 3 Beispiel-Artikel als Stilbasis).
2. Screenshot-Pass durch alle MUSS-Artikel sobald die UI steht.
3. `/hilfe`-Route bauen (Kategorie-Grid + clientseitige Suche, 1 Tag).
4. Artikel-Cross-Links validieren (CI-Script: alle `related_articles`-Slugs müssen existieren).
5. SEO: `metadata`-Export pro Artikel (Title, Description = erste 160 Zeichen).
