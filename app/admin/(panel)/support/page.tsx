import Link from "next/link";
import { listSupportTickets, type SupportStatus } from "@/lib/db/queries/support";

export const metadata = { title: "Support · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting: "Wartet",
  closed: "Geschlossen"
};

const CATEGORY_LABELS: Record<string, string> = {
  frage: "Frage",
  bug: "Bug",
  abrechnung: "Abrechnung",
  sonstiges: "Sonstiges"
};

const STATUS_PILL: Record<SupportStatus, string> = {
  open: "bg-accent/15 text-accent-dark",
  in_progress: "bg-blue-100 text-blue-700",
  waiting: "bg-amber-100 text-amber-700",
  closed: "bg-brand-neutral/30 text-brand-night-navy/60"
};

const FILTERS: Array<{ value: SupportStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Bearbeitung" },
  { value: "waiting", label: "Wartet" },
  { value: "closed", label: "Geschlossen" }
];

function fmt(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function SupportInboxPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = (FILTERS.find((f) => f.value === params.status)?.value ?? "all") as
    | SupportStatus
    | "all";
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { tickets, total, openCount } = await listSupportTickets({
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: PAGE_SIZE,
    offset
  });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Support-Inbox
          </h3>
          <p className="text-sm text-brand-night-navy/60">{openCount} offen · {total} angezeigt</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = f.value === statusFilter;
          const href = f.value === "all" ? "/admin/support" : `/admin/support?status=${f.value}`;
          return (
            <Link
              key={f.value}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brand-night-navy text-white"
                  : "bg-brand-off-white text-brand-night-navy/70 hover:bg-white border border-brand-neutral/40"
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
              <th className="px-4 py-3 font-semibold">Eingang</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Kategorie</th>
              <th className="px-4 py-3 font-semibold">Betreff</th>
              <th className="px-4 py-3 font-semibold">Absender</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brand-night-navy/50">
                  Keine Tickets.
                </td>
              </tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id} className="border-b border-brand-neutral/20 last:border-0 hover:bg-brand-off-white/50">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-brand-night-navy/70">
                  <Link href={`/admin/support/${t.id}`} className="block">
                    {fmt(t.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_PILL[t.status]}`}>
                    {STATUS_LABELS[t.status]}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/60">
                  {CATEGORY_LABELS[t.category] ?? t.category}
                </td>
                <td className="px-4 py-3 text-brand-night-navy">
                  <Link href={`/admin/support/${t.id}`} className="font-medium hover:underline">
                    {t.subject}
                  </Link>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/70">
                  {t.name} <span className="text-brand-night-navy/40">· {t.email}</span>
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
              href={`/admin/support?${statusFilter !== "all" ? `status=${statusFilter}&` : ""}page=${page - 1}`}
              className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
            >
              Zurück
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/support?${statusFilter !== "all" ? `status=${statusFilter}&` : ""}page=${page + 1}`}
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
