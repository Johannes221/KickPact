# MCP-Bootstrap-Audit — KickPact

**Datum:** 2026-05-26
**Scope:** Inbetriebnahme von Sentry / Linear / Cloudflare / Playwright / Remotion MCPs + Live-Audit des fussball.de-Crawlers via Playwright MCP.

---

## 1. MCP-Setup-Status

| MCP | Auth | Tool-Verfügbarkeit | Anmerkung |
|---|---|---|---|
| `sentry` | ✅ Johannes221 / johannes.schartl@gmail.com | 14 Tools | Org `kickpact` (de.sentry.io), **0 Projekte** angelegt |
| `linear` | ✅ Workspace verbunden | 33 Tools | Team `Kickpact`, aktuelle Session ruft noch `/sse`-Endpoint → **server-side rejected** seit 2026-04-08. `~/.claude.json` auf `https://mcp.linear.app/mcp` umgestellt → wirksam nach Restart. |
| `cloudflare-bindings` | ✅ Account `22f1eb52799b…` aktiv | 23 Tools | **R2 muss im Dashboard freigeschaltet werden** (10042 "Please enable R2") |
| `cloudflare-observability` | ✅ derselbe Account | 10 Tools | Workers-Logs querybar |
| `cloudflare-docs` | (kein Auth) | 2 Tools | — |
| `playwright` | (kein Auth) | 30 Tools | Browser-Launch beim ersten Call ~100 MB Download |
| `remotion` | (kein Auth) | 1 Tool | ⚠️ Dies ist NUR der Doku-MCP (`remotion-documentation`), kein Render-MCP |

### Code-Side-Setup ausgeführt

- **Sentry-Integration** (Commit `3b80d34`):
  - `@sentry/nextjs@10.53.1` als Dependency
  - `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts` mit env-gated DSN
  - `instrumentation.ts` mit `register()` + `onRequestError` für RSC-Errors
  - `next.config.ts` wrapped mit `withSentryConfig` (silent: true, source-map cleanup nach Upload, disableLogger)
  - `.env.example` erweitert um `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG=kickpact`, `SENTRY_PROJECT=kickpact`, `SENTRY_AUTH_TOKEN`
  - `.gitignore` erweitert um `.env.sentry-build-plugin`
  - TypeScript-Check: **clean**

### Offene User-Actions (manuell, nicht via MCP automatisierbar)

1. **Sentry-Projekt anlegen** — https://kickpact.sentry.io/projects/new/ → Plattform: Next.js → DSN kopieren → in `.env.local` und Coolify-ENVs einsetzen
2. **R2 aktivieren** — https://dash.cloudflare.com/22f1eb52799b7385e9984c78ec8eb3e9/r2 → "Enable R2" → ToS akzeptieren. Danach via MCP: `mcp__cloudflare-bindings__r2_bucket_create({name:"kickpact-prod"})`
3. **Claude Code Restart** — damit Linear-MCP den `/mcp`-Endpoint statt `/sse` nutzt
4. **Sentry-Auth-Token** für Source-Map-Upload — Settings → Auth Tokens → Scopes `project:releases`, `org:read`, `project:read`

---

## 2. Crawler-Audit (Playwright MCP gegen fussball.de live)

**Methode:** Live-Navigation auf 3 fussball.de-Seiten + DOM-Evaluation der **exakten Selektor-Strings** aus `lib/crawler/fussballde.ts`. Keine Mock-Daten.

### Selector-Test-Matrix

| Funktion | URL-Typ | Selektoren | Status | Befund |
|---|---|---|---|---|
| `searchVereine` | `/suche/-/text/<query>/restriction/-1#!/` | `a[href*="/verein/"]` + Regex | ✅ Pass | 3/3 valide Treffer parsiert |
| `searchVereine.ort` | dito | `^(.+?)\s+\d{5}\s+(.+)$` (Adress-Pattern) | ⚠️ Soft-Fail | Alle Treffer `ort: null` — Adress-Format am Suchergebnis fehlt vermutlich. Code degraded sauber. **Niedrig-Prio.** |
| `getMannschaften` | `/verein/<slug>/-/id/<id>#!/` | `a[href*="/mannschaft/"]` + Regex | 🔴 **Critical** | Nur **1** Mannschaft gefunden — und das ist ein **Gegner** (`SV Stuttgarter Kickers` aus dem "Letzte Spiele"-Widget). Eigene Teams werden via Angular-SPA erst nach Tab-Klick `Mannschaftsart wählen` geladen. Crawler wartet 8s auf `a[href*="/mannschaft/"]` und gibt dann fehlerhafte Liste zurück. |
| `getSpiele` | `/ajax.team.prev.games/-/mode/PAGE/team-id/<id>` | `tr.row-headline`, `tr.row-competition`, `a[href*="/spiel/"]` | ✅ Pass | 10 Spiele in einem Request, alle Felder valide. Strategie 1a (ajax-Pagination) ist robust. |
| `getSpielDetails` | `/spiel/<slug>/-/spiel/<id>#!/` | `.match-course`, `.row-event`, `.event-left/right`, `.hexagon.green`, `.icon-substitute`, `.valign-inner` | 🟡 **Unklar — verifizierungsbedürftig** | Auf U14-Jugend-/Freundschaftsspiel **alle Event-Selektoren = 0**. Klassen `hexagon`, `icon-hexagon`, `substitutes`, `column-goals` existieren aber. Möglich: (a) Jugend-/FS-Spiele zeigen keine Events (semantisch korrekt) oder (b) `match-course` wurde umbenannt. **Re-Test auf echtem Herren-Liga-Spiel zwingend erforderlich** bevor wir das als Regression deklarieren. |
| `getKader` | `/mannschaft/<slug>/-/saison/<saison>/team-id/<id>#!/` | `a[href*="spielerprofil"]`, `.column-name` | ⏸️ Nicht getestet | Audit-Zeitbudget aus |

### Konsole-Errors während Audit

Auf allen Seiten 2 Console-Errors + Warnings (Usercentrics-Consent, Angular-Reflog). Nicht crawler-relevant.

---

## 3. Linear-Issues (anzulegen nach Restart)

> **Bootstrap-Plan:** Nach Claude-Code-Restart führe ich folgende Linear-Issues via MCP-`save_issue` an. Team: `Kickpact`. Reihenfolge = vorgeschlagene Bearbeitungsreihenfolge.

### Crawler-Issues (aus Audit oben)

| Title | Priority | Labels | Beschreibung-Kern |
|---|---|---|---|
| `[Crawler] getMannschaften liefert Gegner statt eigene Teams` | Urgent (1) | `bug`, `crawler` | fussball.de-Verein-Hauptseite ist Angular-SPA, eigene Teams werden lazy nach Mannschaftsart-Klick gerendert. Aktueller Selektor `a[href*="/mannschaft/"]` matched nur das "Letzte Spiele"-Widget. **Vorschlag:** Tab `Mannschaftsart wählen` programmatisch klicken oder anderen Endpoint nutzen (z.B. `ajax.club.matchplan`). Audit-Beleg: Bayern-Amateur ergibt `[{ name: "SV Stuttgarter Kickers", saison: "2526" }]`. |
| `[Crawler] getSpielDetails Event-Selektoren auf Herren-Liga verifizieren` | High (2) | `bug`, `crawler` | U14/FS-Sample zeigt `.match-course` & `.row-event` = 0. Vor Fix-PR ein echtes Herren-Bezirksliga-Spiel testen. Wenn dort auch 0 → **alle Charges würden 0 zurückgeben** (KRITISCH für Trigger-Engine + Abrechnung). |
| `[Crawler] Adress-Parsing in searchVereine produziert null` | Low (4) | `bug`, `crawler` | Regex `^(.+?)\s+\d{5}\s+(.+)$` matched nicht mehr, alle Hits haben `ort: null`. Degraded sauber, aber Suche zeigt keinen Ort an → UX-Reduktion. |

### Infrastructure-Issues

| Title | Priority | Labels | Beschreibung-Kern |
|---|---|---|---|
| `[Observability] Sentry-Projekt anlegen + DSN in Coolify-ENVs` | High (2) | `infra`, `observability` | Sentry-Code-Integration ist mit Commit `3b80d34` live. Fehlt nur: Projekt in Sentry-Org `kickpact` anlegen (Next.js) → DSN in `.env.local`, Coolify Staging+Prod. Plus `SENTRY_AUTH_TOKEN` für Source-Map-Upload in CI. |
| `[Observability] Sentry-Test-Error in Staging triggern + verifizieren` | Medium (3) | `infra`, `observability` | Nach DSN-Setup einen Test-Throw deployen, in `kickpact.sentry.io` prüfen dass Event ankommt mit Source-Map. Bestätigt vollständige Pipeline. |
| `[Infra] R2-Production-Bucket "kickpact-prod" anlegen` | High (2) | `infra` | Plan 6 §"User-Entscheidungen": Production braucht eigenen Bucket separat von Staging. **Blocker:** R2 ist auf CF-Account `22f1eb52799b…` noch nicht aktiviert (10042-Error im API). User-Action: Dashboard → R2 → Enable. Danach: 1 MCP-Call `r2_bucket_create({name:"kickpact-prod"})` + API-Token-Pair generieren + in Coolify-Prod-ENV ablegen. |
| `[Infra] Linear-MCP-Transport von /sse auf /mcp migrieren` | Done | `infra` | Erledigt in `~/.claude.json`, greift nach Restart. Issue dient nur als Logbuch-Eintrag. |

### Tooling-Issues (aus MCP-Erkenntnissen)

| Title | Priority | Labels | Beschreibung-Kern |
|---|---|---|---|
| `[Tooling] Remotion-Render-MCP statt Doku-MCP installieren falls Match-Recaps Sinn ergeben` | Backlog | `tooling`, `marketing` | Aktueller `@remotion/mcp` exponiert nur `remotion-documentation`. Für tatsächliche Video-Renders (Match-Recaps, Sponsor-Onboarding-Clips, Monatsabschluss-Stories) wäre `remotion-mcp` (von dotlasher, separates npm-Paket) zu evaluieren. Entscheidung: Erst wenn Marketing-Plan ein Video-Asset im Backlog hat. |

---

## 4. Was sofort nach Restart passieren wird

1. Linear-MCP-Verbindung verifizieren (`list_teams` Round-Trip)
2. Labels `bug`, `crawler`, `infra`, `observability`, `tooling`, `marketing` anlegen (falls nicht vorhanden)
3. 8 Issues oben durch `save_issue` blasten — Reihenfolge: Crawler-Urgent → Sentry-High → R2-High → Rest
4. Confirm via `list_issues(team:"Kickpact")`

## 5. Was Sentry sofort kann (sobald DSN drin ist)

```typescript
// In jeder Server-Action / Inngest-Function
import * as Sentry from "@sentry/nextjs";
try { /* … */ } catch (err) {
  Sentry.captureException(err, { tags: { feature: "crawler", teamId } });
  throw err;
}
```

Speziell relevant für KickPact:
- `lib/crawler/fussballde.ts` — `assertNotCaptcha`-Throws + `withRetry`-Final-Failures
- `lib/inngest/functions/crawl-matches.ts` — Job-Failures mit Match-Context
- `lib/inngest/functions/generate-invoices.ts` — PDF-Render-Errors mit Charge-IDs
- `app/admin/verifications/_actions/review.ts` — Approval-Race-Conditions

Default-Tracing macht automatisch HTTP-Spans + Server-Action-Spans, ohne Code-Änderung.

---

## 6. Erkenntnisse für die Tool-Auswahl

- **Playwright MCP war direkt heute der größte Hebel** — 5 Selector-Hypothesen in <5 Min validiert, davon 1 kritischer und 2 mittlere Findings. Investiertes Zeitbudget: ~10 Min.
- **Cloudflare-MCP-Suite ist auf 1 von 3 Servern blockiert** (R2 nicht aktiviert). docs+observability sind verwendbar, bindings braucht User-Click.
- **Linear-MCP-Transport-Deprecation** hat heute eine ganze Issue-Bootstrap-Runde verzögert. Lesson: bei neuen MCPs immer den Server-Status-/Migration-Hint im ersten Tool-Call prüfen.
- **Sentry-MCP-Setup hatte 0 Friktion** — modernster, sauberster OAuth-Flow von allen.

---

_Generiert in einer Claude-Code-Session am 2026-05-26 als Teil der initialen MCP-Inbetriebnahme._
