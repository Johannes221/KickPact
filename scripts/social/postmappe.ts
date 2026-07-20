import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN, type PlanItem } from "./plan";

/**
 * Baut die „Postmappe": einen durchnummerierten Ordner in Posting-Reihenfolge,
 * jedes Stück komplett beisammen (Datei(en) + Caption + eine INFO, was zu tun
 * ist). Zweck: nicht mehr zwischen Karussell-/Story-/Reel-Ordnern springen,
 * sondern der Reihe nach abarbeiten.
 *
 *   npm run social:postmappe
 *
 * Quelle ist plan.ts und die gerenderten Assets unter out/social/. Wer den Plan
 * ändert (Datum, Reihenfolge), ändert plan.ts und lässt das hier neu laufen.
 */

const SRC = join(process.cwd(), "out/social");
const OUT = join(SRC, "postmappe");

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const weekday = (at: string) => WD[new Date(`${at}T12:00:00`).getDay()];
const KIND_LABEL = { reel: "REEL", story: "STORY", karussell: "KARUSSELL" } as const;

/** Slides eines Ordners sortiert kopieren, umbenannt zu slide-01.png … */
function copySlides(fromDir: string, toDir: string): number {
  const pngs = readdirSync(fromDir).filter((f) => f.endsWith(".png")).sort();
  pngs.forEach((f, i) => {
    copyFileSync(join(fromDir, f), join(toDir, `slide-${String(i + 1).padStart(2, "0")}.png`));
  });
  return pngs.length;
}

/** Die „was tun"-Notiz je Stück — der eigentliche Wegweiser. */
function info(nr: number, p: PlanItem, count: number): string {
  const kopf = `NR ${String(nr).padStart(2, "0")} · ${KIND_LABEL[p.kind]} · ${weekday(p.at)} ${p.at}\n${p.title}\n`;

  if (p.kind === "reel") {
    return (
      kopf +
      "\nDU POSTEST DIESES VON HAND — mit Musik.\n" +
      "(Die Automatik kann keine Musik, und bei Reels zählt Musik am meisten.)\n\n" +
      "So:\n" +
      "  1. video.mp4 per AirDrop aufs iPhone (in Fotos sichern)\n" +
      "  2. Instagram → + → Reel → das Video wählen\n" +
      "  3. Noten-Symbol → Musik aus dem Katalog\n" +
      "  4. Text aus caption.txt einfügen → Teilen\n"
    );
  }

  if (p.kind === "story") {
    return (
      kopf +
      `\nLÄUFT AUTOMATISCH — Freigabe über:  npm run social:queue\n\n` +
      `Enthält ${count} Slides. Die Automatik postet sie nacheinander als Stories.\n` +
      "Danach in der App zu einem Highlight bündeln und anpinnen (das kann nur die App).\n\n" +
      "Von Hand (Alternative): die Slides in Reihenfolge als Story posten.\n"
    );
  }

  return (
    kopf +
    `\nLÄUFT AUTOMATISCH — Freigabe über:  npm run social:queue\n\n` +
    `${count} Bilder in Reihenfolge. Caption steht in caption.txt.\n\n` +
    "Von Hand (Alternative): Instagram → + → Beitrag → alle Bilder in Reihenfolge\n" +
    "auswählen → caption.txt einfügen → Teilen.\n"
  );
}

function buildItem(nr: number, p: PlanItem): { line: string } {
  const nn = String(nr).padStart(2, "0");
  const dir = join(OUT, `${nn}_${p.at}_${KIND_LABEL[p.kind]}_${p.slug}`);
  mkdirSync(dir, { recursive: true });

  let count = 1;
  if (p.kind === "reel") {
    copyFileSync(join(SRC, "reels", `${p.slug}.mp4`), join(dir, "video.mp4"));
    copyFileSync(join(SRC, "reels", `${p.slug}.caption.txt`), join(dir, "caption.txt"));
  } else {
    const sub = p.kind === "story" ? "stories" : "karussell";
    count = copySlides(join(SRC, sub, p.slug), dir);
    copyFileSync(join(SRC, sub, p.slug, "caption.txt"), join(dir, "caption.txt"));
  }

  writeFileSync(join(dir, "INFO.txt"), info(nr, p, count), "utf8");

  const modus = p.manual ? "DU (mit Musik)" : "Automatik";
  const inhalt = p.kind === "reel" ? "1 Video" : `${count} Bilder`;
  return {
    line: `  ${nn}  ${p.at} (${weekday(p.at)})  ${KIND_LABEL[p.kind].padEnd(9)} ${modus.padEnd(15)} ${inhalt.padEnd(10)} ${p.title}`
  };
}

function overview(lines: string[]): string {
  return (
    "KICKPACT — POSTPLAN\n" +
    "===================\n\n" +
    "Der Reihe nach abarbeiten. Jeder Ordner enthält die Datei(en), die Caption\n" +
    "und eine INFO.txt mit dem Was-tun.\n\n" +
    "REELS postest du selbst mit Musik (siehe INFO im jeweiligen Ordner).\n" +
    "STORIES und KARUSSELLS laufen automatisch über  npm run social:queue\n" +
    "(du gibst jeden Post frei) — oder du postest sie ebenfalls von Hand.\n\n" +
    "  NR  DATUM (Tag)    TYP       WER             INHALT     TITEL\n" +
    "  " + "-".repeat(74) + "\n" +
    lines.join("\n") +
    "\n\nSamstage sind bewusst leer. Plan ändern: scripts/social/plan.ts\n"
  );
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const lines = PLAN.map((p, i) => buildItem(i + 1, p).line);
  writeFileSync(join(OUT, "00_UEBERSICHT.txt"), overview(lines), "utf8");

  console.log(`  ${PLAN.length} Posts → out/social/postmappe/`);
  console.log(overview(lines));
}

main();
