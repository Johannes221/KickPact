import Link from "next/link";
import { verifyApprovalToken } from "@/lib/auth/approval-token";
import { ApproveAction } from "./_components/approve-action";

export const metadata = {
  title: "Approval · KickPact",
  robots: { index: false, follow: false }
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * SECURITY (L1): Diese Seite VERIFIZIERT den Token beim Render, führt aber KEINE
 * Mutation aus (vorher wurde beim GET sofort confirm/dispute ausgeführt → Mail-
 * Prefetcher/Link-Scanner konnten ungewollt eine Charge bestätigen/bestreiten).
 * Die eigentliche Aktion läuft erst über den expliziten Button-Klick in
 * <ApproveAction /> (Server-Action via POST).
 */
export default async function ApprovePage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = params["token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  let body: React.ReactNode;
  if (!token) {
    body = (
      <ErrorCard message="Kein Token gefunden. Bitte nutze den Link direkt aus der E-Mail." />
    );
  } else {
    try {
      const { action } = verifyApprovalToken(token);
      body = <ApproveAction token={token} action={action} />;
    } catch (e) {
      body = <ErrorCard message={e instanceof Error ? e.message : "Ungültiger Link."} />;
    }
  }

  return (
    <main className="min-h-screen bg-brand-off-white flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <span className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
            KickPact
          </span>
        </div>
        {body}
      </div>
    </main>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-6 md:p-8">
      <div className="text-4xl mb-3 text-center">⚠️</div>
      <h1 className="font-display font-black text-xl tracking-tight text-center mb-3 text-amber-700">
        Fehler
      </h1>
      <p className="text-sm text-brand-night-navy/70 text-center">{message}</p>
      <div className="mt-6 flex justify-center gap-4 text-xs text-brand-night-navy/50">
        <Link href="/sponsor/inbox" className="hover:text-accent">
          Zur Inbox
        </Link>
        <Link href="/" className="hover:text-accent">
          Startseite
        </Link>
      </div>
    </div>
  );
}
