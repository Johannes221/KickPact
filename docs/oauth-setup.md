# OAuth Setup — Google + Apple Sign-in

Better-Auth registriert Google + Apple **automatisch**, sobald die jeweiligen
Env-Vars gesetzt sind. Fehlen sie, blendet die Login/Signup-UI den entsprechenden
Button einfach aus — du kannst also Provider einzeln nachrüsten.

Alle Werte gehören in `.env.local` (nicht ins Repo committen).

---

## 1) Google

**Aufwand**: ~5 min, kostenlos.

1. https://console.cloud.google.com → Projekt anlegen (z.B. "KickPact").
2. **APIs & Services → OAuth Consent Screen**
   - User type: **External**
   - App name: `KickPact`
   - Support-Email + Developer-Contact: deine Mail
   - Scopes: `email`, `profile`, `openid` (Defaults reichen)
   - Test-Users: deine Mail (während App im "Testing"-Status ist)
3. **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Name: `KickPact Web`
   - Authorized JavaScript origins:
     - `http://localhost:3003`
     - `https://kickpact.com` (Produktion)
   - Authorized redirect URIs:
     - `http://localhost:3003/api/auth/callback/google`
     - `https://kickpact.com/api/auth/callback/google`
4. **Client ID** und **Client Secret** kopieren in `.env.local`:
   ```
   GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="GOCSPX-..."
   ```
5. Dev-Server neu starten — Button erscheint auf `/login` und `/signup`.

> Sobald die App im "Production"-Status ist (Google Review), entfallen die
> Test-User-Restriktionen. Solange du im "Testing"-Modus bist, können sich
> nur Test-User einloggen.

---

## 2) Apple "Sign in with Apple"

**Aufwand**: ~20 min, benötigt aktiven Apple-Developer-Account ($99/Jahr).

Apple verlangt als `clientSecret` kein statisches Token, sondern ein
**signiertes ES256-JWT**. Wir generieren das beim Boot des Servers automatisch
aus deinem `.p8`-Key. Du musst also vier Werte hinterlegen, dann läuft alles.

### Schritt 1: App ID (falls noch nicht vorhanden)

1. https://developer.apple.com/account/resources/identifiers/list
2. **+ → App IDs → App** → Continue
3. Description: `KickPact`, Bundle ID: `com.kickpact.app` (explicit)
4. Capabilities → **Sign in with Apple** aktivieren
5. Continue → Register

### Schritt 2: Services ID (das ist `APPLE_CLIENT_ID`)

1. **+ → Services IDs**
2. Description: `KickPact Web`, Identifier: `com.kickpact.web.auth`
3. **Sign in with Apple** aktivieren → Configure
   - Primary App ID: die in Schritt 1 angelegte App ID
   - Domains:
     - `localhost` — geht NICHT, Apple verlangt eine echte Domain auch fürs Dev. Workaround:
       - Entweder per ngrok einen HTTPS-Tunnel
       - ODER nur in Produktion testen (kickpact.com)
     - `kickpact.com` (Produktion)
   - Return URLs:
     - `https://kickpact.com/api/auth/callback/apple`
     - (optional Dev-Tunnel URL)
4. Save → Continue → Register

### Schritt 3: Key (für JWT-Signing)

1. https://developer.apple.com/account/resources/authkeys/list
2. **+** → Key Name: `KickPact Sign-in`
3. **Sign in with Apple** aktivieren → Configure → Primary App ID = aus Schritt 1
4. Continue → Register
5. **Lade die `.p8`-Datei sofort herunter** (Apple zeigt sie nur einmal!)
6. Notiere die **Key ID** (10 Zeichen, steht direkt neben dem Namen)

### Schritt 4: Team ID

1. https://developer.apple.com/account → Membership-Tab
2. **Team ID** (10 Zeichen, z.B. `ABCDE12345`)

### Schritt 5: Env-Vars setzen

In `.env.local`:

```
APPLE_CLIENT_ID="com.kickpact.web.auth"
APPLE_TEAM_ID="ABCDE12345"
APPLE_KEY_ID="XXXXXXXXXX"

# .p8-Inhalt komplett, inkl. BEGIN/END-Zeilen.
# Multiline in dotenv → entweder mit Anführungszeichen + echten Zeilenumbrüchen,
# oder als Einzeile mit \n:
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIGTAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBHkwdwIBAQQg...
-----END PRIVATE KEY-----"
```

Dev-Server neu starten — Apple-Button erscheint auf `/login` und `/signup`.

---

## Was du Claude geben kannst, damit ich das selbst einrichte

Im Idealfall:

- **Google**: Client ID + Client Secret (Strings) — gib's mir direkt im Chat,
  ich packe sie in `.env.local`.
- **Apple**: alle 4 Werte (Services ID, Team ID, Key ID, .p8-Datei-Inhalt).
  Den .p8-Inhalt kannst du mir im Chat schicken (mehrzeilig, einfach
  reinpasten). `.env.local` ist im `.gitignore`, landet nicht im Repo.

**Wichtig**: Den `.p8`-Key gut sichern — wenn er leakt, kann jemand sich als
deine App ausgeben. Im Notfall kannst du den Key bei Apple revoken und neu
erstellen (kostet nichts, Sign-ins müssen einmalig re-auth machen).
