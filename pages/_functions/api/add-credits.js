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
    const { userId, credits, orderId, packId } = await context.request.json();
    
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

    // In a real app, you would verify the PayPal payment here
    // For now, we trust the capture result and add credits
    
    // Credit packs mapping
    const creditPacks = {
      starter: 10,
      popular: 30,
      power: 100
    };
    
    // Get the users store from KV or in-memory
    // For demo, we'll use a simple approach
    const users = await context.env.USERS ? await context.env.USERS.get('users') : null;
    let usersData = users ? JSON.parse(users) : {};
    
    if (!usersData[userId]) {
      usersData[userId] = {
        id: userId,
        credits: 0,
        totalPurchased: 0,
        totalUsed: 0,
        createdAt: new Date().toISOString()
      };
    }
    
    // Add credits
    const creditsToAdd = creditPacks[packId] || parseInt(credits);
    usersData[userId].credits += creditsToAdd;
    usersData[userId].totalPurchased += creditsToAdd;
    usersData[userId].lastPurchase = {
      orderId,
      packId,
      credits: creditsToAdd,
      at: new Date().toISOString()
    };
    
    // Save back
    if (context.env.USERS) {
      await context.env.USERS.put('users', JSON.stringify(usersData));
    }
    
    console.log(`Added ${creditsToAdd} credits to user ${userId}. Total: ${usersData[userId].credits}`);
    
    return new Response(JSON.stringify({
      success: true,
      creditsAdded: creditsToAdd,
      totalCredits: usersData[userId].credits,
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
