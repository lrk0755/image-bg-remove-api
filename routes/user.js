/**
 * User Management Routes
 * Pay-as-you-go + Subscription model
 */

const express = require('express');
const router = express.Router();

// Credit packs
const CREDIT_PACKS = {
  starter: { credits: 10, price: 3.00, name: 'Starter Pack', type: 'credits' },
  popular: { credits: 30, price: 6.00, name: 'Popular Pack', type: 'credits' },
  power: { credits: 100, price: 15.00, name: 'Power Pack', type: 'credits' }
};

// Subscription plans
const SUBSCRIPTION_PLANS = {
  monthly: {
    name: 'Monthly',
    price: 9.00,
    interval: 'month',
    unlimited: true,
    monthlyCredits: Infinity,
    quality: 'high',
    historyDays: 30
  },
  yearly: {
    name: 'Yearly',
    price: 79.00,
    interval: 'year',
    unlimited: true,
    monthlyCredits: Infinity,
    quality: 'premium',
    historyDays: 365,
    trialDays: 7
  }
};

// Guest trial: 1 free use with watermark
const MAX_GUEST_TRIALS = 1;

// In-memory stores
const users = new Map();
const guestTrials = new Map();
const usageLogs = [];
const purchaseLogs = [];
const subscriptionLogs = [];

// Export
module.exports = router;
module.exports.users = users;
module.exports.CREDIT_PACKS = CREDIT_PACKS;
module.exports.SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS;

// ============ Quota Checking ============

function checkQuota(userId, ip) {
  if (!userId) {
    const trial = guestTrials.get(ip) || { count: 0 };
    const remaining = MAX_GUEST_TRIALS - trial.count;
    return {
      allowed: remaining > 0,
      watermark: true,
      remaining,
      code: remaining <= 0 ? 'TRIAL_EXCEEDED' : null,
      message: remaining > 0 
        ? `Guest trial: ${remaining} free use${remaining !== 1 ? 's' : ''} left`
        : 'Guest trial exhausted. Sign up for FREE credits!',
      requiresSignup: true,
      requiresPurchase: false,
      guest: true,
      plan: 'guest'
    };
  }
  
  const user = users.get(userId);
  if (!user) {
    return {
      allowed: false,
      watermark: false,
      remaining: 0,
      code: 'USER_NOT_FOUND',
      requiresSignup: false,
      requiresPurchase: true,
      guest: false
    };
  }
  
  // Check subscription first
  if (user.subscription?.active) {
    return {
      allowed: true,
      watermark: false,
      remaining: Infinity,
      unlimited: true,
      code: null,
      message: `${user.subscription.plan} - Unlimited uses`,
      requiresSignup: false,
      requiresPurchase: false,
      guest: false,
      plan: 'subscription',
      subscription: user.subscription
    };
  }
  
  // Pay-as-you-go user
  const credits = user.credits || 0;
  return {
    allowed: credits > 0,
    watermark: false,
    remaining: credits,
    code: credits <= 0 ? 'NO_CREDITS' : null,
    message: credits > 0 
      ? `${credits} credit${credits !== 1 ? 's' : ''} remaining`
      : 'No credits left. Buy more or subscribe!',
    requiresSignup: false,
    requiresPurchase: credits <= 0,
    guest: false,
    plan: 'credits'
  };
}

function trackGuestUsage(ip) {
  const trial = guestTrials.get(ip) || { count: 0, uses: [] };
  trial.count += 1;
  trial.uses.push(Date.now());
  guestTrials.set(ip, trial);
  
  usageLogs.push({
    type: 'guest',
    ip,
    timestamp: new Date().toISOString()
  });
}

function deductCredit(userId) {
  const user = users.get(userId);
  if (user && !user.subscription?.active && user.credits > 0) {
    user.credits -= 1;
    user.totalUsed = (user.totalUsed || 0) + 1;
    
    usageLogs.push({
      type: 'user',
      userId,
      timestamp: new Date().toISOString()
    });
  }
}

// ============ Routes ============

// POST /register - Create/update user
router.post('/register', (req, res) => {
  const { id, email, name, avatar, provider } = req.body;
  
  if (!id || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  let user = users.get(id);
  const isNewUser = !user;
  
  if (isNewUser) {
    user = {
      id,
      email,
      name: name || email.split('@')[0],
      avatar: avatar || '',
      provider: provider || 'google',
      credits: 3,  // Sign up bonus!
      totalPurchased: 0,
      totalUsed: 0,
      subscription: null,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    console.log(`🎉 New user: ${email} (3 FREE credits!)`);
  } else {
    user.lastLogin = new Date().toISOString();
  }
  
  users.set(id, user);
  
  res.json({
    success: true,
    isNewUser,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      credits: user.credits,
      subscription: user.subscription
    }
  });
});

// GET /profile
router.get('/profile', (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.json({ 
      authenticated: false,
      guest: true
    });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.json({ authenticated: false, guest: true });
  }
  
  res.json({
    authenticated: true,
    guest: false,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      credits: user.credits,
      subscription: user.subscription,
      totalPurchased: user.totalPurchased,
      totalUsed: user.totalUsed
    }
  });
});

// GET /quota
router.get('/quota', (req, res) => {
  const userId = req.user?.id;
  const ip = req.ip || req.connection.remoteAddress;
  
  const quota = checkQuota(userId, ip);
  res.json(quota);
});

// GET /packs - Get available packs
router.get('/packs', (req, res) => {
  res.json({
    creditPacks: Object.entries(CREDIT_PACKS).map(([key, val]) => ({ id: key, ...val })),
    subscriptionPlans: Object.entries(SUBSCRIPTION_PLANS).map(([key, val]) => ({ id: key, ...val })),
    currency: 'USD'
  });
});

// POST /purchase/credits - Buy credit pack
router.post('/purchase/credits', (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to purchase' });
  }
  
  const { pack } = req.body;
  const packInfo = CREDIT_PACKS[pack];
  
  if (!packInfo) {
    return res.status(400).json({ error: 'Invalid pack' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  // Demo mode: add credits directly
  user.credits += packInfo.credits;
  user.totalPurchased += packInfo.credits;
  
  purchaseLogs.push({
    userId,
    type: 'credits',
    pack,
    credits: packInfo.credits,
    amount: packInfo.price,
    timestamp: new Date().toISOString()
  });
  
  console.log(`💰 Credit purchase: ${packInfo.name} for ${user.email}`);
  
  res.json({
    success: true,
    creditsPurchased: packInfo.credits,
    totalCredits: user.credits,
    message: `Purchased ${packInfo.name}!`
  });
});

// POST /purchase/subscription - Subscribe
router.post('/purchase/subscription', (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to subscribe' });
  }
  
  const { plan } = req.body;
  const planInfo = SUBSCRIPTION_PLANS[plan];
  
  if (!planInfo) {
    return res.status(400).json({ error: 'Invalid plan' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  // Calculate expiration
  const now = new Date();
  let expiresAt;
  if (planInfo.trialDays) {
    // Yearly has free trial
    expiresAt = new Date(now.getTime() + planInfo.trialDays * 24 * 60 * 60 * 1000);
    user.subscription = {
      plan,
      planName: planInfo.name,
      active: true,
      trial: true,
      trialEndsAt: expiresAt.toISOString(),
      renewsAt: new Date(expiresAt.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
    };
  } else {
    expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    user.subscription = {
      plan,
      planName: planInfo.name,
      active: true,
      trial: false,
      renewsAt: expiresAt.toISOString()
    };
  }
  
  subscriptionLogs.push({
    userId,
    plan,
    amount: planInfo.price,
    timestamp: new Date().toISOString()
  });
  
  console.log(`📅 Subscription: ${planInfo.name} for ${user.email}`);
  
  res.json({
    success: true,
    subscription: user.subscription,
    message: planInfo.trialDays 
      ? `Free trial started! ${planInfo.trialDays} days free, then $${planInfo.price}/${planInfo.interval}`
      : `Subscribed to ${planInfo.name}!`
  });
});

// POST /purchase/cancel - Cancel subscription
router.post('/purchase/cancel', (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  if (user.subscription?.active) {
    user.subscription.cancelled = true;
    user.subscription.cancelledAt = new Date().toISOString();
    
    subscriptionLogs.push({
      userId,
      action: 'cancel',
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Subscription cancelled. Access continues until period end.'
    });
  } else {
    res.status(400).json({ error: 'No active subscription' });
  }
});

// GET /history
router.get('/history', (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to view history' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  const logs = usageLogs.filter(log => log.userId === userId).slice(-20).reverse();
  
  res.json({
    logs,
    totalUsed: user.totalUsed,
    creditsRemaining: user.credits
  });
});
