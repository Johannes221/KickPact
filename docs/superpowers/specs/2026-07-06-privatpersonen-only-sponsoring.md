# KickPact — Privatpersonen-only Sponsoring

**Date:** 2026-07-06
**Status:** approved-for-implementation
**Author:** Johannes + Claude
**Ergänzt:** `2026-05-26-v1-final-scope-consolidation.md` (§1.1 Sponsor-Modell), `2026-06-15-pricing-rework-design.md`
**Ersetzt:** den Business-Sponsor-Pfad aus allen früheren Specs.

---

## 0. Kern-Entscheidung

**KickPact spricht ab sofort ausschließlich Privatpersonen als Sponsoren an.**
Papa, Mama, Oma, Opa, Onkel, Tante, Geschwister, Freunde, Fans, Stammtisch, Nachbarn — Menschen aus dem Umfeld der Mannschaft, die aus Begeisterung geben. **Keine Unternehmen, keine Firmen, keine Werbeleistung, kein B2B.** Das zieht sich durch die komplette Website, App, das Onboarding und alle Dokumente.

**Was bewusst bleibt:** die Postvorlagen-/Share-Bild-Generierung (Saison-Recap, Wrapped, Spiel-Ergebnisse). Vereine posten ihre Spiele mit KickPact-Logo → das ist unser Marketing-Kanal (Instagram-Story → Klick → KickPact). Das ist Eigenwerbung der Plattform, keine Gegenleistung an Sponsoren (steuerlich unbedenklich, siehe §3).

**Motivation** (verlängert die Positionierungs-Philosophie „Gaudi/Community, kein Hardcore-Business"):
1. Emotionales, klares Produkt: „Deine Leute fiebern mit" statt Sponsoring-Akquise-Tool.
2. Steuerlich radikal einfacher für Vereine (siehe §3) — echtes Verkaufsargument.
3. Ein Onboarding-Pfad weniger, weniger Formularfelder, weniger Rechts-Risiko.

**Datenlage:** In der Produktions-DB existieren **0** Business-Sponsoren (Stand 2026-07-06, nur 3× `familie`). → Sauberer Schnitt ohne Migration/Grandfathering.

---

## 1. Ziel-Messaging

**Personas (rein):** Vater, Mutter, Oma, Opa, Onkel, Tante, Freunde, Fans, Stammtisch, Nachbarn, Ex-Spieler.
**Raus (nie wieder in Copy):** „Unternehmen", „Firma/Firmen", „lokale Betriebe/Händler", „der Bäcker/Wirt um die Ecke" (signalisiert Gewerbe), „Werbeleistung", „steuerlich absetzbar als Werbeleistung", „USt-ID des Sponsors", „B2B", Firmen-Testimonials („Bäckerei Müller GmbH").

**Ton:** persönlich, emotional, Community. Der Sponsor ist Fan mit Herz, nicht Geschäftspartner. Beispiel-Ersetzungen:
- „Familie, Freunde und lokale Sponsoren" → „Familie, Freunde und echte Fans"
- „Familie, Stammtisch + lokale Firmen" → „Familie, Freunde, Stammtisch + Fans"
- Story-Card „Bäckerei Müller · Business" → private Persona (z.B. „Stefan · Onkel & Edelfan")
- Nutzenversprechen „steuerlich absetzbar als Werbeleistung" → ersatzlos streichen (Steuer-Framing nur noch gemäß §3, nie als pauschales Versprechen)

---

## 2. Was rausgeht (vollständiges Inventar)

### 2.1 Onboarding & Formulare
- `app/(sponsor)/sponsor/onboarding/_components/sponsor-type-form.tsx`: Typ-Wahl („Familie/Freund" vs. „🏢 Unternehmen") **entfällt komplett** — kein Auswahl-Step mehr, direkt der persönliche Pfad (Name, Rolle, Beschreibung). Business-Felder-Sektion (Firmenname, Rechnungsadresse, USt-ID) **löschen**.
- `app/(sponsor)/sponsor/onboarding/page.tsx:39`: „Bist du Familie/Freund oder Unternehmen?" → neue Copy ohne Typ-Frage.
- `app/(sponsor)/sponsor/profil/_components/sponsor-profile-form.tsx`: `BusinessForm`-Komponente + `businessSchema` **löschen**; immer `FamilieForm`.
- `app/(sponsor)/sponsor/profil/page.tsx`: Business-Konditionale raus.

### 2.2 Backend / Validierung / Actions
- `lib/validations/sponsor.ts`: `sponsorBusinessSchema` löschen; `sponsorOnboardingSchema` = nur noch familie-Shape (`type` als Literal `"familie"` oder ganz raus aus dem Input).
- `lib/actions/sponsor-profile.ts`: `updateBusinessSchema` + Business-Branch löschen; Business-Felder werden immer genullt.
- `app/(sponsor)/sponsor/onboarding/_actions/create-sponsor.ts`: Ternaries raus, `type: "familie"` hart, Business-Felder `null`.
- Neuer Helper `normalizeSponsorType(raw): "familie"` (Muster: `normalizeBillingCycle` für den inerten `annual`-Wert) — defensives Lesen, falls je ein Alt-Wert auftaucht.

### 2.3 Schema (bewusst NICHT destruktiv)
- `sponsorTypeEnum ["familie","business"]` **bleibt inert bestehen** (Postgres kann Enum-Werte nicht gefahrlos droppen — etabliertes `annual`-Muster in `lib/db/schema/billing.ts`). Kommentar im Schema dokumentiert die Stilllegung.
- Spalten `businessName`, `businessAddressJson`, `businessTaxId` bleiben nullable stehen (kein Drop, keine Migration nötig — 0 Bestandsdaten); kein Code schreibt sie mehr. Cleanup-Drop optional in einer späteren Sammel-Migration.

### 2.4 PDF / Rechnungslauf
- `lib/invoicing/builder.tsx:204-221`: Business-Adressblock (Firmenname, Adresse, „z. Hd.") **löschen** — immer `displayName`.
- `lib/inngest/functions/invoice-run-core.ts` + `lib/invoicing/storno.ts`: businessAddress-Extraktion raus, Sponsor-Objekt fest `type: "familie"`, Business-Felder `null`.
- Dokument-Titel: siehe §4 (Reframing).

### 2.5 UI-Anzeigen (Verein-Seite)
- `app/(verein)/verein/[slug]/sponsor/[sponsorId]/page.tsx:80-81`: Typ-Badge + businessName-Anzeige raus.
- `app/(verein)/verein/[slug]/sponsoren/page.tsx:96`: rohes `{s.type}` nicht mehr anzeigen (stattdessen Rolle/Beschreibung, z.B. „Onkel von Tim").
- `lib/db/queries/club-reporting.ts` / `invoices.ts`: `businessName`/`sponsorType`-Felder aus Selects/Interfaces entfernen (oder ungenutzt lassen — Entscheidung beim Umsetzen, kleinster Diff gewinnt).

### 2.6 Marketing-Copy (Landing, Preise, Wizard)
- `app/page.tsx`: Metadata (37), OG (48), Hero (123), Story-Card „Bäckerei Müller" (193-195), Benefits (265, 278), FAQ „steuerlich absetzbar?" (489) — alles auf Privat-Framing (§1).
- `app/_components/roles-tabs.tsx` (50, 108-110): „lokale Firmen"-Nennungen + kompletter „Als Unternehmen: …"-Bullet raus.
- `app/willkommen/_components/intro-wizard.tsx:156`: „& lokale Firmen" → „& Fans".
- `app/(marketing)/preise/page.tsx` FAQ „Was ist mit der Umsatzsteuer?": Antwort kürzen auf die Lizenz-USt (Verein→KickPact); der Satz „gewerbliche Sponsoren können die USt geltend machen" **entfällt**.
- `app/(verein)/verein/[slug]/page.tsx:183`: „der Wirt um die Ecke" → private Personas.

### 2.7 Tests & Seeds
- `tests/queries/club-reporting.test.ts`, `tests/queries/sponsor-reporting.test.ts`, `tests/lib/user-identities.test.ts`, `scripts/seed-real-dossenheim.ts`: `type: "business"`-Fixtures → `familie`, businessName-Felder raus. Neue Tests: Onboarding-Action erzwingt familie; Validation weist business-Input ab.

### 2.8 Bleibt unangetastet
- **Postvorlagen/Share-Bilder**: Saison-Recap (`…/recap`), Wrapped (`…/wrapped` + `wrapped-image`), Share-Routen — Marketing-Kanal, kein Business-Bezug.
- `sponsor_leads` (öffentliche „Sponsor werden"-Anfragen über Team-Profile): ist bereits typ-frei/B2C.
- Sponsor-`billingCycle` (monthly/season_end): bleibt — betrifft nur den Abrechnungs-Rhythmus des Dokuments.
- Vereins-Stammdaten (USt-ID/Kleinunternehmer des VEREINS): bleiben — betrifft die Lizenz-Beziehung Verein↔KickPact, nicht die Sponsoren.

---

## 3. Steuerliche Grundlage (Recherche 2026-07, Kurzfassung)

> **Disclaimer:** Rechercheergebnis, keine Steuerberatung. Finale Dokument-Formulierungen vor Live-Gang einmal von einem Gemeinnützigkeits-Steuerberater absegnen lassen.

1. **„5 €/Tor" von Privatpersonen ist eine echte Spende.** Freiwilligkeit bleibt erhalten, wenn die Zahlung eine freiwillig eingegangene Zusage erfüllt (BFH X R 6/17); die Event-Kopplung ist nur Bemessungsanlass, keine Gegenleistung (vgl. Spendenläufe, BMF-Crowdfunding-Schreiben 15.12.2017). Zweckbindung unschädlich (BFH X R 37/19).
2. **Vereinsseite:** Ohne Gegenleistung landen die Beiträge beim gemeinnützigen e.V. im **ideellen Bereich** → keine KSt/GewSt, **keine USt** (kein Leistungsaustausch), keine Sphären-/Freigrenzen-Überwachung wegen KickPact. Das bisherige Business-Sponsoring war dagegen Werbeleistung (wirtschaftlicher Geschäftsbetrieb, 19 % USt). **Antwort auf die Gründerfrage: Ja — die Steuer entsteht bei Privat-only gar nicht erst.**
3. **Sponsorenseite:** Beiträge können als Sonderausgabe absetzbar sein (§10b EStG, bis 20 % der Einkünfte) — **nur wenn der Verein gemeinnützig ist**. Bis **300 € je Zahlung** genügt der vereinfachte Nachweis (Kontoauszug + Vereins-Beleg mit Zweck/Freistellungsangaben, §50 Abs. 4 EStDV). Zuwendungsbestätigungen stellt immer der **Verein** aus (Ausstellerhaftung 30 %, §10b Abs. 4 EStG) — die Plattform darf nur vorbereiten. **Nie pauschal „absetzbar" claimen** (nicht-gemeinnützige Klubs, Mitgliedsbeiträge-Falle).
4. **Dokumenten-Konsequenz:** Ein Dokument namens **„Rechnung" ist das falsche Framing** (Indiz für Leistungsaustausch; USt-Ausweis ohne Leistung → §14c UStG-Risiko). → §4.
5. **Gegenleistungs-Leitplanke:** Schlichter Dank ok (Danke-Post, Badge). **Keine** werbliche Hervorhebung einzelner Sponsoren (Logo, Link, „Top-Sponsor"-Werbeposts), keine Sachprämien — das würde den Spendenstatus kippen. Die Share-Bilder der VEREINE (Spielergebnis + KickPact-Logo) sind davon unberührt: Eigenwerbung der Plattform, keine Sponsor-Gegenleistung.
6. **Bonus fürs Marketing:** Seit 1.1.2026 (StÄndG 2025) höhere Vereins-Freigrenzen (wGB 50k, Mittelverwendung 100k) — und KickPact-Privatspenden belasten **keine** davon.

---

## 4. Dokumenten-Reframing: „Rechnung" → „Zahlungsübersicht"

**Phase 1 (mit diesem Umbau):**
- Sponsor-gerichtetes Monats-/Saison-PDF heißt **„Zahlungsübersicht"** (Titel + Mail-Betreff + UI-Labels sponsorseitig). Sprache: „Dein zugesagter Unterstützungsbeitrag für [Monat]".
- **Kein USt-Ausweis, kein Netto/Brutto** auf sponsor-gerichteten Dokumenten (falls aktuell vorhanden → raus).
- Interne `invoices`-Tabelle/IDs bleiben unangetastet (reines Anzeige-/Wording-Thema, kleinster Diff).

**Phase 2 (separater Plan, NICHT in diesem Sweep):**
- `clubs.charitableStatus`-Flag (Selbstauskunft + optional BZSt-Zuwendungsempfängerregister-Abgleich) + Felder Freistellungsbescheid/Finanzamt.
- Bei verifizierter Gemeinnützigkeit: „Spendenübersicht"-Variante mit dem Textbaustein für den vereinfachten Nachweis (≤300 €); später vorbereitete Jahres-Zuwendungsbestätigung (Aussteller: Verein).
- Disclaimer-Texte Sponsor/Verein gemäß §3.

---

## 5. Entscheidungen

| # | Entscheidung | Festlegung |
|---|---|---|
| E1 | Business-Enum + Spalten | bleiben inert (kein Drop), Code schreibt nur noch `familie` — `annual`-Muster |
| E2 | Bestandsdaten | keine vorhanden (0 business) → kein Grandfathering |
| E3 | Typ-Auswahl-Step im Onboarding | entfällt komplett (nicht nur ausblenden) |
| E4 | „Rechnung"-Reframing sponsorseitig | Phase 1: Umbenennung + USt-frei (siehe §4) — *Zustimmung Johannes eingeholt, siehe Chat* |
| E5 | Spenden-Features (Gemeinnützigkeits-Flag, Nachweis-Baustein) | Phase 2, separater Plan |
| E6 | Postvorlagen/Share-Bilder | bleiben unverändert (Marketing-Kanal) |
| E7 | Sponsor-Steuer-Kommunikation | nie pauschal „absetzbar"; neutraler Hinweis erst mit Phase 2 |

---

## 6. Erfolgskriterien (verifizierbar)

1. `rg -i "unternehmen|firma|business|gewerb|werbeleistung"` über `app/ components/ lib/` liefert **keine sponsor-gerichtete Copy mehr** (Treffer nur noch: inertes Schema/Kommentare, Vereins-Stammdaten, technische Begriffe).
2. Sponsor-Onboarding hat keinen Typ-Step; `create-sponsor` schreibt hart `familie`; Business-Input wird von der Validation abgewiesen (Test).
3. Sponsor-PDF rendert nie Business-Felder; Titel „Zahlungsübersicht" (Test auf builder).
4. Landing/Preise/Willkommen zeigen ausschließlich Privat-Personas (Browser-Verifikation Staging).
5. Share-/Recap-/Wrapped-Routen unverändert (Snapshot der bestehenden Tests grün).
6. `tsc` + Vitest + Build grün; Deploy auf Staging verifiziert.
