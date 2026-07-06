/**
 * Help-Center: Server-side Article Loader.
 *
 * Liest Markdown-Artikel aus `docs/help-center/articles/*.md`, parst
 * Frontmatter via gray-matter + Body via marked. Cached pro Process-Lifetime.
 *
 * Server Components only — `node:fs` ist nicht im Edge-Runtime verfügbar.
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { marked } from "marked";

const ARTICLES_DIR = path.join(process.cwd(), "docs", "help-center", "articles");

/**
 * SECURITY (L4): `marked` sanitisiert per Default NICHT — rohes HTML im Markdown
 * (inkl. <script>, on*-Handler, javascript:-URLs) wird durchgereicht und landet
 * via dangerouslySetInnerHTML im DOM. Die Artikel-Quelle sind aktuell nur
 * repo-interne .md-Files (kein User-Input), daher latentes Risiko — diese
 * dependency-freie Sanitisierung ist Defense-in-depth gegen einen künftigen
 * Wechsel der Artikel-Quelle. Für nutzergenerierten Markdown bitte auf
 * DOMPurify/sanitize-html umstellen.
 */
function sanitizeArticleHtml(html: string): string {
  return html
    // gefährliche Element-Blöcke komplett entfernen
    .replace(/<\s*(script|style|iframe|object|embed|noscript)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|noscript)\b[^>]*\/?\s*>/gi, "")
    // Inline-Event-Handler (onclick=, onerror=, …) strippen
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "")
    // javascript:/data:-URLs in href/src neutralisieren
    .replace(/(href|src)\s*=\s*("|')\s*(javascript|data):[^"']*\2/gi, '$1=$2#$2');
}

export type ArticleAudience =
  | "verein-admin"
  | "trainer"
  | "sponsor"
  | "vereinslizenz-admin";

export type ArticlePriority = "MUSS" | "SOLL" | "Later";

export interface ArticleFrontmatter {
  title: string;
  slug: string;
  category: string;
  category_label: string;
  prio: ArticlePriority;
  audience: ArticleAudience[];
  related_articles: string[];
  last_updated: string;
  status: "draft" | "review" | "published";
  reading_time_min?: number;
}

export interface Article {
  frontmatter: ArticleFrontmatter;
  /** Roh-Markdown ohne Frontmatter — für Suche und Reading-Time. */
  markdown: string;
  /** HTML aus dem Markdown — direkt in dangerouslySetInnerHTML einsetzbar. */
  html: string;
}

/**
 * Artikel-Querverweise stehen im Markdown als `[Titel](anderer-artikel.md)`
 * (damit sie auch auf GitHub/im Editor funktionieren). Im gerenderten HTML
 * wäre `href="….md"` ein relativer Link, der unter /hilfe/[kategorie]/[slug]
 * ins 404 läuft. Deshalb: auf `/hilfe/<kategorie>/<slug>` umschreiben —
 * und Links auf (noch) nicht existierende Artikel zu reinem Text entschärfen.
 */
function rewriteArticleLinks(
  html: string,
  slugToCategory: Map<string, string>
): string {
  return html.replace(
    /<a href="([a-z0-9-]+)\.md">([\s\S]*?)<\/a>/g,
    (_m, slug: string, label: string) => {
      const category = slugToCategory.get(slug);
      return category ? `<a href="/hilfe/${category}/${slug}">${label}</a>` : label;
    }
  );
}

let cache: Map<string, Article> | null = null;

async function loadAll(): Promise<Map<string, Article>> {
  if (cache) return cache;
  const files = await fs.readdir(ARTICLES_DIR);

  // Pass 1: parsen + Frontmatter validieren, damit für das Link-Rewrite in
  // Pass 2 alle existierenden Slug→Kategorie-Paare bekannt sind.
  type ValidatedFrontmatter = Partial<ArticleFrontmatter> &
    Pick<ArticleFrontmatter, "title" | "slug" | "category" | "category_label">;
  const entries: { fm: ValidatedFrontmatter; content: string }[] = [];
  for (const file of files) {
    if (!file.endsWith(".md")) continue;
    const fullPath = path.join(ARTICLES_DIR, file);
    const raw = await fs.readFile(fullPath, "utf8");
    const parsed = matter(raw);
    const fm = parsed.data as Partial<ArticleFrontmatter>;

    // Pflichtfelder defensiv prüfen — fehlerhafte Frontmatter sollen den
    // ganzen Help-Center nicht crashen lassen, sondern den Artikel skippen.
    if (!fm.title || !fm.slug || !fm.category || !fm.category_label) {
      console.warn(`[help-center] skipping ${file}: missing required frontmatter`);
      continue;
    }
    if (fm.status === "draft") continue; // nicht veröffentlichen
    entries.push({ fm: fm as ValidatedFrontmatter, content: parsed.content });
  }

  const slugToCategory = new Map(entries.map((e) => [e.fm.slug, e.fm.category]));

  // Pass 2: rendern + Links umschreiben.
  const map = new Map<string, Article>();
  for (const { fm, content } of entries) {
    const html = rewriteArticleLinks(
      sanitizeArticleHtml(marked.parse(content, { async: false }) as string),
      slugToCategory
    );
    map.set(fm.slug, {
      frontmatter: {
        title: fm.title,
        slug: fm.slug,
        category: fm.category,
        category_label: fm.category_label,
        prio: (fm.prio ?? "MUSS") as ArticlePriority,
        audience: (fm.audience ?? []) as ArticleAudience[],
        related_articles: fm.related_articles ?? [],
        last_updated: fm.last_updated ?? "",
        status: (fm.status ?? "published") as ArticleFrontmatter["status"],
        reading_time_min: fm.reading_time_min
      },
      markdown: content,
      html
    });
  }
  cache = map;
  return map;
}

export async function getAllArticles(): Promise<Article[]> {
  const map = await loadAll();
  return Array.from(map.values()).sort((a, b) =>
    a.frontmatter.title.localeCompare(b.frontmatter.title, "de")
  );
}

export async function getArticle(slug: string): Promise<Article | null> {
  const map = await loadAll();
  return map.get(slug) ?? null;
}

export interface CategoryInfo {
  slug: string;
  label: string;
  count: number;
}

export async function getCategories(): Promise<CategoryInfo[]> {
  const all = await getAllArticles();
  const byCat = new Map<string, CategoryInfo>();
  for (const a of all) {
    const existing = byCat.get(a.frontmatter.category);
    if (existing) {
      existing.count += 1;
    } else {
      byCat.set(a.frontmatter.category, {
        slug: a.frontmatter.category,
        label: a.frontmatter.category_label,
        count: 1
      });
    }
  }
  // Stabile Reihenfolge: nach Label
  return Array.from(byCat.values()).sort((a, b) =>
    a.label.localeCompare(b.label, "de")
  );
}

/**
 * Berechnet eine grobe Lesezeit in Minuten (200 Wörter/Minute).
 */
export function readingTimeMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}
