const express = require('express');
const Pledge = require('../../models/Pledge');
const Team = require('../../models/Team');
const Club = require('../../models/Club');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = { sponsorId: req.user.id };
    const pledges = await Pledge.find(filter)
      .populate('teamId', 'name slug')
      .populate('clubId', 'name slug')
      .sort({ createdAt: -1 });
    res.json(pledges);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const { teamId, triggers, maxProMonatCent, maxProSaisonCent, startDate, endDate, stripePaymentMethodId } = req.body;

    if (!teamId || !triggers || !Array.isArray(triggers) || triggers.length === 0) {
      return res.status(400).json({ error: 'teamId und triggers erforderlich' });
    }

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Mannschaft nicht gefunden' });

    for (const t of triggers) {
      if (!t.type || !t.betragCent || t.betragCent < 50) {
        return res.status(400).json({ error: 'Jeder Trigger braucht type und betragCent >= 50' });
      }
    }

    const pledge = new Pledge({
      sponsorId: req.user.id,
      teamId: team._id,
      clubId: team.clubId,
      triggers,
      maxProMonatCent: maxProMonatCent || null,
      maxProSaisonCent: maxProSaisonCent || null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      stripePaymentMethodId: stripePaymentMethodId || null,
      status: 'active',
    });

    await pledge.save();
    res.status(201).json(pledge);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const pledge = await Pledge.findById(req.params.id)
      .populate('teamId', 'name slug')
      .populate('clubId', 'name slug');
    if (!pledge) return res.status(404).json({ error: 'Nicht gefunden' });
    if (pledge.sponsorId.toString() !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    res.json(pledge);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const pledge = await Pledge.findById(req.params.id);
    if (!pledge) return res.status(404).json({ error: 'Nicht gefunden' });
    if (pledge.sponsorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }

    const { triggers, maxProMonatCent, maxProSaisonCent, startDate, endDate, status, stripePaymentMethodId } = req.body;

    if (triggers) pledge.triggers = triggers;
    if (maxProMonatCent !== undefined) pledge.maxProMonatCent = maxProMonatCent;
    if (maxProSaisonCent !== undefined) pledge.maxProSaisonCent = maxProSaisonCent;
    if (startDate !== undefined) pledge.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) pledge.endDate = endDate ? new Date(endDate) : null;
    if (status && ['active', 'paused', 'cancelled'].includes(status)) pledge.status = status;
    if (stripePaymentMethodId) pledge.stripePaymentMethodId = stripePaymentMethodId;

    await pledge.save();
    res.json(pledge);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const pledge = await Pledge.findById(req.params.id);
    if (!pledge) return res.status(404).json({ error: 'Nicht gefunden' });
    if (pledge.sponsorId.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Keine Berechtigung' });
    }
    pledge.status = 'cancelled';
    await pledge.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
