import Link from "next/link";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import {
  listSupportTickets,
  ticketReference,
  type SupportStatus,
  type ListSupportTicketsOpts
} from "@/lib/db/queries/support";
import {
  StatusBadge,
  PriorityBadge,
  CategoryBadge,
  ContextBadge
} from "@/components/support/ticket-badges";

export const metadata = { title: "Support · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const OVERDUE_HOURS = 24;

type View = "open" | "mine" | "unassigned" | "overdue" | "all";

const VIEWS: Array<{ value: View; label: string }> = [
  { value: "open", label: "Offen" },
  { value: "mine", label: "Mir zugewiesen" },
  { value: "unassigned", label: "Nicht zugewiesen" },
  { value: "overdue", label: "Überfällig" },
  { value: "all", label: "Alle" }
];

function fmt(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function ageHours(d: Date): number {
  return Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);
}

export default async function SupportInboxPage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; page?: string; q?: string }>;
}) {
  const { user: admin } = await assertPlatformAdmin();
  const params = await searchParams;
  const view = (VIEWS.find((v) => v.value === params.view)?.value ?? "open") as View;
  const search = params.q?.trim() || undefined;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const opts: ListSupportTicketsOpts = { limit: PAGE_SIZE, offset, search };
  if (view === "open") opts.status = "open";
  else if (view === "mine") opts.assignedTo = admin.id;
  else if (view === "unassigned") opts.unassigned = true;
  else if (view === "overdue") {
    opts.overdue = true;
    opts.overdueHours = OVERDUE_HOURS;
  }

  const { tickets, total, openCount } = await listSupportTickets(opts);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const qs = (extra: Record<string, string | number>) => {
    const sp = new URLSearchParams();
    if (view !== "open") sp.set("view", view);
    if (search) sp.set("q", search);
    for (const [k, v] of Object.entries(extra)) sp.set(k, String(v));
    const s = sp.toString();
    return s ? `/admin/support?${s}` : "/admin/support";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Support-Inbox
          </h3>
          <p className="text-sm text-brand-night-navy/60">
            {openCount} offen · {total} in dieser Ansicht
          </p>
        </div>
        <form action="/admin/support" method="get" className="flex items-center gap-2">
          {view !== "open" && <input type="hidden" name="view" value={view} />}
          <input
            type="search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Suchen (Betreff, Name, E-Mail)…"
            className="h-9 w-56 rounded-md border border-brand-neutral/40 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <button
            type="submit"
            className="h-9 rounded-md border border-brand-neutral/40 bg-brand-off-white px-3 text-sm font-semibold text-brand-night-navy/70 hover:bg-white"
          >
            Suchen
          </button>
        </form>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => {
          const active = v.value === view;
          const href = v.value === "open" ? "/admin/support" : `/admin/support?view=${v.value}`;
          return (
            <Link
              key={v.value}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                active
                  ? "bg-brand-night-navy text-white"
                  : "bg-brand-off-white text-brand-night-navy/70 hover:bg-white border border-brand-neutral/40"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-brand-neutral/30 text-left text-xs uppercase tracking-widest text-brand-night-navy/50">
              <th className="px-4 py-3 font-semibold">Eingang</th>
              <th className="px-4 py-3 font-semibold">Prio</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Betreff</th>
              <th className="px-4 py-3 font-semibold">Absender</th>
              <th className="px-4 py-3 font-semibold">Zugewiesen</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-brand-night-navy/50">
                  Keine Tickets in dieser Ansicht.
                </td>
              </tr>
            )}
            {tickets.map((t) => {
              const overdue =
                (t.status === "open" || t.status === "in_progress") &&
                t.lastReplyBy !== "operator" &&
                ageHours(t.createdAt) >= OVERDUE_HOURS;
              return (
                <tr
                  key={t.id}
                  className="border-b border-brand-neutral/20 last:border-0 hover:bg-brand-off-white/50"
                >
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-brand-night-navy/70">
                    <Link href={`/admin/support/${t.id}`} className="block">
                      {fmt(t.createdAt)}
                      {overdue && <span className="ml-1 text-rose-600" title="Überfällig">⏰</span>}
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy">
                    <Link href={`/admin/support/${t.id}`} className="font-medium hover:underline">
                      {t.subject}
                    </Link>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="font-mono text-[0.7rem] text-brand-night-navy/60">
                        {ticketReference(t.id)}
                      </span>
                      <CategoryBadge category={t.category} />
                      <ContextBadge contextType={t.contextType} />
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/70">
                    {t.name}
                    <span className="block text-[0.7rem] text-brand-night-navy/60">{t.email}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/60">
                    {t.assigneeEmail ?? <span className="text-brand-night-navy/60">—</span>}
                  </td>
                </tr>
              );
            })}
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
              href={qs({ page: page - 1 })}
              className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
            >
              Zurück
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={qs({ page: page + 1 })}
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
