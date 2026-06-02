# iOS-Push-Benachrichtigungen (APNs via Capacitor)

**Datum:** 2026-06-02
**Status:** Implementiert auf Branch `feat/ios-push-notifications`
**Scope-Quelle:** Nutzer-Auftrag 2026-06-02 + [Capacitor-Plan](../plans/2026-05-29-capacitor-ios-vorbereitung.md) (WS-4 „Native Mindestausstattung").

## 1. Ziel & bewusste Nicht-Ziele

Ein Benachrichtigungssystem für KickPact, das **ausschließlich native iOS-Push über die Capacitor-App** liefert (APNs). Es ist zugleich das stärkste Argument gegen Apple-Review-Guideline 4.2 (WebView-Wrapper braucht nativen Mehrwert).

**Ausdrücklich NICHT (Nutzer-Entscheidung):**
- **Kein Web-Push.** Keine Web-Push-API, kein Service-Worker-Push, keine Desktop- oder Mobile-Browser-Notifications.
- **Kein VAPID.** VAPID ist ein reines Web-Push-Konstrukt — für APNs irrelevant. Es taucht nirgends im Code auf.
- **Kein Android** in v1 (Schema/Helper sind aber `platform`-fähig, falls später `npx cap add android`).

Die Push-Registrierung läuft **nur**, wenn `lib/platform/native.ts` → `isNativeApp()` true ist. Im Browser/SSR passiert nichts (web-inert).

## 2. Verifizierbare Erfolgskriterien

1. **Schema/Migration:** `npm run db:migrate` legt `device_tokens`, `notifications`, `notification_settings` + Enum `notification_type` an (Migration `0045_notifications.sql`). Test-Migrator (`tests/setup/integration-db.ts`) läuft ohne Fehler durch; `resetTestDb()` kennt die neuen Tabellen.
2. **Push-Helper (Unit):** `npm test` grün — Tests beweisen:
   - **Token-Auswahl:** `sendPushToUser(userId)` lädt genau die Tokens dieses Users.
   - **410-Cleanup:** Tokens, deren APNs-Antwort `410`/`Unregistered`/`BadDeviceToken` ist, werden aus `device_tokens` entfernt; `200`-Tokens nicht.
   - **Best-effort:** Wirft ein einzelner Send/HTTP-Fehler, bricht `sendPushToUser` nicht ab und propagiert keine Exception nach oben.
   - **Provider-JWT:** `buildProviderToken()` erzeugt ein ES256-JWT mit Header `{alg:"ES256",kid:KEY_ID}` und Claims `{iss:TEAM_ID,iat}`, das mit dem zugehörigen Public Key verifizierbar ist.
   - **No-Op ohne Config:** fehlen die `APNS_*`-Env-Vars (oder ist der Private Key ein Platzhalter), ist `sendPushToUser` ein No-Op (kein Throw, kein DB-Schreiben an Tokens).
3. **Empfänger-Auflösung:** Query-Helper liefern für ein Team die richtigen Empfänger-`userId`s (Mitglieder + aktive Sponsoren) bzw. Club-Admins — getestet gegen die Test-DB (gated via `isIntegrationDbDisabled`).
4. **Inngest-Events:** Bei neuem Spielergebnis / Zugriffs-Anfrage / Sponsoring-Anfrage / Lead / Rechnung / Trial-Ende entsteht je Empfänger eine `notifications`-Zeile und (falls Token + Config vorhanden) ein APNs-Push. Doppelversand ist via `sent_notifications`-Dedupe ausgeschlossen, wo relevant.
5. **Client (iOS):** In der nativen App registriert sich das Gerät beim Start, der Token landet via `POST /api/native/push-token` in `device_tokens`. Im Browser wird der Code nie ausgeführt (kein `@capacitor/*`-Chunk geladen).
6. **UI:** `/konto/benachrichtigungen` zeigt eine In-App-Inbox (Liste, als gelesen markieren) + Einstellungen (Pro-Kategorie-Toggle für Push). Unread-Count ist auf der Konto-Seite sichtbar.
7. **Build:** `npm run build` und `npm run lint` bleiben grün; der Web-Build enthält keinen ausgeführten Capacitor-Code.

## 3. Datenmodell (Migration 0045, hand-geschrieben)

Hand-geschrieben + Journal-Eintrag, **kein** Snapshot-File (Konvention seit 0012, siehe 0041/0042). Alle Statements additiv/idempotent (`IF NOT EXISTS`, `DO $$ … duplicate_object …`).

> **Nummerierung 0045:** 0043/0044 sind parallel von einem Support-Workflow-Feature belegt — diese Migration weicht aus, um Datei-Kollisionen zu vermeiden.

### `device_tokens`
| Spalte | Typ | Notiz |
|---|---|---|
| `token` | text **PK** | APNs Device-Token (hex). Global eindeutig pro App-Install → natürlicher PK. |
| `user_id` | text NOT NULL → `users.id` ON DELETE CASCADE | Besitzer. |
| `platform` | text NOT NULL DEFAULT `'ios'` | Vorbereitet für `android`. |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `last_seen_at` | timestamptz NOT NULL DEFAULT now() | Bei jedem Re-Register aktualisiert. |

Index `device_tokens_user_idx` auf `user_id`. Upsert via `ON CONFLICT (token) DO UPDATE` (Token kann den Besitzer wechseln, wenn ein Gerät neu eingeloggt wird).

### `notifications` (In-App-Inbox)
| Spalte | Typ | Notiz |
|---|---|---|
| `id` | text PK (cuid2) | |
| `user_id` | text NOT NULL → `users.id` CASCADE | Empfänger. |
| `type` | `notification_type` NOT NULL | s.u. |
| `title` | text NOT NULL | |
| `body` | text NOT NULL | |
| `link` | text NULL | Deep-Link-Pfad (z.B. `/verein/<slug>/sponsoren`). |
| `data_json` | jsonb NULL | Zusatz-Payload für die App (z.B. `{matchId}`). |
| `read_at` | timestamptz NULL | gesetzt = gelesen. |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

Index `notifications_user_created_idx` auf `(user_id, created_at)`.

### `notification_type` (pgEnum)
`match_result`, `access_request`, `sponsor_inquiry`, `sponsor_lead`, `invoice_created`, `trial_ending`.

### `notification_settings` (Pro-User-Präferenzen)
Eigene Tabelle statt Spalten auf `users` (vermeidet better-auth-Schema-Drift).
| Spalte | Typ | Default |
|---|---|---|
| `user_id` | text **PK** → `users.id` CASCADE | |
| `match_results` | boolean NOT NULL | true |
| `access_requests` | boolean NOT NULL | true |
| `sponsor_requests` | boolean NOT NULL | true |
| `billing` | boolean NOT NULL | true |
| `updated_at` | timestamptz NOT NULL DEFAULT now() | |

**Default-Verhalten:** Fehlt die Zeile, gelten alle Kategorien als **an** (Opt-out-Modell). Mapping `notification_type → Kategorie`:
- `match_result` → `match_results`
- `access_request` → `access_requests`
- `sponsor_inquiry`, `sponsor_lead` → `sponsor_requests`
- `invoice_created`, `trial_ending` → `billing`

**Toggle-Semantik:** Der Toggle steuert **nur den Push** (das native Alert). Die In-App-Inbox protokolliert **immer** (vollständige Historie), unabhängig vom Toggle.

## 4. APNs-Versand (zero-dependency)

Bewusst **keine** externe Lib (`apn`/`node-apn` sind unmaintained). Stattdessen Node-Bordmittel:

- **JWT (Provider-Token):** ES256. Signatur via `crypto.sign("sha256", input, { key, dsaEncoding: "ieee-p1363" })` → liefert direkt das JOSE-R||S-Format (64 Byte), kein DER→JOSE-Umbau nötig. Header `{alg:"ES256",kid:APNS_KEY_ID}`, Claims `{iss:APNS_TEAM_ID,iat:now}`. Token ist bis zu 1 h wiederverwendbar → In-Memory-Cache, Refresh nach ~50 min.
- **Transport:** `node:http2` gegen `api.push.apple.com` (Prod) bzw. `api.sandbox.push.apple.com` (Sandbox, gesteuert durch `APNS_PRODUCTION`). Pfad `/3/device/<token>`, Header `authorization: bearer <jwt>`, `apns-topic: <APNS_BUNDLE_ID>`, `apns-push-type: alert`, `apns-priority: 10`. Body: `{ aps: { alert: { title, body }, sound: "default" }, …data }`. Eine HTTP/2-Session pro User-Batch (alle Tokens multiplext), danach geschlossen.
- **Runtime:** `runtime = "nodejs"`. Nie Edge.

**Fehlerklassen → Token-Cleanup:** `:status 410` ODER reason ∈ {`Unregistered`, `BadDeviceToken`, `DeviceTokenNotForTopic`} ⇒ Token aus `device_tokens` löschen. Alles andere: loggen, nicht fatal.

**Config & Inert-Modus:** `isApnsConfigured()` prüft `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (Key muss echtes PEM sein, nicht Platzhalter). Fehlt etwas ⇒ alle Sende-Funktionen sind No-Op (Debug-Log). Damit ist das ganze Feature deploybar, bevor der Apple-Key existiert.

### Schichten
- `lib/notifications/apns.ts` — reiner APNs-Transport: `buildProviderToken()`, `realApnsSender`, `isDeadTokenResult`. Sender ist über das `ApnsSender`-Interface **injizierbar** (Unit-Tests ohne HTTP/2).
- `lib/notifications/push.ts` — `sendPushToUser(userId, payload, deps?)`: Tokens laden → senden → tote Tokens aufräumen → `{sent, removed}`. Best-effort, nie werfend.
- `lib/notifications/deliver.ts` — `notifyUser(...)` / `notifyUsers(...)`: respektiert `notification_settings` (Push-Gate), schreibt **immer** die `notifications`-Zeile, ruft dann `sendPushToUser` wenn erlaubt + konfiguriert. Einzige API, die Inngest-Functions aufrufen.
- `lib/db/queries/device-tokens.ts` — `upsertDeviceToken`, `getDeviceTokensForUser`, `deleteDeviceTokens`.
- `lib/db/queries/notifications.ts` — `insertNotification`, `listNotifications`, `countUnreadNotifications`, `markNotificationRead`, `markAllNotificationsRead`, `getNotificationSettings`, `upsertNotificationSettings`.
- `lib/db/queries/notification-recipients.ts` — Empfänger-Auflösung (s.u.).

## 5. Empfänger-Auflösung

| Trigger | Empfänger | Query |
|---|---|---|
| **Spielergebnis** | Team-Mitglieder **+** aktive Sponsoren des Teams | `teamMemberships(teamId).userId` ∪ `clubMemberships(club, role∈{admin,trainer}).userId` ∪ (`pledges.status='active' & teamId` → `sponsors.userId`) |
| **Zugriffs-Anfrage** | Club-Admins (+ Team-Admins, falls `requestedTeamId`) | `clubMemberships(clubId, role='admin')` ∪ ggf. `teamMemberships(teamId, role='admin')` |
| **Sponsoring-Anfrage** (eingeloggt) | Club-Admins | `clubMemberships(clubId, role='admin')` |
| **Sponsoring-Lead** (öffentlich) | Club-Admins | `clubMemberships(clubId, role='admin')` |
| **Rechnung erstellt** | Club-Admins | `clubMemberships(clubId, role='admin')` |
| **Trial läuft aus** | Club-Admins | `clubMemberships(clubId, role='admin')` |

Alle Empfängerlisten werden vor Versand de-dupliziert.

## 6. Inngest-Verdrahtung

**Bestehendes Muster:** `match/finished` (`{matchId, teamId, updated}`) wird vom Crawler + Match-Edit-Action gefeuert und von `evaluate-match` verarbeitet. Wir hängen uns **als separate Function** an dasselbe Event — `evaluate-match` bleibt unangetastet.

**Neue Functions (`lib/inngest/functions/`, registriert in `index.ts`):**
1. `notify-match-result.ts` ← `event: "match/finished"`. Nur bei `updated !== true` (neues Ergebnis). Dedupe `push-match-result/${matchId}` via `sent_notifications`. Empfänger = Team-Recipients.
2. `notify-access-request.ts` ← `event: "notification/access-request"`.
3. `notify-sponsor-inquiry.ts` ← `event: "notification/sponsor-inquiry"`.
4. `notify-sponsor-lead.ts` ← `event: "notification/sponsor-lead"`.

**Event-Emission** (additiv zu den bestehenden E-Mails, in den Server-Actions):
- `requestClubAccessAction` → `notification/access-request`
- `createSponsorInquiry` → `notification/sponsor-inquiry`
- `createPublicSponsorLead` → `notification/sponsor-lead` (Insert um `.returning({id})` ergänzt)

**Inline in bestehenden Functions:**
- `generate-invoices.ts` → nach erfolgreichem Versand pro Club ein `invoice-push-${invoiceId}`-Step mit `notifyUsers(admins, {type:"invoice_created"})`.
- `trial-reminders.ts` → eigener `trial-push-…`-Step mit `notifyUsers(admins, {type:"trial_ending"})`.

E-Mail-Versand bleibt **unverändert** — Push ist additiv.

## 7. Client-Registrierung (iOS-only)

- **Pakete:** `@capacitor/core@^6`, `@capacitor/push-notifications@^6` (v6 = verifizierter Spike-Stand). Web-inert.
- **Komponente** `components/native/push-registrar.tsx` (`"use client"`): rendert `null`; im `useEffect` zuerst `if (!isNativeApp()) return;` → **dann erst** dynamischer `import("@capacitor/push-notifications")`. Auf Web wird der Chunk nie geladen. Nativ: `checkPermissions`/`requestPermissions` → `register()` → Listener `registration` → `POST /api/native/push-token`.
- **Mount:** in `app/layout.tsx`, nur wenn `authenticated`.
- **Route-Handler** `app/api/native/push-token/route.ts` (`runtime="nodejs"`): `POST` → Session-Check → `upsertDeviceToken`. `DELETE` → Token entfernen (Logout/Opt-out). Cookies tragen die Session same-origin (Capacitor-Plan Variante A).

## 8. UI

- **Seite** `app/konto/benachrichtigungen/page.tsx` (Server Component): lädt letzte ~50 `notifications` + `notification_settings`.
  - `NotificationSettings` (Client): 4 Toggles → `updateNotificationSettings`. Hinweis: „Push-Benachrichtigungen erscheinen in der KickPact-App (iOS)."
  - `NotificationInbox` (Client): Liste (Titel/Body/Zeit, Unread-Punkt), „als gelesen", „Alle als gelesen", Klick → `link`.
- **Server-Actions** `lib/actions/notifications.ts`: `updateNotificationSettings`, `markNotificationReadAction`, `markAllNotificationsReadAction`.
- **Konto-Seite:** neue Karte „Benachrichtigungen" mit Unread-Count → Link auf die Seite.

## 9. APNs-/Infra-Setup (Server-Host-Manager, erledigt 2026-06-02)

Env-Variablen (Coolify, KickPact-App) — exakt diese Namen liest der Code:

| Var | Wert | Status |
|---|---|---|
| `APNS_KEY_ID` | Key-ID des Auth Keys | Platzhalter in Coolify — Johannes ersetzt nach Apple-Portal |
| `APNS_TEAM_ID` | `A5SM7VJ6M2` | ✅ gesetzt |
| `APNS_BUNDLE_ID` | `com.kickpact.app` | ✅ gesetzt |
| `APNS_PRIVATE_KEY` | voller `.p8`-PEM-Inhalt (`\n` erlaubt) | Platzhalter — Johannes ersetzt |
| `APNS_PRODUCTION` | `false` (Sandbox bis Store-Live) | ✅ gesetzt |

**Manuelle Aktion (Johannes, Apple Developer Portal):** APNs Auth Key (.p8) erstellen → Key ID notieren → .p8 herunterladen (nur 1×) → in Vaultwarden-Item „KickPact APNs" ablegen → Werte in Coolify ersetzen → Redeploy. App-ID `com.kickpact.app` mit Push-Capability sicherstellen. Vaultwarden-Item + Coolify-Platzhalter sind bereits angelegt.

Bis die Keys gesetzt sind, ist der Push-Versand No-Op — das Feature kann vorher deployt werden.

## 10. Risiken / offene Punkte

- **Auth im WebView:** Token-POST braucht eine gültige Session-Cookie im standalone-WebView (Capacitor-Plan WS-3, noch ungetestet). Fällt der Cookie-Weg aus, braucht der POST später den Bearer-Fallback. Kein Blocker für den Server-Build.
- **Sandbox vs. Prod:** TestFlight-/Dev-Builds sprechen i.d.R. die Sandbox; Store-Builds Prod. `APNS_PRODUCTION` muss zum Build passen — sonst `400 BadEnvironmentKeyInToken`.
- **Match-Update-Spam:** v1 pusht nur neue Ergebnisse (`updated !== true`), dedupliziert pro `matchId`. Score-Korrekturen lösen bewusst keinen zweiten Push aus.
- **Branch/Concurrency:** Dieses Feature liegt auf `feat/ios-push-notifications`, abgezweigt vom `security-hardening`-HEAD (parallele Sessions im selben Checkout). Migration auf 0045 verschoben, um der parallelen 0043/0044 (Support-Workflow) auszuweichen. Beim Mergen Journal-Reihenfolge prüfen.
