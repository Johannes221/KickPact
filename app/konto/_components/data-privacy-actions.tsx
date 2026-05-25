"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { requestDataExport, requestAccountDeletion } from "@/lib/actions/dsgvo";

export interface DataPrivacyActionsProps {
  hasPendingDeletion: boolean;
}

export function DataPrivacyActions({
  hasPendingDeletion
}: DataPrivacyActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"export" | "delete" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function handleExport() {
    setBusy("export");
    startTransition(async () => {
      const res = await requestDataExport();
      setBusy(null);
      if (res.ok) {
        toast.success(
          "Export wird per Mail zugeschickt — checke dein Postfach in 1–2 Minuten."
        );
      } else {
        toast.error(res.error ?? "Export fehlgeschlagen");
      }
    });
  }

  function handleDelete() {
    setBusy("delete");
    startTransition(async () => {
      const res = await requestAccountDeletion();
      setBusy(null);
      setDeleteOpen(false);
      if (res.ok) {
        toast.success(
          "Löschung beantragt. Du hast 14 Tage Zeit, den Vorgang zu stoppen."
        );
        // Damit der Banner sofort sichtbar wird:
        window.location.reload();
      } else {
        toast.error(res.error ?? "Löschung konnte nicht beantragt werden");
      }
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {/* Export */}
      <div className="rounded-xl border border-brand-neutral/30 bg-brand-off-white p-4 space-y-2">
        <div className="text-sm font-semibold text-brand-night-navy">
          Daten-Export
        </div>
        <p className="text-xs text-brand-night-navy/60">
          Erhalte alle zu deinem Account gespeicherten Daten als JSON-Datei per
          E-Mail.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isPending && busy === "export"}
          onClick={handleExport}
        >
          {isPending && busy === "export"
            ? "Versende…"
            : "Datenexport anfordern"}
        </Button>
      </div>

      {/* Delete */}
      <div className="rounded-xl border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 space-y-2">
        <div className="text-sm font-semibold text-brand-alert-red">
          Account löschen
        </div>
        <p className="text-xs text-brand-night-navy/70">
          14-Tage-Cooldown, danach werden Profil-Daten anonymisiert.
          Rechnungs-Belege bleiben gem. § 147 AO 10 Jahre erhalten.
        </p>
        {hasPendingDeletion ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            disabled
          >
            Löschung läuft (siehe oben)
          </Button>
        ) : (
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full border-brand-alert-red/40 text-brand-alert-red hover:bg-brand-alert-red/10"
              >
                Account löschen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>KickPact-Account löschen?</DialogTitle>
                <DialogDescription>
                  Du beantragst die Löschung deines Accounts. In 14 Tagen werden
                  Profil-Daten (Name, E-Mail) anonymisiert und der Login
                  entfernt. Bis dahin kannst du den Vorgang jederzeit
                  abbrechen.
                  <br />
                  <br />
                  Steuerrelevante Rechnungs-Daten bleiben gemäß § 147 AO 10 Jahre
                  erhalten, dort wirst du als „Gelöschter Sponsor" geführt.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={isPending}
                >
                  Abbrechen
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isPending && busy === "delete"}
                >
                  {isPending && busy === "delete"
                    ? "Beantrage…"
                    : "Ja, löschen"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
