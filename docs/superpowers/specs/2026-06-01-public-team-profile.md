# Spec: Öffentliches Mannschafts-Profil (Public Team Profile)

**Datum:** 2026-06-01
**Status:** In Umsetzung
**Kontext:** iOS/Web-Feedback #8/#9 — „werde öffentlich, damit Sponsoren euch finden", pro Mannschaft eine teilbare URL.

## Ziel

Jede registrierte Mannschaft bekommt eine **öffentliche, teilbare Profilseite** unter
einer eigenen URL (`/m/{slug}`). Mannschafts-Admins pflegen dort **Name, Logo, Ziele
und Kurzbeschreibung** und schalten das Profil **öffentlich/privat**. Auf der
öffentlichen Seite können auch **nicht eingeloggte** Besucher „**Sponsoring anfragen**"
(Name + E-Mail + Nachricht) → der Verein bekommt die Anfrage als Mail + als Lead.

## Was schon existiert (wiederverwenden)

- `teams.discoverable` (bool) — Public-Toggle, `teams.publicTagline` (text) — Kurzbeschreibung.
- `setTeamDiscoverable`-Action, `DiscoverabilityPanel` (im /sponsoren-Dashboard).
- Eingeloggter Sponsor-Inquiry-Flow (`createSponsorInquiry` → Mail an Admins → accept/reject).
- `slugify` (npm), Resend-Mail-Pattern, `getDocumentSignedUrl` für Logo.

## Was neu gebaut wird

### 1. Schema (`teams`)
- `publicSlug text unique` — URL-Segment, generiert beim ersten Veröffentlichen.
- `publicName text` — optionaler öffentlicher Anzeigename (Fallback: `team.name`).
- `publicGoals text` — „Ziele" (wofür sammelt die Mannschaft / Saisonziel).

### 2. Neue Tabelle `sponsor_leads`
Öffentliche (anonyme) Sponsoring-Anfragen — getrennt von `sponsor_inquiries`
(dort ist `sponsorUserId` NOT NULL, also nur für eingeloggte Sponsoren).
- `id, teamId(FK), name, email, message, createdAt, handledAt`.

### 3. Slug-Helper (`lib/utils/team-slug.ts`)
`buildTeamPublicSlug(clubName, teamName)` → `slugify(...)` + 4-Zeichen-Suffix.
Uniqueness via Retry-Loop in der Save-Action.

### 4. Query (`lib/db/queries/sponsor-discover.ts`)
`getPublicTeamProfileBySlug(slug)` → Team-Public-Felder + Club (Name/Ort/verifiedAt)
+ aufgelöste Logo-URL. Liefert `null`, wenn nicht gefunden, nicht `discoverable`
oder nicht `isActive` → Seite rendert `notFound()`.

### 5. Actions (`lib/actions/team-public-profile.ts`)
- `saveTeamPublicProfile({ teamId, isPublic, publicName?, publicTagline?, publicGoals? })`
  — admin-only (`assertClubWriteAccess`), generiert `publicSlug` falls fehlend,
  setzt alle Public-Felder + `discoverable`. Gibt `{ slug }` zurück.
- `createPublicSponsorLead({ teamSlug, name, email, message? })` — **public, kein Auth**.
  Validiert: Team existiert + `discoverable` + Verein nicht read-only. Insert Lead +
  Mail an Club-Admins (Resend, best-effort). Basis-Spam-Schutz: Pflichtfelder + Länge.

### 6. UI
- **Editor:** `app/(verein)/verein/[slug]/mannschaft/[teamId]/profil/page.tsx`
  + Client-Form. Felder: Öffentlich-Toggle, Public-Name, Kurzbeschreibung (280),
  Ziele (600), Logo-Hinweis (→ Stammdaten), Live-URL + „Profil ansehen". Immer Toast.
  Link dorthin aus Einstellungen → „Weitere Bereiche → Öffentliches Profil".
- **Public-Seite:** `app/m/[slug]/page.tsx` (nutzt Root-Layout/Header). Hero (Logo,
  Name, Verein, Ort, Verifiziert-Badge), Kurzbeschreibung, Ziele, CTA „Sponsoring
  anfragen" (Client-Form → `createPublicSponsorLead`, Toast). `notFound()` wenn privat.

### 7. Tests
- `team-slug.test.ts` — Slug-Format, Sonderzeichen, Suffix.

## Erfolgskriterien (verifizierbar)

1. Admin kann unter `/verein/{slug}/mannschaft/{id}/profil` Name/Tagline/Ziele setzen
   und „öffentlich" einschalten → bekommt eine `/m/{slug}`-URL angezeigt. ✅ wenn URL
   erscheint + „Profil ansehen" die Public-Seite öffnet.
2. `/m/{slug}` zeigt für ein öffentliches Team die Felder; für ein privates → 404. ✅
3. Ein **nicht eingeloggter** Besucher kann „Sponsoring anfragen" absenden → Erfolgs-
   Toast, Lead landet in `sponsor_leads`, Club-Admins bekommen eine Mail. ✅
4. `npx tsc --noEmit` clean, Slug-Test grün, Migration generiert. ✅

## Bewusst NICHT in v1 (Follow-up)
- Lead-Inbox-UI im Dashboard (Leads sind via Mail + DB vorhanden; eigene Ansicht später).
- Öffentliche Discover-Liste ohne Login (bleibt vorerst `/sponsor/discover` mit Auth).
- Stats/Pact-Vorschau auf der Public-Seite (Scope-Schutz; ggf. später).
