const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const authConfig = require('../config/auth');

const router = express.Router();

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
    return done(null, user);
  }
));

// Serialize user
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Login route
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Callback route
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=failed' }),
  (req, res) => {
    res.redirect('/?auth=success');
  }
);

// Logout route
router.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Check login status
router.get('/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({
      isAuthenticated: true,
      user: {
        name: req.user.displayName,
        email: req.user.email,
        avatar: req.user.avatar
      }
    });
  } else {
    res.json({ isAuthenticated: false });
  }
});

module.exports = router;