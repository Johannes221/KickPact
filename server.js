require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ── View Engine ──────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ───────────────────────────────────────────────────────
const { apiLimiter } = require('./middleware/rateLimiter');
app.use('/api', apiLimiter);

app.use('/api/auth', require('./routes/api/auth'));
app.use('/api/crawler', require('./routes/api/crawler'));
app.use('/api/pledges', require('./routes/api/pledges'));
app.use('/api/charges', require('./routes/api/charges'));
app.use('/api/stats', require('./routes/api/stats'));
app.use('/api/stripe', require('./routes/api/stripe'));
app.use('/api/manual-events', require('./routes/api/manualEvents'));
app.use('/api/teams', require('./routes/api/teams'));

app.use('/sponsor', require('./routes/sponsor'));
app.use('/club', require('./routes/club'));
app.use('/', require('./routes/public'));

// ── 404 ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', { message: 'Seite nicht gefunden', user: null });
});

// ── Error Handler ─────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: err.message });
  }
  res.status(500).render('error', { message: err.message, user: null });
});

// ── DB + Start ────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kickpact';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB verbunden');

    const { startCrawlerCron } = require('./cron/crawler');
    const { startBillingCron } = require('./cron/billing');
    startCrawlerCron();
    startBillingCron();

    app.listen(PORT, () => {
      console.log(`⚽ KickPact läuft auf http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB Verbindung fehlgeschlagen:', err.message);
    process.exit(1);
  });
