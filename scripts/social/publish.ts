import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DECKS } from "./decks";
import { STORIES } from "./stories";
import { SPOTS } from "./spots";
import { loadPosted, markPosted, postKey } from "./state";
import { deleteTemp, hasR2, r2Reason, uploadTemp } from "./r2";

/**
 * Veröffentlicht die fertigen Assets über die Instagram Content Publishing API.
 *
 *   npm run social:publish -- --list
 *   npm run social:publish -- reel 01         Probelauf (postet NICHTS)
 *   npm run social:publish -- reel 01 --live  postet wirklich
 *   npm run social:publish -- story wie-funktioniert --live
 *   npm run social:publish -- karussell 01 --live
 *
 * OHNE `--live` passiert nichts Öffentliches — ein Post ist nicht zurückholbar.
 *
 * ── Wie das Posten technisch läuft ──────────────────────────────────────────
 * Das ist der „Instagram-Login"-Weg (graph.instagram.com), live verifiziert am
 * 2026-07-20 mit dem echten Konto-Token. Dieser Weg nimmt Medien NICHT als
 * Datei-Upload, sondern ausschließlich als öffentlich erreichbare URL — Meta
 * holt sich die Datei selbst ab. Deshalb der Umweg über R2 (r2.ts): Asset kurz
 * hochladen, signierten Link erzeugen, posten, Asset wieder löschen. Gilt für
 * Reels, Stories UND Karussells gleichermaßen.
 *
 * Ablauf pro Post: Container anlegen (media_url) → auf Verarbeitung warten
 * (status_code = FINISHED) → media_publish. Bei Karussells zuerst ein
 * Kind-Container pro Bild, dann ein Eltern-Container, der sie bündelt.
 *
 * ── Was die API NICHT kann ──────────────────────────────────────────────────
 * Keine Musik auf Reels, keine Sticker/Links/Umfragen in Stories. Das geht nur
 * von Hand — dafür liegen die Assets weiter bereit.
 */

/* -------------------------------- Konfig ---------------------------------- */

/** Über IG_API_VERSION überschreibbar, falls diese ausläuft. */
const API_VERSION = process.env.IG_API_VERSION ?? "v23.0";
const GRAPH = `https://graph.instagram.com/${API_VERSION}`;

const OUT = join(process.cwd(), "out/social");

const POLL_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 3_000;

/** Instagram lässt maximal 10 Bilder pro Karussell zu. */
const MAX_CAROUSEL = 10;

export interface Config {
  igUserId: string;
  token: string;
}

export function loadConfig(): Config {
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
 * Ein Graph-Aufruf mit ehrlicher Fehlermeldung. Meta packt Fehler als
 * `error`-Objekt in den Body (oft mit HTTP 200) — ungeprüft liefe der Ablauf mit
 * einer undefinierten Container-ID weiter und scheiterte drei Schritte später.
 */
async function graph(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, string> },
  token: string
): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH}${path}`);
  const opts: RequestInit = { method: init.method };
  if (init.method === "POST") {
    opts.body = new URLSearchParams({ ...init.body, access_token: token });
  } else {
    url.searchParams.set("access_token", token);
    for (const [k, v] of Object.entries(init.body ?? {})) url.searchParams.set(k, v);
  }
  const res = await fetch(url, opts);
  const json = (await res.json()) as Record<string, unknown>;
  const err = json.error as { message?: string; error_user_msg?: string } | undefined;
  if (err) {
    throw new Error(`Graph API (${path}): ${err.error_user_msg ?? err.message ?? JSON.stringify(err)}`);
  }
  if (!res.ok) throw new Error(`Graph API (${path}): HTTP ${res.status}`);
  return json;
}

async function createContainer(cfg: Config, body: Record<string, string>): Promise<string> {
  const json = await graph(`/${cfg.igUserId}/media`, { method: "POST", body }, cfg.token);
  const id = json.id as string | undefined;
  if (!id) throw new Error(`Container-Anlage lieferte keine id: ${JSON.stringify(json)}`);
  return id;
}

/**
 * Warten, bis der Container verarbeitet ist. Ohne das schlägt media_publish
 * still fehl: Meta verarbeitet asynchron.
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

/** Ab hier ist es öffentlich. */
async function publishContainer(cfg: Config, containerId: string): Promise<string> {
  const json = await graph(
    `/${cfg.igUserId}/media_publish`,
    { method: "POST", body: { creation_id: containerId } },
    cfg.token
  );
  return json.id as string;
}

export async function remainingQuota(cfg: Config): Promise<string> {
  try {
    const json = await graph(
      `/${cfg.igUserId}/content_publishing_limit`,
      { method: "GET", body: { fields: "quota_usage,config" } },
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
 * PNG → JPEG-Bytes. Die API nimmt bei Bildern nur JPEG. Über ffmpeg nach stdout,
 * damit keine Temp-Datei nötig ist.
 */
function pngToJpeg(png: string): Buffer {
  return execFileSync(
    "ffmpeg",
    ["-loglevel", "error", "-i", png, "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "3", "pipe:1"],
    { maxBuffer: 32 * 1024 * 1024 }
  );
}

/* ------------------------------- Abläufe ---------------------------------- */

export interface Job {
  label: string;
  run: (cfg: Config) => Promise<void>;
}

/** Ein einzelnes Bild als Story oder Karussell-Kind hochladen + Container. */
async function imageContainer(
  cfg: Config,
  jpeg: Buffer,
  name: string,
  extra: Record<string, string>,
  temps: string[]
): Promise<string> {
  const { key, url } = await uploadTemp(`${name}.jpg`, jpeg, "image/jpeg");
  temps.push(key);
  return createContainer(cfg, { image_url: url, ...extra });
}

function reelJob(slug: string): Job {
  const mp4 = join(OUT, "reels", `${slug}.mp4`);
  const caption = readFileSync(join(OUT, "reels", `${slug}.caption.txt`), "utf8").trim();
  return {
    label: `Reel "${slug}" (${(statSync(mp4).size / 1e6).toFixed(1)} MB)`,
    run: async (cfg) => {
      const key = postKey("reel", slug);
      if (loadPosted().has(key)) {
        console.log("    schon gepostet — übersprungen.");
        return;
      }
      const temps: string[] = [];
      try {
        console.log("    lade Video nach R2 …");
        const up = await uploadTemp(`${slug}.mp4`, readFileSync(mp4), "video/mp4");
        temps.push(up.key);
        const id = await createContainer(cfg, { media_type: "REELS", video_url: up.url, caption });
        console.log(`    Container ${id} — warte auf Verarbeitung …`);
        await waitForContainer(id, cfg.token);
        const mediaId = await publishContainer(cfg, id);
        markPosted({ key, mediaId, at: new Date().toISOString() });
        console.log(`    ✓ veröffentlicht, Media-ID ${mediaId}`);
      } finally {
        for (const k of temps) await deleteTemp(k);
      }
    }
  };
}

function storyJob(slug: string): Job {
  const dir = join(OUT, "stories", slug);
  const slides = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  return {
    label: `Story-Highlight "${slug}" — ${slides.length} Slides, also ${slides.length} einzelne Stories`,
    run: async (cfg) => {
      const done = loadPosted();
      for (const [i, file] of slides.entries()) {
        const key = postKey("story", slug, i);
        if (done.has(key)) {
          console.log(`    Slide ${i + 1}/${slides.length} schon gepostet — übersprungen.`);
          continue;
        }
        const temps: string[] = [];
        try {
          const id = await imageContainer(
            cfg,
            pngToJpeg(join(dir, file)),
            `${slug}-${i}`,
            { media_type: "STORIES" },
            temps
          );
          await waitForContainer(id, cfg.token);
          const mediaId = await publishContainer(cfg, id);
          markPosted({ key, mediaId, at: new Date().toISOString() });
          done.add(key);
          console.log(`    ✓ Slide ${i + 1}/${slides.length} → ${mediaId}`);
        } finally {
          for (const k of temps) await deleteTemp(k);
        }
      }
      console.log("    Hinweis: Slides zu einem anpinnbaren Highlight bündeln geht nur in der App.");
    }
  };
}

function carouselJob(slug: string): Job {
  const dir = join(OUT, "karussell", slug);
  const slides = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
  const caption = readFileSync(join(dir, "caption.txt"), "utf8").trim();
  return {
    label: `Karussell "${slug}" — ${slides.length} Slides`,
    run: async (cfg) => {
      const key = postKey("karussell", slug);
      if (loadPosted().has(key)) {
        console.log("    schon gepostet — übersprungen.");
        return;
      }
      if (slides.length > MAX_CAROUSEL) {
        throw new Error(
          `Karussell hat ${slides.length} Slides, Instagram erlaubt höchstens ${MAX_CAROUSEL}. ` +
            "Deck kürzen oder aufteilen."
        );
      }
      const temps: string[] = [];
      try {
        const childIds: string[] = [];
        for (const [i, file] of slides.entries()) {
          const child = await imageContainer(
            cfg,
            pngToJpeg(join(dir, file)),
            `${slug}-${i}`,
            { is_carousel_item: "true" },
            temps
          );
          childIds.push(child);
          console.log(`    Bild ${i + 1}/${slides.length} vorbereitet.`);
        }
        const parent = await createContainer(cfg, {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          caption
        });
        console.log(`    Karussell-Container ${parent} — warte …`);
        await waitForContainer(parent, cfg.token);
        const mediaId = await publishContainer(cfg, parent);
        markPosted({ key, mediaId, at: new Date().toISOString() });
        console.log(`    ✓ veröffentlicht, Media-ID ${mediaId}`);
      } finally {
        for (const k of temps) await deleteTemp(k);
      }
    }
  };
}

/**
 * kind + Slug → Job. Eine Stelle, damit Einzel-Publisher (main) und Zeitplan-
 * Runner (queue.ts) dieselbe Post-Logik fahren.
 */
export function buildJob(kind: string, slug: string): Job {
  if (kind === "reel") return reelJob(slug);
  if (kind === "story") return storyJob(slug);
  if (kind === "karussell") return carouselJob(slug);
  throw new Error(`Unbekannte Art "${kind}". Erlaubt: reel, story, karussell.`);
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
  if (!hits.length) throw new Error(`Kein ${kind} passt auf "${needle}". Vorhanden:\n  ${pool.join("\n  ")}`);
  throw new Error(`"${needle}" ist mehrdeutig:\n  ${hits.join("\n  ")}`);
}

function list(): void {
  console.log("\nReels (… -- reel <name>):");
  for (const s of SPOTS) console.log(`  ${s.slug}`);
  console.log("\nStory-Highlights (… -- story <name>):");
  for (const s of STORIES) console.log(`  ${s.slug}`);
  console.log("\nKarussells (… -- karussell <name>):");
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
  const job = buildJob(kind, slug);

  console.log(`\n  ${job.label}`);

  if (!live) {
    console.log("\n  PROBELAUF — es wurde nichts gepostet.\n  Zum echten Posten dasselbe mit --live.\n");
    return;
  }

  if (!hasR2) throw new Error(r2Reason());
  const cfg = loadConfig();
  console.log(`  Tageskontingent verbraucht: ${await remainingQuota(cfg)}`);
  console.log("  → poste jetzt wirklich …\n");
  await job.run(cfg);
  console.log("");
}

// Nur als eigenständiger Befehl ausführen. queue.ts importiert aus dieser Datei
// (buildJob, loadConfig) — liefe main() beim Import mit, deutete der Import
// fremde Argumente als Post-Befehl. Dieselbe Falle wie bei den Renderern, hier
// mit einer irreversiblen Aktion am Ende.
if (process.argv[1]?.endsWith("publish.ts")) {
  main().catch((err) => {
    console.error(`\n  ${err.message ?? err}\n`);
    process.exit(1);
  });
}
