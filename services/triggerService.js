const Pledge = require('../models/Pledge');
const Charge = require('../models/Charge');

const TRIGGER_TYPES = {
  SIEG: 'Sieg',
  NIEDERLAGE: 'Niederlage',
  UNENTSCHIEDEN: 'Unentschieden',
  ZU_NULL: 'Zu-Null-Sieg (kein Gegentor)',
  SIEG_DIFF_2: 'Sieg mit mind. 2 Toren Unterschied',
  SIEG_DIFF_3: 'Sieg mit mind. 3 Toren Unterschied',
  SIEG_DIFF_5: 'Sieg mit mind. 5 Toren Unterschied',
  AUSWAERTSSIEG: 'Auswärtssieg',
  HEIMSIEG: 'Heimsieg',
  TOR_GESAMT: 'Pro Tor (gesamt)',
  TOR_SPIELER: 'Pro Tor von Spieler X',
  HATTRICK: 'Hattrick (ein Spieler, 3+ Tore)',
  HATTRICK_SPIELER: 'Hattrick von Spieler X',
  COMEBACK_SIEG: 'Comeback-Sieg (HZ hinten, am Ende vorne)',
  AUFSTIEG: 'Aufstieg',
  MEISTERSCHAFT: 'Meisterschaft / Platz 1',
  KLASSENERHALT: 'Klassenerhalt',
  KOPFBALLTOR: 'Kopfballtor',
  ELFMETERTOR: 'Elfmetertor',
  FREISTOSSTOR: 'Freistoßtor',
  GEHALTENER_ELFER: 'Gehaltener Elfmeter',
  DIREKTABNAHME: 'Direktabnahme / Volley',
};

function evaluateTrigger(trigger, match) {
  const kt = match.kickpactTrigger || {};
  const torCount = match.events ? match.events.filter((e) => e.typ === 'TOR').length : 0;

  switch (trigger.type) {
    case 'SIEG':
      return kt.sieg ? { count: 1, beschreibung: 'Sieg' } : null;
    case 'NIEDERLAGE':
      return kt.niederlage ? { count: 1, beschreibung: 'Niederlage' } : null;
    case 'UNENTSCHIEDEN':
      return kt.unentschieden ? { count: 1, beschreibung: 'Unentschieden' } : null;
    case 'ZU_NULL':
      return kt.sieg && kt.zuNull ? { count: 1, beschreibung: 'Zu-Null-Sieg' } : null;
    case 'SIEG_DIFF_2':
      return kt.sieg && kt.toreDifferenz >= 2 ? { count: 1, beschreibung: `Sieg mit ${kt.toreDifferenz} Toren Unterschied` } : null;
    case 'SIEG_DIFF_3':
      return kt.sieg && kt.toreDifferenz >= 3 ? { count: 1, beschreibung: `Sieg mit ${kt.toreDifferenz} Toren Unterschied` } : null;
    case 'SIEG_DIFF_5':
      return kt.sieg && kt.toreDifferenz >= 5 ? { count: 1, beschreibung: `Sieg mit ${kt.toreDifferenz} Toren Unterschied` } : null;
    case 'AUSWAERTSSIEG':
      return kt.sieg && !match.istHeimspiel ? { count: 1, beschreibung: 'Auswärtssieg' } : null;
    case 'HEIMSIEG':
      return kt.sieg && match.istHeimspiel ? { count: 1, beschreibung: 'Heimsieg' } : null;
    case 'TOR_GESAMT': {
      return torCount > 0 ? { count: torCount, beschreibung: `${torCount} Tore` } : null;
    }
    case 'TOR_SPIELER': {
      const spielerTore = kt.toreProSpieler?.get
        ? kt.toreProSpieler.get(trigger.spielerName) || 0
        : (kt.toreProSpieler?.[trigger.spielerName] || 0);
      return spielerTore > 0 ? { count: spielerTore, beschreibung: `${spielerTore} Tore von ${trigger.spielerName}` } : null;
    }
    case 'HATTRICK':
      return kt.hattrick ? { count: 1, beschreibung: 'Hattrick' } : null;
    case 'HATTRICK_SPIELER': {
      const spielerTore2 = kt.toreProSpieler?.get
        ? kt.toreProSpieler.get(trigger.spielerName) || 0
        : (kt.toreProSpieler?.[trigger.spielerName] || 0);
      return spielerTore2 >= 3 ? { count: 1, beschreibung: `Hattrick von ${trigger.spielerName}` } : null;
    }
    case 'COMEBACK_SIEG':
      return kt.comebackSieg ? { count: 1, beschreibung: 'Comeback-Sieg' } : null;
    default:
      return null;
  }
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function processTriggers(match) {
  const pledges = await Pledge.find({
    teamId: match.teamId,
    status: 'active',
    $or: [
      { startDate: { $lte: new Date() } },
      { startDate: null },
    ],
    $or: [
      { endDate: { $gte: new Date() } },
      { endDate: null },
    ],
  });

  const monat = getCurrentMonth();

  for (const pledge of pledges) {
    const chargeEvents = [];

    for (const trigger of pledge.triggers) {
      const result = evaluateTrigger(trigger, match);
      if (!result) continue;

      const betragCent = trigger.betragCent * result.count;
      chargeEvents.push({
        matchId: match._id,
        pledgeId: pledge._id,
        triggerType: trigger.type,
        eventBeschreibung: result.beschreibung,
        betragCent,
      });
    }

    if (chargeEvents.length === 0) continue;

    const gesamtCent = chargeEvents.reduce((s, e) => s + e.betragCent, 0);

    try {
      const existing = await Charge.findOne({ sponsorId: pledge.sponsorId, pledgeId: pledge._id, monat });
      if (existing) {
        existing.events.push(...chargeEvents);
        existing.gesamtCent += gesamtCent;
        await existing.save();
      } else {
        await Charge.create({
          sponsorId: pledge.sponsorId,
          teamId: match.teamId,
          clubId: match.clubId,
          pledgeId: pledge._id,
          monat,
          events: chargeEvents,
          gesamtCent,
          status: 'pending',
        });
      }
    } catch (e) {
      console.error('Fehler beim Erstellen von Charge:', e.message);
    }
  }
}

module.exports = { processTriggers, evaluateTrigger, TRIGGER_TYPES };
