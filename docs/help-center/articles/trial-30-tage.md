---
title: "Trial — 30 Tage testen ohne Risiko"
slug: "trial-30-tage"
category: "tarife-pricing"
category_label: "Tarife & Pricing"
prio: "MUSS"
audience: ["verein-admin", "vereinslizenz-admin"]
related_articles:
  - "welcher-tarif-passt"
  - "saison-pass-vs-monatlich"
  - "kuendigung-und-pause"
last_updated: "2026-05-25"
status: "published"
---

Jeder Verein, der KickPact zum ersten Mal startet, bekommt **30 Tage Trial** auf dem gewählten Tarif. Volle Funktionalität, keine Kreditkarten-Vorab-Belastung, keine versteckten Sperren. So funktioniert es.

## Was im Trial drin ist

Alles, was im gewählten Tarif drin ist. Heißt:

- **Basic-Trial**: 5 Sponsoren, 3 Regeln pro Sponsor, Standard-Trigger.
- **Pro-Trial**: Unbegrenzte Sponsoren und Regeln, Saison-Ziele, Custom-Trigger.
- **Vereinslizenz-Trial**: Pro-Funktionen × beliebige Mannschaften, Master-Cockpit, 10 Admin-Slots.

Du kannst Sponsoren einladen, Pacts aktivieren, Beiträge erzeugen — wie wenn du bezahlt hättest. Im Trial-Zeitraum erstellte Pacts und Beiträge bleiben **auch nach Konvertierung zum Bezahl-Abo erhalten**.

## Wann der Trial startet

Mit dem **ersten erfolgreichen Onboarding-Schritt** — also wenn du den Vereins-Wizard abgeschlossen hast und auf das Dashboard kommst. Nicht mit dem Signup, nicht mit dem ersten Login. Erst wenn die Mannschaft fertig konfiguriert ist.

KickPact merkt sich das Trial-Startdatum pro Mannschaft. Wenn du später eine zweite Mannschaft hinzufügst, bekommst du für diese **noch 14 Tage Trial** zusätzlich (siehe [Mannschaft hinzufügen](mannschaft-hinzufuegen.md)).

## Reminder-Mails während Trial

KickPact schreibt dich proaktiv an:

- **Tag 1** — Welcome-Mail mit Onboarding-Tipps.
- **Tag 7** — Check-in: "Wie läufts? Brauchst du Hilfe?"
- **Tag 21** — "9 Tage noch bis Trial-Ende. Lust auf Abo?"
- **Tag 28** — "Letzte 48 Stunden im Trial. Hier ist dein Upgrade-Link."
- **Tag 30** — Trial-Ende.

## Was nach Tag 30 passiert

Drei Szenarien:

### Szenario A — Du hast eine Zahlungsmethode hinterlegt

Stripe versucht automatisch, das erste Monats- oder Saison-Pass-Abo zu belasten. Wenn das klappt:

- Trial endet.
- Abo läuft normal weiter.
- Du kriegst eine Quittung per Mail.
- Alle bisher erstellten Daten (Sponsoren, Pacts) laufen unverändert weiter.

Wenn die Belastung **fehlschlägt** (Karte abgelaufen, Limit erreicht):

- Stripe versucht es 3× in den nächsten Tagen.
- Du kriegst Mails mit "Zahlung fehlgeschlagen, bitte aktualisiere deine Karte".
- Nach 7 Tagen ohne erfolgreiche Zahlung → **Grace Period endet**, siehe unten.

### Szenario B — Du hast keine Zahlungsmethode hinterlegt

- Trial endet.
- Verein geht in **Grace Period** für 7 Tage.
- Sponsoren-Einladungslinks funktionieren weiter (sodass keine Anfragen ins Leere laufen).
- Du kannst weiter alles ansehen, **aber keine neuen Pacts aktivieren** und **keine Manual-Events bestätigen**.
- Automatische Spieldaten laufen weiter, Auto-Trigger feuern weiter — du siehst die Beiträge, sie sind aber als "pending" markiert.

Nach Grace Period (7 weitere Tage = Tag 37 ab Trial-Start):

- Mannschaft geht in **Read-Only-Modus**.
- Alle Daten bleiben sichtbar.
- Keine neuen Beiträge, keine neuen Pacts, keine Sponsoren-Einladungen.
- Verein kann jederzeit reaktivieren durch Hinterlegung einer Zahlungsmethode.

### Szenario C — Du upgradest aktiv im Trial

- Du wechselst im Verein-Dashboard auf Abo.
- Stripe nimmt die erste Belastung sofort vor.
- Trial wird **vorzeitig beendet**, das Abo startet ab heute.
- Du bekommst **keinen anteiligen Trial-Rest gutgeschrieben** — die Trial-Tage waren kostenlos.

## Down- und Upgrade während Trial

- **Du startest mit Basic-Trial und merkst, du brauchst Pro?** Wechsel direkt im Tarif-Dialog. Der neue Trial gilt für den neuen Tarif, du verlierst keine Tage.
- **Du startest mit Pro-Trial und merkst, Basic reicht?** Analog. Pacts, die Pro-Features nutzen (Saison-Ziele, Custom-Trigger), werden beim Downgrade **pausiert** mit Erklärung — sie sind nicht weg, nur inaktiv.

## Trial-Mehrfach-Nutzung — geht das?

**Nein.** Pro Verein und Mannschaft gibt es **einen Trial**. Wenn du eine Mannschaft kündigst und sechs Monate später wieder anlegst, bekommst du **keinen neuen Trial**. KickPact erkennt das über die Verein-Stammdaten.

Ausnahme: Wenn der erste Trial vor dem **ersten Spielereignis** gekündigt wurde und keinerlei Daten erzeugt wurden, gewähren wir auf Anfrage einen zweiten Trial. Mail an support@kickpact.de mit Vereinsname.

## Bei Sommerpause während Trial

Beispiel: Du startest am 20. Mai, Saison endet am 30. Mai, Trial läuft bis 19. Juni. Im Sommer passiert auf Fußball.de gar nichts mehr.

- Trial läuft trotzdem ab.
- Wir empfehlen: **Trial im Sommer testen, im August dann Saison-Pass kaufen.** Du hattest 30 Tage zum Konfigurieren und Sponsoren-Einladen, jetzt startet die Saison frisch.

Weiter lesen:
- [Welcher Tarif passt zu deinem Verein?](welcher-tarif-passt.md)
- [Saison-Pass vs Monatlich](saison-pass-vs-monatlich.md)
- [Kündigung und Pause](kuendigung-und-pause.md)
