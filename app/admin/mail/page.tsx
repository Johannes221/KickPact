export const metadata = { title: "Mail · Admin · KickPact" };
export const dynamic = "force-dynamic";

interface ResendEmail {
  id: string;
  to: string[];
  from: string;
  subject: string;
  created_at: string;
  last_event?: string;
}

interface ResendListResponse {
  object?: string;
  data?: ResendEmail[];
}

async function fetchResendEmails(): Promise<{
  data: ResendEmail[];
  error: string | null;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { data: [], error: "RESEND_API_KEY ist nicht gesetzt." };
  }
  try {
    // Resend API: GET /emails returns last emails. Limit param keeps payload small.
    const res = await fetch("https://api.resend.com/emails?limit=50", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store"
    });
    if (!res.ok) {
      return {
        data: [],
        error: `Resend API antwortete mit ${res.status} ${res.statusText}`
      };
    }
    const json = (await res.json()) as ResendListResponse;
    return { data: json.data ?? [], error: null };
  } catch (e) {
    return {
      data: [],
      error: e instanceof Error ? e.message : "Resend-API-Fetch fehlgeschlagen"
    };
  }
}

function eventColor(event: string | undefined): string {
  if (!event) return "text-brand-night-navy/60";
  if (event === "delivered" || event === "sent") return "text-emerald-700";
  if (event === "bounced" || event === "complained") return "text-rose-700";
  if (event === "opened" || event === "clicked") return "text-blue-700";
  return "text-brand-night-navy/60";
}

export default async function MailPage() {
  const { data, error } = await fetchResendEmails();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-brand-night-navy/60">
          Letzte 50 Emails aus Resend. Bounces, Complaints + Re-Send via{" "}
          <a
            href="https://resend.com/emails"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            Resend-Dashboard
          </a>
          .
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Resend-API:</strong> {error}
        </div>
      )}

      <section>
        <div className="rounded-2xl border border-brand-neutral/40 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Verschickt</th>
                <th className="px-3 py-2 text-left font-semibold">An</th>
                <th className="px-3 py-2 text-left font-semibold">Betreff</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-neutral/30">
              {data.length === 0 && !error && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-brand-night-navy/50">
                    Keine Emails (oder Resend hat noch keine Historie).
                  </td>
                </tr>
              )}
              {data.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-xs font-mono tabular-nums text-brand-night-navy/70">
                    {new Date(e.created_at).toLocaleString("de-DE")}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {Array.isArray(e.to) ? e.to.join(", ") : String(e.to)}
                  </td>
                  <td className="px-3 py-2 text-xs">{e.subject}</td>
                  <td className={`px-3 py-2 text-xs font-semibold ${eventColor(e.last_event)}`}>
                    {e.last_event ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <a
                      href={`https://resend.com/emails/${e.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-accent hover:underline"
                    >
                      Resend ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-brand-night-navy/50">
          Hinweis: Re-Send / Template-Wiederholung wird aktuell nicht direkt
          unterstützt — bitte das Resend-Dashboard nutzen.
        </p>
      </section>
    </div>
  );
}
