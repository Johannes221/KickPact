import { describe, expect, it } from "vitest";
import { getAllArticles } from "@/lib/help-center/articles";

/**
 * Smoke-Tests fürs kundensichtbare Help-Center (/hilfe).
 *
 * Hintergrund (Launch-Readiness-Pass 2026-07-06): Artikel-Querverweise stehen
 * im Markdown als `[Titel](anderer-artikel.md)`. Ohne Rewrite landet das als
 * relativer `href="….md"` im DOM und 404t unter /hilfe/[kategorie]/[slug].
 * Der Loader muss die Links auf `/hilfe/<kategorie>/<slug>` umschreiben und
 * Links auf (noch) nicht existierende Artikel zu reinem Text entschärfen.
 */
describe("help-center articles", () => {
  it("liefert Artikel mit vollständigem Frontmatter", async () => {
    const articles = await getAllArticles();
    expect(articles.length).toBeGreaterThanOrEqual(20);
    for (const a of articles) {
      expect(a.frontmatter.title, a.frontmatter.slug).toBeTruthy();
      expect(a.frontmatter.slug).toMatch(/^[a-z0-9-]+$/);
      expect(a.frontmatter.category).toMatch(/^[a-z0-9-]+$/);
      expect(a.frontmatter.category_label).toBeTruthy();
    }
  });

  it("rendert keine rohen .md-Links ins HTML", async () => {
    const articles = await getAllArticles();
    for (const a of articles) {
      const rawMdLinks = a.html.match(/href="[^"]*\.md"/g) ?? [];
      expect(rawMdLinks, `${a.frontmatter.slug}: ${rawMdLinks.join(", ")}`).toEqual([]);
    }
  });

  it("verlinkt intern nur auf existierende Artikel", async () => {
    const articles = await getAllArticles();
    const bySlug = new Map(articles.map((a) => [a.frontmatter.slug, a]));
    for (const a of articles) {
      const hrefs = [...a.html.matchAll(/href="\/hilfe\/([a-z0-9-]+)\/([a-z0-9-]+)"/g)];
      for (const [, category, slug] of hrefs) {
        const target = bySlug.get(slug);
        expect(target, `${a.frontmatter.slug} → ${slug}`).toBeTruthy();
        expect(target?.frontmatter.category, `${a.frontmatter.slug} → ${slug}`).toBe(category);
      }
    }
  });

  it("enthält keine veralteten Begriffe (Pivots 2026-06/07)", async () => {
    const articles = await getAllArticles();
    const forbidden = /saison-wett|embed-widget|werbeleistung|alle 6 stunden|geschäftskunde/i;
    for (const a of articles) {
      const hit = a.markdown.match(forbidden);
      expect(hit, `${a.frontmatter.slug}: "${hit?.[0]}"`).toBeNull();
    }
  });
});
