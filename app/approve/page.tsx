import Link from "next/link";
import { confirmApprovalByToken, disputeApprovalByToken } from "@/lib/actions/approvals";
import { verifyApprovalToken } from "@/lib/auth/approval-token";

export const metadata = {
  title: "Approval · KickPact",
  robots: { index: false, follow: false }
};

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ApprovePage({ searchParams }: Props) {
  const params = await searchParams;
  const rawToken = params["token"];
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  if (!token) {
    return <StatusPage status="error" message="Kein Token gefunden. Bitte nutze den Link direkt aus der E-Mail." />;
  }

  // Verify token first to show a meaningful error before executing
  let action: "confirm" | "dispute";
  try {
    const payload = verifyApprovalToken(token);
    action = payload.action;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ungültiger Link.";
    return <StatusPage status="error" message={msg} />;
  }

  // Execute the action
  const result =
    action === "confirm"
      ? await confirmApprovalByToken(token)
      : await disputeApprovalByToken(token);

  if (!result.ok) {
    return <StatusPage status="error" message={result.error} />;
  }

  if (action === "confirm") {
    return (
      <StatusPage
        status="confirmed"
        message="Charge bestätigt. Der Betrag erscheint auf der nächsten Monatsrechnung."
      />
    );
  }

  return (
    <StatusPage
      status="disputed"
      message="Event bestritten. Die Charge wurde storniert — der Verein wird informiert."
    />
  );
}

// ---------------------------------------------------------------------------
// Simple standalone UI — no full layout needed for this public page
// ---------------------------------------------------------------------------

type StatusKind = "confirmed" | "disputed" | "error";

function StatusPage({ status, message }: { status: StatusKind; message: string }) {
  const icon =
    status === "confirmed" ? "✅" : status === "disputed" ? "❌" : "⚠️";

  const headingColor =
    status === "confirmed"
      ? "text-emerald-700"
      : status === "disputed"
        ? "text-brand-alert-red"
        : "text-amber-700";

  const borderColor =
    status === "confirmed"
      ? "border-emerald-300 bg-emerald-50"
      : status === "disputed"
        ? "border-brand-alert-red/30 bg-brand-alert-red/5"
        : "border-amber-300 bg-amber-50";

  const heading =
    status === "confirmed"
      ? "Charge bestätigt"
      : status === "disputed"
        ? "Event bestritten"
        : "Fehler";

  return (
    <main className="min-h-screen bg-brand-off-white flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        {/* Logo / Brand */}
        <div className="mb-8 text-center">
          <span className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
            KickPact
          </span>
        </div>

        {/* Status card */}
        <div className={`rounded-xl border p-6 md:p-8 ${borderColor}`}>
          <div className="text-4xl mb-3 text-center">{icon}</div>
          <h1 className={`font-display font-black text-xl tracking-tight text-center mb-3 ${headingColor}`}>
            {heading}
          </h1>
          <p className="text-sm text-brand-night-navy/70 text-center">{message}</p>
        </div>

        {/* Footer links */}
        <div className="mt-6 flex justify-center gap-4 text-xs text-brand-night-navy/50">
          <Link href="/sponsor/inbox" className="hover:text-accent">
            Zur Inbox
          </Link>
          <Link href="/" className="hover:text-accent">
            Startseite
          </Link>
        </div>
      </div>
    </main>
  );
}
