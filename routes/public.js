const express = require('express');
const Club = require('../models/Club');
const Team = require('../models/Team');
const Match = require('../models/Match');
const Pledge = require('../models/Pledge');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', optionalAuth, (req, res) => {
  res.render('landing', { user: req.user || null });
});

router.get('/verein/:slug', optionalAuth, async (req, res) => {
  try {
    const club = await Club.findOne({ slug: req.params.slug });
    if (!club) return res.status(404).render('error', { message: 'Verein nicht gefunden', user: req.user });

    const teams = await Team.find({ clubId: club._id, status: 'active' });
    const pledgeCount = await Pledge.countDocuments({ clubId: club._id, status: 'active' });

    res.render('public/verein', { club, teams, pledgeCount, user: req.user || null });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/mannschaft/:slug', optionalAuth, async (req, res) => {
  try {
    const team = await Team.findOne({ slug: req.params.slug }).populate('clubId');
    if (!team) return res.status(404).render('error', { message: 'Mannschaft nicht gefunden', user: req.user });

    const matches = await Match.find({ teamId: team._id, status: 'confirmed' })
      .sort({ datum: -1 })
      .limit(10);

    const pledgeCount = await Pledge.countDocuments({ teamId: team._id, status: 'active' });

    const torjaegerMap = {};
    for (const m of matches) {
      if (m.kickpactTrigger?.toreProSpieler) {
        const tpsObj = m.kickpactTrigger.toreProSpieler instanceof Map
          ? Object.fromEntries(m.kickpactTrigger.toreProSpieler)
          : m.kickpactTrigger.toreProSpieler;
        for (const [name, count] of Object.entries(tpsObj)) {
          torjaegerMap[name] = (torjaegerMap[name] || 0) + count;
        }
      }
    }
    const torjaeger = Object.entries(torjaegerMap)
      .map(([name, tore]) => ({ name, tore }))
      .sort((a, b) => b.tore - a.tore)
      .slice(0, 5);

    res.render('public/mannschaft', { team, club: team.clubId, matches, pledgeCount, torjaeger, user: req.user || null });
  } catch (e) {
    res.status(500).render('error', { message: e.message, user: req.user });
  }
});

router.get('/registrieren', optionalAuth, (req, res) => {
  if (req.user) return res.redirect('/sponsor/dashboard');
  res.render('auth/registrieren', { user: null });
});

router.get('/login', optionalAuth, (req, res) => {
  if (req.user) return res.redirect('/sponsor/dashboard');
  res.render('auth/login', { user: null });
});

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
});

router.get('/datenschutz', optionalAuth, (req, res) => {
  res.render('datenschutz', { user: req.user || null });
});

router.get('/impressum', optionalAuth, (req, res) => {
  res.render('impressum', { user: req.user || null });
});

module.exports = router;
