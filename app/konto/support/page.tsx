import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listTicketsForUser, ticketReference } from "@/lib/db/queries/support";
import { ReportProblemButton } from "@/components/support/report-problem-button";
import { StatusBadge, CategoryBadge, ContextBadge } from "@/components/support/ticket-badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meine Anfragen · KickPact" };

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" });
}

export default async function KontoSupportPage() {
  const user = await requireUser();
  const tickets = await listTicketsForUser(user.id);

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12 space-y-6">
      <header className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
            Hilfe &amp; Support
          </p>
          <h1 className="font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
            Meine Anfragen
          </h1>
          <p className="mt-1 text-sm text-brand-night-navy/60">
            Status und Verlauf all deiner Support-Anfragen.
          </p>
        </div>
        <ReportProblemButton
          label="Neue Anfrage"
          title="Neue Support-Anfrage"
          variant="accent"
          defaults={{ name: user.name ?? undefined, email: user.email }}
          context={{ contextType: "none" }}
        />
      </header>

      {tickets.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center">
          <p className="font-medium text-brand-night-navy">Noch keine Anfragen</p>
          <p className="mt-1 text-sm text-brand-night-navy/60">
            Etwas stimmt nicht oder du hast eine Frage? Meld dich — wir helfen dir.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/konto/support/${t.id}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-brand-neutral/40 bg-white px-4 py-3 transition-colors hover:bg-brand-off-white"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-brand-night-navy">{t.subject}</span>
                    <ContextBadge contextType={t.contextType} />
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-brand-night-navy/50">
                    <span className="font-mono">{ticketReference(t.id)}</span>
                    <span>·</span>
                    <CategoryBadge category={t.category} />
                    <span>·</span>
                    <span>{fmt(t.updatedAt)}</span>
                  </div>
                </div>
                <StatusBadge status={t.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="pt-2 text-center">
        <Link href="/hilfe" className="text-sm font-semibold text-accent underline">
          Zum Hilfe-Center
        </Link>
      </div>
    </main>
  );
}
