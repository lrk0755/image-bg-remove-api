// User Management API - Pay As You Go Model
const express = require('express');
const router = express.Router();

// Permission Tiers
const PERMISSIONS = {
  guest: {
    name: 'Guest',
    trialUses: 1,
    trialWatermark: true,
    freeCredits: 0,
    quality: 'standard'
  },
  free: {
    name: 'Free',
    signupCredits: 3,
    quality: 'high',
    history: 30
  }
};

// Check if user is guest
function isGuest(req) {
  return !req.headers['x-user-id'];
}

// Guest trial tracking (in-memory for demo)
const guestTrials = new Map();
const MAX_GUEST_TRIALS = 1;

// Check quota
function checkQuota(user, ip) {
  if (!user) {
    // Guest user
    const trial = guestTrials.get(ip) || { count: 0 };
    const remaining = MAX_GUEST_TRIALS - trial.count;
    return {
      tier: 'guest',
      allowed: remaining > 0,
      watermark: true,
      remaining: remaining,
      message: remaining > 0 
        ? `Guest trial: ${remaining} free use${remaining !== 1 ? 's' : ''} left`
        : 'Guest trial exhausted. Sign up for 3 FREE credits!'
    };
  }
  
  // Logged in user
  const credits = user.credits || 0;
  
  if (credits <= 0) {
    return {
      tier: 'free',
      allowed: false,
      watermark: false,
      remaining: 0,
      message: 'No credits left. Buy more to continue!'
    };
  }
  
  return {
    tier: 'free',
    allowed: true,
    watermark: false,
    remaining: credits,
    message: `${credits} credit${credits !== 1 ? 's' : ''} remaining`
  };
}

// POST /register - Create account or update
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
      credits: 3,  // Sign up bonus
      totalPurchased: 0,
      totalUsed: 0,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
  } else {
    // Already exists, just update login
    user.lastLogin = new Date().toISOString();
  }
  
  users.set(id, user);
  
  res.json({
    success: true,
    isNewUser: isNewUser,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      credits: user.credits,
      permissions: PERMISSIONS.free
    }
  });
});

// GET /profile
router.get('/profile', (req, res) => {
  const userId = req.headers['x-user-id'];
  
  if (!userId) {
    return res.json({ 
      authenticated: false,
      guest: true,
      permissions: PERMISSIONS.guest
    });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.json({ 
      authenticated: false,
      guest: true,
      permissions: PERMISSIONS.guest
    });
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
      totalUsed: user.totalUsed,
      createdAt: user.createdAt,
      permissions: PERMISSIONS.free
    }
  });
});

// GET /quota
router.get('/quota', (req, res) => {
  const userId = req.headers['x-user-id'];
  const ip = req.ip || req.connection.remoteAddress;
  
  const quota = checkQuota(userId ? users.get(userId) : null, ip);
  
  res.json({
    ...quota,
    guest: !userId,
    requiresSignup: !userId && quota.remaining <= 0,
    requiresPurchase: !!userId && !quota.allowed
  });
});

// POST /use - Use a credit
router.post('/use', (req, res) => {
  const userId = req.headers['x-user-id'];
  const ip = req.ip || req.connection.remoteAddress;
  const { action = 'remove_bg' } = req.body;
  
  // Guest user
  if (!userId) {
    const trial = guestTrials.get(ip) || { count: 0 };
    
    if (trial.count >= MAX_GUEST_TRIALS) {
      return res.status(429).json({
        error: 'Guest trial limit reached',
        code: 'TRIAL_EXCEEDED',
        message: 'Sign up now for 3 FREE credits!',
        requiresSignup: true,
        watermark: true
      });
    }
    
    trial.count += 1;
    guestTrials.set(ip, trial);
    
    usageLogs.push({
      type: 'guest',
      ip: ip,
      action,
      watermark: true,
      timestamp: new Date().toISOString()
    });
    
    return res.json({
      success: true,
      watermark: true,
      remaining: MAX_GUEST_TRIALS - trial.count,
      guest: true
    });
  }
  
  // Logged in user
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  if (user.credits <= 0) {
    return res.status(429).json({
      error: 'No credits left',
      code: 'NO_CREDITS',
      message: 'Purchase more credits to continue',
      requiresPurchase: true,
      watermark: false
    });
  }
  
  user.credits -= 1;
  user.totalUsed = (user.totalUsed || 0) + 1;
  
  usageLogs.push({
    type: 'user',
    userId,
    action,
    credits: 1,
    watermark: false,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    watermark: false,
    remaining: user.credits,
    userId: user.id
  });
});

// GET /history
router.get('/history', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { limit = 20 } = req.query;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to view history' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  const logs = usageLogs
    .filter(log => log.userId === userId)
    .slice(-limit)
    .reverse();
  
  res.json({
    logs,
    totalUsed: user.totalUsed,
    creditsRemaining: user.credits
  });
});

// POST /purchase - Buy credits
router.post('/purchase', (req, res) => {
  const userId = req.headers['x-user-id'];
  const { pack, paymentMethod } = req.body;
  
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to purchase' });
  }
  
  const user = users.get(userId);
  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }
  
  // Credit packs
  const packs = {
    small: { credits: 10, price: 3.00 },
    medium: { credits: 30, price: 6.00 },
    large: { credits: 100, price: 15.00 }
  };
  
  if (!packs[pack]) {
    return res.status(400).json({ error: 'Invalid pack' });
  }
  
  const selectedPack = packs[pack];
  
  // In production, this would integrate with Stripe
  // For demo, simulate successful purchase
  
  user.credits += selectedPack.credits;
  user.totalPurchased += selectedPack.credits;
  
  purchaseLogs.push({
    userId,
    pack,
    credits: selectedPack.credits,
    amount: selectedPack.price,
    paymentMethod,
    timestamp: new Date().toISOString()
  });
  
  res.json({
    success: true,
    creditsPurchased: selectedPack.credits,
    totalCredits: user.credits,
    message: `Successfully purchased ${selectedPack.credits} credits!`
  });
});

module.exports = router;
