# Trust & Payment Model — Design Spec

**Date:** 2026-05-25
**Status:** approved-for-planning
**Author:** Johannes + Claude (dialog-validated)

## 1. Problem Statement

Three structural risks in the current model collapse into one design decision:

1. **Identity fraud on Verein registration.** Today anyone can register „ASC Neuenheim" without any proof of belonging to that Verein. Without a verification gate, the platform is one screenshot away from a public-trust crisis: sponsors send money to someone impersonating their club.

2. **Locked-out real owner.** Once a Verein is claimed by an impersonator, the legitimate Verein cannot register at all — the unique constraint on `clubs.fussballdeVereinId` blocks them. Even with Phase C's „Zugriff anfragen"-flow, the impersonator is the gatekeeper.

3. **Custodial-payment liability.** If KickPact holds sponsor money (Stripe-Connect / E-Money), every fraud case becomes a KickPact problem: BaFin-territory, KYC obligations, AML compliance, money-laundering exposure. For a B2B SaaS targeting Amateur-Vereine at 9-19 €/Mon, that's an irrational risk/cost ratio.

## 2. Strategic Decision

KickPact is **not a payment processor**. It is a **pledge tracker + automated invoice generator**. Money flows direct from sponsor to Verein's IBAN; KickPact never touches it.

Identity is verified by **document upload** (Vereinsregister-Auszug or similar) reviewed by KickPact's operations team — a familiar German pattern, not a Stripe-Connect KYC waltz.

These two choices are coupled: without custody-risk, we don't need heavy KYC; the document-review layer is sufficient because the only thing we're certifying is „this person represents this Verein for the purpose of generating PDF invoices in their name." The actual money pathway is bank-to-bank, regulated by SEPA and the participants' own banks.

## 3. Goals

1. A Verein cannot be marked „verified" until KickPact has reviewed a proof-of-representation document.
2. Until verification completes, no invoice is sent to any sponsor — but pledges can be configured and matches tracked.
3. Sponsors see a clear status banner before pledging to unverified Vereine.
4. Money flows direct Sponsor → Vereins-IBAN (girocode QR on invoice for one-click banking-app payment); KickPact never holds funds.
5. If two parties claim the same Verein, an operator can resolve the conflict by comparing documents, with a clean compensation path for the losing side.
6. The model scales to ~50 verifications/week manually; the architecture leaves room for LLM-assisted pre-screening later.

## 4. Out of Scope

- **Stripe-Connect / payment custody.** Not in the architecture, period. The existing `subscriptions.stripe_customer_id` (Pricing-v2 / Phase 2) stays — that's *KickPact's own* subscription billing, totally separate from sponsor pledges.
- **Automated bank-statement matching** for marking sponsor invoices as „paid." Future iteration (CSV-import via FinTS or similar), not Phase E.
- **Dunning escalation beyond email reminders.** No collection-agency integration.
- **Sponsor identity verification.** Sponsors are private individuals or small businesses; their bank does the relevant KYC at transfer time.
- **Notary-grade verification.** Document upload + manual review is „good enough for the use case", not court-of-law standard.
- **Video-ident.** Not for this tier.

## 5. Data Model

### 5.1 New table: `club_verifications`

```ts
export const clubVerificationStatusEnum = pgEnum(
  "club_verification_status",
  ["pending", "approved", "rejected", "revoked"]
);

export const clubVerificationDocTypeEnum = pgEnum(
  "club_verification_doc_type",
  [
    "vereinsregister_auszug",    // German Vereinsregister excerpt PDF
    "vorstands_beschluss",       // Board resolution on Verein letterhead
    "vereinssatzung",            // Statutes with named officers
    "mitgliederversammlung_protokoll", // AGM minutes with election results
    "sonstiges"                  // Operator-discretion fallback
  ]
);

export const clubVerifications = pgTable(
  "club_verifications",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    docType: clubVerificationDocTypeEnum("doc_type").notNull(),
    docFilename: text("doc_filename").notNull(),
    docStorageKey: text("doc_storage_key").notNull(),
    docMimeType: text("doc_mime_type").notNull(),
    docSizeBytes: integer("doc_size_bytes").notNull(),
    submitterRole: text("submitter_role").notNull(),
    submitterFullName: text("submitter_full_name").notNull(),
    submitterNotes: text("submitter_notes"),
    status: clubVerificationStatusEnum("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    clubStatusIdx: index("club_verifications_club_status_idx").on(t.clubId, t.status),
    pendingIdx: index("club_verifications_pending_idx").on(t.submittedAt).where(sql`${t.status} = 'pending'`)
  })
);
```

### 5.2 Schema extension: `clubs`

Add a denormalized `verifiedAt` column to clubs for fast read access (avoids joining to verifications on every request that needs the status):

```ts
verifiedAt: timestamp("verified_at", { withTimezone: true }),
```

A non-null `verifiedAt` = club is currently verified. Null = not (yet) verified. Revocations clear the field. Migration is additive (zero-risk).

### 5.3 Storage

Document files live on **Hetzner Storage Box** (we already use it for other assets) under `/verifications/<club-id>/<verification-id>-<sanitized-filename>`. Access via signed URLs, time-limited (10 minutes). MIME types restricted to `application/pdf` and common image formats (JPEG, PNG, HEIC). Size cap: 10 MB.

### 5.4 Existing infrastructure that becomes the payment-flow

Already in place — no schema work needed:
- `clubs.iban` — Verein's bank account (already filled during onboarding step 3 „Stammdaten")
- `lib/invoicing/builder.tsx` — generates monthly PDF invoices
- `lib/inngest/functions/generate-invoices.ts` — monthly cron that builds + sends them
- `charges` table — tracks all pledge-triggered events with amounts

The shift in Phase E is at the *content* level (add girocode QR to PDF, gate sending on verification status), not the *schema* level.

## 6. Verification Flow

### 6.1 Onboarding-Pflicht-Step (new step 5 in the existing 4-step wizard)

Today: `/onboarding/verein/{1,2,3,4}` — Verein-Suche, Mannschaft+Plan, Stammdaten, Sponsor-Einladung.

Phase E adds: `/onboarding/verein/5-verifikation` after Stammdaten.

```
1. Verein suchen            ← unchanged
2. Mannschaft & Plan        ← unchanged
3. Stammdaten               ← unchanged (Verein-Name, Anschrift, IBAN)
4. Verifikation             ← NEW (Pflicht-Upload vor Sponsor-Einladung)
5. Sponsoren einladen       ← war Schritt 4
```

Step 4 collects:
- **Welche Rolle hast du im Verein?** (Vorstand / 2. Vorsitzender / Schatzmeister / Trainer mit Mandat / Sonstige)
- **Dein voller Name** (muss auf der Bescheinigung wiederzufinden sein)
- **Welche Art von Nachweis?** (Dropdown der `clubVerificationDocTypeEnum`-Werte)
- **PDF / Bild hochladen** (drag-and-drop, max 10MB)
- **Notiz an KickPact-Team** (optional, falls Sondersituation)

Submit → row in `club_verifications` mit `status='pending'` → Verein-Status bleibt unverifiziert → User landet auf 5. Schritt „Sponsoren einladen" mit dem Pending-Banner sichtbar in der ganzen App.

### 6.2 Re-Verification (existing Vereine)

Bestehende Clubs (Phase A-D state) sind alle nicht verifiziert. Ein migrationsbasierter Bann wäre invasiv — stattdessen: nach Deployment erscheint im Vereins-Dashboard ein Banner „Bitte verifiziere deinen Verein binnen 30 Tagen, sonst werden Rechnungen pausiert." Diese 30-Tage-Grace-Period ist ein einmaliger Übergangs-Mechanismus, kein permanenter Feature.

### 6.3 Operator-Review-Tooling

Neue Admin-only Route `/admin/verifications` (gated by `users.role = 'admin'` — neue Spalte oder ENV-based allowlist; siehe §10). Zeigt eine Tabelle aller Pending-Reviews:

- Verein-Name, Stadt
- Submitter-Name + Rolle
- Document-Filename + Download-Link (signed URL)
- Submitted-At (älteste oben)
- Buttons: **Approve** / **Reject** (mit Reason-Textarea bei Reject)

Approve-Action:
- `clubVerifications.status = 'approved'`, `reviewedAt`, `reviewedByUserId`
- `clubs.verifiedAt = now()`
- Sendet Mail an Submitter („Dein Verein ist freigeschaltet")
- Triggert eine Inngest-Function `verification.approved` die alle bisher zurückgehaltenen Rechnungen verschickt

Reject-Action:
- `clubVerifications.status = 'rejected'`, `rejectionReason` + `reviewedAt/By`
- Sendet Mail an Submitter mit Reason + Link zum erneuten Upload
- Verein bleibt unverifiziert (Banner bleibt sichtbar)

### 6.4 LLM-assisted pre-screening (Phase 2, nicht Pflicht für E)

Inngest-Function läuft beim Upload: extrahiert Text (Tesseract OCR für Bilder, pdf-parse für PDFs), prompts Claude/GPT-5 mit:

```
Bewerte ob dieses Dokument plausibel die Vertretungsberechtigung von 
{submitterFullName} ({submitterRole}) für den Verein {clubName} ({clubOrt}) belegt.
Antworte: {plausibility: 0-1, reasoning: "...", red_flags: [...]}
```

Resultat wird als Annotation im Review-Tool angezeigt („LLM-Score: 0.82 — plausibel, Name + Vereinsname matchen, Datum 03/2024"). Operator entscheidet endgültig.

Dieser Layer ist **Phase E2** (Add-on), nicht im ersten Wurf. Initial macht der Operator alles per Sicht.

## 7. Payment Flow Shift

### 7.1 Today's Status (Pricing-v2)

Charges werden erzeugt, Rechnungen werden monatlich generiert (PDF), per Mail an Sponsor verschickt. Theoretisches Modell: KickPact wäre Auszahlungs-Plattform via Stripe-Connect.

### 7.2 Target Status (Phase E)

Charges + Rechnungen bleiben unverändert. **Was sich ändert:**

1. PDF-Builder (`lib/invoicing/builder.tsx`) zeigt prominent:
   - IBAN des Vereins (aus `clubs.iban`)
   - BIC (auto-derived oder als optional column)
   - **Girocode QR-Code** (Standard EPC069-12: scanbar mit jeder deutschen Banking-App, befüllt Empfänger + IBAN + Betrag + Verwendungszweck)
   - Verwendungszweck-Format: `KP-{invoice-no}` damit Verein das Match wiederfindet
   - Hinweis: „Bitte direkt auf das oben genannte Konto überweisen. KickPact wickelt keine Zahlungen ab."

2. Mail-Begleittext zur Rechnungsmail: erweitert um Disclaimer „Direkt-Überweisung, KickPact ist Pledge-Tracker."

3. Sponsor-Dashboard: „Letzte Rechnung" zeigt Status `offen` / `bezahlt` (Verein hakt manuell ab in seinem Dashboard). Optional CSV-Import als Phase E2.

4. `generate-invoices` Inngest-Function bekommt einen neuen Gate-Check: **wenn `clubs.verifiedAt IS NULL`, Rechnung wird erzeugt aber NICHT verschickt** — sie liegt im System als „withheld". Bei späterer Verifikation werden alle withheld-Rechnungen nachträglich verschickt.

### 7.3 Code-Cleanup

Es ist sicherzustellen, dass **kein Stripe-Connect-Code** im Repo verbleibt für Sponsor-Auszahlungen. Aktueller Snapshot (Grep-verifiziert):
- `subscriptions.stripe_customer_id` — bleibt (eigenes Abo-Billing)
- Keine Stripe-Connect-Calls für Sponsor-Payouts identifiziert

Falls in zukünftiger Iteration jemand Connect-Code anlegen will, muss er begründet werden — dieses Spec definiert die default-Architektur „nicht-custodial".

## 8. UX: Status Banner und Sponsor-Side

### 8.1 Verein-Dashboard

Wenn `verifiedAt IS NULL`:

```
[gelber Banner, oben über dem Tile-Grid]
Verein wird noch verifiziert
Wir prüfen deine Bescheinigung. Bis dahin laufen Pledges, 
aber Rechnungen werden zurückgehalten.
[Status-Details ansehen →]
```

Klick → kleines Detail-Panel:
- „Hochgeladen am: …"
- „Reviewer-Status: Pending / Rejected → erneut hochladen"
- Bei Rejected: rejectionReason sichtbar + neuer Upload-CTA

Nach `verifiedAt`: Banner verschwindet, dazu im Header der Verein-Seite ein dezentes ✓-Badge neben dem Namen.

### 8.2 Sponsor-Side

Discover-Card (Sponsor sucht eine Mannschaft zum Sponsoren):
- Verifizierte Vereine: ✓-Badge sichtbar
- Unverifizierte Vereine: ein Hinweis „Nicht verifiziert — Rechnungen pausiert"
  - Sponsor kann trotzdem Pledge anlegen (Charges werden gesammelt)
  - Banner im Pledge-Setup: „Du sponsorst einen noch nicht verifizierten Verein. Wir senden dir keine Rechnung, bis KickPact die Vereinsvertretung bestätigt hat. Falls die Verifizierung scheitert, werden alle deine Charges storniert."

Pledge-Page eines unverifizierten Vereins (öffentlich über Discover oder Einladungslink):
- Gelber Banner ähnlich wie oben
- „Letzte Rechnung verschickt: noch keine"-Status

### 8.3 Email-Vorlagen (neu)

- `verification-submitted.tsx` — an Submitter: „Wir prüfen die Bescheinigung deines Vereins. Du hörst innerhalb von 1-2 Werktagen von uns."
- `verification-approved.tsx` — an Submitter: „Dein Verein ist verifiziert. Alle bisher zurückgehaltenen Rechnungen werden jetzt versandt." (+ Link ins Dashboard)
- `verification-rejected.tsx` — an Submitter: rejectionReason + Erklärung + Re-Upload-Link
- `invoice-cover-mail.tsx` — bestehend, erweitert um Disclaimer „Direkt-Überweisung an die IBAN des Vereins. KickPact wickelt keine Zahlungen ab."

## 9. Conflict Resolution (Doppelanmeldungen)

Wenn der echte Verein versucht zu registrieren und ein Impersonator ist schon drin:

1. Echter Verein nutzt Phase C's `/onboarding/zugriff-anfragen?clubSlug=…`-Flow.
2. In der Form gibt es zusätzlich ein optionales Feld „Ich bin der eigentliche Vereinsvertreter und der bestehende Account ist eine Falschanmeldung. Lade hier deine Bescheinigung hoch."
3. Beim Submit mit Bescheinigung wird die Anfrage als **Conflict-Claim** markiert und landet in einer separaten Review-Queue für Operatoren (`/admin/conflicts`).
4. Operator vergleicht beide Bescheinigungen:
   - Impersonator hat keine Bescheinigung hochgeladen oder schwächere → echter Verein gewinnt
   - Account-Übergabe: bestehende `clubs`-Row bleibt, `clubMemberships` wird umgehängt, alte Admin-Memberships werden entfernt
   - Falls schon Charges entstanden sind: alle vom Loser-Konto angeworbenen Pledges werden storniert + Sponsor-Mail mit Erklärung
   - Reputation-Banner für Sponsoren: „Diese Charges wurden storniert wegen Vereinsidentitäts-Verifizierung"
5. Loser-Account: vollständig gesperrt + Mail mit Begründung

Wichtig: Operator-Diskretion. KickPact dokumentiert Grundsätze („stärkere Beweisbasis gewinnt"), entscheidet aber im Einzelfall. Streit eskaliert an den Anwalt, nicht an einen automatischen Algorithmus.

## 10. Admin-Rolle (neu)

Eine kleine Erweiterung: `users.isPlatformAdmin: boolean default false`. Nur Platform-Admins sehen `/admin/verifications` und `/admin/conflicts`.

Alternative für MVP: ENV-Variable `KICKPACT_ADMIN_EMAILS=johannes@kickpact.de,...` und Server-Side-Check `if (!adminEmails.includes(session.user.email)) redirect("/dashboard")`. Schnell, ohne Schema-Change. Für Phase E starte mit ENV-basiert, Migration auf DB-Spalte bei Bedarf.

## 11. Implementation Phasing

Decompose into three focused plans, each producing working software on its own:

| Phase | Title | Touches | Estimated commits |
|---|---|---|---|
| **E1** | Schema, storage, upload-form, withhold-gate | `club_verifications` table + `clubs.verifiedAt`, Storage-Box-integration, new onboarding step 4, withhold-logic in invoice-generator | 6-8 |
| **E2** | Admin-tooling + email templates + sponsor banners | `/admin/verifications` page, approve/reject actions, 3 mail templates, banner-components + integration in Verein-/Sponsor-Pages, conflict-claim-extension in `zugriff-anfragen` | 5-7 |
| **E3** | PDF girocode + invoice-mail wording + sponsor-side payment UI | `lib/invoicing/builder.tsx` extension (girocode QR), invoice-cover-mail update, Sponsor-Dashboard „Status: offen/bezahlt"-Spalte, Verein-side „Rechnung bezahlt"-Toggle | 4-6 |

E1 must come first. E2 and E3 are independent but E3 is most user-visible (Sponsoren sehen die geänderten Rechnungen direkt).

### Existing Vereine — Übergang

Migration `0015_…_verifiedAt_grace` setzt für alle bestehenden Vereine `verifiedAt = now() + interval '30 days'` als „Grace-Token" mit `metadata.requiresReverification = true` (oder ähnlich). Banner „Bitte verifiziere binnen 30 Tagen" wird angezeigt. Nach 30 Tagen ohne Submission: `verifiedAt = null`, Rechnungen werden zurückgehalten.

Alternative simpler: alle bestehenden Vereine `verifiedAt = NULL`, Banner zeigt „Verifizierung steht aus" sofort. Operator kann manuell genehmigen falls bekannt (Beispiel: Dossenheim — wir wissen Johannes ist Vereinsvertreter). Wahrscheinlich besser, weil keine Magic-Number wie „30 Tage" in der Migration steht.

## 12. Risk & Open Questions

- **Storage-Bescheinigungen sind personenbezogene Daten.** Verschlüsselung-at-rest auf Storage Box (oder S3-compatible mit Server-Side-Encryption). Lösch-Mechanismus: bei `verifications.status = 'rejected'` Datei nach 90 Tagen automatisch löschen (Aufbewahrungspflicht für Streit-Fälle). Bei Approval: Aufbewahrungspflicht für die Dauer der Geschäftsbeziehung + 10 Jahre (HGB / AO). In DSE-Page erwähnen.
- **Was wenn alle Operator-Reviewer im Urlaub sind?** Bei mehr als 5 Werktagen Pending-Reviews automatische Email-Eskalation an `escalation@kickpact.de`. Banner-Wording im Verein-Dashboard wird vorsichtiger („Verifizierung verzögert sich, danke für deine Geduld").
- **LLM-Halluzinationen bei Pre-Screening.** E2-Layer ist nur Empfehlung, niemals automatisch entscheidend. Operator-Sign-Off ist immer notwendig. Bei systematischen Fehleinschätzungen wird der Pre-Screen deaktiviert.
- **Was wenn Submitter den Verein WIRKLICH vertritt, aber das Dokument nicht passt?** (Beispiel: kleiner Amateur-Verein ohne Vereinsregister-Eintrag, nur eine WhatsApp-Gruppe). Reject mit Reason → User kann erneut hochladen. Letzter Fallback: KickPact-Operator ruft den Vereinsvorstand direkt an (telefonisch verifiziert) und schaltet manuell frei. Selten genug dass es ohne System-Support funktioniert.
- **DSGVO bei Doc-Inhalten.** Vereinsregister-Auszüge enthalten Klar-Namen + Anschrift der Vorstandsmitglieder. Müssen wie Bewerbungsunterlagen behandelt werden: Zugriff nur Reviewer-Team, Audit-Log auf jeder Ansicht, Löschung bei Vertragsende.
- **Sponsor-Vertrauen ohne Verifizierungs-Badge.** Ein Sponsor der einen unverifizierten Verein sponsert kann trotzdem Pledges anlegen — Charges sammeln aber keine Rechnung. Was wenn der echte Verein nie nachregistriert? Charges bleiben in Limbo. Lösung: nach 90 Tagen ohne Verifizierung automatische Pledge-Pause + Sponsor-Mail „Verein war nie verifiziert, Pledges storniert, kein Geld floss." Sponsor-Vertrauen bleibt intakt.

## 13. Success Criteria

After all three sub-phases ship:

1. ✅ Onboarding hat 5 Schritte; Schritt 4 ist Bescheinigungs-Upload und Pflicht.
2. ✅ Verein mit `verifiedAt = NULL` triggert in `generate-invoices` keinen Mail-Versand; Rechnungen werden „withheld" geschrieben.
3. ✅ Operator-Page `/admin/verifications` zeigt Pending-Queue mit Download-Links und Approve/Reject-Buttons.
4. ✅ Approve setzt `clubs.verifiedAt = now()`, triggert Versand aller withheld-Rechnungen, schickt Bestätigungs-Mail.
5. ✅ Reject schreibt `rejectionReason`, schickt Mail mit Re-Upload-Link.
6. ✅ Conflict-Claim in `/onboarding/zugriff-anfragen` mit Bescheinigungs-Upload erscheint in `/admin/conflicts` und führt zu Account-Übernahme bei Operator-Approve.
7. ✅ Rechnungs-PDF zeigt IBAN + girocode-QR + Disclaimer „KickPact wickelt keine Zahlungen ab".
8. ✅ Sponsor-Page eines unverifizierten Vereins zeigt gelben Banner.
9. ✅ DSE-Page erweitert um Verarbeitung von Verifizierungs-Dokumenten + Aufbewahrungsfristen.

## 14. Telemetry

Track-Events (in bestehender `lib/analytics/track`-Infrastruktur):
- `verification_submitted` mit `{ clubId, docType, fileSize, role }`
- `verification_approved` mit `{ clubId, hoursSinceSubmit }`
- `verification_rejected` mit `{ clubId, hoursSinceSubmit, reason }`
- `verification_conflict_resolved` mit `{ winnerSide, hoursToResolve }`

Dashboards für Operator: Pending-Count, Median-Time-to-Approve, Reject-Rate.
