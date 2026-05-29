import Link from "next/link";
import {
  listChargesForAdmin,
  listOpenApprovals,
  type ChargeStatus
} from "@/lib/db/queries/sponsoring-admin";
import { ChargeCancelButton } from "@/components/admin/charge-cancel-button";

export const metadata = { title: "Sponsoring · Admin · KickPact" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const STATUS_LABELS: Record<ChargeStatus, string> = {
  pending_approval: "Wartet auf Freigabe",
  confirmed: "Bestätigt",
  invoiced: "Fakturiert",
  cancelled: "Storniert"
};

const STATUS_PILL: Record<ChargeStatus, string> = {
  pending_approval: "bg-amber-100 text-amber-700",
  confirmed: "bg-emerald-100 text-emerald-700",
  invoiced: "bg-blue-100 text-blue-700",
  cancelled: "bg-brand-neutral/30 text-brand-night-navy/60"
};

const FILTERS: Array<{ value: ChargeStatus | "all"; label: string }> = [
  { value: "all", label: "Alle" },
  { value: "pending_approval", label: "Wartet" },
  { value: "confirmed", label: "Bestätigt" },
  { value: "invoiced", label: "Fakturiert" },
  { value: "cancelled", label: "Storniert" }
];

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}
function fmt(d: Date): string {
  return new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function qs(p: Record<string, string | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export default async function AdminSponsoringPage({
  searchParams
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const statusFilter = (FILTERS.find((f) => f.value === params.status)?.value ?? "all") as
    | ChargeStatus
    | "all";
  const search = params.q?.trim() || undefined;
  const page = Math.max(parseInt(params.page ?? "1", 10) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [{ charges, total }, approvals] = await Promise.all([
    listChargesForAdmin({
      status: statusFilter === "all" ? undefined : statusFilter,
      search,
      limit: PAGE_SIZE,
      offset
    }),
    listOpenApprovals()
  ]);
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  const disputed = approvals.filter((a) => a.status === "disputed");

  return (
    <div className="space-y-8">
      {/* ── Strittige Approvals (read-only) ── */}
      <section className="space-y-3">
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
          Event-Approvals · {disputed.length} strittig / {approvals.length} offen
        </h3>
        <p className="text-xs text-brand-night-navy/55">
          Übersicht offener und bestrittener Event-Freigaben. Bei Streit: zugehörige Charge unten
          stornieren (zugunsten Sponsor). Das aktive „Bestätigen" zugunsten des Vereins ist noch
          nicht implementiert.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-neutral/30 text-left text-xs uppercase tracking-widest text-brand-night-navy/50">
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Verein / Team</th>
                <th className="px-4 py-3 font-semibold">Sponsor</th>
                <th className="px-4 py-3 font-semibold">Grund / Frist</th>
              </tr>
            </thead>
            <tbody>
              {approvals.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-brand-night-navy/50">
                    Keine offenen Approvals.
                  </td>
                </tr>
              )}
              {approvals.map((a) => (
                <tr key={a.id} className="border-b border-brand-neutral/20 last:border-0">
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-xs font-semibold ${
                        a.status === "disputed"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {a.status === "disputed" ? "Strittig" : "Wartet"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{a.eventType}</td>
                  <td className="px-4 py-3 text-brand-night-navy/70">
                    {a.clubName} · {a.teamName}
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy/70">{a.sponsorName}</td>
                  <td className="px-4 py-3 text-xs text-brand-night-navy/60">
                    {a.disputeReason ? `„${a.disputeReason}"` : `bis ${fmt(a.expiresAt)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Charges ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Charges ({total})
          </h3>
          <form method="GET" className="flex gap-2">
            {statusFilter !== "all" && <input type="hidden" name="status" value={statusFilter} />}
            <input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Verein, Sponsor, Team…"
              className="rounded-lg border border-brand-neutral/40 px-3 py-1.5 text-sm"
            />
            <button type="submit" className="rounded-lg bg-brand-night-navy px-3 py-1.5 text-sm font-semibold text-white">
              Suchen
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = f.value === statusFilter;
            const href = `/admin/sponsoring${qs({ status: f.value === "all" ? undefined : f.value, q: search })}`;
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
                <th className="px-4 py-3 font-semibold">Datum</th>
                <th className="px-4 py-3 font-semibold">Verein / Team</th>
                <th className="px-4 py-3 font-semibold">Sponsor</th>
                <th className="px-4 py-3 font-semibold">Trigger</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Betrag</th>
                <th className="px-4 py-3 font-semibold">Aktion</th>
              </tr>
            </thead>
            <tbody>
              {charges.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-night-navy/50">
                    Keine Charges.
                  </td>
                </tr>
              )}
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-brand-neutral/20 last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap tabular-nums text-brand-night-navy/70">
                    {fmt(c.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/vereine/${c.clubSlug}`} className="hover:underline">
                      {c.clubName}
                    </Link>
                    <span className="text-brand-night-navy/40"> · {c.teamName}</span>
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy/70">{c.sponsorName}</td>
                  <td className="px-4 py-3 font-mono text-xs">{c.triggerType}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`rounded-md px-2 py-1 text-xs font-semibold ${STATUS_PILL[c.status]}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                    {c.cancelledReason && (
                      <span className="ml-1 text-[0.7rem] text-brand-night-navy/40">{c.cancelledReason}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">{eur(c.amountCents)}</td>
                  <td className="px-4 py-3">
                    {c.status !== "cancelled" && c.status !== "invoiced" ? (
                      <ChargeCancelButton chargeId={c.id} />
                    ) : (
                      <span className="text-brand-night-navy/30 text-xs">—</span>
                    )}
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
                href={`/admin/sponsoring${qs({ status: statusFilter === "all" ? undefined : statusFilter, q: search, page: String(page - 1) })}`}
                className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
              >
                Zurück
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/sponsoring${qs({ status: statusFilter === "all" ? undefined : statusFilter, q: search, page: String(page + 1) })}`}
                className="rounded-xl border border-brand-neutral/40 px-3 py-1.5 font-semibold text-brand-night-navy/70 hover:bg-white"
              >
                Weiter
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
