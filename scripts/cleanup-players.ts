/**
 * Einmal-Bereinigung der `players`-Tabelle + `match_events.player_name`.
 *
 * Entfernt aus dem Spieler-Pool:
 *  - Match-Bericht-Überschriften ("… feiert Sieg …", "Keine Tore in …"),
 *  - Gegner-Spieler ("(Fremdverein) Spieler"),
 *  - Tofu/obfuskierte Namen;
 * strippt "(EigenVerein) Spieler"-Suffixe, dedupliziert pro Mannschaft und
 * säubert die Torschützen-Namen in `match_events`.
 *
 * Dry-run by default. Mit EXECUTE=1 werden die Änderungen geschrieben.
 * Regeln-basiert (deterministisch); die unsicheren Reste werden im Report
 * gelistet (für eine optionale KI-Nachprüfung).
 */
import { db } from "../lib/db/client";
import { sql } from "drizzle-orm";
import {
  cleanPlayerName,
  isLikelyPlayerName,
  extractSuffixClub,
  suffixClubMatchesOwn,
  playerDedupKey
} from "../lib/players/person-name";

const EXECUTE = process.env.EXECUTE === "1";

type Row = {
  id: string;
  name: string;
  fid: string | null;
  team_id: string;
  team_name: string;
  club_name: string;
};

async function main() {
  const rows = (await db.execute(sql`
    SELECT p.id, p.name, p.fussballde_player_id AS fid, p.team_id,
           t.name AS team_name, c.name AS club_name
    FROM players p
    JOIN teams t ON t.id = p.team_id
    JOIN clubs c ON c.id = t.club_id
    ORDER BY p.team_id`)) as unknown as Row[];

  const delOpponent: Row[] = [];
  const delHeadline: Row[] = [];
  const delDup: Row[] = [];
  const rename: Array<{ id: string; from: string; to: string }> = [];

  // pro Team gruppieren
  const byTeam = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, []);
    byTeam.get(r.team_id)!.push(r);
  }

  for (const [, teamRows] of byTeam) {
    const ownClub = teamRows[0].club_name;
    const survivors: Array<{ row: Row; display: string }> = [];
    for (const r of teamRows) {
      const raw = (r.name ?? "").trim();
      const suffixClub = extractSuffixClub(raw);
      if (suffixClub && !suffixClubMatchesOwn(suffixClub, ownClub)) {
        delOpponent.push(r);
        continue;
      }
      if (!isLikelyPlayerName(raw)) {
        delHeadline.push(r);
        continue;
      }
      const display = cleanPlayerName(raw);
      if (display !== raw) rename.push({ id: r.id, from: raw, to: display });
      survivors.push({ row: r, display });
    }
    // Dedup pro Team über normalisierten Key — beste Zeile (mit fid) behalten.
    const best = new Map<string, { row: Row; display: string }>();
    for (const s of survivors) {
      const key = playerDedupKey(s.display);
      if (!key) continue;
      const cur = best.get(key);
      if (!cur) { best.set(key, s); continue; }
      const better = !!s.row.fid && !cur.row.fid;
      if (better) { delDup.push(cur.row); best.set(key, s); }
      else { delDup.push(s.row); }
    }
  }

  const allDeleteIds = [...delOpponent, ...delHeadline, ...delDup].map((r) => r.id);

  // match_events.player_name: Suffix strippen + Müll-Namen auf NULL.
  const evNames = (await db.execute(sql`
    SELECT DISTINCT player_name AS name FROM match_events WHERE player_name IS NOT NULL`)) as unknown as Array<{ name: string }>;
  const evStrip: Array<{ from: string; to: string }> = [];
  const evNull: string[] = [];
  for (const e of evNames) {
    if (!isLikelyPlayerName(e.name)) { evNull.push(e.name); continue; }
    const cleaned = cleanPlayerName(e.name);
    if (cleaned !== e.name) evStrip.push({ from: e.name, to: cleaned });
  }

  // ---- Report ----
  console.log(`players gesamt: ${rows.length}`);
  console.log(`  → Gegner löschen:      ${delOpponent.length}`);
  console.log(`  → Überschriften/Müll:  ${delHeadline.length}`);
  console.log(`  → Dubletten löschen:   ${delDup.length}`);
  console.log(`  → Suffix strippen:     ${rename.length}`);
  console.log(`match_events.player_name: Suffix-strip ${evStrip.length}, auf NULL ${evNull.length}`);
  const sample = (arr: any[], f: (x: any) => string, n = 12) =>
    arr.slice(0, n).map(f).forEach((s) => console.log("     " + s));
  console.log("\n  Beispiel Überschriften/Müll:");
  sample(delHeadline, (r) => r.name);
  console.log("  Beispiel Gegner:");
  sample(delOpponent, (r) => r.name);
  console.log("  Beispiel match_events → NULL:");
  sample(evNull, (s) => s);

  if (!EXECUTE) {
    console.log("\n[DRY-RUN] nichts geschrieben. EXECUTE=1 zum Ausführen.");
    return;
  }

  await db.transaction(async (tx: any) => {
    // 1) Renames (Suffix strippen) — vor dem Dedup-Delete schon erledigt durch
    //    die Auswahl; hier nur die Survivor-Renames anwenden.
    for (const r of rename) {
      await tx.execute(sql`UPDATE players SET name = ${r.to} WHERE id = ${r.id}`);
    }
    // 2) Müll/Gegner/Dubletten löschen (match_events.player_id → set null via FK).
    const chunk = 200;
    for (let i = 0; i < allDeleteIds.length; i += chunk) {
      const ids = allDeleteIds.slice(i, i + chunk);
      const inList = sql`(${sql.join(ids.map((x) => sql`${x}`), sql`, `)})`;
      await tx.execute(sql`DELETE FROM players WHERE id IN ${inList}`);
    }
    // 3) match_events.player_name säubern.
    for (const e of evStrip) {
      await tx.execute(sql`UPDATE match_events SET player_name = ${e.to} WHERE player_name = ${e.from}`);
    }
    for (let i = 0; i < evNull.length; i += chunk) {
      const names = evNull.slice(i, i + chunk);
      const inList = sql`(${sql.join(names.map((x) => sql`${x}`), sql`, `)})`;
      await tx.execute(sql`UPDATE match_events SET player_name = NULL WHERE player_name IN ${inList}`);
    }
  });
  console.log("\n[EXECUTE] fertig.");
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
