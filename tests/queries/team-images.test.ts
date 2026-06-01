import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  addTeamImage,
  listTeamImages,
  deleteTeamImage,
  countTeamImages
} from "@/lib/db/queries/team-images";

async function makeTeam(): Promise<string> {
  const [club] = await db
    .insert(clubs)
    .values({ slug: `c-${createId().slice(0, 6)}`, name: "C", fussballdeVereinId: createId() })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({ clubId: club.id, name: "1. Herren", saison: "2526", fussballdeTeamId: createId(), isActive: true })
    .returning({ id: teams.id });
  return team.id;
}

describe("team-images query", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("fügt Bilder hinzu und listet sie nach sortOrder", async () => {
    const teamId = await makeTeam();
    await addTeamImage(teamId, "teams/x/gallery-1.jpg");
    await addTeamImage(teamId, "teams/x/gallery-2.jpg");
    const imgs = await listTeamImages(teamId);
    expect(imgs.length).toBe(2);
    expect(imgs[0].sortOrder).toBeLessThanOrEqual(imgs[1].sortOrder);
    expect(await countTeamImages(teamId)).toBe(2);
  });

  it("löscht nur Bilder des eigenen Teams", async () => {
    const a = await makeTeam();
    const b = await makeTeam();
    const imgA = await addTeamImage(a, "teams/a/g.jpg");
    // Löschen mit falschem Team → kein Effekt
    const wrong = await deleteTeamImage(b, imgA.id);
    expect(wrong).toBe(false);
    expect(await countTeamImages(a)).toBe(1);
    // Korrektes Team → gelöscht
    const ok = await deleteTeamImage(a, imgA.id);
    expect(ok).toBe(true);
    expect(await countTeamImages(a)).toBe(0);
  });
});
