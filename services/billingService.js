const Charge = require('../models/Charge');
const Pledge = require('../models/Pledge');
const User = require('../models/User');
const Team = require('../models/Team');
const { sendMonthlyReceiptEmail, sendPaymentFailedEmail } = require('./emailService');

function getPreviousMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function monthlyBilling() {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const lastMonth = getPreviousMonth();
  console.log(`Monatliche Abrechnung für ${lastMonth} gestartet...`);

  const charges = await Charge.find({ monat: lastMonth, status: 'pending' });
  let success = 0;
  let failed = 0;

  for (const charge of charges) {
    try {
      const pledge = await Pledge.findById(charge.pledgeId);
      if (!pledge) continue;

      const sponsor = await User.findById(charge.sponsorId);
      if (!sponsor || !sponsor.stripeCustomerId || !pledge.stripePaymentMethodId) continue;

      const team = await Team.findById(charge.teamId);

      let cappedAmount = charge.gesamtCent;
      if (pledge.maxProMonatCent) {
        const alreadyChargedThisMonth = await Charge.aggregate([
          { $match: { sponsorId: charge.sponsorId, pledgeId: charge.pledgeId, monat: lastMonth, status: 'charged' } },
          { $group: { _id: null, total: { $sum: '$gesamtCent' } } },
        ]);
        const alreadyCharged = alreadyChargedThisMonth[0]?.total || 0;
        cappedAmount = Math.min(cappedAmount, pledge.maxProMonatCent - alreadyCharged);
      }

      if (cappedAmount <= 0) {
        charge.status = 'charged';
        charge.gesamtCent = 0;
        await charge.save();
        continue;
      }

      const intent = await stripe.paymentIntents.create({
        amount: cappedAmount,
        currency: 'eur',
        customer: sponsor.stripeCustomerId,
        payment_method: pledge.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        description: `KickPact ${lastMonth} - ${team?.name || 'Mannschaft'}`,
      });

      charge.provisionCent = Math.round(cappedAmount * 0.03);
      charge.nettoVereinCent = cappedAmount - charge.provisionCent;
      charge.gesamtCent = cappedAmount;
      charge.stripePaymentIntentId = intent.id;
      charge.status = 'charged';
      await charge.save();

      await sendMonthlyReceiptEmail(sponsor, charge, team);
      success++;
    } catch (e) {
      console.error(`Charge ${charge._id} fehlgeschlagen:`, e.message);
      charge.status = 'failed';
      await charge.save();
      try {
        const sponsor = await User.findById(charge.sponsorId);
        if (sponsor) await sendPaymentFailedEmail(sponsor, charge);
      } catch (_) {}
      failed++;
    }
  }

  console.log(`Abrechnung abgeschlossen: ${success} erfolgreich, ${failed} fehlgeschlagen.`);
  return { success, failed, lastMonth };
}

module.exports = { monthlyBilling, getPreviousMonth };
