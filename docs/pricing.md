# KickPact Pricing

**Stand:** 2026-07-16 · Apple-Preispunkt-Angleichung · **Spiegel** von [`lib/stripe/pricing.ts`](../lib/stripe/pricing.ts) für Onboarding-Wizard, `/preise`-Page, Spec §6.8 + §8.4

> ## ⚠️ Beträge stehen NUR in `lib/stripe/pricing.ts`
>
> **Einzige Quelle der Beträge ist [`lib/stripe/pricing.ts`](../lib/stripe/pricing.ts)** (`PLANS[plan].cycles[cycle].amountCents`). Dieses Dokument **spiegelt** sie für Marketing, Wizard-Texte und Sales — es setzt sie nicht.
>
> - **Bei Abweichung gilt der Code, nicht diese Datei.**
> - **Keine Beträge irgendwo sonst hardcoden** — nicht in Komponenten, Mails, PDFs, Specs oder Tests. Immer aus `PLANS` lesen; abgeleitete Werte über `getMonthlyEquivalent()` / `getSavings()`, nie selbst rechnen.
> - **Preisänderung ⇒ Reihenfolge:** Apple (App Store Connect) + Stripe → `lib/stripe/pricing.ts` → `tests/stripe/pricing.test.ts` → diese Datei nachziehen. Nie umgekehrt.
>
> *Warum so explizit:* Diese Datei nannte sich bis 2026-07-16 „Source of Truth für `lib/stripe/pricing.ts`" und stand danach auf totem Stand (Pro 11 €, Verein 29 €, Saison-Pass 35/75/199 €). Genau diese toten Beträge steckten auch in den Stripe-Preisobjekten — der Web-Checkout war deshalb kaputt. Die Richtung ist jetzt umgedreht: Code führt, Doku folgt.

> **Update 2026-07-16:** Preise auf **Apple-Preispunkte geglättet** und mit Stripe + App Store Connect abgeglichen (beide Seiten verifiziert): Basic **4,99 €** / **19,99 €**, Pro **8,99 €** / **34,99 €**, Verein **19,99 €** / **79,99 €**. `pro.season` ist bewusst **34,99 € statt 35,99 €** — 35,99 € existiert als Apple-Preispunkt nicht, und App und Web dürfen nicht auseinanderliegen. Diese Doku hing zuvor auf dem Stand **2026-06-15** fest; alle Beträge, Ersparnis-Prozente, Monatsäquivalente, Pro-Spieler- und Break-Even-Tabellen sind neu aus `lib/stripe/pricing.ts` gerechnet. Struktur, 0 %-Provision, 30-Tage-Trial und der 3-Mannschaften-Break-Even bleiben unverändert.
> **Update 2026-06-15:** Preise gesenkt, Saison-Pass-Rabatt verstärkt. *(Beträge dieses Updates sind durch 2026-07-16 überholt.)*
> **Update 2026-06-02:** Der „Annual"-Cycle (12-Monats-Lizenz) wurde komplett entfernt — nur noch **Monatlich + Saison-Pass**. Saison-Pass IST die Jahres-Bindung für den Fußball-Rhythmus.

> Rationale, Recherche und verworfene Konzepte: siehe [docs/strategy/2026-05-22-pricing-strategy.md](strategy/2026-05-22-pricing-strategy.md).

---

## 1. Übersicht

| | **Basic** | **Pro** ⭐ | **Vereinslizenz** |
|---|---|---|---|
| **Zielgruppe** | 1 Mannschaft, 1–5 Sponsoren aus dem direkten Umfeld | 1 Mannschaft, ernsthaftes Sponsoring, ∞ Sponsoren | Verein mit ≥ 3 Mannschaften, zentrale Verwaltung |
| **Monatspreis** | **4,99 €**/Mannschaft/Monat | **8,99 €**/Mannschaft/Monat | **19,99 €**/Verein/Monat |
| **Saison-Pass** *(Aug–Mai, Jun/Jul pausiert)* | **19,99 €**/Saison · ≈ 2,00 €/Mon | **34,99 €**/Saison · ≈ 3,50 €/Mon | **79,99 €**/Saison · ≈ 8,00 €/Mon |
| **Ersparnis Saison-Pass** *(vs 12× Monat)* | **67 %** (−39,89 €) | **68 %** (−72,89 €) | **67 %** (−159,89 €) |
| **Provision auf Pledges** | **0 %** | **0 %** | **0 %** |
| **Trial** | 30 Tage | 30 Tage | 30 Tage |
| **Pro Spieler/Monat** *(typischer Kader)* | ~0,23 €/Spieler (22 Mann) | **0,41 €/Spieler** (22 Mann) | **0,40 €/Spieler** (50 Mann) · 0,10 € bei 200 Spielern |

**Headline-Versprechen:** *100 % der Einnahmen gehen an euch. KickPact stellt die Plattform — Tracking, PDFs, Sponsor-Inbox — und finanziert sich rein über Lizenzgebühren.*

**Default-Empfehlung im Wizard:** Saison-Pass (Aug–Mai) — `DEFAULT_CYCLE = "season_end"`. Monatsabo nach 5. Spieltag der laufenden Saison.

---

## 2. Basic — 4,99 €/Mannschaft/Monat

> **Zum Reinkommen.** Für Trainer, die mit 1–3 Sponsoren aus der Familie ehrlich testen wollen, ob's was bringt.

### Pricing
- **Monatlich:** 4,99 €/Mannschaft
- **Saison-Pass (Aug–Mai):** 19,99 €/Saison · ≈ **2,00 €/Mon** · **67 % günstiger** als 12× Monatsabo (59,88 €) · Juni/Juli automatisch kostenlos pausiert
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

*(Enforcement: `PLAN_CAPS` in `lib/stripe/pricing.ts`, validiert über `lib/billing/plan-features.ts`.)*

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
> *„Schau ob's was bringt. 4,99 € im Monat, kein Risiko. Wenn dein Sponsoring wächst, wechsel zu Pro."*

---

## 3. Pro — 8,99 €/Mannschaft/Monat ⭐

> **Beliebteste.** Für aktive Sponsoring-Setups mit ≥ 5 Sponsoren. Hier sollen 80 % der Vereine landen.
>
> **Bei 22-Mann-Kader: deutlich unter 1 € pro Spieler/Monat.**

### Pricing
- **Monatlich:** 8,99 €/Mannschaft · bei 22-Mann-Kader **0,41 € pro Spieler/Monat**
- **Saison-Pass (Aug–Mai):** **34,99 €**/Saison · effektiv **3,50 €/Mon** · **68 % sparen** (−72,89 € vs 12× Monat = 107,88 €) · Juni/Juli kostenlos pausiert · **0,16 € pro Spieler/Monat**
- **0 % Provision** auf bestätigte Pledges

> **Warum 34,99 € und nicht 35,99 €?** Apples IAP-Preispunkte sind diskret — 35,99 € gibt es dort nicht. Der Preis für `kickpact.pro.season` liegt bei 34,99 € (per ASC-API verifiziert, DEU). Web folgt dem Apple-Preispunkt, damit App und Web nicht 1 € auseinanderliegen. Nicht „glatt aufrunden", das bricht die Store-Parität.

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

## 4. Vereinslizenz — 19,99 €/Verein/Monat

> **Für den ganzen Verein.** Eine Lizenz, unbegrenzt Mannschaften, alles inklusive.
>
> **Unter 1 € pro Spieler ab ~20 Spielern · ab 0,10 €/Spieler bei großen Vereinen.**

### Pricing
- **Monatlich:** 19,99 €/Verein · bei 50 Spielern **0,40 € pro Spieler/Monat**
- **Saison-Pass (Aug–Mai):** **79,99 €**/Saison · effektiv **8,00 €/Mon** · **67 % sparen** (−159,89 € vs 12× Monat = 239,88 €) · Juni/Juli kostenlos pausiert · **0,16 € pro Spieler/Monat** (50 Spieler)
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
| Verein-Größe | €/Spieler/Monat (Lizenz 19,99 €) | €/Spieler/Monat (Saison-Pass, 8,00 €/Mon) |
|---|---|---|
| 30 Spieler | 0,67 € *„unter 1 € pro Spieler"* | 0,27 € |
| 50 Spieler | 0,40 € | 0,16 € |
| 100 Spieler | 0,20 € | 0,08 € |
| 200 Spieler | 0,10 € | 0,04 € |

### Wann lohnt sich Vereinslizenz gegenüber n × Pro?
| Mannschaften | Pro × n (Monat) | Vereinslizenz (Monat) | Ersparnis |
|---|---|---|---|
| 2 | 17,98 €/Mon | 19,99 €/Mon | −2,01 € (Pro besser) |
| **3** | 26,97 €/Mon | **19,99 €/Mon** | **+6,98 €/Mon** ⭐ Break-Even |
| 4 | 35,96 €/Mon | 19,99 €/Mon | +15,97 €/Mon |
| 6 | 53,94 €/Mon | 19,99 €/Mon | +33,95 €/Mon |
| 10 | 89,90 €/Mon | 19,99 €/Mon | +69,91 €/Mon |

### Saison-Pass-Vergleich
| Mannschaften | Pro-Pass × n | Vereinslizenz-Pass | Ersparnis |
|---|---|---|---|
| 2 | 69,98 € | 79,99 € | −10,01 € (Pro besser) |
| **3** | 104,97 € | **79,99 €** | **+24,98 €** ⭐ Break-Even |
| 4 | 139,96 € | 79,99 € | +59,97 € |
| 6 | 209,94 € | 79,99 € | +129,95 € |
| 10 | 349,90 € | 79,99 € | +269,91 € |

→ Ab **3 Mannschaften** mathematisch günstiger als Pro × n, plus Master-Cockpit-Vorteile. Break-Even bleibt bei 3 — in beiden Billing-Cycles.

### Marketing-Hook
> *„Der ganze Verein. Ein Tarif. Unter 1 € pro Spieler."*

---

## 5. Komplette Featurematrix

| Feature | Basic | Pro | Vereinslizenz |
|---|---|---|---|
| **Pricing** | | | |
| Monatspreis | 4,99 € | 8,99 € | 19,99 € |
| Saison-Pass | **19,99 €** | **34,99 €** | **79,99 €** |
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
- **Preis:** ≈ **4 × Monatspreis** für **10 aktive Monate** → 6 der 10 Saison-Monate sind geschenkt. Gegen ein durchlaufendes Monatsabo (12× Monat, das im Sommer nicht pausiert) sind das **67–68 % Ersparnis**.
- **Sommerpause:** 1. Juni – 31. Juli automatisch `paused` → kein Crawler, keine Charges, Daten bleiben sichtbar, **kein €** wird abgebucht (`SEASON_PAUSE_MONTHS = [6, 7]`)
- **Renewal:** zum 1. August automatisch verlängert (Stripe-Subscription `billing_cycle_anchor = next_aug_1`). Vorab-Kündigungsrecht 30 Tage (= bis 1.7.)
- **Winterpause:** Mitte Dez – Anfang Feb. **Keine** Subscription-Pause — App läuft weiter, nur der Crawler findet 4-6 Wochen keine neuen Matches. Tabelle/Stats bleiben sichtbar.

### Kauffenster: Saison-Pass buchbar bis 5. Spieltag

| Zeitfenster | Saison-Pass-Kauf für aktuelle Saison |
|---|---|
| **1. Juli – 5. Spieltag** *(~Mitte Sep)* | ✅ Voller Saison-Pass-Preis (gleicher Preis unabhängig vom Einstiegsdatum) |
| **Ab 6. Spieltag** | ❌ nur Monatsabo möglich · Saison-Pass startet zur nächsten Saison im Juli |

→ Wer Anfang August einsteigt, hat den besten Deal (volle 10 Monate für ~4× Monatspreis).
→ Wer im September einsteigt (bis 5. Spieltag), zahlt denselben Saison-Pass-Preis, hat aber nur noch ~8 Monate Restsaison. Kein Pro-Rated — bewusste Wahl: simpel, fair, kein "warte-bis-zum-letzten-Spieltag"-Gaming.

### Mid-Season-Einstieg
| Onboarding-Datum | Wizard-Default |
|---|---|
| **Jul–Sep bis 5. Spieltag** | **Saison-Pass** vorausgewählt + Hinweis "Saison-Wetten noch buchbar" |
| **Ab 6. Spieltag bis Mai** | **Monatsabo** vorausgewählt + Hinweis "Saison-Pass startet zur nächsten Saison im August und spart rund zwei Drittel" |
| **Juni** *(Sommerpause)* | **Frühbucher-Saison-Pass** für nächste Saison + Trial bis 1.8., Crawler startet automatisch zum Saison-Start |

**Kein Pro-Rated Saison-Pass** — macht den Discount kompliziert und schwächt psychologisch. Mid-Season → Monatsabo → Switch auf nächsten Saison-Pass im Onboarding angeboten.

### Saison-Pass-Preise kompakt

Vergleichsbasis ist **12 × Monatspreis** — was ein Monatsabo über ein volles Jahr kostet (das Monatsabo pausiert im Sommer nicht). Identisch zu `getSavings()`; diese Prozente sind die `saveBadge`-Werte auf der Pricing-Card.

| Tier | Monat | Saison-Pass | 12× Monat | Ersparnis | Effektiv/Mon *(Pass ÷ 10)* |
|---|---|---|---|---|---|
| Basic | 4,99 € | **19,99 €** | 59,88 € | −39,89 € (**67 %**) | 2,00 € |
| Pro | 8,99 € | **34,99 €** | 107,88 € | −72,89 € (**68 %**) | 3,50 € |
| Vereinslizenz | 19,99 € | **79,99 €** | 239,88 € | −159,89 € (**67 %**) | 8,00 € |

> **Nur diese eine Vergleichsbasis kommunizieren.** Früher stand hier zusätzlich ein 10×-Vergleich mit ~30 % — zwei konkurrierende Ersparnis-Zahlen für dasselbe Produkt sind der Anfang der nächsten Divergenz. Prozente kommen aus `getSavings(plan, cycle)`, Monatsäquivalente aus `getMonthlyEquivalent(plan, cycle)` — nicht abtippen.

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

- **30 Tage Trial** (`TRIAL_DAYS = 30`) für die **erste aktivierte Mannschaft** eines Vereins (alle Tarife)
- Trial startet bei Onboarding-Abschluss (nach Sponsor-Einladungslink-Erstellung)
- Reminder: 7d / 3d / 1d vor Trial-Ende an Mannschafts-Admin
- Nach Trial-Ende ohne Zahlungsmittel → 7d Grace-Period (read-only-Banner, alles funktioniert) → Read-Only-Mode (Crawler stoppt, keine neuen Pledges/Charges, bestehende PDFs bleiben sichtbar)
- Reaktivierung jederzeit mit Zahlung
- **Bei Vereinslizenz:** Trial gilt für gesamten Verein (egal wie viele Mannschaften gleichzeitig aktiviert werden)

---

## 9. Headline-Marketing-Hooks

Wiederverwendbare Sätze für Landing, Pricing-Page, Onboarding, Sales-Pitches.

> **Beträge in Marketing-Copy sind Momentaufnahmen.** In gerenderter UI immer aus `PLANS` lesen — hier stehen sie nur, damit man den Ton trifft.

### Plattform-Versprechen
> **„100 % der Einnahmen gehen an euch. 30 Tage kostenlos testen — ohne Kreditkarte."**

### Tarif-Anker
- **Basic:** *„Zum Reinkommen. 4,99 € im Monat, kein Risiko."*
- **Pro:** *„Sponsoring, das mitfiebert. Alles drin."*
- **Vereinslizenz:** *„Der ganze Verein. Ein Tarif. Unter 1 € pro Spieler."*

### Saison-Pass-Anker
> **„Zwei Drittel günstiger als Monat für Monat. Sommerpause kostet nichts."**

### Mathematik-Anker (für Pricing-FAQ)
- Ab **3 Mannschaften** ist Vereinslizenz günstiger als 3× Pro (19,99 € vs. 26,97 €)
- Bei **50 Spielern** zahlt der Vereinslizenz-Verein **0,40 € pro Spieler** — mit Saison-Pass 0,16 €
- Bei **200 Spielern** = **0,10 € pro Spieler**
- Saison-Pass Pro: **34,99 € für die ganze Saison** = 3,50 € pro Monat

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

### Preisänderung — Reihenfolge (verbindlich)

Ändert sich ein Betrag, gilt **diese Reihenfolge** — sonst wiederholt sich die Divergenz vom Juli 2026:

| # | Ort | Was |
|---|---|---|
| 1 | **App Store Connect** | IAP-Preis je Product-ID (`APPLE_PRODUCTS`). Nur diskrete Apple-Preispunkte — der gewünschte Betrag existiert eventuell nicht. |
| 2 | **Stripe** | Neues Price-Objekt je Plan × Cycle, Env `STRIPE_<PLAN>_<CYCLE>_PRICE_ID` umhängen. Stripe-Prices sind immutable, nie in-place ändern. |
| 3 | **`lib/stripe/pricing.ts`** | `amountCents` + `display` + `caption` + `saveBadge`. **Die einzige Quelle im Code.** |
| 4 | **`tests/stripe/pricing.test.ts`** | Kanonische Assertions nachziehen — der Test ist die Bremse gegen stille Drifts. |
| 5 | **Diese Datei** | Alle Tabellen in §1–§6, §9 + Update-Notiz oben. |

Alles andere (Wizard, `/preise`, Abo-Panel, Mails, PDFs) liest aus `PLANS` und braucht **keine** Änderung. Falls doch irgendwo ein Betrag hart drinsteht: das ist ein Bug, kein Pflegeaufwand.

### Abgeleitete Werte — nie selbst rechnen
| Wert | Funktion |
|---|---|
| Effektiv pro Monat | `getMonthlyEquivalent(plan, cycle)` — Saison-Pass ÷ 10 |
| Ersparnis (€ + %) | `getSavings(plan, cycle)` — Basis 12 × monthly |
| Stripe-Price-ID | `getStripePriceId(plan, cycle)` / `priceIdToPlanCycle(id)` |
| Apple-Product-ID | `appleProductIdFor(plan, cycle)` / `appleProductToPlanCycle(id)` |
| Tier-Caps | `PLAN_CAPS[plan]` |

---

## 11. Entscheidungs-Log

| # | Frage | Entscheidung | Status |
|---|---|---|---|
| 1 | Tarif-Namen | **Basic / Pro / Vereinslizenz** | ✅ entschieden |
| 2 | Basic Sponsor-Cap | **5** | ✅ entschieden |
| 3 | Basic Pledge-Rules-Cap pro Sponsor | **3** | ✅ entschieden |
| 4 | Vereinslizenz-Monatspreis | **19,99 €** (49 € → 29 € am 2026-06-15 → 19,99 € am 2026-07-16) | ✅ entschieden |
| 5 | Annual-Plan anbieten | **Nein** — 2026-06-02 komplett entfernt; Saison-Pass IST die Jahres-Bindung | ✅ entschieden |
| 6 | Saison-Pass-Preise | **19,99 / 34,99 / 79,99 €** (≈ 4× Monat, 67–68 % vs 12× Monat) | ✅ entschieden |
| 7 | Saison-Pass + Saison-Wetten Cutoff | **5. Spieltag der laufenden Saison** (gleicher Cutoff für beides) | ✅ entschieden |
| 8 | Provision auf allen Tiers | **0 %** | ✅ entschieden |
| 9 | Trial-Länge | **30 Tage** | ✅ entschieden |
| 10 | Saison-Pass = Default im Wizard | **Ja** (bis 5. Spieltag), sonst Monatsabo | ✅ entschieden |
| 11 | Onboarding-Support | **Self-Service** — Help-Center + Doku für alle Tiers, kein Call | ✅ entschieden |
| 12 | `pro.season` = 34,99 € statt 35,99 € | **Ja** — 35,99 € ist kein Apple-Preispunkt; Web folgt Apple, damit App/Web nicht auseinanderliegen | ✅ entschieden 2026-07-16 |
| 13 | Source of Truth für Beträge | **`lib/stripe/pricing.ts`** — diese Datei spiegelt nur. Vorher umgekehrt deklariert, das war die Wurzel der Preis-Divergenz. | ✅ entschieden 2026-07-16 |
