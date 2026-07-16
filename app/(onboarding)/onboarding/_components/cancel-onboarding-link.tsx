"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { discardDraftClub } from "../_actions/discard-draft";

/**
 * „Abbrechen"-Ausgang aus dem Onboarding-Wizard — auf JEDEM Step sichtbar,
 * damit niemand im Wizard gefangen ist (vorher gab es keinen Weg raus).
 *
 * Ziel ist immer /select-role: mit bestehenden Rollen der Rollen-Hub, ohne
 * Rollen bounced /select-role selbst weiter zum Rollen-Chooser (/signup).
 *
 * Ohne Draft (Step 1, noch nichts angelegt): einfacher Link, nichts geht
 * verloren. Mit Draft: Bestätigung (UI-Standard: destruktiv ⇒ Confirm) und
 * discardDraftClub — sonst würde jeder Dispatcher (/dashboard, /signup) den
 * offenen Draft wieder in den Wizard resumen und der Abbruch wäre wirkungslos.
 */
const LINK_CLS =
  "press inline-flex items-center rounded-full px-1.5 py-1 text-[15px] font-medium text-brand-night-navy/60 transition-colors hover:text-brand-night-navy";

export function CancelOnboardingLink({ clubId }: { clubId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();

  if (!clubId) {
    return (
      <Link href="/select-role" className={LINK_CLS}>
        Abbrechen
      </Link>
    );
  }

  async function handleCancel() {
    const ok = await confirm({
      title: "Onboarding abbrechen?",
      description:
        "Deine bisherige Auswahl und eingegebene Daten werden verworfen. Du kannst jederzeit neu starten.",
      confirmLabel: "Verwerfen & abbrechen",
      cancelLabel: "Weitermachen",
      danger: true
    });
    if (!ok) return;
    startTransition(async () => {
      try {
        await discardDraftClub(clubId!);
        router.push("/select-role");
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Abbrechen fehlgeschlagen.";
        toast.error(msg);
      }
    });
  }

  return (
    <>
      {confirmDialog}
      <button type="button" onClick={handleCancel} disabled={pending} className={LINK_CLS}>
        {pending ? "Breche ab…" : "Abbrechen"}
      </button>
    </>
  );
}
