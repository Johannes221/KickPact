import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { SCHEDULE, type ScheduledPost } from "./schedule";
import { STORIES } from "./stories";
import { buildJob, loadConfig, remainingQuota } from "./publish";
import { loadPosted, postKey } from "./state";

/**
 * Der Zeitplan-Runner: postet, was fällig ist — aber nur nach deiner Freigabe.
 *
 *   npm run social:queue            fällige Posts einzeln freigeben und posten
 *   npm run social:queue -- --list  nur zeigen, was fällig/geplant ist
 *   npm run social:queue -- --notify  Desktop-Hinweis bei Fälligem (für den Timer)
 *
 * DER TIMER POSTET NIE VON SELBST. launchd startet nur `--notify`, das zählt und
 * schickt eine Meldung. Das echte Posten läuft ausschließlich interaktiv, mit
 * einem „posten? [j/N]" pro Stück — und verweigert sich hart, wenn kein Terminal
 * dranhängt. So kann kein Automatismus versehentlich etwas Öffentliches tun.
 *
 * Fällig = geplanter Zeitpunkt erreicht UND noch nicht gepostet (state.ts). Ein
 * Lauf, der zu spät kommt (Rechner war aus), holt Verpasstes nach.
 */

const OUT = join(process.cwd(), "out/social");

/** "YYYY-MM-DD HH:mm" als ORTSZEIT des Rechners (der steht auf Europe/Berlin). */
function parseAt(at: string): Date {
  return new Date(at.replace(" ", "T"));
}

/**
 * Gilt der Eintrag als erledigt?
 *
 * Für Stories erst, wenn JEDER Slide gepostet ist — ein nach Slide 3 von 6
 * abgebrochenes Highlight ist nicht fertig und soll beim nächsten Lauf wieder
 * auftauchen (der Post-Code überspringt dann die drei erledigten Slides).
 */
function isDone(p: ScheduledPost, posted: Set<string>): boolean {
  if (p.kind !== "story") return posted.has(postKey(p.kind, p.slug));
  const dir = join(OUT, "stories", p.slug);
  const slides = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  if (!slides.length) return false;
  return slides.every((_, i) => posted.has(postKey("story", p.slug, i)));
}

function dueNow(now: Date, posted: Set<string>): ScheduledPost[] {
  return SCHEDULE.filter((p) => parseAt(p.at) <= now && !isDone(p, posted)).sort(
    (a, b) => parseAt(a.at).getTime() - parseAt(b.at).getTime()
  );
}

function upcoming(now: Date, posted: Set<string>): ScheduledPost[] {
  return SCHEDULE.filter((p) => parseAt(p.at) > now && !isDone(p, posted)).sort(
    (a, b) => parseAt(a.at).getTime() - parseAt(b.at).getTime()
  );
}

/** Vorschau öffnen: Reel im Player, Story-Ordner im Finder. */
function openPreview(p: ScheduledPost): void {
  const path =
    p.kind === "reel"
      ? join(OUT, "reels", `${p.slug}.mp4`)
      : join(OUT, p.kind === "story" ? "stories" : "karussell", p.slug);
  if (existsSync(path)) {
    try {
      execFileSync("open", [path]);
    } catch {
      // Kein `open` (nicht macOS) oder Vorschau ging nicht — kein Grund, die
      // Freigabe abzubrechen. Der Slug steht im Prompt, man weiß, worum es geht.
    }
  }
}

/** macOS-Desktop-Hinweis. Nur für den Timer; postet nichts. */
function notify(count: number): void {
  const msg = `${count} Post(s) fällig. Freigeben mit: npm run social:queue`;
  try {
    execFileSync("osascript", [
      "-e",
      `display notification "${msg}" with title "KickPact Social" sound name "Glass"`
    ]);
  } catch {
    // osascript nur auf macOS. Ohne es fällt der Hinweis aus — der --list-Weg
    // zeigt dasselbe.
  }
}

function fmt(p: ScheduledPost): string {
  return `${p.at}  ${p.kind.padEnd(6)} ${p.slug}`;
}

async function main() {
  const args = process.argv.slice(2);
  const now = new Date();
  const posted = loadPosted();
  const due = dueNow(now, posted);

  /* --- Timer-Modus: zählen und melden, NIE posten --- */
  if (args.includes("--notify")) {
    if (due.length) {
      notify(due.length);
      console.log(`${due.length} fällig, Hinweis geschickt.`);
    }
    return;
  }

  /* --- Nur anzeigen --- */
  if (args.includes("--list")) {
    console.log(`\nFällig (${due.length}):`);
    console.log(due.length ? due.map((p) => "  " + fmt(p)).join("\n") : "  nichts");
    const next = upcoming(now, posted);
    console.log(`\nKommt noch (${next.length}):`);
    console.log(next.length ? next.map((p) => "  " + fmt(p)).join("\n") : "  nichts");
    console.log("");
    return;
  }

  /* --- Freigeben und posten --- */
  if (!due.length) {
    const next = upcoming(now, posted)[0];
    console.log(
      next
        ? `\n  Nichts fällig. Nächster Post: ${fmt(next)}\n`
        : "\n  Nichts fällig, nichts mehr geplant. Zeitplan: scripts/social/schedule.ts\n"
    );
    return;
  }

  // Ohne Terminal keine Freigabe — der harte Riegel gegen versehentliches
  // automatisches Posten (z.B. wenn der Timer versehentlich diesen Modus träfe).
  if (!process.stdin.isTTY) {
    console.error(
      `\n  ${due.length} Post(s) fällig, aber kein interaktives Terminal.\n` +
        "  Freigabe braucht ein Terminal: npm run social:queue\n"
    );
    process.exit(1);
  }

  const cfg = loadConfig(); // wirft klar, wenn Token/ID fehlen
  console.log(`\n  ${due.length} fällig. Tageskontingent verbraucht: ${await remainingQuota(cfg)}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const p of due) {
      const job = buildJob(p.kind, p.slug);
      console.log(`  ── ${fmt(p)}`);
      console.log(`     ${job.label}`);
      openPreview(p);
      const ans = (await rl.question("     jetzt posten? [j/N] ")).trim().toLowerCase();
      if (ans !== "j" && ans !== "ja") {
        console.log("     übersprungen — bleibt fällig.\n");
        continue;
      }
      await job.run(cfg);
      console.log("");
    }
  } finally {
    rl.close();
  }
  console.log("  fertig.\n");
}

main().catch((err) => {
  console.error(`\n  ${err.message ?? err}\n`);
  process.exit(1);
});
