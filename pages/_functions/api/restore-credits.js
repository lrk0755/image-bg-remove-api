// Restore Credits API - For cases where PayPal captured payment but credits weren't added
// Allows manual credit restoration by order ID
export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { orderId, userId } = await context.request.json();

    if (!orderId || !userId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'orderId and userId are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if payment already exists
    const existingPayment = await context.env.DB.prepare(
      'SELECT * FROM payments WHERE order_id = ?'
    ).bind(orderId).first();

    if (existingPayment) {
      // Already processed — return current balance
      const user = await context.env.DB.prepare(
        'SELECT credits FROM users WHERE id = ?'
      ).bind(userId).first();

      return new Response(JSON.stringify({
        success: true,
        alreadyProcessed: true,
        creditsAdded: existingPayment.credits,
        currentBalance: user?.credits || 0,
        message: 'Payment was already processed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Payment not in our DB — verify with PayPal API
    // Get PayPal access token
    const clientId = context.env.PAYPAL_CLIENT_ID;
    const clientSecret = context.env.PAYPAL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({
        success: false,
        error: 'PayPal not configured'
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenResp = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenResp.ok) {
      throw new Error('Failed to get PayPal access token');
    }

    const tokenData = await tokenResp.json();
    const accessToken = tokenData.access_token;

    // Get order details from PayPal
    const orderResp = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!orderResp.ok) {
      const errText = await orderResp.text();
      console.error('PayPal order lookup failed:', errText);
      throw new Error('Could not verify payment with PayPal');
    }

    const orderData = await orderResp.json();
    const purchaseUnit = orderData.purchase_units?.[0];
    const paymentStatus = orderData.status;
    const customData = purchaseUnit?.custom_id ? JSON.parse(purchaseUnit.custom_id) : null;
    const amount = purchaseUnit?.amount?.value;

    if (paymentStatus !== 'COMPLETED' && paymentStatus !== 'CAPTURED') {
      return new Response(JSON.stringify({
        success: false,
        error: `Payment not completed. Status: ${paymentStatus}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Determine credits from packId or amount
    const creditPacks = {
      starter: { credits: 10, price: 3.00 },
      popular: { credits: 30, price: 6.00 },
      power:   { credits: 100, price: 15.00 }
    };

    const packId = customData?.packId || 'unknown';
    const creditsToAdd = (creditPacks[packId]?.credits) || parseInt(customData?.credits) || Math.round(parseFloat(amount || 0) * 10);

    // Ensure user exists
    const existingRestoreUser = await context.env.DB.prepare(
      'SELECT id FROM users WHERE id = ?'
    ).bind(userId).first();
    
    if (!existingRestoreUser) {
      const syntheticEmail = `user_${userId}@placeholder.local`;
      await context.env.DB.prepare(
        `INSERT INTO users (id, email, credits, total_purchased, total_used, created_at, updated_at)
         VALUES (?, ?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))`
      ).bind(userId, syntheticEmail).run();
    }

    // Insert payment and update credits
    await context.env.DB.prepare(
      'INSERT INTO payments (user_id, order_id, pack_id, credits, amount, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, orderId, packId, creditsToAdd, parseFloat(amount || 0), 'completed').run();

    await context.env.DB.prepare(
      'UPDATE users SET credits = credits + ?, total_purchased = total_purchased + ? WHERE id = ?'
    ).bind(creditsToAdd, creditsToAdd, userId).run();

    const updatedUser = await context.env.DB.prepare(
      'SELECT credits FROM users WHERE id = ?'
    ).bind(userId).first();

    console.log(`[restore-credits] SUCCESS: Restored ${creditsToAdd} credits for order ${orderId}. User: ${userId}. New balance: ${updatedUser?.credits}`);

    return new Response(JSON.stringify({
      success: true,
      creditsAdded: creditsToAdd,
      currentBalance: updatedUser?.credits || creditsToAdd,
      message: `${creditsToAdd} credits have been restored!`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[restore-credits] ERROR:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
