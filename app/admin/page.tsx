import Link from "next/link";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export default async function AdminLanding() {
  // Light counts — keep simple, no aggregation pipeline.
  const [{ pending = 0 } = { pending: 0 }] = await db.execute<{ pending: number }>(
    sql`SELECT count(*)::int AS pending FROM club_verifications WHERE status = 'pending'`
  );
  const [{ conflicts = 0 } = { conflicts: 0 }] = await db.execute<{ conflicts: number }>(
    sql`SELECT count(*)::int AS conflicts FROM club_membership_requests WHERE is_conflict_claim = true AND status = 'pending'`
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        href="/admin/verifications"
        className="rounded-2xl border border-brand-neutral/40 bg-white p-6 hover:border-accent hover:shadow-md transition-all"
      >
        <div className="text-3xl mb-2">📋</div>
        <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          Verifications
        </div>
        <div className="mt-1 font-display font-black text-3xl tracking-tight text-brand-night-navy">
          {pending}
        </div>
        <div className="mt-1 text-xs text-brand-night-navy/60">
          Offene Verein-Verifizierungen
        </div>
      </Link>
      <Link
        href="/admin/conflicts"
        className="rounded-2xl border border-brand-neutral/40 bg-white p-6 hover:border-accent hover:shadow-md transition-all"
      >
        <div className="text-3xl mb-2">⚖️</div>
        <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          Konflikte
        </div>
        <div className="mt-1 font-display font-black text-3xl tracking-tight text-brand-night-navy">
          {conflicts}
        </div>
        <div className="mt-1 text-xs text-brand-night-navy/60">
          Doppelanmeldungs-Konflikte
        </div>
      </Link>
    </div>
  );
}
