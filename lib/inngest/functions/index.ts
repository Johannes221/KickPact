import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";
import { approvalReminders } from "./approval-reminders";
import { generateInvoices } from "./generate-invoices";
import { seasonEndReminders } from "./season-end-reminders";

export const functions = [
  crawlMatches,
  evaluateMatch,
  approvalReminders,
  generateInvoices,
  seasonEndReminders
];
