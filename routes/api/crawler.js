const express = require('express');
const { searchVereine, getMannschaften, getSpiele, getSpielDetails } = require('../../crawler');
const { crawlAndSaveMatches } = require('../../services/crawlerService');
const Match = require('../../models/Match');
const Team = require('../../models/Team');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { crawlerLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

router.get('/search', crawlerLimiter, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'q parameter required' });
  try {
    const vereine = await searchVereine(q);
    res.json(vereine);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/teams', crawlerLimiter, async (req, res) => {
  const { vereinId, slug } = req.query;
  if (!vereinId || !slug) return res.status(400).json({ error: 'vereinId and slug required' });
  try {
    const teams = await getMannschaften(vereinId, slug);
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/matches', async (req, res) => {
  const { teamId, slug, saison } = req.query;
  if (!teamId || !slug) return res.status(400).json({ error: 'teamId and slug required' });
  try {
    const matches = await getSpiele(teamId, slug, saison || '2526');
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/match', async (req, res) => {
  const { spielId, slug } = req.query;
  if (!spielId) return res.status(400).json({ error: 'spielId required' });
  try {
    const details = await getSpielDetails(spielId, slug || spielId);
    res.json(details);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/db-matches', requireAuth, async (req, res) => {
  const { teamId } = req.query;
  if (!teamId) return res.status(400).json({ error: 'teamId required' });
  try {
    const matches = await Match.find({ teamId }).sort({ datum: -1 }).limit(20);
    res.json(matches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/crawl-team', requireAuth, requireRole('super_admin', 'club_admin', 'team_admin'), crawlerLimiter, async (req, res) => {
  const { teamId } = req.body;
  if (!teamId) return res.status(400).json({ error: 'teamId required' });

  const team = await Team.findById(teamId);
  if (!team) return res.status(404).json({ error: 'Team nicht gefunden' });

  res.json({ message: 'Crawl gestartet...' });

  crawlAndSaveMatches(team)
    .then((saved) => console.log(`Manueller Crawl für ${team.name}: ${saved} Spiele gespeichert.`))
    .catch((e) => console.error(`Crawl-Fehler für ${team.name}:`, e.message));
});

module.exports = router;
