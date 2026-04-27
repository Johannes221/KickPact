const cron = require('node-cron');
const Team = require('../models/Team');
const { crawlAndSaveMatches } = require('../services/crawlerService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startCrawlerCron() {
  cron.schedule('0 22 * * *', async () => {
    console.log('[CRON] Täglicher Spieltag-Crawl gestartet...');
    try {
      const teams = await Team.find({ status: 'active', fussballDeTeamId: { $exists: true } });
      for (const team of teams) {
        try {
          const saved = await crawlAndSaveMatches(team);
          console.log(`[CRON] Team ${team.name}: ${saved} neue Spiele gespeichert.`);
        } catch (e) {
          console.error(`[CRON] Fehler bei Team ${team.name}:`, e.message);
        }
        await sleep(2000);
      }
      console.log('[CRON] Crawl abgeschlossen.');
    } catch (e) {
      console.error('[CRON] Crawl-Fehler:', e.message);
    }
  });

  console.log('[CRON] Crawler-Cron registriert (täglich 22:00 Uhr).');
}

module.exports = { startCrawlerCron };
