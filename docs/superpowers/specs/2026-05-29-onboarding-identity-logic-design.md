# Onboarding- & Identity-Logik — Design

**Datum:** 2026-05-29
**Status:** Design abgestimmt (Sparring mit Johannes), Implementierung ausstehend
**Verhältnis zu anderen Specs:** Verfeinert [2026-05-26-v1-final-scope-consolidation.md](2026-05-26-v1-final-scope-consolidation.md) §1.4/§1.5/§1.7 und [2026-05-22-identity-roles-mobile-ia-design.md](2026-05-22-identity-roles-mobile-ia-design.md). Bei Konflikt zur Onboarding-Kollisions- und Verifizierungslogik gilt **dieses** Dokument.

## 1. Kontext & Problem

Beim Mannschafts-Onboarding entstand bisher eine vermischte Rollen-Logik: Der `clubs`-Container wird als „Verein" behandelt, der einlegende User wird dessen Admin und erbt Vereins-Semantik. Zusätzlich blockiert die aktuelle Kollisionsprüfung Nutzer fälschlich, wenn der **Verein** (nicht die Mannschaft) schon existiert.

Dieses Dokument legt die abgestimmte Soll-Logik fest: **Eine Mannschaft anzulegen hat primär nichts mit dem Verein zu tun.** Der Verein ist nur dann relevant, wenn (a) er eine *aktive Vereinslizenz* hat oder (b) *genau diese eine Mannschaft* bereits aktiv betreut wird.

## 2. Begriffe

- **Verein-Container (`clubs`):** Namensgebender Datensatz. Trägt IBAN/Steuer-ID/`verifiedAt` (rechtlich fließt Sponsoring-Geld an den e.V.). **Bloße Existenz eines gleichnamigen Containers ist bedeutungslos.**
- **Vereinslizenz:** Container mit `effectivePlan === "verein"` (echter Multi-Team-Verein-Admin). Nur dann ist „Beitreten" ein Thema. `basic`/`pro` = reine Mannschaftslizenz.
- **Mannschaft (`teams`):** Die eigentliche Entität, die ein User betreut.
- **Kollisionsschlüssel = `fussballde_team_id`** (NICHT der Vereinsname): Über diese ID wird entschieden, ob „genau diese Mannschaft" schon belegt ist. Manuell angelegte Teams ohne fussball.de-Link kollidieren nie → immer frisch.

## 3. Abgestimmte Entscheidungen (Sparring 2026-05-29)

1. **Container-Modell:** Jede Solo-Mannschaft erhält ihren **eigenen** `clubs`-Container — auch bei Namensgleichheit. Kein erzwungenes Andocken an einen geteilten Container. Ein *geteilter* echter Verein entsteht erst über eine Vereinslizenz.
2. **Verifizierungsziel:** Für Solo-Mannschaften wird der **Container-Verein** verifiziert (`clubs.verifiedAt`) — konsistent damit, dass IBAN/Steuer-ID am Container hängen und Geld an den e.V. geht. Bei Vereinslizenz erben die Teams `clubs.verifiedAt` des lizenzierten Vereins.
3. **Niemand-Fall (gescrapte, unbetreute Mannschaft):** Leicht andocken — User wird sofort Owner, Spieldaten fließen mit, **kein** menschlicher Genehmiger; Nachweis erst beim Sponsoren-Schritt.
4. **Lizenz-Beitritt:** Bei aktiver Vereinslizenz wird das Beitreten *angeboten*, ist aber **nicht** Pflicht — Standalone-Betrieb bleibt möglich (bis/falls der Verein-Admin aufnimmt).
5. **Sponsoren-Gate:** Der „Sponsoren einladen"-Button ist vorverifiziert **ausgegraut** mit CTA „erst Verein verifizieren"; schaltet frei sobald `clubs.verifiedAt` gesetzt. Begleittext (Vertrauen): *„Schützt deine Sponsoren — kein Geld an unverifizierte Vereine."*
6. **Withhold:** Die bestehende Rechnungs-Zurückhaltung (`invoices.status='withheld'` bis verifiziert) bleibt als **Backend-Sicherheitsnetz** (greift, falls Verifizierung nach laufenden Sponsorings widerrufen wird).

## 4. Onboarding-Entscheidungsbaum

User wählt eine Mannschaft (i.d.R. via fussball.de-Suche). Zwei **unabhängige** Checks:

### Check A — Vereinslizenz?
- Container existiert nicht / nur ohne aktive Lizenz → **ignorieren, durch.**
- Container hat `effectivePlan === "verein"` → Hinweis „Verein existiert bereits" + Button „unter Vereinslizenz anfragen" → Mail an Verein-Admin (`clubMembershipRequests`). **Optional** — User kann als Standalone-Mannschaft fortfahren.

### Check B — diese exakte Mannschaft (per `fussballde_team_id`)?
- Keine KickPact-Mannschaft mit dieser ID → **frisch anlegen**, User = Trainer/Vertreter, vorverifiziert.
- Existiert, **kein** aktives Mitglied (gescraped) → **leicht andocken**: Team-Row unter den neuen eigenen Container umhängen (Spieldaten via `fussballde_team_id` bleiben erhalten), kein Genehmiger, Nachweis später.
- Existiert **mit** aktivem Mitglied → „Zugriff anfragen" → Mitglied genehmigt per Mail. Alternativ Conflict-Claim (`isConflictClaim=true` + `conflictDocStorageKey`) → Admin entscheidet unter `/admin/conflicts`.

## 5. Container-Regel (Konsequenzen)

- Solo-Onboarding legt **immer** einen frischen, privaten `clubs`-Container an und hängt eine adoptierte gescrapte Mannschaft dort hinein um. Der alte Seed-Container bleibt namensgebendes Skelett (ggf. später aufräumbar).
- `clubs.verifiedAt` ist damit **pro Betreuer isoliert** — kein Verifizierungs-Leck zwischen unabhängig betreuten Mannschaften desselben realen Vereins.
- **Spieldaten-Bindung erfolgt über `fussballde_team_id`**, unabhängig vom Container.

## 6. Vorverifiziert — Capability-Matrix

| Aktion | vorverifiziert | nach `clubs.verifiedAt` |
|---|---|---|
| Spiele ansehen / crawlen | ✅ | ✅ |
| Einstellungen, Stammdaten, Team-Mgmt | ✅ | ✅ |
| Manuelle Events melden | ✅ | ✅ |
| **Sponsoren einladen** | ❌ (Button ausgegraut + CTA) | ✅ |

## 7. Ist-Stand vs. Soll (konkrete Code-Abweichungen)

| # | Thema | Ist heute | Soll | Betroffen |
|---|---|---|---|---|
| 1 | **Kollisionsschlüssel** | Dedup über `fussballde_verein_id` (Verein). Fremder Verein → harter Throw „bereits registriert". | Kollision über `fussballde_team_id` + aktives Mitglied. Verein-Existenz allein irrelevant. | `app/(onboarding)/onboarding/_actions/create-draft-club.ts:78-104` |
| 2 | **DB-Constraint** | `clubs.fussballde_verein_id` ist `.unique()` → **verhindert** mehrere Container pro realem Verein. | Unique entfernen (oder auf `(fussballde_verein_id, ownerUserId)` o.ä. lockern), damit eigene Container pro Solo-Mannschaft möglich sind. | `lib/db/schema/clubs.ts:82` |
| 3 | **Team-Adoption** | Frischer `teams`-Insert; `teams_fussballde_idx` unique auf `(fussballde_team_id, saison)` würde bei gescraptem Bestand kollidieren. | „Leicht andocken" = bestehende Team-Row unter neuen Container **umhängen** statt neu inserten. | `create-draft-club.ts:154-171`, Index `clubs.ts:182-184` |
| 4 | **Verifizierungsziel** | Zweigleisig: `clubs.verifiedAt` UND `teams.verifiedAt` (teamVerifications). | Solo-Mannschaft → `clubs.verifiedAt` als einziges Gate. `teamVerifications`-Pfad ggf. obsolet/zurückbauen. | `lib/db/schema/clubs.ts:159-167,299-325`; `lib/db/queries/verifications.ts` |
| 5 | **Sponsoren-Gate** | Invites werden unbedingt erzeugt; Schutz nur via `invoices.status='withheld'`. | Invite-Button ausgegraut bis `clubs.verifiedAt`; Withhold bleibt als Netz. | Sponsoren-Step + `lib/db/queries/invitations.ts`, `verifications.ts:378-465` |
| 6 | **Lizenz-Beitritt** | `zugriff-anfragen`-Flow existiert, aber Onboarding blockt bei Fremd-Verein komplett. | Beitritt nur *anbieten* (bei aktiver Lizenz), Standalone-Weg offen halten. | `app/(onboarding)/onboarding/zugriff-anfragen/*`, `create-draft-club.ts:96-98` |

## 8. Offene Punkte für den Implementierungsplan

- Migration für #2 (Unique-Constraint) — Auswirkung auf bestehende Staging-Daten prüfen (geteilte Neon-DB).
- Genaue Definition „aktives Mitglied" (Check B): `clubMemberships`/`teamMemberships` mit Rolle ≠ viewer? Oder jede Mitgliedschaft?
- Re-Parent-Mechanik (#3): Umgang mit `players`, `matches`, Crawl-Status der adoptierten Team-Row.
- Rückbau-Umfang `teamVerifications` (#4): entfernen vs. deaktivieren.
- UI-Copy & Platzierung des „erst Verein verifizieren"-CTA im Sponsoren-Step.

> Nächster Schritt: separater Implementierungsplan unter `docs/superpowers/plans/`. Dieses Dokument ist reine Logik-/Design-Festlegung — **noch keine Implementierung**.
