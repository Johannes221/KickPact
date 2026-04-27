const cron = require('node-cron');
const { monthlyBilling } = require('../services/billingService');

function startBillingCron() {
  cron.schedule('0 8 1 * *', async () => {
    console.log('[CRON] Monatliche Abrechnung gestartet...');
    try {
      const result = await monthlyBilling();
      console.log(`[CRON] Abrechnung fertig: ${result.success} erfolgreich, ${result.failed} fehlgeschlagen.`);
    } catch (e) {
      console.error('[CRON] Abrechnungs-Fehler:', e.message);
    }
  });

  console.log('[CRON] Billing-Cron registriert (1. des Monats, 08:00 Uhr).');
}

module.exports = { startBillingCron };
