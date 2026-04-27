const express = require('express');
const Club = require('../models/Club');
const Team = require('../models/Team');
const Match = require('../models/Match');
const Pledge = require('../models/Pledge');
const Charge = require('../models/Charge');
const ManualEvent = require('../models/ManualEvent');
const User = require('../models/User');
const { requireAuth, requireRole } = require('../middleware/auth');
const mongoose = require('mongoose');

const router = express.Router();

router.use(requireAuth, requireRole('club_admin', 'team_admin', 'super_admin'));

router.get('/dashboard', async (req, res) => {
  try {
    const club = req.user.clubId ? await Club.findById(req.user.clubId) : null;
    const teams = club ? await Team.find({ clubId: club._id }) : [];

    const recentMatches = await Match.find(
      club ? { clubId: club._id } : {}
    ).sort({ createdAt: -1 }).limit(5);

    const einnahmenAgg = await Charge.aggregate([
      { $match: Object.assign({ status: 'charged' }, club ? { clubId: mongoose.Types.ObjectId.createFromHexString(club._id.toString()) } : {}) },
      { $group: { _id: null, total: { $sum: '$nettoVereinCent' } } },
    ]);
    const einnahmenCent = einnahmenAgg[0]?.total || 0;

    const ausstehendAgg = await Charge.aggregate([
      { $match: Object.assign({ status: 'pending' }, club ? { clubId: mongoose.Types.ObjectId.createFromHexString(club._id.toString()) } : {}) },
      { $group: { _id: null, total: { $sum: '$gesamtCent' } } },
    ]);
    const ausstehendCent = ausstehendAgg[0]?.total || 0;

    const pendingEvents = await ManualEvent.find(
      club ? { clubId: club._id, approvedByClub: false, status: 'pending' } : {}
    ).populate('teamId', 'name').limit(5);

    res.render('club/dashboard', {
      user: req.user,
      club,
      teams,
      recentMatches,
      einnahmenCent,
      ausstehendCent,
      pendingEvents,
    });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/mannschaften', async (req, res) => {
  try {
    const club = await Club.findById(req.user.clubId);
    const teams = await Team.find({ clubId: req.user.clubId });
    res.render('club/mannschaften', { user: req.user, club, teams });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/mannschaft/:id', async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).render('error', { message: 'Team nicht gefunden', user: req.user });

    const pledges = await Pledge.find({ teamId: team._id, status: 'active' })
      .populate('sponsorId', 'name email');
    const matches = await Match.find({ teamId: team._id }).sort({ datum: -1 }).limit(10);

    res.render('club/mannschaft-detail', { user: req.user, team, pledges, matches });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/events/manuell', async (req, res) => {
  try {
    const events = await ManualEvent.find({ clubId: req.user.clubId })
      .populate('teamId', 'name')
      .populate('eingetragenVon', 'name')
      .sort({ createdAt: -1 });
    res.render('club/events-manuell', { user: req.user, events });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/sponsoren', async (req, res) => {
  try {
    const pledges = await Pledge.find({ clubId: req.user.clubId, status: 'active' })
      .populate('sponsorId', 'name email')
      .populate('teamId', 'name');
    const sponsorenMap = {};
    for (const p of pledges) {
      const sid = p.sponsorId._id.toString();
      if (!sponsorenMap[sid]) {
        sponsorenMap[sid] = { sponsor: p.sponsorId, pledges: [], teams: [] };
      }
      sponsorenMap[sid].pledges.push(p);
      sponsorenMap[sid].teams.push(p.teamId?.name);
    }
    res.render('club/sponsoren', { user: req.user, sponsoren: Object.values(sponsorenMap) });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/statistiken', async (req, res) => {
  try {
    const teams = await Team.find({ clubId: req.user.clubId });
    res.render('club/statistiken', { user: req.user, teams });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/einnahmen', async (req, res) => {
  try {
    const charges = await Charge.find({ clubId: req.user.clubId })
      .populate('sponsorId', 'name email')
      .populate('teamId', 'name')
      .sort({ monat: -1 });
    res.render('club/einnahmen', { user: req.user, charges });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/quittungen', async (req, res) => {
  try {
    const club = await Club.findById(req.user.clubId);
    const charges = await Charge.find({ clubId: req.user.clubId, status: 'charged' })
      .populate('sponsorId', 'name email')
      .populate('teamId', 'name')
      .sort({ monat: -1 });
    res.render('club/quittungen', { user: req.user, club, charges });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/einstellungen', async (req, res) => {
  try {
    const club = await Club.findById(req.user.clubId);
    res.render('club/einstellungen', { user: req.user, club });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.post('/einstellungen', async (req, res) => {
  try {
    const { name, fussballDeUrl, vereinId, isNonProfit, steuernummer, freistellungDatum, adresse } = req.body;
    await Club.findByIdAndUpdate(req.user.clubId, {
      name, fussballDeUrl, vereinId,
      isNonProfit: !!isNonProfit,
      steuernummer, freistellungDatum, adresse,
    });
    res.redirect('/club/einstellungen?success=1');
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

module.exports = router;
