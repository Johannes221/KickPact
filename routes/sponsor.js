const express = require('express');
const Pledge = require('../models/Pledge');
const Charge = require('../models/Charge');
const ManualEvent = require('../models/ManualEvent');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('sponsor'));

router.get('/dashboard', async (req, res) => {
  try {
    const pledges = await Pledge.find({ sponsorId: req.user.id, status: 'active' })
      .populate('teamId', 'name slug')
      .populate('clubId', 'name')
      .limit(5);

    const recentCharges = await Charge.find({ sponsorId: req.user.id })
      .populate('teamId', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    const pendingCharge = await Charge.aggregate([
      { $match: { sponsorId: require('mongoose').Types.ObjectId.createFromHexString(req.user.id), status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$gesamtCent' } } },
    ]);
    const pendingCent = pendingCharge[0]?.total || 0;

    const pendingEvents = await ManualEvent.find({
      approvedByClub: true,
      'sponsorApprovals.sponsorId': req.user.id,
      'sponsorApprovals.approved': null,
    }).populate('teamId', 'name').limit(5);

    res.render('sponsor/dashboard', {
      user: req.user,
      pledges,
      recentCharges,
      pendingCent,
      pendingEvents,
    });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/pledges', async (req, res) => {
  try {
    const pledges = await Pledge.find({ sponsorId: req.user.id })
      .populate('teamId', 'name slug')
      .populate('clubId', 'name slug')
      .sort({ createdAt: -1 });

    res.render('sponsor/pledges', { user: req.user, pledges });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/pledge/neu', (req, res) => {
  res.render('sponsor/pledge-neu', {
    user: req.user,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
  });
});

router.get('/pledge/:id', async (req, res) => {
  try {
    const pledge = await Pledge.findById(req.params.id)
      .populate('teamId', 'name slug')
      .populate('clubId', 'name slug');
    if (!pledge || pledge.sponsorId.toString() !== req.user.id) {
      return res.status(404).render('error', { message: 'Pledge nicht gefunden', user: req.user });
    }
    res.render('sponsor/pledge-detail', { user: req.user, pledge });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/rechnungen', async (req, res) => {
  try {
    const charges = await Charge.find({ sponsorId: req.user.id })
      .populate('teamId', 'name')
      .populate('clubId', 'name')
      .sort({ monat: -1 });

    res.render('sponsor/rechnungen', { user: req.user, charges });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/events/manuell', async (req, res) => {
  try {
    const pledges = await Pledge.find({ sponsorId: req.user.id, status: 'active' });
    const teamIds = pledges.map((p) => p.teamId);

    const events = await ManualEvent.find({
      teamId: { $in: teamIds },
      approvedByClub: true,
    }).populate('teamId', 'name').sort({ createdAt: -1 });

    res.render('sponsor/events-manuell', { user: req.user, events });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/profil', async (req, res) => {
  try {
    const userDoc = await User.findById(req.user.id);
    res.render('sponsor/profil', {
      user: req.user,
      userDoc,
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
