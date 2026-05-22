import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";
import { approvalReminders } from "./approval-reminders";
import { generateInvoices } from "./generate-invoices";
import { seasonEndReminders } from "./season-end-reminders";
import { evaluateSeason } from "./evaluate-season";
import { trialReminders } from "./trial-reminders";
import { verifyResults } from "./verify-results";

export const functions = [
  crawlMatches,
  evaluateMatch,
  approvalReminders,
  generateInvoices,
  seasonEndReminders,
  evaluateSeason,
  trialReminders,
  verifyResults
];
