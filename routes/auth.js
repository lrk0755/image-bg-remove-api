const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const authConfig = require('../config/auth');

const router = express.Router();

// Import user store for auto-registration
let users;
try {
  users = require('./user').users;
} catch (e) {
  users = new Map();
}

// Configure Passport Google Strategy
passport.use(new GoogleStrategy({
    clientID: authConfig.google.clientID,
    clientSecret: authConfig.google.clientSecret,
    callbackURL: authConfig.google.callbackURL
  },
  (accessToken, refreshToken, profile, done) => {
    const user = {
      id: profile.id,
      displayName: profile.displayName,
      email: profile.emails ? profile.emails[0].value : '',
      avatar: profile.photos ? profile.photos[0].value : ''
    };
    
    // Auto-register user on first login
    if (users && !users.has(user.id)) {
      users.set(user.id, {
        id: user.id,
        email: user.email,
        name: user.displayName,
        avatar: user.avatar,
        provider: 'google',
        credits: 3,  // Sign up bonus!
        totalPurchased: 0,
        totalUsed: 0,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString()
      });
      console.log(`🎉 New user registered via OAuth: ${user.email} (3 FREE credits!)`);
    } else if (users) {
      const existingUser = users.get(user.id);
      if (existingUser) {
        existingUser.lastLogin = new Date().toISOString();
      }
    }
    
    return done(null, user);
  }
));

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user.id);  // Serialize just the ID
});

passport.deserializeUser((id, done) => {
  // Find user by ID
  if (users && users.has(id)) {
    done(null, users.get(id));
  } else {
    done(null, { id });
  }
});

// Login route
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Callback route - redirect to home
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    // Successful authentication, redirect to home
    res.redirect('/?auth=success');
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// Check login status
router.get('/status', (req, res) => {
  if (req.isAuthenticated() && req.user) {
    const userId = req.user.id || req.user;
    const user = users ? users.get(userId) : null;
    
    res.json({
      isAuthenticated: true,
      user: {
        id: userId,
        name: req.user.displayName || req.user.name || '',
        email: req.user.email || '',
        avatar: req.user.avatar || '',
        credits: user?.credits || 0
      }
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

module.exports = router;
