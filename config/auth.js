module.exports = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET',
    callbackURL: '/auth/google/callback'
  },
  session: {
    secret: process.env.SESSION_SECRET || 'image-bg-remove-api-secret',
    maxAge: 24 * 60 * 60 * 1000
  }
};