-- ============================================================
-- Image-Bg-Remove-API D1 Database Schema
-- Run with: wrangler d1 execute image-bg-remove-db --file=./_init.sql
-- Or via Cloudflare Dashboard: D1 → image-bg-remove-db → Query
-- ============================================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  credits INTEGER DEFAULT 0,
  total_purchased INTEGER DEFAULT 0,
  total_used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'utc')),
  updated_at TEXT DEFAULT (datetime('now', 'utc'))
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now', 'utc')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
