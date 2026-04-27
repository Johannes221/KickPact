const express = require('express');
const Match = require('../../models/Match');
const Pledge = require('../../models/Pledge');
const Charge = require('../../models/Charge');
const Team = require('../../models/Team');

const router = express.Router();

router.get('/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const matches = await Match.find({ teamId, status: 'confirmed' });

    let siege = 0, niederlagen = 0, unentschieden = 0;
    let toreGeschosse = 0, toreKassiert = 0, zuNull = 0, hattricks = 0;
    const torjaegerMap = {};

    for (const m of matches) {
      const kt = m.kickpactTrigger || {};
      if (kt.sieg) siege++;
      if (kt.niederlage) niederlagen++;
      if (kt.unentschieden) unentschieden++;
      if (kt.zuNull && kt.sieg) zuNull++;
      if (kt.hattrick) hattricks++;

      const goals = (m.events || []).filter((e) => e.typ === 'TOR');
      toreGeschosse += goals.length;

      if (m.ergebnis) {
        const geg = m.istHeimspiel ? m.ergebnis.gast : m.ergebnis.heim;
        toreKassiert += geg || 0;
      }

      if (kt.toreProSpieler) {
        const tpsObj = kt.toreProSpieler instanceof Map
          ? Object.fromEntries(kt.toreProSpieler)
          : kt.toreProSpieler;
        for (const [name, count] of Object.entries(tpsObj)) {
          torjaegerMap[name] = (torjaegerMap[name] || 0) + count;
        }
      }
    }

    const torjaeger = Object.entries(torjaegerMap)
      .map(([name, tore]) => ({ name, tore }))
      .sort((a, b) => b.tore - a.tore)
      .slice(0, 10);

    const pledgeCount = await Pledge.countDocuments({ teamId, status: 'active' });

    const chargeAgg = await Charge.aggregate([
      { $match: { teamId: matches[0]?.teamId, status: 'charged' } },
      { $group: { _id: null, total: { $sum: '$nettoVereinCent' } } },
    ]);
    const einnahmenCent = chargeAgg[0]?.total || 0;

    const pendingAgg = await Charge.aggregate([
      { $match: { teamId: matches[0]?.teamId, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$gesamtCent' } } },
    ]);
    const ausstehendCent = pendingAgg[0]?.total || 0;

    res.json({
      spiele: matches.length,
      siege,
      niederlagen,
      unentschieden,
      toreGeschosse,
      toreKassiert,
      zuNull,
      hattricks,
      torjaeger,
      pledgeCount,
      einnahmenCent,
      ausstehendCent,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
