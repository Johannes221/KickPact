# KickPact — Pricing-Strategie v2 (Re-Think)

**Datum:** 2026-05-22
**Autor:** Johannes Schartl + Claude (Strategy-Partner-Modus)
**Status:** Draft → Entscheidung pending
**Ersetzt:** Spec §6.8 + §8.4 (Pricing-Stufen) sobald Konzept gewählt

---

## 0. TL;DR — Iteration 2 (post-Feedback Johannes, 2026-05-22)

**Drei Korrekturen nach Sparring:** (a) **Provision raus** — 100 % der Pledges bleiben beim Verein, ist die coolere Aussage und einfacher zu kommunizieren. (b) **Sprung Basic → Pro deutlich härter** — Basic wird auf "Probier-mit-Familie" gestutzt, fast alle Sales-Magic wandert nach Pro. (c) **Saison-Logik integriert** — DFB-Spieljahr Aug–Mai (10 aktive Monate), Saison-Pass = 9 × Monatspreis (1 Monat geschenkt), Sommerpause Juni/Juli kostenlos, Saison-Wetten nur in Pre-Season buchbar.

**Empfehlung: Konzept D — "Pure SaaS, harter Sprung, Saison-Pass-Default"**

```
Spieltag (Basic)    5 €/Mannschaft/Monat   — wirklich nur die Basics
Profi (Pro)        19 €/Mannschaft/Monat   — alles. Hierher sollen 80 %  ⭐
Liga (Verein)      49 €/Verein/Monat       — unlimited Mannschaften, alles + Verein-Cockpit
                   (≈ 1 €/Spieler bei 50-Mann-Verein)

Saison-Pass (Aug–Mai, 10 Mon, "1 Monat geschenkt" = 9× Monatspreis):
   Spieltag-Pass  45 €/Saison    → effektiv 4,50 €/Mon
   Profi-Pass    171 €/Saison    → effektiv 17,10 €/Mon   ← Default-Empfehlung im Wizard
   Liga-Pass     441 €/Saison    → effektiv 44,10 €/Mon
```

**Warum D nun gewinnt:**
- **0 % Provision auf allen Tiers** — Headline: *"100 % deiner Pledges bleiben bei dir."* Kein Vorstand-Erklärungsbedarf, kein Pricing-Rechner nötig.
- **Sprung 5 € → 19 € (3,8×)** plus *massiver* Feature-Cut bei Basic → Trainer denkt "scheiß drauf, 14 € mehr für alles". Genau dein Ziel.
- **Basic ist nicht null** — alle Auto- und Manual-Trigger drin, aber harte Caps (max 5 Sponsoren, 3 Pledge-Rules pro Sponsor) + kein Branding + kein Saison-Wetten + kein Custom-Trigger. Ausreichend für "1 Pate aus der Familie", zu eng für ernsthaftes Sponsoring → natürlicher Pro-Push.
- **Saison-Pass mit "1 Monat gratis"** als Default im Wizard senkt Churn-Risiko massiv (Pre-Commit) und gibt Cash-Flow für KickPact.
- **Saison-Wetten nur in Pre-Season buchbar** (bis 5. Spieltag) — natürliche Wett-Logik, gleichzeitig Marketing-Hebel: *"Saison-Auftakt — jetzt Wetten freischalten oder erst wieder 2027."* Echter Anker, nicht künstliche Verknappung.
- **Liga bleibt bei 49 €** (statt der zwischenzeitlich vorgeschlagenen 59 €), weil ohne Provision das Argument "spar Provision" wegfällt — und 49 € macht Liga schon ab 3 Mannschaften attraktiv (49 € vs 3×19 = 57 €), bei 4 Mannschaften ein No-Brainer.

**Konzept C (mit Provision) bleibt im Doc als Vergleich.** Details zu Konzept D ab §10 (neu), die alten Konzepte A/B/C bleiben in §4 als Historie/Sparring-Spur.

---

## 1. Status-Quo-Diagnose

### Was im Spec steht (heute)

| Plan | Preis | Cap | Pro-Add-On |
|---|---|---|---|
| Basic | 9 €/Mannschaft/Monat | 20 Sponsoren | — |
| Pro | 19 €/Mannschaft/Monat | ∞ | Vereins-Logo PDF · CSV-Export · Custom-Trigger-Texte · Sponsor-Stats |
| Vereinslizenz | 49 €/Verein/Monat | alle Mannschaften | alle Pro-Features |

### Was daran kaputt ist

| Problem | Konsequenz |
|---|---|
| Cap "20 Sponsoren" greift bei Amateurvereinen quasi nie (typisch 8–15 Sponsoren) | kein Forced Upgrade von Basic → Pro |
| "Vereins-Logo auf PDF" ist 80 % der Pro-Story | Trainer/Vorstand: "Nice-to-have, nicht nötig" |
| Saison-Wetten + Custom-Trigger sind die spannenden Features — aber im Status Quo auch Pro-only und damit aktiver Pain für Basic-User | Sponsor-Acquisition leidet, weil Basic die fun Trigger nicht zeigen kann |
| Keine Provision = KickPact monetarisiert das Volumen nicht | bei einem Pilot-Verein mit 6 Sponsoren × 50 €/Mon × 12 Mon = 3.600 €/Saison Volumen, kassiert KickPact 9 × 10 = 90 €/Saison. **2,5 % effektive Take-Rate.** Viel zu wenig. |
| 49 € Vereinslizenz lohnt erst ab 3 Mannschaften | für 2-Mannschafts-Vereine (häufig: 1× Senioren + 1× AH) nicht attraktiv |
| Monats-Abo läuft auch Juni/Juli (Sommerpause) | Churn-Risiko + schlechtes Gefühl |

---

## 2. Strategie-Fundamente (Research)

### Psychologie

- **70 % wählen das mittlere Tier** wenn drei angeboten werden ([decoy effect](https://www.getmonetizely.com/articles/the-decoy-effect-how-strategic-pricing-tiers-can-maximize-revenue)).
- **Optimaler Mid-Preis = 1,5–2,5 × Basic** (psychologisch wohlbalanciert). Bei Basic 7 € → Mid sollte 10–17 € sein. Bei Basic 9 € → 13–22 €. Wir landen ok mit **Basic 7 + Pro 19** (2,7×, leicht über range, aber Provision-Story rechtfertigt's).
- **Anchor first the highest tier**: Vereinslizenz oben links, Pro mittig (highlighted), Basic rechts. Lesefluss links→rechts steigt der Wert, sinkt der Preis — relativiert Mid.
- **B2B-Käufer sind trust-sensitiv** — keine Gimmicks (kein "nur heute!", kein "limited"). Stattdessen: ehrliche Per-Unit-Berechnung, transparente Provision, klare Break-Even-Story.
- **B2B-Faustregel**: 80 % der Kaufentscheidungen treibt *perceived value*, nicht Cost. → Pro muss eine *Story* haben, nicht nur einen Featurelist-Sieg.

### Marktvergleich (Vereinssoftware DE)

| Anbieter | Preis | Modell |
|---|---|---|
| WISO MeinVerein Web | 10–50 €/Mon nach Mitgliederzahl | Member-tier Staffel |
| Clubway | Preis auf Anfrage | Enterprise-feel |
| KURABU | erstes Jahr gratis | Land-grab |
| Webling | 0–~30 €/Mon | Mitglieder-basiert |

→ **Unser Slot:** zwischen "Membership-Software" (10–30 €) und "Spezial-Tool" (eigene Preisklasse). KickPact ist *nicht* Konkurrenz zu WISO/Clubway — wir sind eine Zusatz-Einnahmequelle. **Das macht Pricing fairer**, weil Verein zahlt KickPact nur, *wenn* es Geld bringt. Genau dieses Argument ist der Sales-Hook.

### Shopify-Modell (Subscription + Take-Rate)

Shopify charges fixed sub (39–399 $/Mon) **plus** 2,4–2,9 % Transaktionsgebühr — die Take-Rate **sinkt mit höherem Tier**. Das ist das Gold-Standard-Modell für Plattformen mit Geld-Volumen:

- Predictability für KickPact (MRR-Floor) + Skalierung (Take-Rate)
- Aligned Incentives: KickPact verdient mehr, wenn Verein mehr verdient
- Klare Upgrade-Logik: "Wenn du wächst, lohnt sich der nächste Tier"

→ **Wir adoptieren Shopify-Logik, aber mit Hybrid-Twist** (siehe Konzept C): Take-Rate-Sprung von 6 % → 0 % statt feiner Staffel. Klare Story > präzise Math.

---

## 3. Alle Drehschrauben (Inventory)

Damit du siehst, mit welchen Hebeln wir die Tiers überhaupt unterscheiden können — und welche davon ich in den Konzepten ziehe:

### Monetäre Hebel

| Hebel | Range | Use |
|---|---|---|
| Subscription pro Mannschaft/Monat | 5–25 € | Hauptpreis |
| Subscription pro Verein/Monat | 39–99 € | Vereinslizenz flat |
| Pro-Spieler-Preis (Verein) | 0,50–1,50 €/Spieler | alternative Vereinslizenz-Formel |
| Provision (Take-Rate) | 0–10 % auf bestätigte Pledges | Volumen-Monetarisierung |
| Setup-Gebühr | 0 oder 49–199 € einmalig | White-Glove-Onboarding |
| Annual Discount | 10–17 % (= 1–2 Monate gratis) | Cash-flow-Boost |
| **Saison-Pass** (10 × Monatspreis Aug–Mai) | ~17 % discount + Juni/Juli frei | sport-spezifisch, psychologisch perfekt |

### Cap-Hebel

| Hebel | Heute | Möglich |
|---|---|---|
| Max Sponsoren pro Team | 20 (Basic) / ∞ (Pro) | 15/∞ oder weglassen |
| Max aktive Pledge-Rules pro Team | unbegrenzt | 5/∞ wäre Alternative |
| Max Admins/Trainer pro Team | unbegrenzt | 1/3/∞ Staffel |
| Match-Historie | unbegrenzt | 3 Monate / 1 Saison / Unlimited |

### Feature-Hebel

| Feature | Heute | Vorschlag |
|---|---|---|
| Auto-Trigger (10 Typen) | alle Basic | **alle Tiers** — niemals zurückhalten |
| Manual-Trigger Katalog (special_goal, yellow_card, …) | alle Basic | **alle Tiers** — Kern-USP |
| **Saison-Wetten** (6 Typen) | Pro only | weiterhin **Pro only** — sales-magic-feature |
| **Custom-Trigger-Texte** ("Bizeps-Tor von Mehmet") | Pro only | weiterhin **Pro only** |
| Custom-Subtypes für Manual-Trigger | Pro | bleibt Pro |
| **Vereins-Logo im PDF** + kein KickPact-Branding | Pro | Pro |
| **Eigener Mail-Absender** ("FC X" statt "KickPact") | nicht im Spec | **Pro** — Status |
| CSV-Export | Pro | Pro |
| **Sponsor-Stats-Widget** (Spieler-Leaderboard etc.) | Pro | Pro |
| **Pledge-Discovery** (Team in /sponsor/discover auffindbar) | v1.1 | **Pro** — wird zum Acquisition-Tool |
| **Saison-Recap-PDF** (am Saisons-Ende, Top-Sponsor, etc.) | nicht im Spec | **Pro** |
| **Embed-Widget** ("5€ pro Tor — jetzt mitmachen") für Vereins-Website | nicht im Spec | **Pro** |
| **Sponsor-Newsletter** (auto-monatlich) | nicht im Spec | **Pro** |
| Multi-User Roles (admin/trainer/viewer) | alle Tiers | alle Tiers |
| **Master-Admin-Cockpit** für alle Mannschaften | Vereinslizenz | Vereinslizenz exklusiv |
| **Konsolidierte Rechnung** (eine PDF für alle Teams) | Vereinslizenz | Vereinslizenz |
| **Cross-Team-Sponsor-View** | Vereinslizenz | Vereinslizenz |
| **White-Glove-Onboarding** (1× Call mit dir/Vereins-Setup) | nicht im Spec | **Vereinslizenz** |
| **Custom-Domain** (sponsor.fcblabla.de) | nicht im Spec | **Vereinslizenz** (v2) |
| **Priority Support** (Antwortzeit-SLA) | nicht im Spec | Pro 24h, Verein 4h + WhatsApp |
| **API-Zugriff** | nicht im Spec | Vereinslizenz only (kein realer Demand v1) |

### Saisonalität-Hebel

- **Saison-Pass**: 10 × Monatspreis, Aug–Mai aktiv, Juni/Juli kostenlos pausiert (Crawler aus, read-only). Default-Empfehlung für alle.
- **Monats-Abo**: für Vereine die ganzjährig (Hallen-Saison, Veteranen) wollen.
- **Sommerpause-Toggle**: jederzeit selbst pausierbar; Stripe-Subscription pausiert.

---

## 4. Drei Konzepte

Alle Konzepte sind **3 Tiers**: leichte Variante, Mittel-Push, Vereinslizenz für Multi-Team.

### 🅐 Konzept A — "Pure SaaS, kein Take-Rate" (Iteration des Status Quo)

| Tier | Preis | Cap | Highlight |
|---|---|---|---|
| Basic | **7 €**/Mannschaft/Mon | 15 Sponsoren · keine Saison-Wetten · keine Custom-Trigger · KickPact-Footer im PDF | "Reicht für 1 Sponsor in der Familie" |
| **Pro** | **17 €**/Mannschaft/Mon | ∞ · Saison-Wetten · Custom-Trigger · eigenes Logo · CSV · Discovery · Embed · Newsletter | Volle Plattform |
| Vereinslizenz | **49 €**/Verein/Mon | alle Mannschaften · Master-Admin · Konsolidierte PDF · WhatsApp-Support | "1 € pro Spieler bei 50 Spielern" |

- **Upgrade-Treiber:** Feature-Stack (Saison-Wetten + Custom-Trigger sind der Hammer)
- **Saison-Pass:** 10 × Monatspreis = Basic 70 € · Pro 170 € · Verein 490 € pro Saison
- **Annual Discount:** 12 × Monatspreis − 2 = 10 Monate (Saison-Pass-Variante)

**Vorteile:** simpel, kein Volumen-Tracking-Aufwand, klassisches SaaS-Modell.
**Nachteile:** wir lassen Volumen-Geld liegen — Verein mit 8.000 €/Saison Pledges zahlt gleich viel wie Verein mit 800 €. **Take-Rate effektiv 2 %**, das ist für eine Plattform mit Settle-Risk + PDF-Bürokratie + Crawler-Cost zu wenig.

---

### 🅑 Konzept B — "Aligned Incentives" (Shopify-Style, Take-Rate-Staffel)

| Tier | Sub | Provision | Cap |
|---|---|---|---|
| Basic | **5 €**/Mannschaft/Mon | **8 %** auf bestätigte Pledges | 15 Sponsoren, keine Saison-Wetten/Custom |
| **Pro** | **15 €**/Mannschaft/Mon | **3 %** | volle Features |
| Vereinslizenz | **39 €**/Verein/Mon | **1,5 %** | alle Mannschaften + Master |

- **Break-even Basic → Pro:** (15-5)/(0,08-0,03) = **200 € Pledges/Mon** → ab 200 €/Mon ist Pro günstiger
- **Break-even Pro → Verein:** Sub-Differenz (39-15n) plus Provision — funktioniert ab 3 Mannschaften
- **Saison-Pass:** 10 × Monatspreis

**Vorteile:** maximal aligned, KickPact wächst mit Volumen, Pro-Push ist mathematisch sauber.
**Nachteile:** *drei verschiedene Provisions-Sätze* sind im Pricing-Page schwer zu kommunizieren. Vorstand fragt: "Was zahlen wir denn jetzt am Ende?" → erfordert einen **Pricing-Rechner**, sonst Verwirrung.

---

### 🅒 Konzept C ⭐ — "0 % Provision ab Pro" (Empfehlung)

**Die Headline-Story: Provision ist nur bei Basic. Ab Pro behält der Verein 100 %.**

| Tier | Sub | Provision | Headline |
|---|---|---|---|
| **Spieltag** (Basic) | **7 €**/Mannschaft/Mon | **6 %** auf bestätigte Pledges | "Probier's aus — wir verdienen nur, wenn du verdienst" |
| **Profi** (Pro) ⭐ | **19 €**/Mannschaft/Mon | **0 %** | "Behalte 100 %. Vom ersten Euro." |
| **Liga** (Vereinslizenz) | **59 €**/Verein/Mon | **0 %** | "Unter 1 € pro Spieler — alle Mannschaften, ein Preis" |

**Saison-Pass (Default-Empfehlung im Onboarding):**

| Tier | Saison-Pass (Aug–Mai, 10 × Mon) | Effektiv pro Mon (12 Mon) |
|---|---|---|
| Spieltag | 70 € + 6 % | 5,83 € + 6 % |
| Profi | **190 €** + 0 % | **15,83 €** ← landet in deiner gewünschten 15–19 € Zone |
| Liga | 590 € + 0 % | 49,17 € |

**Naming-Optionen** (Konzept C abstrahiert vom Namen):

| Variante | Basic | Pro | Verein |
|---|---|---|---|
| 🅰️ Klassisch | Basic | Pro | Vereinslizenz |
| 🅱️ Sport-DE | Spieltag | Profi | Liga |
| 🅾️ Mix | Start | Pro | Verein |
| 🆎 Energie | Anpfiff | Profi | Vereinslizenz |

→ Ich plädiere für **Sport-DE (Spieltag / Profi / Liga)** — gleicher Sound wie der Brand-Pitch "Strava-für-Amateur-Sponsoring", und "Liga-Tarif" klingt automatisch nach "die ganze Bude". Falls zu spielerisch: Fallback Mix (Start / Pro / Verein).

#### Wieso Konzept C die Empfehlung ist

1. **Headline-Marketing**: "0 % Provision ab Pro" merkt sich jeder Vereins-Vorstand. "8 %/3 %/1,5 %" merkt sich keiner.
2. **Mathematische Break-Even-Story** ist sauber kommunizierbar:
   - Pro lohnt ab **(19-7) / 0,06 = 200 € Pledges/Monat** pro Team
   - Übersetzt: "5 Sponsoren × 40 €/Mon" oder "1 Hauptsponsor mit 50 € + 4 Familienzweige"
   - Das ist *genau* die Größenordnung eines aktiven Pilotvereins — Pro wird zum **rationalen Default**, Basic zum **Probier-Modus**.
3. **Basic ist nicht verkrüppelt** — alle Auto-Trigger, alle Manual-Trigger, monatliches PDF, Approval-Flow. Der Trainer kann mit Basic *sofort und vollständig* loslegen. Nur die Sales-Magic (Saison-Wetten + Custom-Trigger + eigenes Branding) ist Pro.
4. **Provision hat einen psychologischen "Kostenlos"-Aspekt**: niemand zahlt vorab 6 % — sie werden auf bestätigten Pledges nachverrechnet. Eintrittsschwelle ist 7 €, nicht "7 € + irgendwas".
5. **Vereinslizenz hat eigene Headline** (nicht "alles wie Pro × n"): "1 € pro Spieler — Liga-Tarif". Bei 59 € und ø 60 Spielern pro Verein = 0,98 €/Spieler. Bei großen Vereinen (200+ Spieler) wird's < 0,30 €/Spieler — irrer Deal, der sich rumspricht.
6. **Pro → Verein Break-Even sauber:** 59 € ÷ 19 € = **3,1 Mannschaften**. Ab 4 Mannschaften ist Liga-Tarif klar günstiger. 2-Mannschafts-Vereine bleiben rational auf Pro × 2. Funktioniert.

---

## 5. Featurematrix (Konzept C im Detail)

| Feature | Spieltag (7 € + 6 %) | Profi (19 € + 0 %) | Liga (59 € + 0 %) |
|---|---|---|---|
| **Auto-Trigger** (Tor, Sieg, Clean Sheet, Comeback, Hattrick, Tordifferenz…) | ✅ alle | ✅ alle | ✅ alle |
| **Manual-Trigger** (Spezial-Tor, Karten, Assist, Spieler-d.-Spiels) | ✅ alle | ✅ alle | ✅ alle |
| **Saison-Wetten** (Aufstieg, Klassenerhalt, Tabellenplatz, Pokal-Runde, Meister, Custom) | ❌ | ✅ | ✅ |
| **Custom-Trigger** (selbst benannte Trigger wie "Bizeps-Tor von Schmidt") | ❌ | ✅ | ✅ |
| Sponsoren pro Mannschaft | bis 15 aktiv | ∞ | ∞ |
| Aktive Pledge-Rules pro Team | bis 5 | ∞ | ∞ |
| Match-Historie | aktuelle Saison | ∞ | ∞ |
| **PDF-Rechnung** | mit KickPact-Footer | **Vereins-Logo, kein Footer** | Vereins-Logo + Multi-Team-Sammel-PDF |
| **E-Mail-Absender** an Sponsoren | von KickPact | **vom Verein (eigener Reply-To)** | vom Verein |
| CSV/Excel-Export | ❌ | ✅ | ✅ |
| **Sponsor-Stats-Widgets** (Leaderboards, Spieler-Stats) | ❌ | ✅ | ✅ |
| **Embed-Widget** für Vereins-Website | ❌ | ✅ | ✅ |
| **Pledge-Discovery** (Team in /sponsor/discover sichtbar) | ❌ | ✅ | ✅ |
| **Sponsor-Newsletter** (auto-monatlich) | ❌ | ✅ | ✅ |
| **Saison-Recap-PDF** | ❌ | ✅ | ✅ + Vereins-weit aggregiert |
| User-Rollen | Admin + Trainer | + Viewer | + Multi-Admin (10) |
| **Master-Admin-Cockpit** | ❌ | ❌ | ✅ |
| **Cross-Team-Sponsor-View** | ❌ | ❌ | ✅ |
| **Konsolidierte Monats-Rechnung** | ❌ | ❌ | ✅ |
| **White-Glove-Onboarding-Call** | ❌ | ❌ | ✅ (60 Min) |
| **Custom Domain** (v2) | ❌ | ❌ | ✅ |
| **Priority Support** | Email, 48 h | Email, 24 h | Email + WhatsApp, 4 h |
| **Trial** | 30 Tage | 30 Tage | 30 Tage |
| **Saison-Pass** (Aug–Mai) | 70 € + 6 % | 190 € + 0 % | 590 € + 0 % |
| **Annual** (12 Mon) | 84 € + 6 % | 209 € (≈11×) | 649 € (≈11×) |

### Wo die Limit-Schmerzgrenze sitzt

- "Spieltag 15 Sponsoren" greift bei ø Amateur-Verein selten — soll auch nicht der Hauptdruck sein. Der Hauptdruck ist die **Provision** + **Saison-Wetten/Custom-Trigger**.
- "5 aktive Pledge-Rules" ist die wahre Härte: ein Sponsor mit "5 €/Tor + 10 €/Sieg + 20 €/Hattrick + 30 €/Aufstieg" hat bereits 4 Rules. Zwei aktive Sponsoren mit reichen Pledges → Cap erreicht. Forced Upgrade.
- "Match-Historie nur aktuelle Saison" ist subtil, aber für Vorstand wichtig (Jahresbericht).

---

## 6. Math: Worst-Case + Sweet-Spot-Szenarien

Annahmen: ø Amateurmannschaft hat 5–10 Sponsoren, ø 25–60 €/Sponsor/Monat, ø 30 Spieltage/Saison.

### Szenario "Kleinverein Pilot" — 1 Mannschaft, 6 Sponsoren × 30 €/Mon = 180 €/Mon

| Plan | Mon-Kosten | Saison (10 Mon) |
|---|---|---|
| Spieltag (7 € + 6 %·180) | 7 + 10,80 = **17,80 €/Mon** | 178 € |
| Profi (19 € + 0 %) | **19 €/Mon** | 190 € |
| Δ | Profi 1,20 €/Mon teurer | 12 € |

→ Bei 180 €/Mon liegt **Spieltag knapp vorn**. Verein wählt rational Basic, aber 1,20 € Differenz und Profi bringt Saison-Wetten + Custom-Trigger. **70 % gehen trotzdem Pro** (Decoy-Effekt + Feature-Stack).

### Szenario "Aktiver Verein" — 1 Mannschaft, 10 Sponsoren × 40 €/Mon = 400 €/Mon

| Plan | Mon-Kosten |
|---|---|
| Spieltag (7 + 6 % · 400) | 7 + 24 = **31 €/Mon** |
| Profi (19 + 0 %) | **19 €/Mon** ⭐ Pro spart 12 €/Mon |

→ Klare Empfehlung: Pro. **Break-even bei 200 €/Mon Pledges**, ab 300 € lohnt sich Pro signifikant.

### Szenario "Großverein" — 4 Mannschaften, je 8 Sponsoren × 35 € = 280 €/Mon · Team

| Plan | Mon-Kosten |
|---|---|
| 4× Spieltag (4×7 + 6 % · 1.120) | 28 + 67 = 95 €/Mon |
| 4× Profi (4×19 + 0 %) | 76 €/Mon |
| **Liga** (59 + 0 %) | **59 €/Mon** ⭐ Liga spart 17 €/Mon ggü 4× Pro |

→ Klare Empfehlung: Liga. Plus alle Multi-Team-Cockpit-Vorteile.

### Szenario "Riesenverein" — 12 Mannschaften, 8 Sponsoren × 30 € = 240 €/Mon · Team = 2.880 €/Mon Pledges

| Plan | Mon-Kosten |
|---|---|
| 12× Profi | 12 × 19 = **228 €/Mon** |
| **Liga** (59 + 0 %) | **59 €/Mon** ⭐ Liga spart 169 €/Mon |

→ Bei einem 200-Spieler-Verein landet Liga bei **0,30 €/Spieler/Monat**. Marketing-Goldgrube.

### KickPact-Sicht: Revenue pro Pilot-Verein (Konzept C)

Pilot mit 3 Mannschaften, je 6 Sponsoren × 30 €/Mon = 540 €/Mon Pledges gesamt, Saison-Pass:

| Wahl | KickPact-Revenue (Saison) |
|---|---|
| 3× Spieltag-Pass + 6 % · 5.400 € | 210 + 324 = **534 €/Saison** |
| 3× Profi-Pass | 570 €/Saison |
| Liga-Pass | **590 €/Saison** |

→ KickPact verdient **5,6×** so viel wie im Status Quo (3 × 90 € = 270 €). Skalierung greift bei größeren Vereinen noch stärker.

---

## 7. Microcopy & Pricing-Page-Skeleton

### Hero-Tagline (Pricing-Seite)

> **Verdiene als Verein. Wir auch — aber nur, wenn du es tust.**
> KickPact-Spieltag: 7 €/Mannschaft + 6 % auf bestätigte Pledges.
> Profi-Tarif: 19 €/Mannschaft. **0 % Provision. Behalte alles.**

### Tier-Karten (Reihenfolge: Liga · Profi ⭐ · Spieltag)

**🏆 Liga — 59 €/Verein/Monat**
> Für Vereine mit mehreren Mannschaften.
> "Unter 1 € pro Spieler bei 60-Mann-Kader."
> Alle Mannschaften · 0 % Provision · Sammelrechnung · Master-Cockpit · WhatsApp-Support · Onboarding-Call

**⚽ Profi — 19 €/Mannschaft/Monat** ⭐ *Beliebteste*
> Für aktive Sponsoring-Setups.
> "Ab 200 € Pledges/Monat zahlt sich Profi selbst — gegenüber 6 % bei Spieltag."
> Alles aus Spieltag · **0 % Provision** · Saison-Wetten · Custom-Trigger · Vereins-Logo · CSV-Export · Embed-Widget · Auto-Newsletter

**🎯 Spieltag — 7 €/Mannschaft/Monat**
> Zum Reinkommen.
> "Wir verdienen nur, wenn du verdienst."
> Alle Auto- & Manual-Trigger · Bis 15 Sponsoren · 6 % Provision auf bestätigte Pledges

### Per-Player-Anker (Subline unter Liga)

> Liga-Tarif für 60-Spieler-Verein = **0,98 €/Spieler/Monat**.
> 100-Spieler-Verein = **0,59 €**. Größer = günstiger.

### FAQ-Microcopy

**"Warum Provision bei Spieltag?"**
> Damit du klein anfangen kannst, ohne Risiko. Solange du wenig sammelst, zahlst du wenig. Wenn dein Sponsoring wächst (ab ca. 5 aktiven Sponsoren mit 40 €/Mon), spart dir Profi mehr Geld als die 12 € Aufpreis kosten — ohne Provision.

**"Was passiert in der Sommerpause?"**
> Saison-Pass läuft Aug–Mai. Juni & Juli pausieren wir automatisch — keine Kosten, kein Crawler, deine Daten bleiben.

**"Wann lohnt sich Liga?"**
> Ab 3 Mannschaften wird Liga günstiger als einzelne Profi-Lizenzen. Plus zentraler Vereins-Cockpit + Sammelrechnung — der Vorstand dankt.

---

## 8. Implementations-Konsequenzen (nicht jetzt, aber wichtig)

Wenn Konzept C beschlossen wird, ändert sich:

| Datei | Was |
|---|---|
| `docs/superpowers/specs/2026-05-19-kickpact-v1-design.md` | §6.8 + §8.4 ersetzen |
| `lib/stripe/pricing.ts` | 3 Tiers + monthly/saison/annual SKUs (also 9 Price-IDs) |
| `docs/stripe-setup.md` | neue Produkte + Price-IDs |
| `db/schema.ts` | `team_licenses.plan` enum: `spieltag` \| `profi` \| `liga` (oder bei Naming-Variante: `basic`/`pro`/`verein`); `subscriptions.billing_cycle` (`monthly`\|`saison`\|`annual`) |
| **Neu:** `lib/billing/commission.ts` | Provision-Kalkulation aus confirmed Charges. Läuft am Monats-Ende, erzeugt **KickPact-Internal-Invoice** an Verein (separate Stripe-Invoice via Subscription-Item). |
| `lib/stripe/webhook` | Handler für Provision-Invoice-Lifecycle |
| Pricing-Page `/preise` | komplett neuer Inhalt (siehe §7) |
| Onboarding Wizard Schritt 2 | "Saison-Pass empfohlen" Default + Provisions-Hinweis bei Spieltag |
| Verein-Settings `/verein/[slug]/abo` | Provision-YTD-Anzeige + Upgrade-Rechner ("Du sparst bei Profi …") |

**v1-Pragmatismus:** Provision in v1 wird als **separate Stripe-Invoice** am Monatsende erstellt (basierend auf `charges.status='confirmed'` Aggregat). Verein zahlt per Lastschrift wie Subscription. **Kein** Stripe-Connect-Skim — kommt erst in v2 mit Auto-Charge.

---

## 10. Konzept D im Detail (Empfohlene Iteration nach Feedback 2026-05-22)

### 10.1 Tier-Definition

| Tier | Monatspreis | Saison-Pass (10 Mon) | Annual (12 Mon) |
|---|---|---|---|
| **Spieltag** (Basic) | 5 €/Mannschaft | **45 €** (= 9×5, 1 Monat geschenkt) | 50 €/Jahr (= 10×5, 2 Monate geschenkt) |
| **Profi** (Pro) ⭐ | 19 €/Mannschaft | **171 €** (= 9×19) | 190 €/Jahr (= 10×19) |
| **Liga** (Vereinslizenz) | 49 €/Verein | **441 €** (= 9×49) | 490 €/Jahr (= 10×49) |

Default-Empfehlung im Onboarding-Wizard: **Saison-Pass** vorausgewählt. Sub-Option "lieber monatlich (jederzeit kündbar)" verfügbar.

### 10.2 Saison-Definition (für die App)

- **Aktive Saison:** 1. August – 31. Mai (10 Monate). Source-of-Truth: `season.starts_at` / `season.ends_at` Tabelle, default-befüllt für DFB-Spieljahre nach Region.
- **Sommerpause:** 1. Juni – 31. Juli (2 Monate). Saison-Pass-Subscriptions sind in dieser Zeit `paused` (read-only, kein Crawler, keine Charge). Monats-Abos laufen normal weiter, falls Verein bewusst nicht pausiert (Hallenfußball / Veteranen / Test-Phase).
- **Winterpause:** Mitte Dez – Anfang Feb. **Keine** Subscription-Pause — App läuft weiter, nur der Crawler findet 4-6 Wochen keine neuen Matches. Tabelle/Stats bleiben sichtbar.

### 10.3 Mid-Season-Einstieg (Onboarding nach Saison-Start)

Zwei Optionen im Wizard, abhängig vom Datum:

**Aug–Sep (Pre-Season + erste Spieltage):**
- Saison-Pass Default empfohlen (volle 10-Monats-Pass-Logik).
- Alternativ: Monats-Abo.

**Okt–Mai (laufende Saison):**
- Default ist **Monats-Abo** (klar kommuniziert: "Saison-Pass startet zur nächsten Saison im August").
- Keine Pro-Rated Saison-Pass-Variante — würde den "1 Monat gratis"-Discount kompliziert machen und psychologisch schwächen. Wer in Saison-Mitte einsteigt, hat eh nur Hin-/Rückrundenwerte und kann zur nächsten Saison committen.

**Juni–Juli (Sommerpause):**
- Pre-Saison-Frühbucher: Saison-Pass für die nächste Saison (Aug-Start) buchbar mit 1 Monat Bonus-Trial bis 1.8. → "Jetzt sichern, läuft erst zur Saison."
- Alternativ: Monats-Abo sofort (für Test/Setup-Phase im Sommer).

### 10.4 Saison-Wetten — Pre-Season-Window

**Buchbar bis 5. Spieltag der laufenden Saison** (datums-basiert pro Liga, ca. Anfang September). Danach: für die laufende Saison gesperrt, nächste Saison-Wetten ab Juli des Folgejahres buchbar.

**Begründung:**
- Sportlogisch sauber — niemand wettet in Saison-Mitte auf "Aufstieg", wenn die Tabelle schon halb durchgeprügelt ist.
- Marketing-Hebel: Saison-Auftakt-Push wird zum jährlichen Sales-Event. *"Saison-Wetten 2026/27 — bis zum 1. Spieltag buchen oder ein Jahr warten."* Verknappung, aber natürlich.
- Side-Effekt: konzentriert Sales-Aufwand auf Aug/Sep — gut für Marketing-Planung.

### 10.5 Featurematrix (Konzept D, hart)

| Feature | Spieltag (5 €) | Profi (19 €) | Liga (49 €) |
|---|---|---|---|
| **Auto-Trigger** (alle 10) | ✅ | ✅ | ✅ |
| **Manual-Trigger** (Spezial-Tor, Karten, Assist…) | ✅ Katalog | ✅ Katalog + Custom | ✅ Katalog + Custom |
| **Saison-Wetten** (6 Typen) | ❌ | ✅ | ✅ |
| **Custom-Trigger-Texte** | ❌ | ✅ | ✅ |
| **Sponsoren-Cap pro Team** | **max 5 aktiv** | ∞ | ∞ |
| **Pledge-Rules pro Sponsor** | **max 3** | ∞ | ∞ |
| **Match-Historie** | aktuelle Saison | ∞ | ∞ |
| **PDF-Branding** | KickPact-Footer | **Vereins-Logo, kein Footer** | + Multi-Team-Sammel-PDF |
| **E-Mail-Absender** | KickPact | **Vereins-Identität (Reply-To)** | Vereins-Identität |
| CSV/Excel-Export | ❌ | ✅ | ✅ |
| Sponsor-Stats-Widgets | ❌ | ✅ | ✅ |
| Embed-Widget für Vereins-Website | ❌ | ✅ | ✅ |
| Pledge-Discovery (öffentl. Profil) | ❌ | ✅ | ✅ |
| Sponsor-Newsletter (auto-monatlich) | ❌ | ✅ | ✅ |
| Saison-Recap-PDF | ❌ | ✅ | ✅ + Vereins-aggregiert |
| User-Rollen | 1 Admin | + Trainer/Viewer | + Multi-Admin (10) |
| **Master-Admin-Cockpit** | ❌ | ❌ | ✅ |
| **Cross-Team-Sponsor-View** | ❌ | ❌ | ✅ |
| **Konsolidierte Monats-Rechnung** | ❌ | ❌ | ✅ |
| **White-Glove-Onboarding-Call** | ❌ | ❌ | ✅ (60 Min) |
| **Custom Domain** (v2) | ❌ | ❌ | ✅ |
| **Priority Support** | Email, 48 h | Email, 24 h | Email + WhatsApp, 4 h |
| **Trial** | 30 Tage | 30 Tage | 30 Tage |
| **Provision auf Pledges** | **0 %** | **0 %** | **0 %** |

**Wo der Druck wirklich sitzt:**
- **Sponsoren-Cap 5** — Pate + Eltern + 1 Lokalsponsor = 7 → Cap überschritten. Pro nötig sobald 6. Sponsor reinkommt.
- **Pledge-Rules-Cap 3 pro Sponsor** — ein engagierter Sponsor mit "5 €/Tor + 10 €/Sieg + 20 €/Hattrick + 30 €/Aufstieg" hat schon 4 Rules. Hattrick muss raus oder Aufstieg muss raus. Trigger-Frust = Pro-Push.
- **Saison-Wetten + Custom-Trigger nur in Pro** — die *unterhaltsamen* Trigger fehlen in Basic. Sponsor-Akquise leidet → Verein upgradet.
- **Branding (Logo + Mail-Absender)** — Vorstand will keinen KickPact-Footer auf der Vereins-Rechnung. Status-Marker.

### 10.6 Math: Pilot- & Skalierungs-Szenarien

#### Pilot "1 Mannschaft, 6 Sponsoren × 30 €/Mon = 180 €/Mon Pledges"

| Plan | Mon-Kosten | Saison-Pass (10 Mon) |
|---|---|---|
| Spieltag | 5 € — aber Cap 5 Sponsoren ❌ funktioniert nicht | 45 € (untauglich, 6 > Cap 5) |
| **Profi** | **19 €** | **171 €** |
| Liga | 49 € (overkill für 1 Team) | 441 € |

→ Bei 6 Sponsoren ist Spieltag schon nicht mehr ausreichend. Pro = klare Wahl.

#### "Probier-Phase 1 Mannschaft, 2 Sponsoren × 20 €"

| Plan | Mon-Kosten |
|---|---|
| **Spieltag** | **5 €** ✓ funktioniert, sehr klein |
| Profi | 19 € — overkill für 2 Sponsoren |

→ Basic hat eine echte Daseinsberechtigung: "Lass uns mit dem Trainer + 1 Sponsor testen". Saubere Land-Grab-Variante.

#### "Aktiver Verein 4 Mannschaften, je 7 Sponsoren × 35 €"

| Plan | Mon-Kosten |
|---|---|
| 4× Profi (4×19) | 76 €/Mon |
| **Liga** (49 €) | **49 €/Mon** ⭐ spart 27 €/Mon (= 35 %) + Master-Cockpit + Sammelrechnung |

→ Liga eindeutig. Skaliert mit Verein-Größe.

#### Pre-Season-Frühbucher "Liga-Pass kauft im Juli"

- 441 € jetzt (statt 49 €/Mon × 10 = 490 €) → 49 € Ersparnis (= 1 Monat geschenkt)
- Plus: Sub läuft Aug–Mai, Juni/Juli automatisch pausiert
- Plus: Saison-Wetten alle bis 5. Spieltag freigeschaltet
- **Sales-Pitch im Juli/Aug:** *"Saison-Pass jetzt sichern — 1 Monat geschenkt + Saison-Wetten 2026/27. Beides ab 1. Sep nicht mehr verfügbar."*

#### KickPact-Revenue Pilot (3 Mannschaften, alle auf Liga)

- Liga-Pass: **441 €/Saison** für den ganzen Verein
- Status Quo: 3 × 9 € × 12 = 324 € (Basic, MRR) ODER 49 × 12 = 588 € (Vereinslizenz)
- Konzept D: 441 € (Liga-Pass mit Pre-Commit) bzw 490 € (Annual ohne Pause)

**Vergleich pro Saison:**

| Modell | Pilot (3 MS, 540 €/Mon Pledges) | Großverein (12 MS, 2.880 €/Mon Pledges) |
|---|---|---|
| Status Quo (Vereinslizenz) | 49 × 12 = **588 €** | 49 × 12 = **588 €** (Volumen wird nicht monetarisiert) |
| Konzept C (mit Provision) | 590 € | 590 € + (in C wäre Verein 59 € + 0 %) |
| **Konzept D (Liga-Pass)** | **441 €** | **441 €** |

→ Konzept D ist auf den ersten Blick *weniger* MRR pro Verein als Status-Quo-Vereinslizenz — aber:
1. Status Quo verkauft den Verein nicht überzeugend (1 Feature). Konzept D verkauft den Verein viel besser → mehr abgeschlossene Liga-Lizenzen.
2. Wir verlieren das Volumen-Argument, aber gewinnen Conversion + Klarheit. **Adoption × Saubereit > Cleverness**.
3. Annual-Plan (490 €) für ganzjährige Vereine ist noch Headroom.

Wenn Volumen-Monetarisierung später doch reinkommen soll, kann das v2 als optionales "KickPact-Settle" Feature (Stripe-Connect) mit Premium-Tier rein. Für v1: Klarheit.

### 10.7 Saison-Pass-Mechanik (Implementations-Hinweis)

In Stripe:
- 3 Tiers × 3 Billing-Zyklen = **9 Price-IDs** (Monthly, Season, Annual je Tier)
- Saison-Pass = Stripe-Subscription mit `billing_cycle_anchor = next_aug_1`, Renewal jährlich am 1.8. + Pause-Schedule Jun/Jul
- Alternativ technisch sauberer: Saison-Pass = einmaliger Stripe-Invoice für 9× Monatspreis, gefolgt von Subscription-Aktivierung mit Trial bis Aug-1-folgejahr → re-billed manuell oder via Inngest-Cron im Juli
- Beide Optionen möglich. Tendenz: **erste Variante** (echte Subscription mit Pause-Phasen), weil simpler beim Renewal-Flow.

### 10.8 Microcopy Update (Konzept D)

**Hero (Pricing-Seite):**
> **Behalte 100 % deiner Pledges. Wir leben von Lizenzen, nicht Provisionen.**

**Tier-Karten (Reihenfolge Liga · Profi ⭐ · Spieltag):**

🏆 **Liga — 49 €/Verein/Monat** *(441 € als Saison-Pass)*
> Alle Mannschaften, ein Tarif. *Unter 1 € pro Spieler bei 50-Mann-Verein.*
> Alles aus Profi · Master-Admin · Sammelrechnung · WhatsApp-Support · Onboarding-Call

⚽ **Profi — 19 €/Mannschaft/Monat** ⭐ *Beliebteste · (171 € Saison-Pass)*
> Für aktive Sponsoring-Setups.
> Unlimited Sponsoren · Saison-Wetten · Custom-Trigger · Vereins-Logo · CSV · Embed-Widget · Newsletter

🎯 **Spieltag — 5 €/Mannschaft/Monat** *(45 € Saison-Pass)*
> Zum Reinkommen. 1–5 Sponsoren in der Familie tracken.
> Alle Auto- und Manual-Trigger · keine Saison-Wetten · KickPact-Footer · max 5 Sponsoren

**FAQ-Snippets:**

*"Was passiert in der Sommerpause?"*
> Saison-Pass-Lizenzen pausieren automatisch im Juni/Juli. Du zahlst nichts, dein Crawler ruht, deine Daten bleiben. Am 1. August geht's mit der neuen Saison wieder los — Saison-Pass renewt sich zu deinem alten Preis (1 Monat Vorab-Kündigungsrecht).

*"Was, wenn ich mitten in der Saison einsteige?"*
> Dann startest du am besten mit dem Monats-Abo (jederzeit kündbar) und wechselst zur nächsten Saison auf den Saison-Pass — der spart dir 1 Monat.

*"Kann ich Saison-Wetten auch später anlegen?"*
> Nur bis zum 5. Spieltag. Danach ist die Saison schon zu weit, um sinnvoll auf Aufstieg/Klassenerhalt zu wetten. Ab 1. Juli sind die Wetten für die nächste Saison wieder freigeschaltet.

---

## 9. Offene Fragen für dich (Johannes) — Iteration 2

Nach Feedback geklärt:
- ✅ **Provision raus auf allen Tiers**
- ✅ **Sprung Basic → Pro deutlich größer**
- ✅ **Saison-Logik integriert** (10 Mon Aug–Mai, Saison-Pass mit 1 Mon Rabatt, Sommerpause kostenlos)
- ✅ **Saison-Wetten Pre-Season-Window** (bis 5. Spieltag)

Noch zu entscheiden:

1. **Naming** — mein Pick weiterhin **Spieltag / Profi / Liga**. Fallback: Start / Pro / Verein, oder bestehend Basic/Pro/Vereinslizenz. Magst du den sport-deutschen Sound (passt zum Brand-Pitch) oder bleibt's klassisch?
2. **Basic-Cap Sponsoren** — mein Vorschlag **5**. Härter wäre 3 (echter Probiermodus), weicher wäre 8 (Familien-Sponsoring + 1-2 Lokale möglich). 5 fühlt sich für mich am ehrlichsten an. Dein Bauchgefühl?
3. **Pledge-Rules-Cap Basic** — mein Vorschlag **3 pro Sponsor**. Erlaubt "5 €/Tor + 10 €/Sieg + 20 €/Aufstieg" (3 Rules), aber spätestens beim engagierten Sponsor mit "Spezial-Tor + Hattrick + Aufstieg + 5 €/Tor" wird's eng. Stärkster Upgrade-Anreiz im Basic-Tarif. OK so?
4. **Vereinslizenz-Preis** — bleibt bei **49 €** (mein Pick, da Break-Even bei 3 Mannschaften logisch passt) oder 59 € (klarerer Sprung)? Ohne Provision wirkt 49 € ausreichend differenziert für mich.
5. **Annual-Plan (12 Monate ganzjährig, 2 Mon Rabatt) zusätzlich anbieten?** Brauchen Hallenfußball/Veteranen-Vereine, die im Sommer auch spielen. Wenn ja: 50/190/490 €/Jahr als 3. Billing-Cycle-Option.
6. **Saison-Wetten Pre-Season-Cutoff** — 5. Spieltag (= ca. Anfang September) oder striktere "bis 1. Spieltag" (= ca. 15.8.)? Strikter macht den FOMO-Hebel stärker, lockerer ist freundlicher für Late-Onboarder.
7. **White-Glove-Onboarding-Call (Liga)** — bereit, 60-Min-Call pro Liga-Verein zu machen? Falls nein: Loom-Video + Setup-Doc als Liga-Bonus.

Wenn 1–7 beantwortet:
- Spec §6.8 + §8.4 updaten,
- Plan-Doc "Pricing v2 Implementation" schreiben (Stripe-Produkte: 9 Price-IDs, Saison-Pass-Subscription-Lifecycle mit Pause-Phasen, Pre-Season-Window für Saison-Wetten in Pledge-Wizard-Validation, Pricing-Page-Redesign, Onboarding-Wizard-Update für Mid-Season-Logik),
- Pricing-Page mit `ui-ux-pro-max` Skill neu bauen.
