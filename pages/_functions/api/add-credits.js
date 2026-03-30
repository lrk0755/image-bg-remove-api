// Add Credits API - Called after successful PayPal payment
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
    const { userId, credits, orderId, packId, amount } = await context.request.json();
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'USER_ID_MISSING',
        message: 'User not logged in. Please sign in to receive credits.' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!credits || !orderId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'MISSING_FIELDS',
        message: 'Missing required fields: credits or orderId' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Credit packs mapping - derive credits from packId or use frontend value
    const creditPacks = {
      starter: { credits: 10, price: 3.00 },
      popular: { credits: 30, price: 6.00 },
      power:   { credits: 100, price: 15.00 }
    };
    
    // Resolve credits: prefer packId lookup, fallback to frontend value
    const creditsToAdd = (packId && creditPacks[packId])
      ? creditPacks[packId].credits
      : parseInt(credits, 10);
    const paymentAmount = (packId && creditPacks[packId])
      ? creditPacks[packId].price
      : parseFloat(amount || 0);

    // Idempotency: check if already processed
    const existingPayment = await context.env.DB.prepare(
      'SELECT * FROM payments WHERE order_id = ?'
    ).bind(orderId).first();
    
    if (existingPayment) {
      return new Response(JSON.stringify({
        success: true,
        creditsAdded: 0,
        message: 'Payment already processed',
        totalCredits: creditsToAdd
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure user exists (upsert) - prevents failures if user never hit quota endpoint
    await context.env.DB.prepare(
      `INSERT INTO users (id, credits, total_purchased, total_used, created_at, updated_at)
       VALUES (?, 0, 0, 0, datetime('now', 'utc'), datetime('now', 'utc'))
       ON CONFLICT(id) DO NOTHING`
    ).bind(userId).run();
    
    // Insert payment record
    await context.env.DB.prepare(
      'INSERT INTO payments (user_id, order_id, pack_id, credits, amount, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(userId, orderId, packId || 'unknown', creditsToAdd, paymentAmount, 'completed').run();
    
    // Update user credits
    await context.env.DB.prepare(
      'UPDATE users SET credits = credits + ?, total_purchased = total_purchased + ? WHERE id = ?'
    ).bind(creditsToAdd, creditsToAdd, userId).run();
    
    // Get updated balance
    const updatedUser = await context.env.DB.prepare(
      'SELECT credits FROM users WHERE id = ?'
    ).bind(userId).first();
    
    console.log(`[add-credits] SUCCESS: Added ${creditsToAdd} credits to user ${userId}. Order: ${orderId}. New balance: ${updatedUser?.credits}`);

    return new Response(JSON.stringify({
      success: true,
      creditsAdded: creditsToAdd,
      totalCredits: updatedUser?.credits || creditsToAdd,
      message: `${creditsToAdd} credits added successfully!`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[add-credits] ERROR:', error.message, error.stack);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'INTERNAL_ERROR',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
