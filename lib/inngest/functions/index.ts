import { crawlMatches } from "./crawl-matches";
import { evaluateMatch } from "./evaluate-match";
import { approvalReminders } from "./approval-reminders";

export const functions = [crawlMatches, evaluateMatch, approvalReminders];
