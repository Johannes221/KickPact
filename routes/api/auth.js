const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Club = require('../../models/Club');
const { authLimiter } = require('../../middleware/rateLimiter');

const router = express.Router();

router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, clubName, fussballDeUrl, vereinId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, E-Mail und Passwort erforderlich' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'E-Mail bereits registriert' });

    const allowedRoles = ['sponsor', 'club_admin'];
    const userRole = allowedRoles.includes(role) ? role : 'sponsor';

    const passwordHash = await bcrypt.hash(password, 12);
    const user = new User({ name, email: email.toLowerCase(), passwordHash, role: userRole });
    await user.save();

    if (userRole === 'club_admin' && clubName) {
      const slug = clubName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const club = new Club({
        name: clubName,
        slug: slug + '-' + user._id.toString().slice(-4),
        fussballDeUrl,
        vereinId,
        admins: [user._id],
        isApproved: false,
      });
      await club.save();
      user.clubId = club._id;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name, clubId: user.clubId },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Serverfehler bei Registrierung' });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'E-Mail und Passwort erforderlich' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Ungültige Anmeldedaten' });

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name, clubId: user.clubId },
      process.env.JWT_SECRET || 'dev-secret',
      { expiresIn: '7d' }
    );

    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user._id, email: user.email, role: user.role, name: user.name } });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Serverfehler beim Login' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;
