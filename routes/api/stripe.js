const express = require('express');
const User = require('../../models/User');
const { requireAuth, requireRole } = require('../../middleware/auth');

const router = express.Router();

router.post('/setup-intent', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let user = await User.findById(req.user.id);

    if (!user.stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: user._id.toString() },
      });
      user.stripeCustomerId = customer.id;
      await user.save();
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card', 'sepa_debit'],
      usage: 'off_session',
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: user.stripeCustomerId,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/payment-methods', requireAuth, requireRole('sponsor'), async (req, res) => {
  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const user = await User.findById(req.user.id);
    if (!user.stripeCustomerId) return res.json({ methods: [] });

    const methods = await stripe.paymentMethods.list({
      customer: user.stripeCustomerId,
      type: 'card',
    });
    res.json({ methods: methods.data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
