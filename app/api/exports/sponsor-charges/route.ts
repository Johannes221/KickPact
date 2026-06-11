/**
 * CSV-Export der globalen Charge-History eines Sponsors, gefiltert.
 *
 * URL: `/api/exports/sponsor-charges?clubId=…&teamId=…&triggerType=…&status=…&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD`
 *
 * Auth: `requireUser()` + Sponsor-Lookup. Charges sind hart auf den eigenen
 * Sponsor scoped (`pledges.sponsorId = me`) — kein Cross-Sponsor-Leak möglich.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listChargesForSponsor } from "@/lib/db/queries/sponsor-reporting";
import { triggerLabel } from "@/lib/triggers/labels";
import { buildCsv, csvResponseHeaders } from "@/lib/exports/csv";
import { eurCsv } from "@/lib/utils/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending_approval: "Wartet auf Bestätigung",
    confirmed: "Bestätigt",
    invoiced: "Berechnet",
    cancelled: "Storniert"
  };
  return map[s] ?? s;
}

function parseDate(raw: string | null): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw.length <= 10 ? `${raw}T00:00:00.000Z` : raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function isoDateOrEmpty(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const sponsor = await findSponsorForUser(user.id);

  if (!sponsor) {
    return NextResponse.json({ error: "no-sponsor" }, { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const clubId = sp.get("clubId") ?? undefined;
  const teamId = sp.get("teamId") ?? undefined;
  const triggerType = sp.get("triggerType") ?? undefined;
  const status = sp.get("status") ?? undefined;
  const dateFrom = parseDate(sp.get("dateFrom"));
  const dateToRaw = parseDate(sp.get("dateTo"));
  const dateTo = dateToRaw
    ? new Date(dateToRaw.getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  const rows = await listChargesForSponsor(sponsor.id, {
    filters: {
      clubIds: clubId ? [clubId] : undefined,
      teamIds: teamId ? [teamId] : undefined,
      triggerTypes: triggerType ? [triggerType as never] : undefined,
      statuses: status
        ? ([status] as ("confirmed" | "invoiced" | "pending_approval" | "cancelled")[])
        : undefined,
      from: dateFrom,
      to: dateTo
    }
  });

  const csv = buildCsv({
    headers: [
      "Datum",
      "Verein",
      "Mannschaft",
      "Heim",
      "Gast",
      "Ergebnis",
      "Saison",
      "Trigger",
      "Trigger-Key",
      "Betrag EUR",
      "Status",
      "Erstellt am",
      "Bestätigt am",
      "Charge-ID"
    ],
    rows: rows.map((r) => {
      const ergebnis =
        r.ergebnisHeim !== null && r.ergebnisGast !== null
          ? `${r.ergebnisHeim}:${r.ergebnisGast}`
          : "";
      return [
        isoDateOrEmpty(r.matchDate ?? r.createdAt),
        r.clubName,
        r.teamName,
        r.heimName ?? "",
        r.gastName ?? "",
        ergebnis,
        r.saison ?? "",
        triggerLabel(r.triggerType),
        r.triggerType,
        eurCsv(r.amountCents),
        statusLabel(r.status),
        r.createdAt.toISOString(),
        r.confirmedAt ? r.confirmedAt.toISOString() : "",
        r.id
      ];
    })
  });

  // Filename: "kickpact-charges-<from>-<to>.csv" — mit aktuellen Werten
  const today = new Date().toISOString().slice(0, 10);
  const fromLabel = dateFrom ? dateFrom.toISOString().slice(0, 10) : "alle";
  const toLabel = dateToRaw ? dateToRaw.toISOString().slice(0, 10) : today;
  const filename = `kickpact-charges-${fromLabel}-${toLabel}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename)
  });
}
