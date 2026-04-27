const mongoose = require('mongoose');

const manualEventSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match' },
  typ: {
    type: String,
    enum: ['KOPFBALLTOR', 'ELFMETERTOR', 'FREISTOSSTOR', 'GEHALTENER_ELFER', 'DIREKTABNAHME'],
    required: true
  },
  spielerId: { type: String },
  spielerName: { type: String },
  minute: { type: Number },
  eingetragenVon: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvedByClub: { type: Boolean, default: false },
  sponsorApprovals: [{
    sponsorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved: { type: Boolean },
    respondedAt: { type: Date },
  }],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { timestamps: true });

module.exports = mongoose.model('ManualEvent', manualEventSchema);
