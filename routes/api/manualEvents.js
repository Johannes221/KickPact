const express = require('express');
const ManualEvent = require('../../models/ManualEvent');
const Team = require('../../models/Team');
const Club = require('../../models/Club');
const Pledge = require('../../models/Pledge');
const User = require('../../models/User');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { sendManualEventNotification, sendSponsorEventConfirmationRequest } = require('../../services/emailService');

const router = express.Router();

router.post('/', requireAuth, requireRole('team_admin', 'club_admin', 'super_admin'), async (req, res) => {
  try {
    const { teamId, matchId, typ, spielerId, spielerName, minute } = req.body;
    if (!teamId || !typ) return res.status(400).json({ error: 'teamId und typ erforderlich' });

    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ error: 'Team nicht gefunden' });

    const event = new ManualEvent({
      teamId,
      clubId: team.clubId,
      matchId: matchId || null,
      typ,
      spielerId,
      spielerName,
      minute,
      eingetragenVon: req.user.id,
      status: 'pending',
    });
    await event.save();

    const club = await Club.findById(team.clubId);
    for (const adminId of club.admins || []) {
      const admin = await User.findById(adminId);
      if (admin) {
        await sendManualEventNotification(admin, event, team).catch(() => {});
      }
    }

    res.status(201).json(event);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'sponsor') {
      const pledges = await Pledge.find({ sponsorId: req.user.id, status: 'active' });
      const teamIds = pledges.map((p) => p.teamId);
      filter = { teamId: { $in: teamIds }, approvedByClub: true };
    } else if (req.user.role === 'team_admin') {
      filter = { teamId: { $in: req.user.teamIds || [] } };
    } else if (req.user.role === 'club_admin') {
      filter = { clubId: req.user.clubId };
    }

    const events = await ManualEvent.find(filter)
      .populate('teamId', 'name')
      .populate('eingetragenVon', 'name')
      .sort({ createdAt: -1 });
    res.json(events);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/approve', requireAuth, requireRole('club_admin', 'super_admin'), async (req, res) => {
  try {
    const event = await ManualEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Nicht gefunden' });

    event.approvedByClub = true;
    event.status = 'approved';
    await event.save();

    const team = await Team.findById(event.teamId);
    const pledges = await Pledge.find({ teamId: event.teamId, status: 'active' });
    const sponsorIds = [...new Set(pledges.map((p) => p.sponsorId.toString()))];

    for (const sponsorId of sponsorIds) {
      const sponsor = await User.findById(sponsorId);
      if (sponsor) {
        await sendSponsorEventConfirmationRequest(sponsor, event, team).catch(() => {});
      }
      event.sponsorApprovals.push({ sponsorId, approved: null, respondedAt: null });
    }
    await event.save();

    res.json({ success: true, event });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/reject', requireAuth, requireRole('club_admin', 'super_admin'), async (req, res) => {
  try {
    const event = await ManualEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Nicht gefunden' });

    event.approvedByClub = false;
    event.status = 'rejected';
    await event.save();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id/sponsor-confirm', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const { approved } = req.body;
    const event = await ManualEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Nicht gefunden' });

    const approval = event.sponsorApprovals.find(
      (a) => a.sponsorId.toString() === req.user.id
    );
    if (!approval) return res.status(403).json({ error: 'Kein Approval-Eintrag für diesen Sponsor' });

    approval.approved = !!approved;
    approval.respondedAt = new Date();
    await event.save();

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
