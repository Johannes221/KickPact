const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  fussballDePlayerId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  cachedAt: { type: Date, default: Date.now },
});

playerSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('Player', playerSchema);
