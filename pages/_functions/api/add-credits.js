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
        error: 'User not logged in. Please sign in to receive credits.' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    if (!credits || !orderId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Missing required fields' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Credit packs mapping
    const creditPacks = {
      starter: { credits: 10, price: 3.00 },
      popular: { credits: 30, price: 6.00 },
      power: { credits: 100, price: 15.00 }
    };
    
    const packInfo = creditPacks[packId] || { credits: parseInt(credits), price: 0 };
    const creditsToAdd = packInfo.credits;
    const paymentAmount = packInfo.price;
    
    // Check if order already processed (idempotency)
    const existingPayment = await context.env.DB.prepare(
      'SELECT * FROM payments WHERE order_id = ?'
    ).bind(orderId).first();
    
    if (existingPayment) {
      return new Response(JSON.stringify({
        success: true,
        creditsAdded: 0,
        message: 'Payment already processed'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get user
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(userId).first();
    
    if (!user) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'User not found. Please sign in first.' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Insert payment record
    await context.env.DB.prepare(
      'INSERT INTO payments (user_id, order_id, pack_id, credits, amount) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, orderId, packId, creditsToAdd, paymentAmount).run();
    
    // Update user credits
    await context.env.DB.prepare(
      'UPDATE users SET credits = credits + ?, total_purchased = total_purchased + ? WHERE id = ?'
    ).bind(creditsToAdd, creditsToAdd, userId).run();
    
    // Get updated user
    const updatedUser = await context.env.DB.prepare(
      'SELECT credits FROM users WHERE id = ?'
    ).bind(userId).first();
    
    console.log(`Added ${creditsToAdd} credits to user ${userId}. Total: ${updatedUser.credits}`);
    
    return new Response(JSON.stringify({
      success: true,
      creditsAdded: creditsToAdd,
      totalCredits: updatedUser.credits,
      message: `${creditsToAdd} credits added successfully!`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Add credits error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
