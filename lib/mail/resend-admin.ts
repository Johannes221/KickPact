/**
 * Resend-API-Listing für die Admin-Mail-Seite (/admin/mail).
 *
 * Aus der Page extrahiert (Vibe-Check 2026-07-06): der Fetch braucht ein
 * AbortSignal.timeout, sonst blockiert ein hängendes Resend das komplette
 * Server-Rendering der Seite. Fehler werden als error-String zurückgegeben,
 * nie geworfen.
 */

export interface ResendEmail {
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

export async function fetchResendEmails(): Promise<{
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
      cache: "no-store",
      signal: AbortSignal.timeout(3000)
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
