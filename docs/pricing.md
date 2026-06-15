# KickPact Pricing

**Stand:** 2026-06-15 · Pricing-Rework (Spec `docs/superpowers/specs/2026-06-15-pricing-rework-design.md`) · Source of Truth für `lib/stripe/pricing.ts`, Onboarding-Wizard, `/preise`-Page, Spec §6.8 + §8.4
> **Update 2026-06-15:** Preise gesenkt — Pro 19 → **11 €**, Verein 49 → **29 €**, Saison-Pass auf **~3 Monate gratis** (−42 % vs 12× Monat). Struktur, 0 %-Provision und 30-Tage-Trial unverändert. Vereinslizenz lohnt sich ab **3 Mannschaften**.
> **Update 2026-06-02:** Der „Annual"-Cycle (12-Monats-Lizenz) wurde komplett entfernt — nur noch **Monatlich + Saison-Pass**. Saison-Pass IST die Jahres-Bindung für den Fußball-Rhythmus.

> Rationale, Recherche und verworfene Konzepte: siehe [docs/strategy/2026-05-22-pricing-strategy.md](strategy/2026-05-22-pricing-strategy.md).

---

## 1. Übersicht

| | **Basic** | **Pro** ⭐ | **Vereinslizenz** |
|---|---|---|---|
| **Zielgruppe** | 1 Mannschaft, 1–5 Sponsoren aus dem direkten Umfeld | 1 Mannschaft, ernsthaftes Sponsoring, ∞ Sponsoren | Verein mit ≥ 3 Mannschaften, zentrale Verwaltung |
| **Monatspreis** | **5 €**/Mannschaft/Monat | **11 €**/Mannschaft/Monat | **29 €**/Verein/Monat |
| **Saison-Pass** *(Aug–Mai, 3 Monate geschenkt)* | **35 €**/Saison · ≈ 3,50 €/Mon | **75 €**/Saison · ≈ 7,50 €/Mon | **199 €**/Saison · ≈ 19,90 €/Mon |
| **Provision auf Pledges** | **0 %** | **0 %** | **0 %** |
| **Trial** | 30 Tage | 30 Tage | 30 Tage |
| **Pro Spieler/Monat** *(typischer Kader)* | ~0,23 €/Spieler (22 Mann) | **< 1 €/Spieler** (22 Mann) | **< 1 €/Spieler** (50 Mann) · 0,15 € bei 200 Spielern |

**Headline-Versprechen:** *100 % der Einnahmen gehen an euch. KickPact stellt die Plattform — Tracking, PDFs, Sponsor-Inbox — und finanziert sich rein über Lizenzgebühren.*

**Default-Empfehlung im Wizard:** Saison-Pass (Aug–Mai). Monatsabo nach 5. Spieltag der laufenden Saison.

---

## 2. Basic — 5 €/Mannschaft/Monat

> **Zum Reinkommen.** Für Trainer, die mit 1–3 Sponsoren aus der Familie ehrlich testen wollen, ob's was bringt.

### Pricing
- **Monatlich:** 5 €/Mannschaft
- **Saison-Pass (Aug–Mai):** 35 €/Saison · ~3 Monate geschenkt · Juni/Juli automatisch kostenlos pausiert
- **0 % Provision** auf bestätigte Pledges

### Was ist drin
- ✅ Alle **Auto-Trigger** (10 Typen): Tor, Sieg, Unentschieden, Niederlage, Clean Sheet, Comeback, Hattrick, Tordifferenz, Gesamttore, Spieler-Tor
- ✅ Alle **Manual-Trigger** aus dem Katalog: Spezial-Tor (Kopfball, Hackentor, Volley, Fernschuss, Elfmeter, Freistoß), gelbe Karte, rote Karte, Assist, Spieler des Spiels
- ✅ Fußball.de-Crawler alle 6h
- ✅ Sponsor-Approval-Flow (Bestätigen / Bestreiten)
- ✅ Monatliche PDF-Rechnung (mit KickPact-Footer)
- ✅ Sponsor-Einladungslinks
- ✅ Sponsor-Dashboard mit Pledge-Historie
- ✅ Reminder-Mails (manuelle Events, monatliche Rechnung)
- ✅ Match-Historie der aktuellen Saison

### Limits (das ist die Härte)
| Limit | Wert |
|---|---|
| Max aktive Sponsoren | **5** pro Mannschaft |
| Max Pledge-Rules pro Sponsor | **3** |
| Match-Historie | nur aktuelle Saison |
| User-Rollen | 1 Admin |

### Was fehlt (= Pro-Push)
- ❌ Saison-Wetten (Aufstieg, Klassenerhalt, Pokalrunde, Meister, Tabellenplatz)
- ❌ Custom-Trigger-Texte ("Bizeps-Tor von Mehmet")
- ❌ Vereins-Logo auf PDF, kein Vereins-Mail-Absender
- ❌ CSV/Excel-Export
- ❌ Sponsor-Stats-Widgets, Sponsor-Newsletter
- ❌ Embed-Widget für Vereinswebsite
- ❌ Pledge-Discovery (öffentliches Mannschafts-Profil)
- ❌ Saison-Recap-PDF

### Marketing-Hook
> *„Schau ob's was bringt. 5 € im Monat, kein Risiko. Wenn dein Sponsoring wächst, wechsel zu Pro."*

---

## 3. Pro — 11 €/Mannschaft/Monat ⭐

> **Beliebteste.** Für aktive Sponsoring-Setups mit ≥ 5 Sponsoren. Hier sollen 80 % der Vereine landen.
>
> **Bei 22-Mann-Kader: unter 1 € pro Spieler/Monat.**

### Pricing
- **Monatlich:** 11 €/Mannschaft · bei 22-Mann-Kader **0,50 € pro Spieler/Monat**
- **Saison-Pass (Aug–Mai):** **75 €**/Saison · effektiv 7,50 €/Mon · 42 % sparen (vs 12× Monat) · Juni/Juli kostenlos pausiert · **0,34 € pro Spieler/Monat**
- **0 % Provision** auf bestätigte Pledges

### Was ist drin
**Alles aus Basic, plus:**

| Kategorie | Pro-Add-On |
|---|---|
| **Trigger-Tiefe** | + **Saison-Wetten** (6 Typen: Aufstieg, Klassenerhalt, Tabellenplatz-Range, Meister, Pokalrunde, Custom-Saison-Ziel) |
| | + **Custom-Trigger** mit eigenen Texten ("Bizeps-Tor von Schmidt", "Eckball-Tor", etc.) |
| **Branding** | + **Vereins-Logo** auf PDF-Rechnung, kein KickPact-Footer |
| | + **Vereins-Identität** als Mail-Absender (Reply-To = Verein, optisch wirkt's wie eine Vereins-Mail) |
| **Sponsoring-Akquise** | + **Pledge-Discovery**: Mannschaft erscheint öffentlich in `/sponsor/discover` |
| | + **Embed-Widget** für Vereinswebsite („5 € pro Tor — jetzt mitmachen") |
| | + **Auto-Sponsor-Newsletter** (monatlich, automatisch generierter Recap mit Top-Events) |
| **Analytics** | + **Sponsor-Stats-Widgets** (Leaderboards, Spieler-Stats, Trigger-Häufigkeit) |
| | + **CSV/Excel-Export** aller Pledges, Charges, Invoices |
| | + **Saison-Recap-PDF** am Ende der Saison (Top-Sponsor, Total gesammelt, Top-Events) |
| **Caps** | **∞** Sponsoren, **∞** Pledge-Rules pro Sponsor, **vollständige** Match-Historie über alle Saisons |
| **User-Rollen** | + Trainer-Rolle, + Viewer-Rolle |
| **Support** | Email, 24 h Antwortzeit |

### Marketing-Hook
> *„Sponsoring, das mitfiebert. Saison-Wetten, eigene Trigger, dein Vereins-Logo auf der Rechnung, 100 % bleibt bei dir."*

---

## 4. Vereinslizenz — 29 €/Verein/Monat

> **Für den ganzen Verein.** Eine Lizenz, unbegrenzt Mannschaften, alles inklusive.
>
> **Unter 1 € pro Spieler ab 50-Mann-Verein · ab 0,15 €/Spieler bei großen Vereinen.**

### Pricing
- **Monatlich:** 29 €/Verein · bei 50 Spielern **0,58 € pro Spieler/Monat**
- **Saison-Pass (Aug–Mai):** **199 €**/Saison · effektiv 19,90 €/Mon · 42 % sparen (vs 12× Monat) · Juni/Juli kostenlos pausiert · **0,40 € pro Spieler/Monat** (50 Spieler)
- **0 % Provision**

### Was ist drin
**Alles aus Pro, plus:**

| Kategorie | Vereinslizenz-Add-On |
|---|---|
| **Skalierung** | **Unbegrenzte Mannschaften** unter einer Lizenz (Senioren, Junioren A–E, Damen, Veteranen…) |
| **Verein-Verwaltung** | **Master-Admin-Cockpit** unter `/verein/[slug]/admin` mit Übersicht aller Mannschaften, Pledges, Rechnungen |
| | **Konsolidierte Monats-Rechnung** — ein PDF für alle Mannschaften pro Sponsor, statt eine Rechnung pro Team |
| | **Cross-Team-Sponsor-View** — sehen, welcher Sponsor welche Mannschaften unterstützt (häufig: Onkel sponsert U13 + Senioren) |
| | **Vereins-aggregiertes Saison-Recap-PDF** (für Jahresbericht, Vorstand) |
| **User-Verwaltung** | Bis zu **10 Admins** Vereins-weit (1 pro Mannschaft + Vorstand) |
| **Branding** | **Custom-Domain** (v2): `sponsor.fc-musterstadt.de` redirected auf KickPact |
| **Support** | Email + WhatsApp, 4 h Antwortzeit |

### Per-Player-Pricing
| Verein-Größe | €/Spieler/Monat (Lizenz 29 €) |
|---|---|
| 30 Spieler | 0,97 € *„unter 1 € pro Spieler"* |
| 50 Spieler | 0,58 € |
| 100 Spieler | 0,29 € |
| 200 Spieler | 0,15 € |

### Wann lohnt sich Vereinslizenz gegenüber n × Pro?
| Mannschaften | Pro × n (Monat) | Vereinslizenz (Monat) | Ersparnis |
|---|---|---|---|
| 2 | 22 €/Mon | 29 €/Mon | -7 € (Pro besser) |
| **3** | 33 €/Mon | **29 €/Mon** | **+4 €/Mon** ⭐ Break-Even |
| 4 | 44 €/Mon | 29 €/Mon | +15 €/Mon |
| 6 | 66 €/Mon | 29 €/Mon | +37 €/Mon |
| 10 | 110 €/Mon | 29 €/Mon | +81 €/Mon |

### Saison-Pass-Vergleich
| Mannschaften | Pro-Pass × n | Vereinslizenz-Pass | Ersparnis |
|---|---|---|---|
| 2 | 150 € | 199 € | -49 € (Pro besser) |
| **3** | 225 € | **199 €** | **+26 €** ⭐ Break-Even |
| 4 | 300 € | 199 € | +101 € |
| 6 | 450 € | 199 € | +251 € |
| 10 | 750 € | 199 € | +551 € |

→ Ab **3 Mannschaften** mathematisch günstiger als Pro × n, plus Master-Cockpit-Vorteile.

### Marketing-Hook
> *„Der ganze Verein. Ein Tarif. Unter 1 € pro Spieler."*

---

## 5. Komplette Featurematrix

| Feature | Basic | Pro | Vereinslizenz |
|---|---|---|---|
| **Pricing** | | | |
| Monatspreis | 5 € | 11 € | 29 € |
| Saison-Pass | **35 €** | **75 €** | **199 €** |
| Provision | 0 % | 0 % | 0 % |
| Trial | 30 Tage | 30 Tage | 30 Tage |
| **Trigger** | | | |
| Auto-Trigger (10 Typen) | ✅ | ✅ | ✅ |
| Manual-Trigger Katalog | ✅ | ✅ | ✅ |
| Saison-Wetten (6 Typen) | ❌ | ✅ | ✅ |
| Custom-Trigger-Texte | ❌ | ✅ | ✅ |
| **Caps** | | | |
| Sponsoren pro Mannschaft | max 5 | ∞ | ∞ |
| Pledge-Rules pro Sponsor | max 3 | ∞ | ∞ |
| Mannschaften | 1 pro Lizenz | 1 pro Lizenz | **∞** |
| Match-Historie | aktuelle Saison | ∞ | ∞ |
| User-Rollen | 1 Admin | + Trainer + Viewer | + Multi-Admin (10) |
| **Branding** | | | |
| PDF-Footer | KickPact | **Vereins-Logo** | Vereins-Logo + Sammel-PDF |
| Mail-Absender | KickPact | **Vereins-Identität** | Vereins-Identität |
| Custom-Domain (v2) | ❌ | ❌ | ✅ |
| **Akquise & Marketing** | | | |
| Sponsor-Einladungslinks | ✅ | ✅ | ✅ |
| Pledge-Discovery (öffentl. Profil) | ❌ | ✅ | ✅ |
| Embed-Widget Vereinswebsite | ❌ | ✅ | ✅ |
| Auto-Sponsor-Newsletter | ❌ | ✅ | ✅ |
| **Analytics & Reports** | | | |
| Sponsor-Stats-Widgets | ❌ | ✅ | ✅ |
| CSV/Excel-Export | ❌ | ✅ | ✅ |
| Saison-Recap-PDF (Mannschaft) | ❌ | ✅ | ✅ |
| Saison-Recap-PDF (Verein-aggregiert) | ❌ | ❌ | ✅ |
| **Verein-Verwaltung** | | | |
| Master-Admin-Cockpit | ❌ | ❌ | ✅ |
| Konsolidierte Monats-Rechnung | ❌ | ❌ | ✅ |
| Cross-Team-Sponsor-View | ❌ | ❌ | ✅ |
| **Support & Onboarding** | | | |
| Support-Kanal | Email | Email | Email + WhatsApp |
| SLA | 48 h | 24 h | 4 h |
| Self-Service Help-Center & Doku | ✅ | ✅ | ✅ |

---

## 6. Saison-Pass — wie es funktioniert

### Mechanik
- **Aktive Saison:** 1. August – 31. Mai (10 Monate). Definition pro Liga/Region in `seasons`-Tabelle, default-befüllt aus DFB-Spieljahr.
- **Preis:** ~ 7 × Monatspreis (= **3 Monate geschenkt**, ~30 % vs. 10× Monatspreis · −42 % vs. 12× Monat)
- **Sommerpause:** 1. Juni – 31. Juli automatisch `paused` → kein Crawler, keine Charges, Daten bleiben sichtbar, **kein €** wird abgebucht
- **Renewal:** zum 1. August automatisch verlängert (Stripe-Subscription `billing_cycle_anchor = next_aug_1`). Vorab-Kündigungsrecht 30 Tage (= bis 1.7.)
- **Winterpause:** Mitte Dez – Anfang Feb. **Keine** Subscription-Pause — App läuft weiter, nur der Crawler findet 4-6 Wochen keine neuen Matches. Tabelle/Stats bleiben sichtbar.

### Kauffenster: Saison-Pass buchbar bis 5. Spieltag

| Zeitfenster | Saison-Pass-Kauf für aktuelle Saison |
|---|---|
| **1. Juli – 5. Spieltag** *(~Mitte Sep)* | ✅ Voller Saison-Pass-Preis (gleicher Preis unabhängig vom Einstiegsdatum) |
| **Ab 6. Spieltag** | ❌ nur Monatsabo möglich · Saison-Pass startet zur nächsten Saison im Juli |

→ Wer Anfang August einsteigt, hat den besten Deal (volle 10 Monate für 7× Monatspreis).
→ Wer im September einsteigt (bis 5. Spieltag), zahlt denselben Saison-Pass-Preis, hat aber nur noch ~8 Monate Restsaison. Kein Pro-Rated — bewusste Wahl: simpel, fair, kein "warte-bis-zum-letzten-Spieltag"-Gaming.

### Mid-Season-Einstieg
| Onboarding-Datum | Wizard-Default |
|---|---|
| **Jul–Sep bis 5. Spieltag** | **Saison-Pass** vorausgewählt + Hinweis "Saison-Wetten noch buchbar" |
| **Ab 6. Spieltag bis Mai** | **Monatsabo** vorausgewählt + Hinweis "Saison-Pass startet zur nächsten Saison im August und spart ~2 Monate" |
| **Juni** *(Sommerpause)* | **Frühbucher-Saison-Pass** für nächste Saison + Trial bis 1.8., Crawler startet automatisch zum Saison-Start |

**Kein Pro-Rated Saison-Pass** — macht den "2 Monate geschenkt"-Discount kompliziert und schwächt psychologisch. Mid-Season → Monatsabo → Switch auf nächsten Saison-Pass im Onboarding angeboten.

### Saison-Pass-Preise kompakt

| Tier | Monat | Saison-Pass | Ersparnis vs Monatsabo (10×) | Effektiv/Mon |
|---|---|---|---|---|
| Basic | 5 € | **35 €** | -15 € (~30 %) | 3,50 € |
| Pro | 11 € | **75 €** | -35 € (~32 %) | 7,50 € |
| Vereinslizenz | 29 € | **199 €** | -91 € (~31 %) | 19,90 € |

---

## 7. Saison-Wetten — Pre-Season-Window

Saison-Wetten (6 Typen: Aufstieg, Klassenerhalt, Tabellenplatz-Range, Meister, Pokalrunde, Custom-Saison-Ziel) sind **nur in Pro & Vereinslizenz** verfügbar und **nur bis zum 5. Spieltag der laufenden Saison buchbar** — gleicher Cutoff wie der Saison-Pass-Kauf.

| Phase | Saison-Wetten-Status |
|---|---|
| **1. Juli – 5. Spieltag** *(ca. Anfang/Mitte Sep)* | ✅ buchbar für aktuelle Saison |
| **Ab 6. Spieltag der laufenden Saison** | ❌ gesperrt — erst wieder zur nächsten Saison (ab 1. Juli des Folgejahres) |
| **Saison-Ende → 30. Juni** | Auswertung läuft (`evaluate-season`), neue Wetten ab 1.7. |

### Warum dieses Window?
- **Sport-Logik:** in Saison-Mitte auf "Aufstieg" zu wetten ist Insider-Spiel, nicht Sponsoring
- **Marketing-Anker:** jährlicher Saison-Auftakt-Push wird zum verlässlichen Sales-Event — *„Saison 2026/27 — Wetten freischalten bis 5. Spieltag."*
- **Konsistent mit Saison-Pass-Kauf** — beide Features haben denselben Cutoff, das ist im Wizard einfach zu kommunizieren
- **Natürliche Verknappung** ohne künstlich zu wirken

### UI-Konsequenz
- Pledge-Wizard zeigt Saison-Wetten-Tab nur, wenn aktuelles Datum ≤ 5. Spieltag der laufenden Saison
- Sonst: Hinweis "Saison-Wetten für die nächste Saison ab [1.7.YYYY] wieder buchbar"
- Bestehende Saison-Wetten bleiben sichtbar/auswertbar, nur Neuanlage ist gesperrt

---

## 8. Trial-Logik

- **30 Tage Trial** für die **erste aktivierte Mannschaft** eines Vereins (alle Tarife)
- Trial startet bei Onboarding-Abschluss (nach Sponsor-Einladungslink-Erstellung)
- Reminder: 7d / 3d / 1d vor Trial-Ende an Mannschafts-Admin
- Nach Trial-Ende ohne Zahlungsmittel → 7d Grace-Period (read-only-Banner, alles funktioniert) → Read-Only-Mode (Crawler stoppt, keine neuen Pledges/Charges, bestehende PDFs bleiben sichtbar)
- Reaktivierung jederzeit mit Zahlung
- **Bei Vereinslizenz:** Trial gilt für gesamten Verein (egal wie viele Mannschaften gleichzeitig aktiviert werden)

---

## 9. Headline-Marketing-Hooks

Wiederverwendbare Sätze für Landing, Pricing-Page, Onboarding, Sales-Pitches:

### Plattform-Versprechen
> **„100 % der Einnahmen gehen an euch. 30 Tage kostenlos testen — ohne Kreditkarte."**

### Tarif-Anker
- **Basic:** *„Zum Reinkommen. 5 € im Monat, kein Risiko."*
- **Pro:** *„Sponsoring, das mitfiebert. Alles drin."*
- **Vereinslizenz:** *„Der ganze Verein. Ein Tarif. Unter 1 € pro Spieler."*

### Saison-Pass-Anker
> **„3 Monate geschenkt. Sommerpause kostet nichts."**

### Mathematik-Anker (für Pricing-FAQ)
- Ab **3 Mannschaften** ist Vereinslizenz günstiger als 3× Pro (29 € vs. 33 €)
- Bei **50 Spielern** zahlt der Vereinslizenz-Verein **unter 1 € pro Spieler**
- Bei **200 Spielern** = **0,15 € pro Spieler**

### Saison-Auftakt-Anker
> **„Saison 2026/27 — Pass und Saison-Wetten freischalten bis 5. Spieltag. Danach erst wieder Juli 2027."** (jährlicher Push)

---

## 10. Implementations-Konsequenzen

Was im Code/Spec geändert werden muss, sobald dieses Pricing abgesegnet ist:

| Asset | Änderung |
|---|---|
| `docs/superpowers/specs/2026-05-19-kickpact-v1-design.md` | §6.8 + §8.4 ersetzen mit diesem Pricing |
| `lib/stripe/pricing.ts` | 3 Tiers × 2 Billing-Cycles = **6 Price-IDs** (Monthly + Saison-Pass je Tier) |
| `docs/stripe-setup.md` | 6 Stripe-Produkte + Anleitung für Saison-Pass-Subscription-Setup |
| `lib/db/schema.ts` | `team_licenses.plan` enum: `basic` \| `pro` \| `verein` · `subscriptions.billing_cycle` enum: `monthly` \| `season_end` (Enum-Wert `annual` bleibt inert, siehe billing.ts) · `subscriptions.paused_until` für Sommerpause-Logik · `seasons`-Tabelle mit `starts_at` / `ends_at` / `matchday_5_at` (für Saison-Pass + Wetten-Cutoff) |
| `lib/billing/season-pass.ts` *(neu)* | Saison-Pass-Subscription-Lifecycle (Pause 1.6.–31.7., Renewal 1.8., Kauf-Cutoff 5. Spieltag) |
| `lib/billing/wager-window.ts` *(neu)* | Pre-Season-Window-Validation für Saison-Wetten-Pledges (5. Spieltag) |
| `lib/db/queries/pledges.ts` | Cap-Checks: max 5 Sponsoren bei Basic, max 3 Pledge-Rules pro Sponsor bei Basic |
| `lib/pdf/invoice.tsx` | Footer-Logic: `team.license.plan === 'basic'` → KickPact-Footer, sonst Vereins-Logo only |
| `lib/mail/templates/` | Reply-To-Logic: Pro/Vereinslizenz → `${verein.contact_email}`, Basic → `noreply@kickpact.de` |
| `app/(marketing)/preise/page.tsx` | Komplett neuer Inhalt (siehe §1–4) — mit `ui-ux-pro-max` Skill designt |
| `app/onboarding/verein/[step]/` | Billing-Cycle-Auswahl in Schritt 2, Mid-Season-Logik (Default-Auswahl abhängig vom Datum vs. 5. Spieltag) |
| `app/(verein)/verein/[slug]/abo/page.tsx` | 3 Tarife + 3 Billing-Cycles + Upgrade-Pfade |

---

## 11. Entscheidungs-Log

| # | Frage | Entscheidung | Status |
|---|---|---|---|
| 1 | Tarif-Namen | **Basic / Pro / Vereinslizenz** | ✅ entschieden |
| 2 | Basic Sponsor-Cap | **5** | ✅ entschieden |
| 3 | Basic Pledge-Rules-Cap pro Sponsor | **3** | ✅ entschieden |
| 4 | Vereinslizenz-Monatspreis | **29 €** (war 49 €, gesenkt 2026-06-15) | ✅ entschieden |
| 5 | Annual-Plan anbieten | **Nein** — 2026-06-02 komplett entfernt; Saison-Pass IST die Jahres-Bindung | ✅ entschieden |
| 6 | Saison-Pass-Preise | **35 / 75 / 199 €** (~ 7× Monat, 3 Mon geschenkt) | ✅ entschieden |
| 7 | Saison-Pass + Saison-Wetten Cutoff | **5. Spieltag der laufenden Saison** (gleicher Cutoff für beides) | ✅ entschieden |
| 8 | Provision auf allen Tiers | **0 %** | ✅ entschieden |
| 9 | Trial-Länge | **30 Tage** | ✅ entschieden |
| 10 | Saison-Pass = Default im Wizard | **Ja** (bis 5. Spieltag), sonst Monatsabo | ✅ entschieden |
| 11 | Onboarding-Support | **Self-Service** — Help-Center + Doku für alle Tiers, kein Call | ✅ entschieden |
