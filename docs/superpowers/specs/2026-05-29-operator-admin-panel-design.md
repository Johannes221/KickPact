# KickPact Operator-Admin-Panel — Design & Funktionskatalog

**Date:** 2026-05-29
**Status:** draft — review pending
**Author:** Johannes + Claude
**Scope:** Plattform-Admin-Panel (`/admin`) — das Backoffice für den KickPact-Betreiber (Johannes), NICHT die Vereins-/Mannschafts-Rollen.

---

## 0. Begriffsklärung — drei verschiedene „Admins"

Es gibt im System drei völlig getrennte Admin-Begriffe. Diese Spec betrifft ausschließlich (1).

| # | Begriff | Wer | Wo | Auth |
|---|---|---|---|---|
| 1 | **Plattform-Operator** (diese Spec) | Johannes / KickPact-Ops | `/admin` | NEU: E-Mail + Passwort |
| 2 | **Vereins-Admin** | Vereinsvorstand | `/verein/[slug]` | Magic-Link, `clubMemberships.role='admin'` |
| 3 | **Mannschafts-Admin** | Trainer/Betreuer | `/verein/[slug]/mannschaft/[teamId]` | Magic-Link, `teamMemberships.role='admin'` |

Im Code heißt (1) bereits „KickPact Operator" ([app/admin/layout.tsx:29](../../../app/admin/layout.tsx)).

---

## 1. Ist-Zustand (verifiziert 2026-05-29)

Es existiert bereits ein Operator-Panel unter `app/admin/` mit 9 Bereichen, abgesichert per `assertPlatformAdmin()` ([lib/auth/admin.ts](../../../lib/auth/admin.ts)).

**Auth heute:** Operator loggt sich mit demselben Magic-Link wie normale Nutzer ein; danach Gate per ENV-Allowlist `KICKPACT_ADMIN_EMAILS`. Kein Passwort, keine DB-Rolle. Bewusst so gewählt (Kommentar im Code), aber widerspricht der neuen Anforderung.

**Was die 9 Bereiche heute können (Kurzfassung des Audits):**

| Bereich | Lesen | Schreiben (vorhanden) |
|---|---|---|
| Dashboard | KPIs, MRR-Chart, Top-Vereine | — (read-only) |
| Verifications | Vereins-/Team-Dokumente prüfen | approve/reject (Club + Team), Rechnungs-Freigabe + Mails |
| Conflicts | fussball.de-ID-Kollisionen | reject_claim / claimant_wins (Account-Takeover) |
| Vereine | Liste + Detail (Stammdaten, Abo, Mitglieder, Teams, Charges) | Abo pausieren, Verein sperren, Verifizierung widerrufen |
| Users | Liste + Detail (Sponsor-Profile, Memberships, Pacts) | — (read-only) |
| Crawler | Health pro Team, letzte Crawls | manuellen Crawl auslösen |
| Rechnungen | Info-Text | manuellen Rechnungslauf auslösen |
| Stripe | Past-due/Incomplete-Abos, Webhooks | — (Links zu Stripe-Dashboard) |
| Mail | Resend-Versand-Historie (letzte 50) | — (read-only) |

---

## 2. Funktionskatalog & Coverage-Matrix

Logik: Für jede Aktion, die ein **User / Sponsor / Verein-Admin** macht, und für jeden Fall, in dem jemand **Hilfe braucht**, wird gefragt: *Muss der Operator hier eingreifen können?* → und: *Kann er es heute?*

Legende: ✅ vorhanden · 🟡 teilweise · ❌ fehlt

### 2.1 Identität & Accounts (User-Ebene)

| Was der Nutzer tut / braucht | Operator-Bedarf | Heute |
|---|---|---|
| Registriert sich (Magic-Link) | Account einsehen | ✅ |
| „Ich komme nicht rein" / Login-Hilfe | Magic-Link erneut senden / Login-as zur Reproduktion | ❌ |
| Falsche E-Mail bei Registrierung | E-Mail/Name korrigieren | ❌ |
| Account-Löschung beantragt (DSGVO) | Löschung einsehen / sofort ausführen / zurücknehmen | 🟡 (nur Anzeige) |
| Gehört zu welchen Vereinen/Teams/Rollen? | An einer Stelle sehen | 🟡 (nur Detailseite) |
| Rolle falsch / will entfernt werden | Membership hinzufügen/entfernen, Rolle ändern | ❌ |
| Verdacht Missbrauch / Spam-Account | Account sperren/anonymisieren | ❌ |

### 2.2 Verein & Mannschaft

| Was passiert / gebraucht wird | Operator-Bedarf | Heute |
|---|---|---|
| Vereins-Upload (Lizenz-Dokument) | Prüfen, freigeben/ablehnen | ✅ |
| Team-Verifikation (Solo-Mannschaft) | Prüfen, freigeben/ablehnen | ✅ |
| „Bitte manuell freischalten, Dokument kommt per Post" | Verein/Team **ohne** Dokument manuell verifizieren | ❌ (nur Widerruf möglich) |
| Tippfehler in Vereinsname/IBAN/Adresse | Stammdaten editieren | ❌ |
| Team falsch angelegt / Saison falsch | Team-Daten editieren | ❌ |
| Team soll (nicht) öffentlich auffindbar sein | `discoverable` / `isActive` togglen | ❌ |
| Doppelter Verein angelegt | Vereine mergen / löschen | ❌ |
| fussball.de-ID-Kollision / Claim-Streit | Kollision lösen | ✅ |

### 2.3 Sponsoring (Pledges, Charges, Events)

| Was passiert / gebraucht wird | Operator-Bedarf | Heute |
|---|---|---|
| Sponsor legt Pledge an („5 € pro Tor") | Pledge einsehen | 🟡 (nur in User/Club-Detail) |
| Verein meldet Manual Event | Event einsehen/korrigieren/stornieren | ❌ |
| Sponsor bestätigt/bestreitet Event-Approval | Streitfall einsehen + entscheiden | ❌ |
| Charge falsch berechnet / strittig | Charge einsehen / stornieren / korrigieren | ❌ |
| „Ich wurde falsch belastet" (Support) | Charge → Rechnung nachvollziehen | ❌ |

### 2.4 Rechnungen & Zahlungen

| Was passiert / gebraucht wird | Operator-Bedarf | Heute |
|---|---|---|
| Monats-Rechnungslauf | Manuell auslösen | ✅ |
| „Wo ist meine Rechnung?" | Rechnungen auflisten/filtern, PDF herunterladen | ❌ |
| Rechnung erneut zustellen | Rechnungs-Mail erneut senden | ❌ |
| Zahlung eingegangen (SEPA/PayPal manuell) | Rechnung als bezahlt/unbezahlt markieren | ❌ |
| Rechnung falsch / Storno | Rechnung stornieren/gutschreiben | ❌ |
| Abo zahlt nicht (past_due) | Einsehen | 🟡 (nur Liste + Stripe-Link) |
| Abo pausieren / sperren | Pausieren/Sperren | ✅ |
| Abo wieder aktivieren | Entsperren/Resume | ❌ |
| Trial verlängern / Plan ändern / Refund | Im Panel ausführen | ❌ (nur Stripe-Dashboard) |

### 2.5 Betrieb (Crawler, Mail, System)

| Was passiert / gebraucht wird | Operator-Bedarf | Heute |
|---|---|---|
| fussball.de-Crawl | Pro Team manuell auslösen | ✅ |
| Crawl schlägt fehl | Fehler/Logs einsehen, gezielt neu starten | 🟡 (nur Alter + Match-Count) |
| Mail zugestellt? Bounce? | Versand-Historie einsehen | ✅ |
| Mail erneut senden / Template testen | Im Panel | ❌ (nur Resend-Dashboard) |
| Was hat der Operator geändert? | Audit-Log aller Operator-Aktionen | ❌ |

### 2.6 Support & Hilfe (komplett neu)

| Was passiert / gebraucht wird | Operator-Bedarf | Heute |
|---|---|---|
| Nutzer braucht Hilfe / hat Frage | Kontakt-/Hilfe-**Formular** in der App | ❌ (nur `mailto:` im Footer) |
| Eingehende Anfrage | **Inbox** zum Lesen/Beantworten/Status setzen | ❌ |
| Anfrage einem Nutzer/Verein zuordnen | Verknüpfung Ticket ↔ User/Club | ❌ |
| Feedback/Bug-Report sammeln | Kategorisierung (Frage/Bug/Abrechnung/Sonstiges) | ❌ |

---

## 3. Soll-Design

### 3.1 Auth — Operator-Login mit Passwort (kein 2FA)

**Entscheidung:** Eigener Passwort-Login, ohne 2FA (bewusst, Johannes-Vorgabe 2026-05-29).

- better-auth `emailAndPassword`-Plugin aktivieren — **nur** für Operator relevant; normale Nutzer bleiben Magic-Link.
- Neue Spalte `users.isPlatformAdmin: boolean default false` ersetzt die ENV-Allowlist. `assertPlatformAdmin()` prüft künftig die DB-Spalte UND dass die Session über Passwort lief.
- Eigene Login-Seite `/admin/login` (E-Mail + Passwort), getrennt vom Nutzer-Magic-Link-Flow.
- „Passwort vergessen" → better-auth `requestPasswordReset` → Reset-Mail via Resend (bereits konfiguriert). Kein Supabase.
- Passwort-Policy: min. 12 Zeichen (better-auth `minPasswordLength`).
- Migration: bestehende ENV-Allowlist-Mails einmalig auf `isPlatformAdmin=true` setzen; erstes Operator-Passwort per Reset-Flow oder Seed.
- ENV-Allowlist bleibt als Fallback NICHT erhalten (Entfernung nach Migration), um zwei Wahrheiten zu vermeiden.

**R1 — ENTSCHIEDEN (2026-05-29):** Dedizierter Operator-Account, getrennt von Vereins-/Sponsor-Rollen (z.B. `operator@kickpact.de`). Keine „Erhebung" eines bestehenden Nutzer-Accounts.

### 3.2 Ziel-Navigation (Bereiche)

Bestehende 9 + 2 neue + 1 Querschnitt:

```
Dashboard · Support* · Verifications · Conflicts · Vereine · Users
· Sponsoring* · Rechnungen · Stripe · Crawler · Mail · Audit-Log*
```
\* = neu. Reihenfolge nach Häufigkeit der Nutzung (Support hoch, weil tägliches Eingangsfach).

### 3.3 Lücken, die geschlossen werden (priorisiert)

**P1 — Tagesgeschäft / Support (höchster Nutzen):**
1. **Support-Inbox + Kontaktformular** (§2.6) — Tabelle `supportTickets`, öffentliches Formular `/hilfe/kontakt`, Inbox `/admin/support` mit Status (`open/in_progress/waiting/closed`), Kategorie, Antwort-Mail via Resend, optionale Verknüpfung zu User/Club.
2. **User-Aktionen** — E-Mail/Name editieren, Membership/Rolle ändern, Magic-Link erneut senden, Account anonymisieren/löschen sofort, Löschantrag zurücknehmen, „Login-as" (impersonate, klar protokolliert).
3. **Verein/Team editieren** — Stammdaten (Name, IBAN, Adresse, taxId), Team-Felder, `discoverable`/`isActive`-Toggle, manuelles Verifizieren ohne Dokument, Abo entsperren/resume.

**P2 — Geld & Nachvollziehbarkeit:**
4. **Rechnungs-Verwaltung** — Liste/Filter, PDF-Download, Mail-Resend, als bezahlt/unbezahlt markieren, Storno/Gutschrift.
5. **Sponsoring-Bereich** — Pledges/Charges/Events einsehen, Charge stornieren/korrigieren, Event-Approval-Streit entscheiden.
6. **Audit-Log** — append-only Tabelle `operatorAuditLog`, jede mutierende Operator-Aktion (wer/was/wann/Ziel/Diff). Pflicht für alle P1/P2-Schreibaktionen.

**P3 — Komfort / Betrieb:**
7. Stripe-Aktionen im Panel (Refund, Plan/Cycle, Trial verlängern) via Stripe-API statt Dashboard-Link.
8. Crawler-Fehler-Logs + gezielter Retry.
9. Mail: Template-Vorschau + gezielter Resend.
10. Dashboard-Drilldowns + Datums-Range.

### 3.4 Querschnitt: Audit-Log (verbindlich)

Jede Operator-Schreibaktion schreibt in `operatorAuditLog`:
`(id, operatorUserId, action, targetType, targetId, summary, diffJson, createdAt)`.
Begründung: Operator kann fremde Accounts/Geld verändern (impersonate, Stammdaten, Storno) → Nachvollziehbarkeit ist Pflicht, auch für DSGVO/Streitfälle.

---

## 4. UI/UX-Prinzipien (schlank)

- **Tabelle → Detail → Aktion.** Jeder Bereich: filterbare Liste, Detailseite, Aktionen als bestätigungspflichtige Buttons (destruktiv = rot + Confirm-Dialog, bestehendes Muster aus `club-actions.tsx`).
- **Mobile-first** bleibt nicht nötig — Operator-Panel ist Desktop-Backoffice; trotzdem responsive (bestehender Tailwind-Stil, `brand-*`-Tokens).
- **Globale Suche** (E-Mail / Vereinsname / Slug / Rechnungsnr.) als schnellster Einstieg.
- **Keine Doppel-Wahrheiten:** Schreibaktionen gehen durch den bestehenden `lib/db/queries/`-Layer + neue Operator-Queries, nie roh in Komponenten.
- **Konsistenz:** vorhandene `_actions/`-Server-Action-Konvention beibehalten.

---

## 5. Build-Reihenfolge (Vorschlag)

| Phase | Inhalt | Liefert |
|---|---|---|
| A | Auth-Umbau: Passwort-Login, `users.isPlatformAdmin`, `/admin/login`, Reset | Sicherer Operator-Login |
| B | Audit-Log-Tabelle + Helper (Querschnitt, vor allen Schreibaktionen) | Nachvollziehbarkeit |
| C | Support-Formular + Inbox (P1.1) | Tägliches Eingangsfach |
| D | User-Aktionen (P1.2) | Account-Verwaltung |
| E | Verein/Team-Editor + manuelle Verifizierung (P1.3) | Stammdaten-Pflege |
| F | Rechnungs-Verwaltung (P2.4) | Geld-Nachvollziehbarkeit |
| G | Sponsoring-Bereich (P2.5) | Charge/Event-Eingriff |
| H | P3-Komfort (Stripe-Aktionen, Crawler-Logs, Mail-Resend, Dashboard) | Betriebskomfort |

---

## 6. Offene Fragen

- **R1 — ENTSCHIEDEN:** Dedizierter Operator-Account, getrennt (siehe §3.1).
- **R2 — ENTSCHIEDEN (2026-05-29):** Kein Impersonate/Login-as. Zu sensibel ohne Extra-Plugin. Support-Reproduktion notfalls per Magic-Link an den Nutzer.
- **R3 — ENTSCHIEDEN:** Support-Antworten direkt aus dem Panel als Resend-Mail; Verlauf bleibt am Ticket (Phase C).
- **R4** (Phase H): Refunds/Plan-Änderungen — im Panel (Stripe-API) oder bewusst nur im Stripe-Dashboard belassen (weniger Risiko)?
- **R5** (Phase F): Storno/Gutschrift von Rechnungen — rechtlich: braucht es eine echte Storno-Rechnung (fortlaufende Nummer) oder reicht Status `cancelled`?
