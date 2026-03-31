/**
 * _worker.js - Advanced Mode: single Worker handles all /api/* routes
 * All other routes fall through to static asset serving via env.ASSETS
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only handle /api/* routes here; everything else = static assets
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    const path = url.pathname.replace('/api/', '') || '';
    const method = request.method;

    try {
      // ─── GET /api/quota ───────────────────────────────────────────
      if (method === 'GET' && (path === 'quota' || path === 'quota/')) {
        return handleQuota(request, env);
      }

      // ─── GET /api/purchases ───────────────────────────────────────
      if (method === 'GET' && (path === 'purchases' || path === 'purchases/')) {
        return handlePurchases(request, env);
      }

      // ─── GET /api/config ─────────────────────────────────────────
      if (method === 'GET' && (path === 'config' || path === 'config/')) {
        return handleConfig(request, env);
      }

      // ─── GET /api/admin-stats ────────────────────────────────────
      if (method === 'GET' && (path === 'admin-stats' || path === 'admin-stats/')) {
        return handleAdminStats(request, env);
      }

      // ─── GET /api/user/profile ───────────────────────────────────
      if (method === 'GET' && (path === 'user/profile' || path === 'user/profile/')) {
        return handleUserProfile(request, env);
      }

      // ─── GET /api/user/quota ─────────────────────────────────────
      if (method === 'GET' && (path === 'user/quota' || path === 'user/quota/')) {
        return handleUserQuota(request, env);
      }

      // ─── POST /api/add-credits ───────────────────────────────────
      if (method === 'POST' && (path === 'add-credits' || path === 'add-credits/')) {
        return handleAddCredits(request, env);
      }

      // ─── POST /api/restore-credits ───────────────────────────────
      if (method === 'POST' && (path === 'restore-credits' || path === 'restore-credits/')) {
        return handleRestoreCredits(request, env);
      }

      // ─── POST /api/paypal (create order) ─────────────────────────
      if (method === 'POST' && (path === 'paypal' || path === 'paypal/')) {
        return handlePaypalCreate(request, env);
      }

      // ─── PUT /api/paypal (capture order) ────────────────────────
      if (method === 'PUT' && (path === 'paypal' || path === 'paypal/')) {
        return handlePaypalCapture(request, env);
      }

      // ─── POST /api/remove-bg ─────────────────────────────────────
      if (method === 'POST' && (path === 'remove-bg' || path === 'remove-bg/')) {
        return handleRemoveBg(request, env);
      }

      // ─── POST /api/user/register ─────────────────────────────────
      if (method === 'POST' && (path === 'user/register' || path === 'user/register/')) {
        return handleUserRegister(request, env);
      }

      // ─── POST /api/user-register (legacy) ───────────────────────
      if (method === 'POST' && (path === 'user-register' || path === 'user-register/')) {
        return handleUserRegisterLegacy(request, env);
      }

      // ─── 404 ────────────────────────────────────────────────────
      return jsonResponse({ error: 'Not found', path, method }, 404);

    } catch (err) {
      console.error('[_worker] Unhandled error:', err);
      return jsonResponse({ error: 'Internal server error', message: err.message }, 500);
    }
  }
};

// ─── Utility ────────────────────────────────────────────────────────────────

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

function corsHeaders(methods = 'GET, POST, PUT, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function optionsResponse(methods = 'GET, POST, PUT, OPTIONS') {
  return new Response(null, { headers: corsHeaders(methods) });
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleQuota(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();

  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || request.headers.get('X-User-Id');

  if (!userId) {
    return jsonResponse({
      allowed: true, watermark: true, remaining: 1,
      guest: true, plan: 'guest', message: 'Guest trial: 1 free use left'
    });
  }

  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) {
    return jsonResponse({
      allowed: false, watermark: false, remaining: 0,
      code: 'USER_NOT_FOUND', guest: false, requiresPurchase: true
    });
  }

  return jsonResponse({
    allowed: user.credits > 0,
    watermark: false,
    remaining: user.credits,
    code: user.credits <= 0 ? 'NO_CREDITS' : null,
    guest: false, plan: 'credits',
    user: { id: user.id, email: user.email, name: user.name }
  });
}

async function handleAddCredits(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');

  const { userId, credits, orderId, packId, amount } = await request.json();

  if (!userId) return jsonResponse({ success: false, error: 'USER_ID_MISSING', message: 'User not logged in' }, 401);
  if (!credits || !orderId) return jsonResponse({ success: false, error: 'MISSING_FIELDS' }, 400);

  const creditPacks = { starter: { credits: 10, price: 3.00 }, popular: { credits: 30, price: 6.00 }, power: { credits: 100, price: 15.00 } };
  const creditsToAdd = (packId && creditPacks[packId]) ? creditPacks[packId].credits : parseInt(credits, 10);
  const paymentAmount = (packId && creditPacks[packId]) ? creditPacks[packId].price : parseFloat(amount || 0);

  const existingPayment = await env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(orderId).first();
  if (existingPayment) {
    return jsonResponse({ success: true, creditsAdded: 0, message: 'Payment already processed' });
  }

  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!existingUser) {
    await env.DB.prepare(
      `INSERT INTO users (id, email, credits, total_purchased, total_used, created_at, updated_at)
       VALUES (?, ?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))`
    ).bind(userId, `user_${userId}@placeholder.local`).run();
  }

  await env.DB.prepare(
    'INSERT INTO payments (user_id, order_id, pack_id, credits, amount, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, orderId, packId || 'unknown', creditsToAdd, paymentAmount, 'completed').run();

  const updateResult = await env.DB.prepare(
    'UPDATE users SET credits = credits + ?, total_purchased = total_purchased + ?, updated_at = datetime(\'now\', \'utc\') WHERE id = ?'
  ).bind(creditsToAdd, creditsToAdd, userId).run();

  if (updateResult.meta?.changes === 0) {
    throw new Error(`Failed to update credits for user ${userId}`);
  }

  const updatedUser = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(userId).first();
  console.log(`[add-credits] SUCCESS: Added ${creditsToAdd} credits to user ${userId}. Order: ${orderId}. New balance: ${updatedUser?.credits}`);

  return jsonResponse({ success: true, creditsAdded: creditsToAdd, totalCredits: updatedUser?.credits || creditsToAdd });
}

async function handleRestoreCredits(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');

  const { orderId, userId } = await request.json();
  if (!orderId || !userId) return jsonResponse({ success: false, error: 'orderId and userId required' }, 400);

  const existingPayment = await env.DB.prepare('SELECT * FROM payments WHERE order_id = ?').bind(orderId).first();
  if (existingPayment) {
    const user = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(userId).first();
    return jsonResponse({ success: true, alreadyProcessed: true, currentBalance: user?.credits || 0 });
  }

  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return jsonResponse({ success: false, error: 'PayPal not configured' }, 500);

  const paypalEnv = env.PAYPAL_ENV === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const tokenResp = await fetch(`https://${paypalEnv}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!tokenResp.ok) throw new Error('Failed to get PayPal access token');
  const { access_token } = await tokenResp.json();

  const orderResp = await fetch(`https://${paypalEnv}/v2/checkout/orders/${orderId}`, {
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' }
  });
  if (!orderResp.ok) throw new Error('Could not verify payment with PayPal');

  const orderData = await orderResp.json();
  const { status: paymentStatus } = orderData;
  const customData = orderData.purchase_units?.[0]?.custom_id ? JSON.parse(orderData.purchase_units[0].custom_id) : null;
  const amount = orderData.purchase_units?.[0]?.amount?.value;

  if (paymentStatus !== 'COMPLETED' && paymentStatus !== 'CAPTURED') {
    return jsonResponse({ success: false, error: `Payment not completed. Status: ${paymentStatus}` });
  }

  const creditPacks = { starter: { credits: 10 }, popular: { credits: 30 }, power: { credits: 100 } };
  const packId = customData?.packId || 'unknown';
  const creditsToAdd = (creditPacks[packId]?.credits) || parseInt(customData?.credits) || Math.round(parseFloat(amount || 0) * 10);

  const existingRestoreUser = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first();
  if (!existingRestoreUser) {
    await env.DB.prepare(
      `INSERT INTO users (id, email, credits, total_purchased, total_used, created_at, updated_at)
       VALUES (?, ?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))`
    ).bind(userId, `user_${userId}@placeholder.local`).run();
  }

  await env.DB.prepare(
    'INSERT INTO payments (user_id, order_id, pack_id, credits, amount, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(userId, orderId, packId, creditsToAdd, parseFloat(amount || 0), 'completed').run();

  await env.DB.prepare('UPDATE users SET credits = credits + ?, total_purchased = total_purchased + ? WHERE id = ?')
    .bind(creditsToAdd, creditsToAdd, userId).run();

  const updatedUser = await env.DB.prepare('SELECT credits FROM users WHERE id = ?').bind(userId).first();
  console.log(`[restore-credits] SUCCESS: Restored ${creditsToAdd} credits for order ${orderId}`);

  return jsonResponse({ success: true, creditsAdded: creditsToAdd, currentBalance: updatedUser?.credits || creditsToAdd });
}

async function handlePaypalCreate(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');

  const { pack, userId } = await request.json();
  const paypalEnv = env.PAYPAL_ENV === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
  const creditPacks = { starter: { credits: 10, price: 3.00, name: 'Starter Pack' }, popular: { credits: 30, price: 6.00, name: 'Popular Pack' }, power: { credits: 100, price: 15.00, name: 'Power Pack' } };
  const packInfo = creditPacks[pack];
  if (!packInfo) return jsonResponse({ error: 'Invalid pack' }, 400);
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return jsonResponse({ error: 'Payment service not configured' }, 500);

  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const tokenResp = await fetch(`https://${paypalEnv}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  if (!tokenResp.ok) throw new Error('Failed to get PayPal access token');
  const { access_token } = await tokenResp.json();

  const orderResp = await fetch(`https://${paypalEnv}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json',
      'PayPal-Request-Id': `ORDER-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        reference_id: pack,
        description: `${packInfo.name} - ${packInfo.credits} credits`,
        amount: { currency_code: 'USD', value: packInfo.price.toFixed(2) },
        custom_id: JSON.stringify({ userId, packId: pack, credits: packInfo.credits })
      }],
      application_context: {
        brand_name: 'AI Background Remover', landing_page: 'BILLING', user_action: 'PAY_NOW',
        return_url: `${env.URL || ''}/pages/pricing.html?payment=success`,
        cancel_url: `${env.URL || ''}/pages/pricing.html?payment=cancelled`
      }
    })
  });
  if (!orderResp.ok) throw new Error('Failed to create PayPal order');
  const orderData = await orderResp.json();

  return jsonResponse({ orderId: orderData.id, approveUrl: orderData.links.find(l => l.rel === 'approve').href });
}

async function handlePaypalCapture(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('PUT, OPTIONS');

  const { orderId } = await request.json();
  if (!orderId) return jsonResponse({ error: 'Order ID required' }, 400);

  const paypalEnv = env.PAYPAL_ENV === 'live' ? 'api-m.paypal.com' : 'api-m.sandbox.paypal.com';
  const auth = Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const tokenResp = await fetch(`https://${paypalEnv}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials'
  });
  const { access_token } = await tokenResp.json();

  const captureResp = await fetch(`https://${paypalEnv}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' }
  });
  if (!captureResp.ok) throw new Error('Payment capture failed');
  const captureData = await captureResp.json();

  const creditPacks = { starter: 10, popular: 30, power: 100 };
  const credits = creditPacks[captureData.purchase_units?.[0]?.reference_id] || 10;

  return jsonResponse({ success: true, credits, orderId: captureData.id, status: captureData.status });
}

async function handleRemoveBg(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');

  const formData = await request.formData();
  const imageFile = formData.get('image');
  if (!imageFile) return jsonResponse({ error: 'No image provided' }, 400);

  const imageBuffer = await imageFile.arrayBuffer();
  const uint8Array = new Uint8Array(imageBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) binary += String.fromCharCode(uint8Array[i]);
  const base64 = btoa(binary);

  const apiKey = env.REMOVE_BG_API_KEY || '1teo3E5gQ5Rk82dN7CCXFZ1G';
  const response = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_file_b64: base64, size: 'auto' })
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(error, { status: response.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }

  const resultBuffer = await response.arrayBuffer();
  return new Response(resultBuffer, {
    headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="removed-bg.png"', 'Access-Control-Allow-Origin': '*' }
  });
}

async function handlePurchases(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();
  const userId = new URL(request.url).searchParams.get('userId');
  if (!userId) return jsonResponse({ error: 'userId required' }, 400);
  const purchases = await env.DB.prepare(
    'SELECT id, pack_id, credits, amount, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(userId).all();
  return jsonResponse({ purchases: purchases?.results || [] });
}

async function handleConfig(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();
  return jsonResponse({ paypalClientId: env.PAYPAL_CLIENT_ID || '', apiBase: env.API_BASE || '' });
}

async function handleAdminStats(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();
  const totalUsers = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
  const totalCredits = await env.DB.prepare('SELECT COALESCE(SUM(credits), 0) as total FROM payments').first();
  const totalRevenue = await env.DB.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments').first();
  const recentPayments = await env.DB.prepare(
    'SELECT p.*, u.email FROM payments p LEFT JOIN users u ON p.user_id = u.id ORDER BY p.created_at DESC LIMIT 20'
  ).all();
  const recentUsers = await env.DB.prepare(
    'SELECT id, email, name, credits, total_purchased, total_used, created_at FROM users ORDER BY created_at DESC LIMIT 50'
  ).all();
  return jsonResponse({
    totalUsers: totalUsers?.count || 0, totalCreditsSold: totalCredits?.total || 0,
    totalRevenue: totalRevenue?.total || 0, payments: recentPayments?.results || [], users: recentUsers?.results || []
  });
}

async function handleUserProfile(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();
  const userId = request.headers.get('X-User-Id');
  if (!userId) return jsonResponse({ authenticated: false, error: 'No user ID' });
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return jsonResponse({ authenticated: false, error: 'User not found' });
  return jsonResponse({
    authenticated: true,
    user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, credits: user.credits, isPro: user.credits > 0 }
  });
}

async function handleUserQuota(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse();
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId') || request.headers.get('X-User-Id');
  if (!userId) return jsonResponse({ allowed: true, watermark: true, remaining: 1, guest: true });
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!user) return jsonResponse({ allowed: false, remaining: 0, code: 'USER_NOT_FOUND', guest: false, requiresPurchase: true });
  return jsonResponse({
    allowed: user.credits > 0, watermark: false, remaining: user.credits,
    code: user.credits <= 0 ? 'NO_CREDITS' : null, guest: false, plan: 'credits',
    user: { id: user.id, email: user.email, name: user.name }
  });
}

async function handleUserRegister(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');
  const { id, email, name, avatar, provider } = await request.json();
  if (!id || !email) return jsonResponse({ error: 'Missing required fields' }, 400);

  const existing = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  if (existing) {
    await env.DB.prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, isNewUser: false, user: { id: existing.id, email: existing.email, name: existing.name, avatar: existing.avatar, credits: existing.credits } });
  }

  await env.DB.prepare(
    'INSERT INTO users (id, email, name, avatar, provider, credits) VALUES (?, ?, ?, ?, ?, 3)'
  ).bind(id, email, name || '', avatar || '', provider || 'google').run();

  console.log(`New user registered: ${email} with 3 FREE credits`);
  return jsonResponse({ success: true, isNewUser: true, user: { id, email, name: name || '', avatar: avatar || '', credits: 3 } });
}

async function handleUserRegisterLegacy(request, env) {
  if (request.method === 'OPTIONS') return optionsResponse('POST, OPTIONS');
  const { id, email, name, avatar, provider } = await request.json();
  if (!id) return jsonResponse({ success: false, error: 'User ID required' }, 400);

  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (existing) {
    await env.DB.prepare('UPDATE users SET email = ?, name = ?, avatar = ?, updated_at = datetime(\'now\', \'utc\') WHERE id = ?')
      .bind(email || null, name || null, avatar || null, id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, avatar, credits, total_purchased, total_used, created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))`
    ).bind(id, email || null, name || null, avatar || null).run();
  }
  return jsonResponse({ success: true });
}
