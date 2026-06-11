# Phase 4: Journey/UX-Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Journey-/UX-Findings des Audits 2026-06-11 fixen — Sackgassen weg, Terminologie sauber, Empty-States lebendig, Kontrast/Pill konsistent, Web/SEO rund.

**Architecture:** 3 parallele Pakete mit disjunkten Dateimengen (A: Sponsor-Journey, B: Verein-Journey, C: Terminologie/Empty-States/Design-Sweep/Web). KEINE Schema-Migrationen in dieser Phase. UI-Verifikation: tsc + bestehende Tests; visueller Smoke folgt in Phase 6 auf Staging (kein lokaler Dev-Server — Projektregel).

**Tech Stack:** Next.js 15 App Router (Server Components default), Tailwind 3.4 + shadcn/ui, react-hook-form im Builder, Resend-Mails.

---

## Verbindliche Regeln
- Terminologie: Pledge=„Pact", PledgeRule=„Regel", Charge=„Beitrag", „Saison-Ziel" statt „Saison-Wette". Roh-Trigger-Keys NIE im UI — immer triggerLabel().
- „Scraping"/Quelle nie namentlich im Kunden-UI → neutral „Automatische Spieldaten" (Landing/Datenschutz: fussball.de-Nennung wo rechtlich nötig ok).
- Mobile-First; iOS-Design-System: Pill-Buttons (<Button>-Komponente), shadow-only-Cards.
- DB nur via lib/db/queries-Layer.

## Paket A — Sponsor-Journey
1. **Ergebnis-Push-Sackgasse:** notify-match-result deep-linkt Sponsoren auf `/verein/<slug>/mannschaft/<id>` → Guard bounced Nicht-Mitglieder. Fix: Sponsoren erhalten Deep-Link auf das öffentliche Profil `/m/<publicSlug>` (Fallback: `/sponsor`); Vereins-Mitglieder weiter den internen Link (Empfänger-Logik ansehen).
2. **Stiller Submit-Fail Wizard-Step 4:** form.handleSubmit ohne onInvalid; Fehler hängen an unmounteten Step-3-Feldern. Fix: onInvalid-Handler → Toast mit konkretem Fehler + Step-Rücksprung zum ersten fehlerhaften Feld.
3. **Sommerpause unerklärt:** Pacts springen am 1.6. kommentarlos auf „Pausiert". Fix: eigenes Badge/Hinweis „Sommerpause" wenn sommerpausePaused=true (Status-Toggle + Pact-Liste + Detail), Tooltip/Text: automatische Reaktivierung am 1.8., Spiele bis Saisonende zählen weiterhin.
4. **Sub-Sponsoren-Copy entfernen** (sponsor/onboarding/page.tsx:41-44) — Feature existiert nicht und ist lt. Spec 1.1 bewusst raus (Account-Sharing). Copy ersatzlos streichen bzw. durch Account-Sharing-Satz ersetzen.
5. **Abgelaufene Einladung = weiche Sackgasse:** Discover-Card/Anfragen-Liste bieten keinen Weg, neu anzufragen. Fix: abgelaufene angenommene Einladung → „Erneut anfragen"-Button (re-used Inquiry-Flow).
6. **approval-row.tsx Subtypen-Labels:** eventLabel mappt eckentor/tor_mittellinie/sonstiges nicht → rohe Strings. Fix: Labels aus special-goals.ts (single source) ableiten.
7. **Saison-Regel-Window-Hinweis in Step 2:** Wett-Fenster (Cutoff 5. Spieltag) wird erst am Wizard-Ende serverseitig abgelehnt. Fix: Window-Status in Step 2 anzeigen + Saison-Trigger disablen, wenn zu (Server-Check bleibt).
8. **Inquiry/Approval-Actions werfen:** createSponsorInquiry/confirmApproval/disputeApproval werfen Error → Production redacted. Fix: {ok,message}-Returns (Pattern aus create-pledge.ts), Aufrufer-UI zeigt message.

## Paket B — Verein-Journey
1. **Coverage-Kommunikation:** (a) Onboarding filtert Coverage-none-Teams kommentarlos → stattdessen anzeigen mit Erklärung „Für diese Altersklasse liefert die automatische Spieldaten-Quelle keine Ergebnisse — Ereignisse können manuell gemeldet werden" + Team trotzdem anlegbar; (b) Pacts-Tab/available-triggers zeigt bei results_only-Teams für Torschützen-Trigger den Hinweis „wird manuell gemeldet" statt „automatisch erkannt"; (c) Spiele-Empty-State verspricht Automatik nur bei Coverage full/results_only.
2. **Onboarding Check A verdrahten:** findLicensedVereinByFussballdeId in die Mannschafts-Suche einbauen (Spec 2026-05-29 §4): Hinweis „Verein ist bereits mit Lizenz auf KickPact" + CTA „Beitritt unter Vereinslizenz anfragen" (bestehende Membership-Request-Infrastruktur).
3. **Spezialtor-Mirror:** manual-event-editor.tsx hardcodet eigene Subtypen-Liste (volley/fernschuss/…), die kein Pact matchen kann. Fix: Liste aus special-goals.ts ableiten (single source), Server-Action validiert subtype gegen das Enum; nicht mehr wählbare Alt-Subtypen bleiben in Bestands-Daten gültig.
4. **Mitglieder-Invite-Mail:** Invite-Formular speichert E-Mail, sendet aber nie. Fix: Mail-Template team-einladung (Pattern bestehender Mails), Versand in invite.ts, Copy-Link bleibt als Fallback.
5. **„Team/Verein verlassen":** Self-Service-Austritt für Nicht-Admins (Konto-Seite oder Mitglieder-Liste), nutzt bestehende revoke-Queries mit Self-Check; letzter Admin darf nicht austreten.
6. **Toter Empty-State-CTA** mannschaften/page.tsx:27 → auf `/mannschaften/neu`.
7. **canMarkPaid nach Rolle** (abrechnungen/page.tsx:56): nur Admins, statt hart true.
8. **saisonLabel:** Team-Übersicht reicht rohes team.saison an SeasonStatusBlock („2526") → saisonLabel() aus lib/utils/saison.ts (auch SeasonStatusBlock-Anzeige „Saison-Endstand 2627 läuft noch" → Vorsaison-Kontext aus resolveSeasonResultTarget spiegeln, siehe Phase-3-K2-Niedrig-Befund).
9. **Team-scoped Invite-Gate serverseitig** (…/sponsoren/_actions/invite.ts:14): verifiedAt-Check wie in der Club-Action.

## Paket C — Terminologie / Empty-States / Design-Sweep / Web
1. **Terminologie-Sweep:** „Saison-Wetten"→„Saison-Ziele" (mannschaft/[teamId]/page.tsx:186, abo-panel.tsx:269+361), „Charges"-Nav-Label→„Beiträge" (verein-sub-nav.tsx:82), „Keine Charges/Pledges"→„Beiträge/Pacts" (match-detail-view.tsx:240, sponsor-charges-table.tsx:142, sponsor/[sponsorId]/page.tsx:99+261, manual-event-editor-Toasts, event-row-actions, result-override-editor), Storno-Mail „Charge"→„Beitrag" + triggerLabel() (charges/_actions/cancel.ts:48-66), „Sponsor-Wetten"→„Sponsor-Pacts" (datenschutz/page.tsx:176), Toasts in lib/actions/pledges.ts („Pledge nicht gefunden"→„Pact…"). Grep-basiert vollständig arbeiten, nicht nur diese Liste.
2. **Empty-State-Offensive:** components/shared/empty-state.tsx (bisher 0 Verwendungen) einsetzen: (a) Verein-Dashboard bekommt „Nächste Schritte"-Sektion analog Sponsor (Verifikation? Sponsoren einladen? Erste Mannschaft?) statt vier 0,00-€-Kacheln solo; (b) Spiele-Empty-State der Mannschaft aktiv („Saison startet bald — lade jetzt Sponsoren ein…" + CTA); (c) die wichtigsten grauen Inline-Empty-States auf die Komponente migrieren (mind. Sponsor-Pacts-Liste, Beiträge-Tabellen).
3. **Kontrast + Pill in EINEM Sweep:** text-brand-night-navy/40 und /30 → /60 (102 Stellen, sed-fähig; /30 für dekorative Icons darf bleiben — mit Augenmaß, dekorative aria-hidden-Icons ausnehmen); die 23 Ad-hoc-CTA-Links (rounded-lg/xl bg-accent) auf <Button asChild><Link…></Button> umstellen (bringt Pill + Focus-Ring + Press-Feedback).
4. **eur()-Deduplizierung:** lib/utils/currency.ts mit eur()/eurNoSign(); die ~20 lokalen Kopien importieren um (mechanisch, Verhalten identisch de-DE).
5. **Web/SEO:** (a) Title-Duplikat /m/[slug] („… | KickPact – KickPact"); (b) Team-Profile + /mannschaften in sitemap.ts (nur production-env); (c) og:url auf Landing; (d) Landing-<title> mit „KickPact – " Präfix; (e) /status hinter Admin-Gate oder Token (rohe Trigger-Keys + Interna öffentlich); (f) loading.tsx für /konto und /m/[slug] (Skeleton-Pattern der bestehenden loading.tsx); (g) Galerie-alt-Texte (gallery-strip.tsx:21 — „Mannschaftsfoto <Teamname> <n>"); (h) sponsor/mannschaften/page.tsx DB-Zugriff in den Query-Layer verschieben.

## Abschluss
- Voller npm test + tsc, adversarial-review, Merge + Push auf main.
