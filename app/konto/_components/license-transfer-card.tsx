"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { respondLicenseTransfer } from "@/lib/actions/license-transfers";

type Decision = "accept_license" | "accept_co_owned" | "reject";

export interface LicenseTransferRequestView {
  id: string;
  teamName: string;
  toClubName: string;
  requestedByName: string | null;
}

const DECISION_COPY: Record<
  Decision,
  { title: string; description: string; confirmLabel: string }
> = {
  accept_license: {
    title: "Vereinslizenz annehmen?",
    description:
      "Dein Abo läuft bis zum Periodenende weiter und endet dann automatisch; ab dann deckt die Vereinslizenz deine Mannschaft ab. Das Rechnungs-Branding (Absender, IBAN) wechselt sofort auf den Verein.",
    confirmLabel: "Annehmen"
  },
  accept_co_owned: {
    title: "Co-Verwaltung einrichten?",
    description:
      "Deine Lizenz und dein Abo bleiben unverändert bei dir. Der anfragende Vorstand bekommt Mitverwalter-Zugriff auf die Mannschaft.",
    confirmLabel: "Co-Verwaltung einrichten"
  },
  reject: {
    title: "Anfrage ablehnen?",
    description:
      "Alles bleibt wie es ist — deine Mannschaft läuft eigenständig weiter. Der Vorstand wird über die Ablehnung informiert.",
    confirmLabel: "Ablehnen"
  }
};

/**
 * Paket B (Spec §1.5): Entscheidungs-Karte in „Mein Konto" für offene
 * Lizenz-Transfer-Anfragen. Drei Optionen mit Bestätigungs-Dialog;
 * die Timing-Erklärung steht direkt auf der Karte.
 */
export function LicenseTransferCard({
  requests
}: {
  requests: LicenseTransferRequestView[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<{
    request: LicenseTransferRequestView;
    decision: Decision;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    if (!confirm) return;
    startTransition(async () => {
      const res = await respondLicenseTransfer({
        requestId: confirm.request.id,
        decision: confirm.decision
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Entscheidung gespeichert.");
      setConfirm(null);
      router.refresh();
    });
  }

  return (
    <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
      <div>
        <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
          Anfrage zur Vereinslizenz
        </h2>
        <p className="mt-0.5 text-xs text-brand-night-navy/60">
          Ein Verein möchte deine Mannschaft unter seine Vereinslizenz nehmen.
        </p>
      </div>

      <ul className="space-y-4">
        {requests.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-brand-neutral/40 p-4 space-y-3"
          >
            <p className="text-sm text-brand-night-navy">
              <strong>{r.toClubName}</strong> möchte deine Mannschaft{" "}
              <strong>„{r.teamName}"</strong> unter die Vereinslizenz nehmen
              {r.requestedByName ? ` (angefragt von ${r.requestedByName})` : ""}.
            </p>
            <p className="text-xs text-brand-night-navy/60">
              Bei Annahme: Dein Abo läuft bis zum Periodenende weiter und endet
              dann automatisch; das Rechnungs-Branding wechselt sofort auf den
              Verein. Bei Co-Verwaltung behältst du Lizenz und Abo — der
              Vorstand wird Mitverwalter.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => setConfirm({ request: r, decision: "accept_license" })}
              >
                Annehmen
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm({ request: r, decision: "accept_co_owned" })}
              >
                Co-Verwaltung
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-brand-alert-red hover:text-brand-alert-red"
                onClick={() => setConfirm({ request: r, decision: "reject" })}
              >
                Ablehnen
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>{DECISION_COPY[confirm.decision].title}</DialogTitle>
                <DialogDescription>
                  {DECISION_COPY[confirm.decision].description}
                </DialogDescription>
              </DialogHeader>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => setConfirm(null)}
                  disabled={pending}
                >
                  Abbrechen
                </Button>
                <Button onClick={onConfirm} disabled={pending}>
                  {pending
                    ? "Wird gespeichert…"
                    : DECISION_COPY[confirm.decision].confirmLabel}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
