-- Image-Bg-Remove-API Database Schema
-- Pay As You Go Model

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar TEXT,
  provider TEXT DEFAULT 'google',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  
  -- Credit system (pay as you go)
  credits INTEGER DEFAULT 3,           -- Initial 3 free credits
  total_purchased INTEGER DEFAULT 0,  -- Total credits purchased
  total_used INTEGER DEFAULT 0         -- Total credits consumed
);

-- Guest Trials (IP-based tracking)
CREATE TABLE IF NOT EXISTS guest_trials (
  ip_address TEXT PRIMARY KEY,
  uses_count INTEGER DEFAULT 0,
  last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Usage Logs
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  session_id TEXT,
  action TEXT,                    -- 'remove_bg', 'batch'
  credits_used INTEGER DEFAULT 1,
  watermark BOOLEAN DEFAULT FALSE,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Credit Packs (for reference)
CREATE TABLE IF NOT EXISTS credit_packs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  price_usd REAL NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Insert default packs
INSERT OR REPLACE INTO credit_packs (id, name, credits, price_cents, price_usd) VALUES
  ('small', 'Starter', 10, 300, 3.00),
  ('medium', 'Popular', 30, 600, 6.00),
  ('large', 'Best Value', 100, 1500, 15.00);

-- Purchases
CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  pack_id TEXT,
  credits INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  amount_usd REAL NOT NULL,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'completed',
  stripe_payment_intent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Settings
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT PRIMARY KEY,
  theme TEXT DEFAULT 'light',
  default_format TEXT DEFAULT 'png',
  auto_download BOOLEAN DEFAULT TRUE,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_logs_user ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_created ON usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases(user_id);
