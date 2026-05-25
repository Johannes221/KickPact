import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAllArticles,
  getArticle,
  readingTimeMinutes
} from "@/lib/help-center/articles";

// SSG: alle Artikel zur Build-Zeit pre-generieren
export async function generateStaticParams() {
  const articles = await getAllArticles();
  return articles.map((a) => ({
    kategorie: a.frontmatter.category,
    slug: a.frontmatter.slug
  }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ kategorie: string; slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticle(slug);
  if (!article) return { title: "Artikel nicht gefunden — KickPact" };
  return {
    title: `${article.frontmatter.title} — KickPact Hilfe`,
    description: article.markdown
      .replace(/[#*`>_\[\]]/g, "")
      .slice(0, 160)
      .trim()
  };
}

export default async function HilfeArticlePage({
  params
}: {
  params: Promise<{ kategorie: string; slug: string }>;
}) {
  const { kategorie, slug } = await params;
  const article = await getArticle(slug);
  if (!article || article.frontmatter.category !== kategorie) {
    notFound();
  }

  const allArticles = await getAllArticles();
  const related = article.frontmatter.related_articles
    .map((relSlug) => allArticles.find((a) => a.frontmatter.slug === relSlug))
    .filter((a): a is NonNullable<typeof a> => a !== undefined);

  const readingTime =
    article.frontmatter.reading_time_min ?? readingTimeMinutes(article.markdown);

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-10 md:py-16">
      <nav className="mb-6 text-sm">
        <Link
          href="/hilfe"
          className="text-brand-night-navy/60 hover:text-accent transition-colors"
        >
          Hilfe-Center
        </Link>
        <span className="mx-2 text-brand-night-navy/30">/</span>
        <Link
          href={`/hilfe#${article.frontmatter.category}`}
          className="text-brand-night-navy/60 hover:text-accent transition-colors"
        >
          {article.frontmatter.category_label}
        </Link>
      </nav>

      <article>
        <header className="mb-8 md:mb-10">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.15em] text-accent-dark">
            {article.frontmatter.category_label}
          </span>
          <h1 className="mt-3 md:mt-4 font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
            {article.frontmatter.title}
          </h1>
          <p className="mt-2 text-xs text-brand-night-navy/55">
            {readingTime} {readingTime === 1 ? "Minute" : "Minuten"} Lesezeit
            {article.frontmatter.last_updated
              ? ` · Stand ${article.frontmatter.last_updated}`
              : null}
          </p>
        </header>

        <div
          className="article-prose text-brand-night-navy/90 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: article.html }}
        />

        {related.length > 0 && (
          <section className="mt-12 md:mt-16 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5 md:p-6">
            <h2 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
              Weiter lesen
            </h2>
            <ul className="mt-3 space-y-1.5">
              {related.map((r) => (
                <li key={r.frontmatter.slug}>
                  <Link
                    href={`/hilfe/${r.frontmatter.category}/${r.frontmatter.slug}`}
                    className="text-sm text-brand-night-navy hover:text-accent transition-colors"
                  >
                    → {r.frontmatter.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>

      <div className="mt-12 md:mt-16 text-center text-sm text-brand-night-navy/55">
        Antwort fehlt?{" "}
        <a
          href="mailto:support@kickpact.de"
          className="font-semibold text-accent hover:underline"
        >
          support@kickpact.de
        </a>
      </div>
    </main>
  );
}
