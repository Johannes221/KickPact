import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";
import { approvalReminders } from "./approval-reminders";
import { generateInvoices } from "./generate-invoices";
import { evaluateSeason } from "./evaluate-season";
import { trialReminders } from "./trial-reminders";
import { verifyResults } from "./verify-results";
import { pauseSeasonPasses } from "./pause-season-passes";
import { resumeSeasonPasses } from "./resume-season-passes";
import { pausePledgesSommerpause } from "./pause-pledges-sommerpause";
import { resumePledgesSommerpause } from "./resume-pledges-sommerpause";
import { expireApprovals, endPledges } from "./lifecycle-cleanup";
import { expireTrials } from "./expire-trials";
import { cleanupSessions } from "./cleanup-sessions";
import { anonymizeAccounts } from "./anonymize-accounts";
import { seasonRenewalPrompts } from "./season-renewal-prompts";
import { seasonRollover } from "./season-rollover";
import { supportSlaReminders } from "./support-sla-reminders";
import { autoPauseUnverified } from "./auto-pause-unverified";
import { notifyMatchResult } from "./notify-match-result";
import { notifyAccessRequest } from "./notify-access-request";
import { notifySponsorInquiry } from "./notify-sponsor-inquiry";
import { notifySponsorLead } from "./notify-sponsor-lead";

export const functions = [
  crawlMatches,
  evaluateMatch,
  approvalReminders,
  generateInvoices,
  evaluateSeason,
  trialReminders,
  verifyResults,
  pauseSeasonPasses,
  resumeSeasonPasses,
  pausePledgesSommerpause,
  resumePledgesSommerpause,
  expireApprovals,
  endPledges,
  expireTrials,
  cleanupSessions,
  anonymizeAccounts,
  seasonRenewalPrompts,
  seasonRollover,
  supportSlaReminders,
  autoPauseUnverified,
  notifyMatchResult,
  notifyAccessRequest,
  notifySponsorInquiry,
  notifySponsorLead
];
