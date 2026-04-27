const { getSpiele, getSpielDetails, searchVereine, getMannschaften } = require('../crawler');
const Match = require('../models/Match');
const Player = require('../models/Player');
const Team = require('../models/Team');
const { processTriggers } = require('./triggerService');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cachePlayer(spielerId, spielerName, teamId) {
  if (!spielerId) return;
  try {
    await Player.findOneAndUpdate(
      { fussballDePlayerId: spielerId },
      { $set: { name: spielerName, cachedAt: new Date() }, $addToSet: { teamIds: teamId } },
      { upsert: true, new: true }
    );
  } catch (e) {
    // non-critical
  }
}

async function crawlAndSaveMatches(team) {
  const teamDoc = await Team.findById(team._id || team);
  if (!teamDoc) throw new Error('Team nicht gefunden');

  const spiele = await getSpiele(teamDoc.fussballDeTeamId, teamDoc.slug, teamDoc.saison);

  let saved = 0;
  for (const spiel of spiele) {
    const existing = await Match.findOne({ teamId: teamDoc._id, spielId: spiel.spielId });
    if (existing) continue;

    await sleep(1500);

    let details;
    try {
      details = await getSpielDetails(spiel.spielId, spiel.slug);
    } catch (e) {
      console.error(`Fehler beim Crawlen von Spiel ${spiel.spielId}:`, e.message);
      continue;
    }

    const istHeimspiel = details.gast?.toLowerCase().includes(teamDoc.name.toLowerCase()) === false;

    const match = new Match({
      teamId: teamDoc._id,
      clubId: teamDoc.clubId,
      spielId: spiel.spielId,
      datum: spiel.datum || details.datum,
      heim: details.heim || spiel.heim,
      gast: details.gast || spiel.gast,
      ergebnis: details.ergebnis,
      halbzeit: details.halbzeit,
      istHeimspiel,
      events: details.events || [],
      kickpactTrigger: details.kickpactTrigger || {},
      crawledAt: new Date(),
      status: 'confirmed',
    });

    try {
      await match.save();
      saved++;

      for (const ev of details.events || []) {
        if (ev.typ === 'TOR' && ev.spielerId) {
          await cachePlayer(ev.spielerId, ev.spielerName, teamDoc._id);
        }
      }

      await processTriggers(match);
    } catch (e) {
      if (e.code !== 11000) {
        console.error(`Fehler beim Speichern von Spiel ${spiel.spielId}:`, e.message);
      }
    }
  }

  await Team.findByIdAndUpdate(teamDoc._id, { lastCrawled: new Date() });
  return saved;
}

module.exports = { crawlAndSaveMatches, searchVereine, getMannschaften };
