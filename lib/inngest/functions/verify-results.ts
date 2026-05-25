/**
 * Daily spot-check: randomly samples 2–3 active teams, re-scrapes their
 * last 3 stored matches, and compares the live fussball.de result against
 * what's in the DB.
 *
 * If anything differs → email to ADMIN_ALERT_EMAIL so it can be fixed.
 * If everything matches → silent (no mail spam on the happy path).
 *
 * Env:
 *   ADMIN_ALERT_EMAIL  — recipient for drift alerts (falls back to a warn-log if unset)
 */

import { inngest } from "@/lib/inngest/client";
import { getActiveTeams, getRecentFinishedMatches } from "@/lib/db/queries/crawler";
import { getSpielDetails } from "@/lib/crawler/fussballde";
import { validateSpielDetails } from "@/lib/crawler/validator";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { maskEmail } from "@/lib/utils/log-pii";

const TEAMS_PER_RUN = 3; // how many teams to spot-check per day
const MATCHES_PER_TEAM = 3; // how many of their recent matches to re-verify

interface Drift {
  teamName: string;
  teamId: string;
  matchId: string;
  datum: Date | string;
  heimName: string;
  gastName: string;
  stored: { heim: number; gast: number };
  live: { heim: number; gast: number };
}

/** Fisher-Yates shuffle, returns a new array */
function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const verifyResults = inngest.createFunction(
  { id: "verify-results", concurrency: { limit: 1 } },
  { cron: "0 3 * * *" }, // täglich 3 Uhr
  async ({ step, logger }) => {
    // 1. Load all active teams and pick a random subset
    const allTeams = await step.run("load-teams", () => getActiveTeams());
    if (allTeams.length === 0) {
      logger.info("verify-results: no active teams, skipping");
      return { checked: 0, drifts: 0 };
    }

    const selected = shuffled(allTeams).slice(0, TEAMS_PER_RUN);
    logger.info(
      `verify-results: checking ${selected.length} / ${allTeams.length} teams`,
      { teamIds: selected.map((t) => t.id) }
    );

    // 2. For each selected team: re-scrape recent finished matches
    const drifts: Drift[] = [];
    let totalChecked = 0;

    for (const team of selected) {
      const storedMatches = await step.run(`load-matches-${team.id}`, () =>
        getRecentFinishedMatches(team.id, MATCHES_PER_TEAM)
      );

      for (const stored of storedMatches) {
        totalChecked++;
        // Re-scrape from fussball.de — "spiel" is a valid fallback slug
        const liveDetails = await step.run(`rescrape-${stored.fussballdeSpielId}`, () =>
          getSpielDetails(stored.fussballdeSpielId, "spiel")
        );

        // Skip if live data fails validation (scraping hiccup, not a real change)
        const valid = validateSpielDetails(liveDetails);
        if (!valid.valid) {
          logger.warn("verify-results: live scrape failed validation, skipping diff", {
            spielId: stored.fussballdeSpielId,
            reason: valid.reason
          });
          continue;
        }

        // Compare scores
        const scoreChanged =
          liveDetails.ergebnis.heim !== stored.ergebnisHeim ||
          liveDetails.ergebnis.gast !== stored.ergebnisGast;

        if (scoreChanged) {
          logger.warn("verify-results: score drift detected", {
            spielId: stored.fussballdeSpielId,
            stored: `${stored.ergebnisHeim}:${stored.ergebnisGast}`,
            live: `${liveDetails.ergebnis.heim}:${liveDetails.ergebnis.gast}`
          });
          drifts.push({
            teamName: team.name,
            teamId: team.id,
            matchId: stored.id,
            datum: stored.datum,
            heimName: stored.heimName,
            gastName: stored.gastName,
            stored: { heim: stored.ergebnisHeim, gast: stored.ergebnisGast },
            live: { heim: liveDetails.ergebnis.heim, gast: liveDetails.ergebnis.gast }
          });
        }
      }
    }

    logger.info(
      `verify-results: ${totalChecked} matches checked, ${drifts.length} drift(s) found`
    );

    // 3. Send alert only when there are actual diffs
    if (drifts.length > 0) {
      const adminEmail = process.env.ADMIN_ALERT_EMAIL;
      if (!adminEmail) {
        logger.warn(
          "verify-results: drift found but ADMIN_ALERT_EMAIL not set — set it to receive alerts",
          { drifts }
        );
      } else {
        await step.run("send-alert-email", () =>
          sendDriftEmail(adminEmail, drifts, totalChecked)
        );
        logger.info("verify-results: alert email sent", { to: maskEmail(adminEmail) });
      }
    }

    return { checked: totalChecked, drifts: drifts.length };
  }
);

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

async function sendDriftEmail(
  to: string,
  drifts: Drift[],
  totalChecked: number
): Promise<void> {
  const dateStr = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  const rows = drifts
    .map((d) => {
      const datum = new Date(d.datum).toLocaleDateString("de-DE");
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151">${d.teamName}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151">${datum}<br>
            <span style="font-size:12px;color:#6b7280">${d.heimName} – ${d.gastName}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;color:#374151">
            ${d.stored.heim}:${d.stored.gast}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-weight:bold;color:#dc2626">
            ${d.live.heim}:${d.live.gast}
          </td>
        </tr>`;
    })
    .join("");

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:system-ui,sans-serif;background:#f9fafb;margin:0;padding:32px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#ef4444;padding:20px 24px">
      <h1 style="margin:0;color:#fff;font-size:18px">⚠️ KickPact: Datendiskrepanz gefunden</h1>
      <p style="margin:4px 0 0;color:#fca5a5;font-size:14px">${dateStr} · ${drifts.length} Abweichung${drifts.length !== 1 ? "en" : ""} in ${totalChecked} geprüften Spielen</p>
    </div>
    <div style="padding:24px">
      <p style="margin:0 0 16px;color:#374151;font-size:14px">
        Der tägliche Spot-Check hat Unterschiede zwischen gespeicherten und aktuellen
        fussball.de-Ergebnissen gefunden:
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f3f4f6">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.05em">Team</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.05em">Spiel</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.05em">DB</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6b7280;letter-spacing:.05em">Live</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;padding:16px;background:#fef2f2;border-radius:8px;border:1px solid #fecaca">
        <p style="margin:0;font-size:13px;color:#991b1b">
          <strong>Handlungsbedarf:</strong> Falls das Live-Ergebnis korrekt ist,
          müssen die betroffenen Matches in der DB aktualisiert und ggf.
          Charges neu berechnet werden.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
        Geprüfte Teams heute: ${drifts.map((d) => d.teamName).filter((v, i, a) => a.indexOf(v) === i).join(", ")}
      </p>
    </div>
  </div>
</body>
</html>`;

  await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject: `⚠️ KickPact Spot-Check: ${drifts.length} Ergebnis-Abweichung${drifts.length !== 1 ? "en" : ""} (${dateStr})`,
    html
  });
}
