/**
 * User Management Routes
 * Pay-as-you-go model only
 */

const express = require('express');
const router = express.Router();

// Credit packs
const CREDIT_PACKS = {
  starter: { credits: 10, price: 3.00, name: 'Starter Pack', type: 'credits' },
  popular: { credits: 30, price: 6.00, name: 'Popular Pack', type: 'credits' },
  power: { credits: 100, price: 15.00, name: 'Power Pack', type: 'credits' }
};

// Guest trial: 1 free use with watermark
const MAX_GUEST_TRIALS = 1;

// In-memory stores
const users = new Map();
const guestTrials = new Map();
const usageLogs = [];

// Export
module.exports = router;
module.exports.users = users;
module.exports.CREDIT_PACKS = CREDIT_PACKS;

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
  
  // Pay-as-you-go user
  const credits = user.credits || 0;
  return {
    allowed: credits > 0,
    watermark: false,
    remaining: credits,
    code: credits <= 0 ? 'NO_CREDITS' : null,
    message: credits > 0 
      ? `${credits} credit${credits !== 1 ? 's' : ''} remaining`
      : 'No credits left. Buy more credits!',
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
  if (user && user.credits > 0) {
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
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    console.log(`New user: ${email} (3 FREE credits!)`);
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
      credits: user.credits
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
  
  console.log(`Credit purchase: ${packInfo.name} for ${user.email}`);
  
  res.json({
    success: true,
    creditsPurchased: packInfo.credits,
    totalCredits: user.credits,
    message: `Purchased ${packInfo.name}!`
  });
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
