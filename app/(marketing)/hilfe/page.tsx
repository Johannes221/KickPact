import Link from "next/link";
import { getAllArticles, getCategories } from "@/lib/help-center/articles";
import { HilfeSearch } from "./_components/search";

export const metadata = {
  title: "Hilfe-Center — KickPact",
  description:
    "Antworten auf die häufigsten Fragen: Tarife, Pledges, Trigger, Abrechnung, " +
    "Crawler. Self-Service-Doku für Vereine und Sponsoren."
};

export default async function HilfePage() {
  const [articles, categories] = await Promise.all([
    getAllArticles(),
    getCategories()
  ]);

  // Index für Client-Search: nur die Felder, die wir browser-seitig brauchen
  const searchIndex = articles.map((a) => ({
    slug: a.frontmatter.slug,
    title: a.frontmatter.title,
    category: a.frontmatter.category,
    category_label: a.frontmatter.category_label,
    // Erste 200 Zeichen des Markdown als Snippet für Suche-Match
    snippet: a.markdown.replace(/[#*`>_\[\]]/g, "").slice(0, 220).trim()
  }));

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-10 md:py-16">
      <div className="text-center mb-10 md:mb-14">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.15em] text-accent-dark">
          Hilfe-Center
        </span>
        <h1 className="mt-4 md:mt-6 font-display font-black text-3xl md:text-5xl tracking-tight text-brand-night-navy">
          Wir haben die Antwort.
        </h1>
        <p className="mt-3 max-w-2xl mx-auto text-sm md:text-base text-brand-night-navy/60">
          Self-Service-Doku für Vereine und Sponsoren. Tarife, Pledges, Trigger,
          Abrechnung — alles, was du wissen musst, in {articles.length} Artikeln.
        </p>
      </div>

      <HilfeSearch articles={searchIndex} />

      <div className="mt-12 grid gap-6 md:gap-8 md:grid-cols-2">
        {categories.map((cat) => {
          const inCat = articles.filter(
            (a) => a.frontmatter.category === cat.slug
          );
          return (
            <section
              key={cat.slug}
              className="rounded-lg border border-brand-neutral/40 bg-white p-5 md:p-6"
            >
              <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
                {cat.label}
              </h2>
              <p className="mt-1 text-xs text-brand-night-navy/55">
                {cat.count} {cat.count === 1 ? "Artikel" : "Artikel"}
              </p>
              <ul className="mt-4 space-y-2">
                {inCat.map((a) => (
                  <li key={a.frontmatter.slug}>
                    <Link
                      href={`/hilfe/${a.frontmatter.category}/${a.frontmatter.slug}`}
                      className="group flex items-start gap-2 text-sm text-brand-night-navy hover:text-accent transition-colors"
                    >
                      <span className="text-accent shrink-0">→</span>
                      <span className="group-hover:underline">{a.frontmatter.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="mt-12 md:mt-16 text-center text-sm text-brand-night-navy/60">
        Antwort nicht dabei? Schreib uns:{" "}
        <a href="mailto:support@kickpact.de" className="font-semibold text-accent hover:underline">
          support@kickpact.de
        </a>
      </div>
    </main>
  );
}
