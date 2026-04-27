const mongoose = require('mongoose');

const triggerSchema = new mongoose.Schema({
  type: { type: String, required: true },
  spielerId: { type: String },
  spielerName: { type: String },
  betragCent: { type: Number, required: true, min: 50 },
}, { _id: false });

const pledgeSchema = new mongoose.Schema({
  sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  triggers: [triggerSchema],
  maxProMonatCent: { type: Number },
  maxProSaisonCent: { type: Number },
  startDate: { type: Date },
  endDate: { type: Date },
  status: { type: String, enum: ['active', 'paused', 'cancelled'], default: 'active' },
  stripePaymentMethodId: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Pledge', pledgeSchema);
