/**
 * Integration-Tests für den Vereinswappen-Cache (fussball.de-Logos).
 *
 * Geprüft wird, was der Cache still falsch machen könnte:
 *  - jedes Wappen wird HÖCHSTENS EINMAL geladen (Download-Guard auf sourceUrl) —
 *    sonst prasselt bei jedem Cron ein Download-Sturm auf fussball.de (Ban),
 *  - ein geändertes Wappen (neue Medien-ID in der URL) wird neu geladen,
 *  - ein Download-Fehler legt KEINEN kaputten Eintrag an,
 *  - das Auto-Logo überschreibt NIE ein hochgeladenes Logo (Priorität).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, clubCrests } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  getClubCrestLogoUrl,
  getClubCrestLogoUrlByName,
  normalizeCrestName,
  syncClubCrests,
  backfillTeamLogoFromCrest
} from "@/lib/db/queries/club-crests";
import type { CrestRef } from "@/lib/crawler/fussballde";

function crest(teamId: string, url: string, name = "SV Test"): CrestRef {
  return { teamId, url, name };
}

async function seedTeam(logoUrl: string | null = null) {
  const [club] = await db
    .insert(clubs)
    .values({ slug: `c-${createId().slice(0, 8)}`, name: "SV Test" })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2627",
      fussballdeTeamId: createId(),
      logoUrl
    })
    .returning({ id: teams.id, fussballdeTeamId: teams.fussballdeTeamId });
  return team;
}

beforeEach(async () => {
  await resetTestDb();
  await db.delete(clubCrests); // resetTestDb truncatet den Cache nicht mit
});

describe("syncClubCrests", () => {
  it("lädt ein neues Wappen und legt es im Cache ab", async () => {
    const store = vi.fn(async () => "r2://bucket/crests/A.png");
    const n = await syncClubCrests([crest("A", "https://f.de/getLogo/A")], store);

    expect(n).toBe(1);
    expect(store).toHaveBeenCalledTimes(1);
    expect(await getClubCrestLogoUrl("A")).toBe("r2://bucket/crests/A.png");
  });

  it("lädt ein unverändertes Wappen NICHT erneut (Download-Guard)", async () => {
    const first = vi.fn(async () => "r2://bucket/crests/A.png");
    await syncClubCrests([crest("A", "https://f.de/getLogo/A")], first);

    const second = vi.fn(async () => "r2://bucket/crests/A2.png");
    const n = await syncClubCrests([crest("A", "https://f.de/getLogo/A")], second);

    expect(n).toBe(0);
    expect(second).not.toHaveBeenCalled();
    expect(await getClubCrestLogoUrl("A")).toBe("r2://bucket/crests/A.png");
  });

  it("lädt ein GEÄNDERTES Wappen neu (neue Medien-ID)", async () => {
    await syncClubCrests(
      [crest("A", "https://f.de/getLogo/OLD")],
      async () => "r2://bucket/crests/old.png"
    );
    const n = await syncClubCrests(
      [crest("A", "https://f.de/getLogo/NEW")],
      async () => "r2://bucket/crests/new.png"
    );

    expect(n).toBe(1);
    expect(await getClubCrestLogoUrl("A")).toBe("r2://bucket/crests/new.png");
  });

  it("dedupliziert dieselbe team-id innerhalb eines Batches (1 Download)", async () => {
    const store = vi.fn(async () => "r2://bucket/crests/A.png");
    const n = await syncClubCrests(
      [crest("A", "https://f.de/getLogo/A"), crest("A", "https://f.de/getLogo/A")],
      store
    );

    expect(n).toBe(1);
    expect(store).toHaveBeenCalledTimes(1);
  });

  it("legt bei Download-Fehler KEINEN Eintrag an", async () => {
    const n = await syncClubCrests([crest("A", "https://f.de/getLogo/A")], async () => null);

    expect(n).toBe(0);
    expect(await getClubCrestLogoUrl("A")).toBeNull();
  });

  it("leere Liste → nichts", async () => {
    const store = vi.fn(async () => "x");
    expect(await syncClubCrests([], store)).toBe(0);
    expect(store).not.toHaveBeenCalled();
  });
});

describe("normalizeCrestName (pur)", () => {
  it("streift das Reserve-Suffix (arabisch) ab", () => {
    expect(normalizeCrestName("1.FC Mühlhausen 2")).toBe("1.fc mühlhausen");
    expect(normalizeCrestName("Heidelberger SC 3")).toBe("heidelberger sc");
  });

  it("streift römische Mannschafts-Ziffern ab", () => {
    expect(normalizeCrestName("SV Sandhausen II")).toBe("sv sandhausen");
  });

  it("führt Verein und Reserve auf denselben Kern", () => {
    expect(normalizeCrestName("1.FC Mühlhausen")).toBe(normalizeCrestName("1.FC Mühlhausen 2"));
  });

  it("behält die Gründungsjahr-Zahl (4-stellig) und lässt suffixlose Namen unverändert", () => {
    expect(normalizeCrestName("1.FC Bruchsal 1899")).toBe("1.fc bruchsal 1899");
    expect(normalizeCrestName("FC Zuzenhausen")).toBe("fc zuzenhausen");
  });

  it("entfernt Annotationen am Ende (zg., (flex))", () => {
    expect(normalizeCrestName("GU-Türk. SV Pforzheim zg.")).toBe("gu-türk. sv pforzheim");
    expect(normalizeCrestName("RB Heidelberg 2 (flex)")).toBe("rb heidelberg");
  });

  it("kollabiert Whitespace und ist case-insensitiv", () => {
    expect(normalizeCrestName("  VfB   Wiesloch  2 ")).toBe("vfb wiesloch");
  });
});

describe("getClubCrestLogoUrlByName", () => {
  async function seedCrest(name: string, id = createId()) {
    await db.insert(clubCrests).values({
      fussballdeTeamId: id,
      logoUrl: `r2://bucket/crests/${id}.png`,
      sourceUrl: `https://f.de/getLogo/${id}`,
      name
    });
    return `r2://bucket/crests/${id}.png`;
  }

  it("findet das unter dem Vereinsnamen gecachte Wappen für die Reserve", async () => {
    // Der reale Bug: der Cache führt „1.FC Mühlhausen", der Spielplan-Stub aber
    // „1.FC Mühlhausen 2" (ohne team-id) → exakter Vergleich verfehlte das Wappen.
    const logo = await seedCrest("1.FC Mühlhausen");
    expect(await getClubCrestLogoUrlByName("1.FC Mühlhausen 2")).toBe(logo);
    expect(await getClubCrestLogoUrlByName("1.FC Mühlhausen")).toBe(logo);
  });

  it("findet das Wappen auch, wenn der Cache DAS Suffix trägt und die Query nicht", async () => {
    const logo = await seedCrest("1.FC Mühlhausen 2");
    expect(await getClubCrestLogoUrlByName("1.FC Mühlhausen")).toBe(logo);
    expect(await getClubCrestLogoUrlByName("1.FC Mühlhausen 2")).toBe(logo);
  });

  it("ordnet KEIN fremdes Wappen zu (unterschiedliche Vereine)", async () => {
    await seedCrest("SV Waldhof Mannheim");
    expect(await getClubCrestLogoUrlByName("SV Sandhausen 2")).toBeNull();
  });

  it("matcht nicht auf zu kurzen Kernen (Fehlzuordnungs-Schutz)", async () => {
    await seedCrest("SV Zwei");
    expect(await getClubCrestLogoUrlByName("SV 2")).toBeNull(); // Kern „sv" < 3
  });

  it("null bei leerem Namen", async () => {
    expect(await getClubCrestLogoUrlByName(null)).toBeNull();
    expect(await getClubCrestLogoUrlByName("")).toBeNull();
  });
});

describe("backfillTeamLogoFromCrest", () => {
  it("setzt teams.logoUrl aus dem Cache, wenn noch keins gesetzt ist", async () => {
    const team = await seedTeam(null);
    await db.insert(clubCrests).values({
      fussballdeTeamId: team.fussballdeTeamId!,
      logoUrl: "r2://bucket/crests/T.png",
      sourceUrl: "https://f.de/getLogo/T"
    });

    const set = await backfillTeamLogoFromCrest(team.id, team.fussballdeTeamId!);

    expect(set).toBe(true);
    const [row] = await db.select({ logoUrl: teams.logoUrl }).from(teams).where(eq(teams.id, team.id));
    expect(row.logoUrl).toBe("r2://bucket/crests/T.png");
  });

  it("überschreibt ein hochgeladenes Logo NICHT (Upload gewinnt)", async () => {
    const team = await seedTeam("r2://bucket/teams/upload.png");
    await db.insert(clubCrests).values({
      fussballdeTeamId: team.fussballdeTeamId!,
      logoUrl: "r2://bucket/crests/T.png",
      sourceUrl: "https://f.de/getLogo/T"
    });

    const set = await backfillTeamLogoFromCrest(team.id, team.fussballdeTeamId!);

    expect(set).toBe(false);
    const [row] = await db.select({ logoUrl: teams.logoUrl }).from(teams).where(eq(teams.id, team.id));
    expect(row.logoUrl).toBe("r2://bucket/teams/upload.png");
  });

  it("kein Cache-Eintrag → false, kein Schreibvorgang", async () => {
    const team = await seedTeam(null);
    expect(await backfillTeamLogoFromCrest(team.id, team.fussballdeTeamId!)).toBe(false);
  });
});
