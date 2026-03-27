-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  provider TEXT DEFAULT 'google',
  credits INTEGER DEFAULT 0,
  total_purchased INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT DEFAULT (datetime('now'))
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Guest trials table (for tracking anonymous users)
CREATE TABLE IF NOT EXISTS guest_trials (
  ip TEXT PRIMARY KEY,
  trial_count INTEGER DEFAULT 0,
  first_trial TEXT DEFAULT (datetime('now')),
  last_trial TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);
