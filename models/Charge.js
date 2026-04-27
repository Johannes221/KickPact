const mongoose = require('mongoose');

const chargeEventSchema = new mongoose.Schema({
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  pledgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pledge' },
  triggerType: { type: String },
  eventBeschreibung: { type: String },
  betragCent: { type: Number },
}, { _id: false });

const chargeSchema = new mongoose.Schema({
  sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  pledgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pledge', required: true },
  monat: { type: String, required: true },
  events: [chargeEventSchema],
  gesamtCent: { type: Number, default: 0 },
  provisionCent: { type: Number, default: 0 },
  nettoVereinCent: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'charged', 'failed'], default: 'pending' },
  stripePaymentIntentId: { type: String },
}, { timestamps: true });

chargeSchema.index({ sponsorId: 1, pledgeId: 1, monat: 1 }, { unique: true });
chargeSchema.index({ matchId: 1, pledgeId: 1 }, { sparse: true });

module.exports = mongoose.model('Charge', chargeSchema);
