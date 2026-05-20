import { relations } from "drizzle-orm";
import { users, sessions, accounts } from "./schema/auth";
import { sponsorInvitations } from "./schema/invitations";
import { clubs, clubMemberships, teams, players } from "./schema/clubs";
import { sponsors } from "./schema/sponsors";
import { pledges, pledgeRules } from "./schema/pledges";
import { matches, matchEvents, eventApprovals } from "./schema/matches";
import { charges, invoices, invoiceItems } from "./schema/charges";
import { subscriptions, teamLicenses } from "./schema/billing";

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
  memberships: many(clubMemberships),
  sponsorProfiles: many(sponsors)
}));

export const clubsRelations = relations(clubs, ({ many, one }) => ({
  teams: many(teams),
  memberships: many(clubMemberships),
  subscription: one(subscriptions, {
    fields: [clubs.id],
    references: [subscriptions.clubId]
  }),
  invoices: many(invoices)
}));

export const clubMembershipsRelations = relations(clubMemberships, ({ one }) => ({
  user: one(users, { fields: [clubMemberships.userId], references: [users.id] }),
  club: one(clubs, { fields: [clubMemberships.clubId], references: [clubs.id] })
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  club: one(clubs, { fields: [teams.clubId], references: [clubs.id] }),
  players: many(players),
  matches: many(matches),
  pledges: many(pledges),
  license: one(teamLicenses, { fields: [teams.id], references: [teamLicenses.teamId] })
}));

export const playersRelations = relations(players, ({ one }) => ({
  team: one(teams, { fields: [players.teamId], references: [teams.id] })
}));

export const sponsorsRelations = relations(sponsors, ({ one, many }) => ({
  user: one(users, { fields: [sponsors.userId], references: [users.id] }),
  pledges: many(pledges),
  invoices: many(invoices)
}));

export const pledgesRelations = relations(pledges, ({ one, many }) => ({
  sponsor: one(sponsors, { fields: [pledges.sponsorId], references: [sponsors.id] }),
  team: one(teams, { fields: [pledges.teamId], references: [teams.id] }),
  rules: many(pledgeRules),
  charges: many(charges)
}));

export const pledgeRulesRelations = relations(pledgeRules, ({ one, many }) => ({
  pledge: one(pledges, { fields: [pledgeRules.pledgeId], references: [pledges.id] }),
  charges: many(charges),
  approvals: many(eventApprovals)
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  team: one(teams, { fields: [matches.teamId], references: [teams.id] }),
  events: many(matchEvents),
  charges: many(charges)
}));

export const matchEventsRelations = relations(matchEvents, ({ one, many }) => ({
  match: one(matches, { fields: [matchEvents.matchId], references: [matches.id] }),
  player: one(players, { fields: [matchEvents.playerId], references: [players.id] }),
  approvals: many(eventApprovals),
  charges: many(charges)
}));

export const eventApprovalsRelations = relations(eventApprovals, ({ one }) => ({
  event: one(matchEvents, { fields: [eventApprovals.matchEventId], references: [matchEvents.id] }),
  pledgeRule: one(pledgeRules, {
    fields: [eventApprovals.pledgeRuleId],
    references: [pledgeRules.id]
  })
}));

export const chargesRelations = relations(charges, ({ one }) => ({
  pledge: one(pledges, { fields: [charges.pledgeId], references: [pledges.id] }),
  pledgeRule: one(pledgeRules, {
    fields: [charges.pledgeRuleId],
    references: [pledgeRules.id]
  }),
  match: one(matches, { fields: [charges.matchId], references: [matches.id] }),
  matchEvent: one(matchEvents, {
    fields: [charges.matchEventId],
    references: [matchEvents.id]
  }),
  invoice: one(invoices, { fields: [charges.invoiceId], references: [invoices.id] })
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  sponsor: one(sponsors, { fields: [invoices.sponsorId], references: [sponsors.id] }),
  club: one(clubs, { fields: [invoices.clubId], references: [clubs.id] }),
  items: many(invoiceItems)
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceItems.invoiceId], references: [invoices.id] }),
  charge: one(charges, { fields: [invoiceItems.chargeId], references: [charges.id] })
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  club: one(clubs, { fields: [subscriptions.clubId], references: [clubs.id] }),
  licenses: many(teamLicenses)
}));

export const teamLicensesRelations = relations(teamLicenses, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [teamLicenses.subscriptionClubId],
    references: [subscriptions.clubId]
  }),
  team: one(teams, { fields: [teamLicenses.teamId], references: [teams.id] })
}));

export const sponsorInvitationsRelations = relations(sponsorInvitations, ({ one }) => ({
  team: one(teams, { fields: [sponsorInvitations.teamId], references: [teams.id] }),
  createdBy: one(users, { fields: [sponsorInvitations.createdByUserId], references: [users.id] })
}));
