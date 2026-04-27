const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  passwordHash: { type: String, required: true },
  role: {
    type: String,
    enum: ['super_admin', 'club_admin', 'team_admin', 'sponsor'],
    required: true,
    default: 'sponsor'
  },
  name: { type: String, required: true },
  phone: { type: String },
  stripeCustomerId: { type: String },
  clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club' },
  teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
