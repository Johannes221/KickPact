import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";
import { approvalReminders } from "./approval-reminders";
import { generateInvoices } from "./generate-invoices";
import { seasonEndReminders } from "./season-end-reminders";
import { evaluateSeason } from "./evaluate-season";
import { trialReminders } from "./trial-reminders";
import { verifyResults } from "./verify-results";
import { pauseSeasonPasses } from "./pause-season-passes";
import { resumeSeasonPasses } from "./resume-season-passes";
import { expireApprovals, endPledges } from "./lifecycle-cleanup";
import { expireTrials } from "./expire-trials";
import { cleanupSessions } from "./cleanup-sessions";

export const functions = [
  crawlMatches,
  evaluateMatch,
  approvalReminders,
  generateInvoices,
  seasonEndReminders,
  evaluateSeason,
  trialReminders,
  verifyResults,
  pauseSeasonPasses,
  resumeSeasonPasses,
  expireApprovals,
  endPledges,
  expireTrials,
  cleanupSessions
];
