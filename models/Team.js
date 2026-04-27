const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  fussballDeTeamId: { type: String, unique: true, sparse: true },
  fussballDeUrl: { type: String },
  saison: { type: String, default: '2526' },
  admins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  lastCrawled: { type: Date },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true });

module.exports = mongoose.model('Team', teamSchema);
