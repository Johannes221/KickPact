import Link from "next/link";
import {
  listSponsorLeadsForAdmin,
  type SponsorLeadStatus
} from "@/lib/db/queries/sponsor-leads-admin";
import { LEADS_RETENTION_DAYS } from "@/lib/db/queries/system-retention";
import { LeadHandledButton } from "@/components/admin/lead-handled-button";

export const metadata = { title: "Leads · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const FILTERS: Array<{ value: SponsorLeadStatus | "all"; label: string }> = [
  { value: "open", label: "Offen" },
  { value: "handled", label: "Erledigt" },
  { value: "all", label: "Alle" }
];

function fmt(d: Date): string {
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

function qs(p: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminLeadsPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  // Default ist „Offen" — das ist die Arbeitsliste.
  const statusFilter = (FILTERS.find((f) => f.value === params.status)?.value ??
    "open") as SponsorLeadStatus | "all";
  const search = params.q?.trim() || undefined;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { leads, total } = await listSponsorLeadsForAdmin({
    status: statusFilter === "all" ? undefined : statusFilter,
    search,
    limit: PAGE_SIZE,
    offset
  });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-5 text-sm text-brand-night-navy/70">
        <p className="font-semibold text-brand-night-navy">
          Sponsoring-Anfragen von öffentlichen Profilseiten
        </p>
        <p className="mt-1">
          Anfragen, die nicht eingeloggte Besucher über <code>/m/&#123;slug&#125;</code>{" "}
          gestellt haben. Der Verein wird bei Eingang per Mail informiert — diese
          Liste ist deine Kontrolle, dass nichts liegen bleibt. Antworten läuft
          per Mail an die hinterlegte Adresse; <strong>Erledigt</strong> hakt den
          Lead nur ab und ist jederzeit umkehrbar.
        </p>
        <p className="mt-2 text-xs text-brand-night-navy/55">
          Datenschutz: Name und E-Mail sind personenbezogene Daten Dritter. Leads
          werden nach {LEADS_RETENTION_DAYS} Tagen automatisch gelöscht — ältere
          Anfragen erscheinen hier nicht mehr.
        </p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Leads ({total})
        </h3>
        <form method="GET" className="flex gap-2">
          {statusFilter !== "open" && (
            <input type="hidden" name="status" value={statusFilter} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Name, E-Mail, Verein…"
            aria-label="Leads durchsuchen"
            className="rounded-lg border border-brand-neutral/40 px-3 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-night-navy px-3 py-1.5 text-sm font-semibold text-white"
          >
            Suchen
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = f.value === statusFilter;
          const href = `/admin/leads${qs({
            status: f.value === "open" ? undefined : f.value,
            q: search
          })}`;
          return (
            <Link
              key={f.value}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brand-night-navy text-white"
                  : "border border-brand-neutral/40 bg-brand-off-white text-brand-night-navy/70 hover:bg-white"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-neutral/30 text-left text-xs uppercase tracking-widest text-brand-night-navy/50">
              <th className="px-4 py-3 font-semibold">Datum</th>
              <th className="px-4 py-3 font-semibold">Interessent</th>
              <th className="px-4 py-3 font-semibold">Verein / Team</th>
              <th className="px-4 py-3 font-semibold">Nachricht</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brand-night-navy/50">
                  {statusFilter === "open"
                    ? "Keine offenen Anfragen."
                    : "Keine Anfragen."}
                </td>
              </tr>
            )}
            {leads.map((l) => (
              <tr key={l.id} className="border-b border-brand-neutral/20 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-brand-night-navy/70">
                  {fmt(l.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-brand-night-navy">{l.name}</span>
                  <br />
                  <a
                    href={`mailto:${l.email}?subject=${encodeURIComponent(
                      `Deine Sponsoring-Anfrage bei ${l.clubName}`
                    )}`}
                    className="text-xs text-brand-night-navy/60 hover:underline"
                  >
                    {l.email}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/admin/vereine/${l.clubSlug}`} className="hover:underline">
                    {l.clubName}
                  </Link>
                  <span className="text-brand-night-navy/60"> · {l.teamName}</span>
                </td>
                <td className="max-w-xs px-4 py-3 text-xs text-brand-night-navy/70">
                  {l.message ? (
                    <span title={l.message}>
                      {l.message.length > 120 ? `${l.message.slice(0, 120)}…` : l.message}
                    </span>
                  ) : (
                    <span className="text-brand-night-navy/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {l.handledAt ? (
                    <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                      Erledigt {fmt(l.handledAt)}
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      Offen
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <LeadHandledButton leadId={l.id} handled={l.handledAt !== null} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-brand-night-navy/50">
          Seite {page} von {totalPages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={`/admin/leads${qs({
                status: statusFilter === "open" ? undefined : statusFilter,
                q: search,
                page: String(page - 1)
              })}`}
              className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
            >
              Zurück
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/leads${qs({
                status: statusFilter === "open" ? undefined : statusFilter,
                q: search,
                page: String(page + 1)
              })}`}
              className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
            >
              Weiter
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
