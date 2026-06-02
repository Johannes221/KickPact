# Spec: App-Entry & Onboarding (iOS-App)

**Datum:** 2026-06-02
**Status:** Konzept — Entscheidungen mit ⭐ sind Vorschläge, vom Nutzer zu bestätigen.
**Kontext:** [Capacitor-Plan WS-8](../plans/2026-05-29-capacitor-ios-vorbereitung.md). Die iOS-App (Capacitor-WebView) lädt die Web-App remote; sie darf im App Store **nicht** auf der Marketing-Landingpage starten und **keine** Preise/Stripe zeigen (Apple 4.2 + Anti-Steering).

## Leitprinzip

**Ein Client, Verzweigung per Plattform.** Kein zweiter Code — die bestehende Web-App erkennt den nativen Kontext (`isIOSApp()` / Custom-User-Agent) und zeigt einen App-Einstieg. Browser behalten die Landingpage unverändert.

## Screen-Flow (nativ, Kaltstart)

```
App-Start
  │
  ├─ eingeloggt? ──ja──▶ App-Home (Bottom-Nav / Dashboard)        [bestehend]
  │
  └─ nein
       │
       ├─ Intro schon gesehen? ──ja──▶ Login                      [bestehend /login]
       │
       └─ nein ▶ Intro-Wizard (3 Slides, skippable) ──▶ Login     [NEU]
                                                          │
                                              nach Login, keine Rolle?
                                                          │
                                                          ▼
                                          Rollen-Auswahl  [bestehend /select-role]
                                                          │
                                                          ▼
                                          Rollen-Onboarding [bestehend /onboarding]
                                                          │
                                                          ▼
                                                      App-Home
```

## Was NEU ist vs. Wiederverwendung

| Baustein | Status |
|---|---|
| Intro-Wizard (3 Slides Value-Prop, ohne Preise) | 🆕 neu |
| Native-Entry-Gate (Root → Intro statt Landing) | 🆕 neu |
| Login Apple/Google/Magic-Link | ✅ `/login` (verifiziert) |
| Rollen-Auswahl Mannschaft/Verein/Sponsor | ✅ `/select-role` |
| Rollen-Onboarding (Verein-Suche etc.) | ✅ `/onboarding` |

## Intro-Wizard — Inhalt (⭐ Vorschlag, 3 Slides, KEINE Preise)

1. **Was** — „Performance-Sponsoring für deinen Amateurverein." (Hero-Bild Team-Jubel)
2. **Wie** — „Sponsoren versprechen Beträge pro Tor, Sieg, Aufstieg. Fußball.de + Vereinsmeldungen → automatisch." (kein konkreter €-Betrag → Anti-Steering)
3. **Vertrauen** — „100 % bleibt bei der Mannschaft. In 90 Sek. startklar." → CTA „Los geht's" → Login.

- „Überspringen" oben rechts → direkt Login.
- Brand-Look mit `ui-ux-pro-max` (Orange/Lime/Navy, sport-energetisch).

## Technische Umsetzung

**Native-Erkennung serverseitig (kein Flash):** Capacitor `ios.appendUserAgent: "KickPactApp"` in [capacitor.config.ts](../../../capacitor.config.ts) setzen. Next-Middleware erkennt den UA → bei `/` und unauthentifiziert → Redirect auf `/app/intro` (neue Route). So kein kurzes Aufblitzen der Landingpage. Client-`isIOSApp()` bleibt für UI-Feinheiten (Preise ausblenden etc.).

**„Intro gesehen"-Merker:** `@capacitor/preferences` (oder localStorage) Flag `kp_intro_seen` → returnende logged-out-User überspringen die Slides, landen direkt auf Login.

## Entscheidungen (⭐ = mein Vorschlag, bitte bestätigen)

1. **Intro app-only?** ⭐ Ja — Web behält die konvertierende Landingpage; Intro nur im App-Kontext. (Später optional auch mobiles Web testen.)
2. **Cold-Start eingeloggt?** ⭐ Intro/Login überspringen → direkt App-Home.
3. **Slide-Anzahl?** ⭐ 3 + Login. Skippable.
4. **Login-Primär in der App?** ⭐ Native **Apple-Sign-in** zuerst (schließt in-app ab; Magic-Link macht sonst Safari-Sprung — WS-3), Google + Magic-Link darunter.
5. **Anti-Steering im Intro?** ⭐ Keine konkreten Preise/Stripe-CTAs im App-Intro (deckt WS-7 mit ab).

## Abhängigkeiten / Reihenfolge

- Setzt **WS-1** (Scaffold ✅) voraus und greift in **WS-3** (native Apple-Sign-in) — die beiden sollten zusammen gebaut werden.
- Unabhängig von **WS-7** (Pricing), solange das Intro preisfrei bleibt.
