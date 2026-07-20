import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLAN, type PlanItem } from "./plan";

/**
 * Baut die „Postmappe": ein Ordner zum der Reihe nach Abarbeiten, jedes Stück
 * komplett beisammen (Datei(en) + Caption + INFO mit dem Was-tun).
 *
 *   npm run social:postmappe
 *
 * Zwei Bereiche, wie im Plan (plan.ts):
 *   - 00_HIGHLIGHTS: einmal einrichten und ans Profil pinnen (kein Feed).
 *   - 01…N: der Feed, in Reihenfolge, ein Angle nach dem anderen.
 *
 * Quelle sind plan.ts und die gerenderten Assets unter out/social/.
 */

const SRC = join(process.cwd(), "out/social");
const OUT = join(SRC, "postmappe");

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const weekday = (at: string) => WD[new Date(`${at}T12:00:00`).getDay()];
const KIND_LABEL = { reel: "REEL", story: "STORY", karussell: "KARUSSELL" } as const;

function copySlides(fromDir: string, toDir: string): number {
  const pngs = readdirSync(fromDir).filter((f) => f.endsWith(".png")).sort();
  pngs.forEach((f, i) =>
    copyFileSync(join(fromDir, f), join(toDir, `slide-${String(i + 1).padStart(2, "0")}.png`))
  );
  return pngs.length;
}

/** Assets + Caption eines Stücks in `dir` legen. Gibt die Bild-/Videozahl. */
function copyAssets(p: PlanItem, dir: string): number {
  if (p.kind === "reel") {
    copyFileSync(join(SRC, "reels", `${p.slug}.mp4`), join(dir, "video.mp4"));
    copyFileSync(join(SRC, "reels", `${p.slug}.caption.txt`), join(dir, "caption.txt"));
    return 1;
  }
  const sub = p.kind === "story" ? "stories" : "karussell";
  const n = copySlides(join(SRC, sub, p.slug), dir);
  copyFileSync(join(SRC, sub, p.slug, "caption.txt"), join(dir, "caption.txt"));
  return n;
}

function reelInfo(p: PlanItem, nr: string): string {
  return (
    `NR ${nr} · REEL · ${weekday(p.at)} ${p.at} · Angle: ${p.angle}\n${p.title}\n` +
    "\nDU POSTEST DIESES VON HAND — mit Musik.\n" +
    "(Die Automatik kann keine Musik, und bei Reels zählt Musik am meisten.)\n\n" +
    "So:\n" +
    "  1. video.mp4 per AirDrop aufs iPhone (in Fotos sichern)\n" +
    "  2. Instagram → + → Reel → das Video wählen\n" +
    "  3. Noten-Symbol → Musik aus dem Katalog\n" +
    "  4. Text aus caption.txt einfügen → Teilen\n"
  );
}

function karussellInfo(p: PlanItem, nr: string, count: number): string {
  return (
    `NR ${nr} · KARUSSELL · ${weekday(p.at)} ${p.at} · Angle: ${p.angle}\n${p.title}\n` +
    "\nLÄUFT AUTOMATISCH — Freigabe über:  npm run social:queue\n\n" +
    `${count} Bilder in Reihenfolge. Caption steht in caption.txt.\n\n` +
    "Von Hand (Alternative): Instagram → + → Beitrag → alle Bilder in Reihenfolge\n" +
    "auswählen → caption.txt einfügen → Teilen.\n"
  );
}

function highlightInfo(p: PlanItem, count: number): string {
  const last = `slide-${String(count).padStart(2, "0")}`;
  return `HIGHLIGHT · ${p.title} · Angle: ${p.angle}

EINMAL EINRICHTEN UND ANS PROFIL PINNEN — das ist kein Feed-Post, sondern
dein dauerhaftes Erklär-Regal oben am Profil.

Enthält ${count} Slides.

So:
  1. Die Slides der Reihe nach als Story posten (slide-01 … ${last}).
  2. Danach: dein Profil → Hervorheben → diese Story-Slides auswählen →
     als Highlight anpinnen, Titel z.B. ${p.title}.

(Anpinnen kann nur die App — deshalb von Hand.)
`;
}

function overview(feedLines: string[], hlLines: string[]): string {
  return (
    "KICKPACT — POSTPLAN\n" +
    "===================\n\n" +
    "Zwei Bereiche:\n\n" +
    "1) 00_HIGHLIGHTS — einmal einrichten und ans Profil PINNEN. Kein Feed, das\n" +
    "   ist dein dauerhaftes Erklär-Regal. Am besten in Woche 1 erledigen.\n\n" +
    "2) 01…" + String(feedLines.length).padStart(2, "0") +
    " — der FEED, der Reihe nach. Ein Angle nach dem anderen, kein\n" +
    "   Thema doppelt nebeneinander. REELS postest du selbst mit Musik,\n" +
    "   KARUSSELLS laufen automatisch (npm run social:queue, du gibst frei).\n\n" +
    "── HIGHLIGHTS (einmal, anpinnen) ──────────────────────────────────────\n" +
    hlLines.join("\n") +
    "\n\n── FEED (der Reihe nach) ──────────────────────────────────────────────\n" +
    "  NR  DATUM (Tag)    TYP        ANGLE            WER            TITEL\n" +
    "  " + "-".repeat(76) + "\n" +
    feedLines.join("\n") +
    "\n\nSamstage sind bewusst leer. Plan ändern: scripts/social/plan.ts\n"
  );
}

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const feed = PLAN.filter((p) => p.group === "feed");
  const highlights = PLAN.filter((p) => p.group === "highlight");

  // Feed, durchnummeriert.
  const feedLines = feed.map((p, i) => {
    const nr = String(i + 1).padStart(2, "0");
    const dir = join(OUT, `${nr}_${p.at}_${KIND_LABEL[p.kind]}_${p.slug}`);
    mkdirSync(dir, { recursive: true });
    const count = copyAssets(p, dir);
    const infoText = p.kind === "reel" ? reelInfo(p, nr) : karussellInfo(p, nr, count);
    writeFileSync(join(dir, "INFO.txt"), infoText, "utf8");
    const wer = p.manual ? "DU (mit Musik)" : "Automatik";
    return `  ${nr}  ${p.at} (${weekday(p.at)})  ${KIND_LABEL[p.kind].padEnd(9)} ${p.angle.padEnd(15)} ${wer.padEnd(14)} ${p.title}`;
  });

  // Highlights in einem eigenen Bereich.
  const hlParent = join(OUT, "00_HIGHLIGHTS_einmal-anpinnen");
  mkdirSync(hlParent, { recursive: true });
  const hlLines = highlights.map((p, i) => {
    const letter = String.fromCharCode(65 + i); // A, B, C, …
    const dir = join(hlParent, `${letter}_${p.slug}`);
    mkdirSync(dir, { recursive: true });
    const count = copyAssets(p, dir);
    writeFileSync(join(dir, "INFO.txt"), highlightInfo(p, count), "utf8");
    return `  ${letter})  ${p.title.padEnd(24)} (${p.angle})`;
  });

  writeFileSync(join(OUT, "00_UEBERSICHT.txt"), overview(feedLines, hlLines), "utf8");

  console.log(`  ${feed.length} Feed-Posts + ${highlights.length} Highlights → out/social/postmappe/`);
  console.log(overview(feedLines, hlLines));
}

main();
