const express = require('express');
const Team = require('../../models/Team');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.post('/import', requireAuth, requireRole('club_admin', 'super_admin'), async (req, res) => {
  try {
    const { name, slug, saison, teamId: fussballDeTeamId, url: fussballDeUrl } = req.body;
    if (!name || !fussballDeTeamId) {
      return res.status(400).json({ error: 'name und teamId erforderlich' });
    }
    if (!req.user.clubId) {
      return res.status(400).json({ error: 'Kein Verein zugeordnet' });
    }

    const existing = await Team.findOne({ fussballDeTeamId });
    if (existing) return res.status(409).json({ error: 'Mannschaft bereits importiert' });

    const team = new Team({
      clubId: req.user.clubId,
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      fussballDeTeamId,
      fussballDeUrl: fussballDeUrl || null,
      saison: saison || '2526',
      status: 'active',
    });
    await team.save();
    res.status(201).json(team);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireAuth, requireRole('club_admin', 'team_admin', 'super_admin'), async (req, res) => {
  try {
    const filter = req.user.clubId ? { clubId: req.user.clubId } : {};
    const teams = await Team.find(filter).sort({ name: 1 });
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
