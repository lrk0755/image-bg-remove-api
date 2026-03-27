/**
 * Image Background Remove - API Server
 * Pay-as-you-go model with Google OAuth
 * 
 * User Flow:
 * - Guest: 1 free use with watermark
 * - Sign up: 3 FREE credits
 * - Buy credits: $3/10, $6/30 (best), $15/100
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
const passport = require('passport');
const authRoutes = require('../routes/auth');
const userRoutes = require('../routes/user');
const { checkQuota, trackGuestUsage, deductCredit, users } = require('../routes/user');

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'image-bg-remove-api-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

// Configuration
const config = {
  port: process.env.PORT || 3001,
  removeBgApiKey: process.env.REMOVE_BG_API_KEY || '1teo3E5gQ5Rk82dN7CCXFZ1G',
  removeBgEndpoint: 'https://api.remove.bg/v1.0/removebg',
  
  // Stripe configuration
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  
  // Credit packs pricing
  creditPacks: {
    starter: { credits: 10, price: 3.00, name: 'Starter Pack' },
    popular: { credits: 30, price: 6.00, name: 'Popular Pack' },
    power: { credits: 100, price: 15.00, name: 'Power Pack' }
  }
};

// Create Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('client'));
app.use(session(sessionConfig));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/user', userRoutes);

// Passport config
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ============ API Endpoints ============

// Get API status
app.get('/api/status', (req, res) => {
  res.json({ 
    status: 'running',
    authenticated: req.isAuthenticated ? req.isAuthenticated() : false
  });
});

// Get configuration (public info)
app.get('/api/config', (req, res) => {
  res.json({
    mode: 'api',
    creditPacks: config.creditPacks,
    hasStripe: !!config.stripeSecretKey
  });
});

// ============ Credit Purchase (Stripe) ============

// Create Stripe checkout session
app.post('/api/purchase/create-session', async (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ error: 'Please sign in to purchase credits' });
  }
  
  const { pack } = req.body;
  const packInfo = config.creditPacks[pack];
  
  if (!packInfo) {
    return res.status(400).json({ error: 'Invalid pack' });
  }
  
  if (!config.stripeSecretKey) {
    // Demo mode - simulate purchase
    const user = users.get(req.user.id);
    if (user) {
      user.credits += packInfo.credits;
      user.totalPurchased += packInfo.credits;
    }
    return res.json({
      success: true,
      demo: true,
      creditsPurchased: packInfo.credits,
      totalCredits: user?.credits || 0,
      message: `Demo: Added ${packInfo.credits} credits!`
    });
  }
  
  try {
    const stripe = require('stripe')(config.stripeSecretKey);
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `AI Background Remover - ${packInfo.name}`,
            description: `${packInfo.credits} credits for image background removal`
          },
          unit_amount: Math.round(packInfo.price * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${req.headers.origin}/?payment=success&credits=${packInfo.credits}`,
      cancel_url: `${req.headers.origin}/pricing?payment=cancelled`,
      metadata: {
        userId: req.user.id,
        pack: pack,
        credits: packInfo.credits.toString()
      }
    });
    
    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: 'Payment service error' });
  }
});

// Stripe webhook
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!config.stripeSecretKey) {
    return res.json({ received: true });
  }
  
  const stripe = require('stripe')(config.stripeSecretKey);
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      config.stripeWebhookSecret
    );
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const { userId, credits } = session.metadata;
      
      const user = users.get(userId);
      if (user) {
        user.credits += parseInt(credits);
        user.totalPurchased += parseInt(credits);
        console.log(`✅ Added ${credits} credits to user ${userId}`);
      }
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ============ Background Removal ============

// Process image
app.post('/api/remove-bg', async (req, res) => {
  try {
    const { image, imageUrl } = req.body;
    const userId = req.user?.id;
    const ip = req.ip || req.connection.remoteAddress;
    
    // Check quota
    const quotaResult = checkQuota(userId, ip);
    
    if (!quotaResult.allowed) {
      return res.status(429).json({
        error: quotaResult.message,
        code: quotaResult.code,
        requiresSignup: quotaResult.requiresSignup,
        requiresPurchase: quotaResult.requiresPurchase,
        credits: 0
      });
    }
    
    // Get image buffer
    let buffer;
    if (image) {
      buffer = Buffer.from(image, 'base64');
    } else if (imageUrl) {
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 30000 });
      buffer = Buffer.from(response.data);
    } else {
      return res.status(400).json({ error: 'Please provide image (base64 or URL)' });
    }
    
    console.log('🤖 Processing image...');
    const startTime = Date.now();
    
    // Call remove.bg API
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('image_file', buffer, { filename: 'image.png', contentType: 'image/png' });
    formData.append('size', 'auto');
    
    const response = await axios.post(config.removeBgEndpoint, formData, {
      headers: { 'X-Api-Key': config.removeBgApiKey, ...formData.getHeaders() },
      responseType: 'arraybuffer'
    });
    
    const resultBuffer = Buffer.from(response.data);
    const resultBase64 = resultBuffer.toString('base64');
    
    // Deduct credit (for non-guest users)
    if (quotaResult.guest) {
      // Track guest usage
      trackGuestUsage(ip);
    } else {
      deductCredit(userId);
    }
    
    console.log(`✅ Done! Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    
    res.json({ 
      image: resultBase64,
      format: 'png',
      watermark: quotaResult.watermark,
      remainingCredits: quotaResult.remaining
    });
    
  } catch (error) {
    console.error('Processing failed:', error.message);
    res.status(500).json({ error: error.message || 'Processing failed, please try again' });
  }
});

// Start server
app.listen(config.port, '0.0.0.0', () => {
  console.log(`✅ Image Background Remove Server started on port ${config.port}`);
  console.log(`📦 Credit Packs:`, config.creditPacks);
  console.log(`💳 Stripe: ${config.stripeSecretKey ? 'configured' : 'demo mode'}`);
});

module.exports = app;
