# Plan: Wachstums-Features — Referral, Saison-Recap & Trial-End-UX

**Stand:** 2026-06-02 · Status: **Entwurf, noch nicht umgesetzt**

> **Kontext / Leitstern (Johannes, 2026-06-02):** Das Pricing-Ziel ist **möglichst viele Vereine + Mund-zu-Mund-Propaganda**, nicht Umsatz-Maximierung pro Verein. Jeder startet 30 Tage auf **Pro** (ohne Kreditkarte); Pro ist das Ziel, **Basic ist nur der Schnupper-/Auffang-Boden**. Diese vier Features sind die Wachstumsschleifen, die dieser Strategie aktuell fehlen. Vgl. [docs/pricing.md](../../pricing.md) und Memory `project_positioning_philosophy` (Community/Gaudi, weiches Framing, 0 % Provision).

Begleitend bereits erledigt (2026-06-02): **Annual-Cycle komplett entfernt** — nur noch Monatlich + Saison-Pass.

---

## Feature 1 — Referral-Loop in der Sponsor-Einladung 🔴 (größter Hebel)

**Ziel:** Jeder eingeladene Sponsor (oft selbst lokaler Unternehmer mit Vereins-Kontakten) wird zum Multiplikator. Word-of-Mouth einbauen, nicht erhoffen.

**Scope:**
- Im Sponsor-Onboarding / Sponsor-Dashboard ein dezenter, community-warmer Hook: *„Kennst du einen anderen Verein, dem das helfen würde?"* → teilbarer Link / vorausgefüllte Empfehlung.
- Tonalität weich (kein aggressives Affiliate-Framing), passend zur Community-Seele.
- Tracking: Woher kam ein neuer Verein? (Attribution-Quelle auf `clubs` oder eigene `referrals`-Tabelle).

**Key-Files (zu verifizieren):** Sponsor-Einladungs-Flow (`lib/db/queries` + Sponsor-Dashboard-Komponenten), Mail-Templates (`lib/mail/templates/`).

**Offene Fragen:**
- Belohnung für den werbenden Sponsor? (Eher nein — Sponsoren zahlen nie etwas an KickPact, also kein monetärer Anreiz; rein „gönnen"/Community.)
- Reicht ein generischer Share-Link oder pro-Sponsor-Tracking-Code?

---

## Feature 2 — Verein-wirbt-Verein: 30 Tage Pro geschenkt 🟠

**Ziel:** Direkter Vereins-zu-Vereins-Empfehlungs-Loop mit beidseitigem Anreiz.

**Scope:**
- „Empfiehl einen Verein — **ihr beide bekommt 30 Tage Pro geschenkt**."
- Mechanik: Referral-Code/Link pro Verein. Bei erfolgreicher Aktivierung des geworbenen Vereins → beiden Vereinen 30 Tage Pro-Gutschrift (Trial-Verlängerung bzw. Stripe-Coupon/Credit).
- Passt zur Seele: „gönnen", kein Rabatt-Geschacher.

**Key-Files:** `subscriptions`/`teamLicenses`-Logik, Trial-Verlängerung in `lib/actions/subscriptions.ts`, ggf. Stripe-Coupons. Gemeinsame `referrals`-Tabelle mit Feature 1.

**Offene Fragen:**
- Umsetzung der „30 Tage geschenkt": Trial-Verlängerung (vor erstem Checkout) vs. Stripe-Credit (bei bestehendem Abo)? Beides nötig?
- Missbrauchs-Schutz (Self-Referral, Fake-Vereine)? Kopplung an `clubs.verifiedAt`.
- Cap auf Anzahl Gratis-Monate pro Verein?

---

## Feature 3 — Saison-Recap „Spotify Wrapped" fürs Vereinsjahr 🟠 (Marketing-Motor)

**Ziel:** Teilbares, emotionales Jahres-Recap als organischer Sichtbarkeits-Kanal. „Unsere Mannschaft hat diese Saison X € erspielt" — instagramable.

**Scope:**
- **Hochkant-/Story-Format** (9:16), Instagram-/WhatsApp-Status-tauglich.
- Datenpunkte: Total erspielt, Top-Sponsor, Top-Event/Trigger, Anzahl Tore/Spiele, schönster Moment, „Most Valuable Sponsor", evtl. animiert.
- Teilen-Flow: Bild/Sequenz generieren + Download/Share. KickPact-Branding dezent drauf (Wachstums-Vektor).
- Bestehender Bezug: Pro hat bereits ein „Saison-Recap-PDF" (siehe docs/pricing.md §3) — **dies hier ist die share-optimierte, visuelle Schwester davon**, nicht die Vorstands-PDF.

**Tech-Optionen (zu entscheiden):**
- Statisches Bild (HTML→Screenshot, wie Social-Photos-Ansatz) vs. animiertes Video (Remotion — MCP `remotion` ist verfügbar).
- `@react-pdf/renderer` ist für PDFs gesetzt (CLAUDE.md), aber für Story-Bilder ungeeignet → eher HTML→Screenshot oder Remotion.

**Key-Files:** neuer Recap-Generator (`lib/recap/` o.ä.), Datenaggregation aus `charges`/`pledges`/`pledgeRules`, Inngest-Job für Saison-Ende.

**Offene Fragen:**
- Bild oder Video (oder beides)?
- Welche Tier-Stufe? (Vorschlag: bewusst auch für Basic sichtbar/teilbar — es ist ein Wachstums-Asset, kein Premium-Gate. Widerspricht „push-to-Pro" leicht, dient aber dem Leitstern „Verbreitung".)
- Art-Direction: mit `ui-ux-pro-max` / `banner-design` / `imagegen-frontend-*` Skills entwerfen.

---

## Feature 4 — Trial-End-UX: Loss-Framing statt Brick Wall 🟠

**Ziel:** Am Trial-Ende den Wechsel zu Pro als **Sog** gestalten (Verlust-Vermeidung), nicht als Sperre. Drei Zustände:

1. **Aktiver Verein (hat Daten):** *„Jetzt upgraden. Wenn ihr auf Basic wechselt, verliert ihr: X Sponsoren (über dem 5er-Limit pausiert), Y Pledge-Rules, Saison-Wetten, euer Logo auf der Rechnung … In Pro bleibt alles."* — konkret mit echten Zahlen aus den Daten des Vereins.
2. **Verein ohne/ kaum Daten:** anderes Framing — kein Verlust-Hebel sinnvoll → ermutigend/onboarding-orientiert („Richtet euren ersten Sponsor ein, dann zeigt sich der Wert").
3. **Downgrade-Mechanik:** Beim Wechsel Pro→Basic Sponsoren über Cap (5) + Pledge-Rules über Cap (3) **graceful pausieren** (nicht löschen!), reaktivierbar mit Pro.

**Key-Files:** Abo-Panel (`app/(verein)/verein/[slug]/abo/_components/abo-panel.tsx`), `lib/billing/plan-features.ts` (Cap-Logik), Trial-Reminder-Mails (docs/pricing.md §8: 7d/3d/1d), Grace-Period-Logik.

**Bezug zu bestehender Logik:** Trial-Logik + Grace-Period existieren bereits (docs/pricing.md §8). Hier kommt die **datengetriebene Verlust-Anzeige** + **graceful Downgrade** dazu.

**Offene Fragen:**
- Werden überzählige Sponsoren/Rules bei Downgrade wirklich „pausiert" (neuer State) oder nur ausgeblendet? DB-State nötig.
- Genaue Schwelle für „Verein ohne Daten" (0 Sponsoren? 0 Charges?).

---

## Reihenfolge-Vorschlag

1. **Feature 4 (Trial-End-UX)** — wirkt sofort auf die Conversion der bereits eintreffenden Trials; kleinster Blast-Radius (eine Komponente + Cap-Logik).
2. **Feature 1 (Referral in Sponsor-Einladung)** — größter Wachstumshebel, baut die `referrals`-Grundlage.
3. **Feature 2 (Verein-wirbt-Verein)** — nutzt dieselbe `referrals`-Grundlage.
4. **Feature 3 (Saison-Recap)** — größtes Einzel-Feature, eigenes Art-Direction-Brainstorming, terminlich ans Saison-Ende gekoppelt.

Jedes Feature verdient vor Umsetzung ein kurzes `brainstorming` (Intent/Anforderungen) und ggf. eigenen Detail-Plan via `writing-plans`.
