# KickPact Autopilot — Setup & Recovery

> **Was das ist:** Ein selbst-laufender Loop, der Plan 2, 3 und 4 für KickPact autonom durchcodet.
> **Limitation:** Der Cron läuft NUR während Claude Code geöffnet ist. Wenn du die App schließt, pausiert der Autopilot. Beim nächsten Start einfach wieder anwerfen.

## Status

- **Aktiver Cron Job-ID:** wird hier eingetragen beim Setup
- **Schedule:** stündlich (Minute :17)
- **Plan-Stand:** siehe [STATE.md](STATE.md)
- **GitHub Issues:** https://github.com/Johannes221/KickPact/issues?q=label:autopilot

## So startest du den Autopilot neu

Öffne Claude Code und sag:

> *"Starte den KickPact-Autopilot wieder. Setup-Anweisungen sind in AUTOPILOT.md."*

Oder einfacher mit /loop:

> */loop 60m setze KickPact-Autopilot fort, lies STATE.md und AUTOPILOT.md*

## So stoppst du den Autopilot

> *"Stoppe den KickPact-Autopilot."*

Oder direkt setze in STATE.md: `Status: paused` und committe.

## So checkst du den Stand

1. **STATE.md im Repo:** [STATE.md](STATE.md) — Live-Stand
2. **GitHub Issues:** alle mit Label `autopilot`
3. **PRs:** auf der `phase-*`-Branch — ein PR pro fertige Phase
4. **Letzte Commits:** `git log --oneline --since="24 hours ago"`

## Autopilot-Prompt (für Recovery)

Wenn der Cron stirbt und du ihn neu anlegen willst, sag Claude Code:

> *"Lege CronCreate an mit cron `17 * * * *`, durable=true, recurring=true. Prompt: siehe `AUTOPILOT_PROMPT.md`."*

(Der vollständige Prompt-Text ist in der Sister-File [AUTOPILOT_PROMPT.md](AUTOPILOT_PROMPT.md).)

## Was der Autopilot NICHT macht

- ❌ **Plan 5 (Stripe)** — pausiert beim Start, weil Stripe-Keys fehlen. Du musst `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_BASIC_PRICE_ID`, `STRIPE_PRO_PRICE_ID` in `.env.local` setzen und STATE.md auf `ready` zurücksetzen.
- ❌ **Plan 6 (Brand + Deploy)** — pausiert immer. Brand braucht Johannes' Auge mit `ui-ux-pro-max`-Skill.
- ❌ **PR-Merging** — Autopilot erstellt PRs aber merged nie. Du reviewst + merged.
- ❌ **Live-Domain / Production-Deploy** — first run muss du selbst machen.

## Notfall

Falls der Autopilot Müll committed:
```bash
cd ~/kickpact
git log --oneline -10
git revert <bad-sha>
# oder: git reset --hard <good-sha> (NUR auf Feature-Branch, NIE auf main!)
```

Dann: STATE.md korrigieren, Issue schließen, Autopilot wieder starten.
