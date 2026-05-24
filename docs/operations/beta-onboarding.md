# Beta-Onboarding-Playbook

> **Ziel:** 3 Pilot-Vereine im Raum Heidelberg in 4 Wochen onboarden, ≥1 Sponsor pro Verein, ≥1 confirmed Charge.

## 1. Vereins-Pitch (kopierbar)

> **Hi [Trainer-Name],**
>
> wir bauen KickPact — eine kleine Plattform, mit der Familie und lokale Sponsoren eurer Mannschaft pro Tor, pro Sieg oder pro Saison-Aufstieg einen kleinen Betrag versprechen können. Spielergebnisse holen wir automatisch von Fußball.de, am Monatsende kommt eine PDF-Rechnung an den Sponsor. Kein Provisionsabzug — was zugesagt wird, kommt 1:1 bei euch an.
>
> Wir suchen aktuell **3 Pilot-Vereine im Raum Heidelberg**, die uns 4 Wochen lang testen — kostenlos, ohne Verpflichtung. Im Gegenzug:
> - direkter Draht zu uns (WhatsApp), schnelle Bugfixes
> - kostenloser Vereinslizenz-Tarif für die erste komplette Saison (sonst 49 €/Mon)
> - mitgestaltet, wie das Produkt funktioniert
>
> 15 Minuten Setup-Call? Antwort genügt.
>
> Beste Grüße,
> Johannes

## 2. Onboarding-Klick-Checklist (für Trainer, ~10 Min)

1. ✅ Einladungs-Link aus E-Mail klicken
2. ✅ Magic-Link bestätigen (oder Google-Login)
3. ✅ Vereinssuche: Name eintippen → Treffer wählen
4. ✅ Mannschaft auswählen (Herren 1 als Default)
5. ✅ Plan: **Vereinslizenz · Saison-Pass** (kostenlos für Pilot)
6. ✅ Stammdaten: Adresse, IBAN (für die spätere Rechnung)
7. ✅ Sponsor-Einladungslink kopieren
8. ✅ Link an 1–2 erste Sponsoren weitergeben (WhatsApp/E-Mail)

**Done.** Crawler läuft binnen 6 Stunden, erste Spielergebnisse erscheinen automatisch im Dashboard.

## 3. Häufige Probleme + Workarounds

| Problem | Workaround |
|---|---|
| Mannschafts-Suche findet nichts | Manuell `fussballdeTeamId` via `scripts/onboard-real-club.ts --team-id <id>` setzen |
| Magic-Link-Mail kommt nicht | Spam-Ordner; falls leer → Resend-Logs prüfen (`logs.resend.com`), Trainer-Mail manuell whitelisten |
| Kader-Liste leer | Fußball.de zeigt Kader oft erst nach 1. Saisonspiel; Sponsor-Picker fällt auf Namen-Eingabe zurück |
| Erstes Spiel taucht nicht auf | Crawler-Cron alle 6h; manuell triggern via `npm run inngest:dev` → "crawl-matches" |
| Sponsor will Trigger-Typ den's nicht gibt | "Custom"-Trigger nutzen (Profi-Plan), Verein bestätigt manuell |

## 4. Beta-Feedback-Vorlage

Jede Pilot-Woche 1 kurzes Sync (WhatsApp-Nachricht reicht):

> **Woche [N] — [Verein]**
> - Was hat geklappt: ...
> - Was war komisch / kaputt: ...
> - Was würdet ihr eher haben wollen: ...
> - Wie viele Sponsoren habt ihr angeschrieben? Wie viele haben zugesagt?

Antworten als GitHub-Issue im Repo `kickpact/beta-feedback` (private) ablegen mit Label `verein:<slug>`.

## 5. Erfolgs-Metriken nach 4 Wochen

| Metrik | Mindestziel | Stretch |
|---|---|---|
| Onboarding fertig (Trainer durch alle 4 Schritte) | 3/3 Vereine | — |
| ≥1 Sponsor pro Verein eingeladen + onboarded | 3/3 | — |
| ≥1 Pledge pro Verein erstellt | 3/3 | ≥3 Pledges/Verein |
| ≥1 confirmed Charge | 2/3 | 3/3 |
| Trainer würde KickPact weiterempfehlen (NPS) | ≥7/10 ø | ≥9/10 |
| Bug-Reports | < 5 critical | 0 |

**Nach Beta-Ende:** Auswertung in `docs/operations/beta-retrospective.md`, daraus Backlog für nächsten Sprint.

## 6. Notfall-Kontakte

- **Tech-Support:** Johannes (WhatsApp +49 …)
- **Status-Page:** `status.kickpact.de` (UptimeRobot)
- **Stripe-Webhook-Logs:** `dashboard.stripe.com/events`
- **Drift-Detection-Issues:** GitHub-Repo `kickpact/kickpact` Label `drift`
