const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  typ: { type: String, enum: ['TOR', 'AUSWECHSLUNG'], required: true },
  minute: { type: Number },
  spielerId: { type: String },
  spielerName: { type: String },
  mannschaft: { type: String, enum: ['heim', 'gast', 'unbekannt'] },
  rein: { id: String, name: String },
  raus: { id: String, name: String },
  isManual: { type: Boolean, default: false },
  manualApprovedByClub: { type: Boolean, default: false },
  manualApprovedBySponsors: { type: Boolean, default: false },
}, { _id: false });

const matchSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  spielId: { type: String, required: true },
  datum: { type: String },
  heim: { type: String },
  gast: { type: String },
  ergebnis: { heim: Number, gast: Number },
  halbzeit: { heim: Number, gast: Number },
  istHeimspiel: { type: Boolean },
  events: [eventSchema],
  kickpactTrigger: {
    sieg: Boolean,
    niederlage: Boolean,
    unentschieden: Boolean,
    zuNull: Boolean,
    toreDifferenz: Number,
    hattrick: Boolean,
    comebackSieg: Boolean,
    toreProSpieler: { type: Map, of: Number },
  },
  crawledAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'confirmed', 'disputed'], default: 'confirmed' },
}, { timestamps: true });

matchSchema.index({ teamId: 1, spielId: 1 }, { unique: true });

module.exports = mongoose.model('Match', matchSchema);
