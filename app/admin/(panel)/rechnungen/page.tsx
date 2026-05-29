import { InvoiceTriggerButton } from "./_components/invoice-trigger-button";

export const metadata = { title: "Rechnungen · Admin · KickPact" };

export default function AdminRechnungenPage() {
  return (
    <div className="space-y-8">
      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Manuelle Rechnungsgenerierung
        </h3>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white p-6 space-y-4">
          <p className="text-sm text-brand-night-navy/70">
            Triggert das{" "}
            <code className="font-mono text-xs bg-brand-neutral/30 px-1 py-0.5 rounded">
              invoices/manual-run
            </code>{" "}
            Inngest-Event. Ohne Zeitraum wird der letzte Monat abgerechnet. Das
            System ist idempotent — bereits existierende Rechnungen für denselben
            Zeitraum werden nicht doppelt erstellt.
          </p>
          <InvoiceTriggerButton />
        </div>
      </section>
    </div>
  );
}
