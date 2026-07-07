import Link from "next/link";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { countOpenTickets } from "@/lib/db/queries/support";
import { countChargesPendingCorrection } from "@/lib/db/queries/charges";
import { OperatorLogoutButton } from "@/components/admin/operator-logout-button";

export const metadata = { title: "Admin · KickPact" };

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: "/admin/dashboard", label: "Dashboard" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/conflicts", label: "Konflikte" },
  { href: "/admin/vereine", label: "Vereine" },
  { href: "/admin/users", label: "User" },
  { href: "/admin/crawler", label: "Crawler" },
  { href: "/admin/sponsoring", label: "Sponsoring" },
  { href: "/admin/rechnungen", label: "Rechnungen" },
  { href: "/admin/rechnungen/korrekturen", label: "Korrekturen" },
  { href: "/admin/stripe", label: "Stripe" },
  { href: "/admin/mail", label: "Mail" },
  { href: "/admin/audit-log", label: "Audit-Log" }
];

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const { user } = await assertPlatformAdmin();
  const [openTickets, openCorrections] = await Promise.all([
    countOpenTickets(),
    countChargesPendingCorrection()
  ]);

  return (
    <main className="mx-auto max-w-7xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            KickPact Operator
          </p>
          <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
            Admin
          </h1>
        </div>
        <div className="flex items-center gap-2 text-sm text-brand-night-navy/60">
          <span className="hidden sm:inline">{user.email}</span>
          <OperatorLogoutButton />
        </div>
      </div>
      <nav className="mb-8 -mx-1 flex flex-wrap gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5">
        {NAV_ITEMS.map((item) => {
          const badge =
            item.href === "/admin/support" && openTickets > 0
              ? openTickets
              : item.href === "/admin/rechnungen/korrekturen" && openCorrections > 0
                ? openCorrections
                : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
            >
              {item.label}
              {badge > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-alert-red px-1.5 text-[0.65rem] font-bold text-white">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {children}
    </main>
  );
}
