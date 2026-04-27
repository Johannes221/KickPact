const express = require('express');
const Charge = require('../../models/Charge');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { monthlyBilling } = require('../../services/billingService');
const { generateQuittung } = require('../../services/pdfService');
const Club = require('../../models/Club');
const User = require('../../models/User');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === 'super_admin' ? {} : { sponsorId: req.user.id };
    if (req.query.monat) filter.monat = req.query.monat;
    if (req.query.status) filter.status = req.query.status;

    const charges = await Charge.find(filter)
      .populate('teamId', 'name')
      .populate('clubId', 'name')
      .sort({ createdAt: -1 });
    res.json(charges);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/billing', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const result = await monthlyBilling();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/quittung/:chargeId', requireAuth, requireRole('club_admin', 'super_admin'), async (req, res) => {
  try {
    const charge = await Charge.findById(req.params.chargeId).populate('sponsorId teamId clubId');
    if (!charge) return res.status(404).json({ error: 'Charge nicht gefunden' });

    const club = await Club.findById(charge.clubId);
    if (!club || !club.isNonProfit) {
      return res.status(400).json({ error: 'Verein ist nicht gemeinnützig' });
    }

    generateQuittung(res, {
      club,
      sponsor: charge.sponsorId,
      charge,
      monat: charge.monat,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
