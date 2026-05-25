import Link from "next/link";
import { assertPlatformAdmin } from "@/lib/auth/admin";

export const metadata = { title: "Admin · KickPact" };

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await assertPlatformAdmin();

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-8">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          KickPact Operator
        </p>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          Admin
        </h1>
      </div>
      <nav className="mb-8 flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 w-fit">
        <Link
          href="/admin/verifications"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
        >
          Verifications
        </Link>
        <Link
          href="/admin/conflicts"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
        >
          Konflikte
        </Link>
      </nav>
      {children}
    </main>
  );
}
