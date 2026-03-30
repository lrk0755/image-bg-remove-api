#!/bin/bash
# ============================================================
# Image-Bg-Remove-API - Cloudflare 部署初始化脚本
# 运行环境: 在项目 pages/ 目录下执行
# 需要先安装 wrangler: npm install -g wrangler
# ============================================================

set -e

echo "=========================================="
echo "🚀 Image-Bg-Remove-API 部署初始化"
echo "=========================================="

# 1. 写入 PayPal Secret
echo ""
echo "📌 Step 1/2: 写入 PayPal Client ID 和 Secret..."
echo "   (wrangler 会提示输入值，按提示粘贴即可)"
echo ""

echo -n "请粘贴 PayPal Client ID (沙盒): "
read PAYPAL_CLIENT_ID
wrangler secret put PAYPAL_CLIENT_ID --name image-bg-remove-api <<< "$PAYPAL_CLIENT_ID"
echo "✅ PAYPAL_CLIENT_ID 已写入"

echo ""
echo -n "请粘贴 PayPal Client Secret (沙盒): "
read PAYPAL_CLIENT_SECRET
wrangler secret put PAYPAL_CLIENT_SECRET --name image-bg-remove-api <<< "$PAYPAL_CLIENT_SECRET"
echo "✅ PAYPAL_CLIENT_SECRET 已写入"

# 2. 初始化 D1 表结构
echo ""
echo "📌 Step 2/2: 初始化 D1 数据库表结构..."
echo ""

SQL_CONTENT="
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
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  order_id TEXT UNIQUE NOT NULL,
  pack_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'completed',
  created_at TEXT DEFAULT (datetime('now', 'utc'))
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
"

echo "$SQL_CONTENT" | wrangler d1 execute image-bg-remove-db --remote --command -
echo "✅ D1 表结构初始化完成"

# 3. 部署
echo ""
echo "📌 Step 3: 推送到 GitHub 并触发 Cloudflare 部署..."
echo "   请在 GitHub 仓库设置中启用 Cloudflare Pages 自动部署"
echo "   或者手动运行: wrangler pages deploy"
echo ""

echo "=========================================="
echo "✅ 初始化完成!"
echo "=========================================="
echo ""
echo "💡 提示:"
echo "   - 部署后访问 https://img.bgremove.sbs"
echo "   - 管理后台: /admin.html"
echo "   - 沙盒测试: 使用 PayPal 沙盒账户登录 https://developer.paypal.com"
echo ""
