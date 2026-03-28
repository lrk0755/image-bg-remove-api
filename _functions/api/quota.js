// User Quota API
export async function onRequestGet(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (context.request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from query param or header
    const url = new URL(context.request.url);
    const userId = url.searchParams.get('userId') || context.request.headers.get('X-User-Id');
    
    if (!userId) {
      // Anonymous guest - check via IP
      const ip = context.request.headers.get('CF-Connecting-IP') || 'unknown';
      
      // For guests, return trial info (stored in a simple way)
      const trialKey = `guest_trial_${ip}`;
      const trialCount = await context.env.KV?.get(trialKey) || '0';
      const remaining = Math.max(0, 1 - parseInt(trialCount));
      
      return new Response(JSON.stringify({
        allowed: remaining > 0,
        watermark: true,
        remaining,
        code: remaining <= 0 ? 'TRIAL_EXCEEDED' : null,
        message: remaining > 0 
          ? `Guest trial: ${remaining} free use${remaining !== 1 ? 's' : ''} left`
          : 'Guest trial exhausted. Sign up for FREE credits!',
        requiresSignup: true,
        requiresPurchase: false,
        guest: true,
        plan: 'guest'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Get user from D1
    const user = await context.env.DB.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).bind(userId).first();
    
    if (!user) {
      return new Response(JSON.stringify({
        allowed: false,
        watermark: false,
        remaining: 0,
        code: 'USER_NOT_FOUND',
        requiresSignup: false,
        requiresPurchase: true,
        guest: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    const credits = user.credits || 0;
    
    return new Response(JSON.stringify({
      allowed: credits > 0,
      watermark: false,
      remaining: credits,
      code: credits <= 0 ? 'NO_CREDITS' : null,
      message: credits > 0 
        ? `${credits} credit${credits !== 1 ? 's' : ''} remaining`
        : 'No credits left. Buy more credits!',
      requiresSignup: false,
      requiresPurchase: credits <= 0,
      guest: false,
      plan: 'credits',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Quota error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
