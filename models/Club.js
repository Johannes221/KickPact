const mongoose = require('mongoose');

const clubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  fussballDeUrl: { type: String },
  vereinId: { type: String, unique: true, sparse: true },
  isNonProfit: { type: Boolean, default: false },
  freistellungsbescheid: { type: String },
  steuernummer: { type: String },
  freistellungDatum: { type: String },
  adresse: { type: String },
  logo: { type: String },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isApproved: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Club', clubSchema);
