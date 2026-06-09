import Link from "next/link";
import { Clock, ArrowRight } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listPledgesForSponsor } from "@/lib/db/queries/pledges";
import { listInquiriesForSponsor } from "@/lib/db/queries/sponsor-discover";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Meine Pacts · KickPact" };

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function PledgeListPage() {
  const user = await requireUser();

  const sponsor = await findSponsorForUser(user.id);
  const myPledges = sponsor ? await listPledgesForSponsor(sponsor.id) : [];

  // Sponsoring-Anfragen einordnen:
  //  - accepted + noch kein aktiver Pact → "Pact anlegen für …" (direkter Vorschlag)
  //  - pending → "Angefragt, wartet auf Zusage"
  // Der „Mannschaft finden"-CTA kommt nur, wenn es WEDER einen Pact NOCH eine
  // angenommene/offene Anfrage gibt.
  const inquiries = await listInquiriesForSponsor(user.id);
  const acceptedInquiries = inquiries.filter(
    (i) => i.status === "accepted" && !i.hasActivePledge
  );
  const pendingInquiries = inquiries.filter((i) => i.status === "pending");
  const isEmpty =
    myPledges.length === 0 &&
    acceptedInquiries.length === 0 &&
    pendingInquiries.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        className="md:hidden"
        title="Meine Pacts"
        subtitle="Hier siehst du alle deine aktiven und vergangenen Pacts."
      />
      <div className="hidden md:block">
        <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-brand-night-navy">
          Meine <span className="text-accent">Pacts</span>
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
          Hier siehst du alle deine aktiven und vergangenen Pacts.
        </p>
      </div>

      <div className="mt-6 md:mt-10 space-y-3">
        {isEmpty ? (
          <Card className="border-brand-neutral/40">
            <CardContent className="p-8 text-center">
              <p className="font-semibold text-brand-night-navy text-base">Noch keine Pacts.</p>
              <p className="mt-1.5 text-sm text-brand-night-navy/60 max-w-md mx-auto">
                Finde eine Mannschaft, die du unterstützen möchtest, und frag sie für ein
                Sponsoring an. Sobald der Verein zustimmt, richtest du hier deinen Pact ein.
              </p>
              <Link
                href="/sponsor/discover"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
              >
                Mannschaft finden &amp; anfragen →
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {acceptedInquiries.map((q) =>
              q.inviteToken ? (
                <Link
                  key={q.id}
                  href={`/sponsor/pledge/new?invitation=${q.inviteToken}`}
                  className="block rounded-xl border border-accent/40 bg-accent/5 p-4 transition-colors hover:bg-accent/10"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-brand-night-navy">{q.teamName}</div>
                      <div className="text-xs text-brand-night-navy/50 mt-0.5">{q.clubName}</div>
                    </div>
                    <Badge tone="success" className="shrink-0 whitespace-nowrap">
                      Angenommen ✓
                    </Badge>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                    Jetzt Pact für {q.teamName} anlegen
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </div>
                </Link>
              ) : (
                <div
                  key={q.id}
                  className="rounded-xl bg-white shadow-ios-card p-4 border border-dashed border-emerald-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-brand-night-navy">{q.teamName}</div>
                      <div className="text-xs text-brand-night-navy/50 mt-0.5">{q.clubName}</div>
                    </div>
                    <Badge tone="success" className="shrink-0 whitespace-nowrap">
                      Angenommen ✓
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-brand-night-navy/60">
                    Der Verein hat zugesagt, aber die Einladung ist abgelaufen. Frag deinen
                    Ansprechpartner nach einem neuen Link, dann kannst du den Pact einrichten.
                  </p>
                </div>
              )
            )}

            {myPledges.map((p) => (
              <Link
                key={p.id}
                href={`/sponsor/pledge/${p.id}`}
                className="block rounded-xl bg-white shadow-ios-card p-4 hover:border-accent/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-brand-night-navy">{p.teamName}</div>
                    <div className="text-xs text-brand-night-navy/50 mt-0.5">{p.clubName}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
                <div className="mt-3 flex gap-4 text-xs text-brand-night-navy/60">
                  <span>
                    {p.startsAt.toLocaleDateString("de-DE")} –{" "}
                    {p.endsAt.toLocaleDateString("de-DE")}
                  </span>
                  {p.monthlyCapCents && (
                    <span>Cap: {eur(p.monthlyCapCents)} / Monat</span>
                  )}
                </div>
              </Link>
            ))}

            {pendingInquiries.map((q) => (
              <div
                key={q.id}
                className="rounded-xl bg-white shadow-ios-card p-4 border border-dashed border-amber-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-brand-night-navy">{q.teamName}</div>
                    <div className="text-xs text-brand-night-navy/50 mt-0.5">{q.clubName}</div>
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    <Clock className="h-3 w-3" aria-hidden /> Angefragt
                  </span>
                </div>
                <p className="mt-2 text-xs text-brand-night-navy/60">
                  Anfrage gesendet am {q.createdAt.toLocaleDateString("de-DE")} — wartet auf Zusage
                  des Vereins. Sobald zugesagt, kannst du hier deinen Pact einrichten.
                </p>
              </div>
            ))}
          </>
        )}
      </div>

      {!isEmpty && (
        <div className="mt-8 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
          <strong className="text-brand-night-navy">Weiteren Pact einrichten?</strong>
          <p className="mt-1">
            Frag eine weitere Mannschaft über{" "}
            <Link href="/sponsor/discover" className="font-semibold text-accent hover:underline">
              Entdecken
            </Link>{" "}
            an — sobald der Verein zustimmt, kannst du den Pact einrichten.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
    active: { label: "Aktiv", tone: "success" },
    paused: { label: "Pausiert", tone: "warning" },
    ended: { label: "Beendet", tone: "neutral" },
  };
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
