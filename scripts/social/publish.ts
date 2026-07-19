import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DECKS } from "./decks";
import { STORIES } from "./stories";
import { SPOTS } from "./spots";

/**
 * Veröffentlicht die fertigen Assets über die Instagram Content Publishing API.
 *
 *   npm run social:publish -- --list                 was ist veröffentlichbar
 *   npm run social:publish -- reel 01                Probelauf (postet NICHTS)
 *   npm run social:publish -- reel 01 --live         postet wirklich
 *   npm run social:publish -- story wie-funktioniert --live
 *   npm run social:publish -- karussell 01 --live    (braucht R2, s. unten)
 *
 * OHNE `--live` passiert nichts Öffentliches. Das ist Absicht: ein Post ist
 * nicht zurückholbar, und ein versehentlicher Lauf beim Ausprobieren wäre genau
 * die Art Fehler, die man nicht wiedergutmachen kann.
 *
 * ── Warum Stories hier als VIDEO rausgehen ──────────────────────────────────
 * Die API nimmt Bilder ausschließlich als öffentlich erreichbare URL, und nur
 * als JPEG. Videos dagegen lassen sich direkt hochladen (Resumable Upload), und
 * `media_type: STORIES` unterstützt das. Ein Story-Slide als 5-Sekunden-Video
 * verhält sich für den Betrachter exakt wie ein Bild-Slide (Instagram blendet
 * Bild-Stories ohnehin nach ~5 s weiter) — spart aber den ganzen Umweg über
 * einen öffentlichen Bucket. Die PNGs unter out/social/stories/ bleiben
 * unangetastet, die sind für das Posten von Hand.
 *
 * Karussells gehen nicht ohne Hosting: eine Bild-URL ist Pflicht. Dafür braucht
 * es R2 (CLOUDFLARE_R2_*) in der .env.local.
 *
 * ── Was die API NICHT kann ──────────────────────────────────────────────────
 * Keine Sticker, keine Links, keine Umfragen in Stories. Keine Musik (die Audio
 * API deckt nur Reels ab, ohne Trending-Sounds, und nur mit Facebook-Login).
 * Alles davon geht nur von Hand. Deshalb liegen die PNGs weiter bereit.
 */

/* -------------------------------- Konfig ---------------------------------- */

/**
 * Graph-API-Version. Meta veraltet Versionen nach etwa zwei Jahren; eine zu
 * alte antwortet mit einem klaren Fehler, nicht still falsch. Über
 * IG_API_VERSION überschreibbar, falls diese hier abläuft.
 */
const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${API_VERSION}`;
const RUPLOAD = `https://rupload.facebook.com/ig-api-upload/${API_VERSION}`;

const OUT = join(process.cwd(), "out/social");

/** Standzeit eines Story-Slides. Entspricht dem, was Instagram Bildern gibt. */
const STORY_SECONDS = 5;

/** Wie lange auf die Verarbeitung gewartet wird, bevor abgebrochen wird. */
const POLL_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 3_000;

interface Config {
  igUserId: string;
  token: string;
}

function config(): Config {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUserId || !token) {
    throw new Error(
      "IG_USER_ID und IG_ACCESS_TOKEN fehlen in .env.local.\n" +
        "Einrichtung: docs/marketing/instagram-api.md"
    );
  }
  return { igUserId, token };
}

/* ------------------------------- API-Basis -------------------------------- */

/**
 * Ein Graph-API-Aufruf mit ehrlicher Fehlermeldung.
 *
 * Meta antwortet auf Fehler mit HTTP 200 und einem `error`-Objekt im Body, oder
 * mit 4xx und demselben Objekt. Beides hier abfangen — sonst läuft der Ablauf
 * mit einer undefinierten Container-ID weiter und scheitert drei Schritte
 * später an einer Stelle, die nichts mit der Ursache zu tun hat.
 */
async function graph(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, string> },
  token: string
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}${path}`);
  const opts: RequestInit = { method: init.method };

  if (init.method === "POST") {
    const form = new URLSearchParams({ ...init.body, access_token: token });
    opts.body = form;
  } else {
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(init.body ?? {})) url.searchParams.set(k, v);
  }

  const res = await fetch(url, opts);
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string; error_user_msg?: string } | undefined;
  if (err) {
    throw new Error(
      `Graph API (${path}): ${err.error_user_msg ?? err.message ?? JSON.stringify(err)}`
    );
  }
  if (!res.ok) throw new Error(`Graph API (${path}): HTTP ${res.status}`);
  return json;
}

/** Container anlegen. Gibt die Container-ID zurück. */
async function createContainer(
  cfg: Config,
  body: Record<string, string>
): Promise<string> {
  const json = await graph(`/${cfg.igUserId}/media`, { method: "POST", body }, cfg.token);
  const id = json.id as string | undefined;
  if (!id) throw new Error(`Container-Anlage lieferte keine id: ${JSON.stringify(json)}`);
  return id;
}

/**
 * Video-Bytes direkt hochladen. Kein öffentliches Hosting nötig.
 *
 * Nicht über `graph()`: das hier geht an einen anderen Host, will den Token im
 * Authorization-Header statt als Parameter und nimmt rohe Bytes statt eines
 * Formulars.
 */
async function uploadVideo(containerId: string, file: string, token: string): Promise<void> {
  const bytes = readFileSync(file);
  const res = await fetch(`${RUPLOAD}/${containerId}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${token}`,
      offset: "0",
      file_size: String(statSync(file).size)
    },
    body: new Uint8Array(bytes)
  });
  const json = (await res.json()) as { success?: boolean; debug_info?: { message?: string } };
  if (!json.success) {
    throw new Error(
      `Upload fehlgeschlagen (${file}): ${json.debug_info?.message ?? JSON.stringify(json)}`
    );
  }
}

/**
 * Warten, bis der Container verarbeitet ist.
 *
 * Ohne das schlägt `media_publish` still fehl: Meta verarbeitet Videos
 * asynchron, und ein Publish auf einen noch laufenden Container wird abgelehnt.
 */
async function waitForContainer(containerId: string, token: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const json = await graph(
      `/${containerId}`,
      { method: "GET", body: { fields: "status_code,status" } },
      token
    );
    const code = json.status_code as string;
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Container ${containerId}: ${code} — ${json.status ?? "kein Grund genannt"}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Container ${containerId} nach 5 Minuten noch ${code}. Abgebrochen.`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Container veröffentlichen. Ab hier ist es öffentlich. */
async function publishContainer(cfg: Config, containerId: string): Promise<string> {
  const json = await graph(
    `/${cfg.igUserId}/media_publish`,
    { method: "POST", body: { creation_id: containerId } },
    cfg.token
  );
  return json.id as string;
}

/**
 * Wie viel vom Tageskontingent noch übrig ist.
 *
 * 100 Posts pro 24 Stunden, gleitend. Die Story-Highlights haben je 5 bis 6
 * Slides und damit ebenso viele Posts — bei mehreren Highlights am Stück ist
 * das Kontingent schneller relevant, als man denkt.
 */
async function remainingQuota(cfg: Config): Promise<string> {
  try {
    const json = await graph(
      `/${cfg.igUserId}/content_publishing_limit`,
      { method: "GET", body: { fields: "config,quota_usage" } },
      cfg.token
    );
    const row = (json.data as Array<Record<string, unknown>>)?.[0];
    const used = row?.quota_usage ?? "?";
    const total = (row?.config as { quota_total?: number } | undefined)?.quota_total ?? 100;
    return `${used}/${total}`;
  } catch {
    return "unbekannt";
  }
}

/* ------------------------------ Umwandlung -------------------------------- */

/**
 * Ein Story-PNG in ein Video derselben Länge, die Instagram Bildern gibt.
 *
 * yuv420p + gerade Maße: ohne das lehnen manche Meta-Encoder ab. Stumm
 * (`-an`): eine Tonspur bringt hier nichts, und Musik ginge über die API
 * ohnehin nicht.
 */
function pngToStoryVideo(png: string, dir: string): string {
  const mp4 = join(dir, `${png.split("/").pop()!.replace(/\.png$/, "")}.mp4`);
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-loop", "1", "-i", png,
      "-t", String(STORY_SECONDS),
      "-r", "30",
      "-c:v", "libx264", "-profile:v", "high", "-pix_fmt", "yuv420p", "-crf", "20",
      "-an",
      "-movflags", "+faststart",
      mp4
    ],
    { stdio: "inherit" }
  );
  return mp4;
}

/* ------------------------------- Abläufe ---------------------------------- */

interface Job {
  /** Was in der Vorschau steht. */
  label: string;
  /** Führt den Post aus. Wird nur bei --live aufgerufen. */
  run: (cfg: Config) => Promise<void>;
}

function reelJob(slug: string): Job {
  const mp4 = join(OUT, "reels", `${slug}.mp4`);
  const captionFile = join(OUT, "reels", `${slug}.caption.txt`);
  const caption = readFileSync(captionFile, "utf8").trim();

  return {
    label: `Reel "${slug}" (${(statSync(mp4).size / 1e6).toFixed(1)} MB, Caption ${caption.length} Zeichen)`,
    run: async (cfg) => {
      const id = await createContainer(cfg, {
        media_type: "REELS",
        upload_type: "resumable",
        caption
      });
      console.log(`    Container ${id} — lade hoch …`);
      await uploadVideo(id, mp4, cfg.token);
      console.log("    hochgeladen, warte auf Verarbeitung …");
      await waitForContainer(id, cfg.token);
      const mediaId = await publishContainer(cfg, id);
      console.log(`    ✓ veröffentlicht, Media-ID ${mediaId}`);
    }
  };
}

function storyJob(slug: string): Job {
  const dir = join(OUT, "stories", slug);
  const slides = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();

  return {
    label: `Story-Highlight "${slug}" — ${slides.length} Slides, also ${slides.length} einzelne Stories`,
    run: async (cfg) => {
      const tmp = mkdtempSync(join(tmpdir(), "kickpact-story-"));
      try {
        for (const [i, file] of slides.entries()) {
          const mp4 = pngToStoryVideo(join(dir, file), tmp);
          const id = await createContainer(cfg, {
            media_type: "STORIES",
            upload_type: "resumable"
          });
          await uploadVideo(id, mp4, cfg.token);
          await waitForContainer(id, cfg.token);
          const mediaId = await publishContainer(cfg, id);
          console.log(`    ✓ Slide ${i + 1}/${slides.length} → ${mediaId}`);
        }
        console.log(
          "    Hinweis: Highlight-Sammlung anlegen und anpinnen geht nur in der App."
        );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    }
  };
}

function carouselJob(slug: string): Job {
  const dir = join(OUT, "karussell", slug);
  const slides = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();

  return {
    label: `Karussell "${slug}" — ${slides.length} Slides ⚠ braucht R2`,
    run: async () => {
      throw new Error(
        "Karussells brauchen öffentlich erreichbare JPEG-URLs — die API nimmt bei " +
          "Bildern keinen Direkt-Upload.\n" +
          "Dafür müssen die R2-Zugangsdaten (CLOUDFLARE_R2_*) in die .env.local; " +
          "sie liegen in Coolify bzw. Vaultwarden.\n" +
          "Bis dahin: Karussells von Hand posten, die PNGs liegen bereit."
      );
    }
  };
}

/* --------------------------------- Runner --------------------------------- */

function findSlug(kind: string, needle: string): string {
  const pool =
    kind === "reel"
      ? SPOTS.map((s) => s.slug)
      : kind === "story"
        ? STORIES.map((s) => s.slug)
        : DECKS.map((d) => d.slug);
  const hits = pool.filter((s) => s.includes(needle));
  if (hits.length === 1) return hits[0];
  if (!hits.length) {
    throw new Error(`Kein ${kind} passt auf "${needle}". Vorhanden:\n  ${pool.join("\n  ")}`);
  }
  throw new Error(`"${needle}" ist mehrdeutig:\n  ${hits.join("\n  ")}`);
}

function list(): void {
  console.log("\nReels (npm run social:publish -- reel <name>):");
  for (const s of SPOTS) console.log(`  ${s.slug}`);
  console.log("\nStory-Highlights (… -- story <name>):");
  for (const s of STORIES) console.log(`  ${s.slug}`);
  console.log("\nKarussells (… -- karussell <name>, braucht R2):");
  for (const d of DECKS) console.log(`  ${d.slug}`);
  console.log("");
}

async function main() {
  const args = process.argv.slice(2);
  const live = args.includes("--live");
  const rest = args.filter((a) => !a.startsWith("--"));

  if (args.includes("--list") || !rest.length) {
    list();
    return;
  }

  const [kind, needle] = rest;
  if (!["reel", "story", "karussell"].includes(kind)) {
    throw new Error(`Unbekannte Art "${kind}". Erlaubt: reel, story, karussell.`);
  }
  const slug = findSlug(kind, needle ?? "");

  const job =
    kind === "reel" ? reelJob(slug) : kind === "story" ? storyJob(slug) : carouselJob(slug);

  console.log(`\n  ${job.label}`);

  if (!live) {
    console.log(
      "\n  PROBELAUF — es wurde nichts gepostet.\n" +
        "  Zum echten Posten dasselbe nochmal mit --live.\n"
    );
    return;
  }

  const cfg = config();
  console.log(`  Tageskontingent verbraucht: ${await remainingQuota(cfg)}`);
  console.log("  → poste jetzt wirklich …\n");
  await job.run(cfg);
  console.log("");
}

main().catch((err) => {
  console.error(`\n  ${err.message ?? err}\n`);
  process.exit(1);
});
