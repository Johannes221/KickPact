# KickPact Display

Abgeleitet aus **Orbitron Black** (SIL Open Font License 1.1, siehe `OFL.txt`).

## Was geändert wurde

Nur die **Null**. Orbitron zeichnet sie durchgestrichen (Ø) — „6:0" wird zu „6:Ø",
„200 € pro Aufstieg" zu „2ØØ €". Abschalten geht nicht: der Font hat kein
`zero`-Feature. Die Null trägt jetzt die Form von Orbitrons eigenem „O".

## Warum der andere Name

Orbitron hat den Reserved Font Name „Orbitron". OFL 1.1 Punkt 3 verbietet, eine
geänderte Fassung weiter so zu nennen. Der neue Name ist Lizenzbedingung.

## Neu bauen

```bash
python3 scripts/build-display-font.py   # braucht fonttools
```

Quelle bleibt `public/fonts/orbitron/Orbitron-Black.ttf` — nicht löschen.
