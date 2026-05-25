/**
 * CSV-Export aller Charges eines Vereins, gefiltert via Query-Params.
 *
 * URL: `/api/exports/charges?slug=<club-slug>&teamId=…&sponsorId=…&triggerType=…&status=…&dateFrom=…&dateTo=…`
 *
 * Auth: `assertClubAccess(slug, "viewer")` — viewer reicht für Read-Only-Export.
 * Wird vom `<CsvExportButton>` aufgerufen, der die aktuelle Filter-URL
 * unverändert mitsendet.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertClubAccess } from "@/lib/auth/scope";
import { listChargesForClub } from "@/lib/db/queries/club-reporting";
import { triggerLabel } from "@/lib/triggers/labels";
import { buildCsv, csvFilename, csvResponseHeaders } from "@/lib/exports/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function eur(cents: number): string {
  // Excel-DE: Komma als Dezimaltrenner. Keine Tausenderpunkte, damit Excel
  // den Wert als Zahl parst (Punkte würden je nach Excel-Setting collidieren).
  return (cents / 100).toFixed(2).replace(".", ",");
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending_approval: "Wartet auf Bestätigung",
    confirmed: "Bestätigt",
    invoiced: "In Rechnung",
    cancelled: "Storniert"
  };
  return map[s] ?? s;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "missing-slug" }, { status: 400 });
  }
  let ctx;
  try {
    ctx = await assertClubAccess(slug, "viewer");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const filter = {
    teamId: sp.get("teamId") ?? undefined,
    sponsorId: sp.get("sponsorId") ?? undefined,
    triggerType: sp.get("triggerType") ?? undefined,
    status: sp.get("status") ?? undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined
  };

  const rows = await listChargesForClub(ctx.club.id, { filter });

  const csv = buildCsv({
    headers: [
      "Datum",
      "Heim",
      "Gast",
      "Team",
      "Sponsor",
      "Sponsor-Email",
      "Trigger",
      "Trigger-Key",
      "Betrag EUR",
      "Status",
      "Erstellt am",
      "Bestätigt am",
      "Charge-ID"
    ],
    rows: rows.map((r) => [
      r.matchDate ? r.matchDate.toISOString().slice(0, 10) : "",
      r.heimName ?? "",
      r.gastName ?? "",
      r.teamName,
      r.sponsorDisplayName,
      r.sponsorEmail,
      triggerLabel(r.triggerType),
      r.triggerType,
      eur(r.amountCents),
      statusLabel(r.status),
      r.createdAt.toISOString(),
      r.confirmedAt ? r.confirmedAt.toISOString() : "",
      r.id
    ])
  });

  const filename = csvFilename(`charges_${ctx.club.slug}`);
  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename)
  });
}
