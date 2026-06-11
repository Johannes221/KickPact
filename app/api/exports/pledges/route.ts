/**
 * CSV-Export aller Pledges (pledge_rules) eines Vereins, gefiltert.
 *
 * URL: `/api/exports/pledges?slug=<club-slug>&teamId=…&sponsorId=…&triggerType=…&status=…`
 *
 * Auth: `assertClubAccess(slug, "viewer")`.
 */
import { NextRequest, NextResponse } from "next/server";
import { assertClubAccess } from "@/lib/auth/scope";
import { listPledgesForClub } from "@/lib/db/queries/club-reporting";
import { triggerLabel } from "@/lib/triggers/labels";
import { buildCsv, csvFilename, csvResponseHeaders } from "@/lib/exports/csv";
import { eurCsv } from "@/lib/utils/currency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    active: "Aktiv",
    paused: "Pausiert",
    ended: "Beendet"
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
    status: sp.get("status") ?? undefined
  };

  const rows = await listPledgesForClub(ctx.club.id, { filter });

  const csv = buildCsv({
    headers: [
      "Sponsor",
      "Sponsor-Email",
      "Team",
      "Trigger",
      "Trigger-Key",
      "Betrag/Event EUR",
      "Per-Spiel-Cap EUR",
      "Monats-Cap EUR",
      "Status",
      "Startet am",
      "Endet am",
      "Monats-Verbrauch EUR",
      "Lifetime EUR",
      "Cap-Auslastung %",
      "Pact-ID",
      "Rule-ID"
    ],
    rows: rows.map((r) => {
      const capPct =
        r.monthlyCapCents && r.monthlyCapCents > 0
          ? Math.min(100, Math.round((r.monthChargedCents / r.monthlyCapCents) * 100))
          : null;
      return [
        r.sponsorDisplayName,
        r.sponsorEmail,
        r.teamName,
        triggerLabel(r.triggerType),
        r.triggerType,
        eurCsv(r.amountCents),
        eurCsv(r.perMatchCapCents),
        eurCsv(r.monthlyCapCents),
        statusLabel(r.status),
        r.startsAt.toISOString().slice(0, 10),
        r.endsAt.toISOString().slice(0, 10),
        eurCsv(r.monthChargedCents),
        eurCsv(r.lifetimeChargedCents),
        capPct === null ? "" : String(capPct),
        r.pledgeId,
        r.ruleId
      ];
    })
  });

  const filename = csvFilename(`pledges_${ctx.club.slug}`);
  return new NextResponse(csv, {
    status: 200,
    headers: csvResponseHeaders(filename)
  });
}
