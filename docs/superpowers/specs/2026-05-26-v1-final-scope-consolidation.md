# KickPact v1 — Final Scope Consolidation

**Date:** 2026-05-26
**Status:** approved-for-planning
**Author:** Johannes + Claude (4 sparring rounds)
**Supersedes:** keine — konsolidiert die offenen Punkte aus
- `2026-05-19-kickpact-v1-design.md`
- `2026-05-22-identity-roles-mobile-ia-design.md`
- `2026-05-22-scraper-realdata-validation-design.md`
- `2026-05-25-trust-and-payment-model-design.md`
- `2026-05-25-feature-catalog-gap-analysis.md` (Audit)

Dieses Dokument ist die endgültige Festlegung der Design-Fragen, die nach dem Feature-Catalog-Audit offen waren. Implementation-Plans (writing-plans-Output) entstehen separat.

---

## 1. Design-Entscheidungen aus den Sparring-Runden

### 1.1 Sponsor-Modell: Account-Sharing statt Sub-User

1 Sponsor-Profil = 1 Login = 1 Rechnungs-Empfänger. Familien teilen sich pragmatisch ein Passwort. Keine technische Familien-Verwaltung.

**Konsequenzen:**
- `sponsors.pledgeProxiesJson` → Legacy, Cleanup in Phase H.
- "Familie verwalten"-Tile aus Identity-Spec §7.5 entfällt.
- Sponsor-Onboarding zeigt keinen "Familienmitglieder hinzufügen"-Schritt.

### 1.2 Billing-Cycle pro Sponsor

**Jeder Sponsor wählt beim Onboarding seinen Abrechnungs-Rhythmus:**
- **Monthly** (Default) — Rechnung am Monats-1.
- **Season-End** — alle Charges sammeln sich, EINE Rechnung am Saisonende (= 30.06.).

**Cycle-Wechsel jederzeit erlaubt.** Wechsel-Zeitpunkt schneidet Charges sauber:
- monthly → season_end: bisherige Monatsrechnungen bleiben, ab Wechsel werden Charges für Saisonende gesammelt.
- season_end → monthly: bisher gesammelte Charges werden mit der ersten Monatsrechnung beglichen.

**Schema:** Neue Spalte auf `sponsors`:
```ts
billingCycle: pgEnum("sponsor_billing_cycle", ["monthly", "season_end"]).notNull().default("monthly")
```

**Charge-Cycle-Zuordnung (Edge-Case Cycle-Wechsel):** Cycle eines Charges wird durch den **Spielzeitpunkt** des zugehörigen Events bestimmt, NICHT durch den Charge-Erzeugungs-Zeitpunkt. Damit gehören rückwirkende Approvals dem Cycle, der zum Spielzeitpunkt galt.

Implementation: neue Tabelle `sponsor_billing_cycle_history` mit `(userId, cycle, validFrom)`. Beim Charge-Erzeugen wird via Lookup auf `event.matchDate` der korrekte Cycle gefunden + als Snapshot in `charges.billingCycleSnapshot` gespeichert.

### 1.3 Saison-Definition

**Saisonende:** Fix **30.06.** für alle Mannschaften.

**Saisonstart:** Wird **aus Fußball.de-Crawler abgeleitet** — erstes Pflichtspiel der neuen Saison auf Mannschaftsebene = Saisonstart. Schema: `teams.seasonStartAt` (vom Crawler gesetzt, nullable wenn noch nicht bekannt).

**Sommerpause (zwischen 30.06. und Saisonstart):**
- Crawler pausiert für laufende Saison, scannt aber regelmäßig nach neuen Saison-Spielplänen.
- Pledges sind "pausiert" — keine Charges für Freundschaftsspiele in der Sommerpause.
- Saison-Renewal-Reminder-Cron läuft weiter (bestehender `season-renewal-prompts`-Flow).
- Spiele der neuen Saison können vorgeladen werden, sobald Fußball.de sie zeigt.

### 1.4 Verein ↔ Mannschaft: 3-Zustände-Modell

| Zustand | Was bedeutet das? | Lizenz | Schreibrechte Verein |
|---|---|---|---|
| **Autark** | Mannschaft existiert standalone, gehört namentlich zum Verein, aber operativ unabhängig | Team-Trainer zahlt Mannschaftslizenz | Verein hat keine |
| **Co-Owned** | Team-Trainer behält Lizenz + Eigentum, lässt aber Vorstand/andere als Trainer/Viewer dazu | Team-Trainer zahlt Mannschaftslizenz | Andere haben Rolle (trainer/viewer) |
| **Unter Vereinslizenz** | Vorstand zahlt zentral, T's Stripe-Sub läuft aus | Vereinslizenz | Vorstand voll, T bleibt Team-Trainer mit Schreibzugriff |

**Schema:**
```ts
// teams-Tabelle erweitern
licensedUnderClubId: text("licensed_under_club_id").references(() => clubs.id, { onDelete: "set null" })
// null = autark/co-owned (Lizenz beim Team-Trainer)
// gesetzt = unter Vereinslizenz dieses Clubs
```

`teams.clubId` (Pflicht-FK) bleibt unverändert — die Mannschaft gehört immer namentlich einem Verein. Die Lizenz-Beziehung wird separat in `licensedUnderClubId` getrackt.

**Co-Owned-Mechanik:** Team-Trainer geht in Mannschaft-Einstellungen → "Mitverwalter einladen" → Mail eingeben → Magic-Link mit teamMembership-Rolle. Verwendet bestehende `team-einladung`-Infrastruktur.

**Sichtbarkeit auf Verein-Public-Profile:** Alle Mannschaften des Vereins erscheinen — unabhängig von Lizenz-Owner. Verein-Profile spiegelt Fußball.de-Logik (alle Teams gehören namentlich dazu).

### 1.5 Lizenz-Transfer-Flow

**Vorstand bittet T, in Vereinslizenz aufgenommen zu werden:**

1. Vorstand legt Verein an (oder hat bereits Verein).
2. Verein-Onboarding zeigt: "Diese Mannschaften existieren bereits in der DB". Vorstand klickt "Anfrage an T schicken" für jede gewünschte Mannschaft.
3. Schema: neue Tabelle `team_license_transfer_requests`.
4. T sieht Anfrage in Mannschaft-Dashboard-Banner + `/team-einladungen`-Inbox.
5. T entscheidet: Annehmen / Ablehnen / "Co-Owned" (Verein wird Trainer dazu, Lizenz bleibt bei T).

**Bei Annahme — Timing-Entscheidung:**

- T's Stripe-Sub läuft **bis Periode-Ende** (z.B. 31.05.) und wird dann gecancelt.
- Vereinslizenz **startet ab 01. des Folgemonats** (z.B. 01.06.).
- **Branding wechselt aber sofort beim Annahme-Tag:** Mai-Rechnung an Sponsoren trägt schon Vereins-Absender (Vereins-IBAN, Vereins-Branding).

**Bewusster Trade-off:** T zahlt seinen Mai-Sub-Beitrag an KickPact, sieht aber im Mai keine Sponsoren-Einnahmen mehr (die fließen zum Verein). User-Entscheidung: kein Refund-Aufwand wichtiger als T's vermiedener Verlust. **Watch-Point:** Falls bei echten Vereinen Stress macht → Umstieg auf Pro-Rata-Refund-Modell.

**Bei Ablehnung:** T bleibt autark / co-owned. Verein bekommt Notification "T hat abgelehnt".

### 1.6 Pricing

| Tarif | Preis | Was inkl. | Wer kauft |
|---|---|---|---|
| **Mannschaft Basic** | 9 €/Mon | 1 Team, max 20 Sponsoren | Team-Trainer |
| **Mannschaft Pro** | 19 €/Mon | 1 Team, unlimited Sponsoren | Team-Trainer |
| **Vereinslizenz** | **49 €/Mon Flat** | Alle Mannschaften des Vereins, unlimited Sponsoren | Club-Admin |

**Trial:** 30 Tage auf erste Mannschaft. Bei Wechsel zu Vereinslizenz vor Trial-Ende: T's Trial endet sofort, **Vereinslizenz startet mit eigenem neuen 30d-Trial** für den Verein.

**Marketing-Hook:** "Weniger als 1 € pro Spieler im Monat."

### 1.7 Mannschaft-Onboarding-Verifikation (NEU, kritisch)

Mannschaft-Onboarding ohne Vereins-Admin existiert im Code, **aber Nachweis-Pflicht fehlt** (Sicherheitsrisiko: Fremder könnte fremde Mannschaft claimen).

**Soll-Zustand:**
- Mannschaft-Onboarding-Wizard bekommt einen Verifikations-Schritt (analog Verein-Onboarding Step 4).
- Schema: separate `team_verifications`-Tabelle (analog `club_verifications`).
- Akzeptierte Doc-Typen (Free-Form mit Type-Selector):
  - Trainerlizenz / DFB-Trainerschein
  - Vereinsbestätigung (formloses Schreiben/Mail)
  - Foto mit Mannschaft in Trikot
  - Spielleitungs-Eintrag auf Fußball.de
  - Sonstiges (Freitext-Beschreibung)
- **Manuelle Prüfung durch Johannes** via `/admin/verifications`.
- **Withhold-Gate analog:** Bis Verifikation durch, Rechnungen werden als `withheld` erzeugt, nicht versendet. Nach Approval-Trigger werden alle nachgesendet.

### 1.8 Public-Profile

**URL-Schema: Slug auf Root.**
- Verein: `/{verein-slug}` (z.B. `kickpact.de/asc-neuenheim`)
- Mannschaft: `/{verein-slug}/{team-slug}` (z.B. `kickpact.de/asc-neuenheim/c-jugend`)

**Implikation:** Slug-Validation muss reservierte Routen ausschließen (`preise`, `hilfe`, `einladung`, `login`, `signup`, `dashboard`, `sponsor`, `verein`, `admin`, `konto`, `api`, `_next`, etc.). Reservierten-Liste pflegen.

**Sichtbarkeits-Gate:** Public-Profile ist **erst nach Verifikations-Approval öffentlich** sichtbar. Vorher: 404 oder "Mannschaft wird gerade verifiziert"-Page. Analog zum Withhold-Pattern für Rechnungen.

**Pflegbare Felder pro Mannschaft (durch Team-Trainer):**
- Logo (Mannschafts-Logo, fallback auf Vereins-Logo wenn nicht gesetzt)
- 1-3 Mannschaftsbilder (Galerie via R2)
- Tagline (existiert als `publicTagline`) + längere Beschreibung (Markdown-Subset)
- **Strukturierte Saisonziele** (Auto-Check via Crawler):
  - `TABLE_POSITION` mit numerischem Ziel (z.B. ≤ 3)
  - `PROMOTION` (Aufstieg ja/nein)
  - `RELEGATION_AVOIDED` (Klassenerhalt)
  - `GOALS_SCORED` mit numerischem Ziel (z.B. ≥ 50 Tore in der Saison)
  - `CUP_ROUND` mit erreichter Runde (Achtelfinale, Viertelfinale, …)
  - Bewertung erfolgt automatisch am 30.06. via Fußball.de-Tabellen-Snapshot
  - Bei Erreichen: Badge "✅" auf dem Profil
  - **Freitext-Ziele sind nicht in v1** — sonst kein Auto-Check möglich
- Trainer-Vorstellung (Name + Foto + Bio)
- **Toggle "Spielernamen öffentlich anzeigen"** (default on, kann pro Mannschaft auf off gesetzt werden)

**Pflegbare Felder pro Verein (durch Club-Admin):**
- Vereins-Logo + Hero-Bild
- Beschreibung
- Mannschaftsliste (automatisch aus DB, nicht pflegbar)

**Automatisch aus Fußball.de:**
- Tabellenstand
- Saison-Bilanz (S/U/N, Tore +/-)
- Spielerstatistiken **mit Klarnamen** (default sichtbar wie Fußball.de selbst — kann pro Mannschaft via Toggle deaktiviert werden, dann nur Mannschafts-Aggregat)
- Letzte/nächste Spiele

**Spieler-Opt-out: NICHT IMPLEMENTIERT.**

Daten sind eh auf Fußball.de öffentlich, KickPact ist Aggregator/Wieder-Anzeige derselben Daten. Bestehende Features (`e232b1b` Roster-Block-Toggle + `a4a555a` Public-Opt-out-Page) werden **deprecated** → Cleanup in Phase H.

**Risiko-Watch-Point:** KickPact bringt einen neuen Datenverarbeitungs-Zweck dazu (Spieler-Performance ↔ Geld), nicht von Fußball.de's Veröffentlichung gedeckt. Falls je ein Spieler sich beschwert → muss Opt-out reaktiviert werden. Bestehender Code als Reference behalten, nicht löschen.

**Externe-Besucher-Flow ("Mannschaft sponsern"-CTA):**
- Inquiry-Form direkt auf öffentlicher Seite: Name, Mail, freie Nachricht.
- Submission → Mail an Trainer/Club-Admin als Sponsor-Inquiry (verwendet bestehende `sponsorInquiries`-Schema).
- Absender bekommt Magic-Link-Bestätigung "wir haben deine Anfrage erhalten".
- **Kein Direkt-Pledge ohne Verein-Genehmigung.** Trainer entscheidet via `respondToInquiry`.

### 1.9 Zahlung

KickPact bleibt non-custodial. Rechnungs-PDF zeigt **mehrere Zahlwege** (Verein hinterlegt einmal in Einstellungen):
- Bank-Überweisung mit Girocode-QR (existiert)
- PayPal-Pay-Link (z.B. `paypal.me/{handle}`)
- Stripe-Pay-Link (`https://buy.stripe.com/...`)

**Schema:** `clubs`-Tabelle erweitern um `paypalHandle`, `stripePaymentLink` (beide nullable).

**Rechnungs-Renderer** zeigt Buttons konditional. Default Girocode.

### 1.10 Notifications (P1 für Launch)

**In-App-Notification-Center:**
- Glocke im Header mit Counter-Badge
- Liste: Approvals pending, Mahnung fällig, Sponsor-Anfrage, Verifikations-Anfrage, Lizenz-Transfer-Anfrage, Mitglieds-Zugriffsanfrage, Saison-Renewal-Reminder
- Mark-as-read / Bulk

**Mail-Präferenzen (Konto-Page):**
- Pro Notification-Type: Sofort / Tages-Digest / Wöchentlich / Aus
- Mindestens Approvals + Rechnungen können nicht ausgeschaltet werden

**Schema:** `notifications` + `notification_preferences` (siehe Migration N7 unten).

### 1.11 Mahnung-Cadence

**Monatliche Rechnungen** (heute, bleibt):
- Tag 14: 1. Erinnerung freundlich
- Tag 30: 2. Mahnung
- Danach: keine weiteren Auto-Reminder, Verein muss selbst eingreifen

**Saison-Ende-Rechnungen (NEU):**
- Gleicher sanfter Rhythmus: Tag 14 + Tag 30 nach Versand
- Danach Stille, Inkasso ist Vereinssache (non-custodial-konform)
- Kein "Status: säumig" — KickPact bleibt sanft, Verein entscheidet hartes Eskalieren

### 1.12 Lösch-Verhalten (Soft-Delete)

Verein und Mannschaft können **nur soft-gelöscht** werden:
- `clubs.deletedAt` und `teams.deletedAt` (timestamptz nullable)
- User-Zugriff auf gelöschte Entitäten gesperrt (Login redirected mit Erklärung)
- Aber: Sponsoren können historische Charges + Rechnungen weiter sehen (Buchhaltungsbedarf)
- Public-Profile zeigt 410 Gone bei gelöschten Vereinen
- Reaktivierung möglich via Admin-UI

Hard-Delete nur via Admin-Backend (`/admin/cleanup`) für DSGVO-Anfragen oder Test-Daten.

### 1.13 Approval-UX

Approval-Mail → Token im Link → **öffnet Approval-Detail-Seite** (Spiel, Spielzug, Minute, Spieler) → "Bestätigen"-Button (1 extra Klick) **ohne Login**.

Token reicht für die Aktion. Sponsor kann optional via Magic-Link ins Dashboard wechseln, muss aber nicht.

Aktueller Code muss verifiziert werden, dass Approval-Confirm/Dispute über Token funktioniert.

---

## 2. Gap-Liste, priorisiert

### P0 — vor Public-Launch zwingend

1. **Mannschafts-Verifikations-Schema + UI** (1.7) — Sicherheitsrelevant.
2. **Public-Profile-System** (1.8) — Top-Marketing-Hebel.
3. **Sponsor Billing-Cycle Season-End** (1.2) — neue End-to-End-Logik.
4. **Lizenz-Transfer-Flow** (1.5) — neues Datenmodell + Inngest-Cron.
5. **PayPal/Stripe-Pay-Links auf Rechnung** (1.9) — UI + PDF-Renderer.
6. **Notification-Center + Präferenzen** (1.10) — Glocke + Konto-Page.
7. **Test-Suite grün** — 82 rote Tests (STATE.md).
8. **Onboarding-E2E manuell verifizieren** — STATE.md Priorität 1.
9. **Saisonstart aus Crawler ableiten** (1.3) — `teams.seasonStartAt` setzen.
10. **Rollen-Sichtbarkeits-Fix (Team-Pages):** alle `app/(verein)/verein/[slug]/mannschaft/[teamId]/*`-Routes von `assertClubAccess` auf `assertTeamAccess` umstellen (Trainer von Team A darf nicht in Team B reinsehen). Plus `mannschaft/[teamId]/einstellungen` von admin- auf trainer-Level mit `assertTeamAccess` (Team-Trainer muss eigenes Team editieren können). Audit-Details: 2 HIGH + 1 MEDIUM + 1 LOW in `docs/audits/role-visibility-2026-05-26.md` (kommt mit dem Fix-Commit).

### P1 — wichtig, Launch-fähig ohne

10. Pledge bearbeiten + vorzeitig beenden
11. Storno / Rechnungs-Reklamation
12. Einladungen erneut versenden (Sponsor + Mitglied)
13. Mitglied-Rolle ändern UI
14. Mobile FAB + responsiver Praxis-Test
15. SEO Sitemap + OG-Bilder pro Route
16. Help-Center-Suche + kontextuelle "?"-Icons
17. Onboarding-Completion-Checklist
18. Trial-Countdown + "Anstehende Aufgaben"-Block im Verein-Dashboard
19. Pledge-Wizard: Spieler-Auswahl-UI verifizieren + Custom-Trigger frei benennen

### Cleanup (jederzeit, low-risk)

20. `sponsors.pledgeProxiesJson` deprecaten + Migration
21. Spieler-Opt-out-Features (`e232b1b`, `a4a555a`) deprecaten (Code bleibt als Reference)
22. "Familie verwalten"-Tile entfernen (falls existiert)
23. Reference-Legacy-Code endgültig aus Repo
24. STATE.md Cleanup-Sweep-Liste durcharbeiten

---

## 3. Schema-Migrationen

```sql
-- N1: Sponsor Billing-Cycle + History für Cycle-Wechsel
ALTER TABLE sponsors ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE charges ADD COLUMN billing_cycle_snapshot TEXT NOT NULL DEFAULT 'monthly';

CREATE TABLE sponsor_billing_cycle_history (
  id TEXT PRIMARY KEY,
  sponsor_id TEXT NOT NULL REFERENCES sponsors(id) ON DELETE CASCADE,
  cycle TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sponsor_cycle_history_lookup_idx ON sponsor_billing_cycle_history(sponsor_id, valid_from DESC);

-- Soft-Delete
ALTER TABLE clubs ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE teams ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE INDEX clubs_active_idx ON clubs(slug) WHERE deleted_at IS NULL;
CREATE INDEX teams_active_idx ON teams(club_id) WHERE deleted_at IS NULL;

-- N2: Team-Lizenz-Owner
ALTER TABLE teams ADD COLUMN licensed_under_club_id TEXT REFERENCES clubs(id) ON DELETE SET NULL;
CREATE INDEX teams_licensed_under_club_idx ON teams(licensed_under_club_id) WHERE licensed_under_club_id IS NOT NULL;

-- N3: Team-Lizenz-Transfer-Requests
CREATE TABLE team_license_transfer_requests (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id),
  to_club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  requested_by_user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  decision TEXT, -- 'accept_license' | 'accept_co_owned' | 'reject'
  decision_note TEXT,
  decided_at TIMESTAMPTZ,
  decided_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX team_license_transfer_unique_pending
  ON team_license_transfer_requests(team_id) WHERE status = 'pending';

-- N4: Team-Verifications
CREATE TABLE team_verifications (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  submitted_by_user_id TEXT NOT NULL REFERENCES users(id),
  doc_type TEXT NOT NULL,
  doc_description TEXT,
  storage_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE teams ADD COLUMN verified_at TIMESTAMPTZ;

-- N5: Public-Profile Felder + Saisonstart
ALTER TABLE teams
  ADD COLUMN description_md TEXT,
  ADD COLUMN gallery_keys JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN season_goals JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN trainer_name TEXT,
  ADD COLUMN trainer_bio TEXT,
  ADD COLUMN trainer_photo_key TEXT,
  ADD COLUMN show_player_names BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN season_start_at TIMESTAMPTZ;

ALTER TABLE clubs
  ADD COLUMN description_md TEXT,
  ADD COLUMN hero_image_key TEXT;

-- N6: Zahlungs-Endpoints
ALTER TABLE clubs
  ADD COLUMN paypal_handle TEXT,
  ADD COLUMN stripe_payment_link TEXT;

-- N7: Notifications
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX notifications_user_unread_idx ON notifications(user_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'immediate',
  PRIMARY KEY (user_id, type, channel)
);

-- Cleanup-Migrations (Phase H):
-- ALTER TABLE sponsors DROP COLUMN pledge_proxies_json;
-- (Spieler-Opt-out-Features bleiben im Code als Reference, players.blocked-Spalte bleibt)
```

---

## 4. Roadmap: parallel-fähige Arbeitspakete

User-Direktive: "alles parallel durchballern". Pakete mit minimalen Kreuz-Abhängigkeiten:

| Paket | Inhalt | Abhängigkeit | Schätzung |
|---|---|---|---|
| **A: Stabilisierung** | 82 rote Tests bisect+fix · Onboarding-E2E manuell · E2E-Specs neu schreiben · **Rollen-Sichtbarkeits-Fix (Team-Pages auf assertTeamAccess umstellen, Team-Einstellungen für Team-Trainer öffnen)** | keine | 1 Tag |
| **B: Mannschafts-Verifikation** | Schema (N4) · Onboarding-Step ergänzen · Admin-UI erweitern · Withhold-Gate für Team-Rechnungen | keine | 1 Tag |
| **C: Sponsor Billing-Cycle** | Schema (N1) · Onboarding-UI · `generate-season-end-invoices` Cron (30.06.) · Sponsor-Dashboard-Anpassung · Mahnung-Logik · Cycle-Wechsel-UI | keine | 1,5 Tage |
| **D: Lizenz-Transfer** | Schema (N2+N3) · Verein-Onboarding "claim existing teams" · Anfrage-UI für T · Inngest `transfer-team-license` zum Periodenende · Mail-Templates · Branding-Wechsel-Logik | keine | 1,5 Tage |
| **E: Public-Profile** | Schema (N5) · Public-Routes `/{slug}` und `/{slug}/{team-slug}` · Reserved-Slug-Validation · Pflege-UI Trainer + Club-Admin · Inquiry-CTA · SEO-Meta + OG-Bilder · Spielernamen-Toggle | abhängig von B (Verifikation = Vorbedingung für public) | 2 Tage |
| **F: Zahlungs-Endpoints** | Schema (N6) · Vereins-Einstellungen-UI · PDF-Renderer-Erweiterung · Mail-Body-Update | keine | ½ Tag |
| **G: Notification-Center** | Schema (N7) · Glocke-UI · Konto-Page Preferences · Migration aller bestehenden Mails durch das neue System · Digest-Cron | keine | 2 Tage |
| **H: P1-Lücken + Cleanup** | Pledge editieren+beenden · Storno · Einladung-Resend · Mitglied-Rolle ändern · Trial-Countdown · Mobile FAB · `pledgeProxiesJson`-Drop · Spieler-Opt-out-Features deprecaten | keine | 2–3 Tage verteilt |
| **I: Sommerpause-Logik** | Crawler-Pause-Cron · Saisonstart-Crawler-Detection (`teams.seasonStartAt`) · Pledge-Pause-Status während Sommerpause · Frühe Spielplan-Vorladung | keine | 1 Tag |

**Empfohlene Reihenfolge bei Solo-Modus:** A → B+F parallel → C+D parallel → E (baut auf B auf) → G → I → H.

**Bei Parallel-Agents:** A zuerst (Baseline grün), dann B/C/D/F/G/I gleichzeitig. E wartet auf B.

---

## 5. Was bewusst NICHT in v1

- Stripe-Connect Auto-Charge (v2)
- Native Mobile App (Expo) — Architektur ist ready, aber kein Build
- Push-Notifications
- Foto-/Video-Beweise an Match-Events
- Conditional/eskalierende Pledges
- Spenden-Quittungen für gemeinnützige Vereine
- Banking-Match-CSV-Import (Phase E2 später)
- DATEV-Export
- 2FA
- Multi-Account-Merge
- API/Webhooks für externe Reportings
- Sub-User unter Sponsor-Familie (Account-Sharing ist Default)
- Spieler-Opt-out (Risiko-Watch-Point, kann bei Bedarf reaktiviert werden)
- Einmal-Spende (Sponsor legt Mini-Pledge mit 1-Spiel-Laufzeit an, wenn er einmalig geben will)
- Mehrsprachigkeit (DE-only für v1)
- Region-/PLZ-basierte Saisonkalender-DB

---

## 6. Watch-Points für die Implementierung

Diese Trade-offs wurden bewusst gewählt, könnten aber bei echten Vereinen Stress machen:

1. **Lizenz-Transfer-Branding (1.5):** T verliert effektiv seinen Mai-Sub-Beitrag ohne Sponsor-Einnahmen. Bei Stress → Pro-Rata-Refund-Modell evaluieren.
2. **Spieler-Opt-out fehlt (1.8):** KickPact-Use-Case "Performance → Geld" ist nicht von Fußball.de's Veröffentlichung gedeckt. Bei Spielerbeschwerde → Reaktivierung der bestehenden Features (`e232b1b`, `a4a555a`).
3. **Mahnung-Cadence sanft (1.11):** Keine harten Konsequenzen bei säumigen Sponsoren — Verein muss selbst eingreifen. Bei Verein-Stress: Toggle "Reminder-Aggressivität" einbauen.
4. **Saisonstart aus Crawler (1.3):** Wenn Fußball.de Spielpläne zu spät publiziert, könnte Saisonstart zu spät erkannt werden. Manueller Override pro Mannschaft sollte möglich sein (UI-Detail in Paket I).

---

## 7. Sparring-Historie

4 Runden Sparring am 2026-05-26:

- **Runde 1:** Sponsor-Proxies (raus), Mini-Vereins-Onboarding (Mannschaft-only erlaubt, Nachweis fehlt), Abo-Modell (drei Tarife klar), Public-Profile (ja, jede Mannschaft kriegt URL).
- **Runde 2:** Privatperson-Rechnung (bleibt für alle, mit Multi-Payment-Buttons), Mannschaft-Nachweis-Typen (frei + manuelle Prüfung), Verein-Claim (3-Zustände-Modell), Public-Profile-Felder (Logo+Galerie+Beschreibung+Ziele+Trainer).
- **Runde 3:** Lizenz-Transfer-Timing (T's Sub bis Period-End), Public-Sponsor-CTA (Inquiry, kein Direkt-Pledge), Pflegbare Profil-Felder (alle vier), Notifications (P1 für Launch).
- **Runde 4:** Saisonende fix 30.06., Mahnung sanft 14+30, Cycle-Wechsel jederzeit, Branding sofort beim Annahme-Datum (mit Watch-Point).
- **Runde 5:** Spielernamen-Toggle pro Mannschaft, Sommerpause (Crawler+Pledges pausieren), autarke Teams auf Verein-Profile sichtbar, keine Einmal-Spende, Saisonstart aus Crawler, kein Spieler-Opt-out, Approval mit Detail-Seite.
