import { requireUser } from "@/lib/auth/session";
import {
  listPendingForSponsor,
  listPendingDirectChargesForSponsor
} from "@/lib/db/queries/approvals";
import { ApprovalRow } from "./_components/approval-row";
import { DirectChargeRow } from "./_components/direct-charge-row";
import { PageHeader } from "@/components/shared/page-header";

// Hieß früher „Inbox" (eigener Bottom-Tab). Der Tab ist weg — erreichbar bleibt
// die Seite über „Nächste Schritte" auf der Übersicht + E-Mail-Deep-Links,
// daher bleibt die Route /sponsor/inbox stabil, nur das Label heißt jetzt
// „Bestätigungen" (das ist, was die Seite tut).
export const metadata = { title: "Bestätigungen · KickPact" };

export default async function SponsorInboxPage() {
  const user = await requireUser();
  const [pending, directCharges] = await Promise.all([
    listPendingForSponsor(user.id),
    // C2/C3 (Audit 2026-06-11): Charges ohne Spiel-Event (Saison-Ziele,
    // Hattrick/Comeback mit manueller Evidenz) — Bestätigung direkt auf
    // der Charge.
    listPendingDirectChargesForSponsor(user.id)
  ]);
  const total = pending.length + directCharges.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 md:mb-10">
        <PageHeader
          className="md:hidden"
          title="Bestätigungen"
          subtitle={
            total === 0
              ? "Keine ausstehenden Events."
              : `${total} ${total === 1 ? "Anfrage" : "Anfragen"} zur Bestätigung.`
          }
        />
        <div className="hidden md:block">
          <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-brand-night-navy">
            Bestätigungen
          </h1>
          <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
            {total === 0
              ? "Keine ausstehenden Events."
              : `${total} ${total === 1 ? "Anfrage" : "Anfragen"} zur Bestätigung.`}
          </p>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8 text-center">
          <div className="text-3xl md:text-4xl mb-2 md:mb-3">🎉</div>
          <p className="text-sm md:text-base text-brand-night-navy/70">
            Alles erledigt! Vereine melden ein Spezial-Event und du kriegst hier eine Anfrage.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              {pending.map((p) => (
                <ApprovalRow key={p.approvalId} data={p} />
              ))}
            </div>
          )}
          {directCharges.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
                Saison-Ziele & Spiel-Erfolge
              </h2>
              <div className="space-y-3">
                {directCharges.map((c) => (
                  <DirectChargeRow key={c.chargeId} data={c} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
