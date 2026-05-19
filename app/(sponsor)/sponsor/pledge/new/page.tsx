import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { PledgeBuilder } from "./_components/pledge-builder";

export const metadata = { title: "Pledge anlegen · KickPact" };

export default async function NewPledgePage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
        Pledge <span className="text-accent">aufbauen</span>
      </h1>
      <p className="mt-2 text-brand-night-navy/60 max-w-2xl">
        Wähle Trigger, leg Beträge fest. Wir zeigen dir live, worauf du dich maximal einlässt.
      </p>
      <div className="mt-10">
        <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
          <PledgeBuilder />
        </Suspense>
      </div>
    </main>
  );
}
