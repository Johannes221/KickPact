import Link from "next/link";
import { listOperatorAuditLog } from "@/lib/db/queries/operator-audit";

export const metadata = { title: "Audit-Log · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

function fmt(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function AuditLogPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { entries, total } = await listOperatorAuditLog({ limit: PAGE_SIZE, offset });
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Audit-Log
        </h3>
        <p className="text-sm text-brand-night-navy/60">
          Append-only Protokoll aller Operator-Aktionen · {total} Einträge
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-brand-neutral/30 text-left text-xs uppercase tracking-widest text-brand-night-navy/50">
              <th className="px-4 py-3 font-semibold">Zeitpunkt</th>
              <th className="px-4 py-3 font-semibold">Operator</th>
              <th className="px-4 py-3 font-semibold">Aktion</th>
              <th className="px-4 py-3 font-semibold">Ziel</th>
              <th className="px-4 py-3 font-semibold">Beschreibung</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-brand-night-navy/50">
                  Noch keine Einträge.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-brand-neutral/20 last:border-0 align-top">
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-brand-night-navy/70">
                  {fmt(e.createdAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/70">
                  {e.operatorEmail ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="rounded-lg bg-brand-off-white px-2 py-1 font-mono text-xs text-brand-night-navy">
                    {e.action}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-brand-night-navy/60">
                  {e.targetType ? (
                    <span>
                      {e.targetType}
                      {e.targetId ? <span className="text-brand-night-navy/40"> · {e.targetId}</span> : null}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 text-brand-night-navy">{e.summary}</td>
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
              href={`/admin/audit-log?page=${page - 1}`}
              className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
            >
              Zurück
            </Link>
          )}
          {page < totalPages && (
            <Link
              href={`/admin/audit-log?page=${page + 1}`}
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
